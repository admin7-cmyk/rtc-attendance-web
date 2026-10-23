const PIN_HASH_ALGORITHM = 'pbkdf2_sha256';
const PIN_HASH_ITERATIONS = 120000;
const PIN_HASH_BYTES = 32;
const PIN_SALT_BYTES = 16;

function cleanPin(value) {
  return String(value || '').trim();
}

function bytesToBase64Url(bytes) {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : globalThis.Buffer.from(binary, 'binary').toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');

  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : globalThis.Buffer.from(base64, 'base64').toString('binary');

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('Secure crypto is not available in this runtime');
  }

  return globalThis.crypto;
}

function constantTimeEqual(left, right) {
  const leftBytes = left || new Uint8Array();
  const rightBytes = right || new Uint8Array();
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return diff === 0;
}

async function derivePinBytes(pin, salt, iterations) {
  const crypto = getCrypto();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(cleanPin(pin)),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    PIN_HASH_BYTES * 8
  );

  return new Uint8Array(bits);
}

export function isHashedPin(value) {
  return cleanPin(value).startsWith(`${PIN_HASH_ALGORITHM}$`);
}

export async function hashPin(pin) {
  const crypto = getCrypto();
  const salt = new Uint8Array(PIN_SALT_BYTES);

  crypto.getRandomValues(salt);

  const hash = await derivePinBytes(pin, salt, PIN_HASH_ITERATIONS);

  return [
    PIN_HASH_ALGORITHM,
    String(PIN_HASH_ITERATIONS),
    bytesToBase64Url(salt),
    bytesToBase64Url(hash),
  ].join('$');
}

export async function normalizeStoredPin(pin) {
  const text = cleanPin(pin);

  if (!text) return '';
  if (isHashedPin(text)) return text;

  return hashPin(text);
}

export async function verifyPin(pin, storedPin) {
  const pinText = cleanPin(pin);
  const storedText = cleanPin(storedPin);

  if (!pinText || !storedText) return false;

  if (!isHashedPin(storedText)) {
    return pinText === storedText;
  }

  const [, iterationsText, saltText, hashText] = storedText.split('$');
  const iterations = Number(iterationsText);

  if (!iterations || !saltText || !hashText) return false;

  const salt = base64UrlToBytes(saltText);
  const expectedHash = base64UrlToBytes(hashText);
  const actualHash = await derivePinBytes(pinText, salt, iterations);

  return constantTimeEqual(actualHash, expectedHash);
}
