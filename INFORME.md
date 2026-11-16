# Proyecto API RESTful con MongoDB, Mongoose y JWT
**Informe Técnico del Proyecto**

---

## 1. Metadatos del Proyecto

- **Enlace al Repositorio (GitHub):**  
  https://github.com/PierolXD/Proyecto-API-RESTful-con-MongoDB-Mongoose-y-JWT-_DA

- **Comandos de Ejecución:**

```powershell
# 1. Instalar dependencias exactas
npm ci

# 2. Configurar variables de entorno desde la plantilla
Copy-Item .env.example .env

# 3. Generar clave secreta segura de 32 bytes para JWT
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

# 4. Configurar en .env el JWT_SECRET generado y el MONGODB_URI (Replica Set / Atlas)

# 5. Poblar catálogo inicial de prueba
npm run seed

# 6. Iniciar servidor en producción o desarrollo
npm start
# o para modo desarrollo con recarga automática:
npm run dev

# 7. Ejecutar suite completa de pruebas automatizadas
npm run test:api
```

- **Plantilla de Entorno (`.env.example`):**

```dotenv
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/huella?replicaSet=rs0
JWT_SECRET=
```

---

## 2. Arquitectura del Proyecto (MVC)

### Árbol de Directorios (Texto):

```text
DA proyecto 16_11_2026/
├── .env.example
├── .gitignore
├── EVIDENCIA.txt
├── INFORME.md
├── README.md
├── package-lock.json
├── package.json
├── scripts/
│   ├── seed.js
│   └── verify.js
└── src/
    ├── app.js
    ├── server.js
    ├── config/
    │   └── database.js
    ├── controllers/
    │   ├── auth.js
    │   ├── orders.js
    │   └── products.js
    ├── middleware/
    │   ├── auth.js
    │   └── errors.js
    ├── models/
    │   ├── Order.js
    │   ├── Product.js
    │   └── User.js
    └── routes/
        └── api.js
```

### Descripción del Flujo:

El flujo de una petición comienza en el servidor Express (`src/app.js`), donde se configuran los parsers de JSON y se enrutan las solicitudes hacia `src/routes/api.js`. Las peticiones a rutas protegidas pasan primero por el middleware de autenticación (`src/middleware/auth.js`), el cual valida el token Bearer JWT con el algoritmo HS256, extrae el identificador del usuario decodificado y lo inyecta en `res.locals.userId`; si el token falta o no es válido, corta inmediatamente el flujo devolviendo un error HTTP 401. Una vez superada la autenticación (o en rutas públicas como catálogo o login/registro), el enrutador invoca el controlador correspondiente (`src/controllers/`). El controlador ejecuta las reglas de negocio e interactúa con la base de datos a través de los modelos de Mongoose (`src/models/User.js`, `src/models/Product.js`, `src/models/Order.js`). En operaciones críticas (como compra o devolución), las operaciones sobre múltiples documentos se ejecutan dentro de una sesión y transacción atómica de MongoDB (`session`). Finalmente, el controlador emite la respuesta JSON y cualquier excepción generada es capturada por el middleware centralizado de errores (`src/middleware/errors.js`), el cual mapea códigos de estado HTTP semánticos (400, 401, 404, 409, 500) sin exponer detalles sensibles al cliente.

---

## 3. Modelado de Datos (Esquemas de Mongoose)

### Esquema de Usuario (Código):

```javascript
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true,
    maxlength: 254, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['client', 'admin'], default: 'client' }
}, { timestamps: true });

export default mongoose.model('User', schema);
```

### Esquema de Producto (Código):

```javascript
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  sku: { type: String, required: true, trim: true, uppercase: true, unique: true },
  nombre: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  categoria: { type: String, required: true, enum: ['alimento', 'juguetes', 'higiene', 'accesorios'] },
  precioCentavos: { type: Number, required: true, min: 1, max: 100000000, validate: Number.isSafeInteger },
  stock: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }
}, { timestamps: true });

export default mongoose.model('Product', schema);
```

### Esquema de Orden (Código):

```javascript
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

### Validaciones Aplicadas (Explicación):

- **Usuario:**
  - `nombre`: Tipo `String`, obligatorio (`required: true`), sin espacios residuales (`trim: true`) y longitud máxima de 100 caracteres.
  - `email`: Tipo `String`, obligatorio, normalizado a minúsculas (`lowercase: true`), con índice único en base de datos (`unique: true`) y validación estricta de formato de correo mediante expresión regular (`match`).
  - `passwordHash`: Almacenado como hash de bcrypt. Configurado con `select: false` para que nunca viaje ni se incluya accidentalmente en consultas regulares a la base de datos.
- **Producto:**
  - `sku`: Código único de inventario en mayúsculas (`uppercase: true`), obligatorio e indexado de forma única (`unique: true`).
  - `categoria`: Validación mediante lista cerrada (`enum: ['alimento', 'juguetes', 'higiene', 'accesorios']`).
  - `precioCentavos` y `stock`: Valores numéricos enteros (`Number.isSafeInteger`). El precio no admite números negativos ni decimales flotantes (se almacena en centavos para evitar errores de precisión de punto flotante) y el stock no puede ser inferior a 0 (`min: 0`).
- **Orden:**
  - `usuario`: Referencia relacional explícita mediante `ObjectId` hacia el modelo `User`, indexado para acelerar consultas de historial.
  - `items`: Subdocumentos embebidos donde cada elemento referencia por `ObjectId` a un `Product`. Conserva el nombre y precio histórico congelado al momento de la compra.
  - `estado`: Restringido estrictamente a los valores del ciclo de vida (`enum: ['comprada', 'devuelta']`), impidiendo estados incongruentes.

---

## 4. Documentación de Endpoints y Pruebas (Texto Plano)

Todas las pruebas corresponden a ejecuciones HTTP reales contra la API activa, con salida en texto plano sin el uso de capturas de pantalla ni Postman.

La [ejecución de integración](EVIDENCIA.txt) incluye el alta de productos con `POST /api/products`. La ruta requiere JSON y un JWT de administrador. El registro público asigna `client` aunque el cuerpo solicite `admin`. El alta devuelve 403 para ese cliente y 201 tras asignar el rol en la base e iniciar sesión de nuevo.

### 4.1. Registro de Usuario (Exitoso)
- **Endpoint:** `POST /api/auth/register`
- **Headers Requeridos:** `{"Content-Type": "application/json"}`
- **Request Payload (Cuerpo de la petición):**
```json
{
  "nombre": "Cliente de prueba",
  "email": "demo-c76821af7c10@example.com",
  "password": "Solo-Pruebas-2026"
}
```
- **Response Payload (Respuesta del servidor):**
```text
HTTP 201 Created
```
```json
{
  "usuario": {
    "id": "6afb432978c547576ed3e667",
    "nombre": "Cliente de prueba",
    "email": "demo-c76821af7c10@example.com"
  }
}
```

### 4.2. Registro de Usuario (Conflicto por Email Duplicado)
- **Endpoint:** `POST /api/auth/register`
- **Headers Requeridos:** `{"Content-Type": "application/json"}`
- **Request Payload (Cuerpo de la petición):**
```json
{
  "nombre": "Cliente de prueba",
  "email": "demo-c76821af7c10@example.com",
  "password": "Solo-Pruebas-2026"
}
```
- **Response Payload (Respuesta del servidor):**
```text
HTTP 409 Conflict
```
```json
{
  "error": "El registro ya existe."
}
```

### 4.3. Inicio de Sesión (Credenciales Incorrectas)
- **Endpoint:** `POST /api/auth/login`
- **Headers Requeridos:** `{"Content-Type": "application/json"}`
- **Request Payload (Cuerpo de la petición):**
```json
{
  "email": "demo-c76821af7c10@example.com",
  "password": "Incorrecta123"
}
```
- **Response Payload (Respuesta del servidor):**
```text
HTTP 401 Unauthorized
```
```json
{
  "error": "Credenciales incorrectas."
}
```

### 4.4. Inicio de Sesión (Exitoso)
- **Endpoint:** `POST /api/auth/login`
- **Headers Requeridos:** `{"Content-Type": "application/json"}`
- **Request Payload (Cuerpo de la petición):**
```json
{
  "email": "demo-c76821af7c10@example.com",
  "password": "Solo-Pruebas-2026"
}
```
- **Response Payload (Respuesta del servidor):**
```text
HTTP 200 OK
```
```json
{
  "token": "<JWT omitido>",
  "usuario": {
    "id": "6afb432978c547576ed3e667",
    "nombre": "Cliente de prueba",
    "email": "demo-c76821af7c10@example.com"
  }
}
```

### 4.5. Consulta de Catálogo de Productos (Público)
- **Endpoint:** `GET /api/products`
- **Headers Requeridos:** Ninguno
- **Request Payload (Cuerpo de la petición):** `(sin cuerpo)`
- **Response Payload (Respuesta del servidor):**
```text
HTTP 200 OK
```
```json
{
  "moneda": "MXN",
  "productos": [
    {
      "_id": "6afb432978c547576ed3e663",
      "sku": "HUE-002",
      "nombre": "Pelota de goma",
      "categoria": "juguetes",
      "precioCentavos": 8900,
      "stock": 12
    }
  ]
}
```

### 4.6. Crear Orden (Falla por Ausencia de Token)
- **Endpoint:** `POST /api/orders`
- **Headers Requeridos:** `{"Content-Type": "application/json"}`
- **Request Payload (Cuerpo de la petición):**
```json
{
  "items": [
    {
      "producto": "6afb432978c547576ed3e663",
      "cantidad": 2
    }
  ]
}
```
- **Response Payload (Respuesta del servidor):**
```text
HTTP 401 Unauthorized
```
```json
{
  "error": "Token ausente, inválido o vencido."
}
```

### 4.7. Crear Orden (Falla por Stock Insuficiente y Reversión)
- **Endpoint:** `POST /api/orders`
- **Headers Requeridos:** `{"Content-Type": "application/json", "Authorization": "Bearer <JWT omitido>"}`
- **Request Payload (Cuerpo de la petición):**
```json
{
  "items": [
    { "producto": "6afb432978c547576ed3e663", "cantidad": 2 },
    { "producto": "6afb432978c547576ed3e664", "cantidad": 2 }
  ]
}
```
- **Response Payload (Respuesta del servidor):**
```text
HTTP 409 Conflict
```
```json
{
  "error": "Stock insuficiente."
}
```
*(Nota técnica: el sistema aplicó rollback atómico de la transacción, preservando intacto el stock de todos los artículos pedidos).*

### 4.8. Crear Orden (Exitosa con Precios del Servidor)
- **Endpoint:** `POST /api/orders`
- **Headers Requeridos:** `{"Content-Type": "application/json", "Authorization": "Bearer <JWT omitido>"}`
- **Request Payload (Cuerpo de la petición):**
```json
{
  "items": [
    {
      "producto": "6afb432978c547576ed3e663",
      "cantidad": 2,
      "precioCentavos": 1
    }
  ]
}
```
*(Nota: el cliente intentó enviar `precioCentavos: 1`, pero el servidor ignora el precio del cliente y consulta el precio oficial de la base de datos).*
- **Response Payload (Respuesta del servidor):**
```text
HTTP 201 Created
```
```json
{
  "orden": {
    "usuario": "6afb432978c547576ed3e667",
    "items": [
      {
        "producto": "6afb432978c547576ed3e663",
        "nombre": "Pelota de prueba 1",
        "cantidad": 2,
        "precioCentavos": 8900
      }
    ],
    "totalCentavos": 17800,
    "estado": "comprada",
    "_id": "6afb432a78c547576ed3e674",
    "createdAt": "2026-11-16T17:53:46.501Z",
    "updatedAt": "2026-11-16T17:53:46.501Z",
    "__v": 0
  }
}
```

### 4.9. Devolver Orden (Falla por Orden Ajena o No Encontrada)
- **Endpoint:** `PATCH /api/orders/6afb432a78c547576ed3e674/return`
- **Headers Requeridos:** `{"Authorization": "Bearer <JWT de otro usuario>"}`
- **Request Payload (Cuerpo de la petición):** `(sin cuerpo)`
- **Response Payload (Respuesta del servidor):**
```text
HTTP 404 Not Found
```
```json
{
  "error": "Orden no encontrada."
}
```

### 4.10. Devolver Orden (Exitosa con Reposición de Stock)
- **Endpoint:** `PATCH /api/orders/6afb432a78c547576ed3e674/return`
- **Headers Requeridos:** `{"Authorization": "Bearer <JWT del propietario>"}`
- **Request Payload (Cuerpo de la petición):** `(sin cuerpo)`
- **Response Payload (Respuesta del servidor):**
```text
HTTP 200 OK
```
```json
{
  "orden": {
    "_id": "6afb432a78c547576ed3e674",
    "usuario": "6afb432978c547576ed3e667",
    "items": [
      {
        "producto": "6afb432978c547576ed3e663",
        "nombre": "Pelota de prueba 1",
        "cantidad": 2,
        "precioCentavos": 8900
      }
    ],
    "totalCentavos": 17800,
    "estado": "devuelta",
    "createdAt": "2026-11-16T17:53:46.501Z",
    "updatedAt": "2026-11-16T17:53:47.256Z",
    "__v": 0,
    "devueltaEn": "2026-11-16T17:53:47.256Z"
  }
}
```

### 4.11. Devolver Orden (Conflicto por Intento de Segunda Devolución)
- **Endpoint:** `PATCH /api/orders/6afb432a78c547576ed3e674/return`
- **Headers Requeridos:** `{"Authorization": "Bearer <JWT del propietario>"}`
- **Request Payload (Cuerpo de la petición):** `(sin cuerpo)`
- **Response Payload (Respuesta del servidor):**
```text
HTTP 409 Conflict
```
```json
{
  "error": "La orden ya fue devuelta."
}
```

---

## 5. Reflexión Técnica

### Gestión de Seguridad (Contraseñas y JWT):

1. **Hash de contraseñas:** Durante el registro (`POST /api/auth/register`), la contraseña del usuario nunca se persiste en texto plano; se procesa con la librería `bcryptjs` utilizando un factor de costo (*salt rounds*) de 12. Durante el inicio de sesión (`POST /api/auth/login`), se invoca `bcrypt.compare()` en tiempo constante, previniendo ataques de temporización (*timing attacks*). En el modelo `User`, el campo `passwordHash` se define con `select: false`, impidiendo que consultas comunes expongan el hash a otras capas de la aplicación.
2. **Generación y Verificación de JWT:** Tras un login exitoso, se genera un JSON Web Token firmado con el algoritmo criptográfico simétrico HMAC-SHA256 (`HS256`) utilizando una clave secreta obligatoria de alta entropía (mínimo 32 bytes). El token incorpora reclamos estándar (*claims*): `sub` (con el `id` del usuario), `iss` (`huella-tienda`), `aud` (`huella-api`) y una vigencia limitada (`exp: 1h`). El middleware `src/middleware/auth.js` verifica rigurosamente el esquema `Bearer`, valida la firma criptográfica y el vencimiento antes de conceder acceso a los controladores protegidos.

### Manejo de Transacciones y Errores:

1. **Deducción y Restauración de Stock:**
   - **Compra:** Al crear una orden (`purchase`), se inicia una sesión transaccional de MongoDB (`mongoose.connection.transaction`). Para cada artículo solicitado, se ejecuta una operación atómica `Product.findOneAndUpdate` exigiendo que el stock disponible en la base de datos sea mayor o igual a la cantidad requerida (`{ stock: { $gte: cantidad } }`) y decrementando el inventario en ese instante (`{ $inc: { stock: -cantidad } }`). Si cualquiera de los productos solicitados carece de stock suficiente, se aborta la transacción completa (*rollback* automático de MongoDB), garantizando que ningún producto quede descontado de forma parcial. Los precios totales se calculan directamente a partir de los datos leídos de la base de datos, desestimando cualquier valor manipulado enviado por el cliente.
   - **Devolución:** En la devolución (`returnOrder`), una transacción atómica actualiza el estado de la orden de `comprada` a `devuelta` e incrementa nuevamente el stock de cada artículo devuelto (`$inc: { stock: item.cantidad }`). El filtro condicional `{ _id: id, estado: 'comprada' }` garantiza idempotencia frente a solicitudes concurrentes, bloqueando de raíz cualquier intento de devolución duplicada con un código HTTP 409.
2. **Control Centralizado de Errores:**
   - Se implementa la clase personalizada `HttpError` que desacopla la lógica de negocio de la respuesta HTTP.
   - Se distinguen con precisión los códigos de respuesta: datos de entrada inválidos o mal formados (400 Bad Request), credenciales o token no válido/ausente (401 Unauthorized), recursos inexistentes o pertenecientes a otros usuarios (404 Not Found), colisiones de inventario o estado (409 Conflict) y fallos imprevistos del servidor (500 Internal Server Error).
   - Se capturan y formatean los errores propios del motor de base de datos como duplicados de clave única (`E11000`) y validaciones de esquema (`ValidationError`), asegurando respuestas consistentes en JSON.
