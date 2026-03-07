/**
 * Tests para auth.js — Autenticación y gestión de cuentas
 */

const path = require("path");
const fs = require("fs-extra");

// Jest requires mock factory variables to be prefixed with "mock"
const mockAuthDir = path.join(__dirname, "..", "test-tmp-auth");
const mockAccountsFile = path.join(mockAuthDir, "accounts.json");

// ─── Mock Electron ────────────────────────────────────────────────────────────
jest.mock("electron", () => {
  const mockDir = require("path").join(__dirname, "..", "test-tmp-auth");
  return {
    app: { getPath: () => mockDir },
    BrowserWindow: jest.fn().mockImplementation(() => ({
      setMenu: jest.fn(), loadURL: jest.fn(), on: jest.fn(), close: jest.fn(),
      webContents: { on: jest.fn(), getURL: jest.fn().mockReturnValue("") }
    }))
  };
});

// ─── Mock msmc ────────────────────────────────────────────────────────────────
jest.mock("msmc", () => ({
  Auth: jest.fn().mockImplementation(() => ({
    createLink: jest.fn().mockReturnValue("https://login.live.com/oauth"),
    token: { redirect: "https://login.live.com/oauth20_desktop.srf" },
    login: jest.fn().mockResolvedValue({
      getMinecraft: jest.fn().mockResolvedValue({
        mclc: () => ({ access_token: "test-token", client_token: "ct", uuid: "test-uuid-1234", name: "TestPlayer", user_properties: "{}" }),
        profile: { name: "TestPlayer", id: "test-uuid-1234" }
      }),
      save: jest.fn().mockReturnValue({ msmc: "saved-data" })
    }),
    refresh: jest.fn().mockResolvedValue({
      getMinecraft: jest.fn().mockResolvedValue({
        mclc: () => ({ access_token: "refreshed-token", client_token: "ct", uuid: "test-uuid-1234", name: "TestPlayer", user_properties: "{}" }),
        profile: { name: "TestPlayer", id: "test-uuid-1234" }
      }),
      save: jest.fn().mockReturnValue({ msmc: "refreshed-data" })
    })
  }))
}));

beforeEach(() => {
  fs.ensureDirSync(mockAuthDir);
  if (fs.existsSync(mockAccountsFile)) fs.removeSync(mockAccountsFile);
});
afterEach(() => { fs.removeSync(mockAuthDir); });

const { getAccountList, getAccountAuth, removeAccount, loadAccounts } = require("../auth");

// ═══════════════════════════════════════════════════════════════════════════════
describe("Account Storage", () => {
  test("loadAccounts devuelve array vacío si no existe archivo", () => {
    expect(loadAccounts()).toEqual([]);
  });

  test("loadAccounts lee cuentas guardadas", () => {
    const data = [{ uuid: "u1", name: "P1" }, { uuid: "u2", name: "P2" }];
    fs.writeFileSync(mockAccountsFile, JSON.stringify(data));
    const accounts = loadAccounts();
    expect(accounts.length).toBe(2);
    expect(accounts[0].name).toBe("P1");
  });

  test("loadAccounts retorna vacío con JSON inválido", () => {
    fs.writeFileSync(mockAccountsFile, "INVALID{{{");
    expect(loadAccounts()).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Account List (sanitized for UI)", () => {
  test("filtra tokens sensibles", () => {
    fs.writeFileSync(mockAccountsFile, JSON.stringify([{
      uuid: "u1", name: "P1", offline: false, lastUsed: 1,
      mclc: { access_token: "SECRET" }, msmcData: { refresh: "PRIVATE" }
    }]));
    const list = getAccountList();
    expect(list[0].mclc).toBeUndefined();
    expect(list[0].msmcData).toBeUndefined();
    expect(list[0].name).toBe("P1");
  });

  test("devuelve offline correcto", () => {
    fs.writeFileSync(mockAccountsFile, JSON.stringify([
      { uuid: "u1", name: "P1", offline: false, lastUsed: 1 },
      { uuid: "u2", name: "P2", offline: true, lastUsed: 2 }
    ]));
    const list = getAccountList();
    expect(list[0].offline).toBe(false);
    expect(list[1].offline).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Remove Account", () => {
  test("elimina la cuenta correcta por UUID", () => {
    fs.writeFileSync(mockAccountsFile, JSON.stringify([
      { uuid: "u1", name: "P1", offline: false, lastUsed: 1 },
      { uuid: "u2", name: "P2", offline: false, lastUsed: 2 }
    ]));
    const remaining = removeAccount("u1");
    expect(remaining.length).toBe(1);
    expect(remaining[0].uuid).toBe("u2");
  });

  test("no falla si UUID no existe", () => {
    fs.writeFileSync(mockAccountsFile, JSON.stringify([{ uuid: "u1", name: "P1" }]));
    expect(removeAccount("non-existent").length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("Token Refresh (getAccountAuth)", () => {
  test("refresca token con datos msmc", async () => {
    fs.writeFileSync(mockAccountsFile, JSON.stringify([{
      uuid: "test-uuid-1234", name: "TestPlayer", offline: false, lastUsed: 1,
      mclc: { access_token: "old-token" }, msmcData: { msmc: "saved-data" }
    }]));
    const result = await getAccountAuth("test-uuid-1234");
    expect(result.mclc.access_token).toBe("refreshed-token");
    expect(result.profile.name).toBe("TestPlayer");
  });

  test("lanza error si refresh falla (no usa token expirado)", async () => {
    const { Auth } = require("msmc");
    Auth.mockImplementationOnce(() => ({
      refresh: jest.fn().mockRejectedValue(new Error("Refresh failed"))
    }));
    fs.writeFileSync(mockAccountsFile, JSON.stringify([{
      uuid: "uc", name: "Cached", offline: false, lastUsed: 1,
      mclc: { access_token: "cached-token" }, msmcData: { msmc: "old" }
    }]));
    await expect(getAccountAuth("uc")).rejects.toThrow("sesión de Microsoft ha expirado");
  });

  test("lanza error si cuenta no existe", async () => {
    fs.writeFileSync(mockAccountsFile, "[]");
    await expect(getAccountAuth("nope")).rejects.toThrow("Cuenta no encontrada");
  });
});
