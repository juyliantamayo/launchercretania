// All DOM event listeners and IPC event handlers
import { S, getPack, pnKey } from "./state.js";
import { switchTab }  from "./ui/tabs.js";
import { showBrowse } from "./ui/explore.js";
import { renderGrid } from "./ui/grid.js";
import { renderDetail } from "./ui/detail.js";
import { renderSbPacks } from "./ui/sidebar.js";
import { renderPN }   from "./ui/patchnotes.js";
import { setStatus, showProg, hideProg, updateLaunch } from "./ui/actionbar.js";
import { log }        from "./ui/console.js";
import {
  refreshAccs, refreshPacks, loadInstStatus,
  loadPatchNotes, getEnabledOpt, saveSettingsNow
} from "./data.js";

const ipc = window.cretania;
const $   = id => document.getElementById(id);

export function initEvents() {

  // Window controls
  $('btnMin').addEventListener('click',   () => ipc.send('win-minimize'));
  $('btnMax').addEventListener('click',   () => ipc.send('win-maximize'));
  $('btnClose').addEventListener('click', () => ipc.send('win-close'));

  // Sidebar footer: settings shortcut
  const sbSettings = $('sbBtnSettings');
  if (sbSettings) sbSettings.addEventListener('click', () => switchTab('settings'));
  // Sidebar footer: add account shortcut
  const sbAdd = $('sbBtnAddAcc2');
  if (sbAdd) sbAdd.addEventListener('click', () => $('btnAddAcc')?.click());

  // Search
  $("searchInput").addEventListener("input", () => {
    S.query = $("searchInput").value;
    renderGrid();
  });

  // Back button
  $("btnBack").addEventListener("click", () => showBrowse());

  // Patch notes overlay (sidebar chip + detail button)
  const openPN = () => {
    renderPN();
    $("pnOverlay").classList.add("open");
    try { localStorage.setItem(pnKey(), S.pnVersion); } catch {}
    $("pnDot").style.display = "none";
  };
  $("btnPatchNotes").addEventListener("click", openPN);
  $("btnDetPatchNotes").addEventListener("click", openPN);
  $("btnPnClose").addEventListener("click",  () => $("pnOverlay").classList.remove("open"));
  $("pnOverlay").addEventListener("click", e => {
    if (e.target === $("pnOverlay")) $("pnOverlay").classList.remove("open");
  });

  // Add account
  $("btnAddAcc").addEventListener("click", async () => {
    $("btnAddAcc").disabled = true;
    setStatus("Abriendo login de Microsoft...");
    try {
      const r = await ipc.invoke("login-microsoft");
      setStatus("Cuenta agregada: " + r.profile.name);
      await refreshAccs();
      await refreshPacks();
    } catch (err) {
      setStatus("Error: " + err.message);
    }
    $("btnAddAcc").disabled = false;
  });

  // RAM sliders
  $("ramMin").addEventListener("input", async () => {
    if (+$("ramMin").value > +$("ramMax").value) $("ramMax").value = $("ramMin").value;
    $("ramMinVal").textContent = $("ramMin").value + "G";
    $("ramMaxVal").textContent = $("ramMax").value + "G";
    await saveSettingsNow();
  });
  $("ramMax").addEventListener("input", async () => {
    if (+$("ramMax").value < +$("ramMin").value) $("ramMin").value = $("ramMax").value;
    $("ramMinVal").textContent = $("ramMin").value + "G";
    $("ramMaxVal").textContent = $("ramMax").value + "G";
    await saveSettingsNow();
  });

  // Path controls
  $("btnChPath").addEventListener("click", async () => {
    const r = await ipc.invoke("select-game-dir");
    if (r.cancelled) return;
    const s = await ipc.invoke("get-settings");
    s.gameDir = r.path;
    s.selectedModpack = S.selectedId || "";
    await ipc.invoke("save-settings", s);
    $("pathDisp").textContent = r.path;
    $("pathDisp").title       = r.path;
    setStatus("Ruta actualizada.");
  });
  $("btnOpBase").addEventListener("click", () => ipc.invoke("open-game-dir"));
  $("btnOpPack").addEventListener("click", async () => {
    const p = getPack();
    if (p) await ipc.invoke("open-modpack-dir", p.id);
  });
  $("btnRstPath").addEventListener("click", async () => {
    const s = await ipc.invoke("get-settings");
    s.gameDir         = "";
    s.selectedModpack = S.selectedId || "";
    await ipc.invoke("save-settings", s);
    $("pathDisp").textContent = "Por defecto (%APPDATA%/.cretania-minecraft)";
    $("pathDisp").title       = $("pathDisp").textContent;
    setStatus("Ruta restablecida.");
  });

  // Java install
  $("btnJavaInst").addEventListener("click", async () => {
    $("btnJavaInst").disabled = true;
    $("javaProgress").style.display = "block";
    try {
      const r = await ipc.invoke("install-java");
      $("javaStatus").textContent   = `Java ${r.version} instalado.`;
      $("javaStatus").className     = "java-ok";
      $("btnJavaInst").style.display = "none";
      $("javaProgress").style.display = "none";
    } catch (err) {
      $("javaStatus").textContent = "Error: " + err.message;
      $("javaStatus").className   = "java-err";
      $("btnJavaInst").disabled   = false;
    }
  });

  // Clear console
  $("btnClrConsole").addEventListener("click", () => {
    $("consoleOut").innerHTML = "";
    S.conLines = 0;
  });

  // Refresh button
  $("btnRefresh").addEventListener("click", async () => {
    await refreshPacks();
    if (S.selectedId) {
      const { checkUpdates } = await import("./data.js");
      await checkUpdates();
      await loadPatchNotes();
    }
    setStatus("Datos actualizados.");
  });

  // Download button
  $("btnDownload").addEventListener("click", async () => {
    const p = getPack(); if (!p) return;
    setStatus("Preparando descarga...");
    try {
      const r = await ipc.invoke("download-modpack", {
        modpackId:          p.id,
        enabledOptionalMods: getEnabledOpt()
      });
      setStatus(!r.cancelled ? "Descargado en: " + r.folder : "Descarga cancelada.");
    } catch (err) {
      setStatus("Error: " + err.message);
    }
  });

  // Launch button
  $("btnLaunch").addEventListener("click", async () => {
    const p = getPack();
    if (!S.selectedAcc || !p || !p.hasAccess || S.launchBusy) return;
    if (S.instanceStatus[p.id]?.running) { setStatus(p.name + " ya está en ejecución."); return; }

    S.launchBusy = true;
    $("btnLaunch").disabled = true;
    setStatus("Preparando " + p.name + "...");
    log("[LAUNCHER] Iniciando " + p.name + "...", "system");

    try {
      await ipc.invoke("launch", {
        accountUuid:         S.selectedAcc,
        modpackId:           p.id,
        enabledOptionalMods: getEnabledOpt()
      });
      setStatus(p.name + " lanzado.");
    } catch (err) {
      setStatus("Error: " + err.message);
      log("[LAUNCHER] ERROR: " + err.message, "error");
    } finally {
      S.launchBusy = false;
      await loadInstStatus();
      renderGrid();
      if (S.subview === "detail") renderDetail();
      renderSbPacks();
      updateLaunch();
    }
  });

  // ── IPC events ───────────────────────────────────────────────────────────────
  ipc.on("progress", d => {
    if (d.phase === "verify") {
      showProg(Math.round((d.current / Math.max(d.total || 1, 1)) * 100));
      setStatus(`Verificando mods... ${d.current}/${d.total}`);
    } else if (d.phase === "download" || d.phase === "copy") {
      showProg(Math.round((d.current / Math.max(d.total || 1, 1)) * 100));
      setStatus(`${d.phase === "download" ? "Descargando" : "Copiando"} ${d.mod} (${d.current}/${d.total})`);
    } else if (d.phase === "status") {
      setStatus(d.message);
    } else if (d.phase === "done") {
      showProg(100);
      setStatus("Sincronización terminada.");
      setTimeout(hideProg, 900);
    }
  });

  ipc.on("log", msg => log(msg));

  ipc.on("mc-closed", async payload => {
    const code = typeof payload === "object" ? payload.code : payload;
    setStatus(code === 0 ? "Minecraft cerrado." : "Minecraft cerró con errores.");
    log("[LAUNCHER] Minecraft cerrado — código " + code, code === 0 ? "system" : "error");
    await loadInstStatus();
    renderGrid();
    if (S.subview === "detail") renderDetail();
    renderSbPacks();
    updateLaunch();
  });

  ipc.on("java-install-progress", d => {
    $("javaProgress").style.display = "block";
    $("javaPFill").style.width      = d.percent + "%";
    $("javaPText").textContent      = d.message;
    setStatus(d.message);
  });

  ipc.on("launcher-update-status", d => {
    const banner  = document.getElementById("tbUpdateBanner");
    const txt     = document.getElementById("tbUpdateTxt");
    const applyBtn = document.getElementById("btnApplyUpdate");
    if (d?.status === "ready" && d.remoteVersion) {
      setStatus(`Launcher v${d.remoteVersion} listo — haz clic en "Reiniciar ahora"`);
      if (banner) {
        if (txt) txt.textContent = `v${d.remoteVersion} disponible`;
        banner.style.display = "";
        if (applyBtn && !applyBtn._wired) {
          applyBtn._wired = true;
          applyBtn.addEventListener("click", () => ipc.invoke("apply-launcher-update"));
        }
      }
    } else if (d?.status === "downloading" && typeof d.progress === "number") {
      setStatus(`Descargando actualización del launcher... ${d.progress}%`);
      if (banner) banner.style.display = "none";
    } else if (d?.status === "error" && d.error) {
      log("[LAUNCHER] Error de auto-update: " + d.error, "warn");
      if (banner) banner.style.display = "none";
    } else {
      if (banner) banner.style.display = "none";
    }
  });
}
