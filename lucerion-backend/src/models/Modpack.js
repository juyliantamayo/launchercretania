const mongoose = require("mongoose");

// Schema para un archivo de mod individual
const ModFileSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  file:     { type: String, required: true },  // ej: "mods/NombreMod-1.0.0.jar"
  sha1:     { type: String, required: true },
  size:     { type: Number, required: true },
  url:      { type: String, default: null },    // URL de descarga directa (override)
  name:     { type: String, default: "" },
  description: { type: String, default: "" },
  category: { type: String, default: "general" },
  defaultEnabled: { type: Boolean, default: false }
}, { _id: false });

// Schema para una entrada de patch notes
const PatchNoteEntrySchema = new mongoose.Schema({
  text: { type: String, required: true }
}, { _id: false });

const PatchNoteCategorySchema = new mongoose.Schema({
  type:    { type: String, enum: ["added", "changed", "removed", "fixed"], default: "changed" },
  title:   { type: String, default: "Cambios" },
  icon:    { type: String, default: "↑" },
  entries: { type: [PatchNoteEntrySchema], default: [] }
}, { _id: false });

const PatchNoteSchema = new mongoose.Schema({
  version:    { type: String, required: true },
  date:       { type: String, default: "" },
  categories: { type: [PatchNoteCategorySchema], default: [] }
}, { _id: false });

// Schema para un folder (archivo arbitrario copiado al gameDir)
const FolderFileSchema = new mongoose.Schema({
  id:   { type: String, required: true },
  file: { type: String, required: true },
  sha1: { type: String, required: true },
  size: { type: Number, required: true }
}, { _id: false });

// Schema principal del modpack
const ModpackSchema = new mongoose.Schema({
  id:            { type: String, required: true, unique: true, index: true },
  name:          { type: String, required: true },
  subtitle:      { type: String, default: "" },
  description:   { type: String, default: "" },
  image:         { type: String, default: "" },
  public:        { type: Boolean, default: true },
  allowedUuids:  { type: [String], default: [] },
  allowUserMods: { type: Boolean, default: false },
  baseUrl:       { type: String, default: "" },    // sobreescrito dinámicamente al servir
  version:       { type: String, default: "1.0.0" },
  minecraft:     { type: String, default: "1.20.1" },
  loader:        { type: String, default: "fabric" },
  loaderType:    { type: String, default: "fabric" },
  loaderVersion: { type: String, default: "0.18.4" },
  mods:          { type: [ModFileSchema], default: [] },
  optionalMods:  { type: [ModFileSchema], default: [] },
  resourcepacks: { type: [ModFileSchema], default: [] },
  datasources:   { type: [ModFileSchema], default: [] },
  datapacks:     { type: [ModFileSchema], default: [] },
  folders:       { type: [FolderFileSchema], default: [] },
  gallery:       { type: [String], default: [] },
  patchNotes:    { type: [PatchNoteSchema], default: [] }
}, {
  timestamps: true
});

module.exports = mongoose.model("Modpack", ModpackSchema);
