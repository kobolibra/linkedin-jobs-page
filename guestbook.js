/* 留言板 Guestbook —— 独立前端模块（浮动按钮 + 弹窗，自包含） */
(function () {
  // ===== 配置 =====
  // Cloudflare Worker 地址。Worker 命名为 guestbook-api 时无需修改这一行。
  const API = "https://guestbook-api.claudecowork.workers.dev";

  // ===== 样式 =====
  const css = `
  @keyframes gbFadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  .gb-fab { position:fixed; left:24px; bottom:24px; z-index:120; display:inline-flex; align-items:center; gap:8px; padding:11px 18px 11px 15px; border:1px solid var(--line-strong); border-radius:999px; background:linear-gradient(180deg,var(--navy-2),var(--navy)); color:var(--surface); font-family:var(--sans); font-size:13px; font-weight:650; letter-spacing:.01em; cursor:pointer; box-shadow:var(--shadow-strong,0 10px 28px rgba(0,0,0,.18)); transition:transform .18s, box-shadow .2s, opacity .3s; }
  .gb-fab:hover { transform:translateY(-2px); box-shadow:0 14px 32px rgba(0,0,0,.22); }
  .gb-fab svg { width:17px; height:17px; }
  [data-mode="dark"] .gb-fab { color:var(--navy); background:linear-gradient(180deg,var(--gold-hi),var(--gold)); }
  @media (max-width:720px){ .gb-fab { left:16px; bottom:16px; padding:10px 16px 10px 13px; } }

  .gb-overlay { position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(8,16,28,.46); backdrop-filter:blur(4px); opacity:0; pointer-events:none; transition:opacity .25s; }
  .gb-overlay.open { opacity:1; pointer-events:auto; }
  .gb-modal { width:100%; max-width:480px; max-height:84vh; display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--line-strong); border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.4); transform:translateY(14px) scale(.98); transition:transform .28s cubic-bezier(.34,1.4,.5,1); overflow:hidden; }
  .gb-overlay.open .gb-modal { transform:none; }
  .gb-head { display:flex; align-items:flex-start; gap:12px; padding:20px 22px 16px; border-bottom:1px solid var(--line); }
  .gb-head h2 { font-family:var(--serif); font-size:21px; font-weight:650; letter-spacing:-.02em; color:var(--navy); margin:0; }
  .gb-sub { display:block; font-family:var(--mono); font-size:11px; letter-spacing:.06em; color:var(--ink-faint); margin-top:5px; }
  .gb-close { margin-left:auto; flex:none; width:30px; height:30px; display:grid; place-items:center; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink-soft); font-size:17px; line-height:1; cursor:pointer; transition:background .15s,color .15s; }
  .gb-close:hover { background:var(--line); color:var(--ink); }
  .gb-body { padding:18px 22px 22px; overflow-y:auto; }
  .gb-form { margin-bottom:20px; }
  .gb-name { width:100%; max-width:260px; display:block; padding:9px 12px; border:1px solid var(--line-strong); border-radius:9px; background:var(--surface-2); font-size:14px; color:var(--ink); font-family:var(--sans); margin-bottom:10px; }
  .gb-text { width:100%; min-height:80px; resize:vertical; display:block; padding:10px 12px; border:1px solid var(--line-strong); border-radius:9px; background:var(--surface-2); font-size:14px; color:var(--ink); font-family:var(--sans); line-height:1.55; }
  .gb-name:focus, .gb-text:focus { outline:none; border-color:var(--gold); box-shadow:0 0 0 3px color-mix(in srgb,var(--gold) 18%,transparent); }
  .gb-actions { display:flex; align-items:center; gap:14px; margin-top:10px; }
  .gb-count { font-family:var(--mono); font-size:11px; color:var(--ink-faint); margin-right:auto; font-variant-numeric:tabular-nums; }
  .gb-err { color:#b4534b; font-size:12px; margin-right:auto; }
  .gb-submit { font-family:var(--sans); font-size:13px; font-weight:650; color:var(--surface); background:linear-gradient(180deg,var(--navy-2),var(--navy)); border:0; border-radius:9px; padding:10px 22px; cursor:pointer; transition:transform .15s, box-shadow .2s, opacity .2s; box-shadow:var(--shadow,0 6px 18px rgba(0,0,0,.12)); }
  .gb-submit:hover { transform:translateY(-1px); box-shadow:var(--shadow-strong,0 10px 28px rgba(0,0,0,.18)); }
  .gb-submit:disabled { opacity:.5; cursor:default; transform:none; }
  [data-mode="dark"] .gb-submit { color:var(--navy); background:linear-gradient(180deg,var(--gold-hi),var(--gold)); }
  .gb-list { display:flex; flex-direction:column; }
  .gb-msg { display:grid; grid-template-columns:38px 1fr; gap:13px; padding:14px 2px; border-bottom:1px solid var(--line); animation:gbFadeUp .4s both; }
  .gb-msg:last-child { border-bottom:0; }
  .gb-ava { width:38px; height:38px; border-radius:9px; display:grid; place-items:center; font-family:var(--serif); font-weight:650; font-size:15px; color:var(--navy); background:var(--accent-soft); border:1px solid color-mix(in srgb,var(--gold) 26%,transparent); user-select:none; }
  [data-mode="dark"] .gb-ava { color:var(--gold-hi); }
  .gb-meta { display:flex; align-items:baseline; gap:10px; }
  .gb-mname { font-size:14px; font-weight:650; color:var(--ink); }
  .gb-mtime { font-family:var(--mono); font-size:11px; color:var(--ink-faint); font-variant-numeric:tabular-nums; }
  .gb-mtext { font-size:14px; color:var(--ink-soft); line-height:1.65; margin-top:4px; white-space:pre-wrap; word-break:break-word; }
  .gb-state { text-align:center; padding:36px 20px; color:var(--ink-faint); font-size:14px; }
  .gb-state .gb-big { font-family:var(--serif); font-size:17px; color:var(--ink-soft); margin-bottom:6px; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  // ===== 浮动按钮 =====
  const fab = document.createElement("button");
  fab.className = "gb-fab";
  fab.id = "gbFab";
  fab.type = "button";
  fab.innerHTML = ICON + "<span>留言</span>";
  document.body.appendChild(fab);

  // ===== 弹窗 =====
  const overlay = document.createElement("div");
  overlay.className = "gb-overlay";
  overlay.id = "gbOverlay";
  overlay.innerHTML =
    '<div class="gb-modal" role="dialog" aria-modal="true" aria-label="留言板">' +
      '<div class="gb-head"><div><h2>留言板</h2><span class="gb-sub">if you would like to leave a message</span></div>' +
        '<button class="gb-close" id="gbClose" type="button" aria-label="关闭">&times;</button></div>' +
      '<div class="gb-body">' +
        '<form class="gb-form" id="gbForm">' +
          '<input class="gb-name" id="gbName" type="text" placeholder="昵称（可留空，默认匿名）" maxlength="40" autocomplete="off" />' +
          '<textarea class="gb-text" id="gbText" placeholder="写点什么…（最多 500 字）" maxlength="500"></textarea>' +
          '<div class="gb-actions"><span class="gb-count" id="gbCount">0 / 500</span><button type="submit" class="gb-submit" id="gbSubmit">发布留言</button></div>' +
        '</form>' +
        '<div class="gb-list" id="gbList"><div class="gb-state">留言加载中…</div></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const closeEl = overlay.querySelector("#gbClose");
  const listEl = overlay.querySelector("#gbList");
  const formEl = overlay.querySelector("#gbForm");
  const nameEl = overlay.querySelector("#gbName");
  const textEl = overlay.querySelector("#gbText");
  const countEl = overlay.querySelector("#gbCount");
  const submitEl = overlay.querySelector("#gbSubmit");
  const actionsEl = formEl.querySelector(".gb-actions");

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const mono = n => { const t = (n || "?").trim(); return t ? t[0].toUpperCase() : "?"; };
  function fmtTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function msgHTML(m) {
    return '<div class="gb-msg"><div class="gb-ava">' + esc(mono(m.name)) + '</div>' +
      '<div class="gb-mbody"><div class="gb-meta"><span class="gb-mname">' + esc(m.name || "匿名") + '</span><span class="gb-mtime">' + esc(fmtTime(m.time)) + '</span></div>' +
      '<div class="gb-mtext">' + esc(m.text) + '</div></div></div>';
  }
  function render(list) {
    if (!Array.isArray(list) || list.length === 0) {
      listEl.innerHTML = '<div class="gb-state"><div class="gb-big">还没有留言</div>来抢个沙发吧 🛋️</div>';
      return;
    }
    listEl.innerHTML = list.map(msgHTML).join("");
  }

  // ===== 打开 / 关闭 =====
  let loaded = false;
  function load() {
    fetch(API, { method: "GET" })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(render)
      .catch(() => { listEl.innerHTML = '<div class="gb-state">留言板暂时连接不上，请稍后再试～</div>'; });
  }
  function openModal() {
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    if (!loaded) { loaded = true; load(); }
    setTimeout(() => textEl.focus(), 280);
  }
  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  fab.addEventListener("click", openModal);
  closeEl.addEventListener("click", closeModal);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && overlay.classList.contains("open")) closeModal(); });

  textEl.addEventListener("input", () => { countEl.textContent = textEl.value.length + " / 500"; });

  formEl.addEventListener("submit", e => {
    e.preventDefault();
    const oldErr = actionsEl.querySelector(".gb-err"); if (oldErr) oldErr.remove();
    const text = textEl.value.trim();
    const name = nameEl.value.trim();
    if (!text) { textEl.focus(); return; }
    submitEl.disabled = true; submitEl.textContent = "发布中…";
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, text: text })
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(msg => {
        const state = listEl.querySelector(".gb-state");
        if (state) listEl.innerHTML = "";
        listEl.insertAdjacentHTML("afterbegin", msgHTML(msg));
        textEl.value = ""; nameEl.value = ""; countEl.textContent = "0 / 500";
      })
      .catch(() => {
        const err = document.createElement("span");
        err.className = "gb-err";
        err.textContent = "发布失败，后台可能还没连通～";
        actionsEl.insertBefore(err, countEl);
      })
      .finally(() => { submitEl.disabled = false; submitEl.textContent = "发布留言"; });
  });
})();
