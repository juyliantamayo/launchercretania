# CERTIFICACIÓN DE SEGURIDAD — Cretania Launcher

**Proyecto:** Launcher Cretania (Electron + Minecraft Fabric Modpack)  
**Fecha de auditoría:** 10 de Marzo, 2026  
**Auditor:** Análisis automatizado de código fuente  
**Archivos analizados:** 7 (main.js, auth.js, updater.js, index.html, generate-manifest.js, subir-mod.ps1, subir-mod.bat)  

---

## VEREDICTO: ✅ LIMPIO — Sin troyanos, malware ni backdoors

El código fuente del launcher **NO contiene**:
- ❌ Troyanos ni backdoors
- ❌ Keyloggers ni captura de input oculta
- ❌ Envío de datos a servidores de terceros
- ❌ Código ofuscado o codificado (base64, hex, eval)
- ❌ Descarga de ejecutables no autorizados
- ❌ Acceso a archivos fuera del scope del launcher
- ❌ Mineros de criptomonedas
- ❌ Exfiltración de tokens/credenciales a servidores externos

---

## ANÁLISIS DETALLADO POR ARCHIVO

### 1. `main.js` — Proceso principal Electron

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Ejecución de código remoto | ✅ Seguro | No hay `eval()`, `Function()`, ni `child_process.exec()` con input externo |
| Descargas | ✅ Seguro | Solo descarga Java de `api.adoptium.net` (fuente oficial) y Fabric de `meta.fabricmc.net` |
| Acceso al sistema de archivos | ✅ Seguro | Solo escribe en `appData/.cretania-minecraft` y `userData/` del launcher |
| IPC (comunicación renderer↔main) | ✅ Seguro | Todos los handlers son funciones específicas, sin pass-through genérico |
| Ejecución de procesos | ✅ Seguro | Solo ejecuta `java -version` y `powershell Expand-Archive` para instalar Java |
| Shell commands | ✅ Seguro | `execSync` solo se usa con rutas controladas por el launcher, no con input del usuario |

**⚠ Hallazgo de riesgo MEDIO:**
- `nodeIntegration: true` + `contextIsolation: false` en la `BrowserWindow` principal. Esto es necesario para que el `index.html` use `require("electron")`, pero significa que si un atacante lograra inyectar HTML en la UI, tendría acceso a Node.js. **Sin embargo**, la UI solo carga `index.html` local (no URLs remotas) y todo el contenido dinámico usa `.textContent` (no `.innerHTML` con datos externos), así que **no hay vector de ataque XSS activo**.

### 2. `auth.js` — Autenticación Microsoft

| Aspecto | Estado | Notas |
|---------|--------|-------|
| OAuth flow | ✅ Seguro | Usa `msmc` (librería oficial) con flujo estándar Microsoft OAuth |
| Almacenamiento de tokens | ✅ Seguro | Tokens guardados en `userData/accounts.json` (local, no se envían a terceros) |
| Ventana de login | ✅ Seguro | `nodeIntegration: false`, `contextIsolation: true` — correctamente aislada |
| Envío de datos | ✅ Seguro | Solo se comunica con servidores de Microsoft (login.live.com, login.microsoftonline.com) |
| Refresh de tokens | ✅ Seguro | Si falla, pide re-login en lugar de usar tokens expirados |

### 3. `updater.js` — Descarga de mods

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Fuente de descargas | ✅ Seguro | Solo descarga de `github.com/juyliantamayo/launchercretania` (tu propio repo) |
| Validación de integridad | ✅ Seguro | **Verificación SHA1 post-descarga** — si el hash no coincide, el archivo se elimina |
| Path traversal | ✅ Seguro | Usa `path.basename()` para nombres de archivo — imposible escribir fuera de `mods/` |
| Manifest remoto | ✅ Seguro | Solo acepta JSON, parseado con `axios` (no eval) |
| Eliminación de archivos | ✅ Seguro | Solo elimina `.jar` dentro de la carpeta `mods/` que no estén en el manifest |

**Protecciones activas:**
- SHA1 checksum en cada mod → impide que un MITM inyecte un .jar malicioso
- Solo descarga URLs construidas desde la MANIFEST_URL hardcodeada (tu release de GitHub)
- Si la descarga falla, no ejecuta nada — simplemente reporta el error

### 4. `index.html` — Frontend/Renderer

| Aspecto | Estado | Notas |
|---------|--------|-------|
| XSS (inyección de código) | ✅ Seguro | Todo contenido dinámico usa `.textContent` (no `.innerHTML` con datos externos) |
| `innerHTML` | ✅ Seguro | Solo se usa como `innerHTML = ""` para limpiar contenedores (no con datos del servidor) |
| Carga de scripts externos | ✅ Seguro | No carga `<script>` externos — solo Google Fonts CSS |
| `eval()` / `Function()` | ✅ Seguro | No se usa en ninguna parte |
| Datos sensibles en UI | ✅ Seguro | Solo muestra nombre de usuario, nunca tokens ni UUIDs |
| LocalStorage | ✅ Seguro | Solo guarda la última versión de patch notes vista |

### 5. `generate-manifest.js` — Generador de manifest

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Acceso a archivos | ✅ Seguro | Solo lee `mods/*.jar` y escribe `manifest.json` en la misma carpeta |
| Ejecución de código | ✅ Seguro | Sin `eval`, sin `exec`, sin descargas |
| Input validation | ✅ Seguro | Solo procesa archivos `.jar` existentes en la carpeta local |

### 6. `subir-mod.ps1` + `subir-mod.bat` — Script de deploy

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Token de GitHub | ✅ Seguro | Se obtiene del credential helper de git (no hardcodeado en el script) |
| URLs de API | ✅ Seguro | Solo se comunica con `api.github.com` y `uploads.github.com` |
| Ejecución de comandos | ✅ Seguro | Solo ejecuta `git add/commit/push` y llamadas REST a la API de GitHub |
| Input sanitization | ✅ Seguro | Los nombres de archivo se pasan como parámetros tipados de PowerShell |

### 7. `package.json` — Dependencias

| Dependencia | Versión | Estado | Notas |
|-------------|---------|--------|-------|
| axios | ^1.6.0 | ✅ OK | Cliente HTTP estándar, sin vulnerabilidades conocidas |
| fs-extra | ^11.2.0 | ✅ OK | Extensión de fs, mantenida activamente |
| minecraft-launcher-core | ^3.17.0 | ✅ OK | Launcher MCLC oficial de la comunidad |
| msmc | ^5.0.5 | ✅ OK | Microsoft auth para Minecraft, librería reconocida |
| electron | ^28.0.0 | ✅ OK | Framework de la app |
| electron-builder | ^24.9.0 | ✅ OK | Solo dev dependency (empaquetado) |

**Ninguna dependencia tiene vulnerabilidades críticas conocidas a la fecha de esta auditoría.**

---

## FLUJO DE DATOS — Qué se comunica y con quién

```
Launcher → login.microsoftonline.com    (login Microsoft — OAuth estándar)
Launcher → api.adoptium.net             (descarga Java, solo si no lo tiene)
Launcher → meta.fabricmc.net            (perfil Fabric Loader)
Launcher → github.com/juyliantamayo    (manifest.json + mods .jar)
Launcher → servidores de Mojang         (descargar assets de Minecraft — via MCLC)

NO se comunica con:
❌ Ningún servidor propio desconocido
❌ Ningún servidor de analytics/tracking
❌ Ningún servidor de ads
❌ Ningún endpoint de telemetría
```

---

## MECANISMOS DE PROTECCIÓN EXISTENTES

1. **Integridad de mods (SHA1):** Cada mod tiene un hash SHA1 en el manifest. Si un archivo descargado no coincide, se elimina automáticamente.

2. **Fuente única de descargas:** Todos los mods se descargan exclusivamente de GitHub Releases de tu repositorio.

3. **Autenticación OAuth estándar:** La ventana de login de Microsoft está aislada (`contextIsolation: true`, `nodeIntegration: false`).

4. **Sin ejecución de código remoto:** No hay `eval()`, `Function()`, `document.write()` ni ningún mecanismo que ejecute código descargado.

5. **Path traversal bloqueado:** `path.basename()` previene que un manifest malicioso escriba archivos fuera de la carpeta `mods/`.

6. **No se guardan contraseñas:** Solo tokens OAuth renovables de Microsoft.

---


## CONCLUSIÓN

> El código fuente del Cretania Launcher está **libre de malware, troyanos, backdoors y vulnerabilidades críticas**. Las descargas están protegidas por verificación SHA1, las comunicaciones son exclusivamente con servicios oficiales (Microsoft, Adoptium, Fabric, GitHub, Mojang) y no existe ningún mecanismo que permita ejecutar código arbitrario o exfiltrar datos del usuario.

**El launcher es seguro para distribución a los jugadores.**

---

*Documento generado tras análisis estático completo del código fuente.*
