const appState = {
  faceCount: 0,
  isCameraReady: false,
  isSending: false,
  stream: null,
  videoEl: null,
  canvasEl: null,
  faceCountEl: null,
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
  appState.faceCountEl = document.getElementById('faceCount');
  appState.statusMessageEl = document.getElementById('statusMessage');
  appState.sendButtonEl = document.getElementById('sendButton');
  appState.cameraStatusEl = document.getElementById('cameraStatus');
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
        appState.canvasEl.width = appState.videoEl.videoWidth || 640;
        appState.canvasEl.height = appState.videoEl.videoHeight || 360;
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
    appState.canvasEl.addEventListener('click', () => updateFaceCount(1));
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

function updateFaceCount(increment = 1) {
  appState.faceCount += increment;
  if (appState.faceCount < 0) appState.faceCount = 0;
  if (appState.faceCountEl) {
    appState.faceCountEl.textContent = appState.faceCount.toString();
  }
  updateStatus('Conteo actualizado. Listo para enviar.');
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
    faces: appState.faceCount,
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
