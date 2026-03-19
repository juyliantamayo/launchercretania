# store-assets — Assets visuales requeridos para el paquete MSIX

Esta carpeta debe contener los assets definitivos antes de ejecutar `npm run build:store`.
electron-builder los incluye automáticamente al compilar el target `appx`.

## Assets requeridos

| Archivo                                  | Tamaño      | Uso en Windows                              |
|------------------------------------------|-------------|----------------------------------------------|
| `StoreLogo.png`                          | 50×50 px    | Ícono en Microsoft Store                     |
| `Square44x44Logo.png`                    | 44×44 px    | Barra de tareas / escritorio                 |
| `Square44x44Logo.targetsize-44.png`      | 44×44 px    | Ícono de shortcuts y accesos directos        |
| `Square150x150Logo.png`                  | 150×150 px  | Tile mediano en menú Inicio                  |
| `Wide310x150Logo.png`                    | 310×150 px  | Tile ancho en menú Inicio                    |
| `Square310x310Logo.png`                  | 310×310 px  | Tile grande en menú Inicio                   |
| `SplashScreen.png`                       | 620×300 px  | Pantalla de carga inicial de la app          |

## Reglas obligatorias

- **Ningún asset puede ser el ícono genérico de Electron** (azul con rayo).
- Todos los assets deben representar de forma única a Lucerion Launcher.
- Fondo recomendado: `#1a1a2e` o transparente según el tipo de asset.
- Formato exclusivamente PNG.

## Cómo proceder

1. El equipo de diseño entrega los archivos con los nombres exactos de la tabla anterior.
2. Colocarlos directamente en esta carpeta (`mc-launcher/store-assets/`).
3. Verificar visualmente en el emulador de tiles de Windows (Settings → Personalization → Start) antes de subir.
4. Ejecutar `npm run build:store` y revisar que el AppX incluya los assets correctos.

## Referencia

Configuración en: `electron-builder.store.json` → `appx.assets: "store-assets"`
Checklist completa: `QA-CHECKLIST-STORE.md`
