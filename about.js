/* Apply the shared preference before paint; navigation remains usable without JS. */
(() => {
  const root = document.documentElement;
  const system = window.matchMedia?.('(prefers-color-scheme: dark)');
  let saved;
  try { saved = localStorage.getItem('theme'); } catch {}
  let explicit = saved === 'dark' || saved === 'light';
  const apply = theme => {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    const toggle = document.getElementById('aboutThemeToggle');
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    toggle?.setAttribute('aria-label', label);
    toggle?.setAttribute('title', label);
    toggle?.setAttribute('aria-pressed', String(theme === 'dark'));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#132333' : '#eff0ef');
  };
  apply(explicit ? saved : system?.matches ? 'dark' : 'light');
  system?.addEventListener('change', event => { if (!explicit) apply(event.matches ? 'dark' : 'light'); });
  window.addEventListener('storage', event => {
    if (event.key !== 'theme' && event.key !== null) return;
    explicit = event.newValue === 'dark' || event.newValue === 'light';
    apply(explicit ? event.newValue : system?.matches ? 'dark' : 'light');
  });
  function ready() {
    apply(root.getAttribute('data-theme'));
    document.getElementById('aboutThemeToggle')?.addEventListener('click', () => {
      const theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      explicit = true;
      apply(theme);
      try { localStorage.setItem('theme', theme); } catch {}
    });
    const links = [...document.querySelectorAll('.about-toc a')];
    const sections = links.map(link => document.getElementById(link.hash.slice(1)));
    let pending = false;
    const update = () => {
      pending = false;
      let current = null;
      sections.forEach(section => { if (section && section.getBoundingClientRect().top <= 140) current = section.id; });
      links.forEach(link => {
        if (link.hash === '#' + current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const queue = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', queue, {passive:true});
    window.addEventListener('resize', queue);
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, {once:true});
  else ready();
})();
