/* 留言板 Guestbook —— 独立前端模块（自包含：自动注入样式与结构） */
(function () {
  // ===== 配置 =====
  // 你的 Cloudflare Worker 地址。如果把 Worker 命名为 guestbook-api，则无需修改这一行。
  const API = "https://guestbook-api.claudecowork.workers.dev";

  // ===== 样式 =====
  const css = `
  .gb { margin-top:44px; }
  .gb-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; padding-bottom:12px; border-bottom:1px solid var(--line-strong); margin-bottom:18px; }
  .gb-head h2 { font-family:var(--serif); font-size:22px; font-weight:650; letter-spacing:-.02em; color:var(--navy); margin:0; }
  .gb-sub { font-family:var(--mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-faint); }
  .gb-form { background:linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface-2) 68%,var(--surface))); border:1px solid var(--line); border-radius:12px; padding:16px 18px; box-shadow:var(--shadow); margin-bottom:22px; }
  .gb-name { width:100%; max-width:280px; display:block; padding:9px 12px; border:1px solid var(--line-strong); border-radius:9px; background:var(--surface); font-size:14px; color:var(--ink); font-family:var(--sans); margin-bottom:10px; }
  .gb-text { width:100%; min-height:84px; resize:vertical; display:block; padding:10px 12px; border:1px solid var(--line-strong); border-radius:9px; background:var(--surface); font-size:14px; color:var(--ink); font-family:var(--sans); line-height:1.55; }
  .gb-name:focus, .gb-text:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent); }
  .gb-actions { display:flex; align-items:center; gap:14px; margin-top:10px; }
  .gb-count { font-family:var(--mono); font-size:11px; color:var(--ink-faint); margin-right:auto; font-variant-numeric:tabular-nums; }
  .gb-submit { font-family:var(--sans); font-size:13px; font-weight:650; color:var(--surface); background:linear-gradient(180deg,var(--navy-2),var(--navy)); border:0; border-radius:9px; padding:10px 22px; cursor:pointer; transition:transform .15s, box-shadow .2s, opacity .2s; box-shadow:var(--shadow); }
  .gb-submit:hover { transform:translateY(-1px); box-shadow:var(--shadow-strong); }
  .gb-submit:disabled { opacity:.5; cursor:default; transform:none; }
  [data-theme="dark"] .gb-submit { color:var(--navy); background:linear-gradient(180deg,var(--gold-hi),var(--gold)); }
  .gb-list { display:flex; flex-direction:column; }
  .gb-msg { display:grid; grid-template-columns:40px 1fr; gap:14px; padding:15px 4px; border-bottom:1px solid var(--line); animation:fadeUp .4s both; }
  .gb-ava { width:40px; height:40px; border-radius:9px; display:grid; place-items:center; font-family:var(--serif); font-weight:650; font-size:16px; color:var(--accent-2); background:var(--accent-soft); border:1px solid color-mix(in srgb,var(--accent) 24%,transparent); user-select:none; }
  .gb-meta { display:flex; align-items:baseline; gap:10px; }
  .gb-mname { font-size:14px; font-weight:650; color:var(--ink); }
  .gb-mtime { font-family:var(--mono); font-size:11px; color:var(--ink-faint); font-variant-numeric:tabular-nums; }
  .gb-mtext { font-size:14px; color:var(--ink-soft); line-height:1.65; margin-top:4px; white-space:pre-wrap; word-break:break-word; }
  .gb-state { text-align:center; padding:40px 20px; color:var(--ink-faint); font-size:14px; }
  .gb-state .gb-big { font-family:var(--serif); font-size:17px; color:var(--ink-soft); margin-bottom:6px; }
  @media (max-width:720px){ .gb { margin-top:32px; } .gb-msg { grid-template-columns:34px 1fr; gap:11px; } .gb-ava { width:34px; height:34px; font-size:14px; } }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ===== 结构 =====
  const shell = document.querySelector(".shell");
  if (!shell) return;
  const section = document.createElement("section");
  section.className = "gb";
  section.id = "guestbook";
  section.innerHTML =
    '<div class="gb-head"><h2>留言板</h2><span class="gb-sub">Guestbook · 欢迎留下求职心得与祝福</span></div>' +
    '<form class="gb-form" id="gbForm">' +
      '<input class="gb-name" id="gbName" type="text" placeholder="昵称（可留空，默认匿名）" maxlength="40" autocomplete="off" />' +
      '<textarea class="gb-text" id="gbText" placeholder="写点什么…（最多 500 字）" maxlength="500"></textarea>' +
      '<div class="gb-actions"><span class="gb-count" id="gbCount">0 / 500</span><button type="submit" class="gb-submit" id="gbSubmit">发布留言</button></div>' +
    '</form>' +
    '<div class="gb-list" id="gbList"><div class="gb-state">留言加载中…</div></div>';
  const footer = shell.querySelector(".footer");
  if (footer) shell.insertBefore(section, footer); else shell.appendChild(section);

  const listEl = section.querySelector("#gbList");
  const formEl = section.querySelector("#gbForm");
  const nameEl = section.querySelector("#gbName");
  const textEl = section.querySelector("#gbText");
  const countEl = section.querySelector("#gbCount");
  const submitEl = section.querySelector("#gbSubmit");

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
      '<div class="gb-body"><div class="gb-meta"><span class="gb-mname">' + esc(m.name || "匿名") + '</span><span class="gb-mtime">' + esc(fmtTime(m.time)) + '</span></div>' +
      '<div class="gb-mtext">' + esc(m.text) + '</div></div></div>';
  }
  function render(list) {
    if (!Array.isArray(list) || list.length === 0) {
      listEl.innerHTML = '<div class="gb-state"><div class="gb-big">还没有留言</div>来抢个沙发吧 🛋️</div>';
      return;
    }
    listEl.innerHTML = list.map(msgHTML).join("");
  }

  textEl.addEventListener("input", () => { countEl.textContent = textEl.value.length + " / 500"; });

  fetch(API, { method: "GET" })
    .then(r => r.json())
    .then(render)
    .catch(() => { listEl.innerHTML = '<div class="gb-state">留言板连接中，请稍后刷新～</div>'; });

  formEl.addEventListener("submit", e => {
    e.preventDefault();
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
      .catch(() => { alert("留言发布失败，请稍后再试。"); })
      .finally(() => { submitEl.disabled = false; submitEl.textContent = "发布留言"; });
  });
})();
