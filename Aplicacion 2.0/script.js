
/* ML Vision HUD — OpenCV.js demo with live predictions + chat
   Notes:
   - Uses OpenCV's pre-trained HOG People Detector for "persona"
   - Adds generic "objeto" detections based on contours (heuristic)
   - All processing is local in the browser (no uploads)
*/

(() => {
  "use strict";

  const el = {
    video: document.getElementById("video"),
    canvas: document.getElementById("canvas"),
    cameraStatus: document.getElementById("cameraStatus"),
    totalDetections: document.getElementById("totalDetections"),
    detectionList: document.getElementById("detectionList"),
    statusMessage: document.getElementById("statusMessage"),
    startButton: document.getElementById("startButton"),
    stopButton: document.getElementById("stopButton"),
    chatLog: document.getElementById("chatLog"),
    clearChatButton: document.getElementById("clearChatButton"),
  };

  const state = {
    stream: null,
    rafId: null,
    running: false,
    cvReady: false,
    cap: null,

    // OpenCV mats (allocated after start)
    src: null,
    gray: null,
    edges: null,
    hierarchy: null,

    hog: null,

    // UI throttling
    lastUiTs: 0,
    uiIntervalMs: 200,

    // detection bookkeeping
    total: 0,
    lastAnnounceTs: 0,
    announceIntervalMs: 600,
    lastSignature: "",
  };

  function setStatus(text, tone = "muted") {
    el.statusMessage.classList.toggle("danger", tone === "danger");
    el.statusMessage.textContent = text;
  }

  function fmtPct(x) {
    const v = Math.max(0, Math.min(1, x));
    return `${Math.round(v * 100)}%`;
  }

  function nowTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function sigmoid(x) {
    // weights from HOG can be large; clamp to avoid overflow
    const z = Math.max(-12, Math.min(12, x));
    return 1 / (1 + Math.exp(-z));
  }

  function clearList() {
    el.detectionList.innerHTML = `<li class="muted">Sin detecciones aún. Mantén el encuadre estable o acerca objetos al campo de visión.</li>`;
  }

  function renderDetectionsList(dets) {
    if (!dets.length) {
      clearList();
      return;
    }
    const top = dets.slice(0, 6);
    el.detectionList.innerHTML = top
      .map((d) => {
        const pct = fmtPct(d.confidence);
        const w = Math.round(Math.max(0.02, Math.min(1, d.confidence)) * 100);
        return `
          <li>
            <div class="label-row">
              <span class="pill">${d.label}</span>
              <span class="caption">${d.note || "Detección local (OpenCV.js)"}</span>
              <span class="confidence">${pct}</span>
            </div>
            <div class="bar" aria-hidden="true"><span class="fill" style="width:${w}%"></span></div>
          </li>`;
      })
      .join("");
  }

  function pushChat(dets) {
    const summary = dets
      .slice(0, 4)
      .map((d) => `${d.label} ${fmtPct(d.confidence)}`)
      .join(" · ");
    const msg = document.createElement("div");
    msg.className = "chat-msg";
    msg.innerHTML = `
      <div class="chat-meta"><span>${nowTime()}</span><span>${dets.length} det.</span></div>
      <div>${summary || "Sin detecciones"}</div>
    `;
    el.chatLog.appendChild(msg);

    // keep last ~60 messages
    while (el.chatLog.children.length > 60) el.chatLog.removeChild(el.chatLog.firstChild);

    // auto scroll
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  function signature(dets) {
    // coarse signature to avoid spamming chat
    return dets
      .slice(0, 5)
      .map((d) => `${d.label}:${Math.round(d.confidence * 20)}`)
      .join("|");
  }

  function drawOverlay(dets) {
    const ctx = el.canvas.getContext("2d");
    ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);

    // subtle grid / HUD effect
    ctx.globalAlpha = 0.06;
    const step = Math.max(40, Math.floor(el.canvas.width / 16));
    ctx.beginPath();
    for (let x = 0; x < el.canvas.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, el.canvas.height);
    }
    for (let y = 0; y < el.canvas.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(el.canvas.width, y);
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;

    dets.forEach((d) => {
      const { x, y, w, h } = d.bbox;
      // box
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(93, 252, 141, 0.95)";
      ctx.strokeRect(x, y, w, h);

      // label background
      const label = `${d.label} ${fmtPct(d.confidence)}`;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      const padX = 8, padY = 5;
      const tw = ctx.measureText(label).width;
      const bx = Math.max(0, x);
      const by = Math.max(0, y - 22);
      ctx.fillStyle = "rgba(6, 8, 15, 0.85)";
      ctx.fillRect(bx, by, tw + padX * 2, 20);

      // label text
      ctx.fillStyle = "rgba(93, 252, 141, 0.95)";
      ctx.fillText(label, bx + padX, by + 14);
    });
  }

  function computeDetections() {
    // Read frame
    state.cap.read(state.src);

    // Prepare grayscale
    cv.cvtColor(state.src, state.gray, cv.COLOR_RGBA2GRAY);

    const dets = [];

    // 1) People detector (HOG)
    const found = new cv.RectVector();
    const weights = new cv.DoubleVector();
    const winStride = new cv.Size(8, 8);
    const padding = new cv.Size(8, 8);
    // scale, finalThreshold, useMeanshiftGrouping
    state.hog.detectMultiScale(state.gray, found, weights, 0, winStride, padding, 1.05, 2, false);

    for (let i = 0; i < found.size(); i++) {
      const r = found.get(i);
      const w = weights.size() > i ? weights.get(i) : 0.6;
      const conf = Math.max(0.15, Math.min(0.99, sigmoid(w)));

      dets.push({
        label: "persona",
        confidence: conf,
        note: "HOG (OpenCV)",
        bbox: { x: r.x, y: r.y, w: r.width, h: r.height },
      });
    }

    found.delete();
    weights.delete();
    winStride.delete();
    padding.delete();

    // 2) Generic objects via contours (heuristic)
    cv.GaussianBlur(state.gray, state.gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(state.gray, state.edges, 70, 140);

    const contours = new cv.MatVector();
    cv.findContours(state.edges, contours, state.hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = state.src.cols * state.src.rows;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt, false);
      if (area < frameArea * 0.01) { // ignore tiny
        cnt.delete();
        continue;
      }
      const rect = cv.boundingRect(cnt);

      // avoid tagging the full frame as object
      const rectArea = rect.width * rect.height;
      if (rectArea > frameArea * 0.9) {
        cnt.delete();
        continue;
      }

      const solidity = area / Math.max(1, rectArea);
      const sizeScore = Math.min(1, rectArea / (frameArea * 0.35));
      let conf = 0.2 + 0.6 * solidity + 0.2 * sizeScore;
      conf = Math.max(0.12, Math.min(0.95, conf));

      dets.push({
        label: "objeto",
        confidence: conf,
        note: "Contornos (heurística)",
        bbox: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });

      cnt.delete();
    }

    contours.delete();

    // Sort
    dets.sort((a, b) => b.confidence - a.confidence);

    return dets;
  }

  function loop(ts) {
    if (!state.running) return;

    try {
      const dets = computeDetections();
      drawOverlay(dets);

      // UI update throttle
      if (ts - state.lastUiTs > state.uiIntervalMs) {
        state.lastUiTs = ts;
        renderDetectionsList(dets);
        el.cameraStatus.textContent = `En vivo · ${dets.length} det.`;
      }

      // Chat announce on change + throttle
      const sig = signature(dets);
      if (sig && sig !== state.lastSignature && ts - state.lastAnnounceTs > state.announceIntervalMs) {
        state.lastAnnounceTs = ts;
        state.lastSignature = sig;

        // increment total detections when something meaningful appears
        state.total += 1;
        el.totalDetections.textContent = String(state.total);
        pushChat(dets);
      }
    } catch (err) {
      console.error(err);
      setStatus("Error procesando el frame. Revisa consola del navegador.", "danger");
      stop();
      return;
    }

    state.rafId = requestAnimationFrame(loop);
  }

  async function start() {
    if (!state.cvReady) {
      setStatus("OpenCV.js aún no está listo. Espera un segundo y vuelve a intentarlo…", "danger");
      return;
    }
    if (state.running) return;

    setStatus("Solicitando permisos de cámara…");
    el.cameraStatus.textContent = "Solicitando permisos…";

    // Guard rails: ensure DOM nodes exist (BindingError often means undefined element passed to OpenCV bindings)
    if (!el.video || !el.canvas) {
      throw new Error("Missing video/canvas elements. Revisa que existan ids='video' y ids='canvas' en el HTML.");
    }


    try {
      const preferred = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      // Fallback: some desktop cameras / browsers (esp. Brave) can reject facingMode constraints.
      const fallback = { video: true, audio: false };

      async function getStreamWithFallback() {
        try {
          return await navigator.mediaDevices.getUserMedia(preferred);
        } catch (e1) {
          console.warn("getUserMedia preferred constraints failed:", e1?.name, e1);
          return await navigator.mediaDevices.getUserMedia(fallback);
        }
      }

      state.stream = await getStreamWithFallback();
      el.video.srcObject = state.stream;

      await new Promise((resolve) => {
        el.video.onloadedmetadata = () => resolve();
      });

      // Ensure playback (some browsers require an explicit play call even with autoplay)
      try {
        await el.video.play();
      } catch (e) {
        console.warn("video.play() failed:", e?.name, e);
      }

      // Sync canvas to actual video resolution (critical for correct boxes)
      const vw = el.video.videoWidth;
      const vh = el.video.videoHeight;
      el.canvas.width = vw;
      el.canvas.height = vh;

      // Setup OpenCV capture + mats
      state.cap = new cv.VideoCapture(el.video);
      state.src = new cv.Mat(vh, vw, cv.CV_8UC4);
      state.gray = new cv.Mat(vh, vw, cv.CV_8UC1);
      state.edges = new cv.Mat(vh, vw, cv.CV_8UC1);
      state.hierarchy = new cv.Mat();

      // People detector
      state.hog = new cv.HOGDescriptor();
      state.hog.setSVMDetector(cv.HOGDescriptor.getDefaultPeopleDetector());

      state.running = true;
      state.lastUiTs = 0;
      state.lastAnnounceTs = 0;
      state.lastSignature = "";

      el.startButton.disabled = true;
      el.stopButton.disabled = false;

      setStatus("Cámara iniciada. Analizando…");
      el.cameraStatus.textContent = "En vivo · 0 det.";

      // Chat welcome
      el.chatLog.innerHTML = "";
      const w = document.createElement("div");
      w.className = "chat-msg";
      w.innerHTML = `<div class="chat-meta"><span>${nowTime()}</span><span>system</span></div><div>Cámara activa. Mostrando predicciones.</div>`;
      el.chatLog.appendChild(w);

      state.rafId = requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      setStatus(`No se pudo iniciar la cámara: ${err?.name || "Error"} — abre Console para ver el stack (típico: IDs video/canvas mal, o cámara en uso).`, "danger");
      el.cameraStatus.textContent = "Cámara no disponible";
      stop(true);
    }
  }

  function releaseCv() {
    if (state.hog) { state.hog.delete(); state.hog = null; }
    if (state.src) { state.src.delete(); state.src = null; }
    if (state.gray) { state.gray.delete(); state.gray = null; }
    if (state.edges) { state.edges.delete(); state.edges = null; }
    if (state.hierarchy) { state.hierarchy.delete(); state.hierarchy = null; }
    state.cap = null;
  }

  function stop(silent = false) {
    if (!state.running && !state.stream) return;

    state.running = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;

    releaseCv();

    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
    }

    el.video.srcObject = null;

    el.startButton.disabled = false;
    el.stopButton.disabled = true;

    el.cameraStatus.textContent = "Cámara apagada";
    if (!silent) setStatus("Cámara detenida.");
  }

  function bindUi() {
    el.startButton?.addEventListener("click", start);
    el.stopButton?.addEventListener("click", () => stop(false));
    el.clearChatButton?.addEventListener("click", () => {
      el.chatLog.innerHTML = `<div class="chat-msg muted">Chat limpiado.</div>`;
      state.lastSignature = "";
    });

    // If user leaves tab, stop camera to be polite
    window.addEventListener("beforeunload", () => stop(true));
  }

  // Wait for OpenCV runtime
  function initOpenCvReady() {
    // OpenCV is loaded asynchronously sometimes; poll until `cv` exists,
    // then hook `onRuntimeInitialized`.
    const tryBind = () => {
      if (typeof cv === "undefined") return false;
      cv["onRuntimeInitialized"] = () => {
        state.cvReady = true;
        setStatus("OpenCV.js listo. Pulsa “Iniciar cámara”.");
        el.cameraStatus.textContent = "Cámara apagada";
      };
      return true;
    };

    if (tryBind()) return;

    // If not yet available, retry for a few seconds.
    let attempts = 0;
    const maxAttempts = 120; // ~6s at 50ms
    const t = setInterval(() => {
      attempts += 1;
      if (tryBind() || attempts >= maxAttempts) {
        clearInterval(t);
        if (!state.cvReady && typeof cv === "undefined") {
          setStatus("No se pudo cargar OpenCV.js. Revisa la consola y la red (Network).", "danger");
          el.startButton.disabled = true;
        }
      }
    }, 50);
  }

  // Basic capability checks
  function preflight() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Tu navegador no soporta getUserMedia. Usa Chrome/Edge/Firefox moderno.", "danger");
      el.startButton.disabled = true;
      return;
    }
  }

  preflight();
  bindUi();
  initOpenCvReady();
})();
