// F10 — permanent regression tests for cryptoService.js. Run with `node --test`.
// Requires APPLY_BOT_MASTER_KEY to be set (see backend/.env.example for the
// generation command) — encrypt()/decrypt() throw loudly without it, by design.
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.APPLY_BOT_MASTER_KEY =
  process.env.APPLY_BOT_MASTER_KEY || require('crypto').randomBytes(32).toString('base64');

const { encrypt, decrypt, encryptJSON, decryptJSON, timingSafeEqualString } = require('../src/services/cryptoService');

test('encrypt/decrypt round trip returns the exact original string', () => {
  const original = 'super-secret-password-123!@#';
  const packed = encrypt(original);
  assert.equal(decrypt(packed), original);
});

test('encryptJSON/decryptJSON round trip returns an equivalent object', () => {
  const original = { username: 'alice@example.com', password: 'p@ssw0rd', nested: { a: 1, b: [1, 2, 3] } };
  const packed = encryptJSON(original);
  assert.deepEqual(decryptJSON(packed), original);
});

test('decrypt fails loudly on a tampered ciphertext (GCM auth tag catches it)', () => {
  const packed = encrypt('hello world');
  packed.ciphertext[0] ^= 0xff; // flip a bit
  assert.throws(() => decrypt(packed));
});

test('decrypt fails loudly when using the wrong iv/authTag pair (the exact bug class this session found and fixed)', () => {
  const a = encrypt('secret A');
  const b = encrypt('secret B');
  // Simulates reusing one credential's iv/authTag to decrypt a different blob —
  // this is precisely the mistake caught and fixed for ApplyCredential's
  // sessionState fields (they got their own iv/authTag columns because of this).
  assert.throws(() => decrypt({ ciphertext: a.ciphertext, iv: b.iv, authTag: b.authTag }));
});

test('timingSafeEqualString: identical strings match', () => {
  assert.equal(timingSafeEqualString('secret123', 'secret123'), true);
});

test('timingSafeEqualString: different strings do not match', () => {
  assert.equal(timingSafeEqualString('secret123', 'secret124'), false);
});

test('timingSafeEqualString: mismatched length does not throw and returns false', () => {
  assert.equal(timingSafeEqualString('short', 'a-much-longer-secret-value'), false);
});

test('timingSafeEqualString: undefined input does not throw and returns false', () => {
  assert.equal(timingSafeEqualString(undefined, 'secret123'), false);
});

test('timingSafeEqualString: both empty strings match', () => {
  assert.equal(timingSafeEqualString('', ''), true);
});
