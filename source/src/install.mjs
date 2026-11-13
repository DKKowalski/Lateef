import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from './version.mjs';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/lateef.mjs', import.meta.url));
const bundled = fileURLToPath(new URL('../extension/', import.meta.url));
// Either separator: Windows accepts both, and a path may arrive in either form.
const parts = path => path.split(/[\\/]/);
const stamp = () => new Date().toISOString().replace(/[-:.]/g, '');

// How a client should start the MCP server. A copy inside the npx cache can be evicted,
// so that case goes back through npx with the version pinned to this one.
export function launcher(path = cli, node = process.execPath) {
  if (parts(path).includes('_npx')) return { command: join(dirname(node), process.platform === 'win32' ? 'npx.cmd' : 'npx'), args: ['-y', `lateef@${VERSION}`, 'mcp'] };
  return { command: node, args: [path, 'mcp'] };
}
// How the person should type further commands, matching the way they ran this one.
export function invocation(path = cli) {
  const segments = parts(path);
  if (segments.includes('_npx')) return 'npx lateef';
  return segments.includes('node_modules') ? 'lateef' : 'node bin/lateef.mjs';
}

async function backup(file) { try { await copyFile(file, `${file}.before-lateef-${stamp()}`); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function tool(name, args) { try { await exec(name, args); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw new Error(`${name} ${args.slice(0, 2).join(' ')} failed: ${(error.stderr || error.message).trim()}`); } }

export const tomlBlock = start => `[mcp_servers.lateef]\ncommand = ${JSON.stringify(start.command)}\nargs = ${JSON.stringify(start.args)}\nstartup_timeout_sec = 30\ntool_timeout_sec = 30\n`;
// Replace our own table (and nothing else) so repeated installs do not stack duplicates.
export function mergeToml(text, start) {
  const rest = text.replace(/^\[mcp_servers\.lateef(?:\.[^\]]+)?\][^]*?(?=^\[|(?![^]))/gm, '').trimEnd();
  return (rest ? rest + '\n\n' : '') + tomlBlock(start);
}

export const clients = {
  codex: {
    label: 'Codex',
    async register(start, { home, files }) {
      if (!files) {
        await tool('codex', ['mcp', 'remove', 'lateef']).catch(() => {});
        if (await tool('codex', ['mcp', 'add', 'lateef', '--', start.command, ...start.args])) return 'Registered with `codex mcp add`.';
      }
      const file = join(process.env.CODEX_HOME || join(home, '.codex'), 'config.toml');
      let text = ''; try { text = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const kept = await backup(file); await mkdir(dirname(file), { recursive: true }); await writeFile(file, mergeToml(text, start));
      return `Wrote ${file}${kept ? ' (previous version kept beside it)' : ''}.`;
    }
  },
  claude: {
    label: 'Claude Code',
    async register(start, { files }) {
      if (!files) {
        await tool('claude', ['mcp', 'remove', '--scope', 'user', 'lateef']).catch(() => {});
        if (await tool('claude', ['mcp', 'add', '--scope', 'user', 'lateef', '--', start.command, ...start.args])) return 'Registered with `claude mcp add` for your user.';
      }
      throw new Error(`The claude command was not found. Install Claude Code, or run: claude mcp add --scope user lateef -- ${[start.command, ...start.args].map(part => JSON.stringify(part)).join(' ')}`);
    }
  },
  cursor: {
    label: 'Cursor',
    async register(start, { home }) {
      const file = join(home, '.cursor', 'mcp.json');
      let config = {}; try { config = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error(`${file} is not valid JSON; fix it or add the lateef entry by hand.`); }
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`${file} must contain a JSON object.`);
      const kept = await backup(file);
      config.mcpServers = { ...config.mcpServers, lateef: start };
      await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(config, null, 2) + '\n');
      return `Wrote ${file}${kept ? ' (previous version kept beside it)' : ''}.`;
    }
  }
};

export async function install(name, { home = homedir(), files = false, path = cli, node = process.execPath } = {}) {
  const client = clients[name];
  if (!client) throw new Error(`Usage: lateef install <${Object.keys(clients).join('|')}>. For another MCP client, run lateef config and paste the result into its settings.`);
  const done = await client.register(launcher(path, node), { home, files }), self = invocation(path);
  return `${done}\n\nNext:\n1. ${self} extension   (copies the extension to a folder; load it in chrome://extensions with Developer mode → Load unpacked. Skip if Lateef is already loaded.)\n2. ${self} pair        (enter the code in the Lateef popup, in the Chrome window you want to share)\n3. Start a new ${client.label} session and ask it to call browser_status.`;
}

// Chrome needs a folder that stays put; the copy inside an npm or npx cache does not.
// The full control build is the same extension with Chrome's debugger permission and its own name, so the standard
// one never asks for it.
export const fullManifest = manifest => ({ ...manifest, name: 'Lateef (full control)', description: 'Lateef with opt-in screenshots, real input, scripts and logs through Chrome\'s debugger.', permissions: [...new Set([...manifest.permissions, 'debugger'])], action: { ...manifest.action, default_title: 'Lateef (full control)' } });
export async function exportExtension(target, { home = homedir(), source = bundled, full = false } = {}) {
  const directory = target || join(home, full ? 'lateef-extension-full' : 'lateef-extension');
  let existing = []; try { existing = await readdir(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing.length) {
    let ours = false; try { ours = String(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')).name).startsWith('Lateef'); } catch {}
    if (!ours) throw new Error(`${directory} already has other files in it. Choose an empty folder: lateef extension <folder>`);
    await rm(directory, { recursive: true });
  }
  await mkdir(directory, { recursive: true }); await cp(source, directory, { recursive: true });
  if (full) { const file = join(directory, 'manifest.json'); await writeFile(file, JSON.stringify(fullManifest(JSON.parse(await readFile(file, 'utf8'))), null, 2) + '\n'); }
  return `Lateef ${full ? 'full control ' : ''}extension ${VERSION} is in ${directory}\n\nIn Chrome: open chrome://extensions, turn on Developer mode, choose Load unpacked and select that folder.\nAlready loaded from there? Press its reload button instead. Keep the folder in place.`;
}
