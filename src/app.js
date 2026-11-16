// ============================================================================
// app.js — Fábrica y configuración de la aplicación Express
// ============================================================================
// Este archivo configura la aplicación Express pero NO inicia el servidor HTTP
// (no llama a .listen()). Esto es un principio de diseño clave:
//   1. Permite importar la app en scripts de prueba (ej. verify.js) levantándola
//      en puertos dinámicos aleatorios sin colisionar con el servidor real.
//   2. Desacopla la lógica de enrutamiento y middlewares del entorno de red.
// ============================================================================

import express from 'express';
import { api } from './routes/api.js';
import { handleError, HttpError } from './middleware/errors.js';

/**
 * createApp(secret)
 * -----------------
 * Crea, configura y devuelve una instancia de la aplicación Express.
 *
 * @param {string} secret - Clave secreta con la que se firman y verifican los tokens JWT
 * @returns {express.Application} Aplicación Express completamente configurada
 */
export function createApp(secret) {
  // Validación de seguridad defensiva: la clave secreta debe tener al menos 32 bytes (256 bits)
  // para garantizar la solidez criptográfica del algoritmo HMAC-SHA256 (HS256).
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 bytes.');
  }

  const app = express();

  // ── Buenas prácticas de seguridad ─────────────────────────────────────────
  // Desactiva la cabecera "X-Powered-By: Express" para no revelar al atacante
  // qué tecnología o versión de servidor web está ejecutando la API.
  app.disable('x-powered-by');

  // Soporte básico de CORS para permitir solicitudes desde clientes frontend
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── Middleware de análisis (parser) ───────────────────────────────────────
  // express.json() analiza el cuerpo de las solicitudes entrantes con JSON (req.body).
  // limit: '32kb' previene ataques de Denegación de Servicio (DoS) bloqueando payloads gigantescos.
  app.use(express.json({ limit: '32kb' }));

  // ── Ruta raíz (Health Check y bienvenida) ─────────────────────────────────
  // GET / → Proporciona información de salud y el enlace directo al catálogo
  app.get('/', (req, res) => res.json({
    tienda: 'Huella - Tienda Virtual',
    estado: 'API Activa',
    catalogo: '/api/products'
  }));

  // ── Montaje de rutas de la API ────────────────────────────────────────────
  // Todas las rutas definidas en routes/api.js se montan bajo el prefijo "/api"
  app.use('/api', api(secret));

  // ── Manejo de rutas inexistentes (404) ────────────────────────────────────
  // Si una petición llega aquí y no coincidió con ninguna ruta anterior,
  // generamos un HttpError con código 404 (Not Found).
  app.use((req, res, next) => next(new HttpError(404, 'Ruta no encontrada.')));

  // ── Middleware central de errores ─────────────────────────────────────────
  // DEBE ser siempre el último middleware registrado en Express para capturar
  // cualquier excepción síncrona o asíncrona de las capas superiores.
  app.use(handleError);

  return app;
}
