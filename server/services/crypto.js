const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    console.error('ENCRYPTION_KEY must be a 64-character hex string in .env');
    process.exit(1);
  }
  return Buffer.from(key, 'hex');
}

function encrypt(text) {
  if (!text) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${tag}`;
}

function decrypt(data) {
  if (!data) return null;
  // If it doesn't look encrypted (no colons), return as-is (legacy plaintext)
  if (!data.includes(':')) return data;
  const key = getKey();
  const [ivHex, encrypted, tagHex] = data.split(':');
  if (!ivHex || !encrypted || !tagHex) return data;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // If decryption fails, it might be legacy plaintext that happens to contain colons
    return data;
  }
}

module.exports = { encrypt, decrypt };
