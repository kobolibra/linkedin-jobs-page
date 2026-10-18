/* Align closed-date badges only while their rows are near the viewport.
   Measuring offscreen rows defeats content-visibility and blocks list input. */
(() => {
  const desktop = window.matchMedia('(min-width:721px)');
  const visible = new Set();
  const observed = new WeakSet();
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  const run = () => {
    queued = false;
    const rows = [];
    // Finish DOM moves before measuring, then finish all reads before writes.
    visible.forEach(job => {
      if (!job.isConnected) { visible.delete(job); return; }
      const badge = job.querySelector('.status-expired-company');
      const line = job.querySelector('.job-meta-line');
      if (!badge || !line) return;
      // New row footers align in CSS; preserve the footer and skip geometry reads.
      if (badge.parentElement?.classList?.contains('job-meta-end')) {
        badge.style.top = ''; badge.style.right = ''; return;
      }
      if (badge.parentElement !== line || line.lastElementChild !== badge) line.appendChild(badge);
      if (!desktop.matches) {
        badge.style.top = '';
        badge.style.right = '';
        return;
      }
      rows.push({job, badge, anchor:job.querySelector('.job-sub') || line, right:job.querySelector('.job-right')});
    });
    const positions = rows.map(({job, badge, anchor, right}) => {
      const jobBox = job.getBoundingClientRect();
      const anchorBox = anchor.getBoundingClientRect();
      if (!anchorBox.height) return null;
      const top = anchorBox.top - jobBox.top + (anchorBox.height - (badge.offsetHeight || 18)) / 2;
      const edge = right ? Math.max(0, jobBox.right - right.getBoundingClientRect().right) : 8;
      return {badge, top:Math.round(top) + 'px', right:Math.round(edge) + 'px'};
    });
    positions.forEach(position => {
      if (!position) return;
      const {badge, top, right} = position;
      if (badge.style.top !== top) badge.style.top = top;
      if (badge.style.right !== right) badge.style.right = right;
    });
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    });
    if (visible.size) queue();
  }, {rootMargin:'160px 0px'});
  const register = root => {
    if (root.nodeType !== 1) return;
    const jobs = root.matches?.('.job.expired') ? [root] : root.querySelectorAll('.job.expired');
    jobs.forEach(job => {
      if (observed.has(job)) return;
      observed.add(job);
      observer.observe(job);
    });
  };
  const start = () => {
    const list = document.getElementById('jobs');
    if (list) {
      register(list);
      new MutationObserver(mutations => {
        mutations.forEach(mutation => {mutation.addedNodes.forEach(register);mutation.removedNodes.forEach(root=>{if(root.nodeType!==1)return;const jobs=root.matches?.('.job.expired')?[root]:root.querySelectorAll('.job.expired');jobs.forEach(job=>{observer.unobserve(job);visible.delete(job);observed.delete(job);});});});
      }).observe(list, {childList:true, subtree:true});
    }
    new MutationObserver(queue).observe(document.body, {attributes:true, attributeFilter:['class']});
    window.addEventListener('resize', queue, {passive:true});
    document.addEventListener('toggle', queue, true);
    document.addEventListener('jobsfilterchange', queue);
    document.fonts?.ready.then(queue).catch(() => {});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
