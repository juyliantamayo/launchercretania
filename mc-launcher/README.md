# Cretania Launcher

Launcher privado de Minecraft para el servidor Cretania.

## Requisitos

- Node.js 18+
- npm

## Configurar

1. **Edita `updater.js`** — cambia `MANIFEST_URL` por la URL raw de tu `manifest.json` en GitHub Releases:
   ```
   https://github.com/TU_USUARIO/my-modpack/releases/latest/download/manifest.json
   ```

2. **(Opcional)** Pon tu icono en `assets/icon.ico`

## Ejecutar en desarrollo

```bash
npm start
```

## Compilar para Windows (portable .exe)

```bash
npm run build:win
```

El `.exe` queda en `dist/CretaniaLauncher.exe`.

---

## Flujo del launcher

1. El usuario inicia sesión (Microsoft o nombre offline)
2. El launcher descarga el `manifest.json` desde GitHub Releases
3. Compara SHA1 de mods locales vs remotos
4. Descarga solo los mods que cambiaron (descargas paralelas, máx. 3)
5. Lanza Minecraft con Fabric 1.20.1

---

## Agregar un mod nuevo al modpack

1. Sube el `.jar` a `my-modpack/mods/`
2. Obtén el SHA1:
   ```
   certutil -hashfile mods/tunuevomod.jar SHA1
   ```
3. Agrega la entrada en `my-modpack/manifest.json`
4. Crea un nuevo Release en GitHub con `manifest.json` y el jar
