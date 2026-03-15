// Action bar: progress, status, launch button state
import { S, getPack } from "../state.js";

const $ = id => document.getElementById(id);

export function setStatus(msg) {
  $("abStatus").textContent = msg;
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
  $("btnDownload").disabled = !p;
}
