# Informe técnico: Huella

## 1. Metadatos

- Proyecto: API REST de venta de productos para mascotas.
- Repositorio público: https://github.com/PierolXD/Proyecto-API-RESTful-con-MongoDB-Mongoose-y-JWT-_DA
- Comandos en PowerShell:

```powershell
npm ci
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# Editar .env con el secreto generado y el URI del equipo
npm run seed
npm start
```

Plantilla de entorno sin credenciales:

```dotenv
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/huella?replicaSet=rs0
JWT_SECRET=
```

## 2. Arquitectura MVC

```text
src/
  app.js
  server.js
  config/
    database.js
  controllers/
    auth.js
    orders.js
    products.js
  middleware/
    auth.js
    errors.js
  models/
    Order.js
    Product.js
    User.js
  routes/
    api.js
scripts/
  seed.js
  verify.js
```

Express recibe las solicitudes y la ruta selecciona el controlador. Las rutas privadas pasan primero por el middleware que verifica el JWT y entrega al controlador el ID del cliente. Los controladores aplican las reglas de negocio y consultan o modifican documentos a través de los modelos de Mongoose. El controlador envía la representación JSON de los recursos y un middleware común construye las respuestas de error.

## 3. Modelado

Usuario exige nombre y correo válido, normaliza el correo y garantiza su unicidad con un índice. Oculta el hash de contraseña de las consultas ordinarias. Producto exige SKU único, nombre, categoría del catálogo, precio entero positivo y stock entero no negativo. Orden requiere un ObjectId de usuario y por lo menos un artículo con ObjectId de producto, cantidad entera y precio de compra. El estado se restringe a `comprada` o `devuelta`. El código completo de los esquemas aparece en el apéndice.

## 4. Endpoints y pruebas

| Método y ruta | Headers | Cuerpo | Éxito |
|---|---|---|---|
| POST /api/auth/register | Content-Type: application/json | nombre, email, password | 201, usuario |
| POST /api/auth/login | Content-Type: application/json | email, password | 200, token y usuario |
| GET /api/products | Ninguno | Sin cuerpo | 200, catálogo en MXN |
| POST /api/orders | Content-Type: application/json y Authorization: Bearer JWT | items: arreglo de producto y cantidad | 201, orden |
| GET /api/orders | Authorization: Bearer JWT | Sin cuerpo | 200, órdenes del usuario |
| PATCH /api/orders/:id/return | Authorization: Bearer JWT | Sin cuerpo | 200, orden devuelta |

`npm run test:api` levanta un servidor de pruebas, realiza peticiones HTTP reales y escribe sus códigos, headers y cuerpos JSON. Ejecutar con `MONGODB_URI` apuntando a una base de pruebas: la prueba crea documentos de ejemplo. El JWT se omite en el texto generado.

La ejecución con un replica set temporal de MongoDB pasó las pruebas. En [EVIDENCIA.txt](EVIDENCIA.txt) están las solicitudes y respuestas reales de registro, inicio de sesión, compra y devolución, junto con sus casos de error. Se verificó que al comprar dos unidades el stock bajó de 5 a 3, al devolver subió a 5 y un segundo intento dejó el stock en 5. También se comprobó que una compra de varios artículos revierte todos los cambios si uno queda sin stock.

## 5. Reflexión técnica

La contraseña se guarda como hash de bcrypt con factor 12 y se compara durante el inicio de sesión. El token se firma con HS256, identifica al usuario en su campo subject y vence en una hora. Se verifica la firma y se comprueban el algoritmo, el emisor, la audiencia y la caducidad. Las consultas de órdenes filtran por el usuario autenticado.

En la compra, cada actualización de inventario exige stock suficiente y se ejecuta en la misma transacción que la creación de la orden. El precio se lee de MongoDB y la orden conserva el precio al momento de la compra. Una falla revierte todos los cambios. Al devolver, la transacción cambia de `comprada` a `devuelta` y repone el stock; el filtro por estado impide una segunda devolución. Un ID mal formado recibe 400, una orden ajena o inexistente 404 y un conflicto de stock o estado 409.

## Apéndice: código de los esquemas

### User

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true,
    maxlength: 254, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });

export default mongoose.model('User', schema);
```

### Product

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  sku: { type: String, required: true, trim: true, uppercase: true, unique: true },
  nombre: { type: String, required: true, trim: true },
  categoria: { type: String, required: true, enum: ['alimento', 'juguetes', 'higiene', 'accesorios'] },
  precioCentavos: { type: Number, required: true, min: 1, max: 100000000, validate: Number.isSafeInteger },
  stock: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }
}, { timestamps: true });

export default mongoose.model('Product', schema);
```

### Order

```js
import mongoose from 'mongoose';

const item = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  nombre: { type: String, required: true },
  cantidad: { type: Number, required: true, min: 1, max: 100, validate: Number.isSafeInteger },
  precioCentavos: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }
}, { _id: false });

const schema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: { type: [item], required: true, validate: v => v.length >= 1 && v.length <= 50 },
  totalCentavos: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  estado: { type: String, enum: ['comprada', 'devuelta'], default: 'comprada', required: true },
  devueltaEn: Date
}, { timestamps: true });

export default mongoose.model('Order', schema);
```
