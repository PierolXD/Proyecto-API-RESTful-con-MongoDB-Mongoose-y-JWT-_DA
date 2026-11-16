import express from 'express';
import { api } from './routes/api.js';
import { handleError, HttpError } from './middleware/errors.js';

export function createApp(secret) {
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_SECRET debe tener al menos 32 bytes.');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.get('/', (req, res) => res.json({ tienda: 'Huella', catalogo: '/api/products' }));
  app.use('/api', api(secret));
  app.use((req, res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
  app.use(handleError);
  return app;
}
