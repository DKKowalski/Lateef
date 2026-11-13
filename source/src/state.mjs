import { mkdir, readFile, writeFile, chmod, open, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';

export const secret = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const defaultDirectory = () => process.env.LATEEF_STATE_DIR || join(homedir(), '.config', 'lateef');

export async function loadState(directory = defaultDirectory()) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = join(directory, 'state.json');
  try {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ instanceId: secret(), adminToken: secret(), port: 45455, pairs: [] })); }
    finally { await file.close(); }
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  let state;
  for (let i = 0; i < 20; i++) {
    try { state = JSON.parse(await readFile(path, 'utf8')); break; }
    catch (error) { if (!(error instanceof SyntaxError) || i === 19) throw error; await new Promise(resolve => setTimeout(resolve, 25)); }
  }
  return { state, save: async () => {
    const temporary = path + '.' + secret().slice(0, 12);
    try { await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' }); await rename(temporary, path); }
    finally { await rm(temporary, { force: true }); }
  } };
}
