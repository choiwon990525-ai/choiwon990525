/* 라운드 자동 찾기 — 중계 화면 위쪽의 시계·점수를 읽어서
   ① 라운드마다 시작 시점을 찾고 (영상 아래 R1 R2 … 막대, 누르면 이동)
   ② 라운드마다 투명벽 직후 · 1:25(오프닝) · 1:00 미니맵을 자동으로 찍어 둔다 (마우스 올리면 보임, 모아보기 페이지)
   ③ 점수판 색으로 라운드마다 어느 쪽이 수비인지(defSide), 첫 미니맵으로 무슨 맵인지(maps) 저장
   읽는 방법: 시계(1:28)와 양 팀 점수 숫자 모양을 hud-tpl.js의 본보기와 비교. 라운드 번호 = 두 점수 합 + 1 */
(async () => {
  if (window.__wonRounds) return;
  window.__wonRounds = true;
  const TPL = window.__wonHudTpl;
  if (!TPL) return;

  const S = chrome.storage.local;
  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r || { ok: false }); }); }
    catch (e) { res({ ok: false, err: e.message }); }
  });
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const fmt = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(x); };
  const safeName = (s, max = 60) => { s = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, ''); return s || 'untitled'; };
  const vidId = () => { const u = new URL(location.href); return u.searchParams.get('v') || (location.pathname.match(/^\/(?:live|shorts)\/([\w-]{6,})/) || [])[1] || null; };
  const vid = () => document.querySelector('.html5-main-video') || document.querySelector('video');
  const vidTitle = () => ((document.querySelector('h1.ytd-watch-metadata') || document.querySelector('.slim-video-information-title') || {}).innerText || document.title.replace(/ - YouTube$/, '')).trim();
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* ---------- 화면 숫자 읽기 ---------- */
  const REG = { clock: [900, 26, 1020, 66], sL: [770, 12, 870, 56], sR: [1050, 12, 1150, 56] };
  const MM = [35, 20, 405, 420];            // 미니맵 (1920x1080 기준) — '미니맵이 보이나' 판정용
  const MMW = [35, 20, 555, 520];           // 찍어 두는 칸 (1.9.0: 더 넓게 — 중계마다 미니맵 크기가 달라 오른쪽·아래가 잘리던 것). mapreg WIDE와 같게
  const NW = TPL.NW, NH = TPL.NH;
  const dec = (str) => Array.from(str, ch => { let c = ch.charCodeAt(0); if (c === 126) c = 92; return (c - 35) / 90; });
  const TP = TPL.T.map(r => ({ lab: r[0], v: dec(r[1]).concat([r[2]]) }));
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });

  function region(v, key) {
    const [x0, y0, x1, y1] = REG[key], w = x1 - x0, h = y1 - y0, k = v.videoWidth / 1920;
    cv.width = w; cv.height = h;
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(v, x0 * k, y0 * k, w * k, h * k, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < m.length; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      m[i] = (mn > 170 && mx - mn < 70) ? 1 : 0;
    }
    return { m, w, h };
  }
  function glyphs({ m, w, h }, minh, minw) {
    const col = new Uint8Array(w);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) col[x] = 1;
    const out = [];
    for (let x = 0; x < w;) {
      if (!col[x]) { x++; continue; }
      let e = x; while (e < w && col[e]) e++;
      let y0 = -1, y1 = -1;
      for (let y = 0; y < h; y++) { let any = 0; for (let xx = x; xx < e; xx++) if (m[y * w + xx]) { any = 1; break; } if (any) { if (y0 < 0) y0 = y; y1 = y + 1; } }
      if (y1 - y0 >= minh && e - x >= minw) out.push([x, e, y0, y1]);
      x = e;
    }
    return out;
  }
  function feat({ m, w: W }, [x0, x1, y0, y1]) {
    const w = x1 - x0, h = y1 - y0, v = [];
    for (let i = 0; i < NH; i++) {
      const ya = Math.floor(i * h / NH), yb = Math.max(ya + 1, Math.floor((i + 1) * h / NH));
      for (let j = 0; j < NW; j++) {
        const xa = Math.floor(j * w / NW), xb = Math.max(xa + 1, Math.floor((j + 1) * w / NW));
        let s = 0, n = 0;
        for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { s += m[(y0 + y) * W + x0 + x]; n++; }
        v.push(s / n);
      }
    }
    v.push(w / h * 3);
    return v;
  }
  function classify(f, allowed) {
    let best = null, bd = 1e9;
    for (const t of TP) {
      if (allowed.indexOf(t.lab) < 0) continue;
      let d = 0; for (let i = 0; i < f.length; i++) { const q = t.v[i] - f[i]; d += q * q; }
      if (d < bd) { bd = d; best = t.lab; }
    }
    return { lab: best, d: bd };
  }
  const MAXD = 70;
  function splitWide(r, g) {   // 낮은 화질에서 두 자리 점수(10, 11 …)가 붙어 한 덩어리로 보이면 가운데 가장 옅은 세로줄에서 나눔
    const out = [];
    for (const b of g) {
      const w = b[1] - b[0], h = b[3] - b[2];
      if (w / h < 1.05) { out.push(b); continue; }
      let best = -1, bv = 1e9;
      for (let x = b[0] + Math.floor(w * 0.3); x <= b[0] + Math.ceil(w * 0.7); x++) {
        let s = 0; for (let y = b[2]; y < b[3]; y++) s += r.m[y * r.w + x];
        if (s < bv) { bv = s; best = x; }
      }
      const trim = (x0, x1) => { let y0 = -1, y1 = -1; for (let y = b[2]; y < b[3]; y++) { let any = 0; for (let x = x0; x < x1; x++) if (r.m[y * r.w + x]) { any = 1; break; } if (any) { if (y0 < 0) y0 = y; y1 = y + 1; } } return [x0, x1, y0, y1]; };
      out.push(trim(b[0], best), trim(best + 1, b[1]));
    }
    return out.filter(b => b[2] >= 0 && b[1] - b[0] >= 2);
  }
  function readScore(v, key) {
    // 칸 가장자리에 걸친 덩어리는 숫자가 아님 — 긴 팀 이름(LOUD의 D 등)이 점수 칸으로 삐져 들어온 것
    const r = region(v, key), g = splitWide(r, glyphs(r, 15, 3).filter(b => b[0] > 1 && b[1] < r.w - 1));
    if (!g.length || g.length > 2) return null;
    let s = '';
    for (const b of g) { const c = classify(feat(r, b), '0123456789'); if (c.d > MAXD) return null; s += c.lab; }
    const n = +s; return n <= 40 ? n : null;
  }
  function readClock(v) {
    const r = region(v, 'clock'), g = glyphs(r, 20, 2);
    if (g.length !== 4) return null;
    const allow = ['01', ':', '012345', '0123456789'];
    let s = '';
    for (let i = 0; i < 4; i++) { const c = classify(feat(r, g[i]), allow[i]); if (c.d > MAXD) return null; s += c.lab; }
    const sec = (+s[0]) * 60 + (+s[2]) * 10 + (+s[3]);
    return sec <= 100 ? sec : null;
  }
  function readHud(v) {
    try {
      if (!v || !v.videoWidth) return { ok: false };
      const sL = readScore(v, 'sL'), sR = readScore(v, 'sR');
      const clock = readClock(v);
      return { ok: sL != null && sR != null, sL, sR, clock };
    } catch (e) { return { ok: false, err: e.message }; }
  }
  window.__wonReadHud = () => readHud(vid());   // 시험용

  /* 공수: 점수판 양쪽 점수 칸의 색 — 청록 = 수비, 빨강 = 공격 (VCT 2026 중계) */
  const SIDE = { L: [690, 0, 880, 75], R: [1040, 0, 1230, 75] };
  function sideCount(v, box) {
    const k = v.videoWidth / 1920, [x0, y0, x1, y1] = box, w = 95, h = 38;
    cv.width = w; cv.height = h; cx.drawImage(v, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data; let t = 0, r = 0;
    for (let p = 0; p < d.length; p += 4) {
      const R = d[p], G = d[p + 1], B = d[p + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      if (mx - mn <= 50 || mx <= 90) continue;
      if (G > R + 30 && B > R + 10) t++; else if (R > G + 40 && R > B + 30) r++;
    }
    return { t, r };
  }
  function readSide(v) {   // 'L' = 왼쪽 팀이 수비, 'R' = 오른쪽 팀이 수비, null = 모름
    try {
      if (!v || !v.videoWidth) return null;
      const a = sideCount(v, SIDE.L), b = sideCount(v, SIDE.R), min = 60;
      if (a.t > min && a.t > a.r * 3 && b.r > min && b.r > b.t * 3) return 'L';
      if (a.r > min && a.r > a.t * 3 && b.t > min && b.t > b.r * 3) return 'R';
      return null;
    } catch (e) { return null; }
  }
  /* 미니맵이 화면에 있나: 맵 바닥 회색(118) 비율 — 리플레이·선수 캠 화면이면 거의 없음 */
  function minimapOn(v) {
    try {
      const k = v.videoWidth / 1920, [x0, y0, x1, y1] = MM, w = 92, h = 100;
      cv.width = w; cv.height = h; cx.drawImage(v, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h).data; let n = 0;
      for (let p = 0; p < d.length; p += 4) { const R = d[p], G = d[p + 1], B = d[p + 2]; if (Math.abs(R - G) <= 8 && Math.abs(G - B) <= 8 && R >= 98 && R <= 142) n++; }
      return n / (w * h) > 0.12;
    } catch (e) { return true; }
  }
  window.__wonReadSide = () => readSide(vid());
  const MAPKO = { Abyss: '어비스', Ascent: '어센트', Bind: '바인드', Breeze: '브리즈', Corrode: '코로드', Fracture: '프랙처', Haven: '헤이븐', Icebox: '아이스박스', Lotus: '로터스', Pearl: '펄', Split: '스플릿', Summit: '서밋', Sunset: '선셋' };
  const mapLabel = (m, name) => m + '맵' + (name ? '(' + (MAPKO[name] || name) + ')' : '');

  /* ---------- 영상 이동 ---------- */
  const seekTo = (v, sec) => new Promise((res) => {
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', on); res(); };
    const on = () => {
      if (v.requestVideoFrameCallback) { v.requestVideoFrameCallback(() => setTimeout(fin, 30)); setTimeout(fin, 300); }
      else setTimeout(fin, 300);
    };
    v.addEventListener('seeked', on);
    v.currentTime = Math.max(0, Math.min(sec, (v.duration || sec + 1) - 0.2));
    setTimeout(fin, 12000);
  });
  /* 유튜브 화질 고정 (찾는 동안만) — 이동을 많이 하면 유튜브가 화질을 360p 이하로 떨어뜨려 숫자를 못 읽음.
     플레이어 기능은 페이지 쪽에서만 부를 수 있어서 yt-quality.js(MAIN)에 부탁함 */
  const setQuality = (q) => { try { document.dispatchEvent(new CustomEvent('won-yt-quality', { detail: q })); } catch (e) {} };

  /* ---------- 저장 ---------- */
  const key = (id) => 'rounds:' + id;
  const loadR = async (id) => (await S.get(key(id)))[key(id)] || null;
  const folderOf = async (id) => {
    const meta = (await S.get('meta:' + id))['meta:' + id];
    const t = (meta && meta.title && meta.title !== id) ? meta.title : vidTitle();
    return safeName(t, 60) + ' [' + id + ']';
  };
  async function grabMinimap(v, name, prefs, folder) {
    const k = v.videoWidth / 1920, [x0, y0, x1, y1] = MMW;
    const c = document.createElement('canvas');
    c.width = Math.round((x1 - x0) * Math.max(1, k)); c.height = Math.round((y1 - y0) * Math.max(1, k));
    c.getContext('2d').drawImage(v, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, c.width, c.height);
    const full = c.toDataURL('image/jpeg', 0.9);
    const tc = document.createElement('canvas'); tc.width = 208; tc.height = 200;
    tc.getContext('2d').drawImage(c, 0, 0, 208, 200);
    await S.set({ ['img:' + name]: { thumb: tc.toDataURL('image/jpeg', 0.7), full, at: Date.now(), kind: 'minimap', h: v.videoHeight } });
    if (prefs.saveFiles !== false) send({ t: 'dl', url: full, sub: folder + '/라운드/' + name, overwrite: true });
    return name;
  }
  const hudCrop = (v) => {   // 진단용: 점수판 부분만 작게
    try {
      const k = v.videoWidth / 1920, c = document.createElement('canvas'); c.width = 400; c.height = 60;
      c.getContext('2d').drawImage(v, 760 * k, 10 * k, 400 * k, 60 * k, 0, 0, 400, 60);
      return c.toDataURL('image/jpeg', 0.8);
    } catch (e) { return null; }
  };

  /* ---------- 스캔 ---------- */
  let scanning = false, stopReq = false;
  const status = (txt) => { bar.stat.textContent = txt; };

  async function scan() {
    const v = vid(), id = vidId();
    if (!v || !id || scanning) return;
    if (window.__wonFilling) { toast('태블릿 북마크 화면 채우는 중이에요 — 끝나면 다시 눌러 주세요'); return; }
    for (let i = 0; i < 50 && (!v.videoWidth || v.readyState < 1); i++) await sleep(200);
    if (!v.videoWidth || !isFinite(v.duration)) { toast('영상이 아직 준비되지 않았어요'); return; }
    scanning = true; stopReq = false; window.__wonScanning = true; paint();
    const back = v.currentTime, wasP = !v.paused;
    try { v.pause(); } catch (e) {}
    setQuality('hd1080');
    const prefsAll = Object.assign({ saveFiles: true }, (await S.get('prefs')).prefs || {});
    const folder = await folderOf(id);
    const meta0 = (await S.get('meta:' + id))['meta:' + id];
    const title = (meta0 && meta0.title && meta0.title !== id) ? meta0.title : (vidTitle() || id);
    const prevNotes = {};   // 다시 찾아도 해석 메모는 유지
    const prevMan = {};   // 코치가 보드에서 직접 넣은 미니맵(🗺) — 다시 찾아도 스캔이 못 찍은 칸이면 그대로 둠
    ((await loadR(id)) || { rounds: [] }).rounds.forEach(r => { if (r.note) prevNotes[r.map + '-' + r.n] = r.note; if (r.manual) prevMan[r.map + '-' + r.n] = r; });
    const dur = v.duration;
    const diag = { v: 2, at: new Date().toISOString(), heights: {}, reads: 0, ok: 0, dropped: [], bad: [] };
    let maxH = 0;
    /* 한 시점 읽기: 화질이 떨어져 있으면 잠깐 기다렸다가 다시 읽음 */
    const read = async (t) => {
      await seekTo(v, t);
      for (let w = 0; w < 12 && maxH && v.videoHeight < maxH * 0.9; w++) { if (w === 0) setQuality('hd1080'); await sleep(250); }
      maxH = Math.max(maxH, v.videoHeight);
      const r = readHud(v); r.t = v.currentTime; r.h = v.videoHeight;
      diag.reads++; diag.heights[r.h] = (diag.heights[r.h] || 0) + 1; if (r.ok) diag.ok++;
      else if (diag.bad.length < 40 && r.h) diag.bad.push({ t: Math.round(r.t), h: r.h, sL: r.sL, sR: r.sR, clock: r.clock, img: hudCrop(v) });
      return r;
    };
    const tot = (s) => s.sL + s.sR;
    const follows = (a, b) => b.sL >= a.sL && b.sR >= a.sR && tot(b) - tot(a) <= 1;   // b가 a 다음(같거나 한 라운드 뒤)일 수 있나
    const mapInfo = {};   // {맵 순서: {name, iou}} — 스캔 중 첫 미니맵으로 맵 알아냄
    const save = async (rounds, partial) => S.set({ [key(id)]: { vid: id, title, updated: Date.now(), partial, rounds, maps: mapInfo, diag: { reads: diag.reads, ok: diag.ok, heights: diag.heights } } });
    const idTries = {};
    const identify = async (m, name) => {   // 확장 뒤쪽(오프스크린)에서 맵 모양 비교 → 맵 이름·맞춤 (배경이 어지러우면 다음 라운드로, 맵당 4번까지)
      if (mapInfo[m] || (idTries[m] = (idTries[m] || 0) + 1) > 4) return;
      const rec = (await S.get('img:' + name))['img:' + name]; if (!rec) return;
      const res = await send({ t: 'identifyMap', img: rec.full });
      if (!res || !res.ok || !res.map) return;
      mapInfo[m] = { name: res.map, iou: res.reg.iou };
      const rk = 'roster:' + id + ':' + m, old = (await S.get(rk))[rk];
      if (!old || !old.mapName) await S.set({ [rk]: Object.assign(old || { teams: { A: { name: '왼쪽 팀', agents: ['', '', '', '', ''] }, B: { name: '오른쪽 팀', agents: ['', '', '', '', ''] } } }, { mapName: res.map, reg: { th: res.reg.th, s: res.reg.s, tx: res.reg.tx, ty: res.reg.ty, iou: res.reg.iou } }) });
    };
    try {
      /* 1) 20초 간격으로 훑기 (점수판이 안 보이면 30초) */
      const samples = [];
      let t = 0, miss = 0, seen = 0;
      while (t < dur - 1 && !stopReq) {
        if (vidId() !== id) throw new Error('다른 영상으로 이동해서 멈췄어요');
        const r = await read(t);
        samples.push(r);
        if (r.ok) { seen++; miss = 0; } else miss++;
        status('라운드 찾는 중 ' + Math.round(t / dur * 100) + '% · 1단계 훑기 · 화질 ' + (r.h || '?') + 'p' + (seen ? '' : ' (아직 점수판 못 찾음)'));
        if (t > Math.max(3600, dur * 0.5) && !seen) {   // 방송 앞 사전 방송(무대·인터뷰)이 길 수 있어 15분이 아니라 1시간(또는 영상 절반)까지 찾아봄   // 화질 탓인지 중계 화면 모양 탓인지 나눠서 알려 주고, 화면 한 장을 남김(이 중계에 맞출 때 씀)
          const h = Math.max(maxH, r.h || 0), low = h && h < 700;
          if (!low && prefsAll.saveFiles !== false) {
            try {
              const W = 1280, c = document.createElement('canvas'); c.width = W; c.height = Math.round(v.videoHeight * W / v.videoWidth);
              c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
              send({ t: 'dl', url: c.toDataURL('image/jpeg', 0.85), sub: folder + '/라운드/_화면확인.jpg', overwrite: true });
              diag.frameAt = Math.round(v.currentTime);
              send({ t: 'dlText', text: JSON.stringify(diag), mime: 'application/json', sub: folder + '/라운드/_진단.json', overwrite: true });
            } catch (e) {}
          }
          throw new Error(low ? '점수판을 못 읽었어요 — 화질이 ' + h + 'p라 숫자가 안 보여요 (720p 이상 필요)'
            : '점수판을 못 읽었어요 — 화질(' + (h || '?') + 'p)은 괜찮은데 이 중계는 점수판·미니맵 위치가 VCT 2026 챔피언스 화면과 달라요. 다운로드/관전캡처/…/라운드/_화면확인.jpg 를 Claude에게 보내 주면 이 중계에 맞출 수 있어요');
        }
        t += miss > 20 ? 45 : miss > 3 ? 30 : 20;   // 점수판이 오래 안 보이면(사전 방송) 더 성큼성큼
      }
      if (!seen) throw new Error('점수판을 못 읽었어요');

      /* 2) 점수 흐름으로 라운드 정리 — 잘못 읽은 점수는 버림.
            같은 맵 안에서 점수는 줄지 않고 한 번에 1씩 오름. 0:0 근처로 떨어지면 다음 맵(다음 읽기가 이어받을 때만) */
      const ok = samples.filter(s => s.ok);
      const acc = [];
      let map = 1, cur = null;
      for (let i = 0; i < ok.length; i++) {
        const s = ok[i], nx = ok[i + 1], nx2 = ok[i + 2];
        const confirmed = (x) => (nx && follows(x, nx)) || (nx2 && follows(x, nx2) && tot(nx2) - tot(x) <= 2 && nx2.sL >= x.sL && nx2.sR >= x.sR);
        if (!cur) { if (confirmed(s) || !nx) { cur = s; acc.push({ s, map }); } else diag.dropped.push(Math.round(s.t)); continue; }
        const dL = s.sL - cur.sL, dR = s.sR - cur.sR;
        if (dL === 0 && dR === 0) { acc.push({ s, map }); continue; }
        if (dL >= 0 && dR >= 0 && dL + dR <= 3 && (dL + dR === 1 || confirmed(s))) { cur = s; acc.push({ s, map }); continue; }
        if (tot(s) <= 2 && tot(cur) - tot(s) >= 2 && (confirmed(s) || !nx)) { map++; cur = s; acc.push({ s, map }); continue; }
        diag.dropped.push(Math.round(s.t));
      }
      const groups = [];
      const groupFor = (m, n) => groups.find(g => g.map === m && g.n === n);
      for (const { s, map: m } of acc) {
        let g = groupFor(m, tot(s) + 1);
        if (!g) { g = { map: m, n: tot(s) + 1, sL: s.sL, sR: s.sR, samples: [] }; groups.push(g); }
        g.samples.push(s);
      }
      const sortG = () => groups.sort((a, b) => a.map - b.map || a.n - b.n);
      sortG();
      { // 방송 앞 하이라이트·지난 경기 다시보기에서 점수판이 잠깐 보인 것 = 가짜 맵 (라운드 3개 이하 + 1라운드 없음) → 빼고 맵 번호를 1부터 다시 매김 (시트의 맵 순서와 맞추려고)
        const cnt = {}, lo = {}; groups.forEach(g => { cnt[g.map] = (cnt[g.map] || 0) + 1; lo[g.map] = Math.min(lo[g.map] || 99, g.n); });
        const keep = Object.keys(cnt).map(Number).filter(m => cnt[m] >= 4 || lo[m] === 1).sort((x, y) => x - y);   // 1라운드부터 있으면 짧아도 진짜 맵
        if (keep.length && keep.length < Object.keys(cnt).length) {
          diag.fakeMaps = groups.filter(g => !keep.includes(g.map)).map(g => ({ map: g.map, n: g.n, t: Math.round(g.samples[0].t) }));
          for (let i = groups.length - 1; i >= 0; i--) if (!keep.includes(groups[i].map)) groups.splice(i, 1);
          groups.forEach(g => { g.map = keep.indexOf(g.map) + 1; });
        }
      }

      /* 2-1) 빠진 라운드 채우기: 앞뒤 라운드 사이를 6초 간격으로 다시 봄 */
      const maps = [...new Set(groups.map(g => g.map))];
      for (const m of maps) {
        const gs = groups.filter(g => g.map === m);
        const first = gs[0], prevMapLast = groups.filter(g => g.map === m - 1).pop();
        const want = [];
        for (let n = 1; n < gs[gs.length - 1].n; n++) if (!groupFor(m, n)) want.push(n);
        for (const n of want) {
          if (stopReq) break;
          const before = groups.filter(g => g.map === m && g.n < n).pop();
          const after = groups.filter(g => g.map === m && g.n > n)[0];
          let lo = before ? before.samples[before.samples.length - 1].t : (prevMapLast ? prevMapLast.samples[prevMapLast.samples.length - 1].t : Math.max(0, first.samples[0].t - 240));
          const hi = after ? after.samples[0].t : dur;
          if (!before && n < first.n - 3) continue;   // 맵 앞쪽 여러 라운드가 통째로 없으면(영상이 중간부터) 건너뜀
          status('라운드 찾는 중 · 빠진 라운드 맵' + m + ' R' + n + ' 찾는 중');
          for (let x = lo + 6; x < hi; x += 6) {
            const r = await read(x);
            if (!r.ok) continue;
            if (tot(r) === n - 1 && (!before || follows(before, r)) && (!after || follows(r, after) || (after.sL >= r.sL && after.sR >= r.sR))) {
              let g = groupFor(m, n); if (!g) { g = { map: m, n, sL: r.sL, sR: r.sR, samples: [] }; groups.push(g); }
              g.samples.push(r);
              if (r.clock != null && r.clock > 46) break;
            } else if (tot(r) > n - 1 && groupFor(m, n)) break;
          }
        }
      }
      sortG();

      /* 3) 라운드마다 배리어(1:40) 시점 → 1:30 · 1:00 미니맵 */
      const rounds = [], finals = {};
      const same = (r, g) => r.ok && r.sL === g.sL && r.sR === g.sR;
      for (let gi = 0; gi < groups.length && !stopReq; gi++) {
        const g = groups[gi];
        const nextG = groups[gi + 1];
        const lastOfMap = !nextG || nextG.map !== g.map;
        // 시계가 보였는데 배리어 시점을 못 찾은 마지막 점수: 맵이 끝난 점수(13점 이상 + 2점 차)일 때만 최종 화면으로 봄 — 12:x는 진짜 마지막 라운드라 남김
        const ended = (g.sL >= 13 || g.sR >= 13) && Math.abs(g.sL - g.sR) >= 2;
        if (lastOfMap && !g.samples.some(x => x.clock != null)) { finals[g.map] = { sL: g.sL, sR: g.sR }; continue; }   // 시계가 한 번도 안 보임 = 맵 끝난 뒤 최종 점수 화면
        status('라운드 찾는 중 · 2단계 맵' + g.map + ' R' + g.n + ' 미니맵 (' + (gi + 1) + '/' + groups.length + ')');
        // 후보: {t: 배리어 추정 시각, live: 같은 라운드에서 읽은 시계로 계산한 것인지}
        const cands = [];
        for (const s of g.samples) if (s.clock != null) {
          const live = s.t + s.clock - 100;
          if (s.clock > 46) cands.unshift({ t: live, live: true }); else { cands.push({ t: live, live: true }); cands.push({ t: s.t + s.clock, live: true }); }
        }
        const lo = g.samples[0].t - 20, hi = (nextG ? nextG.samples[0].t : dur);
        for (let x = Math.max(0, lo); x < hi; x += 5) cands.push({ t: x, live: false });   // 시계를 못 읽은 라운드: 5초 간격으로 다시 보기
        // 점수판 일부가 가려져 점수를 못 읽어도(리플레이·그래픽), 이 라운드 시계로 계산한 시점이면 시계만 맞으면 인정
        const okAt = (r, live) => same(r, g) || (live && !r.ok && r.clock != null);
        let t0 = null, at130 = null, tries = 0;
        const probeLog = [];   // 진단: 시작점 찾을 때 읽은 [시각, 점수, 점수, 시계]
        const tried = [];
        for (let ci = 0; ci < cands.length; ci++) {
          const c = cands[ci];
          if (tries > 30 || stopReq) break;
          const probe = c.t + 10;
          if (probe < 0 || probe > dur || tried.some(x => Math.abs(x - probe) < 2)) continue;
          tried.push(probe); tries++;
          let r = await read(probe);
          if (probeLog.length < 14) probeLog.push([Math.round(r.t), r.ok ? r.sL : null, r.ok ? r.sR : null, r.clock]);
          if (r.clock == null || !okAt(r, c.live)) continue;
          if (r.clock <= 46) { if (same(r, g)) cands.splice(ci + 1, 0, { t: r.t + r.clock, live: false }); continue; }   // 구매 시간이면 끝나는 시점이 배리어
          const guess = r.t + r.clock - 100, live = same(r, g) || c.live;
          if (Math.abs(r.clock - 90) > 1) { r = await read(guess + 10); tries++; }
          if (r.clock != null && okAt(r, live) && Math.abs(r.clock - 90) <= 2) { t0 = r.t + r.clock - 100; at130 = r; break; }
          // 1:30 즈음 시계가 가려지는 중계(라운드 시작 그래픽 등): 1:25·1:20에서 두 번 맞으면 그 시계로 시작점 인정
          const q1 = await read(guess + 15), q2 = await read(guess + 20); tries += 2;
          if (probeLog.length < 14) probeLog.push([Math.round(q1.t), q1.ok ? q1.sL : null, q1.ok ? q1.sR : null, q1.clock], [Math.round(q2.t), q2.ok ? q2.sL : null, q2.ok ? q2.sR : null, q2.clock]);
          if (q1.clock != null && q2.clock != null && okAt(q1, live) && okAt(q2, live) && Math.abs(q1.clock - 85) <= 2 && Math.abs(q2.clock - 80) <= 2) { t0 = guess; break; }
        }
        if (t0 == null && lastOfMap && ended) { finals[g.map] = { sL: g.sL, sR: g.sR }; continue; }
        const rec = { map: g.map, n: g.n, sL: g.sL, sR: g.sR, t0, jump: t0 != null ? Math.max(0, t0 - 5) : g.samples[0].t, shots: {} };
        const mmOff = [];   // 진단: 미니맵이 화면에 없어서(리플레이·선수 캠) 못 찍은 시각들
        if (prevNotes[g.map + '-' + g.n]) rec.note = prevNotes[g.map + '-' + g.n];
        if (t0 != null) {
          const base = id + '_M' + g.map + '_R' + pad(g.n);
          const sides = [];
          const noteSide = () => { const sd = readSide(v); if (sd) sides.push(sd); };
          const grabOk = async (name) => { if (!minimapOn(v)) { mmOff.push(Math.round(v.currentTime)); return null; } noteSide(); return grabMinimap(v, name, prefsAll, folder); };
          // 0) 투명벽이 내려간 직후 — 미니맵이 보이는 첫 순간 (방송이 리플레이를 보여주고 있으면 조금 뒤)
          for (let dt = 1; dt <= 7 && !rec.shots['140']; dt += 1.5) {
            const r = await read(t0 + dt);
            if ((same(r, g) || !r.ok) && r.clock != null && r.clock >= 92 && r.clock <= 100) {
              const nm = await grabOk(base + '_' + fmt(r.clock).replace(':', '-') + '.jpg');
              if (nm) { rec.shots['140'] = nm; rec.lab140 = fmt(r.clock); }
            }
          }
          // 1) 오프닝: 배리어 + 15초(1:25) — 공격팀이 스폰에서 퍼지고 첫 스킬이 보이는 때. 설정 shot1Off로 바꿀 수 있음
          const OFF1 = +(prefsAll.shot1Off || 15), exp1 = 100 - OFF1;
          let r = await read(t0 + OFF1);
          if ((same(r, g) || !r.ok) && r.clock != null && Math.abs(r.clock - exp1) > 1 && Math.abs(r.clock - exp1) < 8) r = await read(r.t + (r.clock - exp1));
          if ((same(r, g) || !r.ok) && r.clock != null && Math.abs(r.clock - exp1) <= 2) {
            const nm = await grabOk(base + '_' + fmt(exp1).replace(':', '-') + '.jpg'); if (nm) { rec.shots['130'] = nm; rec.lab130 = fmt(exp1); }
          }
          if (!rec.shots['130']) {   // 그 전에 라운드가 크게 바뀌면(빠른 교전 등) 1:30 화면이라도
            r = at130; if (!r || Math.abs(v.currentTime - r.t) > 0.3) r = await read(t0 + 10);
            if ((same(r, g) || !r.ok) && r.clock != null && Math.abs(r.clock - 90) <= 2) { const nm = await grabOk(base + '_1-30.jpg'); if (nm) { rec.shots['130'] = nm; rec.lab130 = '1:30'; } }
          }
          if (!rec.shots['130']) {   // 1:25·1:30에 방송이 리플레이·선수 캠이라 미니맵이 없었으면 1:25 앞뒤(1:31~1:14)에서 미니맵이 보이는 순간
            for (const off of [OFF1 - 2, OFF1 + 2, OFF1 - 5, OFF1 + 5, OFF1 + 8, OFF1 + 11]) {
              if (off < 9 || stopReq) continue;
              const q = await read(t0 + off);
              if ((same(q, g) || !q.ok) && q.clock != null && Math.abs(q.clock - (100 - off)) <= 2) {
                const nm = await grabOk(base + '_' + fmt(q.clock).replace(':', '-') + '.jpg');
                if (nm) { rec.shots['130'] = nm; rec.lab130 = fmt(q.clock); break; }
              }
            }
          }
          // 2) 1:00 — 설치 후면 '설치 후', 1:00 전에 라운드가 끝났으면 끝나기 직전 화면
          r = await read(t0 + 40);
          const fit = (r) => same(r, g) || (!r.ok && r.clock != null);   // 점수를 못 읽어도 시계가 이 라운드 흐름과 맞으면 인정
          if (fit(r) && r.clock != null && Math.abs(r.clock - 60) > 2 && r.clock > 30) r = await read(r.t + (r.clock - 60));
          if ((same(r, g) && r.clock == null) || (fit(r) && r.clock != null && Math.abs(r.clock - 60) <= 2)) {
            const nm = await grabOk(base + '_1-00.jpg');
            if (nm) { rec.shots['100'] = nm; rec.lab100 = r.clock == null ? '1:00 · 설치 후' : '1:00'; if (r.clock == null) rec.planted100 = true; }
          }
          if (!rec.shots['100']) {
            for (let back2 = 36; back2 > 12; back2 -= 4) {
              r = await read(t0 + back2);
              if (fit(r) && r.clock != null && Math.abs(r.clock - (100 - back2)) <= 3) {
                const nm = await grabOk(base + '_1-00.jpg');
                if (nm) { rec.shots['100'] = nm; rec.lab100 = fmt(r.clock) + ' · 끝나기 직전'; rec.ended100 = true; break; }
              }
            }
            if (!rec.shots['100']) rec.ended100 = true;
          }
          // 공수: 찍은 순간들의 점수판 색 다수결
          const nL = sides.filter(x => x === 'L').length, nR = sides.length - nL;
          if (sides.length) rec.defSide = nL > nR ? 'L' : nR > nL ? 'R' : sides[0];
          // 맵 이름: 이 맵 첫 미니맵으로
          const firstShot = rec.shots['130'] || rec.shots['140'] || rec.shots['100'];
          if (firstShot && !mapInfo[g.map]) { status('라운드 찾는 중 · ' + g.map + '맵 무슨 맵인지 알아내는 중'); await identify(g.map, firstShot); }
        }
        const pm = prevMan[g.map + '-' + g.n];
        if (pm) for (const k of Object.keys(pm.manual)) if (!rec.shots[k] && pm.shots && pm.shots[k]) { rec.shots[k] = pm.shots[k]; rec.manual = Object.assign({}, rec.manual, { [k]: true }); const lk = k === '140' ? 'lab140' : k === '130' ? 'lab130' : 'lab100'; if (pm[lk]) rec[lk] = pm[lk]; }
        rounds.push(rec);
        (diag.rounds = diag.rounds || []).push({ m: rec.map, n: rec.n, t0: t0 != null ? Math.round(t0) : null, got: Object.keys(rec.shots), mmOff, tries, probe: t0 == null ? probeLog : undefined });   // 왜 빠졌는지: t0 없음(라운드 시작 못 찾음) / mmOff(그 순간 미니맵 없음)
        await save(rounds, true);
        draw(rounds);
      }
      // 맵 마지막 라운드: 끝난 뒤 점수를 못 봤으면 조금 뒤를 몇 번 더 봄
      for (let i = 0; i < rounds.length && !stopReq; i++) {
        const a = rounds[i], b = rounds[i + 1];
        if ((b && b.map === a.map) || finals[a.map]) continue;
        const g = groupFor(a.map, a.n);
        let tt = g.samples[g.samples.length - 1].t;
        for (let k = 0; k < 15 && tt < dur - 1; k++) {
          tt += 3; const r = await read(tt);
          if (!r.ok) continue;
          if (tot(r) === a.n && r.sL >= a.sL && r.sR >= a.sR) { finals[a.map] = { sL: r.sL, sR: r.sR }; break; }
          if (tot(r) < a.n - 1) break;
        }
      }
      for (let i = 0; i < rounds.length; i++) {   // 이긴 쪽: 다음 라운드 점수로
        const a = rounds[i], b = rounds[i + 1];
        const nx = (b && b.map === a.map && b.n === a.n + 1) ? b : (!b || b.map !== a.map) ? finals[a.map] : null;
        if (nx) a.win = nx.sL > a.sL ? 'L' : nx.sR > a.sR ? 'R' : null;
      }
      await save(rounds, !!stopReq);
      if (!stopReq) send({ t: 'reportScan', vid: id });   // 구글 시트 🏆 챔피언스 탭 '미니맵' 칸에 표시
      // 진단 기록 (잘 안 잡힐 때 원인 찾기용) → 경기 폴더/라운드/_진단.json
      diag.found = rounds.length; diag.maps = Object.keys(finals).length; diag.samples = samples.map(s => [Math.round(s.t), s.h, s.ok ? s.sL : null, s.ok ? s.sR : null, s.clock]);
      if (prefsAll.saveFiles !== false) send({ t: 'dlText', text: JSON.stringify(diag), mime: 'application/json', sub: folder + '/라운드/_진단.json', overwrite: true });
      const lack = rounds.filter(r => !r.shots['140'] || !r.shots['130'] || !r.shots['100']).length;
      toast(stopReq ? '멈췄어요 — 찾은 라운드 ' + rounds.length + '개는 저장됨'
        : '라운드 ' + rounds.length + '개 찾음' + (lack ? ' · 미니맵이 빠진 라운드 ' + lack + '개' : ' · 모두 미니맵 3장'), 5000);
      lastScan = { vid: id, ok: !stopReq, rounds: rounds.length, lack };
    } catch (e) {
      toast(e.message, 6000);
      lastScan = { vid: id, ok: false, err: e.message };
    } finally {
      setQuality('auto');
      if (vidId() === id) { await seekTo(v, back); if (wasP) v.play().catch(() => {}); }
      scanning = false; window.__wonScanning = false;
      await refreshBar();
      queueNext(id, stopReq);
    }
  }
  /* ---------- 스캔 대기열: 영상 여러 개를 한 탭에서 차례로 (밤새 돌려두기) ----------
     시작: 유튜브 주소 …&won=queue&list=영상ID,영상ID,… → 첫 영상으로 가서 스캔, 끝나면 다음 영상으로 이동해 또 스캔
     멈추기 누르면 대기열도 멈춤 · 상태는 storage 'scanQueue'(진행 중) / 'scanQueueLast'(끝난 것) */
  let lastScan = null;
  async function queueNext(id, stopped) {
    const q = (await S.get('scanQueue')).scanQueue; if (!q || q.list[q.i] !== id) return;
    q.done.push(Object.assign({ at: Date.now() }, lastScan && lastScan.vid === id ? lastScan : { vid: id, ok: false }));
    if (stopped) { q.stopped = Date.now(); await S.set({ scanQueueLast: q }); await S.remove('scanQueue'); toast('대기열 멈춤 (' + q.done.length + '/' + q.list.length + ')', 5000); return; }
    q.i++;
    if (q.i >= q.list.length) { q.finished = Date.now(); await S.set({ scanQueueLast: q }); await S.remove('scanQueue'); toast('대기열 끝 — 영상 ' + q.list.length + '개 스캔', 8000); return; }
    await S.set({ scanQueue: q });
    toast('다음 영상으로 (' + (q.i + 1) + '/' + q.list.length + ')', 3000);
    setTimeout(() => { location.href = 'https://www.youtube.com/watch?v=' + q.list[q.i]; }, 3000);
  }
  async function queueHere() {   // 이 영상이 대기열 차례면 준비되는 대로 스캔 (2분 넘게 영상이 안 뜨면 건너뜀)
    const q = (await S.get('scanQueue')).scanQueue; if (!q || q.list[q.i] !== vidId()) return;
    status('대기열 ' + (q.i + 1) + '/' + q.list.length + ' — 영상 준비되면 시작');
    for (let i = 0; i < 120 && !scanning; i++) {
      await sleep(1000); const v = vid();
      if (i >= 3 && v && v.videoWidth && isFinite(v.duration) && v.duration > 600 && !document.querySelector('.ad-showing')) { scan(); return; }
    }
    if (!scanning) { lastScan = { vid: vidId(), ok: false, err: '영상이 안 떠서 건너뜀 (탭이 뒤에 있었나?)' }; queueNext(vidId(), false); }
  }

  /* ---------- 영상 아래 라운드 막대 ---------- */
  const barHost = document.createElement('div');
  barHost.id = 'won-rounds-host';
  barHost.style.cssText = 'display:block;margin:10px 0 4px;';
  const sh = barHost.attachShadow({ mode: 'open' });
  const css = document.createElement('style');
  css.textContent = [
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Malgun Gothic",sans-serif}',
    '.bar{background:#132D65;border:1px solid #1C3B7A;border-radius:2px;padding:8px 10px;color:#fff;font-size:13px;font-family:"Noto Sans KR","Malgun Gothic",system-ui,sans-serif}',
    '.top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.ttl{font-weight:700;color:#fff;background:#1C3B7A;padding:3px 16px 3px 10px;margin:-2px 2px -2px -4px;clip-path:polygon(0 0,100% 0,calc(100% - 9px) 100%,0 100%)}',
    '.stat{color:#BDD9F2;font-size:12px}',
    'button{cursor:pointer;background:#1C3B7A;border:1px solid #4A88C7;color:#fff;border-radius:2px;padding:5px 10px;font-size:12px;font-family:inherit}',
    'button:hover{background:#244a95}',
    'button.pri{background:#fff;border-color:#fff;color:#132D65;font-weight:700}',
    'button.pri:hover{background:#EAF2FA}',
    '.maps{display:flex;flex-direction:column;gap:6px;margin-top:8px}',
    '.map{display:flex;align-items:center;gap:4px;flex-wrap:wrap}',
    '.mlab{color:#BDD9F2;font-size:12px;min-width:40px;margin-right:4px;flex:none}',
    '.r{min-width:34px;padding:4px 0;text-align:center;font-weight:700;border-radius:2px;background:#1C3B7A;border:1px solid #2d4f95;position:relative;font-family:Poppins,"Noto Sans KR",sans-serif}',
    '.r.L{border-bottom:3px solid #3fb8b0}',
    '.r.R{border-bottom:3px solid #d0504a}',
    '.r.cur{background:#fff;color:#132D65;border-color:#fff}',
    '.r.noshot{opacity:.65}',
    '.half{width:8px}',
    '.tip{position:fixed;z-index:2147483647;display:none;background:#0f131b;border:1px solid #3a4763;border-radius:10px;padding:8px;box-shadow:0 8px 30px rgba(0,0,0,.6);pointer-events:none}',
    '.tip.on{display:flex;gap:8px}',
    '.tip figure{margin:0;text-align:center;color:#9aa6b8;font-size:11px}',
    '.tip img{width:185px;height:200px;object-fit:contain;border-radius:6px;display:block;margin-bottom:3px;background:#000}',
    '.tip .none{width:185px;height:200px;display:flex;align-items:center;justify-content:center;border:1px dashed #3a4763;border-radius:6px;color:#667}',
    '.toast{position:fixed;left:50%;top:13%;transform:translateX(-50%);background:rgba(0,0,0,.86);color:#fff;padding:12px 20px;border-radius:10px;font-size:15px;font-weight:600;opacity:0;transition:opacity .18s;pointer-events:none;z-index:2147483647}',
    '.toast.on{opacity:1}',
    '.hint{color:#BDD9F2;font-size:11px;opacity:.85}'
  ].join('');
  sh.appendChild(css);
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const box = mk('div', 'bar'), top = mk('div', 'top');
  const bar = { ttl: mk('span', 'ttl', '🎯 라운드'), stat: mk('span', 'stat', ''), go: mk('button', 'pri', '라운드 자동 찾기'), stop: mk('button', null, '멈추기'),
    gal: mk('button', 'pri', '분석 열기'), brd: mk('button', null, '보드'), again: mk('button', null, '다시 찾기'), imp: mk('button', 'pri', ''), hint: mk('span', 'hint', '') };
  bar.imp.style.display = 'none';
  bar.gal.title = '이 경기 분석 화면 — 라운드마다 방송 미니맵·찍은 장면·스크린샷을 한곳에서 보고 그리고, PPT·텍틱 시트로 보내기';
  top.append(bar.ttl, bar.go, bar.stop, bar.gal, bar.again, bar.imp, bar.stat, bar.hint);   // 1.11.0: 모아보기·보드 버튼 → '분석 열기' 하나 (보드는 분석 화면 안에서)
  /* ---------- 메모 가져오기: Claude가 정리한 예전 관전 메모를 라운드 메모(해석 메모 = 보드 메모)로 넣기 ----------
     페이지에서 window.postMessage({ won: 'importNotes', vid, notes: [{ map, n, text }] }, '*') → 막대에 '📥 메모 N개 가져오기' 버튼 → 눌러야 저장
     빈 라운드는 채우고, 이미 적힌 라운드는 같은 글이 없을 때만 아래에 덧붙임 (지우지 않음) */
  let pendingNotes = null;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.won !== 'importNotes' || d.vid !== vidId() || !Array.isArray(d.notes)) return;
    pendingNotes = d.notes.filter(x => x && Number.isInteger(x.map) && Number.isInteger(x.n) && typeof x.text === 'string' && x.text.trim())
      .slice(0, 300).map(x => ({ map: x.map, n: x.n, text: x.text.trim().slice(0, 6000) }));
    if (!pendingNotes.length) { pendingNotes = null; return; }
    bar.imp.textContent = '📥 메모 ' + pendingNotes.length + '개 가져오기';
    bar.imp.style.display = '';
  });
  bar.imp.onclick = async () => {
    if (!pendingNotes) return;
    const id = vidId(), k = key(id), d = (await S.get(k))[k];
    if (!d || !d.rounds) { toast('이 영상은 아직 라운드를 찾지 않았어요'); return; }
    let filled = 0, added = 0, same = 0, miss = [];
    for (const x of pendingNotes) {
      const r = d.rounds.find(q => q.map === x.map && q.n === x.n);
      if (!r) { miss.push(x.map + '맵 R' + x.n); continue; }
      const cur = String(r.note || '').trim();
      if (!cur) { r.note = x.text; filled++; }
      else if (cur.includes(x.text)) same++;
      else { r.note = cur + '\n\n' + x.text; added++; }
    }
    d.noteAt = Date.now();
    await S.set({ [k]: d });
    pendingNotes = null; bar.imp.style.display = 'none';
    toast('메모 넣음: 새로 ' + filled + ' · 덧붙임 ' + added + (same ? ' · 이미 있음 ' + same : '') + (miss.length ? ' · 라운드 없음 ' + miss.join(', ') : ''), 8000);
    await refreshBar();
  };
  const maps = mk('div', 'maps');
  box.append(top, maps);
  const tip = mk('div', 'tip'), toastEl = mk('div', 'toast');
  sh.append(box, tip, toastEl);
  const toast = (m, ms = 1800) => { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(toastEl._h); toastEl._h = setTimeout(() => toastEl.classList.remove('on'), ms); };

  bar.go.onclick = () => scan();
  bar.again.onclick = () => { if (confirm('라운드를 처음부터 다시 찾을까요? (몇 분 걸려요)')) scan(); };
  bar.stop.onclick = () => { stopReq = true; status('멈추는 중…'); };
  // 확장을 새로고침하면 이 탭의 라운드 막대는 확장과 끊김 → 알림 (장면 캡처 도구 쪽에 새로고침 버튼)
  setInterval(() => { let ok = false; try { ok = !!(chrome.runtime && chrome.runtime.id); } catch (e) {} if (!ok && !scanning) { bar.stat.textContent = '↻ 확장이 새로 고쳐졌어요 — 이 탭을 새로고침(F5)해야 라운드 기능이 다시 돼요'; bar.stat.style.color = '#ff8a80'; } }, 3000);
  /* 1.11.1: 분석 화면은 링크처럼 이 창의 새 탭으로 (어사이드에서 백그라운드 탭이 안 보이던 것) — 6초 안에 열린 소식이 없으면 백그라운드로 한 번 더 */
  const openPage = (path, fallback) => {
    let url = ''; try { url = chrome.runtime.getURL(path); } catch (e) {}
    if (!url) { send(fallback); return; }
    const t0 = Date.now(); let seen = false;
    const on = (ch, area) => { const n = area === 'local' && ch.pageOpen && ch.pageOpen.newValue; if (n && n.at >= t0 - 1500) seen = true; };
    try { chrome.storage.onChanged.addListener(on); } catch (e) {}
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
    sh.append(a); a.click(); a.remove();
    setTimeout(() => { try { chrome.storage.onChanged.removeListener(on); } catch (e) {} if (!seen) send(fallback); }, 6000);
  };
  bar.gal.onclick = () => {
    const k = curRound(), r = k >= 0 ? btns[k].r : (btns[0] && btns[0].r), m = r ? r.map : 1, n = r ? r.n : 1;
    openPage('analyze.html?v=' + encodeURIComponent(vidId()) + '&m=' + m + '&r=' + n + '&yt=1', { t: 'openAnalyze', vid: vidId(), m, r: n });
  };
  // 시트의 '🗂 미니맵' 링크(…&won=rounds&m=2)로 들어오면 그 맵 미니맵 모아보기를 바로 엶 (한 번만)
  try {
    const u = new URL(location.href), w = u.searchParams.get('won');
    if (w === 'queue') {   // …&won=queue&list=ID,ID,… : 스캔 대기열 시작
      const list = (u.searchParams.get('list') || '').split(',').map(x => x.trim()).filter(x => /^[\w-]{11}$/.test(x));
      if (list.length) S.set({ scanQueue: { list, i: 0, done: [], started: Date.now() } }).then(() => { location.href = 'https://www.youtube.com/watch?v=' + list[0]; });
    } else if (w === 'scan') {   // …&won=scan : 라운드 자동 찾기를 처음부터 바로 시작 (확인 창 없이)
      u.searchParams.delete('won'); history.replaceState(history.state, '', u.toString());
      // 영상·광고가 준비될 때까지 기다렸다가 시작 (최대 2분)
      (async () => { for (let i = 0; i < 120 && !scanning; i++) { await sleep(1000); const v = vid(); if (i >= 3 && v && v.videoWidth && isFinite(v.duration) && v.duration > 600 && !document.querySelector('.ad-showing')) { scan(); return; } } })();
    } else if (w === 'rounds' || w === 'board') {
      const m = +u.searchParams.get('m') || 1;
      u.searchParams.delete('won'); u.searchParams.delete('m'); history.replaceState(history.state, '', u.toString());
      if (w === 'rounds') send({ t: 'openAnalyze', vid: vidId(), m });   // 시트의 '🗂 미니맵' 링크 → 분석 화면 (1.11.0)
      else S.get('rounds:' + vidId()).then(o => { const rec = o['rounds:' + vidId()]; const r = rec && (rec.rounds || []).find(x => x.map === m); send({ t: 'openBoard', vid: vidId(), m, r: r ? r.n : 1 }); });
    }
  } catch (e) {}
  setTimeout(() => { queueHere().catch(() => {}); }, 1500);   // 스캔 대기열 이어 하기
  bar.brd.onclick = () => { const k = curRound(), r = k >= 0 ? btns[k].r : (btns[0] && btns[0].r); if (r) send({ t: 'openBoard', vid: vidId(), m: r.map, r: r.n }); };

  let DATA = null, btns = [];
  const paint = () => {
    const has = !!(DATA && DATA.rounds && DATA.rounds.length);
    bar.go.style.display = (!has && !scanning) ? '' : 'none';
    bar.stop.style.display = scanning ? '' : 'none';
    bar.gal.style.display = has && !scanning ? '' : 'none';
    bar.brd.style.display = has && !scanning ? '' : 'none';
    bar.again.style.display = has && !scanning ? '' : 'none';
    bar.hint.textContent = scanning ? '이 창을 켜 둔 채로 기다려 주세요 (다른 탭으로 가면 느려져요)'
      : has ? '[ ] 키: 이전·다음 라운드 · 마우스를 올리면 미니맵 3장'
      : '중계 점수판을 읽어서 라운드 시작과 미니맵 3장(투명벽·1:25·1:00)을 찾아요 · 경기당 5~10분';
    if (!scanning) bar.stat.textContent = has ? ('라운드 ' + DATA.rounds.length + '개' + (DATA.partial ? ' (중간에 멈춤)' : '')) : '';
  };
  function draw(rounds) {
    maps.textContent = ''; btns = [];
    const byMap = {};
    (rounds || []).forEach(r => (byMap[r.map] = byMap[r.map] || []).push(r));
    for (const m of Object.keys(byMap)) {
      const row = mk('div', 'map'); row.append(mk('span', 'mlab', mapLabel(m, DATA && DATA.maps && DATA.maps[m] && DATA.maps[m].name)));
      for (const r of byMap[m]) {
        if (r.n === 13) row.append(mk('span', 'half'));
        const b = mk('button', 'r' + (r.win ? ' ' + r.win : '') + (r.shots && r.shots['130'] ? '' : ' noshot'), String(r.n));
        b.onclick = () => { const v = vid(); if (v) { v.currentTime = r.jump; v.play().catch(() => {}); } };
        b.onmouseenter = () => showTip(b, r);
        b.onmouseleave = () => tip.classList.remove('on');
        row.append(b); btns.push({ b, r });
      }
      maps.append(row);
    }
    paint();
  }
  async function showTip(b, r) {
    tip.textContent = '';
    const fig = async (k, lab) => {
      const f = mk('figure');
      const name = r.shots && r.shots[k];
      const rec = name ? (await S.get('img:' + name))['img:' + name] : null;
      if (rec) { const im = document.createElement('img'); im.src = rec.full || rec.thumb; f.append(im); }
      else f.append(mk('div', 'none', k === '100' && r.ended100 ? '1:00 전에 끝남' : k === '140' && !r.shots['140'] ? '투명벽 때 미니맵 없음' : '없음'));
      f.append(document.createTextNode('R' + r.n + ' · ' + (k === '100' && r.lab100 ? r.lab100 : lab + (k === '100' && r.planted100 ? ' (설치 후)' : '')) + ' · 점수 ' + r.sL + ':' + r.sR));
      return f;
    };
    tip.append(await fig('140', r.lab140 || '1:40'), await fig('130', r.lab130 || '1:30'), await fig('100', '1:00'));
    const rc = b.getBoundingClientRect();
    tip.classList.add('on');
    const tw = 595, th = 240;
    let x = rc.left + rc.width / 2 - tw / 2; x = Math.max(8, Math.min(x, innerWidth - tw - 8));
    let y = rc.top - th - 8; if (y < 8) y = rc.bottom + 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const curRound = () => {
    const v = vid(); if (!v || !btns.length) return -1;
    let k = -1;
    btns.forEach((x, i) => { if (v.currentTime >= x.r.jump - 0.5) k = i; });
    return k;
  };
  setInterval(() => {
    if (!btns.length || scanning) return;
    const k = curRound();
    btns.forEach((x, i) => x.b.classList.toggle('cur', i === k));
  }, 700);

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || !btns.length || scanning) return;
    const el = document.activeElement, tag = ((el || {}).tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (el && el.isContentEditable)) return;
    if (e.code !== 'BracketLeft' && e.code !== 'BracketRight') return;
    e.preventDefault(); e.stopPropagation();
    const v = vid(); if (!v) return;
    let k = curRound();
    if (e.code === 'BracketRight') k = Math.min(btns.length - 1, k + 1);
    else { if (k >= 0 && v.currentTime - btns[k].r.jump > 3) { /* 지금 라운드 처음으로 */ } else k = Math.max(0, k - 1); }
    if (k < 0) k = 0;
    v.currentTime = btns[k].r.jump; toast(mapLabel(btns[k].r.map, DATA && DATA.maps && DATA.maps[btns[k].r.map] && DATA.maps[btns[k].r.map].name) + ' R' + btns[k].r.n);
  }, true);

  /* 막대를 영상 바로 아래에 붙이기 (유튜브는 페이지 이동 없이 화면이 바뀜) */
  const mount = () => {
    const id = vidId();
    if (!id) { barHost.remove(); return; }
    const below = document.querySelector('ytd-watch-flexy #below') || document.querySelector('#below');
    if (below) { if (barHost.parentNode !== below || below.firstChild !== barHost) below.prepend(barHost); barHost.style.position = ''; }
    else if (!barHost.isConnected) {  // 유튜브 화면 구조를 못 찾으면 영상 바로 밑에
      const v = vid();
      if (v) v.insertAdjacentElement('afterend', barHost); else document.body.append(barHost);
    }
  };
  let curVid = null;
  async function refreshBar() {
    curVid = vidId();
    DATA = curVid ? await loadR(curVid) : null;
    draw(DATA ? DATA.rounds : []);
  }
  const onNav = async () => { mount(); if (vidId() !== curVid && !scanning) await refreshBar(); };
  window.addEventListener('yt-navigate-finish', onNav);
  setInterval(() => { mount(); if (vidId() !== curVid && !scanning) refreshBar(); }, 1500);
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && curVid && ch[key(curVid)] && !scanning) refreshBar();
  });
  await onNav();
})();
