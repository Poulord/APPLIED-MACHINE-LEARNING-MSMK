# Demo web de detección multi-objeto con OpenCV.js (cámara + backend Vercel)

Esta aplicación es una demo ligera para prácticas de *Machine Learning* y *Visión por Computador*.
Activa la cámara del navegador, usa **OpenCV.js** y su biblioteca pre-entrenada de **HOGDescriptor**
para peatones junto con contornos para objetos generales, muestra etiqueta + confianza por cada
detección y envía un log anónimo a una función serverless en Vercel.

## Características
- **Vista previa de cámara** usando `navigator.mediaDevices.getUserMedia`.
- **Detección multi-objeto con OpenCV.js** usando:
  - El detector HOG pre-entrenado en peatones de OpenCV (biblioteca real de objetos).
  - Bordes (Canny), dilatación y contornos para complementar con objetos generales.
  - Bounding boxes, etiqueta y confianza (al estilo Ultralytics: clase + score).
- **Overlay visual** en el `<canvas>` con cajas y texto de clase + confianza.
- **Panel de métricas** con detecciones listadas (badge + barra de confianza) y contador acumulado.
- **Envío de métricas** a `/api/log` vía `fetch` con validación y manejo de errores.
- **Diseño futurista / HUD** en CSS puro, responsive para escritorio y móvil.

## Estructura de archivos
- `index.html`: layout principal, panel de vídeo, panel de control y lista de detecciones. Incluye `opencv.js`.
- `style.css`: estilos futuristas (fondos degradados, acentos verde neón, HUD responsive).
- `script.js`: lógica de cliente (estado centralizado, OpenCV.js con HOG + contornos, overlay, envío de log).
- `api/log.js`: función serverless (Next.js/Vercel) para validar y registrar las métricas.

## Flujo de funcionamiento
1. **Inicio**: `initApp()` configura referencias DOM, eventos y espera a que cargue OpenCV.js. Si falla, muestra `alert` y registra el error.
2. **Cámara**: se solicita permiso y se inicializa el stream. El `<video>` y `<canvas>` se sincronizan en tamaño al cargar los metadatos.
3. **Detección en vivo**:
   - Se convierte el frame a escala de grises, se ecualiza y suaviza.
   - Se ejecuta el detector HOG de OpenCV (biblioteca de peatones) para etiquetar "Persona (HOG)" con confianza derivada del score del modelo.
   - Se ejecuta Canny + dilatación + contornos para etiquetar objetos generales como "Objeto en movimiento" con confianza basada en el área relativa.
4. **Contador acumulado**: `updateDetections()` incrementa el contador cuando aparecen nuevas detecciones y actualiza el panel “Detecciones acumuladas”.
5. **Envío al backend**: el botón “Enviar datos” dispara `sendLog()`, que prepara el payload y lo envía a `/api/log`.
6. **Backend**: `api/log.js` valida método, número total, arreglo de detecciones y timestamp; registra muestra de detecciones + metadatos (IP, UA, timestamp) y devuelve JSON con `ok: true`.

## Payload enviado al backend
```json
{
  "totalDetections": <number>,
  "detections": [
    { "label": "Persona (HOG)", "type": "Detector HOG pre-entrenado en OpenCV para peatones.", "confidence": 0.91, "box": { "x": 24, "y": 40, "width": 180, "height": 260 } },
    { "label": "Objeto en movimiento", "type": "Contornos y bordes para objetos generales.", "confidence": 0.66, "box": { "x": 240, "y": 90, "width": 160, "height": 110 } }
  ],
  "clientTimestamp": "2024-05-25T10:30:45.000Z"
}
```

## Lógica de envío y validación
- El frontend (`sendLog()`) bloquea envíos concurrentes (`isSending`) y muestra estados de carga/éxito/error. Si la cámara no está lista, muestra un aviso.
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
- Ajusta los umbrales de Canny y el tamaño mínimo de contorno en `processFrame()` dentro de `script.js` para adaptar la sensibilidad y el tipo de objetos que se detectan.
- Cambia colores/acento en `style.css` modificando las variables CSS en `:root`.
- Añade más campos al payload en `sendLog()` y actualiza la validación en `api/log.js` si necesitas almacenar más datos.
