import { VERSION, PROTOCOL } from './version.mjs';
import { createServer } from 'node:http';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { loadState, equal, digest, secret } from './state.mjs';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Both sides hold sha256(token): the broker stores it, the extension derives it. Each proves it to the other with an
// HMAC over the other side's fresh nonce, so the token itself never crosses the socket and an impostor on the port learns nothing.
export const proof = (key, ...parts) => createHmac('sha256', key).update(parts.join('\n')).digest('hex');
const nonceOK = value => typeof value === 'string' && /^[0-9a-f]{32,128}$/.test(value);

export class Broker {
  constructor(storage, options = {}) {
    this.storage = storage; this.state = storage.state;
    this.port = options.port ?? this.state.port;
    this.timeout = options.timeout ?? 20000;
    // A client that says it keeps a lease (beta.9+) and stops renewing it has died without closing (killed, crashed).
    // Its session ends so its tabs stop being tied to nobody; older clients without a lease are never expired.
    this.lease = options.lease ?? 60000;
    this.sessions = new Map(); this.pending = new Map(); this.extensions = new Map();
    this.pairing = null;
    this.http = createServer((req, res) => this.handle(req, res));
    this.ws = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });
    this.http.on('upgrade', (req, socket, head) => {
      if (!this.hostOK(req) || !this.extensionOrigin(req.headers.origin) || req.url !== '/extension') return socket.destroy();
      this.ws.handleUpgrade(req, socket, head, connection => this.connected(connection, req.headers.origin));
    });
  }
  static async create(directory, options) { return new Broker(await loadState(directory), options); }
  hostOK(req) { return req.headers.host === `127.0.0.1:${this.port}`; }
  extensionOrigin(origin) { return /^chrome-extension:\/\/[a-p]{32}$/.test(origin ?? ''); }
  admin(req) { return equal(req.headers.authorization, `Bearer ${this.state.adminToken}`); }
  json(res, code, body, origin) {
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    if (this.extensionOrigin(origin)) Object.assign(headers, { 'access-control-allow-origin': origin, 'vary': 'Origin' });
    res.writeHead(code, headers); res.end(JSON.stringify(body));
  }
  async body(req) {
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 40_000_000) throw new Error('Request too large'); }
    const body = JSON.parse(text || '{}');
    if (!isObject(body)) throw new Error('Request must be a JSON object');
    return body;
  }
  issueCode() {
    const code = randomBytes(12).toString('hex');
    this.pairing = { hash: digest(code), expires: Date.now() + 120000 };
    return code;
  }
  async handle(req, res) {
    const origin = req.headers.origin;
    try {
      if (!this.hostOK(req)) return this.json(res, 403, { error: 'Invalid Host' });
      if (origin && !this.extensionOrigin(origin)) return this.json(res, 403, { error: 'Web origins are not allowed' });
      if (req.method === 'OPTIONS' && this.extensionOrigin(origin)) {
        res.writeHead(204, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' }); return res.end();
      }
      if (req.method === 'GET' && req.url === '/health') return this.json(res, 200, { name: 'lateef', protocol: PROTOCOL, version: VERSION, instanceId: this.state.instanceId });
      if (req.method === 'POST' && req.url === '/pair') {
        if (!this.extensionOrigin(origin)) return this.json(res, 403, { error: 'Pair from the extension' });
        const body = await this.body(req);
        // Step one, from current extensions: show that this broker issued the pending code, before the code is sent.
        if (body.code === undefined && nonceOK(body.nonce)) {
          if (!this.pairing || Date.now() > this.pairing.expires) return this.json(res, 403, { error: 'No pairing code is waiting. Run lateef pair.' }, origin);
          return this.json(res, 200, { proof: proof(this.pairing.hash, 'lateef-pair', body.nonce) }, origin);
        }
        if (typeof body.code !== 'string' || !this.pairing || Date.now() > this.pairing.expires || !equal(digest(body.code), this.pairing.hash)) return this.json(res, 403, { error: 'Invalid or expired pairing code' }, origin);
        this.pairing = null;
        const token = secret(), pairId = randomUUID();
        // A new explicit pairing replaces access for this extension instance.
        const prior = this.state.pairs.filter(pair => pair.origin === origin);
        for (const pair of prior) { this.extensions.get(pair.id)?.socket.close(1008, 'Re-paired'); }
        this.state.pairs = this.state.pairs.filter(pair => pair.origin !== origin);
        this.state.pairs.push({ id: pairId, tokenHash: digest(token), origin, name: String(body.name || 'Chrome').slice(0, 80) });
        await this.storage.save();
        return this.json(res, 200, { pairId, token }, origin);
      }
      if (!this.admin(req)) return this.json(res, 401, { error: 'Authentication required' });
      if (req.method === 'POST' && req.url === '/pair-code') return this.json(res, 200, { code: this.issueCode(), expiresInSeconds: 120 });
      if (req.method === 'GET' && req.url === '/status') return this.json(res, 200, this.status());
      if (req.method === 'POST' && req.url === '/sessions') {
        const body = await this.body(req), id = randomUUID();
        this.sessions.set(id, { id, name: String(body.name || 'MCP client').slice(0, 80), pairId: null, lease: body.lease === true, seen: Date.now() });
        this.broadcastSessions(); return this.json(res, 200, { sessionId: id, ...(body.lease === true ? { leaseMs: this.lease } : {}) });
      }
      if (req.method === 'POST' && req.url === '/sessions/alive') {
        const session = this.sessions.get((await this.body(req)).sessionId);
        if (!session) return this.json(res, 404, { error: 'Unknown session', code: 'UNKNOWN_SESSION' });
        session.seen = Date.now(); return this.json(res, 200, { alive: true });
      }
      if (req.method === 'POST' && req.url === '/rpc') {
        const body = await this.body(req), session = this.sessions.get(body.sessionId);
        if (!session) return this.json(res, 404, { error: 'Unknown session', code: 'UNKNOWN_SESSION' });
        session.seen = Date.now();
        if (body.method === 'status') return this.json(res, 200, this.status());
        if (body.method === 'session.close' && !session.pairId) { this.sessions.delete(session.id); this.broadcastSessions(); return this.json(res, 200, { closed: true }); }
        if (body.method === 'session.close' && !this.extensions.has(session.pairId)) { this.sessions.delete(session.id); this.broadcastSessions(); return this.json(res, 200, { closed: true, cleanupPending: true }); }
        let extension;
        if (session.pairId) extension = this.extensions.get(session.pairId);
        else if (this.extensions.size === 1) { extension = [...this.extensions.values()][0]; session.pairId = extension.pair.id; }
        else if (this.extensions.size > 1) return this.json(res, 409, { error: 'Several browsers are connected. Select this session in the intended extension popup.', code: 'BROWSER_SELECTION_REQUIRED' });
        if (!extension) return this.json(res, 409, { error: 'Open your paired extension and connect an existing window.', code: 'BROWSER_DISCONNECTED' });
        if (body.method === 'upload' && !extension.capabilities.includes('upload')) return this.json(res, 409, { error: 'Reload the extension to enable uploads.', code: 'EXTENSION_OUTDATED' });
        const result = await this.command(extension, session.id, body.method, body.params ?? {});
        if (body.method === 'session.close') { this.sessions.delete(session.id); this.broadcastSessions(); }
        return this.json(res, 200, result);
      }
      if (req.method === 'POST' && req.url === '/revoke') {
        const { pairId } = await this.body(req);
        this.state.pairs = this.state.pairs.filter(pair => pair.id !== pairId);
        this.extensions.get(pairId)?.socket.close(1008, 'Revoked'); await this.storage.save();
        return this.json(res, 200, { revoked: true });
      }
      if (req.method === 'POST' && req.url === '/shutdown') {
        this.json(res, 200, { stopped: true }); setImmediate(() => this.stop()); return;
      }
      this.json(res, 404, { error: 'Not found' });
    } catch { this.json(res, 400, { error: 'Request failed or was malformed' }, origin); }
  }
  status() {
    return { version: VERSION, protocol: PROTOCOL, connected: this.extensions.size > 0,
      browsers: [...this.extensions.values()].map(x => ({ id: x.pair.id, name: x.pair.name, windowId: x.windowId, version: x.version, capabilities: x.capabilities })),
      sessions: [...this.sessions.values()].map(x => ({ id: x.id, name: x.name, browserId: x.pairId })) };
  }
  broadcastSessions() {
    for (const extension of this.extensions.values()) if (extension.socket.readyState === WebSocket.OPEN) extension.socket.send(JSON.stringify({ type: 'sessions', sessions: this.status().sessions }));
  }
  connected(socket, origin) {
    let extension, challenge;
    socket.on('error', () => socket.terminate());
    const timer = setTimeout(() => socket.close(1008, 'Authentication required'), 5000);
    const onMessage = async raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { socket.close(1008, 'Invalid JSON'); return; }
      if (!isObject(msg)) { socket.close(1008, 'Invalid message'); return; }
      if (!extension) {
        if (challenge) {
          if (msg.type !== 'auth' || !equal(msg.proof, proof(challenge.pair.tokenHash, 'lateef-extension', challenge.broker, challenge.hello.nonce))) return socket.close(1008, 'Authentication failed');
          msg = challenge.hello;
        } else {
          const pair = this.state.pairs.find(x => x.id === msg.pairId && x.origin === origin);
          if (msg.type !== 'hello' || !pair || !Number.isInteger(msg.windowId)) return socket.close(1008, 'Authentication failed');
          if (nonceOK(msg.nonce) && msg.token === undefined) {
            challenge = { pair, hello: msg, broker: randomBytes(32).toString('hex') };
            socket.send(JSON.stringify({ type: 'challenge', nonce: challenge.broker, proof: proof(pair.tokenHash, 'lateef-broker', msg.nonce, challenge.broker) })); return;
          }
          // Extensions before 0.2.0-beta.6 send the token itself.
          if (typeof msg.token !== 'string' || !equal(pair.tokenHash, digest(msg.token))) return socket.close(1008, 'Authentication failed');
        }
        const pair = challenge?.pair ?? this.state.pairs.find(x => x.id === msg.pairId && x.origin === origin);
        clearTimeout(timer);
        this.extensions.get(pair.id)?.socket.close(1000, 'New connection');
        extension = { pair, socket, windowId: msg.windowId, version: typeof msg.version === 'string' ? msg.version.slice(0, 40) : 'legacy', capabilities: Array.isArray(msg.capabilities) ? msg.capabilities.filter(x => typeof x === 'string').slice(0, 20) : [] }; this.extensions.set(pair.id, extension);
        socket.send(JSON.stringify({ type: 'ready' })); this.broadcastSessions(); return;
      }
      if (msg.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return; }
      if (msg.type === 'window' && Number.isInteger(msg.windowId)) { extension.windowId = msg.windowId; return; }
      if (msg.type === 'bind' && typeof msg.sessionId === 'string') {
        const session = this.sessions.get(msg.sessionId);
        if (session && (!session.pairId || session.pairId === extension.pair.id)) session.pairId = extension.pair.id;
        this.broadcastSessions(); return;
      }
      if (msg.type === 'result') {
        const pending = this.pending.get(msg.id);
        if (!pending || pending.socket !== socket) return;
        clearTimeout(pending.timer); this.pending.delete(msg.id);
        pending.resolve(msg.ok ? { ok: true, result: msg.result } : { ok: false, error: msg.error });
      }
    };
    socket.on('message', raw => onMessage(raw).catch(() => socket.close(1008, 'Malformed message')));
    socket.on('close', () => {
      clearTimeout(timer);
      if (extension && this.extensions.get(extension.pair.id)?.socket === socket) this.extensions.delete(extension.pair.id);
      for (const [id, pending] of this.pending) if (pending.socket === socket) { clearTimeout(pending.timer); this.pending.delete(id); pending.resolve({ ok: false, error: { code: 'BROWSER_DISCONNECTED', message: 'Browser disconnected; no retry was performed.' } }); }
    });
  }
  command(extension, sessionId, method, params) {
    const id = randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, error: { code: 'TIMEOUT', message: 'Browser did not answer. The action may have run; inspect state before retrying.' } }); }, this.timeout);
      this.pending.set(id, { resolve, timer, socket: extension.socket, sessionId });
      extension.socket.send(JSON.stringify({ type: 'command', id, sessionId, method, params, deadline: Date.now() + this.timeout }));
    });
  }
  async start() {
    await new Promise((resolve, reject) => { this.http.once('error', reject); this.http.listen(this.port, '127.0.0.1', resolve); });
    this.port = this.http.address().port;
    this.state.port = this.port; await this.storage.save();
    this.sweeper = setInterval(() => this.expire(), Math.max(Math.round(this.lease / 4), 50)); this.sweeper.unref();
    return this;
  }
  expire(now = Date.now()) {
    let gone = false;
    for (const session of this.sessions.values()) if (session.lease && now - session.seen > this.lease && ![...this.pending.values()].some(p => p.sessionId === session.id)) { this.sessions.delete(session.id); gone = true; }
    if (gone) this.broadcastSessions();
  }
  async stop() {
    clearInterval(this.sweeper);
    for (const socket of this.ws.clients) socket.terminate();
    this.ws.close(); await new Promise(resolve => this.http.close(resolve));
  }
}
