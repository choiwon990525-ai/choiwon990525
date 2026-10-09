/* 구글 시트·레퍼런스 보드 웹 앱 연결 — 보드·분석 화면·텍틱 창이 같이 씀 (1.11.0에서 board.js에서 떼어 냄)
   설정 읽기 순서: prefs 캐시 → 비공개 설정 시트 _설정(코치 계정만 읽힘) → 원본 시트 _설정 */
(function (root) {
  const S = chrome.storage.local;
  const SHEET_DEFAULT = '1qWUYBYoxLdzCXmmVG1rMeqKJ6y1gd0X9eUveR6ScBxU';
  const CFG_PRIVATE = '1A7KxdTL9CXCsYEux79IFTygpNQ5eEBpHU90mAER84xQ';   // 보내기 설정(웹 앱 주소·비밀번호) 비공개 시트 — 공유판은 빈 글자
  function parseCSV(t) {
    const rows = []; let row = [], cur = '', q2 = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q2) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q2 = false; } else cur += c; }
      else if (c === '"') q2 = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  async function readCfgSheet(sid) {   // 그 시트의 _설정 탭 (key·value) — 못 읽으면 {}
    try {
      const r = await fetch('https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=_설정', { credentials: 'include' });
      if (!r.ok) return {};
      const o = {}; parseCSV(await r.text()).forEach(x => { o[x[0]] = x[1]; }); return o;
    } catch (e) { return {}; }
  }
  async function clearCfg() { const p = (await S.get('prefs')).prefs || {}; delete p.boardUrl; delete p.boardToken; await S.set({ prefs: p }); }
  async function sheetCfg() {
    const prefs = (await S.get('prefs')).prefs || {};
    if (prefs.boardUrl && prefs.boardToken) return { url: prefs.boardUrl, token: prefs.boardToken };
    let o = (!prefs.sheetId && CFG_PRIVATE) ? await readCfgSheet(CFG_PRIVATE) : {};
    if (!o.boardUrl || !o.boardToken) o = await readCfgSheet(prefs.sheetId || SHEET_DEFAULT);
    if (!o.boardUrl || !/^https:/.test(o.boardUrl) || !o.boardToken) throw new Error('시트에 보내기 설정이 아직 없어요 (Apps Script 연결 필요)');
    await S.set({ prefs: Object.assign({}, prefs, { boardUrl: o.boardUrl, boardToken: o.boardToken }) });   // 다음부터(스캔 기록 보내기 포함) 바로 씀
    return { url: o.boardUrl, token: o.boardToken };
  }
  /* 1.11.7: 웹 앱 보내기는 쿠키 없이(credentials 'omit') — 웹 앱은 '모든 사용자' + 비밀번호라 로그인이 필요 없음.
     10-09 코치 브라우저에서 시트 쪽은 요청을 다 처리했는데(실행 기록 '완료됨') 확장이 받은 응답이 HTTP 404 → 응답을 못 받으면
     ① 저장해 둔 주소·비밀번호를 버리고 시트에서 다시 읽어 주소가 바뀌었으면 한 번 더 ② 읽기 요청(탭 목록)은 한 번 더 + 백그라운드로도 한 번 더
     ③ 쓰기 요청(그림 넣기)은 두 번 들어갈 수 있어 다시 안 보냄 — 마지막 상황은 netLast에 남김(비밀번호는 안 남김) */
  const READONLY = /^(tacticTabs|deckSlides|tacticLinks)$/;   // 1.11.8: 슬라이드 장 읽기·링크 넣기도 두 번 해도 같음
  const parseJ = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };
  const hostOf = (u) => { try { const x = new URL(u); return x.host.replace(/^script\./, '') + (/\/echo/.test(x.pathname) ? '/echo' : /\/exec$/.test(x.pathname) ? '/exec' : ''); } catch (e) { return '?'; } };
  async function rawPost(cfg, body) {
    const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify(Object.assign({}, body, { token: cfg.token })), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', credentials: 'omit', cache: 'no-store' });
    return { status: res.status, url: res.url, text: await res.text() };
  }
  function viaBg(body) {   // 백그라운드(서비스 워커)가 대신 보냄 — 읽기 요청만
    return new Promise((ok) => { try { chrome.runtime.sendMessage({ t: 'webPost', body }, (r) => { void chrome.runtime.lastError; ok(r && r.text != null ? r : null); }); } catch (e) { ok(null); } });
  }
  async function postBoard(body, retried) {   // 웹 앱으로 보내기 — 토큰이 바뀌었으면 설정을 새로 읽어 한 번 더
    let cfg = await sheetCfg(), r = await rawPost(cfg, body), j = parseJ(r.text);
    if (!j) {
      const url0 = cfg.url;
      const first = { status: r.status, host: hostOf(r.url) }, ro = READONLY.test(body.kind || ''); let how = 'none';
      await clearCfg(); let cfg2 = cfg; try { cfg2 = await sheetCfg(); } catch (e) {}
      if (cfg2.url !== cfg.url || ro) { if (ro && cfg2.url === cfg.url) await new Promise(z => setTimeout(z, 800)); cfg = cfg2; r = await rawPost(cfg, body); j = parseJ(r.text); how = cfg2.url !== url0 ? 'newUrl' : 'again'; }
      if (!j && ro) { const b = await viaBg(body); if (b) { r = b; j = parseJ(b.text); how = 'background'; } }
      try { await S.set({ netLast: { at: Date.now(), kind: body.kind || '', first, last: { status: r.status, host: hostOf(r.url) }, how, ok: !!j } }); } catch (e) {}
      if (!j) throw new Error('웹 앱 응답을 못 읽었어요 (HTTP ' + r.status + ' · ' + hostOf(r.url) + ') — 구글 쪽 일시 오류일 수 있어요. 들어갔는지 시트를 먼저 확인하고 다시 보내 주세요');
    }
    if (!j.ok && /토큰/.test(j.err || '') && !retried) { await clearCfg(); return postBoard(body, true); }
    return j;
  }
  root.WonNet = { SHEET_DEFAULT, CFG_PRIVATE, parseCSV, readCfgSheet, clearCfg, sheetCfg, postBoard };
})(typeof self !== 'undefined' ? self : this);
