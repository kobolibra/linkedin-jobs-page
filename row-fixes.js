/* Lifecycle badge alignment.
   `.job` is a 3-column grid (44px | 1fr | auto). The metadata line lives inside the middle
   column, so `margin-left:auto` can only reach the middle column's right edge - far left of the
   star/ban icons in column 3. To match the star/ban right edge exactly, the badge is absolutely
   positioned against the `.job` article (position:relative) and vertically centered on the
   company/city/JD-arrow line. */
(() => {
  const DESKTOP = '(min-width:721px)';
  const EDGE_FALLBACK = 8;

  const place = (job) => {
    const badge = job.querySelector('.status-expired-company');
    if (!badge) return;
    const line = job.querySelector('.job-meta-line');
    const sub = job.querySelector('.job-sub');
    if (!line) return;
    // Keep the badge inside the metadata line in DOM order (last item on that row).
    if (badge.parentElement !== line || line.lastElementChild !== badge) line.appendChild(badge);
    if (!window.matchMedia(DESKTOP).matches) { badge.style.top = ''; badge.style.right = ''; return; }
    const right = job.querySelector('.job-right');
    const jobBox = job.getBoundingClientRect();
    const anchor = (sub || line).getBoundingClientRect();
    if (!anchor.height) return;
    const badgeH = badge.offsetHeight || 18;
    const top = anchor.top - jobBox.top + (anchor.height - badgeH) / 2;
    const edge = right ? Math.max(0, jobBox.right - right.getBoundingClientRect().right) : EDGE_FALLBACK;
    badge.style.top = Math.round(top) + 'px';
    badge.style.right = Math.round(edge) + 'px';
  };

  let queued = false;
  const run = () => {
    queued = false;
    document.querySelectorAll('.job .status-expired-company').forEach((badge) => {
      const job = badge.closest('.job');
      if (job) place(job);
    });
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };

  const start = () => {
    const list = document.getElementById('jobs');
    schedule();
    if (list) new MutationObserver(schedule).observe(list, { childList: true, subtree: true });
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('toggle', schedule, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule).catch(() => {});
    [300, 1000, 2500].forEach((t) => setTimeout(schedule, t));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
