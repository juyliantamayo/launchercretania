# Changelog Técnico — Variante Microsoft Store
## Lucerion Launcher · Store certification fixes

Este documento resume todos los cambios implementados para preparar la build de Microsoft Store.
Organizado por módulo. Indica claramente qué afecta solo a Store, qué también afecta a standalone.

---

## 1. main.js

### `STORE_BUILD` constant _(solo Store)_
- **Qué**: nueva constante booleana que detecta si el launcher fue compilado para Store
- **Cómo**: lee `require('./package.json').storeBuild`; el valor `true` se inyecta via `extraMetadata` en `electron-builder.store.json`
- **Impacto**: es el switch principal de todos los comportamientos diferenciados
- **Riesgo regresión**: ninguno si `storeBuild` no está en `package.json` (standalone), flag queda `false`

### Self-update desactivado en Store _(solo Store)_
- **`scheduleLauncherReplacementOnQuit`**: sale inmediatamente si `STORE_BUILD`
- **`checkLauncherAutoUpdate`**: emite `status: "store-managed"` y retorna inmediatamente si `STORE_BUILD`
- **IPC `apply-launcher-update`**: devuelve `{ ok: false, reason: "store-managed" }` si `STORE_BUILD`
- **Por qué**: en Microsoft Store, el ejecutable vive en un sandbox y no puede reemplazarse a sí mismo. La actualización del launcher la gestiona la tienda.
- **Impacto standalone**: ninguno — las rutas de código son independientes

### User mods desactivados en Store _(solo Store)_
- **`get-optional-mods` IPC**: cuando `STORE_BUILD`, `userMods` devuelve `[]`
- **`pick-and-upload-user-mod` IPC**: devuelve `{ ok: false, reason: "not-available-in-store" }` si `STORE_BUILD`
- **`delete-user-mod` IPC**: devuelve `{ ok: false, reason: "not-available-in-store" }` si `STORE_BUILD`
- **`launch` IPC**: `userModIds` forzado a `[]` si `STORE_BUILD`, por lo que ningún JAR de usuario se copia
- **Por qué**: la certificación requiere que la app distribuja solo contenido oficial. Los JARs de usuario son código arbitrario.
- **Impacto standalone**: ninguno

### `get-app-flags` IPC nuevo _(ambas builds)_
- **Qué**: nuevo handler que expone `{ storeBuild, appVersion }` al renderer
- **Por qué**: el renderer necesita saber si está en modo Store para adaptar la UI
- **Riesgo**: ninguno — canal de solo lectura sin efectos secundarios

### Normalización de errores en `login-microsoft` IPC _(ambas builds)_
- **Qué**: el catch ahora siempre lanza `new Error(msg)` con mensaje legible
- **Por qué**: el throw de un objeto arbitrario se serializa como `[object Object]` en el renderer. Electron serializa `Error` correctamente.
- **Riesgo regresión**: bajo — mejora el flujo fallido, el flujo exitoso no cambia

### Rutas documentadas en bloque de constantes _(ambas builds, solo documentación)_
- **Qué**: tabla de comentarios que enumera todas las rutas persistentes y su disponibilidad en Store vs standalone
- **Impacto**: ninguno en runtime

---

## 2. auth.js

### Separación de estrategia de login _(ambas builds)_
- **`loginMicrosoftStandalone()`**: renombrada internamente; es la implementación actual mejorada
- **`loginMicrosoftStore()`**: nueva función; actualmente delega a standalone. Namespace separado para futura adaptación sin riesgo de regresión.
- **`loginMicrosoft()`**: nuevo selector que elige la estrategia según `STORE_BUILD`
- **Por qué**: si la certificación vuelve a rechazar el flujo OAuth, la estrategia Store puede cambiar (MSAL, protocolo ms-xboxlive, etc.) sin tocar standalone
- **Riesgo regresión**: muy bajo — el flujo funcional es idéntico al anterior

### Logs detallados en flujo OAuth _(ambas builds)_
- **Qué**: `console.log` en cada etapa: creación del link, apertura de ventana, cada evento de navegación/redirect, obtención del código, llamadas a `authManager.login()` y `xboxManager.getMinecraft()`
- **Por qué**: el diagnóstico del error anterior era imposible sin estos logs
- **Nuevos eventos escuchados**: `will-navigate`, `did-navigate` (además de los ya existentes `will-redirect` y `did-finish-load`)
- **Riesgo regresión**: ninguno — solo logging

### Errores diferenciados _(ambas builds)_
- **Qué**: función interna `tryExtractCode()` que distingue:
  - Código OAuth válido → resolve
  - Error explícito del proveedor (ej: `access_denied`) → reject con mensaje humano
  - URL de redirección intermedia → ignorar
- **Mensajes diferenciados también para**: timeout 120s, ventana cerrada por usuario, error en `authManager.login()`, error en `xboxManager.getMinecraft()`
- **Impacto**: el renderer nunca recibe `[object Object]` si `main.js` normaliza correctamente
- **Riesgo regresión**: muy bajo

---

## 3. package.json

### Scripts nuevos _(ambas builds)_
- `build:standalone`: alias explícito del anterior `build:win` — build portable
- `build:store`: nuevo script que usa `electron-builder.store.json`
- **Impacto**: `build:win` se mantiene para compatibilidad con pipelines existentes

---

## 4. electron-builder.store.json (nuevo)

- **Qué**: configuración separada para el target Store (MSIX/AppX)
- **Contenido clave**:
  - `extraMetadata.storeBuild: true` → inyecta el flag en package.json del paquete
  - Target `appx` con metadatos de identidad para Partner Center
  - Output en `dist/store/` para no mezclar con portables standalone
  - `appx.assets: "store-assets"` → directorio de assets visuales requeridos por la tienda
- **Campos que requieren datos reales**: `identityName`, `publisherDisplayName`, `publisher`

---

## 5. preload.js

### Canal `get-app-flags` añadido _(ambas builds)_
- **Qué**: incluido en la whitelist `INVOKE_CHANNELS` del context bridge
- **Impacto**: el renderer puede obtener flags de build de forma segura vía IPC

---

## 6. renderer/state.js

### Campo `storeBuild` en estado global _(ambas builds)_
- **Qué**: `S.storeBuild = false` añadido al estado inicial; se popula en el init con `loadAppFlags()`
- **Impacto**: todos los módulos de UI pueden leer `S.storeBuild` para adaptar comportamiento

---

## 7. renderer/data.js

### `loadAppFlags()` nueva función _(ambas builds)_
- **Qué**: llama a `get-app-flags` y popula `S.storeBuild`
- **Por qué**: centraliza la carga del flag para que `app.js` lo llame en la secuencia de init

---

## 8. renderer/app.js

### `loadAppFlags()` llamada en init _(ambas builds)_
- **Qué**: primera llamada en `init()` antes de cargar settings y cuentas
- **Por qué**: garantiza que `S.storeBuild` está disponible para todos los módulos de UI desde el inicio

---

## 9. renderer/ui/optmods.js

### Botón de upload JAR oculto en Store _(solo Store)_
- **Qué**: `canUpload = !S.storeBuild && Boolean(p && p.allowUserMods)`
- **Por qué**: aunque el IPC está bloqueado, la UI también debe reflejar que la función no está disponible
- **Impacto standalone**: ninguno — la condición `allowUserMods` del manifest sigue funcionando igual

---

## 10. renderer/events.js

### Mensajes de error mejorados _(ambas builds)_
- **Login**: "Login fallido: {mensaje}" + log en consola
- **Launch**: "Error al lanzar: {mensaje}" + log en consola
- **`store-managed` en launcher-update-status**: oculta el banner sin mostrar error

---

## 11. scripts/build-store.ps1 (nuevo)

- Script PowerShell documentado para compilar la variante Store
- Verifica prerequisitos, limpia build anterior, ejecuta `npm run build:store`

---

## 12. QA-CHECKLIST-STORE.md (nuevo)

- Checklist de 30+ puntos organizada por prioridad
- Distingue qué tests son automatizables y cuáles requieren tests manuales

---

## Resumen de riesgos mitigados

| Riesgo anterior                              | Mitigación aplicada                             |
|---------------------------------------------|-------------------------------------------------|
| Login devuelve `[object Object]`            | Normalización en main.js + mensajes diferenciados en auth.js |
| Self-update incompatible con Store sandbox  | Desactivado con `STORE_BUILD` guard             |
| User mods arbitrarios rechazan certificación| Desactivados en IPC y en UI con `STORE_BUILD`  |
| Sin diagnóstico de fallos OAuth             | Logs detallados en cada etapa del flujo         |
| Build única para todo canal                 | Variante Store separada con config independiente |
| Assets visuales genéricos de Electron       | Documentados en QA checklist + store-assets/    |

## Posibles regresiones a vigilar

- `S.storeBuild` es `false` por defecto → standalone no afectado, pero si `loadAppFlags()` falla silenciosamente en Store, el flag quedaría `false` y las funciones no se desactivarían. Verificar con log al inicio.
- `loginMicrosoftStore()` actualmente delega a standalone — si el flujo standalone falla en Store, habrá que implementar la estrategia nativa. Ver comentarios en `auth.js`.
- Los campos `identityName` y `publisher` en `electron-builder.store.json` deben coincidir exactamente con el Partner Center — un mismatch provoca rechazo en certificación.
