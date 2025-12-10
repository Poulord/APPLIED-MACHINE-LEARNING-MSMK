export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const { totalDetections, detections, clientTimestamp } = req.body || {};
  const parsedTotal = typeof totalDetections === 'number' ? totalDetections : Number(totalDetections);
  const isTotalValid = Number.isFinite(parsedTotal) && parsedTotal >= 0;
  const isTimestampValid = typeof clientTimestamp === 'string' && !Number.isNaN(Date.parse(clientTimestamp));
  const isDetectionsValid = Array.isArray(detections)
    && detections.every((d) => typeof d?.label === 'string' && Number.isFinite(Number(d?.confidence)));

  if (!isTotalValid || !isTimestampValid || !isDetectionsValid) {
    return res.status(400).json({
      ok: false,
      error: 'Payload inválido: se requieren "totalDetections" numérico, "detections" válidos y "clientTimestamp".',
    });
  }

  const serverTimestamp = new Date().toISOString();
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

  console.log('Log de interacción', {
    totalDetections: parsedTotal,
    detectionsSample: detections.slice(0, 3),
    clientTimestamp,
    serverTimestamp,
    userAgent,
    ip,
  });

  return res.status(200).json({
    ok: true,
    totalDetections: parsedTotal,
    detections,
    clientTimestamp,
    serverTimestamp,
  });
}
