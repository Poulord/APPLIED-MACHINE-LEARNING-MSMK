const els = {
  fileA: document.getElementById('fileA'),
  fileB: document.getElementById('fileB'),
  fileNameA: document.getElementById('fileNameA'),
  fileNameB: document.getElementById('fileNameB'),
  resolutionA: document.getElementById('resolutionA'),
  resolutionB: document.getElementById('resolutionB'),
  uploadZoneA: document.getElementById('uploadZoneA'),
  uploadZoneB: document.getElementById('uploadZoneB'),
  canvasA: document.getElementById('canvasA'),
  canvasB: document.getElementById('canvasB'),
  canvasOut: document.getElementById('canvasOut'),
  status: document.getElementById('status'),
  op: document.getElementById('op'),
  run: document.getElementById('run'),
  runLabel: document.querySelector('#run [data-role="label"]'),
  clear: document.getElementById('clear'),
  autoResize: document.getElementById('autoResize'),
  blendControls: document.getElementById('blendControls'),
  alpha: document.getElementById('alpha'),
  filterExplanation: document.getElementById('filterExplanation'),
  operationCard: document.getElementById('operationCard'),
  operationIcon: document.getElementById('operationIcon'),
  compareToggle: document.getElementById('compareToggle'),
  comparisonGrid: document.getElementById('comparisonGrid'),
  compareA: document.getElementById('compareA'),
  compareB: document.getElementById('compareB'),
  download: document.getElementById('download'),
  resultCard: document.getElementById('resultCard'),
};

function setStatus(msg) {
  els.status.textContent = msg;
}

function loadImageToCanvas(file, canvas) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file'));
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      cleanup();
      resolve();
    };
    img.onerror = (err) => {
      cleanup();
      reject(err);
    };
    img.src = objectUrl;
  });
}

function updateUploadMeta(canvas, file, nameEl, resEl, zoneEl) {
  if (file) {
    nameEl.textContent = file.name;
  } else {
    nameEl.textContent = 'Sin archivo';
  }
  if (canvas.width && canvas.height) {
    resEl.textContent = `${canvas.width}×${canvas.height}`;
    zoneEl.classList.add('has-image');
  } else {
    resEl.textContent = '0×0';
    zoneEl.classList.remove('has-image');
  }
}

function updateComparisonImages() {
  if (els.canvasA.width) {
    els.compareA.src = els.canvasA.toDataURL('image/png');
  } else {
    els.compareA.removeAttribute('src');
  }

  if (els.canvasB.width) {
    els.compareB.src = els.canvasB.toDataURL('image/png');
  } else {
    els.compareB.removeAttribute('src');
  }
}

function updateDownloadState() {
  const hasResult = els.canvasOut.width > 0 && els.canvasOut.height > 0;
  els.download.disabled = !hasResult;
}

function setRunState(state) {
  els.run.classList.remove('is-processing', 'is-ready');
  if (state === 'processing') {
    els.run.classList.add('is-processing');
    els.runLabel.textContent = 'Procesando...';
  } else if (state === 'ready') {
    els.run.classList.add('is-ready');
    els.runLabel.textContent = 'Listo ✓';
  } else {
    els.runLabel.textContent = 'Aplicar operación';
  }
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

let cvReady = false;

function setCvReadyState(ready) {
  cvReady = ready;
  els.run.disabled = !ready;
  els.op.disabled = !ready;
  els.alpha.disabled = !ready;
  els.compareToggle.disabled = !ready;
}

async function applyOperation() {
  const op = els.op.value;
  if (!cvReady) {
    setStatus('OpenCV.js aún está cargando. Espera un momento.');
    return;
  }
  if (els.canvasA.width === 0) {
    setStatus('Carga la imagen A antes de aplicar la operación.');
    return;
  }
  const needsB = op !== 'notA';
  if (needsB && els.canvasB.width === 0) {
    setStatus('Carga la imagen B antes de aplicar la operación.');
    return;
  }

  setRunState('processing');
  await new Promise(requestAnimationFrame);
  let A = null;
  let B = null;
  let Bout = null;
  let dst = null;
  let display = null;
  let Aprep = null;
  let Bprep = null;
  let Btmp = null;
  let A2 = null;
  let B2 = null;

  try {
    A = cv.imread(els.canvasA);
    A2 = A;
    B2 = null;
    if (needsB) {
      B = cv.imread(els.canvasB);
      const resizedResult = ensureSameSize(A, B);
      A2 = resizedResult.A;
      B2 = resizedResult.B;
      if (resizedResult.resized) {
        Bout = B2;
      }
    }

    const prepareForOps = (mat) => {
      const channels = mat.channels();
      if (channels === 4) {
        const converted = new cv.Mat();
        cv.cvtColor(mat, converted, cv.COLOR_RGBA2RGB);
        return converted;
      }
      if (channels === 1) {
        const converted = new cv.Mat();
        cv.cvtColor(mat, converted, cv.COLOR_GRAY2RGB);
        return converted;
      }
      return mat;
    };

    Aprep = prepareForOps(A2);
    if (needsB) {
      Bprep = prepareForOps(B2);
      if (Aprep.type() !== Bprep.type()) {
        Btmp = new cv.Mat();
        Bprep.convertTo(Btmp, Aprep.type());
        Bprep = Btmp;
      }
    }

    dst = new cv.Mat();

    if (op === 'add') {
      cv.add(Aprep, Bprep, dst);
    } else if (op === 'subtract') {
      cv.subtract(Aprep, Bprep, dst);
    } else if (op === 'absdiff') {
      cv.absdiff(Aprep, Bprep, dst);
    } else if (op === 'and') {
      cv.bitwise_and(Aprep, Bprep, dst);
    } else if (op === 'or') {
      cv.bitwise_or(Aprep, Bprep, dst);
    } else if (op === 'xor') {
      cv.bitwise_xor(Aprep, Bprep, dst);
    } else if (op === 'notA') {
      cv.bitwise_not(Aprep, dst);
    } else if (op === 'blend') {
      const a = parseFloat(els.alpha.value);
      const b = 1.0 - a;
      const gamma = 0.0;
      cv.addWeighted(Aprep, a, Bprep, b, gamma, dst);
    } else {
      throw new Error('Operación no soportada');
    }

    if (dst.channels() === 3) {
      display = new cv.Mat();
      cv.cvtColor(dst, display, cv.COLOR_RGB2RGBA);
      cv.imshow(els.canvasOut, display);
    } else if (dst.channels() === 1) {
      display = new cv.Mat();
      cv.cvtColor(dst, display, cv.COLOR_GRAY2RGBA);
      cv.imshow(els.canvasOut, display);
    } else {
      cv.imshow(els.canvasOut, dst);
    }
    setStatus(`OK: operación "${op}" aplicada.`);
    updateDownloadState();
    updateComparisonImages();
    els.resultCard.classList.remove('result-ready');
    requestAnimationFrame(() => els.resultCard.classList.add('result-ready'));
    setRunState('ready');
    setTimeout(() => setRunState('idle'), 1500);
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + (err && err.message ? err.message : String(err)));
    setRunState('idle');
  } finally {
    if (A) A.delete();
    if (B) B.delete();
    if (Bout) Bout.delete();
    if (dst) dst.delete();
    if (display) display.delete();
    if (Btmp) Btmp.delete();
    if (Aprep && Aprep !== A2) Aprep.delete();
    if (Bprep && Bprep !== B2) Bprep.delete();
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
  updateUploadMeta(els.canvasA, null, els.fileNameA, els.resolutionA, els.uploadZoneA);
  updateUploadMeta(els.canvasB, null, els.fileNameB, els.resolutionB, els.uploadZoneB);
  updateComparisonImages();
  updateDownloadState();
  els.resultCard.classList.remove('result-ready');
  setStatus('Listo. Carga imágenes para empezar.');
}

const filterDetails = {
  add: {
    title: 'Add (A + B)',
    icon: '➕',
    category: 'arithmetic',
    description:
      'Suma los valores de los píxeles de ambas imágenes. Se usa para aumentar brillo ' +
      'o combinar imágenes claras. Los valores se saturan en 255.',
  },
  subtract: {
    title: 'Subtract (A - B)',
    icon: '➖',
    category: 'arithmetic',
    description:
      'Resta los píxeles de la imagen B a la imagen A. Se utiliza para resaltar ' +
      'diferencias o eliminar fondos.',
  },
  absdiff: {
    title: 'AbsDiff |A - B|',
    icon: '📏',
    category: 'arithmetic',
    description:
      'Calcula la diferencia absoluta entre imágenes. Es muy usado en detección ' +
      'de movimiento y comparación de frames.',
  },
  and: {
    title: 'Bitwise AND',
    icon: '🎭',
    category: 'bitwise',
    description:
      'Aplica una máscara lógica, mostrando solo las zonas donde ambas imágenes ' +
      'tienen información. Muy usado para recortar objetos.',
  },
  or: {
    title: 'Bitwise OR',
    icon: '🧩',
    category: 'bitwise',
    description:
      'Combina las regiones visibles de ambas imágenes. Se utiliza para unir ' +
      'formas o capas binarias.',
  },
  xor: {
    title: 'Bitwise XOR',
    icon: '⚡',
    category: 'bitwise',
    description:
      'Muestra únicamente las diferencias entre imágenes. Útil para detectar ' +
      'cambios y depuración visual.',
  },
  notA: {
    title: 'Bitwise NOT',
    icon: '🔄',
    category: 'bitwise',
    description:
      'Invierte los colores de la imagen. Se usa para crear negativos ' +
      'o preparar máscaras.',
  },
  blend: {
    title: 'Blend (addWeighted)',
    icon: '🎚️',
    category: 'blend',
    description:
      'Mezcla dos imágenes usando pesos (alpha y beta). Se utiliza para ' +
      'transiciones suaves, superposiciones y efectos visuales.',
  },
};

function updateFilterExplanation() {
  const detail = filterDetails[els.op.value];
  if (!detail || !els.filterExplanation) return;
  els.filterExplanation.innerHTML = `<strong>${detail.title}</strong><br>${detail.description}`;
  els.operationCard.dataset.category = detail.category;
  els.operationIcon.textContent = detail.icon;
}

els.op.addEventListener('change', () => {
  els.blendControls.style.display = els.op.value === 'blend' ? 'block' : 'none';
  updateFilterExplanation();
});

async function handleImageFile(file, canvas, nameEl, resEl, zoneEl, label) {
  if (!file) return;
  await loadImageToCanvas(file, canvas);
  updateUploadMeta(canvas, file, nameEl, resEl, zoneEl);
  updateComparisonImages();
  updateDownloadState();
  setStatus(`Imagen ${label} cargada.`);
}

function setupDropZone(zoneEl, inputEl, canvas, nameEl, resEl, label) {
  zoneEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    zoneEl.classList.add('drag-over');
  });

  zoneEl.addEventListener('dragleave', () => {
    zoneEl.classList.remove('drag-over');
  });

  zoneEl.addEventListener('drop', async (event) => {
    event.preventDefault();
    zoneEl.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputEl.files = transfer.files;
    await handleImageFile(file, canvas, nameEl, resEl, zoneEl, label);
  });
}

els.fileA.addEventListener('change', async () => {
  if (!els.fileA.files?.[0]) return;
  await handleImageFile(els.fileA.files[0], els.canvasA, els.fileNameA, els.resolutionA, els.uploadZoneA, 'A');
});

els.fileB.addEventListener('change', async () => {
  if (!els.fileB.files?.[0]) return;
  await handleImageFile(els.fileB.files[0], els.canvasB, els.fileNameB, els.resolutionB, els.uploadZoneB, 'B');
});

els.run.addEventListener('click', applyOperation);
els.clear.addEventListener('click', clearAll);

els.compareToggle.addEventListener('change', () => {
  els.comparisonGrid.classList.toggle('is-visible', els.compareToggle.checked);
});

els.download.addEventListener('click', () => {
  if (!els.canvasOut.width) return;
  const link = document.createElement('a');
  link.download = 'resultado-opencv.png';
  link.href = els.canvasOut.toDataURL('image/png');
  link.click();
});

setCvReadyState(false);
setStatus('Cargando OpenCV.js...');

function markCvReady() {
  if (cvReady) return;
  setCvReadyState(true);
  setStatus('OpenCV.js listo. Carga 2 imágenes y aplica una operación.');
}

const cvReadyCheck = setInterval(() => {
  if (typeof cv === 'undefined') return;

  cv.onRuntimeInitialized = () => {
    markCvReady();
    clearInterval(cvReadyCheck);
  };

  if (cv && cv.Mat) {
    markCvReady();
    clearInterval(cvReadyCheck);
  }
}, 50);

updateFilterExplanation();
setupDropZone(els.uploadZoneA, els.fileA, els.canvasA, els.fileNameA, els.resolutionA, 'A');
setupDropZone(els.uploadZoneB, els.fileB, els.canvasB, els.fileNameB, els.resolutionB, 'B');
updateDownloadState();
