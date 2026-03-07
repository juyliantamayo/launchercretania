/**
 * Tests para index.html — Validación de UI/DOM
 *
 * Verifica que el HTML contiene todos los elementos necesarios:
 *  - Controles de ventana
 *  - Sistema de tabs (INICIO, AJUSTES, CONSOLA)
 *  - Badge de versión y patch notes
 *  - Formularios de configuración
 *  - Botones de acción
 *  - Scripts necesarios
 */

const fs = require("fs");
const path = require("path");

const HTML_PATH = path.join(__dirname, "..", "index.html");
let html;

beforeAll(() => {
  html = fs.readFileSync(HTML_PATH, "utf-8");
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
    expect(html).toMatch(/<title>.*Cretania.*<\/title>/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Window Controls
// ═══════════════════════════════════════════════════════════════════════════════
describe("Window Controls (frameless)", () => {
  test("tiene barra de título personalizada", () => {
    expect(html).toContain("title-bar");
  });

  test("tiene botón minimizar", () => {
    expect(html).toMatch(/win-minimize|btn-minimize/i);
  });

  test("tiene botón cerrar", () => {
    expect(html).toMatch(/win-close|btn-close/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Tab Navigation
// ═══════════════════════════════════════════════════════════════════════════════
describe("Tab Navigation", () => {
  test("tiene tabs de INICIO, AJUSTES y CONSOLA", () => {
    expect(html).toContain("tab-btn");
    expect(html).toMatch(/INICIO/i);
    expect(html).toMatch(/AJUSTES/i);
    expect(html).toMatch(/CONSOLA/i);
  });

  test("tiene contenido para cada tab", () => {
    expect(html).toMatch(/tab-content|tab-panel|tab-page/i);
  });

  test("tiene función switchTab en JS", () => {
    expect(html).toContain("switchTab");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Version Badge & Patch Notes
// ═══════════════════════════════════════════════════════════════════════════════
describe("Version Badge & Patch Notes", () => {
  test("tiene badge de versión", () => {
    expect(html).toContain("version-badge");
    expect(html).toContain("pnVersionTag");
  });

  test("tiene overlay del modal de patch notes", () => {
    expect(html).toContain("pnOverlay");
    expect(html).toContain("pn-modal");
  });

  test("tiene botón para abrir patch notes", () => {
    expect(html).toContain("btnPatchNotes");
  });

  test("tiene botón para cerrar patch notes", () => {
    expect(html).toContain("btnPnClose");
  });

  test("tiene indicador de notas nuevas (dot)", () => {
    expect(html).toContain("pnNewDot");
  });

  test("tiene función loadPatchNotes (carga desde manifest)", () => {
    expect(html).toContain("loadPatchNotes");
  });

  test("tiene función renderPatchNotes", () => {
    expect(html).toContain("renderPatchNotes");
  });

  test("tiene función openPatchNotes", () => {
    expect(html).toContain("openPatchNotes");
  });

  test("tiene función checkPnBadge", () => {
    expect(html).toContain("checkPnBadge");
  });

  test("usa IPC get-patch-notes (no hardcodeado)", () => {
    expect(html).toContain("get-patch-notes");
    // No debe tener PATCH_NOTES hardcodeado como const con array
    expect(html).not.toMatch(/const\s+PATCH_NOTES\s*=\s*\[/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Account System UI
// ═══════════════════════════════════════════════════════════════════════════════
describe("Account System UI", () => {
  test("tiene botón de login Microsoft", () => {
    expect(html).toMatch(/login.*microsoft|microsoft.*login|btnLogin|btn-login/i);
  });

  test("tiene contenedor para lista de cuentas", () => {
    expect(html).toMatch(/account|cuentas/i);
  });

  test("usa IPC login-microsoft", () => {
    expect(html).toContain("login-microsoft");
  });

  test("usa IPC get-accounts", () => {
    expect(html).toContain("get-accounts");
  });

  test("usa IPC remove-account", () => {
    expect(html).toContain("remove-account");
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
    expect(html).toMatch(/gameDir|game-dir|select-game-dir/i);
  });

  test("tiene detección de Java", () => {
    expect(html).toMatch(/check-java|java.*status|javaStatus/i);
  });

  test("tiene botón instalar Java", () => {
    expect(html).toMatch(/install-java|btnInstallJava/i);
  });

  test("usa IPC save-settings", () => {
    expect(html).toContain("save-settings");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Console Tab
// ═══════════════════════════════════════════════════════════════════════════════
describe("Console Tab", () => {
  test("tiene área de consola/logs", () => {
    expect(html).toMatch(/console|consoleLog|mc-log/i);
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
    expect(html).toMatch(/JUGAR|btnPlay|btn-play/i);
  });

  test("tiene barra de progreso", () => {
    expect(html).toMatch(/progress|progressBar|progress-bar/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: IPC Integration
// ═══════════════════════════════════════════════════════════════════════════════
describe("IPC Integration (script integrity)", () => {
  test("importa ipcRenderer", () => {
    expect(html).toContain("ipcRenderer");
  });

  test("usa invoke para IPC async", () => {
    expect(html).toContain("ipcRenderer.invoke");
  });

  test("usa ipcRenderer.on para eventos del main process", () => {
    expect(html).toContain("ipcRenderer.on");
  });

  test("tiene listener para progress events", () => {
    expect(html).toMatch(/ipcRenderer\.on\(\s*["']progress["']/);
  });

  test("tiene listener para mc-closed events", () => {
    expect(html).toMatch(/ipcRenderer\.on\(\s*["']mc-closed["']/);
  });

  test("tiene listener para log events", () => {
    expect(html).toMatch(/ipcRenderer\.on\(\s*["']log["']/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Styles
// ═══════════════════════════════════════════════════════════════════════════════
describe("Styles", () => {
  test("tiene CSS embebido con variables de tema", () => {
    expect(html).toMatch(/--copper|--brass|--dark|--bg/i);
  });

  test("tiene fuente Orbitron (steampunk)", () => {
    expect(html).toContain("Orbitron");
  });

  test("tiene estilos para patch notes modal", () => {
    expect(html).toContain(".pn-modal");
    expect(html).toContain(".pn-overlay");
  });

  test("tiene estilos para tabs", () => {
    expect(html).toContain(".tab-btn");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: CSS Categories for Patch Notes
// ═══════════════════════════════════════════════════════════════════════════════
describe("Patch Notes CSS categories", () => {
  test("tiene estilos para categoría added", () => {
    expect(html).toMatch(/\.pn-cat-icon\.added|\.pn-entry\.added/);
  });

  test("tiene estilos para categoría changed", () => {
    expect(html).toMatch(/\.pn-cat-icon\.changed|\.pn-entry\.changed/);
  });

  test("tiene estilos para categoría fixed", () => {
    expect(html).toMatch(/\.pn-cat-icon\.fixed|\.pn-entry\.fixed/);
  });
});
