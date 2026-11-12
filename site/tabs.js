// Turns the stacked client instructions on the install page into tabs. Without this script every panel stays visible.
for (const root of document.querySelectorAll('[data-tabs]')) {
  const list = root.querySelector('[role="tablist"]'), tabs = [...list.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => root.querySelector('#' + tab.getAttribute('aria-controls')));
  function select(index, focus) {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panels[i].hidden = i !== index; });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', event => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); select((next + tabs.length) % tabs.length, true);
    });
  });
  list.hidden = false; root.classList.add('tabs-ready'); select(0);
}
