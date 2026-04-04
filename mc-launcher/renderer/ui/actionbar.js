// Action bar: progress, status, launch button state
import { S, getPack } from "../state.js";

const $ = id => document.getElementById(id);

export function setStatus(msg) {
  const el = $("abStatusTxt");
  if (el) el.textContent = msg;
}

export function showProg(pct) {
  $("abProgress").classList.add("show");
  $("abFill").style.width = pct + "%";
}

export function hideProg() {
  $("abProgress").classList.remove("show");
  $("abFill").style.width = "0%";
}

export function showToast(msg, type = "warn") {
  const el = $("upToast");
  el.textContent  = msg;
  el.className    = `up-toast show ${type}-t`;
}

export function hideToast() {
  $("upToast").className = "up-toast";
}

export function updateLaunch() {
  const p       = getPack();
  const running = p && S.instanceStatus[p.id]?.running;
  const can     = Boolean(S.selectedAcc && p && p.hasAccess && !S.launchBusy && !running);
  $("btnLaunch").disabled  = !can;
  // Store: el botón de exportar modpack no forma parte del flujo principal de Store
  // (abrir → login → elegir pack → sincronizar → jugar)
  const dlBtn = $('btnDownload');
  if (dlBtn) {
    if (S.storeBuild) {
      dlBtn.style.display = 'none';
    } else {
      dlBtn.style.display = '';
      dlBtn.disabled = !p;
    }
  }

  const syncBtn = $('btnSyncMods');
  if (syncBtn) {
    syncBtn.disabled = !p || S.launchBusy;
  }
}
