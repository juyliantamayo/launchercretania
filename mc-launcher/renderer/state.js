// Shared reactive state for the renderer process.
// All modules import S and mutate it directly — no framework needed.
export const S = {
  accounts: [],
  selectedAcc: null,
  modpacks: [],
  selectedId: null,
  optMods: [],
  instanceStatus: {},
  settings: {},
  query: "",
  subview: "browse",   // "browse" | "detail"
  activeTab: "explore",
  launchBusy: false,
  conLines: 0,
  pnNotes: [],
  pnVersion: "",
  // Flags de la variante de build (cargados en app init desde get-app-flags)
  storeBuild: false   // true solo en la variante Microsoft Store
};

export const MAX_LOG = 600;

// Convenience: initial letter of a string
export const ini = n => (n || "?").charAt(0).toUpperCase();

// Returns the currently selected modpack object (or null)
export const getPack = () => S.modpacks.find(p => p.id === S.selectedId) || null;

// Returns packs matching the current search query
export function getFiltered() {
  const q = S.query.trim().toLowerCase();
  if (!q) return S.modpacks;
  return S.modpacks.filter(p =>
    [p.name, p.subtitle, p.loader, p.loaderType, p.version, p.minecraft,
     p.public ? "publico" : "privado"].filter(Boolean).join(" ").toLowerCase().includes(q)
  );
}

// Returns the localStorage key for patch-note seen state
export const pnKey = () => "cretania_pn_" + (S.selectedId || "default");
