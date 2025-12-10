const appState = {
  totalDetections: 0,
  detections: [],
  isCameraReady: false,
  isSending: false,
  cvReady: false,
  processing: false,
  videoEl: null,
  canvasEl: null,
  overlayCtx: null,
  detectionListEl: null,
  totalDetectionsEl: null,
  statusMessageEl: null,
  sendButtonEl: null,
  cameraStatusEl: null,
  cap: null,
  frameSkip: 0,
  lastDetectionCount: 0,
};

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  initAppState();
  setupEvents();

  try {
    updateStatus('Cargando OpenCV.js...');
    await waitForOpenCv();
    appState.cvReady = true;
    updateStatus('OpenCV listo. Solicitando cámara...');
    await initCamera();
    startProcessing();
  } catch (error) {
    console.error('Error al iniciar la aplicación:', error);
    alert('No pudimos inicializar la app. Revisa la consola para más detalles.');
    updateStatus('Error al iniciar la app.');
  }
}

function initAppState() {
  appState.videoEl = document.getElementById('video');
  appState.canvasEl = document.getElementById('canvas');
  appState.detectionListEl = document.getElementById('detectionList');
  appState.totalDetectionsEl = document.getElementById('totalDetections');
  appState.statusMessageEl = document.getElementById('statusMessage');
  appState.sendButtonEl = document.getElementById('sendButton');
  appState.cameraStatusEl = document.getElementById('cameraStatus');

  if (appState.canvasEl) {
    appState.overlayCtx = appState.canvasEl.getContext('2d');
  }
}

async function waitForOpenCv() {
  return new Promise((resolve, reject) => {
    const maxWaitMs = 15000;
    const start = Date.now();

    const check = () => {
      if (typeof cv !== 'undefined' && cv && cv.FS_createDataFile) {
        if (cv.getBuildInformation) {
          resolve();
          return;
        }
        cv.onRuntimeInitialized = () => resolve();
        return;
      }

      if (Date.now() - start > maxWaitMs) {
        reject(new Error('OpenCV.js no se cargó a tiempo.'));
        return;
      }

      requestAnimationFrame(check);
    };

    check();
  });
}

async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const message = 'Tu navegador no permite acceder a la cámara.';
    alert(message);
    console.error(message);
    updateStatus('No se puede acceder a la cámara.');
    return;
  }

  try {
    const constraints = { video: { facingMode: 'environment' } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    appState.stream = stream;
    appState.videoEl.srcObject = stream;

    await new Promise((resolve, reject) => {
      appState.videoEl.onloadedmetadata = () => {
        const width = appState.videoEl.videoWidth || 640;
        const height = appState.videoEl.videoHeight || 360;
        if (appState.canvasEl) {
          appState.canvasEl.width = width;
          appState.canvasEl.height = height;
        }
        appState.cap = new cv.VideoCapture(appState.videoEl);
        resolve();
      };
      appState.videoEl.onerror = reject;
    });

    await appState.videoEl.play();
    appState.isCameraReady = true;
    updateCameraStatus('Cámara lista');
    updateStatus('Cámara inicializada. Procesando con OpenCV...');
  } catch (error) {
    console.error('Error al iniciar la cámara:', error);
    alert('No pudimos activar tu cámara. Revisa los permisos e inténtalo nuevamente.');
    updateCameraStatus('Error al activar la cámara');
    updateStatus('No se pudo iniciar la cámara.');
    throw error;
  }
}

function setupEvents() {
  if (appState.sendButtonEl) {
    appState.sendButtonEl.addEventListener('click', () => {
      void sendLog();
    });
  }

  window.addEventListener('beforeunload', stopCameraStream);
}

function stopCameraStream() {
  if (appState.stream) {
    appState.stream.getTracks().forEach((track) => track.stop());
  }
}

function startProcessing() {
  if (!appState.cvReady || !appState.isCameraReady || appState.processing) return;
  appState.processing = true;
  requestAnimationFrame(processFrame);
}

function processFrame() {
  if (!appState.cap || !appState.canvasEl || !appState.videoEl) {
    requestAnimationFrame(processFrame);
    return;
  }

  // Asegura que el video tenga datos listos y dimensiones válidas
  if (
    appState.videoEl.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA ||
    !appState.videoEl.videoWidth ||
    !appState.videoEl.videoHeight
  ) {
    requestAnimationFrame(processFrame);
    return;
  }

  const videoWidth = appState.videoEl.videoWidth;
  const videoHeight = appState.videoEl.videoHeight;

  // Ajusta tamaño del canvas si cambia la orientación o resolución del video
  if (appState.canvasEl.width !== videoWidth || appState.canvasEl.height !== videoHeight) {
    appState.canvasEl.width = videoWidth;
    appState.canvasEl.height = videoHeight;
  }

  // Reduce la carga procesando 1 de cada 2 frames
  if (appState.frameSkip % 2 !== 0) {
    appState.frameSkip += 1;
    requestAnimationFrame(processFrame);
    return;
  }
  appState.frameSkip += 1;

// ...
  const width = videoWidth;
  const height = videoHeight;

  // Declaraciones (Aseguramos que existen para el bloque finally)
  const src = new cv.Mat(); // Corregido LÍNEA 187
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  let kernel = new cv.Mat(); // Lo definimos antes del try 
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    appState.cap.read(src);
    
    // **NUEVO: Check de seguridad por si la lectura falló**
    if (src.empty()) {
        throw new Error("Frame read failed or is empty.");
    }
    
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 60, 120, 3, false);

    kernel = cv.Mat.ones(3, 3, cv.CV_8U); // Asignación dentro del try
    cv.dilate(edges, dilated, kernel);

    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // ... el resto de tu lógica de contornos sigue aquí ...

    updateDetections(detections);
    
    // **NUEVO: Mueve el delete del kernel, contours y hierarchy AL FINALLY**
    // kernel.delete(); // <-- Quitar de aquí
    // contours.delete(); // <-- Quitar de aquí
    // hierarchy.delete(); // <-- Quitar de aquí
    
  } catch (error) {
    console.error('Error procesando frame con OpenCV:', error);
    updateStatus('Error procesando frame.');
} finally {
    // Aseguramos que todas las Mats se eliminen al salir de try/catch
    // **NOTA: Eliminamos las comprobaciones isDeleted() ya que no son estándar y causan TypeError.**
    
    // Si la Mat fue inicializada (const src = new cv.Mat()), es seguro llamar a delete()
    // Si la lógica del try falla, estas variables todavía existen y deben ser liberadas.
    
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    kernel.delete(); 

    // Los MatVector
    contours.delete();
    hierarchy.delete();
  }

  requestAnimationFrame(processFrame);
}

function updateDetections(detections) {
  appState.detections = detections;
  const newDetections = Math.max(0, detections.length - appState.lastDetectionCount);
  appState.totalDetections += newDetections;
  appState.lastDetectionCount = detections.length;

  renderOverlay();
  renderDetectionList();
  updateStatus('Procesamiento en vivo con OpenCV.');

  if (appState.totalDetectionsEl) {
    appState.totalDetectionsEl.textContent = appState.totalDetections.toString();
  }
}

function renderOverlay() {
  if (!appState.overlayCtx || !appState.canvasEl) return;
  const ctx = appState.overlayCtx;
  ctx.clearRect(0, 0, appState.canvasEl.width, appState.canvasEl.height);

  ctx.strokeStyle = 'rgba(93, 252, 141, 0.9)';
  ctx.lineWidth = 2;
  ctx.font = '14px "Space Grotesk", system-ui';
  ctx.fillStyle = 'rgba(93, 252, 141, 0.2)';

  appState.detections.forEach((det) => {
    const { x, y, width, height } = det.box;
    ctx.strokeRect(x, y, width, height);
    ctx.fillRect(x, y, width, height);
    const label = `${det.label} ${(det.confidence * 100).toFixed(1)}%`;
    const textWidth = ctx.measureText(label).width;
    const padding = 6;
    ctx.fillStyle = 'rgba(6, 8, 15, 0.85)';
    ctx.fillRect(x, Math.max(0, y - 24), textWidth + padding * 2, 22);
    ctx.fillStyle = '#5dfc8d';
    ctx.fillText(label, x + padding, Math.max(14, y - 8));
    ctx.fillStyle = 'rgba(93, 252, 141, 0.2)';
  });
}

function renderDetectionList() {
  if (!appState.detectionListEl) return;

  appState.detectionListEl.innerHTML = '';
  if (appState.detections.length === 0) {
    appState.detectionListEl.innerHTML = '<li class="muted">Sin detecciones aún. Mantén el encuadre estable o acerca objetos.</li>';
    return;
  }

  appState.detections.forEach((det, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="label-row">
        <span class="pill">${String(index + 1).padStart(2, '0')}</span>
        <span class="label">${det.label}</span>
        <span class="confidence">${(det.confidence * 100).toFixed(1)}%</span>
      </div>
      <div class="bar">
        <span class="fill" style="width:${Math.min(100, det.confidence * 100)}%"></span>
      </div>
    `;
    appState.detectionListEl.appendChild(li);
  });
}

async function sendLog() {
  if (appState.isSending) return;

  if (!appState.isCameraReady) {
    const message = 'La cámara aún no está lista. Intenta en unos segundos.';
    alert(message);
    updateStatus(message);
    return;
  }

  const payload = {
    totalDetections: appState.totalDetections,
    detections: appState.detections,
    clientTimestamp: new Date().toISOString(),
  };

  appState.isSending = true;
  toggleSendButton(true);
  updateStatus('Enviando métricas al servidor...');

  try {
    const response = await fetch('/api/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error del servidor: ${response.status}`);
    }

    const data = await response.json();
    updateStatus(`Datos enviados correctamente. Server: ${data.serverTimestamp}`);
  } catch (error) {
    console.error('Error al enviar datos:', error);
    alert('No pudimos enviar los datos. Intenta nuevamente en unos segundos.');
    updateStatus('Error al enviar datos. Revisa la consola para más detalles.');
  } finally {
    appState.isSending = false;
    toggleSendButton(false);
  }
}

function toggleSendButton(disabled) {
  if (appState.sendButtonEl) {
    appState.sendButtonEl.disabled = disabled;
    appState.sendButtonEl.textContent = disabled ? 'Enviando...' : 'Enviar datos';
  }
}

function updateStatus(message) {
  if (appState.statusMessageEl) {
    appState.statusMessageEl.textContent = message;
  }
}

function updateCameraStatus(message) {
  if (appState.cameraStatusEl) {
    appState.cameraStatusEl.textContent = message;
  }
}
