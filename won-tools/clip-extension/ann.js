/* 그림 위에 그리기 (분석 화면) — 화살표 · 원 · 펜 · 글자
   저장: ann:<영상>:<맵>:<라운드> = { 그림키: [항목…] }   그림키 = 'mm:140|130|100'(방송 미니맵) · 'scn:<장면키>'(찍은 장면) · 'pic:<id>'(붙인 스크린샷)
   좌표는 그림 크기에 대한 비율(0~1), 굵기·글자 크기는 긴 변 1000분의 1 단위 → 어떤 크기로 그려도 같은 모양
   보드 쪽 시트로 보내기(정리 슬라이드)도 WonAnn.apply로 같은 모양을 그림에 얹어서 보냄 */
(function (root) {
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#ffffff', '#f4d35e', '#7cc4ff', '#3fb8b0', '#d0504a'];
  const key = (vid, m, n) => 'ann:' + vid + ':' + m + ':' + n;
  const S = () => chrome.storage.local;
  async function load(vid, m, n) { const k = key(vid, m, n); return (await S().get(k))[k] || {}; }
  async function save(vid, m, n, obj) {
    const k = key(vid, m, n), clean = {};
    Object.keys(obj || {}).forEach(g => { if (obj[g] && obj[g].length) clean[g] = obj[g]; });
    if (Object.keys(clean).length) await S().set({ [k]: clean }); else await S().remove(k);
  }
  const unitOf = (W, H) => Math.max(W, H) / 1000;
  const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('그림을 못 불러옴')); im.src = src; });
  // 화살표 머리 세 점 (픽셀 좌표)
  function head(ax, ay, bx, by, w) {
    const ang = Math.atan2(by - ay, bx - ax), L = Math.max(10, w * 4.2), sp = 0.5;
    return [[bx, by], [bx - L * Math.cos(ang - sp), by - L * Math.sin(ang - sp)], [bx - L * Math.cos(ang + sp), by - L * Math.sin(ang + sp)]];
  }
  /* ---------- 캔버스에 그리기 (내보내기·보내기용) ---------- */
  function draw(ctx, items, W, H) {
    const u = unitOf(W, H);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const it of (items || [])) {
      const c = it.c || COLORS[0], w = (it.w || 5) * u;
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = w;
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = w * 0.9;
      if (it.t === 'arrow') {
        const ax = it.a[0] * W, ay = it.a[1] * H, bx = it.b[0] * W, by = it.b[1] * H, hd = head(ax, ay, bx, by, w);
        const bk = Math.max(0, Math.hypot(bx - ax, by - ay) - w * 2.6), ang = Math.atan2(by - ay, bx - ax);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + bk * Math.cos(ang), ay + bk * Math.sin(ang)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hd[0][0], hd[0][1]); ctx.lineTo(hd[1][0], hd[1][1]); ctx.lineTo(hd[2][0], hd[2][1]); ctx.closePath(); ctx.fill();
      } else if (it.t === 'circle') {
        ctx.beginPath(); ctx.arc(it.x * W, it.y * H, Math.max(2, it.r * Math.max(W, H)), 0, Math.PI * 2); ctx.stroke();
      } else if (it.t === 'pen' && it.pts && it.pts.length) {
        ctx.beginPath(); ctx.moveTo(it.pts[0][0] * W, it.pts[0][1] * H);
        for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i][0] * W, it.pts[i][1] * H);
        if (it.pts.length === 1) ctx.lineTo(it.pts[0][0] * W + 0.1, it.pts[0][1] * H);
        ctx.stroke();
      } else if (it.t === 'text' && it.text) {
        const fs = (it.s || 34) * u;
        ctx.font = '700 ' + fs + 'px "Noto Sans KR","Malgun Gothic",sans-serif'; ctx.textBaseline = 'top';
        ctx.shadowBlur = 0; ctx.lineWidth = Math.max(2, fs * 0.16); ctx.strokeStyle = 'rgba(8,14,28,.9)';
        String(it.text).split('\n').forEach((ln, i) => { const y = it.y * H + i * fs * 1.25; ctx.strokeText(ln, it.x * W, y); ctx.fillText(ln, it.x * W, y); });
      }
    }
    ctx.restore();
  }
  // 그림(url)에 항목을 얹은 jpeg — 항목이 없으면 그대로(크기만 맞춤)
  async function apply(url, items, maxW, quality) {
    const im = await loadImg(url), sc = Math.min(1, (maxW || 1920) / im.width);
    const W = Math.round(im.width * sc), H = Math.round(im.height * sc);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H);
    draw(x, items, W, H);
    return c.toDataURL('image/jpeg', quality || 0.88);
  }
  /* ---------- 편집기: <svg> 하나에 그림 + 항목 (viewBox = 그림 픽셀) ---------- */
  function Editor(svg, opts) {
    opts = opts || {};
    const E = { tool: 'sel', color: COLORS[0], width: 5, items: [], W: 1, H: 1, sel: -1, undo: [], onChange: opts.onChange || (() => {}), onFocus: opts.onFocus || (() => {}), url: null };
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const gImg = document.createElementNS(NS, 'g'), gItems = document.createElementNS(NS, 'g'), gTmp = document.createElementNS(NS, 'g');
    svg.append(gImg, gItems, gTmp);
    const mk = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
    const pt = (ev) => { const m = svg.getScreenCTM(); if (!m) return [0, 0]; const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); return [p.x, p.y]; };
    const norm = (p) => [Math.max(0, Math.min(1, p[0] / E.W)), Math.max(0, Math.min(1, p[1] / E.H))];
    const push = () => { E.undo.push(JSON.stringify(E.items)); if (E.undo.length > 80) E.undo.shift(); };
    const changed = () => { render(); E.onChange(E.items); };
    function render() {
      gItems.textContent = '';
      const u = unitOf(E.W, E.H);
      E.items.forEach((it, i) => {
        const g = mk('g', { 'data-i': i, class: 'ann' + (i === E.sel ? ' sel' : '') }, gItems);
        const c = it.c || COLORS[0], w = (it.w || 5) * u;
        const st = { stroke: c, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: 'url(#annShadow)' };
        if (it.t === 'arrow') {
          const ax = it.a[0] * E.W, ay = it.a[1] * E.H, bx = it.b[0] * E.W, by = it.b[1] * E.H, hd = head(ax, ay, bx, by, w);
          const bk = Math.max(0, Math.hypot(bx - ax, by - ay) - w * 2.6), ang = Math.atan2(by - ay, bx - ax);
          mk('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: 'transparent', 'stroke-width': Math.max(w * 4, 14 * u) }, g);
          mk('line', Object.assign({ x1: ax, y1: ay, x2: ax + bk * Math.cos(ang), y2: ay + bk * Math.sin(ang) }, st), g);
          mk('polygon', { points: hd.map(p => p.join(',')).join(' '), fill: c, filter: 'url(#annShadow)' }, g);
        } else if (it.t === 'circle') {
          const r = Math.max(2, it.r * Math.max(E.W, E.H));
          mk('circle', { cx: it.x * E.W, cy: it.y * E.H, r, stroke: 'transparent', 'stroke-width': Math.max(w * 4, 14 * u), fill: 'none' }, g);
          mk('circle', Object.assign({ cx: it.x * E.W, cy: it.y * E.H, r }, st), g);
        } else if (it.t === 'pen') {
          const d = (it.pts || []).map((p, k) => (k ? 'L' : 'M') + (p[0] * E.W).toFixed(1) + ' ' + (p[1] * E.H).toFixed(1)).join(' ') + (it.pts && it.pts.length === 1 ? ' l0.1 0' : '');
          mk('path', { d, stroke: 'transparent', 'stroke-width': Math.max(w * 4, 14 * u), fill: 'none' }, g);
          mk('path', Object.assign({ d }, st), g);
        } else if (it.t === 'text') {
          const fs = (it.s || 34) * u, lines = String(it.text || '').split('\n');
          lines.forEach((ln, k) => {
            const y = it.y * E.H + k * fs * 1.25;
            const t0 = mk('text', { x: it.x * E.W, y, 'font-size': fs, 'font-weight': 700, 'dominant-baseline': 'hanging', fill: 'none', stroke: 'rgba(8,14,28,.9)', 'stroke-width': Math.max(2, fs * 0.16), 'stroke-linejoin': 'round', 'font-family': 'Noto Sans KR, Malgun Gothic, sans-serif' }, g); t0.textContent = ln;
            const t1 = mk('text', { x: it.x * E.W, y, 'font-size': fs, 'font-weight': 700, 'dominant-baseline': 'hanging', fill: c, 'font-family': 'Noto Sans KR, Malgun Gothic, sans-serif' }, g); t1.textContent = ln;
          });
        }
      });
    }
    function setImage(url, W, H, items) {
      E.url = url; E.W = W || 1; E.H = H || 1; E.items = (items || []).slice(); E.sel = -1; E.undo = [];
      svg.setAttribute('viewBox', '0 0 ' + E.W + ' ' + E.H);
      gImg.textContent = ''; gTmp.textContent = '';
      if (!svg.querySelector('#annShadow')) {
        const defs = mk('defs', {}, svg); svg.insertBefore(defs, svg.firstChild);
        const f = mk('filter', { id: 'annShadow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
        mk('feDropShadow', { dx: 0, dy: 0, stdDeviation: 1.4, 'flood-color': '#000', 'flood-opacity': 0.6 }, f);
      }
      if (url) mk('image', { href: url, x: 0, y: 0, width: E.W, height: E.H }, gImg);
      render();
    }
    let drag = null;
    const hit = (ev) => { const g = ev.target.closest && ev.target.closest('g.ann'); return g ? +g.getAttribute('data-i') : -1; };
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || !E.url || E.locked) return;
      E.onFocus(E);
      const p = pt(ev), i = hit(ev);
      if (E.tool === 'erase') { if (i >= 0) { push(); E.items.splice(i, 1); E.sel = -1; changed(); } return; }
      if (E.tool === 'sel') {
        E.sel = i; render();
        if (i >= 0) { drag = { k: 'move', i, p0: p, orig: JSON.stringify(E.items[i]), moved: false }; svg.setPointerCapture(ev.pointerId); }
        return;
      }
      if (E.tool === 'text') { ev.preventDefault(); if (opts.askText) opts.askText(ev, (text) => { if (!text) return; push(); const n = norm(p); E.items.push({ t: 'text', x: n[0], y: n[1], s: 34, c: E.color, text }); changed(); }); return; }
      ev.preventDefault(); svg.setPointerCapture(ev.pointerId);
      const n = norm(p);
      if (E.tool === 'arrow') drag = { k: 'arrow', it: { t: 'arrow', a: n, b: n, c: E.color, w: E.width } };
      else if (E.tool === 'circle') drag = { k: 'circle', it: { t: 'circle', x: n[0], y: n[1], r: 0, c: E.color, w: E.width } };
      else if (E.tool === 'pen') drag = { k: 'pen', it: { t: 'pen', pts: [n], c: E.color, w: E.width } };
      if (drag) { push(); E.items.push(drag.it); drag.i = E.items.length - 1; render(); }
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const p = pt(ev), n = norm(p);
      if (drag.k === 'move') {
        const dx = (p[0] - drag.p0[0]) / E.W, dy = (p[1] - drag.p0[1]) / E.H, o = JSON.parse(drag.orig), it = E.items[drag.i];
        if (!drag.moved && Math.hypot(p[0] - drag.p0[0], p[1] - drag.p0[1]) < 2) return;
        if (!drag.moved) { push(); drag.moved = true; }
        if (o.t === 'arrow') { it.a = [o.a[0] + dx, o.a[1] + dy]; it.b = [o.b[0] + dx, o.b[1] + dy]; }
        else if (o.t === 'pen') it.pts = o.pts.map(q => [q[0] + dx, q[1] + dy]);
        else { it.x = o.x + dx; it.y = o.y + dy; }
      } else if (drag.k === 'arrow') drag.it.b = n;
      else if (drag.k === 'circle') drag.it.r = Math.hypot((n[0] - drag.it.x) * E.W, (n[1] - drag.it.y) * E.H) / Math.max(E.W, E.H);
      else if (drag.k === 'pen') { const l = drag.it.pts[drag.it.pts.length - 1]; if (Math.hypot((n[0] - l[0]) * E.W, (n[1] - l[1]) * E.H) > 2) drag.it.pts.push([+n[0].toFixed(4), +n[1].toFixed(4)]); }
      render();
    });
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.k === 'move') { if (d.moved) changed(); return; }
      const it = d.it, tiny = (it.t === 'arrow' && Math.hypot((it.b[0] - it.a[0]) * E.W, (it.b[1] - it.a[1]) * E.H) < 6) || (it.t === 'circle' && it.r * Math.max(E.W, E.H) < 4);
      if (tiny) { E.items.splice(d.i, 1); E.undo.pop(); render(); return; }
      changed();
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('contextmenu', (ev) => { if (E.locked) return; const i = hit(ev); if (i >= 0) { ev.preventDefault(); push(); E.items.splice(i, 1); E.sel = -1; changed(); } });
    E.setImage = setImage; E.render = render;
    E.doUndo = () => { if (!E.undo.length) return false; E.items = JSON.parse(E.undo.pop()); E.sel = -1; changed(); return true; };
    E.delSel = () => { if (E.sel < 0) return false; push(); E.items.splice(E.sel, 1); E.sel = -1; changed(); return true; };
    E.clear = () => { if (!E.items.length) return; push(); E.items = []; E.sel = -1; changed(); };
    E.setColor = (c) => { E.color = c; if (E.sel >= 0 && E.items[E.sel]) { push(); E.items[E.sel].c = c; changed(); } };
    return E;
  }
  // 보드가 바뀌었는지 알아보는 짧은 도장 (분석 화면의 보드 미리보기 그림을 새로 만들지 정할 때)
  function sig(b) {
    const t = JSON.stringify(b ? { i: b.items || [], f: !!b.flip } : null);
    let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ':' + t.length;
  }
  const api = { COLORS, key, load, save, draw, apply, Editor, unitOf, sig };
  root.WonAnn = api;
})(typeof self !== 'undefined' ? self : this);
