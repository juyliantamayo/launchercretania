const mongoose = require("mongoose");

// Schema para los metadatos del launcher (versión del launcher, patch notes del launcher)
const LauncherPatchNoteEntrySchema = new mongoose.Schema({
  text: { type: String, required: true }
}, { _id: false });

const LauncherPatchNoteCategorySchema = new mongoose.Schema({
  type:    { type: String, default: "changed" },
  title:   { type: String, default: "Cambios" },
  icon:    { type: String, default: "↑" },
  entries: { type: [LauncherPatchNoteEntrySchema], default: [] }
}, { _id: false });

const LauncherPatchNoteSchema = new mongoose.Schema({
  version: { type: String, required: true },
  date:    { type: String, default: "" },
  categories: { type: [LauncherPatchNoteCategorySchema], default: [] }
}, { _id: false });

const LauncherMetaSchema = new mongoose.Schema({
  // Un solo documento con _id fijo "launcher"
  _id:           { type: String, default: "launcher" },
  version:       { type: String, default: "1.0.0" },
  assetName:     { type: String, default: "LucerionLauncher.exe" },
  releaseApiUrl: { type: String, default: "" },
  patchNotes:    { type: [LauncherPatchNoteSchema], default: [] }
}, {
  timestamps: true
});

module.exports = mongoose.model("LauncherMeta", LauncherMetaSchema);
