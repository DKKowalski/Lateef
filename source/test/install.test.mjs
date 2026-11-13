import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, exportExtension, launcher, invocation, mergeToml } from '../src/install.mjs';
import { VERSION } from '../src/version.mjs';

const home = () => mkdtemp(join(tmpdir(), 'lateef-install-'));

test('launcher pins npx copies and uses absolute paths otherwise', () => {
  const cached = launcher('/Users/a/.npm/_npx/abc/node_modules/lateef/bin/lateef.mjs', '/opt/node/bin/node');
  assert.equal(cached.command, join('/opt/node/bin', process.platform === 'win32' ? 'npx.cmd' : 'npx')); assert.deepEqual(cached.args, ['-y', 'lateef@' + VERSION, 'mcp']);
  assert.deepEqual(launcher('/src/lateef/bin/lateef.mjs', '/opt/node/bin/node'), { command: '/opt/node/bin/node', args: ['/src/lateef/bin/lateef.mjs', 'mcp'] });
  assert.equal(invocation('/Users/a/.npm/_npx/abc/node_modules/lateef/bin/lateef.mjs'), 'npx lateef');
  assert.equal(invocation('/usr/local/lib/node_modules/lateef/bin/lateef.mjs'), 'lateef');
  assert.equal(invocation('/src/lateef/bin/lateef.mjs'), 'node bin/lateef.mjs');
});

test('codex config keeps other tables and never duplicates the lateef table', async () => {
  const start = { command: '/n', args: ['/c', 'mcp'] };
  const once = mergeToml('model = "x"\n\n[mcp_servers.other]\ncommand = "o"\n\n[mcp_servers.lateef]\ncommand = "old"\n\n[mcp_servers.lateef.env]\nA = "1"\n\n[projects."/p"]\ntrust_level = "trusted"\n', start);
  assert.equal(once.match(/\[mcp_servers\.lateef/g).length, 1);
  assert.match(once, /\[mcp_servers\.other\]\ncommand = "o"/); assert.match(once, /\[projects\."\/p"\]\ntrust_level = "trusted"/); assert.doesNotMatch(once, /"old"|A = "1"/);
  assert.equal(mergeToml(once, start), once);
  const dir = await home(); await mkdir(join(dir, '.codex')); await writeFile(join(dir, '.codex', 'config.toml'), 'model = "x"\n');
  const previous = process.env.CODEX_HOME; delete process.env.CODEX_HOME;
  try { assert.match(await install('codex', { home: dir, files: true, path: '/src/lateef/bin/lateef.mjs' }), /previous version kept/); } finally { if (previous) process.env.CODEX_HOME = previous; }
  const written = await readFile(join(dir, '.codex', 'config.toml'), 'utf8');
  assert.match(written, /^model = "x"/); assert.match(written, /\[mcp_servers\.lateef\]/);
  assert.equal((await readdir(join(dir, '.codex'))).filter(name => name.includes('.before-lateef-')).length, 1);
});

test('cursor config is merged, backed up and rejects invalid JSON', async () => {
  const dir = await home(); await mkdir(join(dir, '.cursor'));
  await writeFile(join(dir, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'o' } }, keep: true }));
  const text = await install('cursor', { home: dir, path: '/src/lateef/bin/lateef.mjs', node: '/n' });
  assert.match(text, /Start a new Cursor session/);
  const config = JSON.parse(await readFile(join(dir, '.cursor', 'mcp.json'), 'utf8'));
  assert.deepEqual(config.mcpServers.other, { command: 'o' }); assert.equal(config.keep, true);
  assert.deepEqual(config.mcpServers.lateef, { command: '/n', args: ['/src/lateef/bin/lateef.mjs', 'mcp'] });
  await writeFile(join(dir, '.cursor', 'mcp.json'), '{broken');
  await assert.rejects(install('cursor', { home: dir }), /not valid JSON/);
  await assert.rejects(install('notepad', { home: dir }), /Usage: lateef install/);
});

test('extension export refreshes its own folder and refuses anyone else\'s', async () => {
  const dir = await home(), target = join(dir, 'lateef-extension');
  assert.match(await exportExtension(undefined, { home: dir }), /Load unpacked/);
  assert.equal(JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')).name, 'Lateef');
  await writeFile(join(target, 'stale.js'), ''); await exportExtension(target, { home: dir });
  assert.ok(!(await readdir(target)).includes('stale.js'));
  const other = join(dir, 'documents'); await mkdir(other); await writeFile(join(other, 'thesis.txt'), 'keep');
  await assert.rejects(exportExtension(other, { home: dir }), /already has other files/);
  assert.equal(await readFile(join(other, 'thesis.txt'), 'utf8'), 'keep');
});
