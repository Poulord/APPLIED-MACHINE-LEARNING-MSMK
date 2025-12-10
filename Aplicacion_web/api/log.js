export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const { faces, clientTimestamp } = req.body || {};
  const parsedFaces = typeof faces === 'number' ? faces : Number(faces);
  const isFacesValid = Number.isFinite(parsedFaces);
  const isTimestampValid = typeof clientTimestamp === 'string' && !Number.isNaN(Date.parse(clientTimestamp));

  if (!isFacesValid || !isTimestampValid) {
    return res
      .status(400)
      .json({ ok: false, error: 'Payload inválido: se requieren "faces" numérico y "clientTimestamp" válido.' });
  }

  const serverTimestamp = new Date().toISOString();
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

  console.log('Log de interacción', {
    faces: parsedFaces,
    clientTimestamp,
    serverTimestamp,
    userAgent,
    ip,
  });

  return res.status(200).json({
    ok: true,
    faces: parsedFaces,
    clientTimestamp,
    serverTimestamp,
  });
}
