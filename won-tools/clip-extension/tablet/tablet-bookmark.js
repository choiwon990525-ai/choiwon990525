/* 태블릿용 관전 북마크 (안드로이드 크롬 북마클릿)
   - 유튜브 영상에서 ★ 누르면 지금 시점만 저장 (그림 X, 가벼움)
   - "PC로 보내기" → 공유창에서 디스코드 → PC에서 그 메시지를 복사해 유튜브 화면에 붙여넣으면
     PC가 그 시점 화면을 원본 화질로 자동 캡처 */
(() => {
  if (window.__wonTab) { window.__wonTab.show(); return; }
  const P = 'wonTabBm_';
  const vidId = () => {
    const u = new URL(location.href);
    return u.searchParams.get('v') || (location.pathname.match(/^\/(?:live|shorts)\/([\w-]{6,})/) || [])[1] || null;
  };
  const vid = () => document.querySelector('.html5-main-video') || document.querySelector('video');
  const title = () => document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '').trim().slice(0, 90);
  const load = (id) => { try { return JSON.parse(localStorage.getItem(P + id) || 'null') || { t: '', s: [] }; } catch (e) { return { t: '', s: [] }; } };
  const save = (id, o) => { if (o.s.length) localStorage.setItem(P + id, JSON.stringify(o)); else localStorage.removeItem(P + id); };
  const ids = () => Object.keys(localStorage).filter(k => k.startsWith(P)).map(k => k.slice(P.length));
  const fmt = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:90px;';
  const sh = host.attachShadow({ mode: 'open' });
  /* 유튜브는 HTML 문자열 삽입을 막아서(Trusted Types) 요소를 직접 만든다 */
  const el = (tag, attrs, kids) => { const e = document.createElement(tag); Object.assign(e, attrs || {}); (kids || []).forEach(k => e.append(k)); return e; };
  const st = document.createElement('style');
  st.textContent =
    '*{box-sizing:border-box;font-family:system-ui,"Malgun Gothic",sans-serif;-webkit-tap-highlight-color:transparent}' +
    '.w{display:flex;flex-direction:column;align-items:flex-end;gap:8px}' +
    '.star{width:76px;height:76px;border-radius:50%;border:3px solid #fff;background:#e02b3c;color:#fff;font-size:34px;box-shadow:0 4px 18px rgba(0,0,0,.5);position:relative;touch-action:manipulation}' +
    '.star:active{transform:scale(.92)}' +
    '.n{position:absolute;top:-6px;right:-6px;background:#fff;color:#e02b3c;border-radius:999px;font-size:13px;font-weight:800;padding:2px 7px}' +
    '.row{display:flex;gap:6px}' +
    '.b.on{border-color:#5865f2;background:#2b2f6b}' +
    '.b{font-size:14px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(15,15,15,.9);color:#eee}' +
    '.t{position:fixed;left:50%;top:12%;transform:translateX(-50%);background:rgba(0,0,0,.88);color:#fff;padding:12px 18px;border-radius:12px;font-size:16px;font-weight:600;opacity:0;transition:opacity .2s;pointer-events:none;max-width:86vw;text-align:center}' +
    '.t.on{opacity:1}' +
    '.p{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:min(560px,94vw);max-height:60vh;overflow:auto;background:rgba(15,15,15,.97);color:#eee;border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:12px;display:none;font-size:14px}' +
    '.p.on{display:block}' +
    '.v{margin:8px 0 12px}.vt{font-weight:700;margin-bottom:6px}' +
    '.c{display:inline-flex;align-items:center;gap:4px;background:#2a2a2a;border-radius:999px;padding:6px 10px;margin:3px;color:#7cc4ff}' +
    '.c i{font-style:normal;color:#ff7b7b;padding-left:4px}' +
    '.h{display:flex;justify-content:space-between;align-items:center}';
  sh.append(st,
    el('div', { className: 'w' }, [
      el('div', { className: 'row' }, [el('button', { className: 'b', id: 'list', textContent: '목록' }), el('button', { className: 'b', id: 'send', textContent: 'PC로 보내기' }), el('button', { className: 'b', id: 'hook', textContent: '⚙' }), el('button', { className: 'b', id: 'hide', textContent: '✕' })]),
      el('button', { className: 'star', id: 'star' }, ['★', el('span', { className: 'n', id: 'n', textContent: '0' })])
    ]),
    el('div', { className: 't', id: 't' }), el('div', { className: 'p', id: 'p' }));
  const $ = (id) => sh.getElementById(id);
  (document.fullscreenElement || document.documentElement).appendChild(host);
  document.addEventListener('fullscreenchange', () => (document.fullscreenElement || document.documentElement).appendChild(host));

  const toast = (m, ms = 1600) => { const t = $('t'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms); };
  const paint = () => { const id = vidId(); $('n').textContent = id ? load(id).s.length : 0; };

  $('star').onclick = () => {
    const id = vidId(), v = vid();
    if (!id || !v) { toast('영상 페이지에서 눌러주세요'); return; }
    const t = Math.floor(v.currentTime);
    const o = load(id);
    if (o.s.some(x => Math.abs(x - t) <= 1)) { toast('이미 저장된 시점이에요 ' + fmt(t)); return; }
    o.s.push(t); o.s.sort((a, b) => a - b); o.t = o.t || title();
    save(id, o); paint();
    try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
    toast('★ ' + fmt(t) + ' 저장  (이 영상 ' + o.s.length + '개)', 1100);
  };

  /* 디스코드에 그대로 올려도 보기 좋은 글: 제목 + 시점 링크 (<> 로 감싸 미리보기 카드가 줄줄이 안 뜨게)
     디스코드 한 메시지 2000자 제한 → 1900자 단위로 나눔 (줄 중간은 안 자르고, 이어지는 경기는 제목을 다시 붙임) */
  const LIMIT = 1900;
  const buildChunks = () => {
    const all = ids().filter(id => load(id).s.length);
    if (!all.length) return [];
    const total = all.reduce((n, id) => n + load(id).s.length, 0);
    const chunks = []; let cur = [];
    const size = () => cur.join('\n').length;
    const flush = () => { if (cur.length) chunks.push(cur.join('\n')); cur = []; };
    cur.push('📺 관전 북마크 ' + total + '개');
    all.forEach(id => {
      const o = load(id);
      const head = '▶ ' + (o.t || id).replace(/\n/g, ' ');
      if (size() + head.length + 3 > LIMIT) flush();
      if (cur.length) cur.push('');
      cur.push(head);
      o.s.forEach(sec => {
        const line = fmt(sec) + '  <https://youtu.be/' + id + '?t=' + sec + '>';
        if (size() + line.length + 1 > LIMIT) { flush(); cur.push(head + ' (이어서)'); }
        cur.push(line);
      });
    });
    flush();
    if (chunks.length > 1) chunks.forEach((c, i) => { chunks[i] = c + '\n(' + (i + 1) + '/' + chunks.length + ')'; });
    return chunks;
  };

  /* 디스코드 웹후크: 한 번 넣어두면 "PC로 보내기" 한 번에 정해진 채널로 바로 올라감 */
  const HK = 'wonTabHook';
  const getHook = () => { try { return localStorage.getItem(HK) || ''; } catch (e) { return ''; } };
  const hookRe = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const postHook = async (url, content) => {
    for (let tries = 0; tries < 4; tries++) {
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify({ content, username: '관전 북마크', flags: 4, allowed_mentions: { parse: [] } }));
      const r = await fetch(url + '?wait=true', { method: 'POST', body: fd });
      if (r.ok) return true;
      if (r.status === 429) { let w = 2; try { w = (await r.json()).retry_after || 2; } catch (e) {} await sleep(w * 1000 + 300); continue; }
      if (r.status === 404 || r.status === 401) throw new Error('웹후크 주소가 틀렸거나 지워졌어요 (⚙에서 다시 넣어주세요)');
      throw new Error('디스코드 응답 ' + r.status);
    }
    throw new Error('디스코드가 너무 바빠요, 잠시 뒤 다시');
  };
  const paintHook = () => { const on = !!getHook(); $('hook').classList.toggle('on', on); $('send').textContent = queue.length ? '다음 묶음 보내기 (' + (qi + 1) + '/' + queue.length + ')' : on ? '디스코드로 보내기' : 'PC로 보내기'; };
  $('hook').onclick = async () => {
    const cur = getHook();
    const v = prompt('디스코드 웹후크 주소를 붙여넣으세요.\n(디스코드 채널 설정 → 연동 → 웹후크 → 새 웹후크 → 웹후크 URL 복사)\n비우고 확인하면 연결을 끊어요.', cur);
    if (v === null) return;
    const url = v.trim();
    if (!url) { try { localStorage.removeItem(HK); } catch (e) {} paintHook(); toast('디스코드 연결을 끊었어요 — 공유창으로 보내요'); return; }
    if (!hookRe.test(url)) { toast('웹후크 주소 모양이 아니에요 (https://discord.com/api/webhooks/… )', 3500); return; }
    try { await postHook(url, '✅ 관전 북마크가 이 채널에 연결됐어요'); localStorage.setItem(HK, url); paintHook(); toast('디스코드 연결 완료 — 채널에 확인 메시지를 올렸어요', 3000); }
    catch (e) { toast('연결 실패: ' + e.message, 4000); }
  };

  let queue = [], qi = 0, snap = null; // 여러 묶음 보낼 때 남은 순서 / 보낸 북마크 목록(보낸 것만 지우려고)
  const afterSent = (total) => {
    queue = []; qi = 0; paintHook();
    const sent = snap; snap = null;
    if (sent && confirm('북마크 ' + total + '개를 보냈어요. 태블릿에서는 지울까요?\n(PC에 가져가기 전이면 "취소")')) {
      Object.keys(sent).forEach(id => { const o = load(id); o.s = o.s.filter(x => !sent[id].includes(x)); save(id, o); }); // 보내는 사이 새로 찍은 건 남김
      paint(); if ($('p').classList.contains('on')) drawList();
    }
  };
  $('send').onclick = async () => {
    if (!queue.length) {
      snap = {}; ids().forEach(id => { const o = load(id); if (o.s.length) snap[id] = o.s.slice(); });
      queue = buildChunks(); qi = 0;
      if (!queue.length) { toast('보낼 북마크가 없어요'); return; }
    }
    const total = Object.values(snap || {}).reduce((n, a) => n + a.length, 0);
    const hook = getHook();
    if (hook) {
      const btn = $('send'); btn.disabled = true;
      try {
        for (; qi < queue.length; qi++) { btn.textContent = '보내는 중… ' + (qi + 1) + '/' + queue.length; await postHook(hook, queue[qi]); if (qi < queue.length - 1) await sleep(700); }
        btn.disabled = false;
        toast('디스코드에 올렸어요 (' + queue.length + '개 메시지)', 2500);
        afterSent(total);
      } catch (e) { btn.disabled = false; paintHook(); toast('보내기 실패: ' + e.message + ' — 다시 누르면 이어서 보내요', 4500); }
      return;
    }
    // 웹후크가 없으면 공유창 (묶음이 여러 개면 한 번에 하나씩)
    const text = queue[qi];
    let sent = false;
    try { if (navigator.share) { await navigator.share({ text }); sent = true; } } catch (e) { if (e && e.name === 'AbortError') { paintHook(); return; } }
    if (!sent) {
      try { await navigator.clipboard.writeText(text); sent = true; toast('복사됨 — 디스코드 채널에 붙여넣으세요', 3000); }
      catch (e) { prompt('아래 글자를 전부 복사해서 디스코드에 붙여넣으세요', text); sent = true; }
    }
    qi++;
    if (qi < queue.length) { paintHook(); toast('다음 묶음이 남았어요 — "다음 묶음 보내기"를 눌러주세요 (' + qi + '/' + queue.length + ' 보냄)', 3500); return; }
    afterSent(total);
  };

  const drawList = () => {
    const p = $('p'); p.replaceChildren();
    const head = document.createElement('div'); head.className = 'h';
    head.appendChild(el('b', { textContent: '태블릿 북마크' }));
    const close = document.createElement('button'); close.className = 'b'; close.textContent = '닫기'; close.onclick = () => p.classList.remove('on');
    head.appendChild(close); p.appendChild(head);
    const all = ids();
    if (!all.length) { const e = document.createElement('div'); e.style.cssText = 'color:#999;margin:10px 0'; e.textContent = '(비어 있음) 영상 보면서 ★를 누르세요'; p.appendChild(e); return; }
    all.forEach(id => {
      const o = load(id);
      const box = document.createElement('div'); box.className = 'v';
      const vt = document.createElement('div'); vt.className = 'vt'; vt.textContent = (id === vidId() ? '▶ ' : '') + (o.t || id) + '  (' + o.s.length + ')';
      box.appendChild(vt);
      o.s.forEach(sec => {
        const c = document.createElement('span'); c.className = 'c';
        const a = document.createElement('span'); a.textContent = fmt(sec);
        a.onclick = () => { if (id === vidId() && vid()) vid().currentTime = sec; else location.href = 'https://www.youtube.com/watch?v=' + id + '&t=' + sec + 's'; };
        const x = document.createElement('i'); x.textContent = '×';
        x.onclick = () => { const q = load(id); q.s = q.s.filter(z => z !== sec); save(id, q); paint(); drawList(); };
        c.append(a, x); box.appendChild(c);
      });
      p.appendChild(box);
    });
    const clr = document.createElement('button'); clr.className = 'b'; clr.textContent = '전체 지우기';
    clr.onclick = () => { if (confirm('태블릿 북마크를 전부 지울까요?')) { ids().forEach(id => localStorage.removeItem(P + id)); paint(); drawList(); } };
    p.appendChild(clr);
  };
  $('list').onclick = () => { const p = $('p'); p.classList.toggle('on'); if (p.classList.contains('on')) drawList(); };
  $('hide').onclick = () => { host.style.display = 'none'; toast('북마크를 다시 누르면 나타나요'); };

  let last = null;
  setInterval(() => { const id = vidId(); if (id !== last) { last = id; paint(); } }, 1000);
  paint(); paintHook();
  window.__wonTab = { show: () => { host.style.display = ''; paint(); } };
  toast('태블릿 북마크 켜짐 — ★ 누르면 지금 시점 저장', 2200);
})();
