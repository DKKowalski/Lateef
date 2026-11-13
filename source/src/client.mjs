import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadState, defaultDirectory } from './state.mjs';

export async function request(state, path, body, timeout = 25000) {
  const res = await fetch(`http://127.0.0.1:${state.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${state.adminToken}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout),
  });
  const result = await res.json();
  if (!res.ok) throw Object.assign(new Error(result.error || 'Broker request failed'), { code: result.code || 'BROKER_ERROR' });
  return result;
}
export async function ensureBroker(directory = defaultDirectory()) {
  const storage = await loadState(directory);
  const alive = async () => {
    try {
      // Do not disclose credentials merely to discover what occupies a port.
      const response = await fetch(`http://127.0.0.1:${storage.state.port}/health`, { signal: AbortSignal.timeout(500) });
      const health = await response.json();
      return health.name === 'lateef' && health.instanceId === storage.state.instanceId;
    } catch { return false; }
  };
  if (!await alive()) {
    const cli = fileURLToPath(new URL('../bin/lateef.mjs', import.meta.url));
    const child = spawn(process.execPath, [cli, 'broker'], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, LATEEF_STATE_DIR: directory } });
    child.unref();
    for (let i = 0; i < 50; i++) { if (await alive()) return storage.state; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error('The local broker could not start. Check that its configured loopback port is available.');
  }
  return storage.state;
}
