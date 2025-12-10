const DETECTION_LABELS = ['persona', 'bicicleta', 'auto', 'perro', 'gato', 'monitor', 'celular', 'botella'];

const appState = {
  totalDetections: 0,
  detections: [],
  isCameraReady: false,
  isSending: false,
  stream: null,
  videoEl: null,
  canvasEl: null,
  overlayCtx: null,
  detectionListEl: null,
  totalDetectionsEl: null,
  statusMessageEl: null,
  sendButtonEl: null,
  cameraStatusEl: null,
};

document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
  initAppState();
  setupEvents();
  initCamera();
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

async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const message = 'Tu navegador no permite acceder a la cámara.';
    alert(message);
    console.error(message);
    updateStatus('No se puede acceder a la cámara.');
    return;
  }

  try {
    appState.stream = await navigator.mediaDevices.getUserMedia({ video: true });
    appState.videoEl.srcObject = appState.stream;
    appState.videoEl.onloadedmetadata = () => {
      appState.videoEl.play();
      if (appState.canvasEl) {
        const width = appState.videoEl.videoWidth || 640;
        const height = appState.videoEl.videoHeight || 360;
        appState.canvasEl.width = width;
        appState.canvasEl.height = height;
      }
    };
    appState.isCameraReady = true;
    updateCameraStatus('Cámara lista');
    updateStatus('Cámara inicializada. Toca el lienzo para simular detecciones.');
  } catch (error) {
    console.error('Error al iniciar la cámara:', error);
    alert('No pudimos activar tu cámara. Revisa los permisos e inténtalo nuevamente.');
    updateCameraStatus('Error al activar la cámara');
    updateStatus('No se pudo iniciar la cámara.');
  }
}

function setupEvents() {
  if (appState.canvasEl) {
    appState.canvasEl.addEventListener('click', () => {
      const detections = simulateDetections();
      updateDetections(detections);
    });
  }

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

function simulateDetections() {
  const amount = Math.max(1, Math.floor(Math.random() * 5));
  const width = appState.canvasEl?.width || 640;
  const height = appState.canvasEl?.height || 360;

  const detections = Array.from({ length: amount }).map(() => {
    const label = DETECTION_LABELS[Math.floor(Math.random() * DETECTION_LABELS.length)];
    const confidence = Math.random() * 0.4 + 0.55; // 0.55 - 0.95
    const boxWidth = Math.max(60, Math.random() * (width / 2));
    const boxHeight = Math.max(40, Math.random() * (height / 2));
    const x = Math.max(0, Math.random() * (width - boxWidth));
    const y = Math.max(0, Math.random() * (height - boxHeight));

    return { label, confidence: Number(confidence.toFixed(2)), box: { x, y, width: boxWidth, height: boxHeight } };
  });

  return detections;
}

function updateDetections(detections) {
  appState.detections = detections;
  appState.totalDetections += detections.length;

  renderOverlay();
  renderDetectionList();
  updateStatus('Detecciones simuladas listas para enviar.');

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
    appState.detectionListEl.innerHTML = '<li class="muted">Sin detecciones aún. Haz click en el lienzo para simular.</li>';
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
