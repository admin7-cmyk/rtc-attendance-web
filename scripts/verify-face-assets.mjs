import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile(new URL('../public/models/face/manifest.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes);
for (const [name, expected] of Object.entries(manifest.model.assetHashes)) {
  assert.match(name, /^(blazeface|facemesh|faceres)\.(json|bin)$/);
  assert.equal(hash(await readFile(new URL(`../public/models/face/${name}`, import.meta.url))).digest('hex'), expected, `Asset changed: ${name}`);
}
assert.equal('sha256-' + hash(await readFile(new URL('../public/vendor/human/human-3.3.6.js', import.meta.url))).digest('base64'), manifest.scriptIntegrity);
console.log('PASS: all six model assets and pinned browser runtime match SHA256 manifest.');
