/* Move the lifecycle badge to the end of its metadata line so margin-left:auto can right-align it,
   without disturbing the company / city / JD arrow sequence. */
(() => {
  const relocate = root => {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.job-meta-line').forEach(line => {
      const badge = line.querySelector('.status-expired-company');
      if (badge && badge.parentElement === line && badge !== line.lastElementChild) line.appendChild(badge);
    });
  };
  const host = document.getElementById('jobs');
  relocate(document);
  if (!host) return;
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches && node.matches('.job-meta-line')) {
        const badge = node.querySelector('.status-expired-company');
        if (badge && badge.parentElement === node && badge !== node.lastElementChild) node.appendChild(badge);
      }
      relocate(node);
    }));
  }).observe(host, {childList: true, subtree: true});
})();
