/**
 * Tests para auth.js — Autenticación y gestión de cuentas
 *
 * auth.js depende fuertemente de Electron (BrowserWindow, app.getPath)
 * y de msmc (Auth), por lo que se mockean esas dependencias.
 */

const path = require("path");
const fs = require("fs-extra");

// ─── Directorio temporal para tests ───────────────────────────────────────────
const TEST_DIR = path.join(__dirname, "..", "test-tmp-auth");
const ACCOUNTS_FILE = path.join(TEST_DIR, "accounts.json");

// ─── Mock Electron ────────────────────────────────────────────────────────────
jest.mock("electron", () => ({
  app: {
    getPath: (key) => {
      if (key === "userData") return TEST_DIR;
      return TEST_DIR;
    }
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    setMenu: jest.fn(),
    loadURL: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
    webContents: {
      on: jest.fn(),
      getURL: jest.fn().mockReturnValue("")
    }
  }))
}));

// ─── Mock msmc ────────────────────────────────────────────────────────────────
jest.mock("msmc", () => ({
  Auth: jest.fn().mockImplementation(() => ({
    createLink: jest.fn().mockReturnValue("https://login.live.com/oauth"),
    token: { redirect: "https://login.live.com/oauth20_desktop.srf" },
    login: jest.fn().mockResolvedValue({
      getMinecraft: jest.fn().mockResolvedValue({
        mclc: () => ({
          access_token: "test-token",
          client_token: "client-token",
          uuid: "test-uuid-1234",
          name: "TestPlayer",
          user_properties: "{}"
        }),
        profile: { name: "TestPlayer", id: "test-uuid-1234" }
      }),
      save: jest.fn().mockReturnValue({ msmc: "saved-data" })
    }),
    refresh: jest.fn().mockResolvedValue({
      getMinecraft: jest.fn().mockResolvedValue({
        mclc: () => ({
          access_token: "refreshed-token",
          client_token: "client-token",
          uuid: "test-uuid-1234",
          name: "TestPlayer",
          user_properties: "{}"
        }),
        profile: { name: "TestPlayer", id: "test-uuid-1234" }
      }),
      save: jest.fn().mockReturnValue({ msmc: "refreshed-data" })
    })
  }))
}));

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  fs.ensureDirSync(TEST_DIR);
  // Limpiar accounts.json
  if (fs.existsSync(ACCOUNTS_FILE)) fs.removeSync(ACCOUNTS_FILE);
});

afterEach(() => {
  fs.removeSync(TEST_DIR);
});

// Importar auth DESPUÉS de los mocks
const { getAccountList, getAccountAuth, removeAccount, loadAccounts } = require("../auth");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Account Storage
// ═══════════════════════════════════════════════════════════════════════════════
describe("Account Storage", () => {
  test("loadAccounts devuelve array vacío si no existe archivo", () => {
    const accounts = loadAccounts();
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBe(0);
  });

  test("loadAccounts lee cuentas guardadas correctamente", () => {
    const data = [
      { uuid: "uuid-1", name: "Player1", offline: false, lastUsed: Date.now() },
      { uuid: "uuid-2", name: "Player2", offline: true, lastUsed: Date.now() }
    ];
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));

    const accounts = loadAccounts();
    expect(accounts.length).toBe(2);
    expect(accounts[0].name).toBe("Player1");
    expect(accounts[1].name).toBe("Player2");
  });

  test("loadAccounts retorna vacío si el archivo es JSON inválido", () => {
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, "NOT VALID JSON{{{");

    const accounts = loadAccounts();
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Account List (UI-safe)
// ═══════════════════════════════════════════════════════════════════════════════
describe("Account List (sanitized)", () => {
  test("getAccountList filtra tokens sensibles", () => {
    const data = [
      {
        uuid: "uuid-1",
        name: "Player1",
        offline: false,
        lastUsed: 1000,
        mclc: { access_token: "SENSITIVE", client_token: "SECRET" },
        msmcData: { refresh: "PRIVATE" }
      }
    ];
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));

    const list = getAccountList();
    expect(list.length).toBe(1);
    expect(list[0].uuid).toBe("uuid-1");
    expect(list[0].name).toBe("Player1");
    // No debe exponer tokens
    expect(list[0].mclc).toBeUndefined();
    expect(list[0].msmcData).toBeUndefined();
    expect(list[0].access_token).toBeUndefined();
  });

  test("getAccountList devuelve campo offline correcto", () => {
    const data = [
      { uuid: "uuid-1", name: "P1", offline: false, lastUsed: 1 },
      { uuid: "uuid-2", name: "P2", offline: true, lastUsed: 2 }
    ];
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));

    const list = getAccountList();
    expect(list[0].offline).toBe(false);
    expect(list[1].offline).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Remove Account
// ═══════════════════════════════════════════════════════════════════════════════
describe("Remove Account", () => {
  test("elimina la cuenta correcta por UUID", () => {
    const data = [
      { uuid: "uuid-1", name: "Player1", offline: false, lastUsed: 1 },
      { uuid: "uuid-2", name: "Player2", offline: false, lastUsed: 2 }
    ];
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));

    const remaining = removeAccount("uuid-1");
    expect(remaining.length).toBe(1);
    expect(remaining[0].uuid).toBe("uuid-2");

    // Verificar persistencia
    const loaded = loadAccounts();
    expect(loaded.length).toBe(1);
  });

  test("no falla si el UUID no existe", () => {
    const data = [
      { uuid: "uuid-1", name: "Player1", offline: false, lastUsed: 1 }
    ];
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));

    const remaining = removeAccount("non-existent-uuid");
    expect(remaining.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Token Refresh
// ═══════════════════════════════════════════════════════════════════════════════
describe("Token Refresh (getAccountAuth)", () => {
  test("refresca token con datos msmc disponibles", async () => {
    const data = [
      {
        uuid: "test-uuid-1234",
        name: "TestPlayer",
        offline: false,
        lastUsed: 1000,
        mclc: { access_token: "old-token" },
        msmcData: { msmc: "saved-data" }
      }
    ];
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));

    const result = await getAccountAuth("test-uuid-1234");

    expect(result.mclc.access_token).toBe("refreshed-token");
    expect(result.profile.name).toBe("TestPlayer");

    // Verificar que se guardó el token actualizado
    const updated = loadAccounts();
    expect(updated[0].mclc.access_token).toBe("refreshed-token");
  });

  test("usa token cacheado si el refresh falla", async () => {
    // Override msmc mock para que refresh falle
    const { Auth } = require("msmc");
    Auth.mockImplementationOnce(() => ({
      refresh: jest.fn().mockRejectedValue(new Error("Refresh failed"))
    }));

    const data = [
      {
        uuid: "uuid-cached",
        name: "CachedPlayer",
        offline: false,
        lastUsed: 1000,
        mclc: { access_token: "cached-token" },
        msmcData: { msmc: "old-data" }
      }
    ];
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data));

    const result = await getAccountAuth("uuid-cached");
    expect(result.mclc.access_token).toBe("cached-token");
  });

  test("lanza error si la cuenta no existe", async () => {
    fs.ensureDirSync(path.dirname(ACCOUNTS_FILE));
    fs.writeFileSync(ACCOUNTS_FILE, "[]");

    await expect(getAccountAuth("non-existent")).rejects.toThrow("Cuenta no encontrada");
  });
});
