import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { WebSocket } from 'ws';
import { Broker } from '../src/broker.mjs';
import { request } from '../src/client.mjs';

const origin = 'chrome-extension://' + 'a'.repeat(32);
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'lateef-test-'));
  const broker = await Broker.create(directory, { port: 0, timeout: 500, ...options }); await broker.start();
  t.after(async () => { await broker.stop(); await rm(directory, { recursive: true, force: true }); });
  return { broker, directory, base: `http://127.0.0.1:${broker.port}` };
}
async function pair(broker, base, code = broker.issueCode()) {
  const response = await fetch(base + '/pair', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ code, name: 'Test browser' }) });
  return { response, credentials: await response.json() };
}
async function extension(broker, credentials) {
  const socket = new WebSocket(`ws://127.0.0.1:${broker.port}/extension`, { origin }); await once(socket, 'open');
  const ready = once(socket, 'message'); socket.send(JSON.stringify({ type: 'hello', ...credentials, windowId: 7 })); await ready; return socket;
}
test('rejects unauthenticated RPC, web origins and invalid Host', async t => {
  const { broker, base } = await fixture(t);
  assert.equal((await fetch(base + '/status')).status, 401);
  assert.equal((await fetch(base + '/health', { headers: { origin: 'https://attacker.invalid' } })).status, 403);
  const invalidHost = await new Promise(resolve => {
    const req = httpRequest(base + '/health', { headers: { host: 'attacker.invalid' } }, res => { res.resume(); resolve(res.statusCode); }); req.end();
  });
  assert.equal(invalidHost, 403);
  assert.equal((await fetch(base + '/pair', { method: 'POST', body: '{}' })).status, 403);
  const health = await (await fetch(base + '/health')).json(); assert.equal(health.name, 'lateef');
  assert.equal('adminToken' in health, false);
  assert.deepEqual((await request(broker.state, '/status')).browsers, []);
});
test('pairing codes expire, are single use, and raw extension tokens are not persisted', async t => {
  const { broker, base, directory } = await fixture(t);
  const code = broker.issueCode(); broker.pairing.expires = Date.now() - 1;
  assert.equal((await pair(broker, base, code)).response.status, 403);
  const fresh = broker.issueCode(), { response, credentials } = await pair(broker, base, fresh);
  assert.equal(response.status, 200); assert.equal(typeof credentials.token, 'string');
  assert.equal((await pair(broker, base, fresh)).response.status, 403);
  assert.equal((await readFile(join(directory, 'state.json'), 'utf8')).includes(credentials.token), false);
});
test('authenticates extension and correlates browser errors without automatic action retries', async t => {
  const { broker, base } = await fixture(t);
  const { credentials } = await pair(broker, base);
  const bad = new WebSocket(`ws://127.0.0.1:${broker.port}/extension`, { origin }); await once(bad, 'open');
  const rejected = once(bad, 'close'); bad.send(JSON.stringify({ type: 'hello', pairId: credentials.pairId, token: 'wrong', windowId: 7 }));
  assert.equal((await rejected)[0], 1008);
  const socket = await extension(broker, credentials); t.after(() => socket.terminate());
  let count = 0;
  socket.on('message', raw => { const msg = JSON.parse(raw); if (msg.type === 'command') { count++; socket.send(JSON.stringify({ type: 'result', id: msg.id, ok: false, error: { code: 'WINDOW_CLOSED', message: 'Choose another window' } })); } });
  const { sessionId } = await request(broker.state, '/sessions', { name: 'Client' });
  const result = await request(broker.state, '/rpc', { sessionId, method: 'tabs', params: { action: 'new' } });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'WINDOW_CLOSED'); assert.equal(count, 1);
});
test('refuses profile switching on disconnect and rejects guessed session identifiers', async t => {
  const { broker, base } = await fixture(t); const { credentials } = await pair(broker, base);
  const socket = await extension(broker, credentials);
  socket.on('message', raw => { const msg = JSON.parse(raw); if (msg.type === 'command') socket.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, result: { tabs: [] } })); });
  const { sessionId } = await request(broker.state, '/sessions', { name: 'Client' });
  await request(broker.state, '/rpc', { sessionId, method: 'tabs', params: { action: 'list' } });
  const closed = once(socket, 'close'); socket.close(); await closed; await new Promise(resolve => setTimeout(resolve, 10));
  await assert.rejects(request(broker.state, '/rpc', { sessionId, method: 'tabs', params: { action: 'list' } }), /paired extension/);
  await assert.rejects(request(broker.state, '/rpc', { sessionId: 'guessed', method: 'tabs', params: {} }), /Unknown session/);
});
test('timeout is explicit, does not retry, and revocation closes extension access', async t => {
  const { broker, base } = await fixture(t, { timeout: 30 });
  const { credentials } = await pair(broker, base);
  const socket = await extension(broker, credentials); let actions = 0;
  socket.on('message', raw => { if (JSON.parse(raw).type === 'command') actions++; });
  const { sessionId } = await request(broker.state, '/sessions', { name: 'Client' });
  const result = await request(broker.state, '/rpc', { sessionId, method: 'tabs', params: { action: 'new' } });
  assert.equal(result.error.code, 'TIMEOUT'); assert.equal(actions, 1);
  const closed = once(socket, 'close'); await request(broker.state, '/revoke', { pairId: credentials.pairId });
  assert.equal((await closed)[0], 1008);
  assert.equal(broker.state.pairs.some(pair => pair.id === credentials.pairId), false);
});
test('legacy extension versions are visible and cannot receive upload commands', async t => {
 const {broker,base}=await fixture(t);const {credentials}=await pair(broker,base);const socket=await extension(broker,credentials);t.after(()=>socket.terminate());
 let commands=0;socket.on('message',raw=>{if(JSON.parse(raw).type==='command')commands++;});
 const status=await request(broker.state,'/status');assert.equal(status.browsers[0].version,'legacy');assert.deepEqual(status.browsers[0].capabilities,[]);
 const {sessionId}=await request(broker.state,'/sessions',{name:'Client'});
 await assert.rejects(request(broker.state,'/rpc',{sessionId,method:'upload',params:{}}),e=>e.code==='EXTENSION_OUTDATED');assert.equal(commands,0);
});
test('malformed extension frames close the socket without crashing the broker', async t => {
  const { broker, base } = await fixture(t); const { credentials } = await pair(broker, base);
  for (const frame of ['null', '[]', '42', 'not json']) for (const authed of [false, true]) {
    const socket = authed ? await extension(broker, credentials) : new WebSocket(`ws://127.0.0.1:${broker.port}/extension`, { origin });
    if (!authed) await once(socket, 'open');
    const closed = once(socket, 'close'); socket.send(frame);
    assert.equal((await closed)[0], 1008);
  }
  assert.equal((await request(broker.state, '/status')).connected, false);
  assert.equal((await fetch(base + '/health')).status, 200);
});
test('commands carry an absolute deadline near now plus the broker timeout', async t => {
  const { broker, base } = await fixture(t, { timeout: 400 });
  const { credentials } = await pair(broker, base);
  const socket = await extension(broker, credentials); t.after(() => socket.terminate());
  const seen = new Promise(resolve => socket.on('message', raw => { const msg = JSON.parse(raw); if (msg.type === 'command') resolve(msg); }));
  const { sessionId } = await request(broker.state, '/sessions', { name: 'Client' });
  const before = Date.now(); const call = request(broker.state, '/rpc', { sessionId, method: 'tabs', params: { action: 'new' } });
  const msg = await seen; await call;
  assert.equal(typeof msg.deadline, 'number'); assert.ok(msg.deadline >= before + 400 && msg.deadline <= Date.now() + 400);
});
test('broker and extension prove the pairing to each other without sending the token', async t => {
  const { proof } = await import('../src/broker.mjs');
  const { digest } = await import('../src/state.mjs');
  const { broker, base } = await fixture(t);
  const code = broker.issueCode(), nonce = 'ab'.repeat(16);
  // Pairing step one: the broker shows it issued the code before the extension sends it.
  const check = await (await fetch(base + '/pair', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ nonce }) })).json();
  assert.equal(check.proof, proof(digest(code), 'lateef-pair', nonce));
  const { credentials } = await pair(broker, base, code), key = digest(credentials.token);
  const socket = new WebSocket(`ws://127.0.0.1:${broker.port}/extension`, { origin }); t.after(() => socket.terminate()); await once(socket, 'open');
  const next = () => once(socket, 'message').then(([raw]) => JSON.parse(raw));
  let reply = next(); socket.send(JSON.stringify({ type: 'hello', pairId: credentials.pairId, nonce, windowId: 7 }));
  const challenge = await reply;
  assert.equal(challenge.type, 'challenge'); assert.equal(challenge.proof, proof(key, 'lateef-broker', nonce, challenge.nonce));
  reply = next(); socket.send(JSON.stringify({ type: 'auth', proof: proof(key, 'lateef-extension', challenge.nonce, nonce) }));
  assert.equal((await reply).type, 'ready');
  assert.equal((await request(broker.state, '/status')).connected, true);
  // A wrong proof is refused.
  const bad = new WebSocket(`ws://127.0.0.1:${broker.port}/extension`, { origin }); await once(bad, 'open');
  const first = once(bad, 'message'); bad.send(JSON.stringify({ type: 'hello', pairId: credentials.pairId, nonce, windowId: 7 })); await first;
  const closed = once(bad, 'close'); bad.send(JSON.stringify({ type: 'auth', proof: 'f'.repeat(64) }));
  assert.equal((await closed)[0], 1008);
});
