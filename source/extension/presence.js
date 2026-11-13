// Runs in the isolated extension world of a tab an agent controls. It shows, lightly, that Lateef is at work:
// a small chip in a corner that says what the agent is doing, and a little flag that hops to whatever is being
// clicked, filled or attached. It reads nothing from the page.
// Everything sits in a closed shadow root on a host attached to <html>, outside <body>: snapshots walk <body>, so
// they never include it, and the page's styles and scripts cannot reach inside. Styles use a constructed sheet and
// the CSSOM, which a page's Content-Security-Policy does not block.
export function presenceCommand(action, detail = {}) {
  const KEY = '__lateefPresence';
  let ui = globalThis[KEY];
  if (action === 'remove') {
    if (ui) { removeEventListener('mousemove', ui.dodge); clearTimeout(ui.rest); clearTimeout(ui.fade); ui.host.remove(); }
    globalThis[KEY] = undefined; return { shown: false };
  }
  // Motion is for someone watching. A background tab, or a person who asked for less motion, gets the end state at once.
  const watching = document.visibilityState === 'visible' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BOUNCY = 'linear(0,.055,.195,.385,.59,.786,.955,1.086,1.174,1.221,1.233,1.218,1.184,1.139,1.091,1.045,1.007,.977,.958,.948,.946,.95,.958,.969,.98,.991,.999,1.006,1.01,1.012,1.013,1.012,1)';
  const SOFT = 'linear(0,.045,.155,.301,.457,.608,.743,.854,.942,1.006,1.048,1.072,1.082,1.082,1.075,1.064,1.052,1.039,1.027,1.016,1.008,1.002,.997,.995,1)';
  if (!ui || !ui.host.isConnected) {
    const host = document.createElement('lateef-presence');
    host.setAttribute('aria-hidden', 'true');
    for (const [name, value] of [['position', 'fixed'], ['inset', '0'], ['z-index', '999999999'], ['pointer-events', 'none'], ['display', 'block']]) host.style.setProperty(name, value, 'important');
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      :host{all:initial}
      .chip{position:absolute;left:16px;bottom:16px;display:flex;align-items:center;gap:7px;padding:7px 13px 7px 9px;border-radius:99px;background:#f8f4ec;color:#141413;font:500 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;box-shadow:0 0 0 1px rgba(20,20,19,.08),0 6px 20px rgba(20,20,19,.16);transition:transform .7s ${BOUNCY}}
      .chip.away{transform:translateX(calc(100vw - 100% - 32px))}
      .chip svg{width:16px;height:16px;overflow:visible}
      .flag{transform-box:fill-box;transform-origin:0 100%}
      .word{display:inline-block;color:#69645b}
      .glow{position:absolute;left:0;top:0;border-radius:10px;box-shadow:0 0 0 3px rgba(253,240,138,.95),0 0 0 4.5px rgba(20,20,19,.45);opacity:0}
      .spot{position:absolute;left:0;top:0;width:0;height:0;opacity:0;transition:opacity .35s}
      .spot svg{position:absolute;left:-6px;top:-30px;width:26px;height:34px;overflow:visible;transform-origin:6px 30px;filter:drop-shadow(0 2px 2px rgba(20,20,19,.25))}
      .pennant{transform-box:fill-box;transform-origin:0 50%}
      @media(prefers-reduced-motion:reduce){.chip,.spot{transition:none}}
    `);
    root.adoptedStyleSheets = [sheet];
    const SVG = 'http://www.w3.org/2000/svg';
    const draw = (tag, attrs, parent) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); parent?.append(el); return el; };
    const div = (name, parent) => { const el = document.createElement(name === 'word' ? 'span' : 'div'); el.className = name; parent.append(el); return el; };
    const glow = div('glow', root), chip = div('chip', root);
    const mark = draw('svg', { viewBox: '0 0 32 32' }, chip);
    draw('path', { d: 'M7 5v18a3 3 0 0 0 3 3h14', fill: 'none', stroke: '#141413', 'stroke-width': 3.4, 'stroke-linecap': 'round' }, mark);
    const flag = draw('path', { class: 'flag', d: 'M17 5h4l2 3h4v7H17Z', fill: '#ff4d21' }, mark);
    chip.append('Lateef');
    const word = div('word', chip);
    const spot = div('spot', root), pin = draw('svg', { viewBox: '0 0 26 34' }, spot);
    draw('ellipse', { cx: 6, cy: 30, rx: 4, ry: 1.8, fill: 'rgba(20,20,19,.3)' }, pin);
    draw('path', { d: 'M6 30V5', fill: 'none', stroke: '#fff', 'stroke-width': 4.6, 'stroke-linecap': 'round' }, pin);
    draw('path', { d: 'M6 30V5', fill: 'none', stroke: '#141413', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, pin);
    const pennant = draw('path', { class: 'pennant', d: 'M7 5h15l-4.5 5.5L22 16H7Z', fill: '#ff4d21', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, pin);
    document.documentElement.append(host);
    // The chip never takes a click, and it steps aside when the mouse comes near so it is never in the way.
    const dodge = event => { if (event.clientY > innerHeight - 96 && (chip.classList.contains('away') ? event.clientX > innerWidth - 280 : event.clientX < 280)) chip.classList.toggle('away'); };
    addEventListener('mousemove', dodge, { passive: true });
    ui = globalThis[KEY] = { host, chip, flag, word, glow, spot, pin, pennant, dodge, x: 40, y: innerHeight - 30, busy: false };
    if (watching) chip.animate([{ transform: 'translateY(60px)' }, { transform: 'none' }], { duration: 700, easing: BOUNCY });
  }
  const idle = detail.shared ? 'is here, on a tab you shared' : 'is here';
  const say = text => {
    if (ui.word.textContent === text) return;
    ui.word.textContent = text;
    if (watching) ui.word.animate([{ transform: 'translateY(.8em)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 550, easing: SOFT });
  };
  if (action === 'show') { if (!ui.busy) say(idle); return { shown: true }; }
  // An action: say what it is, wave the chip's flag, and settle back to idle a moment later.
  say({ snapshot: 'is reading', text: 'is reading', find: 'is looking', wait: 'is waiting', scroll: 'is scrolling', hover: 'is hovering', press: 'is pressing a key', history: 'is going back', screenshot: 'is looking at the page', input: 'is using the mouse and keyboard', evaluate: 'is running a script', console: 'is reading the logs', network: 'is reading the logs', click: 'is clicking', fill: 'is typing', upload: 'is attaching a file' }[detail.method] || 'is working');
  if (watching) ui.flag.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-20deg)' }, { transform: 'rotate(0)' }], { duration: 520, easing: 'ease-out' });
  ui.busy = true; clearTimeout(ui.rest);
  ui.rest = setTimeout(() => { ui.busy = false; say(idle); }, 1600);
  if (action !== 'point') return { shown: true };
  // The flag is planted on the top corner of whatever a DOM action touches, clear of its label. It is a drawing: no mouse or keyboard event comes from it.
  // Full control names a point on the screen; everything else names an element.
  const el = detail.at ? null : globalThis.__quietChrome?.refs.get(detail.ref);
  if (!detail.at && (!el || !el.isConnected)) return { shown: true, pointed: false };
  const box = detail.at ? { left: detail.at.x - 9, right: detail.at.x + 9, top: detail.at.y - 9, width: 18, height: 18 } : el.getBoundingClientRect();
  if (!box.width && !box.height) return { shown: true, pointed: false };
  const clamp = (value, max) => Math.max(10, Math.min(value, max - 10));
  const from = { x: ui.x, y: ui.y }, x = clamp(box.right - 8, innerWidth), y = Math.max(34, clamp(box.top + 3, innerHeight));
  ui.x = x; ui.y = y;
  ui.spot.style.transform = `translate(${x}px,${y}px)`; ui.spot.style.opacity = '1';
  clearTimeout(ui.fade); ui.fade = setTimeout(() => { ui.spot.style.opacity = '0'; }, 1800);
  if (!watching) return { shown: true, pointed: true, waited: 0 };
  const GLIDE = 280;
  for (const [name, value] of [['left', box.left - 4], ['top', box.top - 4], ['width', box.width + 8], ['height', box.height + 8]]) ui.glow.style[name] = value + 'px';
  ui.spot.animate([{ transform: `translate(${from.x}px,${from.y}px)` }, { transform: `translate(${x}px,${y}px)` }], { duration: GLIDE, easing: 'cubic-bezier(.2,.9,.3,1)' });
  // Landing: the pole squashes and springs back, the pennant flaps, and the target lights up briefly.
  ui.pin.animate([{ transform: 'scale(1.14,.8)' }, { transform: 'none' }], { duration: 700, delay: GLIDE - 30, easing: BOUNCY });
  ui.pennant.animate([{ transform: 'skewY(0)' }, { transform: 'skewY(-14deg)' }, { transform: 'skewY(8deg)' }, { transform: 'skewY(0)' }], { duration: 520, delay: GLIDE - 30, easing: 'ease-out' });
  ui.glow.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'scale(1)', offset: .2 }, { opacity: 1, offset: .6 }, { opacity: 0 }], { duration: 1200, delay: GLIDE - 60, easing: 'ease-out' });
  return new Promise(resolve => setTimeout(() => resolve({ shown: true, pointed: true, waited: GLIDE }), GLIDE));
}
