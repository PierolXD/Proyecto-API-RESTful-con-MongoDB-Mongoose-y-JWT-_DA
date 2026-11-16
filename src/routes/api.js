// ============================================================================
// routes/api.js — Definición central de rutas y endpoints de la API REST
// ============================================================================
// En la arquitectura MVC, las "rutas" actúan como el despachador de tráfico.
// Reciben la petición HTTP entrante, verifican si la ruta requiere pasar por
// un middleware de seguridad (como la autenticación JWT), y finalmente
// delegan la ejecución al controlador correspondiente.
//
// Esta función exportada "api(secret)" recibe la clave secreta de JWT
// para inicializar el middleware de autenticación y las rutas dependientes.
// ============================================================================

import { Router } from 'express';
// ↑ Router de Express: permite crear manejadores de rutas modulares y montables.

// Controladores importados
import { register, login } from '../controllers/auth.js';
import { listProducts, createProduct } from '../controllers/products.js';
import { listOrders, purchase, returnOrder } from '../controllers/orders.js';

// Middleware de autenticación
import { authenticate } from '../middleware/auth.js';

/**
 * api(secret)
 * -----------
 * Configura y devuelve el enrutador con todos los endpoints de la API.
 *
 * @param {string} secret - Clave secreta con la que se firman y validan los JWT
 * @returns {Router} Router de Express listo para usarse bajo el prefijo "/api"
 */
export function api(secret) {
  const router = Router();

  // Instanciamos el middleware de autenticación pasando el secreto
  const auth = authenticate(secret);

  // ── RUTAS DE AUTENTICACIÓN (Públicas) ──────────────────────────────────────
  // Registro público de clientes
  // POST /api/auth/register
  router.post('/auth/register', register);

  // Inicio de sesión: valida credenciales y entrega el token JWT
  // POST /api/auth/login
  router.post('/auth/login', login(secret));

  // ── RUTAS DE PRODUCTOS / CATÁLOGO ──────────────────────────────────────────
  // Ver catálogo completo (Público: cualquier cliente o visitante puede consultarlo)
  // GET /api/products
  router.get('/products', listProducts);

  // Crear un nuevo producto (Protegida: requiere JWT con rol de 'admin')
  // POST /api/products
  // Integrada del proyecto del compañero (tienda-virtual-backend)
  router.post('/products', auth, createProduct);

  // ── RUTAS DE ÓRDENES Y COMPRAS (Protegidas por JWT) ────────────────────────
  // Todas estas rutas llevan el middleware "auth" como intermediario.
  // Si no se envía un Bearer Token válido en las cabeceras, la petición se rechaza
  // con HTTP 401 antes de llegar al controlador.

  // Ver historial de órdenes del cliente autenticado
  // GET /api/orders
  router.get('/orders', auth, listOrders);

  // Realizar una compra (crea orden y deduce stock atómicamente con transacción)
  // POST /api/orders
  router.post('/orders', auth, purchase);

  // Devolver una orden (cambia estado a 'devuelta' y restaura el stock)
  // PATCH /api/orders/:id/return
  router.patch('/orders/:id/return', auth, returnOrder);

  return router;
}
