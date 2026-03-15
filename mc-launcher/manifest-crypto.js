const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const DEFAULT_MANIFEST_SECRET =
  process.env.CRETANIA_MANIFEST_SECRET ||
  "cretania-manifest-2026-change-this-secret";

function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, KEY_LENGTH);
}

function encryptManifestObject(manifest, secret = DEFAULT_MANIFEST_SECRET) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(manifest), "utf-8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: true,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    salt: salt.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

function isEncryptedManifestPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    payload.encrypted === true &&
    payload.algorithm === ALGORITHM &&
    payload.iv &&
    payload.salt &&
    payload.tag &&
    payload.data
  );
}

function decryptManifestPayload(payload, secret = DEFAULT_MANIFEST_SECRET) {
  if (!isEncryptedManifestPayload(payload)) {
    return payload;
  }

  const iv = Buffer.from(payload.iv, "base64");
  const salt = Buffer.from(payload.salt, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const encrypted = Buffer.from(payload.data, "base64");
  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
  return JSON.parse(decrypted);
}

function parseManifestPayload(raw, secret = DEFAULT_MANIFEST_SECRET) {
  if (Buffer.isBuffer(raw)) {
    return parseManifestPayload(raw.toString("utf-8"), secret);
  }

  if (typeof raw === "string") {
    return parseManifestPayload(JSON.parse(raw), secret);
  }

  if (isEncryptedManifestPayload(raw)) {
    return decryptManifestPayload(raw, secret);
  }

  return raw;
}

module.exports = {
  DEFAULT_MANIFEST_SECRET,
  encryptManifestObject,
  decryptManifestPayload,
  isEncryptedManifestPayload,
  parseManifestPayload
};