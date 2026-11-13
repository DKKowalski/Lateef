#!/usr/bin/env node
import { VERSION } from '../src/version.mjs';
import { install, exportExtension, launcher, tomlBlock } from '../src/install.mjs';
import { Broker } from '../src/broker.mjs';
import { ensureBroker, request } from '../src/client.mjs';
import { runMCP } from '../src/mcp.mjs';

const command = process.argv[2] || 'mcp';
try {
  if (command === '--version') console.log(VERSION);
  else if (command === 'config' || command === 'setup') {
    const start = launcher();
    if (command === 'setup') console.log('1. Register Lateef with your AI client: lateef install <codex|claude|cursor>. For another client, paste the configuration below into its MCP settings.\n2. Run lateef extension and load that folder in chrome://extensions (Developer mode, Load unpacked).\n3. Run lateef pair and enter its code in the intended Chrome window.\n4. Run lateef doctor to check versions and browser capabilities.\n');
    if (process.argv.includes('--toml')) process.stdout.write(tomlBlock(start));
    else console.log(JSON.stringify({ mcpServers: { lateef: start } }, null, 2));
  } else if (command === 'install') console.log(await install(process.argv[3]));
  else if (command === 'extension') { const rest = process.argv.slice(3), full = rest.includes('--full'); console.log(await exportExtension(rest.find(arg => arg !== '--full'), { full })); }
  else if (command === 'doctor') {
    const status = await request(await ensureBroker(), '/status');
    const issues = [];
    if (!status.version || status.version !== VERSION) issues.push('Broker version differs: close MCP clients, run lateef stop, then reconnect. Pairing is retained.');
    if (!status.connected) issues.push('Open Chrome and pair Lateef to an existing window using lateef pair.');
    for (const browser of status.browsers || []) if (!browser.capabilities?.includes('upload')) issues.push('Reload the Lateef extension in Chrome to load the latest capabilities.');
    console.log(JSON.stringify({ companionVersion: VERSION, node: process.versions.node, brokerVersion: status.version || 'legacy', connected: status.connected, browsers: status.browsers, issues, next: issues.length ? 'Follow the issues above; no configuration was changed.' : 'Reconnect your AI client if tools are not visible. Then call browser_status.' }, null, 2));
    if (issues.length) process.exitCode = 1;
  } else if (command === 'mcp') await runMCP();
  else if (command === 'broker') {
    process.on('unhandledRejection', error => console.error(`Lateef: unhandled rejection ignored: ${error?.message ?? error}`));
    const broker = await Broker.create(); await broker.start();
    console.error(`Lateef broker listening on 127.0.0.1:${broker.port}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => broker.stop());
  } else if (command === 'pair') {
    const state = await ensureBroker(); const result = await request(state, '/pair-code', {});
    console.log(`Open the Lateef extension in the window you want to share.\nBroker port: ${state.port}\nOne-time pairing code (expires in 2 minutes): ${result.code}\nPaste the code into the extension and choose Pair this window.`);
  } else if (command === 'status') console.log(JSON.stringify(await request(await ensureBroker(), '/status'), null, 2));
  else if (command === 'stop') console.log(JSON.stringify(await request(await ensureBroker(), '/shutdown', {})));
  else if (command === 'revoke') {
    if (!process.argv[3]) throw new Error('Usage: lateef revoke <browser-id>');
    console.log(JSON.stringify(await request(await ensureBroker(), '/revoke', { pairId: process.argv[3] })));
  } else if (command === '--help' || command === 'help') console.log('lateef install <codex|claude|cursor>   register with an AI client\nlateef extension [--full] [folder]     copy the Chrome extension to a stable folder (--full adds opt-in debugger tools)\nlateef pair                            show a one-time pairing code\nlateef doctor | status | stop | revoke <browser-id>\nlateef setup | config [--toml]         print manual configuration\nlateef mcp | broker | --version\nDefault: MCP over stdio. Pair once from the extension; future MCP sessions start the broker automatically.');
  else throw new Error('Unknown command. Use lateef --help.');
} catch (error) { console.error(`Lateef: ${error.message}`); process.exitCode = 1; }
