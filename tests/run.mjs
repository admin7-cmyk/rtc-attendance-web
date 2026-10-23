import { readdir } from 'node:fs/promises';

// Run without child processes, including in restricted Windows environments.
for (const file of (await readdir(new URL('.', import.meta.url))).filter((name) => name.endsWith('.test.mjs')).sort()) {
  await import(new URL(file, import.meta.url));
}
