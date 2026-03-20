# Lucerion Backend

Backend para **Lucerion Launcher** que reemplaza el manifiesto de GitHub Releases con una API propia respaldada en MongoDB. Drop-in compatible: el launcher existente **no necesita cambios** — solo apunta su `MANIFEST_URL` a este servidor.

---

## Requisitos

- Node.js 18+
- MongoDB 6+ (local o Atlas)

---

## Instalación

```bash
cd lucerion-backend
npm install
cp .env.example .env
```

Edita `.env` con tus valores:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/lucerion
JWT_SECRET=una-clave-muy-larga-y-aleatoria
MANIFEST_SECRET=cretania-manifest-2026-change-this-secret   # DEBE coincidir con la del launcher
PUBLIC_BASE_URL=https://tudominio.com                        # URL pública del servidor
UPLOADS_DIR=./uploads
```

> ⚠️ `MANIFEST_SECRET` debe ser idéntica a la variable `CRETANIA_MANIFEST_SECRET` en el launcher.

---

## Arrancar el servidor

```bash
# Producción
npm start

# Desarrollo (con hot-reload)
npm run dev
```

Al iniciar por primera vez se crean automáticamente:
- Admin por defecto: `admin` / `admin1234` — **cámbiala inmediatamente**
- LauncherMeta vacío
- Modpack `cretania` vacío

---

## Paso 1: Importar el modpack existente de GitHub

Si ya tienes un `manifest.json` con los mods actuales, impórtalo así:

```bash
# Asegúrate de que los JARs estén en la misma carpeta que manifest.json
node src/cli/admin.js import-manifest ../my-modpack/manifest.json
```

Esto:
1. Importa todos los modpacks a MongoDB
2. Copia los JARs disponibles a `uploads/`

---

## Paso 2: Conectar el launcher

En `mc-launcher/updater.js`, cambia la línea 25:

```js
// ANTES (GitHub):
"https://github.com/juyliantamayo/launchercretania/releases/download/modpack-v1.0.0/manifest.enc"

// DESPUÉS (tu backend):
"https://tudominio.com/manifest.enc"
```

O bien, setea la variable de entorno al lanzar Electron:
```
MANIFEST_URL=https://tudominio.com/manifest.enc
```

---

## CLI — Gestión de mods

```bash
# Ver todos los modpacks
node src/cli/admin.js list-modpacks

# Ver mods de un modpack
node src/cli/admin.js list-mods cretania

# Agregar un mod nuevo
node src/cli/admin.js add-mod cretania ruta/al/NuevoMod-1.0.0.jar

# Agregar mod opcional
node src/cli/admin.js add-optional cretania ruta/al/OptionalMod.jar

# Eliminar un mod (por nombre de archivo o ID)
node src/cli/admin.js remove-mod cretania NombreMod-1.0.0.jar

# Forzar versión
node src/cli/admin.js set-version cretania 1.2.0

# Crear admin adicional
node src/cli/admin.js create-admin julieta miContraseña

# Cambiar contraseña
node src/cli/admin.js change-password admin nuevaContraseña
```

---

## API REST (admin)

### Autenticación

```http
POST /admin/login
Content-Type: application/json

{ "username": "admin", "password": "admin1234" }
```

Devuelve `{ "token": "..." }`. Todos los endpoints `/admin/*` requieren:
```
Authorization: Bearer <token>
```

### Subir mod nuevo

```http
POST /admin/mods/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

jar=<archivo.jar>
modpackId=cretania
optional=false
patchNote=Descripción del cambio (opcional)
```

### Reemplazar mod (actualización de versión)

```http
POST /admin/mods/replace
Authorization: Bearer <token>
Content-Type: multipart/form-data

jar=<mod-nuevo-1.0.1.jar>
modpackId=cretania
oldFile=mod-antiguo-1.0.0.jar
patchNote=Mod actualizado (opcional)
deleteOld=true
```

### Eliminar mod

```http
DELETE /admin/mods/cretania/<modId>
Authorization: Bearer <token>
```

### Actualizar metadatos del launcher

```http
PUT /admin/launcher
Authorization: Bearer <token>
Content-Type: application/json

{ "version": "1.0.2", "releaseApiUrl": "https://..." }
```

---

## Endpoints públicos (consumidos por el launcher)

| URL | Descripción |
|-----|-------------|
| `GET /manifest.json` | Manifiesto en claro (formato v2) |
| `GET /manifest.enc` | Manifiesto cifrado AES-256-GCM |
| `GET /files/:filename` | Descarga de un JAR |
| `GET /health` | Estado del servidor y BD |

---

## Estructura del proyecto

```
lucerion-backend/
├── src/
│   ├── server.js              ← Entrada principal
│   ├── models/
│   │   ├── Modpack.js         ← Schema MongoDB del modpack
│   │   ├── LauncherMeta.js    ← Metadatos del launcher
│   │   └── Admin.js           ← Usuarios admin
│   ├── middleware/
│   │   └── auth.js            ← JWT (sign, requireAuth)
│   ├── routes/
│   │   ├── manifest.js        ← Endpoints públicos del launcher
│   │   └── admin/
│   │       ├── auth.js        ← Login
│   │       ├── mods.js        ← CRUD de mods
│   │       ├── modpacks.js    ← CRUD de modpacks
│   │       └── launcher.js    ← Metadatos del launcher
│   ├── utils/
│   │   ├── crypto.js          ← Cifrado AES-256-GCM (compatible con manifest-crypto.js)
│   │   └── helpers.js         ← SHA1, bumpPatch, etc.
│   └── cli/
│       └── admin.js           ← CLI de administración
├── uploads/                   ← JARs almacenados (creada automáticamente)
├── .env.example
├── .gitignore
└── package.json
```
