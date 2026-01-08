const els = {
  fileA: document.getElementById('fileA'),
  fileB: document.getElementById('fileB'),
  canvasA: document.getElementById('canvasA'),
  canvasB: document.getElementById('canvasB'),
  canvasOut: document.getElementById('canvasOut'),
  status: document.getElementById('status'),
  op: document.getElementById('op'),
  run: document.getElementById('run'),
  clear: document.getElementById('clear'),
  autoResize: document.getElementById('autoResize'),
  blendControls: document.getElementById('blendControls'),
  alpha: document.getElementById('alpha'),
  filterExplanation: document.getElementById('filterExplanation'),
};

function setStatus(msg) {
  els.status.textContent = msg;
}

function loadImageToCanvas(file, canvas) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function ensureSameSize(matA, matB) {
  if (matA.rows === matB.rows && matA.cols === matB.cols) {
    return { A: matA, B: matB, resized: false };
  }

  if (!els.autoResize.checked) {
    throw new Error(
      `Tamaños distintos: A=${matA.cols}x${matA.rows}, B=${matB.cols}x${matB.rows}. ` +
        'Activa auto-resize o usa imágenes iguales.'
    );
  }

  const b2 = new cv.Mat();
  const dsize = new cv.Size(matA.cols, matA.rows);
  cv.resize(matB, b2, dsize, 0, 0, cv.INTER_AREA);
  return { A: matA, B: b2, resized: true };
}

function applyOperation() {
  if (els.canvasA.width === 0 || els.canvasB.width === 0) {
    setStatus('Carga ambas imágenes (A y B) antes de aplicar.');
    return;
  }

  let A = null;
  let B = null;
  let Bout = null;
  let dst = null;
  let mask = null;

  try {
    A = cv.imread(els.canvasA);
    B = cv.imread(els.canvasB);

    const { A: A2, B: B2, resized } = ensureSameSize(A, B);
    if (resized) {
      Bout = B2;
    }

    dst = new cv.Mat();
    mask = new cv.Mat();
    const dtype = -1;

    const op = els.op.value;
    if (op === 'add') {
      cv.add(A2, B2, dst, mask, dtype);
    } else if (op === 'subtract') {
      cv.subtract(A2, B2, dst, mask, dtype);
    } else if (op === 'absdiff') {
      cv.absdiff(A2, B2, dst);
    } else if (op === 'and') {
      cv.bitwise_and(A2, B2, dst, mask);
    } else if (op === 'or') {
      cv.bitwise_or(A2, B2, dst, mask);
    } else if (op === 'xor') {
      cv.bitwise_xor(A2, B2, dst, mask);
    } else if (op === 'notA') {
      cv.bitwise_not(A2, dst);
    } else if (op === 'blend') {
      const a = parseFloat(els.alpha.value);
      const b = 1.0 - a;
      const gamma = 0.0;
      cv.addWeighted(A2, a, B2, b, gamma, dst);
    } else {
      throw new Error('Operación no soportada');
    }

    cv.imshow(els.canvasOut, dst);
    setStatus(`OK: operación "${op}" aplicada.`);
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + (err && err.message ? err.message : String(err)));
  } finally {
    if (A) A.delete();
    if (B) B.delete();
    if (Bout) Bout.delete();
    if (dst) dst.delete();
    if (mask) mask.delete();
  }
}

function clearAll() {
  for (const c of [els.canvasA, els.canvasB, els.canvasOut]) {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    c.width = 0;
    c.height = 0;
  }
  els.fileA.value = '';
  els.fileB.value = '';
  setStatus('Listo. Carga imágenes para empezar.');
}

const filterDetails = {
  add: {
    title: '➕ Add (A + B)',
    description:
      'Suma los valores de los píxeles de ambas imágenes. Se usa para aumentar brillo ' +
      'o combinar imágenes claras. Los valores se saturan en 255.',
  },
  subtract: {
    title: '➖ Subtract (A - B)',
    description:
      'Resta los píxeles de la imagen B a la imagen A. Se utiliza para resaltar ' +
      'diferencias o eliminar fondos.',
  },
  absdiff: {
    title: '📏 AbsDiff |A - B|',
    description:
      'Calcula la diferencia absoluta entre imágenes. Es muy usado en detección ' +
      'de movimiento y comparación de frames.',
  },
  and: {
    title: '🎭 Bitwise AND',
    description:
      'Aplica una máscara lógica, mostrando solo las zonas donde ambas imágenes ' +
      'tienen información. Muy usado para recortar objetos.',
  },
  or: {
    title: '🧩 Bitwise OR',
    description:
      'Combina las regiones visibles de ambas imágenes. Se utiliza para unir ' +
      'formas o capas binarias.',
  },
  xor: {
    title: '⚡ Bitwise XOR',
    description:
      'Muestra únicamente las diferencias entre imágenes. Útil para detectar ' +
      'cambios y depuración visual.',
  },
  notA: {
    title: '🔄 Bitwise NOT',
    description:
      'Invierte los colores de la imagen. Se usa para crear negativos ' +
      'o preparar máscaras.',
  },
  blend: {
    title: '🎚️ Blend (addWeighted)',
    description:
      'Mezcla dos imágenes usando pesos (alpha y beta). Se utiliza para ' +
      'transiciones suaves, superposiciones y efectos visuales.',
  },
};

function updateFilterExplanation() {
  const detail = filterDetails[els.op.value];
  if (!detail || !els.filterExplanation) return;
  els.filterExplanation.innerHTML = `<strong>${detail.title}</strong><br>${detail.description}`;
}

els.op.addEventListener('change', () => {
  els.blendControls.style.display = els.op.value === 'blend' ? 'block' : 'none';
  updateFilterExplanation();
});

els.fileA.addEventListener('change', async () => {
  if (!els.fileA.files?.[0]) return;
  await loadImageToCanvas(els.fileA.files[0], els.canvasA);
  setStatus('Imagen A cargada.');
});

els.fileB.addEventListener('change', async () => {
  if (!els.fileB.files?.[0]) return;
  await loadImageToCanvas(els.fileB.files[0], els.canvasB);
  setStatus('Imagen B cargada.');
});

els.run.addEventListener('click', applyOperation);
els.clear.addEventListener('click', clearAll);

function waitForCV() {
  if (typeof cv === 'undefined') return false;
  if (cv && cv.Mat) return true;
  return false;
}

const cvReadyCheck = setInterval(() => {
  if (!waitForCV()) return;

  if (cv.onRuntimeInitialized) {
    cv.onRuntimeInitialized = () => {
      clearInterval(cvReadyCheck);
      setStatus('OpenCV.js listo. Carga 2 imágenes y aplica una operación.');
    };
  } else {
    clearInterval(cvReadyCheck);
    setStatus('OpenCV.js listo. Carga 2 imágenes y aplica una operación.');
  }
}, 50);

updateFilterExplanation();
