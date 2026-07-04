/* 留言板 Guestbook + 左侧滚动定位条 —— 浮动按钮 + 弹窗；点赞/多层回复开放，置顶/删除需管理员密码 */
(function () {
  // ===== 配置 =====
  const API = "https://guestbook-api.claudecowork.workers.dev";
  const LS_LIKES = "gbLikes";
  const LS_ADMIN = "gbAdminKey";

  // ===== 样式 =====
  const css = `
  @keyframes gbFadeUp { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:none;} }
  @keyframes gbPop { 0%{transform:scale(1)} 40%{transform:scale(1.4)} 100%{transform:scale(1)} }
  .gb-fab { position:fixed; left:22px; bottom:22px; height:42px; z-index:120; display:inline-flex; align-items:center; gap:8px; padding:0 18px 0 15px; border:1px solid var(--line-strong); border-radius:999px; background:linear-gradient(180deg,var(--navy-2),var(--navy)); color:var(--surface); font-family:var(--sans); font-size:13px; font-weight:650; cursor:pointer; box-shadow:var(--shadow-strong,0 10px 28px rgba(0,0,0,.18)); transition:transform .18s, box-shadow .2s; }
  .gb-fab:hover { transform:translateY(-2px); box-shadow:0 14px 32px rgba(0,0,0,.22); }
  .gb-fab svg { width:17px; height:17px; }
  [data-theme="dark"] .gb-fab { color:var(--navy); background:linear-gradient(180deg,var(--gold-hi),var(--gold)); }
  @media (max-width:720px){ .gb-fab { left:22px; padding:0 16px 0 13px; } }
  .gb-overlay { position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(8,16,28,.46); backdrop-filter:blur(4px); opacity:0; pointer-events:none; transition:opacity .25s; }
  .gb-overlay.open { opacity:1; pointer-events:auto; }
  .gb-modal { position:relative; width:100%; max-width:480px; max-height:84vh; display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--line-strong); border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.4); transform:translateY(14px) scale(.98); transition:transform .28s cubic-bezier(.34,1.4,.5,1); overflow:hidden; }
  .gb-overlay.open .gb-modal { transform:none; }
  .gb-head { display:flex; align-items:flex-start; gap:12px; padding:20px 22px 16px; border-bottom:1px solid var(--line); }
  .gb-head h2 { font-family:var(--serif); font-size:21px; font-weight:650; letter-spacing:-.02em; color:var(--navy); margin:0; user-select:none; }
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
  .gb-submit:hover { transform:translateY(-1px); }
  .gb-submit:disabled { opacity:.5; cursor:default; transform:none; }
  [data-theme="dark"] .gb-submit { color:var(--navy); background:linear-gradient(180deg,var(--gold-hi),var(--gold)); }
  .gb-list { display:flex; flex-direction:column; }
  .gb-msg { position:relative; padding:14px 2px; border-bottom:1px solid var(--line); animation:gbFadeUp .4s both; }
  .gb-msg:last-child { border-bottom:0; }
  .gb-pin { display:inline-block; font-family:var(--mono); font-size:10px; letter-spacing:.08em; color:var(--gold-deep,#806238); background:var(--accent-soft); border-radius:5px; padding:2px 7px; margin-bottom:6px; }
  .gb-meta { display:flex; align-items:baseline; gap:10px; }
  .gb-mname { font-size:14px; font-weight:650; color:var(--ink); }
  .gb-mtime { font-family:var(--mono); font-size:11px; color:var(--ink-faint); font-variant-numeric:tabular-nums; }
  .gb-mtext { font-size:14px; color:var(--ink-soft); line-height:1.65; margin-top:4px; white-space:pre-wrap; word-break:break-word; }
  .gb-tools { display:flex; align-items:center; gap:8px; margin-top:9px; flex-wrap:wrap; }
  .gb-act { display:inline-flex; align-items:center; gap:5px; font-family:var(--sans); font-size:12px; color:var(--ink-faint); background:none; border:1px solid var(--line); border-radius:7px; padding:4px 10px; cursor:pointer; transition:color .15s,border-color .15s; }
  .gb-act:hover { color:var(--ink); border-color:var(--line-strong); }
  .gb-small { font-size:11px; padding:3px 8px; }
  .gb-like svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:2; transition:fill .15s, stroke .15s; }
  .gb-like.liked { color:#e0526b; border-color:color-mix(in srgb,#e0526b 40%,transparent); }
  .gb-like.liked svg { fill:#e0526b; stroke:#e0526b; }
  .gb-like.pop svg { animation:gbPop .3s ease; }
  .gb-likenum { font-variant-numeric:tabular-nums; }
  .gb-admin { color:var(--navy-2); }
  .gb-del:hover { color:#b4534b; border-color:color-mix(in srgb,#b4534b 40%,transparent); }
  .gb-replies { margin:10px 0 0 14px; padding-left:14px; border-left:2px solid var(--line); display:flex; flex-direction:column; gap:10px; }
  .gb-reply { font-size:13px; }
  .gb-reply .gb-mname { font-size:13px; }
  .gb-reply .gb-mtext { margin-top:2px; font-size:13px; }
  .gb-reply .gb-tools { margin-top:6px; }
  .gb-rform { margin-top:10px; background:var(--surface-2); border:1px solid var(--line); border-radius:9px; padding:10px; }
  .gb-rname { width:100%; max-width:200px; display:block; padding:7px 10px; border:1px solid var(--line-strong); border-radius:7px; background:var(--surface); font-size:13px; color:var(--ink); font-family:var(--sans); margin-bottom:8px; }
  .gb-rtext { width:100%; min-height:54px; resize:vertical; display:block; padding:8px 10px; border:1px solid var(--line-strong); border-radius:7px; background:var(--surface); font-size:13px; color:var(--ink); font-family:var(--sans); line-height:1.5; }
  .gb-ractions { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; }
  .gb-rcancel { font-size:12px; color:var(--ink-faint); background:none; border:0; cursor:pointer; }
  .gb-rsubmit { font-size:12px; font-weight:650; color:var(--surface); background:var(--navy); border:0; border-radius:7px; padding:6px 16px; cursor:pointer; }
  [data-theme="dark"] .gb-rsubmit { color:var(--navy); background:var(--gold); }
  .gb-state { text-align:center; padding:36px 20px; color:var(--ink-faint); font-size:14px; }
  .gb-state .gb-big { font-family:var(--serif); font-size:17px; color:var(--ink-soft); margin-bottom:6px; }
  .gb-toast { position:absolute; left:50%; bottom:16px; transform:translateX(-50%); background:var(--navy); color:var(--surface); font-size:12.5px; padding:8px 16px; border-radius:8px; box-shadow:var(--shadow-strong,0 10px 28px rgba(0,0,0,.2)); opacity:0; transition:opacity .25s; pointer-events:none; z-index:5; white-space:nowrap; }
  .gb-toast.show { opacity:1; }
  [data-theme="dark"] .gb-toast { background:var(--gold); color:var(--navy); }
  .gb-scrollnav { position:fixed; left:11px; top:50%; transform:translateY(-50%); z-index:90; display:flex; flex-direction:column; gap:9px; align-items:flex-start; }
  .gb-tick { position:relative; width:12px; height:2px; padding:0; border:0; border-radius:2px; background:var(--line-strong); opacity:.45; cursor:pointer; transition:width .28s cubic-bezier(.2,.8,.2,1), background .25s, opacity .25s; }
  .gb-tick:hover { width:24px; opacity:.9; }
  .gb-tick.on { background:var(--gold); opacity:.9; }
  .gb-tick.cur { width:24px; background:var(--gold-deep); opacity:1; }
  [data-theme="dark"] .gb-tick.cur { background:var(--gold-hi); }
  .gb-ticklabel { position:absolute; left:20px; top:50%; transform:translateY(-50%) translateX(-4px); white-space:nowrap; font-family:var(--mono); font-size:11px; color:var(--ink-soft); background:var(--surface); border:1px solid var(--line-strong); border-radius:6px; padding:3px 9px; box-shadow:var(--shadow,0 6px 18px rgba(0,0,0,.12)); opacity:0; pointer-events:none; transition:opacity .18s, transform .18s; }
  .gb-tick:hover .gb-ticklabel { opacity:1; transform:translateY(-50%) translateX(0); }
  @media (max-width:720px){ .gb-scrollnav { display:none; } }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const BUBBLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20.3l-1.45-1.32C5.4 14.24 2 11.15 2 7.4 2 4.9 3.98 3 6.5 3c1.74 0 3.41.81 4.5 2.09C12.09 3.81 13.76 3 15.5 3 18.02 3 20 4.9 20 7.4c0 3.75-3.4 6.84-8.55 11.58L12 20.3z"/></svg>';

  // ===== 浮动按钮 =====
  const fab = document.createElement("button");
  fab.className = "gb-fab";
  fab.type = "button";
  fab.innerHTML = BUBBLE + "<span>留言</span>";
  document.body.appendChild(fab);

  // ===== 弹窗 =====
  const overlay = document.createElement("div");
  overlay.className = "gb-overlay";
  overlay.innerHTML =
    '<div class="gb-modal" role="dialog" aria-modal="true" aria-label="留言板">' +
      '<div class="gb-head"><div><h2 id="gbTitle">留言板</h2><span class="gb-sub">if you would like to leave a message</span></div>' +
        '<button class="gb-close" id="gbClose" type="button" aria-label="关闭">&times;</button></div>' +
      '<div class="gb-body">' +
        '<form class="gb-form" id="gbForm">' +
          '<input class="gb-name" id="gbName" type="text" placeholder="昵称（可留空，默认匿名）" maxlength="40" autocomplete="off" />' +
          '<textarea class="gb-text" id="gbText" placeholder="写点什么…（最多 500 字）" maxlength="500"></textarea>' +
          '<div class="gb-actions"><span class="gb-count" id="gbCount">0 / 500</span><button type="submit" class="gb-submit" id="gbSubmit">发布留言</button></div>' +
        '</form>' +
        '<div class="gb-list" id="gbList" role="log" aria-live="polite"><div class="gb-state">留言加载中…</div></div>' +
      '</div>' +
      '<div class="gb-toast" id="gbToast" role="status" aria-live="polite"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  const titleEl = overlay.querySelector("#gbTitle");
  const closeEl = overlay.querySelector("#gbClose");
  const listEl = overlay.querySelector("#gbList");
  const formEl = overlay.querySelector("#gbForm");
  const nameEl = overlay.querySelector("#gbName");
  const textEl = overlay.querySelector("#gbText");
  const countEl = overlay.querySelector("#gbCount");
  const submitEl = overlay.querySelector("#gbSubmit");
  const actionsEl = formEl.querySelector(".gb-actions");
  const toastEl = overlay.querySelector("#gbToast");

  // ===== 状态 =====
  let messages = [];
  let replyOpen = null;
  let loaded = false;
  const likedSet = new Set(JSON.parse(localStorage.getItem(LS_LIKES) || "[]"));
  // 管理员密钥改用 sessionStorage：仅在当前标签页会话内有效，关闭标签页后自动失效，降低长期明文留存的风险。
  let adminKey = sessionStorage.getItem(LS_ADMIN) || "";
  let isAdmin = !!adminKey;

  // ===== 工具 =====
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  function fmtTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }
  function authHeaders() { return (isAdmin && adminKey) ? { "X-Admin-Key": adminKey } : {}; }
  function post(path, body, admin) {
    return fetch(API + path, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, admin ? authHeaders() : {}),
      body: JSON.stringify(body || {})
    }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  }
  function sortMsgs(list) {
    return list.slice().sort((a, b) => {
      const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.time) - new Date(a.time);
    });
  }
  function findNode(list, id) {
    for (const n of list) {
      if (n.id === id) return n;
      if (Array.isArray(n.replies)) { const f = findNode(n.replies, id); if (f) return f; }
    }
    return null;
  }
  function removeNode(list, id) {
    return list.filter(n => n.id !== id).map(n => {
      if (Array.isArray(n.replies) && n.replies.length) n.replies = removeNode(n.replies, id);
      return n;
    });
  }

  // ===== 渲染 =====
  function replyFormHTML(id) {
    return '<form class="gb-rform" data-id="' + esc(id) + '">' +
      '<input class="gb-rname" type="text" placeholder="昵称（可空）" maxlength="40" autocomplete="off" />' +
      '<textarea class="gb-rtext" placeholder="回复…（最多 500 字）" maxlength="500"></textarea>' +
      '<div class="gb-ractions"><button type="button" class="gb-rcancel">取消</button><button type="submit" class="gb-rsubmit">回复</button></div>' +
      '</form>';
  }
  function replyNodeHTML(r) {
    const replies = Array.isArray(r.replies) ? r.replies : [];
    let inner = replies.map(replyNodeHTML).join("");
    if (replyOpen === r.id) inner += replyFormHTML(r.id);
    return '<div class="gb-reply" data-id="' + esc(r.id) + '">' +
      '<span class="gb-mname">' + esc(r.name || "匿名") + '</span> ' +
      '<span class="gb-mtime">' + esc(fmtTime(r.time)) + '</span>' +
      '<div class="gb-mtext">' + esc(r.text) + '</div>' +
      '<div class="gb-tools">' +
        '<button class="gb-act gb-small" data-act="reply" data-id="' + esc(r.id) + '">回复' + (replies.length ? ' · ' + replies.length : '') + '</button>' +
        (isAdmin ? '<button class="gb-act gb-small gb-del" data-act="del" data-id="' + esc(r.id) + '">删除</button>' : '') +
      '</div>' +
      (inner ? '<div class="gb-replies">' + inner + '</div>' : '') +
      '</div>';
  }
  function msgHTML(m) {
    const liked = likedSet.has(m.id);
    const replies = Array.isArray(m.replies) ? m.replies : [];
    let inner = replies.map(replyNodeHTML).join("");
    if (replyOpen === m.id) inner += replyFormHTML(m.id);
    return '<div class="gb-msg" data-id="' + esc(m.id) + '">' +
      (m.pinned ? '<span class="gb-pin">📌 置顶</span>' : '') +
      '<div class="gb-meta"><span class="gb-mname">' + esc(m.name || "匿名") + '</span><span class="gb-mtime">' + esc(fmtTime(m.time)) + '</span></div>' +
      '<div class="gb-mtext">' + esc(m.text) + '</div>' +
      '<div class="gb-tools">' +
        '<button class="gb-act gb-like' + (liked ? ' liked' : '') + '" data-act="like" data-id="' + esc(m.id) + '">' + HEART + '<span class="gb-likenum">' + (m.likes || 0) + '</span></button>' +
        '<button class="gb-act" data-act="reply" data-id="' + esc(m.id) + '">回复' + (replies.length ? ' · ' + replies.length : '') + '</button>' +
        (isAdmin ? '<button class="gb-act gb-admin" data-act="pin" data-id="' + esc(m.id) + '">' + (m.pinned ? '取消置顶' : '置顶') + '</button><button class="gb-act gb-admin gb-del" data-act="del" data-id="' + esc(m.id) + '">删除</button>' : '') +
      '</div>' +
      (inner ? '<div class="gb-replies">' + inner + '</div>' : '') +
      '</div>';
  }
  function render() {
    const list = sortMsgs(messages);
    if (!list.length) { listEl.innerHTML = '<div class="gb-state"><div class="gb-big">还没有留言</div>来抢个沙发吧 🛋️</div>'; return; }
    listEl.innerHTML = list.map(msgHTML).join("");
    if (replyOpen) { const t = listEl.querySelector('.gb-rform[data-id="' + replyOpen + '"] .gb-rtext'); if (t) t.focus(); }
  }

  // ===== 加载 =====
  function load() {
    fetch(API, { method: "GET" })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { messages = Array.isArray(data) ? data : []; render(); })
      .catch(() => { listEl.innerHTML = '<div class="gb-state">留言板暂时连接不上，请稍后再试～</div>'; });
  }

  // ===== 开关 =====
  function openModal() {
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    if (!loaded) { loaded = true; load(); }
    setTimeout(() => textEl.focus(), 280);
  }
  function closeModal() { overlay.classList.remove("open"); document.body.style.overflow = ""; }
  fab.addEventListener("click", openModal);
  closeEl.addEventListener("click", closeModal);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && overlay.classList.contains("open")) closeModal(); });

  textEl.addEventListener("input", () => { countEl.textContent = textEl.value.length + " / 500"; });

  // ===== 发布新留言 =====
  formEl.addEventListener("submit", e => {
    e.preventDefault();
    const oldErr = actionsEl.querySelector(".gb-err"); if (oldErr) oldErr.remove();
    const text = textEl.value.trim();
    const name = nameEl.value.trim();
    if (!text) { textEl.focus(); return; }
    submitEl.disabled = true; submitEl.textContent = "发布中…";
    post("/", { name: name, text: text })
      .then(msg => {
        messages.unshift(msg); replyOpen = null; render();
        textEl.value = ""; nameEl.value = ""; countEl.textContent = "0 / 500";
      })
      .catch(() => {
        const err = document.createElement("span");
        err.className = "gb-err"; err.textContent = "发布失败，后台可能还没连通～";
        actionsEl.insertBefore(err, countEl);
      })
      .finally(() => { submitEl.disabled = false; submitEl.textContent = "发布留言"; });
  });

  // ===== 列表交互（事件委托）=====
  listEl.addEventListener("click", e => {
    const cancel = e.target.closest(".gb-rcancel");
    if (cancel) { replyOpen = null; render(); return; }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act, id = btn.dataset.id;
    if (act === "like") doLike(id, btn);
    else if (act === "reply") { replyOpen = (replyOpen === id ? null : id); render(); }
    else if (act === "pin") doPin(id);
    else if (act === "del") doDelete(id);
  });
  listEl.addEventListener("submit", e => {
    const form = e.target.closest(".gb-rform");
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.id;
    const text = form.querySelector(".gb-rtext").value.trim();
    const name = form.querySelector(".gb-rname").value.trim();
    if (!text) return;
    const sub = form.querySelector(".gb-rsubmit"); sub.disabled = true; sub.textContent = "…";
    post("/reply", { id: id, name: name, text: text })
      .then(res => {
        const m = findNode(messages, id);
        if (m) { if (!Array.isArray(m.replies)) m.replies = []; m.replies.push(res.reply); }
        replyOpen = null; render();
      })
      .catch(() => { sub.disabled = false; sub.textContent = "回复"; toast("回复失败，后台可能没连通～"); });
  });

  function doLike(id, btn) {
    const liked = likedSet.has(id);
    const m = findNode(messages, id);
    if (m) m.likes = Math.max(0, (m.likes || 0) + (liked ? -1 : 1));
    if (liked) likedSet.delete(id); else likedSet.add(id);
    localStorage.setItem(LS_LIKES, JSON.stringify([...likedSet]));
    if (btn) {
      btn.classList.toggle("liked", !liked);
      const num = btn.querySelector(".gb-likenum"); if (num && m) num.textContent = m.likes;
      btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
    }
    post("/like", { id: id, unlike: liked })
      .then(res => { if (m) { m.likes = res.likes; const n = listEl.querySelector('.gb-like[data-id="' + id + '"] .gb-likenum'); if (n) n.textContent = res.likes; } })
      .catch(() => {});
  }
  function doPin(id) {
    const m = findNode(messages, id); if (!m) return;
    post("/pin", { id: id, pinned: !m.pinned }, true)
      .then(res => { m.pinned = res.pinned; render(); })
      .catch(err => { if (String(err.message) === "401") adminFail(); else toast("操作失败～"); });
  }
  function doDelete(id) {
    if (!confirm("确定删除吗？子回复也会一并删除。")) return;
    post("/delete", { id: id }, true)
      .then(() => { messages = removeNode(messages, id); render(); })
      .catch(err => { if (String(err.message) === "401") adminFail(); else toast("删除失败～"); });
  }

  // ===== 管理员解锁（连点标题 3 次）=====
  let clicks = 0, clickTimer;
  titleEl.addEventListener("click", () => {
    clicks++; clearTimeout(clickTimer); clickTimer = setTimeout(() => clicks = 0, 600);
    if (clicks >= 3) { clicks = 0; adminPrompt(); }
  });
  function adminPrompt() {
    if (isAdmin) { if (confirm("退出管理员模式？")) { isAdmin = false; adminKey = ""; sessionStorage.removeItem(LS_ADMIN); render(); toast("已退出管理员模式"); } return; }
    const key = prompt("请输入管理员密码："); if (!key) return;
    fetch(API + "/verify", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Key": key }, body: "{}" })
      .then(r => r.json())
      .then(res => { if (res && res.ok) { adminKey = key; isAdmin = true; sessionStorage.setItem(LS_ADMIN, key); render(); toast("已进入管理员模式"); } else { toast("密码错误"); } })
      .catch(() => toast("验证失败，后台可能没连通～"));
  }
  function adminFail() { isAdmin = false; adminKey = ""; sessionStorage.removeItem(LS_ADMIN); render(); toast("管理员身份已失效，请重新解锁"); }

  // ===== 左侧滚动定位条（第一根=顶部，之后每根对应一天）=====
  (function () {
    const jobsEl = document.getElementById("jobs");
    const nav = document.createElement("div");
    nav.className = "gb-scrollnav";
    nav.setAttribute("aria-hidden", "true");
    document.body.appendChild(nav);

    let targets = [];
    function toolbarH() { const t = document.querySelector(".toolbar"); return t ? t.getBoundingClientRect().height : 0; }
    function offset() { return toolbarH() + 14; }
    function scrollableBottom() { return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2; }

    function build() {
      const days = jobsEl ? Array.prototype.slice.call(jobsEl.querySelectorAll(".day")).filter(d => d.style.display !== "none") : [];
      targets = [{ el: null, label: "顶部·总览" }].concat(days.map(d => {
        const dd = d.querySelector(".day-date");
        return { el: d, label: dd ? dd.textContent.trim() : "" };
      }));
      nav.innerHTML = targets.map((t, i) =>
        '<button class="gb-tick" type="button" tabindex="-1" data-i="' + i + '"><span class="gb-ticklabel">' + esc(t.label) + '</span></button>'
      ).join("");
      update();
    }

    function update() {
      if (!targets.length) return;
      const off = offset();
      let active = 0;
      for (let i = 1; i < targets.length; i++) {
        const el = targets[i].el; if (!el) continue;
        if (el.getBoundingClientRect().top - off <= 1) active = i; else break;
      }
      if (scrollableBottom()) active = targets.length - 1;
      const ticks = nav.children;
      for (let i = 0; i < ticks.length; i++) {
        ticks[i].classList.toggle("on", i <= active);
        ticks[i].classList.toggle("cur", i === active);
      }
    }

    nav.addEventListener("click", e => {
      const t = e.target.closest(".gb-tick"); if (!t) return;
      const i = +t.dataset.i;
      const tgt = targets[i];
      if (!tgt || !tgt.el) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      const y = window.scrollY + tgt.el.getBoundingClientRect().top - offset();
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    });

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    if (jobsEl) {
      let deb;
      const obs = new MutationObserver(() => { clearTimeout(deb); deb = setTimeout(build, 160); });
      obs.observe(jobsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    }
    build();
  })();
})();
