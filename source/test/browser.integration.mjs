import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Broker } from '../src/broker.mjs';
import { request } from '../src/client.mjs';
import { exportExtension } from '../src/install.mjs';

async function until(fn) { const end = Date.now() + 10000; while (Date.now() < end) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Condition timed out'); }
const parse = result => JSON.parse(result.content[0].text);

test('real unpacked extension: background DOM workflow, MCP stdio, isolation and closed-window refusal', { timeout: 60000 }, async t => {
  await mkdir('artifacts', { recursive: true });
  const directory = await mkdtemp(join(tmpdir(), 'lateef-browser-'));
  const broker = await Broker.create(join(directory, 'state'), { port: 0 }); await broker.start();
  let context, http, client, second;
  const uploaded = [];
  t.after(async () => { await client?.close(); await second?.close(); await context?.close(); await broker.stop(); if (http) await new Promise(resolve => http.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const executablePath = process.env.LATEEF_TEST_CHROMIUM;
  // The full control copy is the standard extension plus the debugger permission, so one run covers both.
  const extensionPath = join(directory, 'extension-full'); await exportExtension(extensionPath, { full: true });
  assert.equal(JSON.parse(await readFile(resolve('extension/manifest.json'), 'utf8')).permissions.includes('debugger'), false, 'the standard extension never asks for the debugger');
  context = await chromium.launchPersistentContext(join(directory, 'browser'), {
    headless: true, executablePath, channel: executablePath ? undefined : 'chromium',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const errors = [];
  context.on('weberror', error => errors.push(error.error().message));
  http = createServer((req, res) => {
    if (req.url === '/upload') {
      const chunks=[]; req.on('data', c=>chunks.push(c)); req.on('end', ()=>{uploaded.push({bytes:Buffer.concat(chunks),type:req.headers['content-type']});res.end('Attachment received');});return;
    }
    if (req.url === '/file') { res.writeHead(200, { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="lateef-fixture.txt"' }); res.end('downloaded by the fixture'); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url === '/ping') { res.end('pong'); return; }
    if (req.url === '/full') { res.end('<!doctype html><title>Full control fixture</title><button id="real" style="width:200px;height:60px" onclick="document.getElementById(\'out\').textContent=event.isTrusted?\'Trusted click\':\'Scripted click\'">Real click target</button><input id="typed" aria-label="Typed" onkeydown="if(event.key===\'Enter\'&&event.isTrusted)document.getElementById(\'out\').textContent=\'Typed: \'+this.value"><a href="/file" download>Get the file</a><p id="out">Idle</p>'); return; }
    if (req.url === '/inner') { res.end('<!doctype html><title>Inner frame</title><label>Framed value<input id="inner"></label><button onclick="document.getElementById(\'said\').textContent=\'Frame got: \'+document.getElementById(\'inner\').value">Send in frame</button><p id="said">Frame idle</p>'); return; }
    if (req.url === '/tools') {
      res.end('<!doctype html><title>Page tools fixture</title><main><h1>Tools fixture</h1><p>Readable paragraph for the text tool.</p><form onsubmit="event.preventDefault();document.getElementById(\'out\').textContent=\'Submitted: \'+this.q.value"><label>Query<input name="q"></label></form><button id="menu" onmouseover="document.getElementById(\'out\').textContent=\'Menu open\'">Hover menu</button><button onclick="setTimeout(()=>document.getElementById(\'out\').textContent=\'Late content\',700)">Load late</button><p id="out">Idle</p><div style="height:3000px"></div><p>Bottom marker</p></main><iframe src="/inner" title="Embedded" width="400" height="120"></iframe>');
      return;
    }
    if (req.url === '/editor') {
      // A stand-in for a rich editor: it renders only from its own model, takes pastes, and undoes outside DOM edits.
      res.end('<!doctype html><title>Editor fixture</title><div id="rich" contenteditable="true" aria-label="Rich editor"></div><div id="plain" contenteditable="true" aria-label="Plain editor"></div><output id="model"></output><script>const rich=document.getElementById("rich");let model="";const render=()=>{rich.textContent=model;document.getElementById("model").textContent="model: "+model};rich.addEventListener("paste",e=>{e.preventDefault();model=e.clipboardData.getData("text/plain");render()});rich.addEventListener("input",render);</script>');
      return;
    }
    // Field report 15 Nov 2026: custom radios, a labelled custom select, a viewer dialog over the page, text that lands in a frame.
    if (req.url === '/payments') { res.end('<!doctype html><title>Payments</title><p id="b">Loading</p><script>setTimeout(()=>document.getElementById("b").textContent="Ending balance 0.00",600)</script>'); return; }
    if (req.url === '/custom') {
      res.end('<!doctype html><title>Custom controls fixture</title><main><p>Underlying email body</p><p>Is this about billing?</p>'
        + '<label><input type="radio" name="q" value="yes" style="display:none"><span role="radio" tabindex="0" aria-label="Yes Option 1 of 2">Yes</span></label>'
        + '<label><input type="radio" name="q" value="no" style="display:none" onchange="document.getElementById(\'picked\').textContent=\'Picked no\'"><span role="radio" tabindex="0" aria-label="No Option 2 of 2">No</span></label><p id="picked">Nothing picked</p>'
        + '<span id="ba">Billing account</span><div role="combobox" tabindex="0" aria-labelledby="ba" aria-expanded="false" style="width:120px;height:20px" onclick="this.setAttribute(\'aria-expanded\',\'true\');document.getElementById(\'list\').hidden=false"></div><div id="list" role="listbox" hidden><p>No items to display</p></div>'
        + '</main><div role="dialog" aria-modal="true" aria-label="Letter preview" style="position:fixed;inset:0;background:#fff"><p>Letter page one</p><p>Letter page two</p></div><iframe src="/payments" title="Payments" width="300" height="60"></iframe>');
      return;
    }
    if (req.url === '/deep') {
      res.end('<!doctype html><title>Deep inbox fixture</title><main>' + '<div>'.repeat(45) + '<div style="display:contents"><div role="grid"><div role="row"><div role="gridcell"><span>Request for a reference</span></div><div role="gridcell"><button>Open reference message</button></div></div></div></div>' + '</div>'.repeat(45) + '</main>');
      return;
    }
    res.end('<!doctype html><title>Lateef owned fixture</title><h1>Background fixture</h1><label>Test value<input id="value"></label><input type="password" value="do-not-return"><button onclick="document.querySelector(\'output\').textContent=\'Passed: \'+document.querySelector(\'input\').value">Check</button><output>Ready</output><label for="attachment">PDF attachment</label><input type="file" id="attachment" style="display:none" onchange="fetch(\'/upload\',{method:\'POST\',body:this.files[0]}).then(r=&gt;r.text()).then(t=&gt;document.querySelector(\'output\').textContent=t)"><a href="/spa" target="_blank" onclick="event.preventDefault(); history.pushState({}, \'\', this.href); document.querySelector(\'output\').textContent=\'SPA routed\'">SPA route</a><a href="/external" target="_blank">SPA route</a><a href="/next" target="_blank">Open another page</a>');
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const fixture = `http://127.0.0.1:${http.address().port}/`;
  const sentinel = await context.newPage(); await sentinel.goto(fixture + 'sentinel');
  const popup = await context.newPage(); popup.on('pageerror', error => errors.push(error.message));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#port').fill(String(broker.port)); await popup.locator('#code').fill(broker.issueCode());
  await popup.getByRole('button', { name: 'Pair this window' }).click();
  try { await until(() => broker.extensions.size === 1); }
  catch {
    const diagnostic = await popup.evaluate(() => ({ handler: String(document.getElementById('pair').onsubmit), resources: performance.getEntriesByType('resource').map(x => ({ name: x.name, size: x.decodedBodySize })), extension: chrome.runtime.id }));
    throw new Error('Extension pairing did not connect: ' + await popup.locator('#error').innerText() + '; ' + await popup.locator('#status').innerText() + '; JS errors: ' + JSON.stringify(errors) + '; ' + JSON.stringify(diagnostic));
  }
  await until(async()=> (await popup.locator('#status').innerText()).includes('Connected'));
  await popup.setViewportSize({width:1280,height:800});
  await popup.screenshot({path:resolve('artifacts/store-popup.png')});
  await popup.close();
  const before = await worker.evaluate(async () => ({ windows: (await chrome.windows.getAll()).map(w => w.id), active: (await chrome.tabs.query({ active: true })).map(tab => tab.id) }));
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('bin/lateef.mjs'), 'mcp'], env: { ...process.env, LATEEF_STATE_DIR: join(directory, 'state') } });
  client = new Client({ name: 'browser-test-client', version: '1.0' }); await client.connect(transport);
  const tools = await client.listTools(); assert.equal(tools.tools.length, 21); assert.equal(tools.tools.some(tool => /claude|playwright/.test(tool.name)), false);
  // The test reads structured nodes; clients get plain lines by default, which is checked separately below.
  const call = async (name, args) => { if (name === 'browser_snapshot' || name === 'browser_find') args = { format: 'json', ...args }; const result = await client.callTool({ name, arguments: args }); if (result.isError) throw new Error(result.content[0].text); return parse(result); };
  assert.equal((await call('browser_status', {})).connected, true);
  const tab = await call('browser_tabs', { action: 'new', url: fixture });
  await until(async () => (await worker.evaluate(id => chrome.tabs.get(id), tab.tabId)).status === 'complete');
  const snapshot = await call('browser_snapshot', { tabId: tab.tabId });
  assert.equal(JSON.stringify(snapshot).includes('do-not-return'), false);
  const plain = (await client.callTool({ name: 'browser_snapshot', arguments: { tabId: tab.tabId } })).content[0].text;
  assert.match(plain, /^Lateef owned fixture — http/); assert.match(plain, /textbox "Test value" \[e[a-z0-9]{3}_\d+\]/); assert.throws(() => JSON.parse(plain));
  const actionable = (await client.callTool({ name: 'browser_snapshot', arguments: { tabId: tab.tabId, filter: 'interactive' } })).content[0].text;
  assert.ok(actionable.length < plain.length); assert.doesNotMatch(actionable, /Background fixture/);
  const snapshot2 = await call('browser_snapshot', { tabId: tab.tabId });
  const input = snapshot2.nodes.find(node => node.name === 'Test value'), button = snapshot2.nodes.find(node => node.name === 'Check');
  assert.ok(input && button);
  await call('browser_fill', { tabId: tab.tabId, ref: input.ref, value: 'quiet-ok' });
  await call('browser_click', { tabId: tab.tabId, ref: button.ref });
  const verified = await call('browser_snapshot', { tabId: tab.tabId }); assert.match(verified.text, /Passed: quiet-ok/);
  // Presence: the agent's tab is grouped, counted on the toolbar and marked on the page; the marker stays out of snapshots and off other tabs.
  await until(() => worker.evaluate(async id => { const t = await chrome.tabs.get(id); return t.groupId >= 0 && (await chrome.tabGroups.get(t.groupId)).title === 'Lateef'; }, tab.tabId));
  const agentPage = context.pages().find(page => page.url() === fixture); assert.ok(agentPage, 'agent tab is visible to the test driver');
  await until(() => agentPage.evaluate(() => !!document.querySelector('html > lateef-presence')));
  assert.doesNotMatch(JSON.stringify(verified), /lateef-presence|is here|is typing|is clicking/);
  assert.equal(await sentinel.evaluate(() => !!document.querySelector('lateef-presence')), false);
  assert.equal(await worker.evaluate(() => chrome.action.getBadgeText({})), '1');
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).groupId, (await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url).id, fixture + 'sentinel'))), -1, 'user tabs are never grouped');
  const stale = await client.callTool({ name: 'browser_click', arguments: { tabId: tab.tabId, ref: button.ref } }); assert.equal(stale.isError, true);
  // A target=_blank SPA link must run its handler, route in place, and
  // create no additional tab. Repeat to catch the reported intermittent path.
  for (let i = 0; i < 3; i++) {
    const fresh = await call('browser_snapshot', { tabId: tab.tabId });
    assert.equal(fresh.nodes.filter(node => node.name === 'SPA route').length, 2);
    const spa = fresh.nodes.find(node => node.name === 'SPA route' && node.href === fixture + 'spa');
    const routed = await call('browser_click', { tabId: tab.tabId, ref: spa.ref });
    assert.equal(routed.opened, undefined);
    const routeSnapshot = await call('browser_snapshot', { tabId: tab.tabId });
    assert.match(routeSnapshot.url, /\/spa$/);
    assert.match(routeSnapshot.text, /SPA routed/);
    assert.equal((await call('browser_tabs', { action: 'list' })).tabs.length, 1);
  }
  const links = await call('browser_snapshot', { tabId: tab.tabId });
  const link = links.nodes.find(node => node.name === 'Open another page');
  assert.equal(link.href, fixture + 'next');
  assert.equal(link.target, '_blank');
  assert.match(links.text, /href=.*next/);
  const linked = await call('browser_click', { tabId: tab.tabId, ref: link.ref }); assert.equal(linked.opened.windowId, tab.windowId);
  const after = await worker.evaluate(async () => ({ windows: (await chrome.windows.getAll()).map(w => w.id), active: (await chrome.tabs.query({ active: true })).map(tab => tab.id) }));
  assert.deepEqual(after, before, 'background tool actions must not change active tabs or create windows');
  const uploadSnapshot = await call('browser_snapshot', { tabId: tab.tabId });
  const fileInput = uploadSnapshot.nodes.find(n=>n.role==='file'); assert.ok(fileInput); assert.equal(fileInput.hidden,true);
  const pdfPath=join(directory,'example.pdf');await writeFile(pdfPath,'%PDF-1.4\nlocal fixture\n');
  const rejectedOrigin=await client.callTool({name:'browser_upload',arguments:{tabId:tab.tabId,ref:fileInput.ref,expectedOrigin:'https://wrong.invalid',paths:[pdfPath]}});
  assert.equal(rejectedOrigin.isError,true);assert.match(rejectedOrigin.content[0].text,/ORIGIN_MISMATCH/);assert.equal(uploaded.length,0);
  const attached=await call('browser_upload',{tabId:tab.tabId,ref:fileInput.ref,expectedOrigin:new URL(fixture).origin,paths:[pdfPath]});
  assert.equal(attached.attached[0].name,'example.pdf');
  await until(()=>uploaded.length===1);assert.equal(uploaded[0].bytes.toString(),'%PDF-1.4\nlocal fixture\n');assert.equal(uploaded[0].type,'application/pdf');
  const boundaryPath=join(directory,'boundary.pdf');await writeFile(boundaryPath,Buffer.alloc(2*1024*1024,65));
  const boundary=await call('browser_upload',{tabId:tab.tabId,ref:fileInput.ref,expectedOrigin:new URL(fixture).origin,paths:[boundaryPath]});
  assert.equal(boundary.bytes,2*1024*1024);await until(()=>uploaded.length===2);assert.equal(uploaded[1].bytes.length,2*1024*1024);assert.ok(uploaded[1].bytes.every(b=>b===65));
  const bigPath=join(directory,'big.pdf');await writeFile(bigPath,Buffer.alloc(6*1024*1024+123,66));
  const big=await call('browser_upload',{tabId:tab.tabId,ref:fileInput.ref,expectedOrigin:new URL(fixture).origin,paths:[bigPath]});
  assert.equal(big.bytes,6*1024*1024+123);await until(()=>uploaded.length===3);assert.equal(uploaded[2].bytes.length,6*1024*1024+123);assert.ok(uploaded[2].bytes.every(b=>b===66),'a staged upload arrives byte for byte');
  const afterUpload=await worker.evaluate(async()=>({windows:(await chrome.windows.getAll()).map(w=>w.id),active:(await chrome.tabs.query({active:true})).map(t=>t.id)}));
  assert.deepEqual(afterUpload,before,'file upload must not activate a tab or create a window');
  // Page tools and iframes.
  const kit = await call('browser_tabs', { action: 'new', url: fixture + 'tools' });
  const read = await call('browser_text', { tabId: kit.tabId }); assert.match(read.text, /Readable paragraph for the text tool/); assert.equal(read.truncated, false);
  let view = await call('browser_snapshot', { tabId: kit.tabId });
  const named = name => view.nodes.find(n => n.name === name);
  await call('browser_fill', { tabId: kit.tabId, ref: named('Query').ref, value: 'pressed enter' });
  assert.equal((await call('browser_press', { tabId: kit.tabId, ref: named('Query').ref, key: 'Enter' })).submitted, true);
  assert.equal((await call('browser_wait', { tabId: kit.tabId, text: 'Submitted: pressed enter' })).met, true);
  await call('browser_hover', { tabId: kit.tabId, ref: named('Hover menu').ref });
  assert.equal((await call('browser_wait', { tabId: kit.tabId, text: 'Menu open', timeoutMs: 1000 })).met, true);
  await call('browser_click', { tabId: kit.tabId, ref: named('Load late').ref });
  assert.equal((await call('browser_wait', { tabId: kit.tabId, text: 'Late content' })).met, true);
  assert.equal((await call('browser_wait', { tabId: kit.tabId, text: 'never there', timeoutMs: 300 })).met, false);
  assert.equal((await call('browser_scroll', { tabId: kit.tabId, to: 'bottom' })).atBottom, true);
  assert.equal((await call('browser_scroll', { tabId: kit.tabId, to: 'top' })).scrollY, 0);
  view = await call('browser_snapshot', { tabId: kit.tabId });
  const framedInput = view.nodes.find(n => n.name === 'Framed value'), framedButton = view.nodes.find(n => n.name === 'Send in frame');
  assert.ok(framedInput && framedButton, 'iframe controls are in the snapshot'); assert.match(framedInput.ref, /^f\d+\./); assert.match(view.text, /frame "Inner frame"/);
  await call('browser_fill', { tabId: kit.tabId, ref: framedInput.ref, value: 'through the frame' });
  await call('browser_click', { tabId: kit.tabId, ref: framedButton.ref });
  assert.match((await call('browser_snapshot', { tabId: kit.tabId })).text, /Frame got: through the frame/);
  assert.ok((await call('browser_find', { tabId: kit.tabId, text: 'Send in frame' })).matches.some(n => /^f\d+\./.test(n.ref)));
  // Open and read in one call.
  const opened = await client.callTool({ name: 'browser_tabs', arguments: { action: 'new', url: fixture + 'tools', read: 'text' } });
  assert.equal(opened.content.length, 2); assert.match(JSON.parse(opened.content[1].text).text, /Readable paragraph/);
  const closedInBatch = await call('browser_batch', { tabId: parse(opened).tabId, steps: [{ tool: 'text' }, { tool: 'close' }] }); assert.equal(closedInBatch.completed, 2); assert.equal(closedInBatch.results[1].result.closed, parse(opened).tabId);
  // One call, several steps; a failing step stops the rest.
  view = await call('browser_snapshot', { tabId: kit.tabId });
  const batch = await call('browser_batch', { tabId: kit.tabId, steps: [{ tool: 'fill', args: { ref: named('Query').ref, value: 'batched' } }, { tool: 'press', args: { ref: named('Query').ref, key: 'Enter' } }, { tool: 'wait', args: { text: 'Submitted: batched' } }, { tool: 'text' }] });
  assert.equal(batch.completed, 4); assert.equal(batch.results[2].result.met, true); assert.match(batch.results[3].result.text, /Submitted: batched/);
  const broken = await client.callTool({ name: 'browser_batch', arguments: { tabId: kit.tabId, steps: [{ tool: 'click', args: { ref: 'nope' } }, { tool: 'text' }] } });
  assert.equal(broken.isError, true); assert.deepEqual((({ completed, failedStep, skipped }) => ({ completed, failedStep, skipped }))(parse(broken)), { completed: 0, failedStep: 1, skipped: 1 });
  await call('browser_tabs', { action: 'close', tabId: kit.tabId });
  // History and downloads.
  const roam = await call('browser_tabs', { action: 'new', url: fixture + 'editor' });
  await call('browser_navigate', { tabId: roam.tabId, url: fixture + 'full' });
  assert.match((await call('browser_history', { tabId: roam.tabId, action: 'back' })).url, /\/editor$/);
  assert.match((await call('browser_history', { tabId: roam.tabId, action: 'forward' })).url, /\/full$/);
  const fullView = await call('browser_snapshot', { tabId: roam.tabId });
  await call('browser_click', { tabId: roam.tabId, ref: fullView.nodes.find(n => n.name === 'Get the file').ref });
  await until(async () => (await call('browser_downloads', {})).downloads.some(d => d.state === 'complete' && /\/file$/.test(d.url) && d.totalBytes === 25)); // the test driver renames the saved file
  // Full control is refused until the person switches it on in the popup.
  const refusedControl = await client.callTool({ name: 'browser_screenshot', arguments: { tabId: roam.tabId } });
  assert.equal(refusedControl.isError, true); assert.match(refusedControl.content[0].text, /FULL_CONTROL_OFF/);
  const switcher = await context.newPage(); await switcher.goto(`chrome-extension://${extensionId}/popup.html`);
  assert.equal((await switcher.evaluate(() => chrome.runtime.sendMessage({ type: 'fullControl', on: true }))).ok, true); await switcher.close();
  const activeBeforeControl = await worker.evaluate(async () => (await chrome.tabs.query({ active: true })).map(t => t.id));
  const shot = await client.callTool({ name: 'browser_screenshot', arguments: { tabId: roam.tabId } });
  assert.ok(!shot.isError, shot.content[0].text); assert.equal(shot.content[1].type, 'image'); assert.ok(shot.content[1].data.length > 1000); assert.ok(parse(shot).width > 0);
  await writeFile(resolve('artifacts/full-control-screenshot.jpg'), Buffer.from(shot.content[1].data, 'base64'));
  const centre = async id => JSON.parse((await call('browser_evaluate', { tabId: roam.tabId, code: `(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()` })).value);
  await call('browser_input', { tabId: roam.tabId, action: 'click', units: 'css', ...(await centre('real')) });
  assert.equal((await call('browser_wait', { tabId: roam.tabId, text: 'Trusted click' })).met, true, 'a real click is a trusted event');
  await call('browser_input', { tabId: roam.tabId, action: 'click', units: 'css', ...(await centre('typed')) });
  await call('browser_input', { tabId: roam.tabId, action: 'type', text: 'real keys' });
  await call('browser_input', { tabId: roam.tabId, action: 'key', key: 'Enter' });
  assert.equal((await call('browser_wait', { tabId: roam.tabId, text: 'Typed: real keys' })).met, true);
  assert.equal((await call('browser_evaluate', { tabId: roam.tabId, code: 'console.log("hello from the page"); fetch("/ping").then(r => r.status)' })).value, '200');
  await until(async () => (await call('browser_console', { tabId: roam.tabId, pattern: 'hello from' })).messages.length === 1);
  await until(async () => (await call('browser_network', { tabId: roam.tabId, pattern: '/ping$' })).requests.some(r => r.status === 200));
  assert.deepEqual(await worker.evaluate(async () => (await chrome.tabs.query({ active: true })).map(t => t.id)), activeBeforeControl, 'full control must not activate a tab');
  const pageError = await client.callTool({ name: 'browser_evaluate', arguments: { tabId: roam.tabId, code: 'nope()' } }); assert.equal(pageError.isError, true); assert.match(pageError.content[0].text, /PAGE_ERROR/);
  await call('browser_tabs', { action: 'close', tabId: roam.tabId });
  const editor = await call('browser_tabs', { action: 'new', url: fixture + 'editor' });
  const editors = (await call('browser_snapshot', { tabId: editor.tabId })).nodes;
  assert.equal((await call('browser_fill', { tabId: editor.tabId, ref: editors.find(n => n.name === 'Rich editor').ref, value: 'Hello from a paste' })).via, 'paste');
  assert.equal((await call('browser_fill', { tabId: editor.tabId, ref: editors.find(n => n.name === 'Plain editor').ref, value: 'Plain text' })).via, 'text');
  const edited = await call('browser_snapshot', { tabId: editor.tabId });
  assert.match(edited.text, /model: Hello from a paste/);
  assert.equal(edited.nodes.find(n => n.name === 'Rich editor').value, 'Hello from a paste');
  assert.equal(await context.pages().find(page => page.url() === fixture + 'editor').evaluate(() => document.getElementById('plain').textContent), 'Plain text');
  await call('browser_tabs', { action: 'close', tabId: editor.tabId });
  const deep = await call('browser_tabs', { action: 'new', url: fixture + 'deep' });
  const deepSnapshot = await call('browser_snapshot', { tabId: deep.tabId });
  assert.match(deepSnapshot.text, /Request for a reference/);
  assert.ok(deepSnapshot.nodes.some(n => n.role === 'row' && n.name.includes('Request for a reference')));
  assert.ok(deepSnapshot.nodes.some(n => n.role === 'button' && n.name === 'Open reference message'));
  assert.equal(deepSnapshot.truncated, false);
  const deepFind = await call('browser_find', { tabId: deep.tabId, text: 'Request for a reference', maxChars: 20000, depth: 30 });
  assert.ok(deepFind.matches.length > 0);
  const shallow = await call('browser_snapshot', { tabId: deep.tabId, depth: 1 });
  assert.equal(shallow.truncated, true);
  assert.ok(shallow.truncationReasons.includes('depth'));
  assert.equal(shallow.limits.depth, 1);
  await call('browser_tabs', { action: 'close', tabId: deep.tabId });
  const custom = await call('browser_tabs', { action: 'new', url: fixture + 'custom' });
  const radio = (await call('browser_find', { tabId: custom.tabId, query: 'No Option' })).matches[0];
  assert.equal(radio?.role, 'radio', 'a label around a hidden radio is actionable, and find accepts query');
  assert.equal((await call('browser_fill', { tabId: custom.tabId, ref: radio.ref, value: true })).checked, true);
  assert.equal((await call('browser_wait', { tabId: custom.tabId, text: 'Picked no' })).met, true);
  const select = (await call('browser_find', { tabId: custom.tabId, text: 'Billing account' })).matches.find(n => n.role === 'combobox');
  assert.ok(select, 'a custom select is named by aria-labelledby'); assert.equal(select.expanded, false);
  await call('browser_click', { tabId: custom.tabId, ref: select.ref });
  assert.equal((await call('browser_wait', { tabId: custom.tabId, text: 'No items to display' })).met, true);
  const viewer = await call('browser_text', { tabId: custom.tabId });
  assert.equal(viewer.scope, 'dialog'); assert.match(viewer.text, /Letter page two/); assert.doesNotMatch(viewer.text, /Underlying email/);
  assert.match((await call('browser_text', { tabId: custom.tabId, scope: 'page' })).text, /Underlying email/);
  assert.match((await call('browser_text', { tabId: custom.tabId, selector: '[role=dialog]' })).text, /Letter page one/);
  const framed = await call('browser_wait', { tabId: custom.tabId, text: 'Ending balance' });
  assert.equal(framed.met, true, 'waits search frames'); assert.ok(framed.frameId > 0);
  assert.doesNotMatch((await call('browser_snapshot', { tabId: custom.tabId, frames: false })).text, /Ending balance/);
  assert.match((await call('browser_snapshot', { tabId: custom.tabId, selector: '[role=dialog]' })).text, /Letter page one/);
  const expectRaw = await client.callTool({ name: 'browser_navigate', arguments: { tabId: custom.tabId, url: fixture + 'custom', expect: 'Ending balance', read: 'text' } });
  assert.equal(expectRaw.isError, undefined); assert.equal(JSON.parse(expectRaw.content[1].text).met, true);
  await call('browser_tabs', { action: 'close', tabId: custom.tabId });
  second = new Client({ name: 'second-client', version: '1.0' }); await second.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('bin/lateef.mjs'), 'mcp'], env: { ...process.env, LATEEF_STATE_DIR: join(directory, 'state') } }));
  const isolated = parse(await second.callTool({ name: 'browser_tabs', arguments: { action: 'list' } })); assert.deepEqual(isolated.tabs, []);
  const blocked = await second.callTool({ name: 'browser_snapshot', arguments: { tabId: tab.tabId } }); assert.equal(blocked.isError, true); assert.match(blocked.content[0].text, /TAB_NOT_SHARED/);
  const blockedUpload = await second.callTool({name:'browser_upload',arguments:{tabId:tab.tabId,ref:fileInput.ref,expectedOrigin:new URL(fixture).origin,paths:[pdfPath]}});
  assert.equal(blockedUpload.isError,true);assert.match(blockedUpload.content[0].text,/TAB_NOT_SHARED/);assert.equal(uploaded.length,3);
  const beforeClosedWindow = await worker.evaluate(async () => { const window = await chrome.windows.create({ focused: false }); return window.id; });
  // Close a separately selected empty window. Existing test tabs stay untouched;
  // a closed binding must never trigger a replacement window.
  const settings = await worker.evaluate(() => chrome.storage.local.get('connection'));
  await worker.evaluate(async id => { const { connection } = await chrome.storage.local.get('connection'); connection.windowId = id; await chrome.storage.local.set({ connection }); await chrome.windows.remove(id); }, beforeClosedWindow);
  const refused = await client.callTool({ name: 'browser_tabs', arguments: { action: 'new', url: fixture } }); assert.equal(refused.isError, true); assert.match(refused.content[0].text, /WINDOW_CLOSED/);
  assert.deepEqual((await worker.evaluate(() => chrome.windows.getAll())).map(w => w.id), before.windows);
  await worker.evaluate(connection => chrome.storage.local.set({ connection }), settings.connection);
  // Sharing must be explicitly initiated by our extension UI, and must never
  // give an agent permission to close a user-created tab.
  const sharing = await context.newPage(); await sharing.goto(`chrome-extension://${extensionId}/popup.html`);
  const activeSession = [...broker.sessions.values()].find(session => session.name === 'browser-test-client');
  const sentinelId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).id, fixture + 'sentinel');
  const shared = await sharing.evaluate(args => chrome.runtime.sendMessage({ type: 'share', ...args }), { sessionId: activeSession.id, tabId: sentinelId });
  assert.equal(shared.ok, true);
  await until(() => sentinel.evaluate(() => !!document.querySelector('html > lateef-presence')));
  const closeUserTab = await client.callTool({ name: 'browser_tabs', arguments: { action: 'close', tabId: sentinelId } });
  assert.equal(closeUserTab.isError, true); assert.match(closeUserTab.content[0].text, /NOT_OWNED/);
  await sharing.close();
  await call('browser_tabs', { action: 'close', tabId: tab.tabId });
  await client.close(); client = null;
  await until(() => !broker.sessions.has(activeSession.id));
  assert.ok(await worker.evaluate(id => chrome.tabs.get(id), sentinelId), 'user tab survives session cleanup');
  await until(() => sentinel.evaluate(() => !document.querySelector('lateef-presence')));
  assert.equal(await worker.evaluate(() => chrome.action.getBadgeText({})), '');
  assert.equal(await worker.evaluate(id => chrome.tabs.get(id).then(() => true, () => false), linked.opened.tabId), false, 'agent-created link tab is cleaned up');
  const report = { mcpTools: tools.tools.map(tool => tool.name), backgroundStateBefore: before, backgroundStateAfter: after, formPassed: true, fileUploadExactBytesPassed: true, uploadOriginGuardPassed: true, deepGridRowsCaptured: true, customControlsCaptured: true, dialogScopedText: true, frameWaits: true, nestedRowButtonsCaptured: true, truncationReported: true, targetBlankStayedInBackground: true, spaTargetBlankRoutedInPlace: true, passwordRedacted: true, staleReferencesRejected: true, sessionIsolationPassed: true, closedWindowRefused: true, sharedTabProtected: true, sessionCleanupPassed: true, productScreenshotsTaken: 0, developmentScreenshotsTaken: 1, errors };
  await writeFile(resolve('artifacts/browser-validation.json'), JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
});
