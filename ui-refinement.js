/* Progressive disclosure only; chart data and rendering stay in top30-layout.js. */
(() => {
  const toggle = document.getElementById('top50Toggle');
  const chart = document.getElementById('top50');
  if (!toggle || !chart) return;
  const setExpanded = expanded => {
    chart.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? '收起图表' : '展开图表';
  };
  setExpanded(false);
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
  });
})();
