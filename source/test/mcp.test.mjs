import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadState } from '../src/state.mjs';
import { request } from '../src/client.mjs';

test('fresh MCP process starts its own broker automatically without a browser or model', { timeout: 15000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lateef-autostart-'));
  const storage = await loadState(directory);
  const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  storage.state.port = reservation.address().port; await new Promise(resolve => reservation.close(resolve)); await storage.save();
  const client = new Client({ name: 'autostart-test', version: '1.0' });
  t.after(async () => {
    await client.close();
    try { await request(storage.state, '/shutdown', {}); } catch {}
    await rm(directory, { recursive: true, force: true });
  });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('bin/lateef.mjs'), 'mcp'], env: { ...process.env, LATEEF_STATE_DIR: directory } }));
  const tools = await client.listTools(); assert.equal(tools.tools.length, 21);
  const status = await client.callTool({ name: 'browser_status', arguments: {} });
  assert.equal(JSON.parse(status.content[0].text).connected, false);
  const action = await client.callTool({ name: 'browser_tabs', arguments: { action: 'new', url: 'https://example.invalid/' } });
  assert.equal(action.isError, true); assert.match(action.content[0].text, /BROWSER_DISCONNECTED/);
});
