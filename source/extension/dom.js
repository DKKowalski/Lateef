// Runs in an isolated extension world, not the page's JavaScript namespace.
// No eval, screenshots, desktop input, focus(), or bring-to-front operations.
export function domCommand(method, params) {
  try {
  const state = globalThis.__quietChrome ??= { refs: new Map(), counter: 0 };
  // Accessible name, in the order a screen reader uses: aria-labelledby, aria-label, <label>, then content.
  const label = el => (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
    el.getAttribute('aria-label') ||
    [...(el.labels || [])].map(label => label.innerText).join(' ') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || '';
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  // Custom controls: a <label> whose own radio or checkbox is visually hidden is the thing a person clicks, so it stands in for it.
  const hiddenControl = el => el.tagName === 'LABEL' && el.control?.matches('input[type=checkbox],input[type=radio]') && !visible(el.control) ? el.control : null;
  const ROLES = 'button,link,checkbox,radio,switch,combobox,listbox,option,menuitem,menuitemcheckbox,menuitemradio,tab,treeitem,textbox,searchbox,slider,spinbutton,row,gridcell,cell'.split(',');
  const INTERACTIVE = 'button,a[href],input:not([type=hidden]),textarea,select,[contenteditable=true],label,' + ROLES.map(r => `[role=${r}]`).join(',');
  const ariaToggle = el => ['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio', 'option', 'tab'].includes(el.getAttribute('role')) && !el.matches('input');
  const role = el => el.getAttribute('role') || (hiddenControl(el) ? hiddenControl(el).type : '') || ({ BUTTON: 'button', A: 'link', INPUT: ({ checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', reset: 'button', image: 'button' })[el.type] || 'textbox', TEXTAREA: 'textbox', SELECT: 'combobox' }[el.tagName]) || el.tagName.toLowerCase();
  // selector: read only inside the first element that matches (a dialog, form or panel). Missing means "not in this frame".
  const scopeRoot = () => { if (!params.selector) return document.body; try { return document.querySelector(params.selector); } catch { throw new Error('BAD_SELECTOR: selector is not valid CSS'); } };
  // An open modal or a large dialog sits over the page; it is what a person is reading.
  const activeDialog = () => [...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]')].reverse().find(el => {
    if (!visible(el) || !String(el.innerText || '').trim()) return false;
    let modal = el.getAttribute('aria-modal') === 'true' || el.getAttribute('role') === 'alertdialog'; try { modal ||= el.matches(':modal'); } catch {}
    const box = el.getBoundingClientRect(); return modal || box.width * box.height > innerWidth * innerHeight * .4;
  });
  const compact = text => text.replace(/\s+/g, ' ').trim().slice(0, 200);
  const snapshot = () => {
    state.refs.clear(); state.counter = 0;
    const generation = Math.random().toString(36).slice(2, 5).padEnd(3, '0'); // short: every reference is paid for in tokens
    const lines = [], nodes = [];
    const max = Math.min(Math.max(params.maxChars || 8000, 500), 20000);
    let length = 0, visited = 0;
    const reasons = new Set();
    const depthLimit = Math.min(params.depth || 12, 30);
    const addLine = line => { lines.push(line); length += line.length + 1; };
    // A label usually appears twice, as its own text and as its control's name. Say it once.
    let lastName = '';
    const addText = (tag, text) => { if (text && text !== lastName) addLine(`${tag} ${text}`); };
    const dropEcho = name => { const last = lines[lines.length - 1]; if (name && last && /^[a-z0-9]+ /.test(last) && !last.includes(' [') && last.slice(last.indexOf(' ') + 1) === name) { length -= last.length + 1; lines.pop(); } lastName = name; };
    function walk(parent, depth) {
      for (const el of parent.children || []) {
        if (++visited > 20000) { reasons.add('scanLimit'); return; }
        if (nodes.length >= 300) { reasons.add('nodeLimit'); return; }
        if (length >= max) { reasons.add('maxChars'); return; }
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) || el.hidden || getComputedStyle(el).display === 'none') continue;
        const shown = visible(el);
        const interactive = shown && el.matches(INTERACTIVE) && (el.tagName !== 'LABEL' || !!hiddenControl(el));
        const textElement = shown && el.matches('h1,h2,h3,h4,h5,h6,p,li,summary,output,td,th');
        const semantic = interactive || textElement;
        // Layout wrappers do not consume semantic depth. Traverse wrappers
        // without rectangles too (e.g. display:contents) to reach visible rows.
        if (semantic && depth > depthLimit) { reasons.add('depth'); continue; }
        if (interactive) {
          const ref = 'e' + generation + '_' + ++state.counter; state.refs.set(ref, el);
          // A label standing in for a hidden control takes its name the way a screen reader would: from a named child first.
          const name = compact(hiddenControl(el) ? el.querySelector('[aria-label]')?.getAttribute('aria-label') || el.innerText || '' : label(el));
          const control = hiddenControl(el), aria = ariaToggle(el);
          const toggle = el.matches('input[type=checkbox],input[type=radio]') || !!control || aria;
          const checked = control ? control.checked : aria ? el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' : el.checked;
          const disabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true' || !!control?.disabled;
          // A custom select shows its current choice as its own text, which is otherwise lost under its label's name.
          const shownValue = el.getAttribute('role') === 'combobox' && !el.matches('input,select') ? compact(el.innerText || '') : '';
          const value = el.matches('input[type=password]') ? '[redacted]' : toggle || el.matches('input[type=submit],input[type=button],input[type=reset]') ? undefined : el.matches('input,textarea,select') ? String(el.value).slice(0, 120)
            // An editor's contents are its value, so a fill can be checked before anything is submitted.
            : el.matches('[contenteditable=true]') ? String(el.innerText || '').slice(0, 2000) : shownValue && shownValue !== name ? shownValue : undefined;
          const link = el.closest('a[href]');
          const expanded = el.getAttribute('aria-expanded');
          const item = { ref, role: role(el), name, ...(link ? { href: link.href, target: link.getAttribute('target') || document.querySelector('base')?.target || '_self' } : {}), ...(value !== undefined ? { value } : {}), ...(toggle ? { checked } : {}), ...(expanded ? { expanded: expanded === 'true' } : {}), disabled };
          nodes.push(item); dropEcho(name);
          addLine(`${item.role} ${JSON.stringify(name)} [${ref}]${value ? ' value=' + JSON.stringify(value) : ''}${toggle && checked ? ' checked' : ''}${expanded ? (expanded === 'true' ? ' expanded' : ' collapsed') : ''}${disabled ? ' disabled' : ''}${link ? ' href=' + JSON.stringify(item.href.startsWith(location.origin + '/') ? item.href.slice(location.origin.length) : item.href) + (item.target.toLowerCase() === '_self' ? '' : ' target=' + JSON.stringify(item.target)) : ''}`);
        } else if (textElement && el.childElementCount < 4) {
          const text = compact(el.innerText || el.textContent || '');
          addText(el.tagName.toLowerCase(), text);
        } else if (shown && !el.children.length && !el.matches('input,textarea,select')) {
          const text = compact(el.innerText || el.textContent || '');
          addText('text', text);
        }
        // Rows can contain buttons, links and cells; do not stop at their ref.
        if (!interactive || el.matches('[role=row],[role=gridcell],[role=cell],[role=listbox],[role=tab],[role=treeitem]')) walk(el, depth + (semantic ? 1 : 0));
        if (el.shadowRoot) walk(el.shadowRoot, depth + (semantic ? 1 : 0));
      }
    }
    const root = scopeRoot(); if (!root) return { title: document.title, url: location.href, nodes: [], text: '', truncated: false, truncationReasons: [], limits: { maxChars: max, depth: depthLimit, maxNodes: 300, maxScannedElements: 20000 }, selectorMissing: true };
    walk(root, 0);
    for (const input of root.querySelectorAll('input[type=file]')) {
      if (nodes.length >= 300 || length >= max) { reasons.add('nodeLimit'); break; }
      if ([...state.refs.values()].includes(input)) continue;
      const ref = 'e' + generation + '_' + ++state.counter; state.refs.set(ref, input);
      const item = { ref, role: 'file', name: compact(label(input)) || 'File input', multiple: input.multiple, accept: input.accept, hidden: !visible(input), disabled: input.disabled };
      nodes.push(item); addLine(`file ${JSON.stringify(item.name)} [${ref}]${item.hidden ? ' hidden' : ''}`);
    }
    if (length > max) reasons.add('maxChars');
    return { title: document.title, url: location.href, nodes, text: lines.join('\n').slice(0, max), truncated: reasons.size > 0, truncationReasons: [...reasons], limits: { maxChars: max, depth: depthLimit, maxNodes: 300, maxScannedElements: 20000 }, readyState: document.readyState };

  };
  if (method === 'snapshot' || method === 'find') {
    const result = snapshot();
    if (method === 'find') return { truncated: result.truncated, truncationReasons: result.truncationReasons, limits: result.limits, matches: result.nodes.filter(node => node.name.toLowerCase().includes(String(params.text).toLowerCase())).slice(0, Math.min(params.limit || 20, 50)) };
    return result;
  }
  if (method === 'stage') {
    // A large upload arrives in pieces, because one script call cannot carry tens of megabytes. Each piece is decoded
    // here and held until the upload that names its key.
    const staged = state.staged ??= new Map(), parts = staged.get(params.key) || [];
    const binary = atob(String(params.part)); parts.push(Uint8Array.from(binary, c => c.charCodeAt(0))); staged.set(params.key, parts);
    return { staged: parts.length };
  }
  if (method === 'text') {
    // The readable text of the page, for when the content matters and the controls do not. Cheaper than a snapshot.
    const max = Math.min(Math.max(params.maxChars || 12000, 500), 50000);
    let source, scope;
    if (params.selector) { source = scopeRoot(); scope = 'selector'; if (!source) throw new Error(`NO_SELECTOR_MATCH: nothing matches ${params.selector}`); }
    else if (params.scope === 'page') { source = document.body; scope = 'page'; }
    else if ((source = activeDialog())) scope = 'dialog';
    else if ((source = document.querySelector('main,article,[role=main]'))) scope = 'main';
    else { source = document.body; scope = 'page'; }
    const text = String(source.innerText || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { title: document.title, url: location.href, scope, ...(scope === 'dialog' ? { dialog: compact(label(source)).slice(0, 80) } : {}), text: text.slice(0, max), truncated: text.length > max, totalChars: text.length };
  }
  if (method === 'has') {
    const root = scopeRoot(), text = String(params.text).toLowerCase();
    return { present: !!root && String(root.innerText || '').toLowerCase().includes(text) };
  }
  if (method === 'wait') {
    // Wait in the page for text to appear (or go), so the client does not have to poll with snapshots.
    const text = String(params.text), gone = params.gone === true, limit = Math.min(Math.max(params.timeoutMs || 5000, 100), 10000), start = Date.now();
    const present = () => String(document.body?.innerText || '').toLowerCase().includes(text.toLowerCase());
    return new Promise(resolve => { const check = () => { const met = present() !== gone; if (met || Date.now() - start >= limit) resolve({ met, waitedMs: Date.now() - start, readyState: document.readyState }); else setTimeout(check, 150); }; check(); });
  }
  if (method === 'scroll' && !params.ref) {
    const page = document.scrollingElement || document.documentElement, step = Math.round(innerHeight * .85);
    const top = { top: 0, bottom: page.scrollHeight, down: page.scrollTop + step, up: page.scrollTop - step }[params.to || 'down'];
    if (top === undefined) throw new Error('BAD_SCROLL: use to: top, bottom, up or down, or give a ref');
    page.scrollTo({ top, behavior: 'instant' });
    return { scrollY: Math.round(page.scrollTop), pageHeight: page.scrollHeight, viewportHeight: innerHeight, atBottom: page.scrollTop + innerHeight >= page.scrollHeight - 2 };
  }
  const el = state.refs.get(params.ref);
  if (!el || !el.isConnected) throw new Error('STALE_REFERENCE: get a fresh snapshot');
  if (method === 'scroll') { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); return { scrolledTo: params.ref, scrollY: Math.round((document.scrollingElement || document.documentElement).scrollTop) }; }
  if ((!visible(el) && !(method === 'upload' && el.matches('input[type=file]'))) || el.disabled) throw new Error('ELEMENT_UNAVAILABLE: element is hidden or disabled');
  if (method === 'upload') {
    if (location.origin !== params.expectedOrigin) throw new Error('ORIGIN_MISMATCH: destination origin changed');
    if (!el.matches('input[type=file]')) throw new Error('NOT_FILE_INPUT: select a file input reference');
    if (!Array.isArray(params.files) || params.files.length < 1 || params.files.length > 4 || (!el.multiple && params.files.length > 1)) throw new Error('BAD_FILES: file count does not match this input');
    let total = 0;
    const transfer = new DataTransfer();
    for (const file of params.files) {
      if (typeof file.name !== 'string') throw new Error('BAD_FILES: invalid file payload');
      let chunks;
      if (typeof file.staged === 'string') { chunks = state.staged?.get(file.staged); state.staged?.delete(file.staged); if (!chunks) throw new Error('BAD_FILES: staged file is missing; send the upload again'); }
      else { if (typeof file.data !== 'string' || file.data.length > 2796208) throw new Error('BAD_FILES: invalid file payload'); const binary = atob(file.data); chunks = [Uint8Array.from(binary, c => c.charCodeAt(0))]; }
      total += chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (total > 26214400) throw new Error('UPLOAD_LIMIT: files exceed 25 MiB');
      transfer.items.add(new File(chunks, file.name, { type: file.type || 'application/octet-stream' }));
    }
    el.files = transfer.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { attached: params.files.map(f => ({ name: f.name })), bytes: total, origin: location.origin, eventType: 'DOM' };
  }
  if (method === 'click') {
    const anchor = el.closest('a[href]');
    const target = anchor?.getAttribute('target') || document.querySelector('base')?.target;
    if (anchor && target && !['_self', '_top', '_parent'].includes(target.toLowerCase())) {
      // Let SPA handlers cancel the click before emulating the native link.
      // Temporarily use _self so stopped propagation cannot activate a new tab.
      const originalTarget = anchor.getAttribute('target');
      anchor.setAttribute('target', '_self');
      let openUrl;
      const intercept = event => {
        if (event !== click) return;
        if (!event.defaultPrevented) openUrl = anchor.href;
        event.preventDefault();
      };
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window });
      window.addEventListener('click', intercept);
      try { el.dispatchEvent(click); }
      finally {
        window.removeEventListener('click', intercept);
        if (originalTarget === null) anchor.removeAttribute('target');
        else anchor.setAttribute('target', originalTarget);
      }
      return openUrl ? { openUrl } : { clicked: params.ref };
    }
    const formTarget = el.form?.target;
    if (formTarget && !['_self', '_top', '_parent'].includes(formTarget.toLowerCase())) throw new Error('NEW_WINDOW_FORM: submitting into another window is unsupported');
    el.click(); return { clicked: params.ref };
  }
  if (method === 'hover') {
    // Opens menus and tooltips that listen for the pointer. These are DOM events, not a real pointer.
    const box = el.getBoundingClientRect(), at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true, cancelable: true, composed: true, view: window };
    for (const type of ['pointerover', 'pointerenter', 'pointermove']) el.dispatchEvent(new PointerEvent(type, { ...at, pointerType: 'mouse', bubbles: type !== 'pointerenter' }));
    for (const type of ['mouseover', 'mouseenter', 'mousemove']) el.dispatchEvent(new MouseEvent(type, { ...at, bubbles: type !== 'mouseenter' }));
    return { hovered: params.ref };
  }
  if (method === 'press') {
    // A key as DOM events on the element. Enter in a single-line form field also submits the form, as a browser would.
    const key = String(params.key), named = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, PageUp: 33, PageDown: 34, ' ': 32 };
    if (!(key in named) && key.length !== 1) throw new Error('BAD_KEY: use one character or Enter, Escape, Tab, Backspace, Delete, Home, End, PageUp, PageDown or an arrow key');
    if (el.matches('input[type=password]')) throw new Error('SENSITIVE_INPUT: password inputs are not supported');
    const keyCode = named[key] ?? key.toUpperCase().charCodeAt(0), code = key.length === 1 && key !== ' ' ? (/[a-z]/i.test(key) ? 'Key' + key.toUpperCase() : /\d/.test(key) ? 'Digit' + key : '') : key === ' ' ? 'Space' : key;
    const init = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true, view: window };
    const allowed = el.dispatchEvent(new KeyboardEvent('keydown', init));
    if (allowed && (key.length === 1 || key === 'Enter')) el.dispatchEvent(new KeyboardEvent('keypress', init));
    let submitted = false;
    if (allowed && key === 'Enter' && el.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio])') && el.form) {
      if (el.form.target && !['_self', '_top', '_parent'].includes(el.form.target.toLowerCase())) throw new Error('NEW_WINDOW_FORM: submitting into another window is unsupported');
      el.form.requestSubmit(); submitted = true;
    }
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    return { pressed: key, submitted, prevented: !allowed };
  }
  if (method === 'fill') {
    if (el.matches('input[type=file],input[type=password]')) throw new Error('SENSITIVE_INPUT: file and password inputs are not supported in this MVP');
    const control = hiddenControl(el);
    if (el.matches('input[type=checkbox],input[type=radio]') || control || ariaToggle(el)) {
      if (typeof params.value !== 'boolean') throw new Error('BAD_VALUE: a checkbox, radio or switch takes true or false');
      const now = () => control ? control.checked : el.matches('input') ? el.checked : el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true';
      if (now() !== params.value) el.click();
      return { filled: params.ref, checked: now() };
    } else if (el.matches('input,textarea,select')) {
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(params.value));
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      // Rich editors (Draft.js, ProseMirror, Lexical) keep their own model and discard direct DOM edits. Offer the text
      // as a paste first: an editor that takes it cancels the event. Plain editable elements fall back to a DOM edit.
      const value = String(params.value), data = new DataTransfer();
      data.setData('text/plain', value);
      getSelection()?.selectAllChildren(el);
      const taken = !el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      if (!taken) { el.textContent = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
      return { filled: params.ref, via: taken ? 'paste' : 'text' };
    }
    else throw new Error('Element cannot be filled');
    return { filled: params.ref };
  }
  throw new Error('Unknown DOM method');
  } catch (error) {
    const message = String(error.message || 'DOM operation failed').slice(0, 500);
    return { __quietError: { code: /^[A-Z_]+:/.test(message) ? message.split(':')[0] : 'DOM_ERROR', message } };
  }
}
