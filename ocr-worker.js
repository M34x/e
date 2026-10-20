let recognizer;

self.onmessage = async ({ data }) => {
  const { id, image } = data || {};
  if (!Number.isInteger(id) || typeof image !== 'string') return;
  try {
    if (!recognizer) {
      self.postMessage({ type: 'progress', id, message: 'Loading the handwriting model (~70 MB on first use)…' });
      const { pipeline, RawImage, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.useBrowserCache = true;
      recognizer = await pipeline('image-to-text', 'Xenova/trocr-small-handwritten', {
        dtype: 'q8',
        progress_callback: (progress) => {
          if (progress?.status === 'progress') {
            self.postMessage({ type: 'progress', id, message: `Downloading local model: ${Math.round(progress.progress || 0)}%` });
          }
        }
      });
      self.RawImage = RawImage;
    }
    self.postMessage({ type: 'progress', id, message: 'Reading selected handwriting locally…' });
    const raw = await fetch(image);
    if (!raw.ok) throw new Error('Could not read the selected ink image.');
    const blob = await raw.blob();
    const result = await recognizer(await self.RawImage.fromBlob(blob));
    self.postMessage({ id, text: result?.[0]?.generated_text || '' });
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'The local handwriting model failed.' });
  }
};
