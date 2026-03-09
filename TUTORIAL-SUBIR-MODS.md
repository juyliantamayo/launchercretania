# Tutorial: Subir un mod actualizado al modpack

## TL;DR — Uso rápido con el script

1. Copia el nuevo `.jar` a `my-modpack/mods/`
2. Borra (o deja) el `.jar` viejo en esa misma carpeta
3. Ejecuta desde la raíz del proyecto:

```bat
subir-mod.bat "mod-viejo-1.0.0.jar" "mod-nuevo-1.0.1.jar"
```

Eso es todo. El script hace el resto automáticamente.

---

## Qué hace el script automáticamente

| Paso | Acción |
|------|--------|
| 1 | Calcula SHA1 y tamaño del nuevo `.jar` |
| 2 | Actualiza `manifest.json`: versión del modpack, entrada del mod, y agrega patch note |
| 3 | Hace `git add` + `git commit` + `git push` al repo |
| 4 | Elimina el `.jar` viejo y el `manifest.json` viejo de la release de GitHub |
| 5 | Sube el nuevo `.jar` y el nuevo `manifest.json` a la release |

---

## Uso detallado

### Sintaxis

```bat
subir-mod.bat "old-mod.jar" "new-mod.jar" ["Descripcion opcional"]
```

### Parámetros

| Parámetro | Descripción | Requerido |
|-----------|-------------|-----------|
| `old-mod.jar` | Nombre exacto del jar antiguo en `my-modpack/mods/` | ✅ |
| `new-mod.jar` | Nombre exacto del jar nuevo en `my-modpack/mods/` | ✅ |
| `"Descripcion"` | Texto para la nota de parche del launcher | ❌ (se genera automático) |

### Ejemplos

```bat
REM Actualizar No More Villagers sin descripción personalizada
subir-mod.bat "no-more-villagers-1.3.5.jar" "no-more-villagers-1.3.6.jar"

REM Actualizar ServerPad con descripción personalizada
subir-mod.bat "ServerPad-1.0.2.jar" "ServerPad-1.0.3.jar" "ServerPad: fix de visualizacion de comandos"

REM Mod con + en el nombre (lo maneja automáticamente)
subir-mod.bat "createnewrecipes-1.0.1+1.20.1.jar" "createnewrecipes-1.0.2+1.20.1.jar"
```

> **Nota:** Los nombres de archivo son sensibles a mayúsculas/minúsculas. Úsalos exactamente como aparecen en la carpeta `mods/`.

---

## También puedes ejecutarlo con PowerShell directamente

```powershell
.\subir-mod.ps1 -OldJar "mod-1.0.0.jar" -NewJar "mod-1.0.1.jar"
.\subir-mod.ps1 -OldJar "mod-1.0.0.jar" -NewJar "mod-1.0.1.jar" -PatchNote "Descripcion personalizada"
```

---

## Pasos manuales (sin script)

Si por algún motivo el script no funciona, aquí están los pasos manuales:

### 1. Calcular SHA1 y tamaño del nuevo jar

```powershell
$file = "my-modpack\mods\nombre-del-mod.jar"
(Get-FileHash $file -Algorithm SHA1).Hash.ToLower()
(Get-Item $file).Length
```

### 2. Editar `my-modpack/manifest.json`

- Incrementar `"version"` del modpack (ej: `"1.0.7"` → `"1.0.8"`)
- Agregar una entrada al inicio de `"patchNotes"` con la nueva versión y la descripción del cambio
- Encontrar la entrada del mod viejo en `"mods"` y cambiar:
  - `"id"` → nuevo ID (nombre sin `.jar`, puntos y `+` → guiones)
  - `"file"` → `"mods/nombre-nuevo.jar"`
  - `"sha1"` → el SHA1 calculado en el paso 1
  - `"size"` → el tamaño calculado en el paso 1

### 3. Git commit y push

```powershell
cd my-modpack
git add manifest.json mods/nuevo-mod.jar mods/viejo-mod.jar
git commit -m "chore: update viejo -> nuevo, bump modpack to v1.0.X"
git push
```

### 4. Borrar assets viejos de la release

```powershell
# Obtener el token
$token = ("protocol=https`nhost=github.com`n" | git credential fill | ConvertFrom-StringData).password
$headers = @{ Authorization = "token $token"; Accept = "application/vnd.github+json" }

# Buscar el ID del asset viejo
$assets = Invoke-RestMethod -Uri "https://api.github.com/repos/juyliantamayo/launchercretania/releases/293289533/assets?per_page=100" -Headers $headers
$assets | Where-Object { $_.name -like "*nombre*" } | Select-Object id, name

# Borrar (reemplaza XXXXXXX con el ID encontrado)
Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/juyliantamayo/launchercretania/releases/assets/XXXXXXX" -Headers $headers
```

### 5. Subir nuevos assets a la release

```powershell
$uploadBase = "https://uploads.github.com/repos/juyliantamayo/launchercretania/releases/293289533/assets"

# Subir el jar (usa %2B si el nombre tiene +)
$encodedName = [Uri]::EscapeDataString("nombre-nuevo-mod.jar")
Invoke-RestMethod -Method Post -Uri "$uploadBase`?name=$encodedName" `
    -Headers @{ Authorization = "token $token"; "Content-Type" = "application/java-archive" } `
    -InFile "my-modpack\mods\nombre-nuevo-mod.jar"

# Subir el manifest
Invoke-RestMethod -Method Post -Uri "$uploadBase`?name=manifest.json" `
    -Headers @{ Authorization = "token $token"; "Content-Type" = "application/json" } `
    -InFile "my-modpack\manifest.json"
```

---

## Notas importantes

- **El `+` en nombres de archivo** se URL-encodea automáticamente como `%2B` al subir. El script lo maneja solo.
- **El token de GitHub** se obtiene automáticamente del credential helper de git (el mismo que usa para hacer push).
- **La versión del modpack** siempre incrementa el último número (ej: `1.0.7` → `1.0.8`). Si necesitas un salto mayor, edita `manifest.json` manualmente primero.
- **La release que se usa** siempre es `modpack-v1.0.0` (ID `293289533`). El launcher apunta a esa URL fija.
- **Si el mod es completamente nuevo** (no es una actualización), usa `manifest.json` directamente — el script solo sirve para reemplazar un mod existente.

---

## Archivos del sistema

| Archivo | Descripción |
|---------|-------------|
| `subir-mod.bat` | Lanzador — haz doble clic o llámalo desde cmd |
| `subir-mod.ps1` | Script principal (PowerShell) — toda la lógica |
| `my-modpack/manifest.json` | Lista de mods, versión del modpack y patch notes |
