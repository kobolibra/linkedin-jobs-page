/* Top 30 bubble chart: padded non-zero domain, larger bubbles, self-healing render.
   Goal: stretch the cluster across the full plot (especially CN) instead of
   squeezing every company into the bottom-left corner of a 0..max axis. */
(() => {
  const MARK = 'relaxed-v5';
  const g = window;

  const fnNorm = (loc) => {
    if (typeof norm === 'function') return norm(loc);
    const s = String(loc || '').toLowerCase();
    if (/hong kong|香港/.test(s)) return 'HK';
    if (/singapore|新加坡/.test(s)) return 'SG';
    if (/china|shanghai|beijing|shenzhen|中国|上海|北京|深圳|广州|杭州/.test(s)) return 'CN';
    return 'OTHER';
  };
  const fnActive = (j) => (typeof isActiveJob === 'function'
    ? isActiveJob(j)
    : String((j && j.jobStatus) || 'active') !== 'expired');
  const fnCompany = (n) => (typeof canonicalCompany === 'function'
    ? canonicalCompany(n)
    : String(n || '').trim());
  const stateRows = () => {
    try { if (typeof top50Rows !== 'undefined' && Array.isArray(top50Rows)) return top50Rows; } catch (e) {}
    return Array.isArray(g.top50Rows) ? g.top50Rows : null;
  };
  const stateMode = () => {
    try { if (typeof top50Mode !== 'undefined' && top50Mode) return top50Mode; } catch (e) {}
    return g.top50Mode || 'all';
  };

  const escSvg = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
  const companyLabel = (name) => {
    const short = String(name || '').trim().split(/\s+/).slice(0, 6).join(' ');
    return short.length > 30 ? short.slice(0, 29) + '…' : short;
  };
  const labelWidth = (s) => [...String(s || '')].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 7.5 : 4.45), 0);

  const renderTop30Relaxed = (rows, mode = 'all') => {
    const host = document.getElementById('top50');
    if (!host || !Array.isArray(rows)) return;
    const now = Date.now();
    const scoped = (mode === 'all' ? rows : rows.filter((j) => fnNorm(j.location) === mode)).filter(fnActive);
    const counts = new Map();
    scoped.forEach((job) => {
      const name = fnCompany(job.company || '未知机构') || '未知机构';
      if (!name) return;
      if (!counts.has(name)) counts.set(name, { total: 0, ages: [] });
      const item = counts.get(name);
      item.total += 1;
      const seen = Date.parse(job.firstSeen || '');
      if (Number.isFinite(seen)) item.ages.push(Math.max(0, (now - seen) / 86400000));
    });
    const top = [...counts.entries()]
      .filter(([, d]) => d.ages.length)
      .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'zh-Hans-CN'))
      .slice(0, 30);
    if (!top.length) return;

    const W = 820, H = 620, left = 58, plotRight = 762, plotTop = 36, plotBottom = 570;
    const stats = top.map(([, d]) => {
      const ages = [...d.ages].sort((a, b) => a - b), n = ages.length;
      return {
        mean: ages.reduce((a, b) => a + b, 0) / n,
        median: n % 2 ? ages[(n - 1) / 2] : (ages[n / 2 - 1] + ages[n / 2]) / 2
      };
    });
    const vals = stats.flatMap((v) => [v.mean, v.median]).sort((a, b) => a - b);
    const minValue = vals[0] || 0;
    const maxValue = vals[vals.length - 1] || 1;
    const q90 = vals[Math.max(0, Math.ceil(vals.length * 0.9) - 1)] || maxValue;
    const step = maxValue <= 40 ? 5 : 10;
    const up = (v) => Math.ceil(v / step) * step;
    const down = (v) => Math.max(0, Math.floor(v / step) * step);

    // Isolate a genuine outlier tail; otherwise use one continuous padded scale.
    const brokenAxis = maxValue > q90 * 1.8 && (maxValue - q90) > 25;
    let knee = brokenAxis ? Math.min(up(q90 * 1.05), up(maxValue) - step) : null;
    const clusterTop = brokenAxis ? knee : maxValue;
    // Non-zero floor: this is what stops CN from collapsing into one corner.
    let domainMin = down(minValue - Math.max(step, (clusterTop - minValue) * 0.1));
    const domainMax = brokenAxis ? up(maxValue) : up(maxValue + Math.max(step * 0.6, (clusterTop - minValue) * 0.08));
    if (!(clusterTop - domainMin >= step * 1.5)) domainMin = 0;
    if (brokenAxis && !(knee > domainMin + step)) { knee = null; }
    const broken = brokenAxis && knee != null;
    const mainShare = 0.82;

    const unit = (value) => {
      const v = Math.max(domainMin, Math.min(domainMax, Number(value) || 0));
      if (!broken) return (v - domainMin) / Math.max(1e-6, domainMax - domainMin);
      if (v <= knee) return mainShare * ((v - domainMin) / Math.max(1e-6, knee - domainMin));
      return mainShare + (1 - mainShare) * Math.min(1, (v - knee) / Math.max(1e-6, domainMax - knee));
    };
    const x = (v) => left + (plotRight - left) * unit(v);
    const y = (v) => plotBottom - (plotBottom - plotTop) * unit(v);

    const tickTop = broken ? knee : domainMax;
    const rawSpan = tickTop - domainMin;
    const tickStep = rawSpan <= 20 ? 2 : rawSpan <= 40 ? 5 : rawSpan <= 90 ? 10 : 20;
    const ticks = [];
    for (let v = Math.ceil(domainMin / tickStep) * tickStep; v <= tickTop + 1e-6; v += tickStep) ticks.push(Number(v.toFixed(2)));
    if (!ticks.length || ticks[0] > domainMin) ticks.unshift(domainMin);
    if (ticks[ticks.length - 1] !== tickTop) ticks.push(tickTop);
    if (broken) ticks.push(domainMax);

    const grid = ticks.map((v) => (v === domainMax && broken ? ''
      : '<line class="bubble-grid" x1="' + x(v).toFixed(1) + '" y1="' + plotTop + '" x2="' + x(v).toFixed(1) + '" y2="' + plotBottom + '"/>')
      + '<text class="bubble-axis" x="' + x(v).toFixed(1) + '" y="' + (plotBottom + 17) + '" text-anchor="middle">' + Math.round(v) + '</text>').join('')
      + ticks.map((v) => (v === domainMax && broken ? ''
        : '<line class="bubble-grid" x1="' + left + '" y1="' + y(v).toFixed(1) + '" x2="' + plotRight + '" y2="' + y(v).toFixed(1) + '"/>')
        + '<text class="bubble-axis" x="' + (left - 10) + '" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + Math.round(v) + '</text>').join('');

    const breakX = broken ? x(knee) + (plotRight - left) * 0.014 : 0;
    const breakY = broken ? y(knee) - (plotBottom - plotTop) * 0.014 : 0;
    const axisBreaks = broken
      ? '<path class="bubble-axis-break" d="M ' + (breakX - 5) + ' ' + (plotBottom + 3) + ' l 4 -6 l 4 6 l 4 -6"/>'
        + '<path class="bubble-axis-break" d="M ' + (left - 3) + ' ' + (breakY + 5) + ' l 6 -4 l -6 -4 l 6 -4"/>'
        + '<text class="bubble-outlier-note" x="' + (breakX + 10) + '" y="' + (plotBottom - 8) + '">OUTLIER RANGE</text>'
      : '';

    const palette = ['#F5572F', '#D4A017', '#ACAD79', '#7096D1', '#334EAC', '#081F5C'];
    const maxTotal = Math.max(1, ...top.map(([, d]) => d.total));
    const points = top.map(([name, item], i) => {
      const s = stats[i];
      const r = 5.5 + Math.sqrt(item.total / maxTotal) * 11;
      const rawX = x(s.mean), rawY = y(s.median);
      return {
        name, item, i, mean: s.mean, median: s.median, r,
        rawX, rawY, px: rawX, py: rawY,
        color: palette[Math.min(5, Math.floor(i / 5))],
        label: companyLabel(name)
      };
    });

    for (let pass = 0; pass < 240; pass++) {
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i], b = points[j];
          let dist = Math.hypot(b.px - a.px, b.py - a.py);
          const min = a.r + b.r + 4;
          if (dist >= min) continue;
          if (dist < 0.01) {
            const angle = ((i + 1) * 37 + (j + 1) * 61) * Math.PI / 180;
            b.px += Math.cos(angle); b.py += Math.sin(angle); dist = 1;
          }
          const push = (min - dist) * 0.5, ux = (b.px - a.px) / dist, uy = (b.py - a.py) / dist;
          a.px -= ux * push; a.py -= uy * push; b.px += ux * push; b.py += uy * push;
        }
      }
      points.forEach((p) => {
        p.px += (p.rawX - p.px) * 0.02;
        p.py += (p.rawY - p.py) * 0.02;
        const maxShift = 42, dx = p.px - p.rawX, dy = p.py - p.rawY, d = Math.hypot(dx, dy);
        if (d > maxShift) { p.px = p.rawX + dx / d * maxShift; p.py = p.rawY + dy / d * maxShift; }
        p.px = Math.max(left + p.r, Math.min(plotRight - p.r, p.px));
        p.py = Math.max(plotTop + p.r, Math.min(plotBottom - p.r, p.py));
      });
    }

    const occupied = [];
    const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    [...points].sort((a, b) => a.py - b.py).forEach((p) => {
      const w = labelWidth(p.label), candidates = [];
      const shifts = [0, -12, 12, -24, 24, -36, 36, -50, 50, -66, 66];
      for (const shift of shifts) {
        for (const side of ['right', 'left', 'below', 'above']) {
          let lx, ly, anchor;
          if (side === 'right') { lx = p.px + p.r + 7; ly = p.py + shift; anchor = 'start'; }
          else if (side === 'left') { lx = p.px - p.r - 7; ly = p.py + shift; anchor = 'end'; }
          else if (side === 'below') { lx = p.px + shift; ly = p.py + p.r + 13; anchor = 'middle'; }
          else { lx = p.px + shift; ly = p.py - p.r - 10; anchor = 'middle'; }
          const bx = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
          const box = { x: bx, y: ly - 6, w, h: 11 };
          if (box.x < left + 2 || box.x + box.w > plotRight - 2 || box.y < plotTop || box.y + box.h > plotBottom) continue;
          const collisions = occupied.filter((o) => overlaps(box, o)).length;
          candidates.push({ lx, ly, anchor, box, cost: collisions * 10000 + Math.abs(shift) * 4 + (side === 'right' ? 0 : side === 'left' ? 1 : 2) });
        }
      }
      const best = candidates.sort((a, b) => a.cost - b.cost)[0]
        || { lx: p.px + p.r + 7, ly: p.py, anchor: 'start', box: { x: p.px + p.r + 7, y: p.py - 6, w, h: 11 } };
      p.labelBox = best;
      occupied.push(best.box);
    });

    const pointMarkup = points.map((p) => {
      const deep = p.i >= 20, ink = deep ? '#F0EFEB' : '#1C1C1A';
      const displaced = Math.hypot(p.px - p.rawX, p.py - p.rawY) > 2.5;
      const positionLeader = displaced
        ? '<line class="bubble-position-leader" x1="' + p.rawX.toFixed(1) + '" y1="' + p.rawY.toFixed(1) + '" x2="' + p.px.toFixed(1) + '" y2="' + p.py.toFixed(1) + '"/>'
        : '';
      const b = p.labelBox, w = labelWidth(p.label);
      const labelLeft = b.anchor === 'start' ? b.lx : b.anchor === 'end' ? b.lx - w : b.lx - w / 2;
      const labelLeader = '<line class="bubble-label-leader" x1="' + p.px.toFixed(1) + '" y1="' + p.py.toFixed(1)
        + '" x2="' + (b.anchor === 'start' ? b.lx - 2 : b.anchor === 'end' ? b.lx + 2 : b.lx).toFixed(1) + '" y2="' + b.ly.toFixed(1) + '"/>';
      const title = escSvg(p.name) + ' · ' + p.item.total + ' 个职位 · 平均 ' + p.mean.toFixed(1) + ' 天 · 中位 ' + p.median.toFixed(1) + ' 天';
      return '<g class="bubble-row bubble-drill" data-company="' + escSvg(p.name) + '" style="--i:' + p.i + '" role="button" tabindex="0">'
        + positionLeader + labelLeader
        + '<rect class="bubble-hit" x="' + (labelLeft - 2).toFixed(1) + '" y="' + (b.ly - 7).toFixed(1) + '" width="' + (w + 4).toFixed(1) + '" height="11" rx="2"/>'
        + '<circle class="bubble-point" cx="' + p.px.toFixed(1) + '" cy="' + p.py.toFixed(1) + '" r="' + p.r.toFixed(1) + '" fill="' + p.color + '"><title>' + title + '</title></circle>'
        + '<text class="bubble-company" x="' + b.lx.toFixed(1) + '" y="' + b.ly.toFixed(1) + '" text-anchor="' + b.anchor + '">' + escSvg(p.label) + '</text>'
        + '<text class="bubble-total' + (deep ? ' bubble-total-deep' : '') + '" fill="' + ink + '" x="' + p.px.toFixed(1) + '" y="' + (p.py + 2.5).toFixed(1) + '" text-anchor="middle">' + p.item.total + '</text>'
        + '</g>';
    }).join('');

    const diagStart = domainMin, diagEnd = broken ? knee : domainMax;
    const diagonal = '<line class="bubble-diagonal" x1="' + x(diagStart).toFixed(1) + '" y1="' + y(diagStart).toFixed(1)
      + '" x2="' + x(diagEnd).toFixed(1) + '" y2="' + y(diagEnd).toFixed(1) + '"/>';

    host.classList.remove('is-ready');
    host.innerHTML = '<svg class="top20-svg bubble-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Top 30 机构平均首次发现天数、中位数与职位数量气泡图">'
      + grid + axisBreaks + diagonal
      + '<text class="bubble-x-title" x="' + ((left + plotRight) / 2) + '" y="' + (H - 2) + '" text-anchor="middle">AVG DAYS SINCE FIRST SEEN</text>'
      + '<text class="bubble-y-title" x="31" y="' + ((plotTop + plotBottom) / 2) + '" text-anchor="middle" transform="rotate(-90 31 ' + ((plotTop + plotBottom) / 2) + ')">MEDIAN DAYS</text>'
      + pointMarkup + '</svg>';
    host.dataset.layout = MARK;
    requestAnimationFrame(() => host.classList.add('is-ready'));
  };

  const safeRender = (rows, mode) => {
    try { renderTop30Relaxed(rows, mode); }
    catch (err) { console.warn('[top30-layout] render failed', err); }
  };

  // Override the built-in renderer both lexically and on window.
  try { renderTop50 = safeRender; } catch (e) {}
  g.renderTop50 = safeRender;
  g.renderTop30Relaxed = safeRender;

  // Self-healing: if the built-in chart was drawn anyway, redraw with this layout.
  let healing = false;
  const heal = () => {
    const host = document.getElementById('top50');
    if (!host || healing) return;
    if (host.dataset.layout === MARK) return;
    if (!host.querySelector('svg')) return;
    const rows = stateRows();
    if (!rows || !rows.length) return;
    healing = true;
    safeRender(rows, stateMode());
    healing = false;
  };
  const schedule = () => [0, 400, 1200, 2500, 5000].forEach((t) => setTimeout(heal, t));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
  const attach = () => {
    const host = document.getElementById('top50');
    if (!host) { setTimeout(attach, 500); return; }
    new MutationObserver(() => heal()).observe(host, { childList: true });
  };
  attach();
})();
