/* About page: mirror the site's existing local theme preference. */
(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('aboutThemeToggle');
  if (!toggle) return;
  const saved = (() => {
    try { return localStorage.getItem('theme'); } catch { return null; }
  })();
  const preferred = saved === 'dark' || saved === 'light'
    ? saved
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const apply = (theme, persist = false) => {
    root.setAttribute('data-theme', theme);
    toggle.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    toggle.setAttribute('title', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#132333' : '#eff0ef');
    if (persist) { try { localStorage.setItem('theme', theme); } catch {} }
  };
  apply(preferred);
  toggle.addEventListener('click', () => apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true));
})();
