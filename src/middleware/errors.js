export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.code === 11000) return res.status(409).json({ error: 'El registro ya existe.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Cuerpo demasiado grande.' });
  if (error.type === 'entity.parse.failed' || error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Los datos enviados no son válidos.' });
  }
  console.error('Error interno:', error.name, error.code ?? '');
  return res.status(500).json({ error: 'No se pudo completar la operación.' });
}
