/* Progressive disclosure only; chart data and rendering stay in top30-layout.js.
   The Top 30 field is the richest figure on the page, so it opens expanded;
   readers can still fold it away. */
(() => {
  const toggle = document.getElementById('top50Toggle');
  const chart = document.getElementById('top50');
  const legend = document.getElementById('top50Legend');
  if (!toggle || !chart) return;
  const setExpanded = expanded => {
    chart.hidden = !expanded;
    if (legend) legend.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Collapse' : 'Expand';
  };
  setExpanded(true);
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
  });
})();
