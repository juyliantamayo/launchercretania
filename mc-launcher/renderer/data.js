// All async data loaders (IPC calls)
import { S, getPack, pnKey } from "./state.js";
import { renderAccs }     from "./ui/accounts.js";
import { renderSbPacks }  from "./ui/sidebar.js";
import { renderGrid }     from "./ui/grid.js";
import { renderDetail }   from "./ui/detail.js";
import { renderOptMods }  from "./ui/optmods.js";
import { updateLaunch, showToast, hideToast } from "./ui/actionbar.js";
import { checkPnBadge }   from "./ui/patchnotes.js";

const ipc = window.cretania;
const $   = id => document.getElementById(id);
// ── App flags (build variant) ─────────────────────────────────────────────────────
/**
 * Carga las flags de la variante de build desde el proceso principal.
 * Popula S.storeBuild para que todos los módulos de UI puedan adaptaràrse.
 */
export async function loadAppFlags() {
  try {
    const flags = await ipc.invoke("get-app-flags");
    S.storeBuild = !!(flags && flags.storeBuild);
  } catch {
    S.storeBuild = false;
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
export async function loadSettings() {
  S.settings = await ipc.invoke("get-settings");
  $("ramMin").value   = S.settings.ramMin || 2;
  $("ramMax").value   = S.settings.ramMax || 4;
  $("ramMinVal").textContent = $("ramMin").value + "G";
  $("ramMaxVal").textContent = $("ramMax").value + "G";
  const p = S.settings.gameDir?.trim();
  const pathEl = $("pathDisp");
  pathEl.textContent = p || "Por defecto (%APPDATA%/.cretania-minecraft)";
  pathEl.title       = pathEl.textContent;
}

export async function saveSettingsNow() {
  const s = await ipc.invoke("get-settings");
  await ipc.invoke("save-settings", {
    ...s,
    ramMin:          parseInt($("ramMin").value),
    ramMax:          parseInt($("ramMax").value),
    selectedModpack: S.selectedId || ""
  });
}

// ── Accounts ──────────────────────────────────────────────────────────────────
export async function refreshAccs() {
  S.accounts = await ipc.invoke("get-accounts");
  S.accounts = S.accounts.filter(a => !a.offline);
  if (!S.accounts.find(a => a.uuid === S.selectedAcc)) {
    S.selectedAcc = S.accounts[0]?.uuid || null;
  }
  renderAccs();
}

// ── Instance status ────────────────────────────────────────────────────────────
export async function loadInstStatus() {
  S.instanceStatus = await ipc.invoke("get-instance-status");
}

// ── Modpacks ──────────────────────────────────────────────────────────────────
export async function refreshPacks() {
  await loadInstStatus();
  const res   = await ipc.invoke("get-modpacks", { accountUuid: S.selectedAcc });
  S.modpacks  = res.modpacks || [];
  if (!S.modpacks.find(p => p.id === S.selectedId)) S.selectedId = null;
  renderGrid();
  renderSbPacks();
  if (S.subview === "detail" && S.selectedId) renderDetail();
  updateLaunch();
}

// ── Optional mods ─────────────────────────────────────────────────────────────
export async function loadOptMods() {
  const p = getPack();
  if (!p || !p.hasAccess) { S.optMods = []; renderOptMods(); return; }
  const res  = await ipc.invoke("get-optional-mods", { modpackId: p.id });
  S.optMods  = res.mods || [];
  renderOptMods();
  updateLaunch();
}

// ── Update check ──────────────────────────────────────────────────────────────
export async function checkUpdates() {
  const p = getPack();
  if (!p) { hideToast(); return; }
  try {
    const r = await ipc.invoke("check-updates", p.id);
    if (r.hasUpdate)
      showToast(`Nueva versión: v${r.remoteVersion} · Se aplicará al lanzar.`, "warn");
    else if (r.isFirstRun) {
      showToast(`${p.name} listo · ${r.modCount} mods base.`, "info");
      setTimeout(hideToast, 4000);
    } else {
      hideToast();
    }
  } catch {
    hideToast();
  }
}

// ── Patch notes ───────────────────────────────────────────────────────────────
export async function loadPatchNotes() {
  const p = getPack();
  if (!p) return;
  const r = await ipc.invoke("get-patch-notes", p.id);
  S.pnNotes   = r.patchNotes || [];
  S.pnVersion = r.version    || "";
  const pnLabel = S.pnVersion ? "v" + S.pnVersion : "v0.0.0";
  $("pnTag").textContent = pnLabel;
  $("detPnVer").textContent = pnLabel;
  checkPnBadge();
}

// ── Java check ────────────────────────────────────────────────────────────────
export async function checkJava() {
  const statEl  = $("javaStatus");
  const instBtn = $("btnJavaInst");
  try {
    const i = await ipc.invoke("check-java");
    if (i.found) {
      statEl.textContent = `Java ${i.version} detectado.`;
      statEl.className   = "java-ok";
      instBtn.style.display = "none";
    } else {
      statEl.textContent = "Java 21+ no encontrado.";
      statEl.className   = "java-err";
      instBtn.style.display = "inline-flex";
    }
  } catch {
    statEl.textContent = "No se pudo verificar Java.";
    statEl.className   = "java-err";
    instBtn.style.display = "inline-flex";
  }
}

// ── Enabled opt-mods helper ───────────────────────────────────────────────────
export function getEnabledOpt() {
  return S.optMods.filter(m => m.enabled).map(m => m.id);
}
