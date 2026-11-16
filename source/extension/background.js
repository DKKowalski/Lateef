import { domCommand } from './dom.js';
import { presenceCommand } from './presence.js';

let socket, reconnecting = false, backoff = 1000, sessions = [], status = 'Disconnected';
let heartbeat;
let work = Promise.resolve();
function enqueue(fn) { work = work.catch(() => {}).then(fn); return work; }
const metadata = tab => ({ tabId: tab.id, windowId: tab.windowId, title: tab.title, url: tab.url });
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const nonce = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
async function hmac(key, ...parts) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(parts.join('\n'))));
}
async function settings() { return (await chrome.storage.local.get('connection')).connection; }
async function ownership() { return (await chrome.storage.session.get('ownership')).ownership || {}; }
async function saveOwnership(value) { await chrome.storage.session.set({ ownership: value }); badge(value); }
// Presence: how the person can tell an agent is working. The toolbar badge counts controlled tabs; agent-created tabs
// sit in a "Lateef" tab group; controlled pages carry a small chip that says what the agent is doing and a flag that marks where it acts. None of it may fail a command.
function badge(records) {
  const count = Object.keys(records).length;
  chrome.action.setBadgeBackgroundColor({ color: '#ff4d21' }).catch(() => {});
  chrome.action.setBadgeText({ text: count ? String(count) : '' }).catch(() => {});
  chrome.action.setTitle({ title: count ? `Lateef: an agent has ${count} tab${count > 1 ? 's' : ''}` : 'Lateef' }).catch(() => {});
}
async function presenceOn() { return (await chrome.storage.local.get('presence')).presence !== false; }
async function presence(tabId, action, detail = {}) {
  if (action !== 'remove' && !(await presenceOn())) return;
  try { await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', func: presenceCommand, args: [action, detail] }); } catch { /* restricted or closing page */ }
}
async function group(tab) {
  if (!(await presenceOn())) return;
  try {
    const [existing] = await chrome.tabGroups.query({ windowId: tab.windowId, title: 'Lateef' });
    const groupId = await chrome.tabs.group(existing ? { tabIds: [tab.id], groupId: existing.id } : { tabIds: [tab.id], createProperties: { windowId: tab.windowId } });
    if (!existing) await chrome.tabGroups.update(groupId, { title: 'Lateef', color: 'orange' });
  } catch { /* grouping is cosmetic */ }
}
function urlAllowed(url) { try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; } }
async function loaded(tabId) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return { ...metadata(tab), loading: false };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return { ...metadata(await chrome.tabs.get(tabId)), loading: true };
}

async function selectedWindow() {
  const config = await settings();
  if (!config) fail('NOT_PAIRED', 'Pair the extension first.');
  try { return await chrome.windows.get(config.windowId); }
  catch { fail('WINDOW_CLOSED', 'The selected window was closed. Choose a window in the extension popup.'); }
}
async function owned(sessionId, tabId) {
  const records = await ownership(), record = records[tabId];
  if (!record || record.sessionId !== sessionId) fail('TAB_NOT_SHARED', 'This tab does not belong to this session.');
  const window = await selectedWindow();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) fail('TAB_CLOSED', 'The owned tab was closed.');
  if (tab.windowId !== window.id) fail('WINDOW_CHANGED', 'This tab is outside the selected window.');
  return tab;
}
// Downloads: Chrome does not say which tab started a download, so one that begins soon after a session's click, key
// press or navigation is attributed to that session. Sites such as Gmail prepare the file first or go through a redirect
// tab, so the window is fifteen seconds. A session can list only those.
let downloadWatch = null;
function watchDownloads(sessionId) { if (chrome.downloads) downloadWatch = { sessionId, until: Date.now() + 15000 }; }
chrome.downloads?.onCreated.addListener(async item => {
  const watch = downloadWatch; if (!watch || Date.now() > watch.until) return;
  const store = (await chrome.storage.session.get('downloads')).downloads || {};
  (store[watch.sessionId] ||= []).push(item.id); await chrome.storage.session.set({ downloads: store });
});
async function listDownloads(sessionId) {
  if (!chrome.downloads) fail('DOWNLOADS_UNAVAILABLE', 'Reload the Lateef extension to enable downloads.');
  const ids = ((await chrome.storage.session.get('downloads')).downloads || {})[sessionId] || [], items = [];
  for (const id of ids.slice(-25)) { const [item] = await chrome.downloads.search({ id }); if (item) items.push({ id, file: item.filename, url: item.finalUrl || item.url, mime: item.mime, state: item.state, bytesReceived: item.bytesReceived, totalBytes: item.totalBytes, ...(item.danger && item.danger !== 'safe' ? { danger: item.danger } : {}), ...(item.error ? { error: item.error } : {}) }); }
  return { downloads: items };
}

// Full control: screenshots, real input, scripts and logs through Chrome's debugger. Only the full control build has the
// permission, the person must switch it on in the popup, and it attaches to a tab only when a tool first needs it.
const full = { attached: new Set(), logs: new Map(), requests: new Map(), scale: new Map() };
async function fullState() { return { available: !!chrome.debugger, on: !!chrome.debugger && (await chrome.storage.local.get('fullControl')).fullControl === true }; }
async function attach(tabId) {
  const state = await fullState();
  if (!state.available) fail('FULL_CONTROL_UNAVAILABLE', 'This tool needs the Lateef full control extension. Run "lateef extension --full", load that folder at chrome://extensions and pair it.');
  if (!state.on) fail('FULL_CONTROL_OFF', 'Full control is switched off. Ask the person to turn it on in the Lateef popup.');
  if (full.attached.has(tabId)) return;
  try { await chrome.debugger.attach({ tabId }, '1.3'); } catch (error) { if (!/already attached/i.test(error.message)) fail('DEBUGGER_BUSY', 'Chrome could not attach to this tab: ' + error.message); }
  full.attached.add(tabId); full.logs.set(tabId, []); full.requests.set(tabId, []);
  for (const domain of ['Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable']) await chrome.debugger.sendCommand({ tabId }, domain).catch(() => {});
  // Lets a background tab behave as if focused, so typing and focus-dependent widgets work without activating it.
  await chrome.debugger.sendCommand({ tabId }, 'Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
}
async function detach(tabId) { if (!full.attached.delete(tabId)) return; full.logs.delete(tabId); full.requests.delete(tabId); full.scale.delete(tabId); await chrome.debugger?.detach({ tabId }).catch(() => {}); }
const cdp = (tabId, method, params) => Promise.race([chrome.debugger.sendCommand({ tabId }, method, params), new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`Chrome did not answer ${method} in time.`), { code: 'CDP_TIMEOUT' })), 10000))]);
const keep = (list, entry) => { list.push(entry); if (list.length > 300) list.shift(); };
chrome.debugger?.onEvent.addListener((source, method, params) => {
  const logs = full.logs.get(source.tabId), requests = full.requests.get(source.tabId); if (!logs) return;
  if (method === 'Runtime.consoleAPICalled') keep(logs, { level: params.type, text: params.args.map(arg => arg.value !== undefined ? String(arg.value) : arg.description || arg.type).join(' ').slice(0, 1000) });
  else if (method === 'Runtime.exceptionThrown') keep(logs, { level: 'exception', text: String(params.exceptionDetails.exception?.description || params.exceptionDetails.text).slice(0, 1000) });
  else if (method === 'Log.entryAdded') keep(logs, { level: params.entry.level, text: String(params.entry.text).slice(0, 1000), ...(params.entry.url ? { url: params.entry.url } : {}) });
  else if (method === 'Network.requestWillBeSent') keep(requests, { id: params.requestId, method: params.request.method, url: params.request.url.slice(0, 500), type: params.type });
  else if (method === 'Network.responseReceived') { const entry = requests.findLast(r => r.id === params.requestId); if (entry) { entry.status = params.response.status; entry.mime = params.response.mimeType; } }
  else if (method === 'Network.loadingFailed') { const entry = requests.findLast(r => r.id === params.requestId); if (entry) entry.failed = params.errorText; }
});
chrome.debugger?.onDetach.addListener(source => { full.attached.delete(source.tabId); full.logs.delete(source.tabId); full.requests.delete(source.tabId); });
const KEYS = { Enter: [13, '\r'], Tab: [9], Escape: [27], Backspace: [8], Delete: [46], ArrowUp: [38], ArrowDown: [40], ArrowLeft: [37], ArrowRight: [39], Home: [36], End: [35], PageUp: [33], PageDown: [34], ' ': [32, ' '] };
async function fullCommand(tab, method, params) {
  const tabId = tab.id;
  if (method === 'screenshot') {
    const view = (await cdp(tabId, 'Runtime.evaluate', { expression: '({w:innerWidth,h:innerHeight,d:devicePixelRatio,x:scrollX,y:scrollY,full:document.documentElement.scrollHeight})', returnByValue: true })).result.value;
    // One image pixel per CSS pixel, so coordinates read off the image are the ones browser_input takes.
    // Lateef's own chip and flag are hidden for the capture, so the agent sees the page as it is.
    const marker = hidden => chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', func: hide => document.querySelector('html > lateef-presence')?.style.setProperty('visibility', hide ? 'hidden' : 'visible', 'important'), args: [hidden] }).catch(() => {});
    // Capped at 1280 on the long edge: larger images are shrunk by model providers anyway, which would put every
    // coordinate off. browser_input converts from this image's pixels, so the model can point at what it sees.
    const scale = Math.min(1, Number(params.scale) > 0 ? Number(params.scale) : 1, 1280 / Math.max(view.w, view.h)); full.scale.set(tabId, scale);
    let quality = 60, shot;
    await marker(true);
    try { for (;;) { shot = await cdp(tabId, 'Page.captureScreenshot', { format: 'jpeg', quality, clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: scale / view.d } }); if (shot.data.length < 700000 || quality <= 20) break; quality -= 20; } }
    finally { await marker(false); }
    return { image: shot.data, mimeType: 'image/jpeg', width: Math.round(view.w * scale), height: Math.round(view.h * scale), scale, viewport: { width: view.w, height: view.h }, scrollY: Math.round(view.y), pageHeight: view.full, title: tab.title, url: tab.url };
  }
  if (method === 'evaluate') {
    const out = await cdp(tabId, 'Runtime.evaluate', { expression: String(params.code), awaitPromise: true, returnByValue: true, userGesture: true, timeout: 8000 });
    if (out.exceptionDetails) fail('PAGE_ERROR', String(out.exceptionDetails.exception?.description || out.exceptionDetails.text).slice(0, 1000));
    const text = out.result.value === undefined ? String(out.result.description ?? 'undefined') : JSON.stringify(out.result.value);
    return { type: out.result.type, value: text.slice(0, 20000), truncated: text.length > 20000 };
  }
  if (method === 'console' || method === 'network') {
    const list = (method === 'console' ? full.logs : full.requests).get(tabId) || [];
    let pattern; try { pattern = params.pattern ? new RegExp(params.pattern, 'i') : null; } catch { fail('BAD_PATTERN', 'pattern is not a valid regular expression.'); }
    const shown = list.filter(entry => !pattern || pattern.test(method === 'console' ? entry.text : entry.url)).slice(-Math.min(params.limit || 50, 200)).map(({ id, ...entry }) => entry);
    if (params.clear) list.length = 0;
    return { [method === 'console' ? 'messages' : 'requests']: shown, held: list.length, note: 'Collected since full control first touched this tab.' };
  }
  // input
  // Coordinates arrive in the pixels of this tab's latest screenshot unless units is "css".
  const k = params.units === 'css' ? 1 : full.scale.get(tabId) || 1;
  const { action } = params, at = { x: Number(params.x) / k, y: Number(params.y) / k }, needsPoint = ['click', 'double_click', 'right_click', 'move', 'drag'].includes(action);
  if (needsPoint && !(Number.isFinite(at.x) && Number.isFinite(at.y))) fail('BAD_INPUT', 'This action needs x and y in CSS pixels, as read from a screenshot.');
  const mouse = (type, extra = {}) => cdp(tabId, 'Input.dispatchMouseEvent', { type, x: at.x, y: at.y, ...extra });
  if (needsPoint) await presence(tabId, 'point', { method: 'input', at, shared: false });
  if (action === 'move') { await mouse('mouseMoved'); return { moved: at }; }
  if (action === 'click' || action === 'right_click' || action === 'double_click') {
    const button = action === 'right_click' ? 'right' : 'left';
    await mouse('mouseMoved');
    for (const clickCount of action === 'double_click' ? [1, 2] : [1]) { await mouse('mousePressed', { button, clickCount }); await mouse('mouseReleased', { button, clickCount }); }
    return { [action]: at };
  }
  if (action === 'drag') {
    const to = { x: Number(params.toX) / k, y: Number(params.toY) / k }; if (!(Number.isFinite(to.x) && Number.isFinite(to.y))) fail('BAD_INPUT', 'drag needs toX and toY.');
    await mouse('mouseMoved'); await mouse('mousePressed', { button: 'left', clickCount: 1 });
    for (let step = 1; step <= 8; step++) await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x + (to.x - at.x) * step / 8, y: at.y + (to.y - at.y) * step / 8, button: 'left', buttons: 1 });
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
    return { dragged: { from: at, to } };
  }
  if (action === 'scroll') {
    const view = (await cdp(tabId, 'Runtime.evaluate', { expression: '({w:innerWidth,h:innerHeight})', returnByValue: true })).result.value;
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: Number.isFinite(at.x) ? at.x : view.w / 2, y: Number.isFinite(at.y) ? at.y : view.h / 2, deltaX: Number(params.deltaX) || 0, deltaY: Number(params.deltaY) || 0 });
    return { scrolled: { deltaX: Number(params.deltaX) || 0, deltaY: Number(params.deltaY) || 0 } };
  }
  if (action === 'type' || action === 'key') {
    const secret = (await cdp(tabId, 'Runtime.evaluate', { expression: 'document.activeElement?.matches?.("input[type=password]")===true', returnByValue: true })).result.value;
    if (secret) fail('SENSITIVE_INPUT', 'Password fields are not typed into. Ask the person to enter it.');
  }
  if (action === 'type') { await cdp(tabId, 'Input.insertText', { text: String(params.text ?? '') }); return { typed: String(params.text ?? '').length }; }
  if (action === 'key') {
    const parts = String(params.key || '').split('+'), key = parts.pop() || '+', names = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Command: 4, Cmd: 4, Shift: 8 };
    let modifiers = 0; for (const part of parts) { if (!names[part]) fail('BAD_KEY', 'Unknown modifier ' + part); modifiers |= names[part]; }
    if (!KEYS[key] && key.length !== 1) fail('BAD_KEY', 'Use one character or Enter, Tab, Escape, Backspace, Delete, Home, End, PageUp, PageDown or an arrow key, optionally with Control+, Meta+, Alt+ or Shift+.');
    const [code, text] = KEYS[key] || [key.toUpperCase().charCodeAt(0), modifiers & ~8 ? undefined : key];
    const event = { key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers, code: KEYS[key] ? (key === ' ' ? 'Space' : key) : /[a-z]/i.test(key) ? 'Key' + key.toUpperCase() : /\d/.test(key) ? 'Digit' + key : '' };
    await cdp(tabId, 'Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...event, ...(text ? { text } : {}) }); await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    return { key: params.key };
  }
  fail('BAD_INPUT', 'action must be click, double_click, right_click, move, drag, scroll, type or key.');
}

// Snapshots and finds read every frame of the tab. The top document comes first; each iframe that has anything in it
// follows under a "frame" line, with its references prefixed so that a later action is sent to the right frame.
async function readFrames(tabId, method, params) {
  const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: params.frames !== false }, world: 'ISOLATED', func: domCommand, args: [method, params] });
  const top = results.find(entry => entry.frameId === 0)?.result;
  if (top?.__quietError) fail(top.__quietError.code, top.__quietError.message);
  if (top === undefined) fail('DOM_NO_RESULT', 'The page did not return a DOM result. It may have navigated.');
  const frames = results.filter(entry => entry.frameId !== 0 && entry.result && !entry.result.__quietError && !entry.result.selectorMissing).slice(0, 12);
  if (top.selectorMissing && !frames.length) fail('NO_SELECTOR_MATCH', `Nothing on the page matches ${params.selector}.`);
  const tag = (frameId, node) => ({ ...node, ref: `f${frameId}.${node.ref}`, frameId });
  if (method === 'find') {
    const limit = Math.min(params.limit || 20, 50);
    for (const { frameId, result } of frames) { top.matches.push(...result.matches.map(node => tag(frameId, node))); if (result.truncated) { top.truncated = true; top.truncationReasons = [...new Set([...top.truncationReasons, ...result.truncationReasons])]; } }
    top.matches = top.matches.slice(0, limit); return top;
  }
  const reasons = new Set(top.truncationReasons); let text = top.text;
  for (const { frameId, result } of frames) {
    if (!result.nodes.length && result.text.length < 40) continue; // empty or decorative frame
    if (top.nodes.length + result.nodes.length > 300) { reasons.add('nodeLimit'); continue; }
    top.nodes.push(...result.nodes.map(node => tag(frameId, node)));
    text += `\nframe ${JSON.stringify(result.title || '')} ${result.url}\n` + result.text.replace(/\[(e[a-z0-9]+_\d+)\]/g, `[f${frameId}.$1]`);
    for (const reason of result.truncationReasons) reasons.add(reason);
  }
  if (text.length > top.limits.maxChars) { text = text.slice(0, top.limits.maxChars); reasons.add('maxChars'); }
  return { ...top, text, truncated: reasons.size > 0, truncationReasons: [...reasons] };
}
// Waits look in every frame (a payments or editor iframe is often where the text lands), checking from here so one
// slow frame cannot hold the others. The result names the page it was met on, so a stale client-rendered view shows.
async function waitFrames(tabId, params) {
  const limit = Math.min(Math.max(params.timeoutMs || 5000, 100), 10000), start = Date.now(), gone = params.gone === true;
  for (;;) {
    const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: params.frames !== false }, world: 'ISOLATED', func: domCommand, args: ['has', params] }).catch(() => []);
    const hits = results.filter(entry => entry.result?.present), met = gone ? !hits.length && results.length > 0 : hits.length > 0;
    if (met || Date.now() - start >= limit) {
      const tab = await chrome.tabs.get(tabId);
      return { met, waitedMs: Date.now() - start, title: tab.title, url: tab.url, ...(met && !gone && hits[0].frameId ? { frameId: hits[0].frameId } : {}) };
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
async function dispatch(sessionId, method, params) {
  const records = await ownership();
  if (method === 'session.close') {
    for (const [id, record] of Object.entries(records)) if (record.sessionId === sessionId) {
      await detach(Number(id));
      if (record.created) await chrome.tabs.remove(Number(id)).catch(() => {}); else await presence(Number(id), 'remove');
      delete records[id];
    }
    const kept = (await chrome.storage.session.get('downloads')).downloads || {}; if (kept[sessionId]) { delete kept[sessionId]; await chrome.storage.session.set({ downloads: kept }); }
    await saveOwnership(records); return { closed: true };
  }
  const window = await selectedWindow();
  if (method === 'downloads') return listDownloads(sessionId);
  if (method === 'tabs') {
    if (params.action === 'new') {
      watchDownloads(sessionId);
      if (params.url && !urlAllowed(params.url)) fail('URL_BLOCKED', 'Use an http(s) URL.');
      const tab = await chrome.tabs.create({ windowId: window.id, active: false, url: params.url || 'about:blank' });
      records[tab.id] = { sessionId, created: true }; await saveOwnership(records); await group(tab); return params.url ? loaded(tab.id) : metadata(tab);
    }
    if (params.action === 'close') {
      await owned(sessionId, params.tabId);
      if (!records[params.tabId]?.created) fail('NOT_OWNED', 'Shared user tabs are detached on session close, never closed by the agent.');
      await chrome.tabs.remove(params.tabId); delete records[params.tabId]; await saveOwnership(records); return { closed: params.tabId };
    }
    if (params.action !== 'list') fail('BAD_ACTION', 'Use list, new, or close.');
    const tabs = await chrome.tabs.query({ windowId: window.id });
    return { tabs: tabs.filter(tab => records[tab.id]?.sessionId === sessionId).map(metadata) };
  }
  const tab = await owned(sessionId, params.tabId);
  if (method === 'history') {
    if (!['back', 'forward', 'reload'].includes(params.action)) fail('BAD_ACTION', 'Use back, forward or reload.');
    watchDownloads(sessionId);
    // Chrome's own back button skips pages the person never interacted with, which is every page an agent visits.
    // history.back() in the page moves exactly one entry, so that is used instead.
    if (params.action === 'reload') await chrome.tabs.reload(tab.id);
    else {
      if (!urlAllowed(tab.url)) fail('URL_BLOCKED', 'History works on http(s) pages only.');
      const before = tab.url, step = params.action === 'back' ? -1 : 1;
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', func: delta => { history.go(delta); }, args: [step] });
      const end = Date.now() + 2500; let moved = false;
      while (Date.now() < end && !moved) { await new Promise(resolve => setTimeout(resolve, 100)); moved = (await chrome.tabs.get(tab.id)).url !== before; }
      if (!moved) fail('NO_HISTORY', `There is no page to go ${params.action} to.`);
    }
    await new Promise(resolve => setTimeout(resolve, 200)); return loaded(tab.id);
  }
  if (['screenshot', 'input', 'evaluate', 'console', 'network'].includes(method)) {
    await attach(tab.id);
    if (!(method === 'input' && ['click', 'double_click', 'right_click', 'move', 'drag'].includes(params.action))) await presence(tab.id, 'note', { method, shared: !records[tab.id].created });
    if (method === 'input') watchDownloads(sessionId);
    return fullCommand(tab, method, params);
  }
  if (method === 'navigate') {
    watchDownloads(sessionId);
    if (!urlAllowed(params.url)) fail('URL_BLOCKED', 'Use an http(s) URL.');
    await chrome.tabs.update(tab.id, { url: params.url }); // Never changes active/focused.
    return loaded(tab.id);
  }
  if (!urlAllowed(tab.url)) fail('URL_BLOCKED', 'DOM tools operate on http(s) pages only.');
  if (method === 'upload' && new URL(tab.url).origin !== params.expectedOrigin) fail('ORIGIN_MISMATCH', 'The tab is no longer at the expected destination origin.');
  if (!['snapshot', 'find', 'text', 'wait', 'scroll', 'hover', 'press', 'fill', 'click', 'upload'].includes(method)) fail('UNKNOWN_METHOD', 'Unknown browser operation');
  // A reference from inside an iframe carries its frame: "f<frameId>.<ref>". Everything else runs in the top document.
  const framed = /^f(\d+)\.(.+)$/.exec(params.ref || ''), frameId = framed ? Number(framed[1]) : 0;
  if (framed) params = { ...params, ref: framed[2] };
  await presence(tab.id, params.ref && !framed ? 'point' : 'note', { method, ref: params.ref, shared: !records[tab.id].created });
  if (method === 'click' || method === 'press') watchDownloads(sessionId);
  if (method === 'snapshot' || method === 'find') return readFrames(tab.id, method, params);
  if (method === 'wait') return waitFrames(tab.id, params);
  if (method === 'upload' && Array.isArray(params.files)) {
    // Files over about a megabyte go to the page in pieces first; the upload then refers to them by key.
    const files = [];
    for (const file of params.files) {
      if (typeof file.data !== 'string' || file.data.length <= 1398100) { files.push(file); continue; }
      const key = crypto.randomUUID();
      for (let offset = 0; offset < file.data.length; offset += 1398100) await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frameId] }, world: 'ISOLATED', func: domCommand, args: ['stage', { key, part: file.data.slice(offset, offset + 1398100) }] });
      files.push({ name: file.name, type: file.type, staged: key });
    }
    params = { ...params, files };
  }
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frameId] }, world: 'ISOLATED', func: domCommand, args: [method, params] });
  const result = results[0]?.result;
  if (result?.__quietError) fail(result.__quietError.code, result.__quietError.message);
  if (result === undefined) fail('DOM_NO_RESULT', 'The page did not return a DOM result. It may have navigated.');
  if (method === 'click' && result.openUrl) {
    if (!urlAllowed(result.openUrl)) fail('URL_BLOCKED', 'Only http(s) links can open a background tab.');
    watchDownloads(sessionId); // a download link opened in a new tab
    const opened = await chrome.tabs.create({ windowId: window.id, active: false, url: result.openUrl });
    records[opened.id] = { sessionId, created: true }; await saveOwnership(records); await group(opened);
    return { opened: await loaded(opened.id) };
  }
  return result;
}

async function connect() {
  if (reconnecting || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  reconnecting = true;
  try {
    const config = await settings(); if (!config) { chrome.alarms.clear('reconnect'); return; }
    // A suspended or restarted worker gets no close event (sleep, idle shutdown), so a standing alarm is what brings the connection back.
    chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
    clearInterval(heartbeat);
    const connection = new WebSocket(`ws://127.0.0.1:${config.port}/extension`);
    socket = connection;
    // The broker must prove it holds this pairing before Lateef accepts a command from it; the token is never sent.
    const mine = nonce(), key = sha256(config.token); let verified = false;
    connection.onopen = () => connection.send(JSON.stringify({ type: 'hello', pairId: config.pairId, nonce: mine, windowId: config.windowId, version: chrome.runtime.getManifest().version, capabilities: ['snapshot-v2', 'link-destinations', 'upload', 'presence', 'frames', 'page-tools', 'history', 'large-uploads', ...(chrome.downloads ? ['downloads'] : []), ...(chrome.debugger ? ['full-control'] : [])] }));
    connection.onmessage = async event => {
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'challenge') {
        if (typeof msg.nonce !== 'string' || msg.proof !== await hmac(await key, 'lateef-broker', mine, msg.nonce)) { status = 'Broker not verified'; connection.close(); return; }
        verified = true; connection.send(JSON.stringify({ type: 'auth', proof: await hmac(await key, 'lateef-extension', msg.nonce, mine) })); return;
      }
      if (!verified) { status = 'Broker not verified'; connection.close(); return; }
      if (msg.type === 'ready') { status = 'Connected'; backoff = 1000; return; }
      if (msg.type === 'sessions') {
        sessions = msg.sessions;
        enqueue(async () => {
          const records = await ownership(), active = new Set(sessions.map(session => session.id));
          let changed = false;
          for (const [id, record] of Object.entries(records)) if (!active.has(record.sessionId)) {
            if (record.created) await chrome.tabs.remove(Number(id)).catch(() => {}); else await presence(Number(id), 'remove');
            delete records[id]; changed = true;
          }
          if (changed) await saveOwnership(records);
        }); return;
      }
      if (msg.type !== 'command') return;
      // Serialize ownership updates across clients to prevent lost records.
      enqueue(async () => {
        try {
          if (Number.isFinite(msg.deadline) && Date.now() > msg.deadline) fail('TIMEOUT', 'Command expired in the extension queue before it started; it was not run.');
          const result = await dispatch(msg.sessionId, msg.method, msg.params || {});
          if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, result }));
        } catch (error) {
          if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: 'result', id: msg.id, ok: false, error: { code: error.code || 'BROWSER_ERROR', message: error.message } }));
        }
      });
    };
    connection.onclose = event => {
      if (socket !== connection) return;
      if (status !== 'Broker not verified') status = 'Disconnected'; clearInterval(heartbeat);
      if (event.code === 1008 && /^Revoked/.test(event.reason)) { // Pairing revoked: stop retrying; the popup then shows not paired.
        socket = null; sessions = []; status = 'Not paired'; chrome.alarms.clear('reconnect'); chrome.storage.local.remove('connection'); return;
      }
      setTimeout(() => connect(), backoff); backoff = Math.min(backoff * 2, 30000);
    };
    connection.onerror = () => { if (socket === connection) status = 'Broker unavailable'; };
    heartbeat = setInterval(() => { if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: 'ping' })); }, 20000);
  } finally { reconnecting = false; }
}

async function popupMessage(msg) {
  if (msg.type === 'status') { const config = await settings(); return { version: chrome.runtime.getManifest().version, status, windowId: config?.windowId, paired: !!config, sessions, presence: await presenceOn(), full: await fullState() }; }
  if (msg.type === 'fullControl') {
    if (!chrome.debugger) fail('FULL_CONTROL_UNAVAILABLE', 'This is the standard Lateef extension.');
    await chrome.storage.local.set({ fullControl: !!msg.on });
    if (!msg.on) for (const tabId of [...full.attached]) await detach(tabId);
    return { fullControl: !!msg.on };
  }
  if (msg.type === 'presence') {
    await chrome.storage.local.set({ presence: !!msg.on });
    for (const [id, record] of Object.entries(await ownership())) await presence(Number(id), msg.on ? 'show' : 'remove', { shared: !record.created });
    return { presence: !!msg.on };
  }
  if (msg.type === 'pair') {
    if (!Number.isInteger(msg.port) || msg.port < 1 || msg.port > 65535 || !Number.isInteger(msg.windowId)) fail('BAD_SETUP', 'Invalid port or window.');
    await chrome.windows.get(msg.windowId);
    const url = `http://127.0.0.1:${msg.port}/pair`, post = body => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    // The code is shown only by the real broker, so it must prove it knows the code before the code is sent to it.
    const challenge = nonce(), check = await post({ nonce: challenge });
    if (!check.ok) fail('PAIR_FAILED', 'No pairing code is waiting on that port. Run lateef pair and try again.');
    if ((await check.json()).proof !== await hmac(await sha256(String(msg.code).trim()), 'lateef-pair', challenge)) fail('PAIR_FAILED', 'The program on that port did not issue this code. Check the port that lateef pair printed.');
    const res = await post({ code: String(msg.code).trim(), name: msg.name });
    if (!res.ok) fail('PAIR_FAILED', 'Pairing code was invalid or expired. Generate a new one.');
    const pair = await res.json();
    socket?.close();
    await chrome.storage.local.set({ connection: { port: msg.port, windowId: msg.windowId, ...pair } });
    socket = null; backoff = 1000; await connect(); return { paired: true };
  }
  if (msg.type === 'window') {
    await chrome.windows.get(msg.windowId); const config = await settings(); if (!config) fail('NOT_PAIRED', 'Pair first.');
    config.windowId = msg.windowId; await chrome.storage.local.set({ connection: config });
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'window', windowId: msg.windowId })); else await connect();
    return { windowId: msg.windowId };
  }
  if (msg.type === 'share') {
    if (!sessions.some(session => session.id === msg.sessionId)) fail('BAD_SESSION', 'Select an active client session.');
    const window = await selectedWindow(), tab = await chrome.tabs.get(msg.tabId);
    if (tab.windowId !== window.id || !urlAllowed(tab.url)) fail('TAB_NOT_IN_WINDOW', 'Share an http(s) tab from the selected window.');
    const records = await ownership();
    if (records[tab.id] && records[tab.id].sessionId !== msg.sessionId) fail('TAB_BUSY', 'Another session already controls this tab.');
    records[tab.id] = { sessionId: msg.sessionId, created: false }; await saveOwnership(records);
    await presence(tab.id, 'show', { shared: true });
    socket.send(JSON.stringify({ type: 'bind', sessionId: msg.sessionId })); return { shared: tab.id };
  }
  if (msg.type === 'disconnect') {
    await chrome.storage.local.remove('connection'); socket?.close(); socket = null; clearInterval(heartbeat); sessions = []; status = 'Disconnected'; return { disconnected: true };
  }
  fail('BAD_REQUEST', 'Unknown popup request');
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only our extension popup may pair, change window binding, or share user tabs.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  enqueue(() => popupMessage(msg)).then(result => sendResponse({ ok: true, result }), error => sendResponse({ ok: false, error: error.message })); return true;
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'reconnect') connect(); });
chrome.runtime.onStartup.addListener(connect);
// A navigation or reload wipes the page, and the marker with it; put it back once the new document is ready.
chrome.tabs.onUpdated.addListener((id, change) => { if (change.status === 'complete') ownership().then(records => { if (records[id]) presence(id, 'show', { shared: !records[id].created }); }).catch(() => {}); });
chrome.runtime.onStartup.addListener(() => ownership().then(badge).catch(() => {}));
chrome.tabs.onRemoved.addListener(id => { full.attached.delete(id); full.logs.delete(id); full.requests.delete(id); });
chrome.tabs.onRemoved.addListener(id => enqueue(async () => { const records = await ownership(); if (records[id]) { delete records[id]; await saveOwnership(records); } }));
// Do not hold service-worker module evaluation open on Chrome API callbacks.
void connect();
