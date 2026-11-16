/* Progressive disclosure only; chart data and rendering stay in top30-layout.js.
   The Top 30 field adds roughly 960px above the job list, so it starts folded,
   as before. Its headline, summary and controls stay visible, and a reader who
   opens it finds it open on the next visit. */
(() => {
  const toggle = document.getElementById('top50Toggle');
  const chart = document.getElementById('top50');
  const legend = document.getElementById('top50Legend');
  if (!toggle || !chart) return;
  const KEY = 'top30-expanded';
  const remembered = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
  const remember = open => { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch {} };
  const setExpanded = expanded => {
    chart.hidden = !expanded;
    if (legend) legend.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Collapse' : 'Expand';
  };
  setExpanded(remembered());
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setExpanded(open);
    remember(open);
  });
})();
