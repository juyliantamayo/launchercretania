# Changelog — Lucerion Launcher

---

## v1.1.0 (2026-03-21) — English

### New — Download modpack button
Added a download button directly on the launcher's main screen. Previously, mods were only downloaded automatically when launching the game for the first time; now users can start the download at any time without opening Minecraft.

### Fix — Microsoft login errors
Fixed several issues that prevented signing in with Microsoft accounts:
- The generic `[object Object]` error no longer appears — the launcher now shows the actual error message.
- If the session token is still valid, the launcher reuses it instead of unnecessarily opening a new login window.
- Errors such as "expired account" or "access denied" now display a readable message on screen.

### Fix — Errors when launching a Minecraft instance
Fixed issues that prevented the game from launching in certain cases:
- Selecting a drive root (e.g. `D:\`) as the game directory caused a permissions error. The launcher now automatically appends a subfolder.
- The **Stop** button now correctly terminates the Java process instead of leaving it running in the background.

---

## v1.1.0 (2026-03-21) — Español

---

## v1.1.0 (2026-03-21)

### Nuevo — Botón para descargar el modpack
Se añadió un botón de descarga del modpack directamente en la pantalla principal del launcher. Antes era necesario lanzar el juego al menos una vez para que los mods se descargaran automáticamente; ahora el usuario puede iniciar la descarga en cualquier momento sin abrir Minecraft.

### Fix — Errores de login con Microsoft
Se corrigieron varios errores que impedían iniciar sesión correctamente con cuentas Microsoft:
- El error genérico `[object Object]` ya no aparece — el launcher muestra ahora el mensaje real del fallo.
- Si el token de sesión sigue siendo válido, el launcher lo reutiliza en lugar de forzar una nueva ventana de login innecesariamente.
- Los errores de tipo "cuenta caducada" o "acceso denegado" muestran un mensaje legible en pantalla.

### Fix — Errores al abrir una instancia de Minecraft
Se corrigieron problemas que impedían lanzar el juego en ciertos casos:
- Al seleccionar una carpeta raíz de unidad (ej. `D:\`) como directorio del juego, el launcher fallaba con un error de permisos. Ahora añade automáticamente una subcarpeta.
- El botón **Detener** ahora cierra el proceso de Java correctamente en lugar de dejarlo activo en segundo plano.
