import { Router } from 'express';
import { register, login } from '../controllers/auth.js';
import { listProducts } from '../controllers/products.js';
import { listOrders, purchase, returnOrder } from '../controllers/orders.js';
import { authenticate } from '../middleware/auth.js';

export function api(secret) {
  const router = Router();
  const auth = authenticate(secret);
  router.post('/auth/register', register);
  router.post('/auth/login', login(secret));
  router.get('/products', listProducts);
  router.get('/orders', auth, listOrders);
  router.post('/orders', auth, purchase);
  router.patch('/orders/:id/return', auth, returnOrder);
  return router;
}
