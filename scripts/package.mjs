import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
const files = {};
async function walk(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) await walk(join(dir, entry.name), key + '/');
    else files[key] = new Uint8Array(await readFile(join(dir, entry.name)));
  }
}
await walk('dist');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('artifacts', { recursive: true });
const output = `artifacts/yomihibi-v${version}.zip`;
await writeFile(output, zipSync(files, { level: 6 }));
console.log(`Extension package: ${output}`);
