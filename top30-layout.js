/* Top 30 bubble chart layout.
   Design rules (verified by /data/linkedin-audit/top30-test.js):
   1. Padded, non-zero axis domain scaled to the visible spread, so a tight cluster (CN)
      fills the plot instead of collapsing into one corner of a 0..max axis.
   2. Bubbles are separated by a relaxation pass; no bubble-bubble overlap.
   3. Labels are placed only in slots that collide with NO bubble and NO other label.
      If a point has no clean slot, its label is dropped (the in-bubble count and the
      tooltip still identify it), because stacked unreadable text is worse than none.
   Exported for Node so the layout can be regression-tested headlessly. */
(() => {
  const MARK = 'accurate-v8-fixed-coordinates';
  const g = typeof window !== 'undefined' ? window : globalThis;

  const escSvg = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
  const companyLabel = (name) => {
    const short = String(name || '').trim().split(/\s+/).slice(0, 4).join(' ');
    return short.length > 24 ? short.slice(0, 23) + '\u2026' : short;
  };
  const labelWidth = (s) => [...String(s || '')].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 7.2 : 4.3), 0);
  const LABEL_H = 10;

  const rectsOverlap = (a, b, pad = 3) =>
    a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  const circleHitsRect = (cx, cy, r, box) => {
    const nx = Math.max(box.x, Math.min(cx, box.x + box.w));
    const ny = Math.max(box.y, Math.min(cy, box.y + box.h));
    return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r;
  };

  // entries: [[name, {total, ages:[days]}], ...] already sorted by total desc, max 30
  const computeLayout = (entries) => {
    const W = 820, H = 620, left = 58, plotRight = 762, plotTop = 36, plotBottom = 570;
    const stats = entries.map(([, d]) => {
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
    const outlier = maxValue > q90 * 1.8 && (maxValue - q90) > 25;
    // Scale the tick step to the visible spread, not to the absolute maximum: a cluster
    // between 12 and 15 days must not be forced onto a 0..20 axis.
    const clusterMax = outlier ? q90 : maxValue;
    const rawSpread = Math.max(1, clusterMax - minValue);
    const step = rawSpread <= 6 ? 1 : rawSpread <= 15 ? 2 : rawSpread <= 40 ? 5 : 10;
    const up = (v) => Math.ceil(v / step) * step;
    const down = (v) => Math.max(0, Math.floor(v / step) * step);
    const pad = Math.max(step * 0.6, rawSpread * 0.08);

    let knee = outlier ? Math.min(up(clusterMax + pad), up(maxValue) - step) : null;
    const clusterTop = outlier ? knee : maxValue;
    let domainMin = down(minValue - pad);
    let domainMax = outlier ? up(maxValue) : up(maxValue + pad);
    if (domainMax - domainMin < step * 3) domainMax = domainMin + step * 3;
    if (outlier && !(knee > domainMin + step * 2)) knee = null;
    const broken = outlier && knee != null;
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
    const span = tickTop - domainMin;
    const tickStep = span <= 8 ? 1 : span <= 20 ? 2 : span <= 40 ? 5 : span <= 90 ? 10 : 20;
    const ticks = [];
    for (let v = Math.ceil(domainMin / tickStep) * tickStep; v <= tickTop + 1e-6; v += tickStep) {
      ticks.push(Number(v.toFixed(2)));
    }
    if (!ticks.length || ticks[0] > domainMin) ticks.unshift(domainMin);
    if (ticks[ticks.length - 1] !== tickTop) ticks.push(tickTop);
    if (broken) ticks.push(domainMax);

    const palette = ['#F5572F', '#D4A017', '#ACAD79', '#7096D1', '#334EAC', '#081F5C'];
    const maxTotal = Math.max(1, ...entries.map(([, d]) => d.total));
    const points = entries.map(([name, item], i) => {
      const s = stats[i];
      const r = 6 + Math.sqrt(item.total / maxTotal) * 8;
      const rawX = x(s.mean), rawY = y(s.median);
      return {
        name, total: item.total, i, mean: s.mean, median: s.median, r,
        rawX, rawY, px: rawX, py: rawY,
        color: palette[Math.min(5, Math.floor(i / 5))],
        label: companyLabel(name), labelBox: null
      };
    });

    // Coordinates are data, not decoration: every visible bubble is locked to
    // the exact mean/median projection.  We deliberately do not jitter,
    // relax, expand, or clamp the centers.  Labels are the only elements that
    // may move around the points to resolve collisions.

    // Label slots: must clear every bubble and every placed label.
    const dirs = [
      [1, 0], [-1, 0], [0, -1], [0, 1],
      [0.86, -0.5], [0.86, 0.5], [-0.86, -0.5], [-0.86, 0.5]
    ];
    const gaps = [5, 12, 20, 30, 42, 56];
    const placed = [];
    [...points].sort((a, b) => b.total - a.total || a.i - b.i).forEach((p) => {
      const w = labelWidth(p.label);
      let best = null;
      for (let gi = 0; gi < gaps.length && !best; gi++) {
        const candidates = [];
        for (let di = 0; di < dirs.length; di++) {
          const [ux, uy] = dirs[di];
          const cx = p.px + ux * (p.r + gaps[gi]);
          const cy = p.py + uy * (p.r + gaps[gi]);
          const anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
          const ly = cy + (uy > 0.3 ? LABEL_H * 0.8 : uy < -0.3 ? -2 : 3.4);
          const bx = anchor === 'start' ? cx : anchor === 'end' ? cx - w : cx - w / 2;
          const box = { x: bx, y: ly - LABEL_H * 0.78, w, h: LABEL_H };
          if (box.x < left + 2 || box.x + box.w > plotRight - 2) continue;
          if (box.y < plotTop + 1 || box.y + box.h > plotBottom - 1) continue;
          if (points.some((q) => circleHitsRect(q.px, q.py, q.r + 2.5, box))) continue;
          if (placed.some((o) => rectsOverlap(box, o))) continue;
          candidates.push({ lx: cx, ly, anchor, box, cost: gaps[gi] + di * 0.6 });
        }
        best = candidates.sort((a, b) => a.cost - b.cost)[0] || null;
      }
      if (best) { p.labelBox = best; placed.push(best.box); }
    });

    return {
      W, H, left, plotRight, plotTop, plotBottom, ticks, broken, knee,
      domainMin, domainMax, points, x, y
    };
  };

  const buildSvg = (layout) => {
    const { W, H, left, plotRight, plotTop, plotBottom, ticks, broken, knee, domainMin, domainMax, points, x, y } = layout;
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

    const diagStart = domainMin, diagEnd = broken ? knee : domainMax;
    const diagonal = '<line class="bubble-diagonal" x1="' + x(diagStart).toFixed(1) + '" y1="' + y(diagStart).toFixed(1)
      + '" x2="' + x(diagEnd).toFixed(1) + '" y2="' + y(diagEnd).toFixed(1) + '"/>';

    const pointMarkup = points.map((p) => {
      const deep = p.i >= 20, ink = deep ? '#F0EFEB' : '#1C1C1A';
      const displaced = Math.hypot(p.px - p.rawX, p.py - p.rawY) > 3;
      const positionLeader = displaced
        ? '<line class="bubble-position-leader" x1="' + p.rawX.toFixed(1) + '" y1="' + p.rawY.toFixed(1)
          + '" x2="' + p.px.toFixed(1) + '" y2="' + p.py.toFixed(1) + '"/>'
        : '';
      const title = escSvg(p.name) + ' \u00b7 ' + p.total + ' \u4e2a\u804c\u4f4d \u00b7 \u5e73\u5747 '
        + p.mean.toFixed(1) + ' \u5929 \u00b7 \u4e2d\u4f4d ' + p.median.toFixed(1) + ' \u5929';
      let labelMarkup = '';
      if (p.labelBox) {
        const b = p.labelBox, w = labelWidth(p.label);
        const labelLeft = b.anchor === 'start' ? b.lx : b.anchor === 'end' ? b.lx - w : b.lx - w / 2;
        const anchorX = b.anchor === 'start' ? b.lx - 2 : b.anchor === 'end' ? b.lx + 2 : b.lx;
        labelMarkup = '<line class="bubble-label-leader" x1="' + p.px.toFixed(1) + '" y1="' + p.py.toFixed(1)
          + '" x2="' + anchorX.toFixed(1) + '" y2="' + b.ly.toFixed(1) + '"/>'
          + '<rect class="bubble-hit" x="' + (labelLeft - 2).toFixed(1) + '" y="' + (b.ly - 7).toFixed(1)
          + '" width="' + (w + 4).toFixed(1) + '" height="11" rx="2"/>'
          + '<text class="bubble-company" x="' + b.lx.toFixed(1) + '" y="' + b.ly.toFixed(1)
          + '" text-anchor="' + b.anchor + '">' + escSvg(p.label) + '</text>';
      }
      return '<g class="bubble-row bubble-drill" data-company="' + escSvg(p.name) + '" style="--i:' + p.i
        + '" role="button" tabindex="0">' + positionLeader + labelMarkup
        + '<circle class="bubble-point" cx="' + p.px.toFixed(1) + '" cy="' + p.py.toFixed(1) + '" r="' + p.r.toFixed(1)
        + '" fill="' + p.color + '"><title>' + title + '</title></circle>'
        + '<text class="bubble-total' + (deep ? ' bubble-total-deep' : '') + '" fill="' + ink + '" x="' + p.px.toFixed(1)
        + '" y="' + (p.py + 2.5).toFixed(1) + '" text-anchor="middle">' + p.total + '</text></g>';
    }).join('');

    return '<svg class="top20-svg bubble-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Top 30 '
      + '\u673a\u6784\u5e73\u5747\u9996\u6b21\u53d1\u73b0\u5929\u6570\u3001\u4e2d\u4f4d\u6570\u4e0e\u804c\u4f4d\u6570\u91cf\u6c14\u6ce1\u56fe">'
      + grid + axisBreaks + diagonal
      + '<text class="bubble-x-title" x="' + ((left + plotRight) / 2) + '" y="' + (H - 2)
      + '" text-anchor="middle">AVG DAYS SINCE FIRST SEEN</text>'
      + '<text class="bubble-y-title" x="31" y="' + ((plotTop + plotBottom) / 2)
      + '" text-anchor="middle" transform="rotate(-90 31 ' + ((plotTop + plotBottom) / 2) + ')">MEDIAN DAYS</text>'
      + pointMarkup + '</svg>';
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { computeLayout, buildSvg, labelWidth, LABEL_H };
  }
  if (typeof document === 'undefined') return;

  const fnNorm = (loc) => {
    if (typeof norm === 'function') return norm(loc);
    const s = String(loc || '').toLowerCase();
    if (/hong kong|\u9999\u6e2f/.test(s)) return 'HK';
    if (/singapore|\u65b0\u52a0\u5761/.test(s)) return 'SG';
    if (/china|shanghai|beijing|shenzhen|\u4e2d\u56fd|\u4e0a\u6d77|\u5317\u4eac|\u6df1\u5733/.test(s)) return 'CN';
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

  const render = (rows, mode = 'all') => {
    const host = document.getElementById('top50');
    if (!host || !Array.isArray(rows)) return;
    const now = Date.now();
    const scoped = (mode === 'all' ? rows : rows.filter((j) => fnNorm(j.location) === mode)).filter(fnActive);
    const counts = new Map();
    scoped.forEach((job) => {
      const name = fnCompany(job.company || '\u672a\u77e5\u673a\u6784') || '\u672a\u77e5\u673a\u6784';
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
    const svg = buildSvg(computeLayout(top));
    host.classList.remove('is-ready');
    host.innerHTML = svg;
    host.dataset.layout = MARK;
    requestAnimationFrame(() => host.classList.add('is-ready'));
  };

  const safeRender = (rows, mode) => {
    try { render(rows, mode); } catch (err) { console.warn('[top30-layout] render failed', err); }
  };
  try { renderTop50 = safeRender; } catch (e) {}
  g.renderTop50 = safeRender;

  let healing = false;
  const heal = () => {
    const host = document.getElementById('top50');
    if (!host || healing || host.dataset.layout === MARK) return;
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
