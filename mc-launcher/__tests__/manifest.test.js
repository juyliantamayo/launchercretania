/**
 * Tests para manifest.json — Validación de la estructura del modpack
 */

const fs = require("fs");
const path = require("path");

const MANIFEST_PATH = path.join(__dirname, "..", "..", "my-modpack", "manifest.json");
let manifest;
let modpack;

beforeAll(() => {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
  manifest = JSON.parse(raw);
  modpack = manifest.modpacks[0];
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Manifest Structure
// ═══════════════════════════════════════════════════════════════════════════════
describe("Manifest Structure", () => {
  test("tiene formatVersion = 2", () => {
    expect(manifest.formatVersion).toBe(2);
  });

  test("tiene metadata del launcher", () => {
    expect(manifest.launcher).toBeDefined();
    expect(typeof manifest.launcher.version).toBe("string");
    expect(Array.isArray(manifest.launcher.patchNotes)).toBe(true);
  });

  test("tiene modpacks", () => {
    expect(Array.isArray(manifest.modpacks)).toBe(true);
    expect(manifest.modpacks.length).toBeGreaterThan(0);
  });

  test("el primer modpack tiene version", () => {
    expect(modpack.version).toBeDefined();
    expect(typeof modpack.version).toBe("string");
    expect(modpack.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("el primer modpack tiene minecraft y loader", () => {
    expect(modpack.minecraft).toBe("1.20.1");
    expect(modpack.loader).toBe("fabric");
    expect(typeof modpack.loaderVersion).toBe("string");
  });

  test("tiene array de mods", () => {
    expect(Array.isArray(modpack.mods)).toBe(true);
    expect(modpack.mods.length).toBeGreaterThan(0);
  });

  test("tiene array de optionalMods configurable desde manifest", () => {
    expect(Array.isArray(modpack.optionalMods)).toBe(true);
  });

  test("el modpack puede declarar una imagen", () => {
    expect(typeof modpack.image).toBe("string");
  });

  test("tiene arrays para resourcepacks, datasources, datapacks y folders", () => {
    expect(Array.isArray(modpack.resourcepacks)).toBe(true);
    expect(Array.isArray(modpack.datasources)).toBe(true);
    expect(Array.isArray(modpack.datapacks)).toBe(true);
    expect(Array.isArray(modpack.folders)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Mods Entries
// ═══════════════════════════════════════════════════════════════════════════════
describe("Mods Entries", () => {
  test("cada mod tiene id, file y sha1", () => {
    for (const mod of modpack.mods) {
      expect(mod.id).toBeDefined();
      expect(typeof mod.id).toBe("string");
      expect(mod.file).toBeDefined();
      expect(mod.file).toMatch(/\.jar$/);
      expect(mod.sha1).toBeDefined();
      expect(typeof mod.sha1).toBe("string");
    }
  });

  test("no hay mods duplicados por id", () => {
    const ids = modpack.mods.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("no hay mods duplicados por archivo", () => {
    const files = modpack.mods.map((m) => path.basename(m.file));
    const unique = new Set(files);
    expect(unique.size).toBe(files.length);
  });

  test("todos los SHA1 tienen formato válido (40 hex chars)", () => {
    for (const mod of modpack.mods) {
      if (mod.sha1 && !mod.sha1.includes("PUT_REAL")) {
        expect(mod.sha1).toMatch(/^[0-9a-f]{40}$/i);
      }
    }
  });

  test("todos los archivos están en la carpeta mods/", () => {
    for (const mod of modpack.mods) {
      expect(mod.file).toMatch(/^mods\//);
    }
  });
});

describe("Optional Mods Entries", () => {
  test("cada opcional tiene id, name y file", () => {
    for (const mod of modpack.optionalMods) {
      expect(mod.id).toBeDefined();
      expect(mod.name).toBeDefined();
      expect(mod.file).toMatch(/^mods\//);
    }
  });

  test("los opcionales no están duplicados dentro de mods requeridos", () => {
    const requiredFiles = new Set(modpack.mods.map((mod) => mod.file));
    for (const mod of modpack.optionalMods) {
      expect(requiredFiles.has(mod.file)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Patch Notes in Manifest
// ═══════════════════════════════════════════════════════════════════════════════
describe("Patch Notes in Manifest", () => {
  test("tiene campo patchNotes como array", () => {
    expect(Array.isArray(modpack.patchNotes)).toBe(true);
    expect(modpack.patchNotes.length).toBeGreaterThan(0);
  });

  test("cada nota tiene version, date y categories", () => {
    for (const pn of modpack.patchNotes) {
      expect(pn.version).toBeDefined();
      expect(typeof pn.version).toBe("string");
      expect(pn.date).toBeDefined();
      expect(Array.isArray(pn.categories)).toBe(true);
    }
  });

  test("cada categoría tiene type, title, icon y entries", () => {
    for (const pn of modpack.patchNotes) {
      for (const cat of pn.categories) {
        expect(cat.type).toBeDefined();
        expect(["added", "changed", "fixed", "removed"]).toContain(cat.type);
        expect(cat.title).toBeDefined();
        expect(cat.icon).toBeDefined();
        expect(Array.isArray(cat.entries)).toBe(true);
        expect(cat.entries.length).toBeGreaterThan(0);
      }
    }
  });

  test("cada entry tiene campo text", () => {
    for (const pn of modpack.patchNotes) {
      for (const cat of pn.categories) {
        for (const entry of cat.entries) {
          expect(entry.text).toBeDefined();
          expect(typeof entry.text).toBe("string");
          expect(entry.text.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("la primera nota corresponde a la versión actual del manifest", () => {
    expect(modpack.patchNotes[0].version).toBe(modpack.version);
  });

  test("las notas están ordenadas de más reciente a más antigua", () => {
    const versions = modpack.patchNotes.map((pn) => pn.version);
    // Verificar que la primera es >= a las siguientes (semver simple)
    for (let i = 1; i < versions.length; i++) {
      const a = versions[i - 1].split(".").map(Number);
      const b = versions[i].split(".").map(Number);
      const aGreater = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]) || (a[0] === b[0] && a[1] === b[1] && a[2] >= b[2]);
      expect(aGreater).toBe(true);
    }
  });
});
