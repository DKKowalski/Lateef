import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, basename, extname, join, sep, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { defaultDirectory } from './state.mjs';
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const real = async path => realpath(path).catch(() => path);
const inside = (path, root) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
async function authorize(path) {
  const state = await real(defaultDirectory());
  if (inside(path, state)) throw new Error('Refusing to attach files from the Lateef state directory.');
  const roots = (process.env.LATEEF_UPLOAD_ROOTS || '').split(delimiter).filter(isAbsolute);
  if (process.env.LATEEF_UPLOAD_ROOTS) {
    for (const root of roots) if (inside(path, await real(root))) return;
    throw new Error('Path is outside LATEEF_UPLOAD_ROOTS; choose a file inside one of the allowed upload directories.');
  }
  if (path.split(sep).some(part => part.startsWith('.')) || inside(path, await real(join(homedir(), 'Library'))))
    throw new Error('Refusing to attach hidden files/directories or ~/Library by default. Set LATEEF_UPLOAD_ROOTS to an allowed directory to override.');
}
export async function readUploads(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 4) throw new Error('Choose 1–4 explicitly authorized local files.');
  const files = []; let total = 0;
  for (const given of paths) {
    if (typeof given !== 'string' || !isAbsolute(given)) throw new Error('File paths must be absolute.');
    let handle;
    try {
      const path = await realpath(given); await authorize(path);
      handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size + total > MAX_UPLOAD_BYTES) throw new Error('Only regular files totaling at most 25 MiB are supported.');
      const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_UPLOAD_BYTES - total + 1));
      let size = 0;
      while (size < buffer.length) { const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size); if (!bytesRead) break; size += bytesRead; }
      if (size > stat.size || size + total > MAX_UPLOAD_BYTES) throw new Error('File changed or upload limit exceeded; select it again.');
      const type = ({ '.pdf': 'application/pdf', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[extname(path).toLowerCase()] || 'application/octet-stream';
      files.push({ name: basename(path), type, data: buffer.subarray(0, size).toString('base64') }); total += size;
    } catch (error) { throw new Error(error.code ? 'A selected file could not be read. Choose an accessible regular file.' : error.message); }
    finally { await handle?.close(); }
  }
  return files;
}
