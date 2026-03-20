const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Cifra un objeto manifest al formato esperado por el launcher.
 * Idéntico al encryptManifestObject del launcher.
 */
function encryptManifest(manifest, secret) {
  const iv   = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key  = deriveKey(secret, salt);

  const cipher    = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(manifest), "utf-8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag       = cipher.getAuthTag();

  return {
    encrypted: true,
    algorithm: ALGORITHM,
    iv:   iv.toString("base64"),
    salt: salt.toString("base64"),
    tag:  tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

module.exports = { encryptManifest };
