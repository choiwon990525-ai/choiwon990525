/* 장면 캡처 도구 — 백그라운드
   - 파일 저장(다운로드 폴더/관전캡처/경기별 폴더)
   - 로컬 받아쓰기 서버 호출 (유튜브 페이지의 보안 제한을 피해서 여기서 호출)
   - 메모 자동 백업 */

importScripts('terms.js');   // WonTerms.fix — 받아쓰기 용어 교정

const DEFAULT_PREFS = { folder: '관전캡처', saveFiles: true, asr: 'auto', asrUrl: 'http://127.0.0.1:5005', autoBackup: true };
const getPrefs = async () => Object.assign({}, DEFAULT_PREFS, (await chrome.storage.local.get('prefs')).prefs || {});

const safeName = (s, max = 80) => {
  s = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
  s = s.slice(0, max).replace(/[. ]+$/, '');
  return s || 'untitled';
};

const toB64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

async function download(url, filename, overwrite) {
  return chrome.downloads.download({ url, filename, conflictAction: overwrite ? 'overwrite' : 'uniquify', saveAs: false });
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

/* 맵 그림 비교용 보이지 않는 페이지 (서비스 워커에는 그림 그리는 캔버스가 없어서) */
let offMaking = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offMaking) offMaking = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: '방송 미니맵 그림을 맵 그림과 비교해 무슨 맵인지 알아냄' }).catch(() => {});
  await offMaking; offMaking = null;
}

/* 1.11.1: 새 탭은 누른 탭과 같은 창, 바로 옆에 (어사이드는 '마지막으로 쓴 창'이 코치가 보는 창이 아닐 때가 있음) */
const nextTo = (sender, url) => {
  const t = sender && sender.tab, o = { url, active: true };
  if (t && t.windowId != null && t.windowId >= 0) { o.windowId = t.windowId; if (t.index != null) o.index = t.index + 1; if (t.id != null) o.openerTabId = t.id; }
  return o;
};
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    try {
      if (msg.t === 'dl') {
        const prefs = await getPrefs();
        const path = safeName(prefs.folder, 40) + '/' + msg.sub.split('/').map(p => safeName(p)).join('/');
        const id = await download(msg.url, path, !!msg.overwrite);
        reply({ ok: true, id, path });
      } else if (msg.t === 'dlText') {
        const prefs = await getPrefs();
        const path = safeName(prefs.folder, 40) + '/' + msg.sub.split('/').map(p => safeName(p)).join('/');
        const url = 'data:' + msg.mime + ';base64,' + toB64(msg.text);
        const id = await download(url, path, !!msg.overwrite);
        reply({ ok: true, id, path });
      } else if (msg.t === 'ping') {
        const prefs = await getPrefs();
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 2500);
        try { const r = await fetch(prefs.asrUrl + '/', { signal: ctl.signal }); reply({ ok: r.ok || r.status < 500 }); }
        catch (e) { reply({ ok: false, err: e.message }); }
        finally { clearTimeout(to); }
      } else if (msg.t === 'asr') {
        const prefs = await getPrefs();
        const bin = atob(msg.wav);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const fd = new FormData();
        fd.append('file', new Blob([u8], { type: 'audio/wav' }), 'memo.wav');
        fd.append('temperature', '0.0');
        fd.append('response_format', 'json');
        fd.append('language', 'ko');
        if (msg.prompt) fd.append('prompt', msg.prompt);
        const r = await fetch(prefs.asrUrl + '/inference', { method: 'POST', body: fd });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        reply({ ok: true, json: await r.json() });
      } else if (msg.t === 'importTablet') {
        reply(await importTablet(msg.text || ''));
      } else if (msg.t === 'backupNow') {
        reply(await autoBackup(true));
      } else if (msg.t === 'openBoard') {
        await chrome.tabs.create(nextTo(sender, chrome.runtime.getURL('board.html?v=' + encodeURIComponent(msg.vid) + '&m=' + (msg.m || 1) + '&r=' + (msg.r || 1) + '&k=140')));
        reply({ ok: true });
      } else if (msg.t === 'reportScan') {   // 스캔을 마친 영상 → 구글 시트 '_스캔' 탭 (🏆 챔피언스 탭 '미니맵' 칸)
        reply(await reportScans(msg.vid ? [msg.vid] : null));
      } else if (msg.t === 'openAnalyze') {   // 1.11.0 분석 화면 (보드·모아보기를 한 화면으로)
        await chrome.tabs.create(nextTo(sender, chrome.runtime.getURL('analyze.html?v=' + encodeURIComponent(msg.vid || '') + (msg.m ? '&m=' + msg.m : '') + (msg.r ? '&r=' + msg.r : '') + (msg.sec != null && !msg.r ? '&t=' + Math.floor(msg.sec) : '') + (sender && sender.tab ? '&yt=1' : ''))));
        reply({ ok: true });
      } else if (msg.t === 'openRounds') {
        await chrome.tabs.create(nextTo(sender, chrome.runtime.getURL('rounds.html' + (msg.vid ? '?v=' + encodeURIComponent(msg.vid) + (msg.m ? '&m=' + msg.m : '') : ''))));
        reply({ ok: true });
      } else if (msg.t === 'identifyMap') {   // 라운드 스캔 중: 미니맵 그림 → 무슨 맵인지 (그림 비교는 오프스크린 문서에서)
        await ensureOffscreen();
        const r = await chrome.runtime.sendMessage({ t: 'offIdentify', img: msg.img });
        reply(r || { ok: false });
      } else if (msg.t === 'openManage') {
        if (sender && sender.tab) await chrome.tabs.create(nextTo(sender, chrome.runtime.getURL('manage.html')));
        else chrome.runtime.openOptionsPage();
        reply({ ok: true });
      } else reply({ ok: false, err: 'unknown' });
    } catch (e) { reply({ ok: false, err: e.message }); }
  })();
  return true;
});

/* ---------- 태블릿 북마크 가져오기 ----------
   태블릿이 보낸 글(디스코드 등) 또는 유튜브 시점 링크들
   → 해당 영상 기록에 '화면 대기' 북마크로 추가. PC에서 그 영상을 열면 content.js 가 화면을 자동으로 채움 */
const pad2 = (n) => String(n).padStart(2, '0');
const fmtLab = (s) => pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60);
function renumber(log) {
  let main = 0, sub = 0;
  for (const r of log) {
    if (r.sub) { sub++; r.seq = String(main).padStart(3, '0') + '-' + sub; }
    else { main++; sub = 0; r.seq = String(main).padStart(3, '0'); }
  }
  return log;
}
/* 붙여넣은 글에서 북마크 뽑기
   1) 태블릿 형식:  ▶ 제목  다음 줄들에  0:03 <https://youtu.be/ID?t=3>
   2) 아무 유튜브 시점 링크: youtu.be/ID?t=83, youtube.com/watch?v=ID&t=1m23s, /live/ID?t=…  (디스코드에 올린 링크 그대로 복사해도 됨)
   3) 예전 형식: WONCLIP1|영상ID|제목|초,초 */
const tToSec = (t) => {
  if (!t) return null;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
};
function parseBookmarks(text) {
  const map = new Map(); // vid -> {title, secs:Map(sec -> memo)}
  const add = (vid, sec, title, memo) => {
    if (!vid || sec == null || isNaN(sec)) return;
    if (!map.has(vid)) map.set(vid, { title: '', secs: new Map() });
    const o = map.get(vid);
    const prev = o.secs.get(sec);
    o.secs.set(sec, [prev, memo].filter(Boolean).join(' / '));
    if (title && !o.title) o.title = title;
  };
  let curTitle = '', pendingTitle = '', ctxVid = null;
  const urlRe = /https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/([\w-]{11})|youtube\.com\/(?:watch\?[^\s<>]*?v=([\w-]{11})|live\/([\w-]{11})|shorts\/([\w-]{11})))[^\s<>]*/g;
  // 줄 맨 앞 시각: 12:34 / 1:02:03 (디스코드 시각 표시 '오후 3:12' 같은 건 제외)
  const timeRe = /^(?:\[?\s*)?((?:\d{1,2}:)?\d{1,2}:\d{2})(?!\d)\s*[-–—:·.)\]]?\s*(.*)$/;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const w = /^WONCLIP1\|([\w-]{6,})\|(.*)\|([\d,]+)$/.exec(line);
    if (w) { w[3].split(',').filter(Boolean).forEach(s => add(w[1], +s, w[2], '')); continue; }
    const t = /^[▶📺]\s*(.+)$/.exec(line);
    if (t && !/https?:\/\//.test(line)) { pendingTitle = t[1].replace(/\s*\(\d+개\)\s*$/, '').replace(/\s*\(이어서\)\s*$/, '').trim(); continue; }
    let m, hadLink = false; urlRe.lastIndex = 0;
    while ((m = urlRe.exec(line))) {
      hadLink = true;
      const vid = m[1] || m[2] || m[3] || m[4];
      if (vid !== ctxVid) { ctxVid = vid; curTitle = pendingTitle; pendingTitle = ''; }
      else if (pendingTitle) { curTitle = pendingTitle; pendingTitle = ''; }
      let sec = null;
      try { sec = tToSec(new URL(m[0]).searchParams.get('t') || new URL(m[0]).searchParams.get('start')); } catch (e) {}
      if (sec == null) continue; // 시점 없는 링크는 '이 영상' 표시로만 씀
      // 태블릿 형식 줄(0:03  <링크>)이 아니면 링크 밖 글자를 메모로
      const rest = line.replace(urlRe, ' ').replace(/[<>]/g, ' ').replace(/^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*/, '').replace(/\s+/g, ' ').trim();
      add(vid, sec, curTitle, rest);
      urlRe.lastIndex = m.index + m[0].length;
    }
    if (hadLink) continue;
    // 링크 없이 "12:34 킬조이 셋업" 처럼 적은 줄 → 바로 위에 올린 영상의 시점 + 메모
    if (ctxVid && !/(오전|오후|AM|PM|am|pm)/.test(line.slice(0, 12))) {
      const tm = timeRe.exec(line);
      if (tm) {
        const parts = tm[1].split(':').map(Number);
        const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
        if (parts[parts.length - 1] < 60 && (parts.length < 3 || parts[1] < 60)) add(ctxVid, sec, curTitle, tm[2].trim());
      }
    }
  }
  return [...map.entries()].map(([vid, o]) => ({ vid, title: o.title, secs: [...o.secs.keys()].sort((a, b) => a - b), memos: o.secs }));
}
async function importTablet(text) {
  const items = parseBookmarks(text);
  if (!items.length) return { ok: false, err: '가져올 시점이 없어요 — 유튜브 링크 뒤에 12:34 처럼 시각을 적거나, ?t= 붙은 링크를 붙여넣으세요' };
  const videos = [];
  let added = 0, dup = 0;
  for (const { vid, title: t0, secs, memos } of items) {
    const key = 'log:' + vid;
    const log = (await chrome.storage.local.get(key))[key] || [];
    const title = t0 || (log[0] && log[0].title) || '';
    const wasEmpty = !log.length;
    let n = 0;
    for (const sec of secs) {
      if (log.some(r => Math.abs((r.sec || 0) - sec) <= 1)) { dup++; continue; }
      const rec = { seq: '', time: fmtLab(sec), sec, url: 'https://www.youtube.com/watch?v=' + vid + '&t=' + sec + 's',
                 file: '', files: [], memo: (memos && memos.get(sec)) || '', title: title || vid, saved: new Date().toISOString(),
                 sub: false, bm: true, tablet: true, needShot: true };
      // 시간 순서 자리에 끼워 넣기: 이 시점보다 늦은 첫 '본 장면' 앞 (부연은 자기 본 장면에 붙은 채로 유지)
      const at = log.findIndex(r => !r.sub && (r.sec || 0) > sec);
      if (at < 0) log.push(rec); else log.splice(at, 0, rec);
      n++;
    }
    if (!n) { videos.push({ vid, title, added: 0 }); continue; }
    renumber(log);
    await chrome.storage.local.set({ [key]: log, ['meta:' + vid]: { vid, title: log[0].title || title || vid, count: log.length, updated: Date.now(), pending: log.filter(r => r.needShot).length, writer: 'tablet-import' } });
    added += n;
    videos.push({ vid, title, added: n });
  }
  return { ok: true, added, dup, videos };
}

/* ---------- 메모 자동 백업 ----------
   메모가 바뀌었을 때만, 다운로드/관전캡처/_백업/메모백업.json 을 덮어씀 (그림 제외, 가벼움)
   + 날짜별 사본 (하루 1개) */
async function autoBackup(force) {
  const prefs = await getPrefs();
  if (!prefs.autoBackup && !force) return { ok: true, skipped: 'off' };
  const allKeys = chrome.storage.local.getKeys ? await chrome.storage.local.getKeys() : Object.keys(await chrome.storage.local.get(null));
  // 메모 + 라운드 목록·보드·조합(그림은 빼서 가벼움 — 미니맵 그림은 경기 폴더/라운드/에 파일로 있음)
  const isBk = (k) => /^(log|meta|rounds|board|roster|ann|scnHide|scnMove|tacSent|tags):/.test(k);   // 1.11.1: 분석 화면에 그린 것(ann)·PPT 빼기·옮긴 장면·텍틱 보낸 기록도 (스크린샷 pics는 커서 전체 백업에만)
  const want = allKeys.filter(isBk).concat(['lastBackupSig']);
  const all = await chrome.storage.local.get(want);
  const data = {};
  let sig = 0;
  for (const k of Object.keys(all)) {
    if (isBk(k)) {
      data[k] = all[k];
      if (!k.startsWith('log:')) sig += ((all[k] && all[k].updated) || 0) % 1e9 + ((all[k] && all[k].count) || 0) + (/^(roster|ann|scnHide|scnMove|tacSent|tags):/.test(k) ? JSON.stringify(all[k]).length : 0);
    }
  }
  const keys = Object.keys(data).filter(k => k.startsWith('log:') || k.startsWith('rounds:'));
  if (!keys.length) return { ok: true, skipped: 'empty' };
  const sigStr = keys.length + ':' + sig;
  if (!force && all.lastBackupSig === sigStr) return { ok: true, skipped: 'same' };
  const payload = JSON.stringify({ app: 'won-clip', kind: 'memo', version: 2, at: new Date().toISOString(), data });
  const url = 'data:application/json;base64,' + toB64(payload);
  const folder = safeName(prefs.folder, 40);
  await download(url, folder + '/_백업/메모백업.json', true);
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  await download(url, folder + '/_백업/날짜별/메모백업_' + day + '.json', true);
  await chrome.storage.local.set({ lastBackupSig: sigStr, lastBackupAt: Date.now() });
  return { ok: true, saved: keys.length };
}

/* 저장소에서 이름이 prefix로 시작하는 키만 — 그림(img:)까지 통째로 읽지 않게 (1.11.0: 확장 새로고침 때 무거웠던 곳) */
async function keysWith(prefix) {
  const L = chrome.storage.local;
  const ks = L.getKeys ? await L.getKeys() : Object.keys(await L.get(null));
  return ks.filter(k => k.startsWith(prefix));
}
/* 예전에 받아쓴 장면 메모도 한 번 용어 교정 (원문은 memoRaw에 보관, 이미 고친 장면은 건너뜀) — 사전 버전이 오르면 다시 */
async function fixOldMemos() {
  const v = WonTerms.version, done = (await chrome.storage.local.get('termsFixed')).termsFixed || 0;
  if (done >= v) return 0;
  const all = await chrome.storage.local.get(await keysWith('log:')), upd = {}; let n = 0;
  for (const [k, arr] of Object.entries(all)) {
    if (!k.startsWith('log:') || !Array.isArray(arr)) continue;
    let ch = false;
    for (const r of arr) {
      if (!r || !r.memo) continue;
      if ((r.termsV || 0) >= v) continue;
      const f = WonTerms.fix(r.memo);   // 지금 메모에 바로 적용 (코치가 고친 글도 지켜짐 — 틀린 용어만 바뀜)
      if (f !== r.memo) { if (!r.memoRaw) r.memoRaw = r.memo; r.memo = f; n++; }
      r.termsV = v; ch = true;
    }
    if (ch) upd[k] = arr;
  }
  upd.termsFixed = v;
  await chrome.storage.local.set(upd);
  return n;
}
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create('autobackup', { periodInMinutes: 30 }); setTimeout(() => reportScans(null).catch(() => {}), 3000); fixOldMemos().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('autobackup', { periodInMinutes: 30 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'autobackup') autoBackup(false).catch(() => {}); });

/* ---------- 스캔 기록 → 구글 시트 ----------
   레퍼런스 보드 웹 앱(시트 _설정 탭의 boardUrl·boardToken)에 {kind:'scan'} 으로 보냄. 영상×맵: 라운드 수·빠진 라운드·1:25 없는 수·맵 이름 */
const SHEET_DEFAULT = '1qWUYBYoxLdzCXmmVG1rMeqKJ6y1gd0X9eUveR6ScBxU';
const CFG_PRIVATE = '1A7KxdTL9CXCsYEux79IFTygpNQ5eEBpHU90mAER84xQ';   // 보내기 설정 비공개 시트 (board.js와 같게)
async function readCfgSheet(sid) {
  try {
    const r = await fetch('https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=_설정', { credentials: 'include' });
    if (!r.ok) return {};
    const o = {}; (await r.text()).split('\n').forEach(l => { const m = /^"([^"]*)","([^"]*)"/.exec(l); if (m) o[m[1]] = m[2]; }); return o;
  } catch (e) { return {}; }
}
async function sheetCfg() {
  const prefs = await getPrefs();
  if (prefs.boardUrl && prefs.boardToken) return { url: prefs.boardUrl, token: prefs.boardToken };
  let o = (!prefs.sheetId && CFG_PRIVATE) ? await readCfgSheet(CFG_PRIVATE) : {};
  if (!o.boardUrl || !o.boardToken) o = await readCfgSheet(prefs.sheetId || SHEET_DEFAULT);
  if (!o.boardUrl || !/^https:/.test(o.boardUrl) || !o.boardToken) throw new Error('시트 보내기 설정(_설정 탭)이 없어요 — 보드 화면에서 한 번 시트로 보내면 설정이 저장돼요');
  await chrome.storage.local.set({ prefs: Object.assign({}, prefs, { boardUrl: o.boardUrl, boardToken: o.boardToken }) });
  return { url: o.boardUrl, token: o.boardToken };
}
function scanSummary(rec) {
  const rs = rec.rounds || [], maps = [...new Set(rs.map(x => x.map))].sort((a, b) => a - b);
  return { vid: rec.vid, title: rec.title || '', updated: rec.updated || Date.now(), maps: maps.map(m => {
    const mr = rs.filter(x => x.map === m).sort((a, b) => a.n - b.n), have = new Set(mr.map(x => x.n)), max = mr.length ? mr[mr.length - 1].n : 0, gone = [];
    for (let n = 1; n <= max; n++) if (!have.has(n)) gone.push(n);
    return { m, rounds: mr.length, gone, no125: mr.filter(x => !x.shots || !x.shots['130']).length, name: (rec.maps && rec.maps[m] && rec.maps[m].name) || '' };
  }) };
}
async function reportScans(vids) {
  try {
    if ((await getPrefs()).scanReport === false || (self.navigator && navigator.webdriver)) return { ok: true, off: true };   // 자동 시험 브라우저에서는 안 보냄
    const rk = (await keysWith('rounds:')).filter(k => !vids || vids.includes(k.slice(7))), all = rk.length ? await chrome.storage.local.get(rk) : {};
    const recs = rk.map(k => all[k]).filter(r => r && r.vid && (r.rounds || []).length);
    if (!recs.length) return { ok: true, maps: 0 };
    const post = async () => { const cfg = await sheetCfg(); const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ token: cfg.token, kind: 'scan', scans: recs.map(scanSummary) }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' }); return res.json(); };
    let j = await post();
    if (!j.ok && /토큰/.test(j.err || '')) { const p = await getPrefs(); delete p.boardUrl; delete p.boardToken; await chrome.storage.local.set({ prefs: p }); j = await post(); }   // 비밀번호가 바뀌었으면 설정을 새로 읽어 한 번 더
    if (j.ok) await chrome.storage.local.set({ lastScanReport: Date.now() });
    return j;
  } catch (e) { return { ok: false, err: e.message }; }
}
