// Console / logging module
import { S, MAX_LOG } from "../state.js";

const $ = id => document.getElementById(id);

function classifyLog(txt, type) {
  if (type === "system") return "system";
  if (type === "error")  return "error";
  const l = String(txt).toLowerCase();
  if (l.includes("error") || l.includes("exception") || l.includes("crash")) return "error";
  if (l.includes("warn"))  return "warn";
  if (l.includes("debug")) return "debug";
  return "info";
}

export function log(txt, type = "info") {
  const out = $("consoleOut");
  const el  = document.createElement("div");
  el.className  = "log-" + classifyLog(txt, type);
  el.textContent = txt;
  out.appendChild(el);
  S.conLines++;
  while (S.conLines > MAX_LOG) { out.removeChild(out.firstChild); S.conLines--; }
  out.scrollTop = out.scrollHeight;
  if (S.activeTab !== "settings") $("consoleDot").classList.add("on");
}

export function clearConsole() {
  $("consoleOut").innerHTML = "";
  S.conLines = 0;
}
