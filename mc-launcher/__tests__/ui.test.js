/**
 * Tests para index.html + renderer/ + preload.js — Validación de UI/DOM
 *
 * Verifica que el HTML, JS modular y CSS externo contienen
 * todos los elementos necesarios para la interfaz del launcher:
 *  - Controles de ventana (frameless)
 *  - Sistema de tabs (Explorar, Ajustes)
 *  - Badge de versión y patch notes
 *  - Formularios de configuración
 *  - Botones de acción
 *  - IPC a través de window.cretania (preload.js)
 *  - Estilos en CSS externo
 */

const fs = require("fs");
const path = require("path");

const HTML_PATH = path.join(__dirname, "..", "index.html");
const CSS_PATH = path.join(__dirname, "..", "renderer", "styles", "main.css");
const PRELOAD_PATH = path.join(__dirname, "..", "preload.js");
const RENDERER_DIR = path.join(__dirname, "..", "renderer");

let html;
let css;
let preload;
let rendererJs; // concatenación de todos los .js en renderer/

beforeAll(() => {
  html = fs.readFileSync(HTML_PATH, "utf-8");
  css = fs.readFileSync(CSS_PATH, "utf-8");
  preload = fs.readFileSync(PRELOAD_PATH, "utf-8");

  // Leer todos los archivos JS del renderer (app.js, data.js, events.js, state.js, ui/*.js)
  const jsFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) jsFiles.push(fs.readFileSync(full, "utf-8"));
    }
  }
  walk(RENDERER_DIR);
  rendererJs = jsFiles.join("\n");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: HTML Structure
// ═══════════════════════════════════════════════════════════════════════════════
describe("HTML Structure", () => {
  test("es un documento HTML válido con DOCTYPE", () => {
    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toMatch(/<html/i);
    expect(html).toMatch(/<head>/i);
    expect(html).toMatch(/<body>/i);
  });

  test("incluye meta charset UTF-8", () => {
    expect(html).toMatch(/charset=["']?UTF-8["']?/i);
  });

  test("tiene título de la app", () => {
    expect(html).toMatch(/<title>.*Lucerion.*<\/title>/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Window Controls
// ═══════════════════════════════════════════════════════════════════════════════
describe("Window Controls (frameless)", () => {
  test("tiene barra de título personalizada", () => {
    expect(html).toContain("titlebar");
  });

  test("tiene botón minimizar", () => {
    expect(html).toMatch(/btnMin|btn-minimize/i);
  });

  test("tiene botón cerrar", () => {
    expect(html).toMatch(/btnClose|btn-close/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Tab Navigation
// ═══════════════════════════════════════════════════════════════════════════════
describe("Tab Navigation", () => {
  test("tiene tabs de Explorar y Ajustes", () => {
    expect(html).toContain("tab-btn");
    expect(html).toMatch(/Explorar/i);
    expect(html).toMatch(/Ajustes/i);
  });

  test("tiene vistas para cada tab", () => {
    expect(html).toMatch(/data-view="explore"/);
    expect(html).toMatch(/data-view="settings"/);
  });

  test("tiene función initTabs en JS modular", () => {
    expect(rendererJs).toContain("initTabs");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Version Badge & Patch Notes
// ═══════════════════════════════════════════════════════════════════════════════
describe("Version Badge & Patch Notes", () => {
  test("tiene badge de versión", () => {
    expect(html).toContain("version-chip");
    expect(html).toContain("pnTag");
  });

  test("tiene overlay del modal de patch notes", () => {
    expect(html).toContain("pnOverlay");
    expect(html).toContain("ovl-modal");
  });

  test("tiene botón para abrir patch notes", () => {
    expect(html).toContain("btnPatchNotes");
  });

  test("tiene botón para cerrar patch notes", () => {
    expect(html).toContain("btnPnClose");
  });

  test("tiene indicador de notas nuevas (dot)", () => {
    expect(html).toContain("pnDot");
  });

  test("tiene función loadPatchNotes en JS modular", () => {
    expect(rendererJs).toContain("loadPatchNotes");
  });

  test("tiene renderizado de patch notes en JS modular", () => {
    expect(rendererJs).toMatch(/renderPn|patchNotes|pn-entry/i);
  });

  test("tiene apertura de patch notes en JS modular", () => {
    expect(rendererJs).toMatch(/openPn|pnOverlay|btnPatchNotes/);
  });

  test("tiene lógica de badge de notas nuevas en JS", () => {
    expect(rendererJs).toMatch(/pnDot|pn.*badge|pn.*dot/i);
  });

  test("usa IPC get-patch-notes (en renderer JS)", () => {
    expect(rendererJs).toContain("get-patch-notes");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Account System UI
// ═══════════════════════════════════════════════════════════════════════════════
describe("Account System UI", () => {
  test("tiene botón de agregar cuenta Microsoft", () => {
    expect(html).toMatch(/btnAddAcc|btn-add-acc/i);
  });

  test("tiene contenedor para lista de cuentas", () => {
    expect(html).toMatch(/accList|account|cuentas/i);
  });

  test("usa IPC login-microsoft (en renderer JS)", () => {
    expect(rendererJs).toContain("login-microsoft");
  });

  test("usa IPC get-accounts (en renderer JS)", () => {
    expect(rendererJs).toContain("get-accounts");
  });

  test("usa IPC remove-account (en renderer JS)", () => {
    expect(rendererJs).toContain("remove-account");
  });
});

describe("Modpack & Optional Mods UI", () => {
  test("tiene contenedor para lista de modpacks", () => {
    expect(html).toMatch(/sbMpList|mpGrid/);
  });

  test("tiene contenedor para mods opcionales", () => {
    expect(html).toMatch(/optList|optSection/);
  });

  test("usa IPC get-modpacks y get-optional-mods (en renderer JS)", () => {
    expect(rendererJs).toContain("get-modpacks");
    expect(rendererJs).toContain("get-optional-mods");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Settings UI
// ═══════════════════════════════════════════════════════════════════════════════
describe("Settings UI", () => {
  test("tiene slider o input de RAM", () => {
    expect(html).toMatch(/ramMin|ramMax|ram-min|ram-max|ram/i);
  });

  test("tiene selector de directorio de juego", () => {
    expect(html).toMatch(/btnChPath|select-game-dir|pathDisp/i);
  });

  test("tiene detección de Java", () => {
    expect(html).toMatch(/check-java|java.*status|javaStatus/i);
  });

  test("tiene botón instalar Java", () => {
    expect(html).toMatch(/install-java|btnJavaInst/i);
  });

  test("usa IPC save-settings (en renderer JS)", () => {
    expect(rendererJs).toContain("save-settings");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Console
// ═══════════════════════════════════════════════════════════════════════════════
describe("Console Tab", () => {
  test("tiene área de consola/logs", () => {
    expect(html).toMatch(/consoleOut|console-out|mc-log/i);
  });

  test("tiene indicador de nuevos logs", () => {
    expect(html).toMatch(/consoleDot|console-dot/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Action Bar
// ═══════════════════════════════════════════════════════════════════════════════
describe("Action Bar", () => {
  test("tiene botón JUGAR", () => {
    expect(html).toMatch(/Jugar|btnLaunch|btn-launch/i);
  });

  test("tiene barra de progreso", () => {
    expect(html).toMatch(/pbar-fill|pbar-wrap|progress/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: IPC Integration (preload + renderer)
// ═══════════════════════════════════════════════════════════════════════════════
describe("IPC Integration (preload + renderer)", () => {
  test("usa context bridge (window.cretania) en preload.js", () => {
    expect(preload).toContain("window.cretania");
    expect(preload).toContain("contextBridge.exposeInMainWorld");
  });

  test("renderer usa ipc.invoke para IPC async", () => {
    expect(rendererJs).toContain("ipc.invoke");
  });

  test("renderer usa ipc.on para eventos del main process", () => {
    expect(rendererJs).toContain("ipc.on");
  });

  test("tiene listener para progress events", () => {
    expect(rendererJs).toMatch(/ipc\.on\(\s*["']progress["']/);
  });

  test("tiene listener para mc-closed events", () => {
    expect(rendererJs).toMatch(/ipc\.on\(\s*["']mc-closed["']/);
  });

  test("tiene listener para log events", () => {
    expect(rendererJs).toMatch(/ipc\.on\(\s*["']log["']/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Styles (CSS externo)
// ═══════════════════════════════════════════════════════════════════════════════
describe("Styles", () => {
  test("tiene CSS externo con variables de tema", () => {
    expect(css).toMatch(/--accent/i);
    expect(css).toMatch(/--bg/i);
  });

  test("tiene tipografias personalizadas", () => {
    expect(html).toMatch(/Sora|Space Grotesk/);
  });

  test("tiene estilos para patch notes en CSS", () => {
    expect(css).toContain(".overlay");
    expect(css).toContain(".ovl-modal");
  });

  test("tiene estilos para tabs en CSS", () => {
    expect(css).toContain(".tab-btn");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: CSS Categories for Patch Notes
// ═══════════════════════════════════════════════════════════════════════════════
describe("Patch Notes CSS categories", () => {
  test("tiene estilos base para el modal de notas", () => {
    expect(css).toContain(".pn-entry");
  });
});
