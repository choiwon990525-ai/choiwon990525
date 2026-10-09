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
  async function postBoard(body, retried) {   // 웹 앱으로 보내기 — 토큰이 바뀌었으면 설정을 새로 읽어 한 번 더
    const cfg = await sheetCfg();
    const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify(Object.assign({}, body, { token: cfg.token })), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
    const t = await res.text(); let j;
    try { j = JSON.parse(t); } catch (e) { throw new Error('웹 앱 응답을 못 읽었어요 (HTTP ' + res.status + ') — 구글 쪽 일시 오류일 수 있어요. 들어갔는지 시트를 먼저 확인하고 다시 보내 주세요'); }
    if (!j.ok && /토큰/.test(j.err || '') && !retried) { await clearCfg(); return postBoard(body, true); }
    return j;
  }
  root.WonNet = { SHEET_DEFAULT, CFG_PRIVATE, parseCSV, readCfgSheet, clearCfg, sheetCfg, postBoard };
})(typeof self !== 'undefined' ? self : this);
