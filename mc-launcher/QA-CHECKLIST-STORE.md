# QA Checklist — Microsoft Store Submission
## Lucerion Launcher — pre-submission validation

Ejecutar antes de cada resubida a Partner Center.
✅ = teseable automáticamente | 🔲 = test manual | ⚠ = crítico

---

## Prioridad 1 — Bloquean certificación

### Build y empaquetado
- [ ] ⚠ `npm run build:store` termina sin errores
- [ ] ⚠ El archivo `dist/store/LucerionLauncher-Store.appx` existe y tiene tamaño > 0
- [ ] ⚠ El paquete está firmado con el mismo publisher que el certificado del Partner Center
- [ ] ⚠ `package.json` dentro del paquete tiene `storeBuild: true` (verificar con 7-Zip → resources/)

### Assets visuales (Prompt 9)
El paquete AppX requiere los siguientes assets en la carpeta `store-assets/`:
electron-builder los referencia automáticamente al compilar con el target `appx`.

| Asset                          | Tamaño         | Ruta en store-assets/           | Estado  |
|-------------------------------|----------------|---------------------------------|---------|
| Logo cuadrado grande           | 300×300 px     | StoreLogo.png                   | 🔲 Pendiente |
| Ícono de aplicación (50×50)    | 50×50 px       | Square44x44Logo.png             | 🔲 Pendiente |
| Ícono de aplicación (150×150)  | 150×150 px     | Square150x150Logo.png           | 🔲 Pendiente |
| Splash / wide tile (310×150)   | 310×150 px     | Wide310x150Logo.png             | 🔲 Pendiente |
| Tile grande (310×310)          | 310×310 px     | Square310x310Logo.png           | 🔲 Pendiente |
| Icono de tarea (44×44)         | 44×44 px       | Square44x44Logo.targetsize-44.png | 🔲 Pendiente |
| Icono de escritorio (.ico)     | multi-res       | (ya existe: icon.ico)           | ✅ Existe    |

> **Regla**: ningún asset puede ser el ícono genérico de Electron (azul con rayo).
> Verificar visualmente en el emulador de tiles de Windows antes de subir.

Referencias en el pipeline:
- `electron-builder.store.json` → campo `appx.assets`
- Electron-builder resuelve los assets automáticamente si están en la carpeta indicada

### Login Microsoft
- [ ] ⚠ El botón "Añadir cuenta" abre la ventana OAuth de Microsoft
- [ ] ⚠ El login completa sin mostrar `[object Object]`
- [ ] ⚠ Si se cierra la ventana, el mensaje es "Inicio de sesión cancelado…" (no error genérico)
- [ ] ⚠ Si hay timeout, el mensaje es "Tiempo de espera agotado…"
- [ ] ⚠ La cuenta aparece en la lista tras el login exitoso

### Sincronización de modpack
- [ ] ⚠ Al lanzar con cuenta válida, el launcher sincroniza mods sin errores
- [ ] ⚠ Los mods del manifest se descargan correctamente
- [ ] ⚠ El directory del juego se crea en la ruta correcta

### Lanzamiento del juego
- [ ] ⚠ El juego inicia con la cuenta seleccionada
- [ ] ⚠ Java se detecta o se instala automáticamente sin intervención del usuario
- [ ] ⚠ El juego se cierra y el launcher vuelve al estado normal

---

## Prioridad 2 — Funcionalidad principal

### Instalación limpia
- [ ] 🔲 Instalación del AppX en una VM limpia (sin .NET ni Java previo)
- [ ] 🔲 El launcher abre sin errores tras la instalación
- [ ] 🔲 No se muestran dialogs de UAC al primer inicio

### Apertura inicial
- [ ] 🔲 La UI carga completamente en < 5 segundos
- [ ] 🔲 La grilla de modpacks muestra al menos un modpack
- [ ] 🔲 No hay errores en la consola de DevTools (si disponible)

### Persistencia de cuenta
- [ ] 🔲 Cerrar y reabrir el launcher mantiene la cuenta logueada
- [ ] 🔲 El token se refresca automáticamente sin requerir login manual

### Self-update desactivado en Store
- [ ] ✅ `STORE_BUILD === true` dentro del paquete (verificar con log al inicio)
- [ ] 🔲 No aparece ningún banner de actualización del launcher
- [ ] 🔲 El handler `apply-launcher-update` devuelve `{ ok: false, reason: "store-managed" }`

### User mods desactivados en Store
- [ ] ✅ El botón "Subir JAR" no aparece en la UI (ni siquiera si allowUserMods:true)
- [ ] ✅ `pick-and-upload-user-mod` devuelve `{ ok: false, reason: "not-available-in-store" }`
- [ ] ✅ En el lanzamiento, ningún JAR de usuario se copia a la carpeta mods

---

## Prioridad 3 — Resiliencia y UX

### Comportamiento sin conexión
- [ ] 🔲 Con la red desconectada, el launcher abre y muestra mensaje legible
- [ ] 🔲 Con manifest en caché, el launcher puede intentar lanzar sin network
- [ ] 🔲 Los errores de red muestran mensajes útiles (no stack traces)

### Reapertura del launcher
- [ ] 🔲 Abrir el launcher por segunda vez (con instancia ya abierta) no abre dos ventanas
- [ ] 🔲 Si el juego está corriendo, el botón "Jugar" muestra estado correcto

### Mensajes de error
- [ ] 🔲 Login con cuenta sin licencia de Minecraft → mensaje claro (no `[object Object]`)
- [ ] 🔲 Fallo de descarga de mod → mensaje en consola, el launcher no queda colgado
- [ ] 🔲 Fallo de instalación de Fabric → mensaje en consola con nombre del loader

---

## Automatizable vs manual

| Categoría                   | Automatizable | Manual recomendado |
|-----------------------------|---------------|-------------------|
| storeBuild flag en paquete  | ✅ script      | –                 |
| IPC user-mods bloqueados    | ✅ jest mock   | –                 |
| Self-update no se ejecuta   | ✅ jest mock   | –                 |
| Login OAuth completo        | –             | ✅ siempre         |
| Assets visuales             | –             | ✅ siempre         |
| Instalación limpia en VM    | –             | ✅ siempre         |
| Comportamiento offline      | –             | ✅ siempre         |
| Certificación Partner Center| –             | ✅ siempre         |
