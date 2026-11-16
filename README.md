# Huella | API de una tienda para mascotas

Backend para consultar productos, registrar clientes, comprar y devolver órdenes. Los precios están en centavos de MXN: 24900 equivale a $249.00.

## Arranque en PowerShell

Necesitas Node.js 22 o superior y la conexión de tu compañero a **MongoDB Atlas o a un replica set de MongoDB**. Las transacciones requieren esa configuración. Un MongoDB local en modo standalone no sirve para esta API.

```powershell
npm ci
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Abre `.env`, pega el valor generado en `JWT_SECRET` y coloca el URI de tu equipo en `MONGODB_URI`. Guarda el archivo solo en tu equipo. Para cargar cuatro productos de demostración y levantar el servidor:

```powershell
npm run seed
npm start
```

Abre http://localhost:3000/api/products para ver el catálogo. `npm run dev` reinicia el servidor cuando editas el código. La carga de ejemplos agrega SKU nuevos sin restablecer inventario existente.

| Método y ruta | Resultado | Acceso |
|---|---|---|
| GET /api/products | Catálogo e inventario | Público |
| POST /api/auth/register | Registra con `nombre`, `email` y `password` | Público |
| POST /api/auth/login | Devuelve un JWT al enviar `email` y `password` | Público |
| POST /api/orders | Compra con `{"items":[{"producto":"<ID del catálogo>","cantidad":2}]}` | JWT |
| GET /api/orders | Historial del usuario autenticado | JWT |
| PATCH /api/orders/:id/return | Devuelve toda la orden, sin cuerpo | JWT |

Para enviar JSON, usa `Content-Type: application/json`. Las rutas privadas requieren `Authorization: Bearer <token>`. El ID de una orden se obtiene como `orden._id` al comprar.

## Integración con la base del equipo

La conexión se concentra en `src/config/database.js`. Los archivos en `src/models/` son el contrato que usa la API. Si tu compañero ya tiene modelos o datos, comparen los nombres, tipos e índices antes de conectar su base; pueden adaptar esos archivos o acordar este contrato:

- `users`: `nombre`, `email` único y normalizado, `passwordHash` de bcrypt.
- `products`: `sku` único, `nombre`, `categoria`, `precioCentavos` entero positivo, `stock` entero no negativo.
- `orders`: `usuario` ObjectId, `items[].producto` ObjectId, nombre/precio de cada artículo al comprar, cantidades, total y estado.

La cuenta de MongoDB necesita acceso para leer, escribir y crear los índices de estas colecciones. Usen una base de pruebas distinta para ejecutar `npm run test:api`: el script inserta datos de ejemplo para verificar el flujo y los deja en esa base.

El informe técnico está en [INFORME.md](INFORME.md). Antes de entregar, agreguen allí el enlace público al repositorio donde integren ambos aportes. Revisen que el archivo `.env` no aparezca en el repositorio.
