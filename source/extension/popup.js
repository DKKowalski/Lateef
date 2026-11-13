const $ = id => document.getElementById(id);
const manifest = chrome.runtime.getManifest();
$('version').textContent = 'Lateef ' + (manifest.version_name || manifest.version);
let listed = '';
const chosen = () => $('sessions').querySelector('input:checked');
async function send(msg) { const reply = await chrome.runtime.sendMessage(msg); if (!reply?.ok) throw new Error(reply?.error || 'Extension did not answer'); return reply.result; }
async function refresh() {
  const [state, current] = await Promise.all([send({ type: 'status' }), chrome.windows.getCurrent()]);
  const connected = state.paired && state.status === 'Connected', here = state.windowId === current.id, sessions = state.sessions || [];
  // A background worker older than these popup files reports no (or another) version until the extension is reloaded.
  $('stale').hidden = state.version === manifest.version;
  $('state').textContent = state.paired ? state.status : 'Not paired';
  $('detail').textContent = !state.paired ? '' : !connected ? 'Waiting for the Lateef companion. It starts with your AI client.' : here ? 'Agents work in this window.' : 'Agents work in another window.';
  $('status').dataset.state = connected ? 'ok' : state.paired ? 'warn' : 'off';
  $('pair').hidden = state.paired; $('connected').hidden = !state.paired;
  $('window').hidden = here; $('presence').checked = state.presence !== false; $('full-row').hidden = !state.full?.available; $('full').checked = !!state.full?.on;
  $('sharing').hidden = !connected || !sessions.length; $('idle').hidden = !connected || sessions.length > 0;
  const key = JSON.stringify(sessions.map(session => [session.id, session.name]));
  if (key !== listed) { // Rebuild only on change so an open menu is not reset by the periodic refresh.
    // One row per connected client, as radio buttons: usually there are one or two, so a menu only hides them.
    const selected = chosen()?.value;
    $('sessions').replaceChildren(...sessions.map((session, index) => {
      const row = document.createElement('label'), input = document.createElement('input'), name = document.createElement('span');
      row.className = 'session'; input.type = 'radio'; input.name = 'session'; input.value = session.id; input.checked = selected ? session.id === selected : index === 0;
      name.textContent = session.name; row.append(input, name); return row;
    }));
    if (!chosen() && sessions.length) $('sessions').querySelector('input').checked = true;
    listed = key;
  }
}
function action(fn) { return async event => { event?.preventDefault(); $('error').textContent = ''; $('note').textContent = ''; try { await fn(); await refresh(); } catch (error) { $('error').textContent = error.message; } }; }
$('pair').onsubmit = action(async () => {
  const window = await chrome.windows.getCurrent();
  await send({ type: 'pair', port: Number($('port').value), code: $('code').value.trim(), name: $('name').value, windowId: window.id }); $('code').value = '';
});
$('window').onclick = action(async () => { const window = await chrome.windows.getCurrent(); await send({ type: 'window', windowId: window.id }); });
$('share').onclick = action(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }), pick = chosen(), name = pick?.nextElementSibling.textContent;
  await send({ type: 'share', tabId: tab.id, sessionId: pick?.value }); $('note').textContent = `This tab is now shared with ${name}.`;
});
$('presence').onchange = action(() => send({ type: 'presence', on: $('presence').checked }));
$('full').onchange = action(() => send({ type: 'fullControl', on: $('full').checked }));
$('disconnect').onclick = action(() => send({ type: 'disconnect' }));
await refresh().catch(error => { $('state').textContent = 'Unavailable'; $('error').textContent = error.message; });
setInterval(() => refresh().catch(() => {}), 2000);
