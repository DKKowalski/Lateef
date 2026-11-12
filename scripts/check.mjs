import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
}
const all = await files(root);
for (const name of ['index.html', 'install.html', 'privacy.html', 'security.html', '.nojekyll']) {
  assert.ok((await stat(resolve(root, name))).isFile(), `Missing ${name}`);
}
let references = 0;
for (const path of all) {
  if (path.endsWith('.js')) execFileSync(process.execPath, ['--check', path]);
  if (!/\.(html|css|svg)$/.test(path)) continue;
  const text = await readFile(path, 'utf8');
  const refs = [...text.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^\s)"']+)/g)];
  for (const match of refs) {
    const value = match[1] || match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) continue;
    assert.ok(!value.startsWith('/'), `Root-relative link breaks project Pages: ${value}`);
    const targetURL = new URL(value.replaceAll('&amp;', '&'), pathToFileURL(path));
    const target = fileURLToPath(targetURL);
    const inside = relative(root, target);
    assert.ok(inside !== '..' && !inside.startsWith(`..${sep}`), `Link leaves the site: ${value}`);
    assert.ok((await stat(target)).isFile(), `Missing target: ${value}`);
    if (targetURL.hash && target.endsWith('.html')) {
      const id = decodeURIComponent(targetURL.hash.slice(1));
      const targetText = await readFile(target, 'utf8');
      assert.ok(targetText.includes(`id="${id}"`) || targetText.includes(`id='${id}'`), `Missing anchor: ${value}`);
    }
    references++;
  }
}
console.log(`PASS: ${all.length} built files, ${references} relative links/assets, page and JavaScript checks.`);
