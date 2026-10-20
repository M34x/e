(function (global) {
  'use strict';
  const functions = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs, log: Math.log, ln: Math.log, exp: Math.exp,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sinh: Math.sinh,
    cosh: Math.cosh, tanh: Math.tanh
  };
  const constants = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

  function compile(source) {
    const input = String(source).trim().replace(/π/g, 'pi').replace(/√/g, 'sqrt');
    if (!input || input.length > 120) throw new Error('Enter an expression up to 120 characters.');
    if (!/^[\w\s.+\-*/^(),%]*$/.test(input)) throw new Error('Use numbers, x, operators, and math functions only.');
    const functionNames=Object.keys(functions).sort((a,b)=>b.length-a.length);
    const normalizedInput=input.replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|log|ln|exp|floor|ceil|round|sign|sinh|cosh|tanh)\s*\(/g,'Math.$1(').replace(/\bpi\b/g,'Math.PI').replace(/\btau\b/g,'(Math.PI*2)').replace(/\be\b/g,'Math.E').replace(/(\d)(Math\.PI|Math\.E)/g,'$1*$2').replace(/\^/g,'**').replace(/%/g,'/100').replace(/(\d)(x|Math\.PI|Math\.E|Math\.)/g,'$1*$2').replace(/(\d)(pi|tau|e)\b/g,(_,digit,name)=>`${digit}*${name==='pi'?'Math.PI':name==='tau'?'Math.PI*2':'Math.E'}`).replace(/\)(x|Math\.PI|Math\.E)/g,')*$1').replace(/(x|Math\.(?:PI|E))\(/g,'$1*(').replace(/\)(\d|Math\.(?:PI|E))/g,')*$1').replace(/(\d)\(/g,'$1*(');
    const identifiers=input.match(/[a-zA-Z_]\w*/g)||[];
    for(const identifier of identifiers)if(!Object.hasOwn(functions,identifier)&&!Object.hasOwn(constants,identifier)&&identifier!=='x')throw new Error(`Unsupported name: ${identifier}`);
    const callNames=input.match(/([a-zA-Z_]\w*)\s*\(/g)||[];
    for(const call of callNames){const name=call.match(/[a-zA-Z_]\w*/)[0];const trailing=call.slice(name.length).trimStart().startsWith('(');if(trailing&&name!=='x'&&!Object.hasOwn(functions,name))throw new Error(`Unsupported function: ${name}`);}
    let evaluator;
    try { evaluator = new Function('x', `"use strict"; return (${normalizedInput});`); }
    catch { throw new Error('That expression is not valid. Check its operators and parentheses.'); }
    return x => {
      try {
        const result = evaluator(x);
        return typeof result === 'number' && Number.isFinite(result) && Math.abs(result) < 1e10 ? result : NaN;
      } catch { return NaN; }
    };
  }

  function plot(canvas, source, pointsOverride) {
    const evaluate = compile(source);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(220, Math.round(rect.height));
    const scale = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    const xSpan = 10;
    const ySpan = 7;
    const xPixel = x => (x + xSpan) / (xSpan * 2) * width;
    const yPixel = y => height / 2 - y / ySpan * (height / 2 - 16);
    context.strokeStyle = '#eef0eb';
    context.lineWidth = 1;
    for (let x = -10; x <= 10; x += 1) {
      const px = xPixel(x);
      context.beginPath(); context.moveTo(px, 0); context.lineTo(px, height); context.stroke();
    }
    const yStep = ySpan <= 5 ? 1 : 2;
    for (let y = -ySpan; y <= ySpan; y += yStep) {
      const py = yPixel(y);
      context.beginPath(); context.moveTo(0, py); context.lineTo(width, py); context.stroke();
    }
    context.strokeStyle = '#9da79b';
    context.lineWidth = 1.2;
    context.beginPath(); context.moveTo(0, yPixel(0)); context.lineTo(width, yPixel(0)); context.stroke();
    context.beginPath(); context.moveTo(xPixel(0), 0); context.lineTo(xPixel(0), height); context.stroke();
    context.fillStyle = '#8b9187'; context.font = '10px monospace';
    for (let x = -10; x <= 10; x += 2) if (x) context.fillText(String(x), xPixel(x) - 4, yPixel(0) + 14);
    for (let y = -6; y <= 6; y += 2) if (y) context.fillText(String(y), xPixel(0) + 5, yPixel(y) + 3);
    context.strokeStyle = '#477a55'; context.lineWidth = 2.2; context.lineCap = 'round'; context.lineJoin = 'round'; context.beginPath();
    let drawing = false;
    const points = Array.isArray(pointsOverride) ? pointsOverride : null;
    const samples = points ? points.length - 1 : Math.ceil(width * 1.5);
    for (let index = 0; index <= samples; index += 1) {
      const x = points ? points[index].x : -xSpan + (index / samples) * 2 * xSpan;
      const y = points ? points[index].y : evaluate(x);
      if (!Number.isFinite(y) || Math.abs(y) > ySpan * 1.5) { drawing = false; continue; }
      const px = xPixel(x), py = yPixel(y);
      if (drawing) context.lineTo(px, py); else { context.moveTo(px, py); drawing = true; }
    }
    context.stroke();
    return evaluate;
  }

  global.MarginMath = { compile, plot };
})(window);
