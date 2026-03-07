/**
 * Tests para manifest.json — Validación de la estructura del modpack
 */

const fs = require("fs");
const path = require("path");

const MANIFEST_PATH = path.join(__dirname, "..", "..", "my-modpack", "manifest.json");
let manifest;

beforeAll(() => {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
  manifest = JSON.parse(raw);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Manifest Structure
// ═══════════════════════════════════════════════════════════════════════════════
describe("Manifest Structure", () => {
  test("tiene campo version", () => {
    expect(manifest.version).toBeDefined();
    expect(typeof manifest.version).toBe("string");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("tiene campo minecraft", () => {
    expect(manifest.minecraft).toBe("1.20.1");
  });

  test("tiene campo loader = fabric", () => {
    expect(manifest.loader).toBe("fabric");
  });

  test("tiene campo loaderVersion", () => {
    expect(manifest.loaderVersion).toBeDefined();
    expect(typeof manifest.loaderVersion).toBe("string");
  });

  test("tiene array de mods", () => {
    expect(Array.isArray(manifest.mods)).toBe(true);
    expect(manifest.mods.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Mods Entries
// ═══════════════════════════════════════════════════════════════════════════════
describe("Mods Entries", () => {
  test("cada mod tiene id, file y sha1", () => {
    for (const mod of manifest.mods) {
      expect(mod.id).toBeDefined();
      expect(typeof mod.id).toBe("string");
      expect(mod.file).toBeDefined();
      expect(mod.file).toMatch(/\.jar$/);
      expect(mod.sha1).toBeDefined();
      expect(typeof mod.sha1).toBe("string");
    }
  });

  test("no hay mods duplicados por id", () => {
    const ids = manifest.mods.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("no hay mods duplicados por archivo", () => {
    const files = manifest.mods.map((m) => path.basename(m.file));
    const unique = new Set(files);
    expect(unique.size).toBe(files.length);
  });

  test("todos los SHA1 tienen formato válido (40 hex chars)", () => {
    for (const mod of manifest.mods) {
      if (mod.sha1 && !mod.sha1.includes("PUT_REAL")) {
        expect(mod.sha1).toMatch(/^[0-9a-f]{40}$/i);
      }
    }
  });

  test("todos los archivos están en la carpeta mods/", () => {
    for (const mod of manifest.mods) {
      expect(mod.file).toMatch(/^mods\//);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Patch Notes in Manifest
// ═══════════════════════════════════════════════════════════════════════════════
describe("Patch Notes in Manifest", () => {
  test("tiene campo patchNotes como array", () => {
    expect(manifest.patchNotes).toBeDefined();
    expect(Array.isArray(manifest.patchNotes)).toBe(true);
    expect(manifest.patchNotes.length).toBeGreaterThan(0);
  });

  test("cada nota tiene version, date y categories", () => {
    for (const pn of manifest.patchNotes) {
      expect(pn.version).toBeDefined();
      expect(typeof pn.version).toBe("string");
      expect(pn.date).toBeDefined();
      expect(Array.isArray(pn.categories)).toBe(true);
    }
  });

  test("cada categoría tiene type, title, icon y entries", () => {
    for (const pn of manifest.patchNotes) {
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
    for (const pn of manifest.patchNotes) {
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
    expect(manifest.patchNotes[0].version).toBe(manifest.version);
  });

  test("las notas están ordenadas de más reciente a más antigua", () => {
    const versions = manifest.patchNotes.map((pn) => pn.version);
    // Verificar que la primera es >= a las siguientes (semver simple)
    for (let i = 1; i < versions.length; i++) {
      const a = versions[i - 1].split(".").map(Number);
      const b = versions[i].split(".").map(Number);
      const aGreater = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]) || (a[0] === b[0] && a[1] === b[1] && a[2] >= b[2]);
      expect(aGreater).toBe(true);
    }
  });
});
