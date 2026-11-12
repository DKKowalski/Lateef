import { createHash } from "node:crypto";
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
assert.ok((await stat(resolve(root, "site", "index.html"))).isFile(), "Missing site/index.html redirect");
const base = "https://dkkowalski.github.io/Lateef/";
for (const name of ["index.html", "install.html", "privacy.html", "security.html"]) {
  const html = await readFile(resolve(root, name), "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1].trim();
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1].trim();
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1].trim();
  assert.ok(title, `${name}: empty title`);
  assert.ok(description && description.length <= 155, `${name}: missing or too-long description`);
  assert.ok(canonical && canonical.startsWith(base), `${name}: missing canonical under ${base}`);
  assert.equal(html.match(/<main id="main"/g)?.length, 1, `${name}: needs exactly one <main id="main">`);
}
const sumsText = await readFile(resolve(root, "downloads", "SHA256SUMS"), "utf8");
const listed = new Map(sumsText.split("\n").filter(Boolean).map(line => { const m = line.match(/^([a-f0-9]{64})  (\S+)$/); assert.ok(m, `Bad SHA256SUMS line: ${line}`); return [m[2], m[1]]; }));
for (const path of all.filter(p => relative(resolve(root, "downloads"), p).split(sep)[0] !== ".." && !p.endsWith("SHA256SUMS"))) {
  const name = relative(resolve(root, "downloads"), path);
  assert.ok(listed.has(name), `Download missing from SHA256SUMS: ${name}`);
  assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), listed.get(name), `Checksum mismatch: ${name}`);
  listed.delete(name);
}
assert.equal(listed.size, 0, `SHA256SUMS lists missing files: ${[...listed.keys()]}`);
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
    assert.ok((await stat(target.endsWith(sep) ? resolve(target, "index.html") : target)).isFile(), `Missing target: ${value}`);
    if (targetURL.hash && target.endsWith('.html')) {
      const id = decodeURIComponent(targetURL.hash.slice(1));
      const targetText = await readFile(target, 'utf8');
      assert.ok(targetText.includes(`id="${id}"`) || targetText.includes(`id='${id}'`), `Missing anchor: ${value}`);
    }
    references++;
  }
}
console.log(`PASS: ${all.length} built files, ${references} relative links/assets, page and JavaScript checks.`);
