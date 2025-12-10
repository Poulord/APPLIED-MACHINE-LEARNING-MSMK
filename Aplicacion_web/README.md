# Demo web de detección multi-objeto (cámara + backend Vercel)

Esta aplicación es una demo ligera pensada para prácticas de *Machine Learning* y *Visión por Computador*. Usa la cámara del navegador para mostrar un stream local, simula detecciones de múltiples objetos (similar a Ultralytics: etiqueta + confianza) y envía un log anónimo a una función serverless en Vercel.

## Características
- **Vista previa de cámara** usando `navigator.mediaDevices.getUserMedia`.
- **Simulación de detección multi-objeto** al hacer clic en el lienzo: se generan bounding boxes, etiqueta y confianza aleatorias.
- **Overlay visual** en el `<canvas>` con cajas y texto de clase + confianza.
- **Panel de métricas** con detecciones listadas (badge + barra de confianza) y contador acumulado.
- **Envío de métricas** a `/api/log` vía `fetch` con validación y manejo de errores.
- **Diseño futurista / HUD** en CSS puro, responsive para escritorio y móvil.

## Estructura de archivos
- `index.html`: layout principal, panel de vídeo, panel de control y lista de detecciones.
- `style.css`: estilos futuristas (fondos degradados, acentos verde neón, HUD responsive).
- `script.js`: lógica de cliente (estado centralizado, simulación de detecciones, overlay, envío de log).
- `api/log.js`: función serverless (Next.js/Vercel) para validar y registrar las métricas.

## Flujo de funcionamiento
1. **Inicio**: `initApp()` configura referencias DOM, eventos y solicita la cámara. Si la cámara falla, se muestra un `alert` y se registran errores.
2. **Simular detecciones**: un clic en el `<canvas>` llama a `simulateDetections()`, que genera detecciones sintéticas (etiqueta, confianza y bounding box). Se dibujan cajas y etiquetas sobre el vídeo y se muestra la lista con barras de confianza.
3. **Contador acumulado**: `updateDetections()` suma las detecciones al contador total y actualiza el panel “Detecciones acumuladas”.
4. **Envío al backend**: el botón “Enviar datos” dispara `sendLog()`, que prepara el payload y lo envía a `/api/log`.
5. **Backend**: `api/log.js` valida método, número total, arreglo de detecciones y timestamp; registra muestra de detecciones + metadatos (IP, UA, timestamp) y devuelve JSON con `ok: true`.

## Payload enviado al backend
```json
{
  "totalDetections": <number>,
  "detections": [
    { "label": "auto", "confidence": 0.92, "box": { "x": 10, "y": 20, "width": 180, "height": 120 } },
    { "label": "persona", "confidence": 0.81, "box": { "x": 220, "y": 60, "width": 120, "height": 200 } }
  ],
  "clientTimestamp": "2024-05-25T10:30:45.000Z"
}
```

## Lógica de envío y validación
- El frontend ( `sendLog()` ) bloquea envíos concurrentes (`isSending`) y muestra estados de carga/éxito/error. Si la cámara no está lista, muestra un aviso.
- El backend rechaza cualquier método distinto de `POST` con 405.
- Valida que `totalDetections` sea numérico, `detections` sea un arreglo con `label` y `confidence`, y que `clientTimestamp` sea fecha válida.
- Registra en consola: total, muestra de detecciones, timestamp de cliente/servidor, IP aproximada (`x-forwarded-for` o `remoteAddress`) y `User-Agent`.
- Devuelve JSON estructurado con las métricas y `serverTimestamp`.

## Cómo ejecutar localmente
1. **Requisitos**: Node.js 18+.
2. **Servir frontend**: puedes usar `npx serve` o cualquier servidor estático desde la carpeta `Aplicacion_web`.
   ```bash
   npx serve .
   ```
3. **Probar API local** (si usas Next.js/Vercel CLI):
   ```bash
   npx vercel dev
   ```
4. Abre `http://localhost:3000` (o el puerto de tu servidor estático) y acepta permisos de cámara.

## Notas de privacidad y uso
- El stream de la cámara se mantiene local en el navegador.
- Las métricas enviadas son anónimas y se usan solo para la práctica educativa.
- Puedes cerrar la pestaña para detener inmediatamente el stream.

## Personalización rápida
- Ajusta las clases simuladas en `DETECTION_LABELS` dentro de `script.js`.
- Cambia colores/acento en `style.css` modificando las variables CSS en `:root`.
- Añade más campos al payload en `sendLog()` y actualiza la validación en `api/log.js` si necesitas almacenar más datos.
