# My Modpack

Modpack privado para Cretania.

## Cómo agregar un mod

1. Pon el `.jar` en `mods/`
2. Obtén el SHA1:
   ```
   certutil -hashfile mods/tunuevomod.jar SHA1
   ```
3. Agrega la entrada en `manifest.json`
4. Crea un nuevo **Release** en GitHub y sube `manifest.json` + el jar

---

El launcher descargará automáticamente los mods al iniciar.
