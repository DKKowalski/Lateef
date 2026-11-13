// Shared page behaviour: the theme switch and the copy button. Loaded in <head> so a saved theme applies before first paint.
(function () {
  const root = document.documentElement, KEY = 'lateef-theme';
  root.classList.add('js');
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage can be blocked; the system theme still applies */ }
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  const dark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;

  document.addEventListener('DOMContentLoaded', () => {
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      const label = () => button.setAttribute('aria-label', dark() ? 'Switch to light theme' : 'Switch to dark theme');
      label();
      button.addEventListener('click', () => {
        root.dataset.theme = dark() ? 'light' : 'dark';
        try { localStorage.setItem(KEY, root.dataset.theme); } catch { /* not saved; still applies to this page */ }
        label();
      });
    }
    for (const button of document.querySelectorAll('[data-copy]')) {
      const status = button.parentElement.querySelector('[role="status"]');
      let timer;
      button.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(button.dataset.copy); } catch { if (status) status.textContent = 'Copy failed. Select the command instead.'; return; }
        button.classList.add('is-copied');
        if (status) status.textContent = 'Copied.';
        clearTimeout(timer);
        timer = setTimeout(() => { button.classList.remove('is-copied'); if (status) status.textContent = ''; }, 1600);
      });
    }
  });
})();
