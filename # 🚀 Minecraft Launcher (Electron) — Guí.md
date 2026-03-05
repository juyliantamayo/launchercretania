# 🚀 Minecraft Launcher (Electron) — Guía Completa FREE

**Mods privados · 100 jugadores · Cumple EULA · Auto-update**

> Esta guía está diseñada para que puedas construir TODO con ayuda de Copilot, manteniendo costos en $0 y evitando problemas legales.

---

# ⚖️ Reglas de Oro (LEE PRIMERO)

✅ Puedes distribuir **mods y modpacks**
✅ Puedes tener **launcher propio**
✅ Puedes permitir **modo offline**

❌ NO distribuyas el cliente de Minecraft
❌ NO falsifiques sesiones premium
❌ NO vendas cuentas premium
❌ NO incluyas `.minecraft/versions` completo

---

# 🧱 Arquitectura Final

```
Electron Launcher
   ↓
manifest.json (GitHub Releases)
   ↓
Descarga diferencial de mods
   ↓
Verificación SHA1
   ↓
minecraft-launcher-core
   ↓
Servidor híbrido
```

---

# 📦 Paso 1 — Crear repo privado

1. Ve a GitHub
2. Crea repo privado:

```
my-modpack
```

3. Estructura inicial:

```
my-modpack/
 ├─ manifest.json
 ├─ mods/
 └─ README.md
```

---

# 📄 Paso 2 — Crear manifest.json

Copilot prompt sugerido:

```
Create a Minecraft modpack manifest with versioning and SHA1 verification.
```

### Ejemplo base

```json
{
  "version": "1.0.0",
  "minecraft": "1.20.1",
  "loader": "fabric",
  "mods": [
    {
      "id": "sessionguard",
      "file": "mods/sessionguard.jar",
      "sha1": "PUT_REAL_SHA1",
      "size": 123456
    }
  ]
}
```

---

## 🔧 Obtener SHA1 (Windows)

```bash
certutil -hashfile mods/sessionguard.jar SHA1
```

---

# 🚀 Paso 3 — Subir Release

1. Ve a **Releases**
2. Create release
3. Sube:

* manifest.json
* carpeta mods (o jars)

👉 GitHub será tu CDN gratis.

---

# 🖥️ Paso 4 — Crear launcher Electron

## Inicializar

```bash
mkdir mc-launcher
cd mc-launcher
npm init -y
npm install electron minecraft-launcher-core msmc axios fs-extra
```

---

## Estructura

```
launcher/
 ├─ main.js
 ├─ updater.js
 ├─ auth.js
 └─ package.json
```

---

# 🔐 Paso 5 — Login Microsoft (premium)

Copilot prompt:

```
Create Microsoft authentication using msmc for Minecraft launcher.
```

### auth.js (base)

```js
const msmc = require("msmc");

async function loginMicrosoft() {
  const result = await msmc.fastLaunch("electron");

  if (!result.profile) throw new Error("Login failed");

  return {
    access_token: result.profile.access_token,
    uuid: result.profile.id,
    name: result.profile.name
  };
}

module.exports = { loginMicrosoft };
```

---

# 🔄 Paso 6 — Updater diferencial (CLAVE)

Copilot prompt:

```
Create a differential updater that compares SHA1 hashes against a manifest and downloads missing mods.
```

---

### updater.js (base funcional)

```js
const axios = require("axios");
const fs = require("fs-extra");
const crypto = require("crypto");
const path = require("path");

const MANIFEST_URL = "PUT_YOUR_RAW_MANIFEST_URL";

function sha1File(file) {
  const data = fs.readFileSync(file);
  return crypto.createHash("sha1").update(data).digest("hex");
}

async function syncMods(gameDir) {
  const { data: manifest } = await axios.get(MANIFEST_URL);

  for (const mod of manifest.mods) {
    const localPath = path.join(gameDir, mod.file);

    let needsDownload = true;

    if (fs.existsSync(localPath)) {
      const localHash = sha1File(localPath);
      needsDownload = localHash !== mod.sha1;
    }

    if (needsDownload) {
      console.log("Downloading", mod.id);

      const url = `PUT_RELEASE_BASE_URL/${path.basename(mod.file)}`;

      const res = await axios.get(url, { responseType: "arraybuffer" });

      await fs.ensureDir(path.dirname(localPath));
      fs.writeFileSync(localPath, res.data);
    }
  }
}

module.exports = { syncMods };
```

---

# 🎮 Paso 7 — Lanzar Minecraft

Copilot prompt:

```
Launch Minecraft 1.20.1 Fabric using minecraft-launcher-core with custom game directory.
```

---

### main.js (simplificado)

```js
const { Client } = require("minecraft-launcher-core");
const { loginMicrosoft } = require("./auth");
const { syncMods } = require("./updater");

async function start() {
  const gameDir = "./.minecraft";

  await syncMods(gameDir);

  const auth = await loginMicrosoft();

  const launcher = new Client();

  launcher.launch({
    authorization: auth,
    root: gameDir,
    version: {
      number: "1.20.1",
      type: "release"
    },
    memory: {
      max: "4G",
      min: "2G"
    }
  });
}

start();
```

---

# 🧪 Paso 8 — Soporte no-premium (opcional)

Para cumplir EULA de forma segura:

✅ NO crees cuentas premium falsas
✅ NO falsifiques tokens

## Modo offline permitido

Copilot prompt:

```
Add offline mode fallback for Minecraft launcher when user is not premium.
```

Idea básica:

* Premium → Microsoft login
* No premium → username manual
* Servidor decide acceso

---

# 🛡️ Paso 9 — Servidor híbrido recomendado

**server.properties**

```
online-mode=false
```

Luego tu plugin/mod:

* Premium → verificado por sesión
* No premium → login requerido

(esto ya lo estás construyendo bien 😉)

---

# 🚀 Paso 10 — Build Electron

```bash
npm install electron-builder --save-dev
```

Copilot prompt:

```
Configure electron-builder for Windows portable launcher.
```

---

# 💸 Coste esperado

Para tu escala (~100 jugadores):

* GitHub Releases → GRATIS
* Electron → GRATIS
* Microsoft auth → GRATIS

👉 Total: **$0**

---

# 🧠 Checklist final

* [ ] manifest con SHA1
* [ ] updater diferencial
* [ ] Microsoft login
* [ ] offline fallback
* [ ] no redistribuir Minecraft
* [ ] repo privado

---

# 🔥 Cuando crezcas

Migra a:

* Cloudflare R2
* URLs firmadas
* anti-tamper

Pero **ahora no lo necesitas**.

---

---

## 🧩 Prompts mágicos para Copilot

Pégale esto cuando te atore:

```
Improve robustness and error handling
Add download progress events
Add retry logic with exponential backoff
Add parallel mod downloads with limit
Validate SHA1 after download
```

---

---

Si quieres el siguiente nivel, dime y te genero:

* 🧠 updater ULTRA rápido
* ⚡ descargas paralelas
* 🔐 anti-tamper básico
* 🎨 UI moderna Electron

y lo dejamos modo launcher profesional.
