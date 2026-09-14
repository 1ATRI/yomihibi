import { build } from 'esbuild';
import { mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';

await mkdir('dist/icons', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('manifest.json', 'dist/manifest.json');
await cp('src/content.css', 'dist/content.css');
await cp('src/styles/ui.css', 'dist/ui.css');
await cp('node_modules/kuromoji/dict', 'dist/dict', { recursive: true });
await build({ entryPoints: ['src/background.js', 'src/popup.js', 'src/vocabulary.js', 'src/settings.js', 'src/demo.js', 'src/review.js'], bundle: true, outdir: 'dist', format: 'esm', platform: 'browser', target: 'chrome120', minify: true, legalComments: 'linked', loader: { '.css': 'text' } });
await build({ entryPoints: ['src/content.js'], bundle: true, outfile: 'dist/content.js', format: 'iife', platform: 'browser', target: 'chrome120', minify: true, legalComments: 'linked', loader: { '.css': 'text' } });
const icon = '<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="124" height="124" rx="29" fill="#315d4e"/><path d="M25 35Q45 30 64 40Q83 30 103 35V91Q83 85 64 96Q45 85 25 91Z" fill="#fbf9ec"/><path d="M64 40V95" stroke="#b9c8a8" stroke-width="3"/><path d="M35 48L53 50M35 60L53 62M35 72L49 73" stroke="#708f67" stroke-width="4" stroke-linecap="round"/><path d="M78 47L93 45V68L85 62L78 70Z" fill="#bb7853"/></svg>';
for (const size of [16, 48, 128]) await sharp(Buffer.from(icon)).resize(size).png().toFile(`dist/icons/${size}.png`);
await mkdir('dist/licenses', { recursive: true });
const licenseFiles = [
 ['node_modules/kuromoji/LICENSE-2.0.txt', 'kuromoji-Apache-2.0.txt'],
 ['node_modules/kuromoji/NOTICE.md', 'kuromoji-IPADIC-NOTICE.md'],
 ['node_modules/wanakana/LICENSE', 'wanakana-MIT.txt'],
 ['node_modules/fflate/LICENSE', 'fflate-MIT.txt'],
 ['node_modules/doublearray/LICENSE.txt', 'doublearray-license.txt'],
 ['node_modules/compromise/LICENSE', 'compromise-MIT.txt'],
 ['node_modules/efrt/LICENSE', 'efrt-MIT.txt'],
 ['node_modules/grad-school/LICENSE', 'grad-school-MIT.txt'],
 ['node_modules/suffix-thumb/LICENSE.txt', 'suffix-thumb-MIT.txt']
];
for (const [from, to] of licenseFiles) await cp(from, `dist/licenses/${to}`);
await cp('LICENSE', 'dist/LICENSE');
await cp('docs/PRIVACY.md', 'dist/PRIVACY.md');
console.log('Built Chrome / Edge extension in dist/');
