// AES-256-GCM envelope encryption for ApplyCredential (username/password/storageState).
// One master key (APPLY_BOT_MASTER_KEY, 32-byte base64) lives in Railway env vars —
// no KMS/Vault, consistent with "no hardcoded secrets, all in env vars". Decrypted
// plaintext is only ever handed to the apply-bot service over the internal API at
// task-claim time; it is never logged and never echoed to the frontend.
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended for GCM

function getKey() {
  const raw = process.env.APPLY_BOT_MASTER_KEY;
  if (!raw) {
    throw new Error('APPLY_BOT_MASTER_KEY is not set — cannot encrypt/decrypt apply-bot credentials.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('APPLY_BOT_MASTER_KEY must decode to exactly 32 bytes (base64-encoded).');
  }
  return key;
}

// Returns { ciphertext: Buffer, iv: Buffer, authTag: Buffer }
function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

// Accepts Buffers (as read back from Prisma's Bytes columns) and returns a utf8 string.
function decrypt({ ciphertext, iv, authTag }) {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

function encryptJSON(obj) {
  return encrypt(JSON.stringify(obj));
}

function decryptJSON(packed) {
  return JSON.parse(decrypt(packed));
}

// Constant-time string comparison for secret headers (APPLY_BOT_SECRET, CRON_SECRET).
// crypto.timingSafeEqual() throws on unequal-length buffers, which would itself leak
// length information through the exception vs. success timing — hashing both sides
// to a fixed-length digest first avoids that entirely, on top of making the actual
// byte comparison constant-time.
function timingSafeEqualString(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hashB = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

module.exports = { encrypt, decrypt, encryptJSON, decryptJSON, timingSafeEqualString };
