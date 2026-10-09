const CFG_PRIVATE_M = '1A7KxdTL9CXCsYEux79IFTygpNQ5eEBpHU90mAER84xQ';   // 보내기 설정 비공개 시트 (board.js와 같게)
const S = chrome.storage.local;
try { S.set({ pageOpen: { page: 'manage', at: Date.now() } }); } catch (e) {}   // 1.11.1: 여는 쪽(유튜브 탭)에 '열렸어요' 알림
const DEF = { folder: '관전캡처', saveFiles: true, asr: 'auto', asrUrl: 'http://127.0.0.1:5005', autoBackup: true,
              voiceOn: false, mode: 'analyze', clean: false, pos: null };
const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r || { ok: false }); }));
const keysAll = async () => (S.getKeys ? await S.getKeys() : Object.keys(await S.get(null)));
const fmtBytes = (b) => b > 1e9 ? (b / 1e9).toFixed(2) + 'GB' : b > 1e6 ? (b / 1e6).toFixed(1) + 'MB' : Math.round(b / 1e3) + 'KB';
const fmtDate = (t) => t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

let prefs = {};
async function loadPrefs() {
  prefs = Object.assign({}, DEF, (await S.get('prefs')).prefs || {});
  $('asr').value = prefs.asr; $('asrUrl').value = prefs.asrUrl; $('folder').value = prefs.folder;
  $('asrWords').value = prefs.asrWords || ''; $('asrFix').value = prefs.asrFix || '';
  $('saveFiles').checked = !!prefs.saveFiles; $('autoBackup').checked = !!prefs.autoBackup;
  $('fPrev').textContent = prefs.folder;
}
let savedT;
async function savePrefs() {
  const cur = Object.assign({}, DEF, (await S.get('prefs')).prefs || {});
  cur.asr = $('asr').value;
  cur.asrUrl = ($('asrUrl').value.trim() || DEF.asrUrl).replace(/\/+$/, '');
  cur.folder = $('folder').value.trim() || DEF.folder;
  cur.saveFiles = $('saveFiles').checked; cur.autoBackup = $('autoBackup').checked;
  cur.asrWords = $('asrWords').value.trim(); cur.asrFix = $('asrFix').value.replace(/\s+$/, '');
  await S.set({ prefs: cur }); prefs = cur;
  $('fPrev').textContent = cur.folder;
  $('savedMark').classList.add('on'); clearTimeout(savedT); savedT = setTimeout(() => $('savedMark').classList.remove('on'), 1200);
  checkAsr();
}
['asr', 'saveFiles', 'autoBackup'].forEach(id => $(id).addEventListener('change', savePrefs));
['asrUrl', 'folder', 'asrWords', 'asrFix'].forEach(id => $(id).addEventListener('change', savePrefs));

async function checkAsr() {
  const r = await send({ t: 'ping' });
  $('stAsr').innerHTML = r.ok
    ? '<span class="ok">● 받아쓰기 서버 켜짐</span> — ' + prefs.asrUrl
    : (prefs.asr === 'local'
      ? '<span class="bad">● 받아쓰기 서버 꺼짐</span> — 서버를 켜거나 받아쓰기 방식을 "자동"으로 바꾸세요'
      : ((await S.get('asrBrowserBroken')).asrBrowserBroken
        ? '<span class="bad">● 받아쓰기 서버 꺼짐</span> — 이 브라우저는 자체 음성인식이 안 돼서 서버가 필요해요 (바탕화면 "받아쓰기 서버 재시작")'
        : '<span class="warn">● 받아쓰기 서버 없음</span> — 브라우저 음성인식으로 동작합니다'));
}

const MAPKO = { Abyss: '어비스', Ascent: '어센트', Bind: '바인드', Breeze: '브리즈', Corrode: '코로드', Fracture: '프랙처', Haven: '헤이븐', Icebox: '아이스박스', Lotus: '로터스', Pearl: '펄', Split: '스플릿', Summit: '서밋', Sunset: '선셋' };
const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const k in (attrs || {})) { if (k === 'style') e.style.cssText = attrs[k]; else e.setAttribute(k, attrs[k]); } kids.forEach(c => e.append(c)); return e; };
async function drawScraps(keys) {
  const rKeys = keys.filter(k => k.startsWith('rounds:'));
  const rAll = Object.values(await S.get(rKeys)).filter(r => r && r.vid).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const box = $('rndList'); box.textContent = '';
  $('rndCount').textContent = rAll.length ? '(' + rAll.length + '경기)' : '';
  if (!rAll.length) { box.textContent = '아직 없어요. 유튜브 경기 영상 아래 "라운드 자동 찾기"를 눌러 보세요.'; return; }
  const extra = await S.get(keys.filter(k => k.startsWith('board:') || k.startsWith('sent:') || k.startsWith('roster:')));
  const q = ($('rndQ').value || '').trim().toLowerCase();
  const tb = el('tbody');
  for (const r of rAll) {
    const rs = r.rounds || [];
    const maps = [...new Set(rs.map(x => x.map))].sort((a, b) => a - b);
    const title = r.title || r.vid;
    const mapNames = maps.map(m => { const nm = (r.maps && r.maps[m] && r.maps[m].name) || (extra['roster:' + r.vid + ':' + m] || {}).mapName; return nm ? (MAPKO[nm] || nm) : ''; });
    if (q && !(title + ' ' + mapNames.join(' ')).toLowerCase().includes(q)) continue;
    const tr = el('tr');
    const t1 = el('td', {}, el('a', { href: 'https://www.youtube.com/watch?v=' + r.vid, target: '_blank' }, '▶ ' + title.replace(/ — FULL MATCH — /, ' · ').replace(/VALORANT /, '')),
      el('div', { class: 'sub' }, '스캔 ' + fmtDate(r.updated) + ' · ', el('a', { href: 'analyze.html?v=' + encodeURIComponent(r.vid), target: '_blank' }, '분석 화면'), ' · ', el('a', { href: 'rounds.html?v=' + encodeURIComponent(r.vid), target: '_blank' }, '미니맵 모아보기')));
    const t2 = el('td');
    maps.forEach((m, i) => {
      const mr = rs.filter(x => x.map === m).sort((a, b) => a.n - b.n);
      const max = mr.length ? mr[mr.length - 1].n : 0, have = new Set(mr.map(x => x.n));
      const gone = []; for (let n = 1; n <= max; n++) if (!have.has(n)) gone.push(n);
      const no125 = mr.filter(x => !x.shots || !x.shots['130']).map(x => x.n);
      let boards = 0; for (const x of mr) for (const k of ['140', '130', '100']) if (extra['board:' + r.vid + ':' + m + ':' + x.n + ':' + k]) boards++;
      const shots = mr.reduce((a, x) => a + Object.keys(x.shots || {}).length, 0);
      const sent = extra['sent:' + r.vid + ':' + m];
      const line = el('div', { style: 'margin:2px 0' },
        el('a', { href: 'analyze.html?v=' + encodeURIComponent(r.vid) + '&m=' + m + '&r=' + ((mr[0] || {}).n || 1), target: '_blank' }, m + '맵' + (mapNames[i] ? '(' + mapNames[i] + ')' : '')),
        ' · ' + mr.length + '라운드' + (gone.length ? '' : ''),
        gone.length ? el('span', { class: 'bad' }, ' · 빠진 라운드 R' + gone.join(', R')) : '',
        no125.length ? el('span', { class: 'warn' }, ' · 1:25 없음 ' + no125.length) : '',
        el('span', { class: 'sub' }, ' · 보드 ' + boards + '/' + shots),
        sent ? el('span', { class: 'ok' }, ' · PPT 보냄 ' + fmtDate(sent.at)) : '',
        sent && sent.deck ? el('span', {}, ' · ', el('a', { href: sent.deck, target: '_blank' }, '정리 슬라이드 ↗')) : '');
      t2.append(line);
    });
    tr.append(t1, t2); tb.append(tr);
  }
  box.append(el('table', {}, el('thead', {}, el('tr', {}, el('th', { style: 'width:42%' }, '경기'), el('th', {}, '맵 (누르면 분석 화면)'))), tb));
}
$('rndQ') && $('rndQ').addEventListener('input', () => keysAll().then(drawScraps));
$('rndSync') && ($('rndSync').onclick = async () => {
  $('rndSyncMsg').textContent = ' 올리는 중…';
  try {   // 설정(_설정 탭)은 이 페이지에서 읽어 저장해 둠 — 백그라운드는 구글 로그인 쿠키를 못 쓸 때가 있음
    const p0 = (await S.get('prefs')).prefs || {};
    if (!p0.boardUrl || !p0.boardToken) {
      const rd = async (sid) => { try { const t = await (await fetch('https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=_설정', { credentials: 'include' })).text(); const o = {}; t.split('\n').forEach(l => { const m = /^"([^"]*)","([^"]*)"/.exec(l); if (m) o[m[1]] = m[2]; }); return o; } catch (e) { return {}; } };
      let o = (!p0.sheetId && CFG_PRIVATE_M) ? await rd(CFG_PRIVATE_M) : {};
      if (!o.boardUrl || !o.boardToken) o = await rd(p0.sheetId || '1qWUYBYoxLdzCXmmVG1rMeqKJ6y1gd0X9eUveR6ScBxU');
      if (o.boardUrl && o.boardToken) await S.set({ prefs: Object.assign({}, p0, { boardUrl: o.boardUrl, boardToken: o.boardToken }) });
    }
  } catch (e) {}
  const r = await send({ t: 'reportScan' });
  $('rndSyncMsg').textContent = r.ok ? ' 올림 ✓ 맵 ' + (r.maps || 0) + '개 — 시트 🏆 챔피언스 탭 미니맵 칸' : ' 실패: ' + (r.err || '');
});

async function drawStats() {
  const keys = await keysAll();
  const metaKeys = keys.filter(k => k.startsWith('meta:'));
  const metas = Object.values(await S.get(metaKeys)).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  $('stVids').textContent = metas.length;
  $('stScenes').textContent = metas.reduce((s, m) => s + (m.count || 0), 0);
  $('stImgs').textContent = keys.filter(k => k.startsWith('img:')).length;
  $('stBytes').textContent = fmtBytes(await S.getBytesInUse(null));
  const lb = (await S.get('lastBackupAt')).lastBackupAt;
  $('stBackup').textContent = lb ? '마지막 자동 백업: ' + fmtDate(lb) : '아직 자동 백업 기록 없음';

  // 스크랩한 경기 (라운드 자동 찾기 한 영상) — 맵마다 라운드·빠진 번호·보드·시트 보냄
  await drawScraps(keys);

  const tb = $('vids'); tb.textContent = '';
  if (!metas.length) { const tr = document.createElement('tr'); tr.innerHTML = '<td colspan="4" class="sub">아직 저장한 장면이 없어요. 유튜브 경기 영상을 열고 S를 눌러보세요.</td>'; tb.appendChild(tr); return; }
  for (const m of metas) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    const a = document.createElement('a'); a.href = 'https://www.youtube.com/watch?v=' + m.vid; a.target = '_blank'; a.textContent = m.title || m.vid;
    td1.appendChild(a);
    const td2 = document.createElement('td'); td2.textContent = (m.count || 0) + (m.pending ? ' (📱화면 대기 ' + m.pending + ')' : '');
    const td3 = document.createElement('td'); td3.textContent = fmtDate(m.updated);
    const td4 = document.createElement('td');
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '삭제';
    del.onclick = async () => {
      if (!confirm('"' + (m.title || m.vid) + '" 기록을 지울까요? (폴더에 받은 그림 파일은 남습니다)')) return;
      const log = (await S.get('log:' + m.vid))['log:' + m.vid] || [];
      const imgs = [];
      log.forEach(r => ((r.files && r.files.length) ? r.files : [r.file]).forEach(f => f && imgs.push('img:' + f)));
      await S.remove(['log:' + m.vid, 'meta:' + m.vid].concat(imgs));
      drawStats();
    };
    td4.appendChild(del);
    tr.append(td1, td2, td3, td4);
    tb.appendChild(tr);
  }
}

$('tabGo').onclick = async () => {
  const text = $('tabText').value;
  const r = await send({ t: 'importTablet', text });
  const list = $('tabList'); list.textContent = '';
  if (!r.ok) { $('tabMsg').textContent = r.err || '가져오기 실패'; return; }
  $('tabMsg').textContent = '북마크 ' + r.added + '개 추가' + (r.dup ? ' · 중복 ' + r.dup + '개 제외' : '');
  (r.videos || []).forEach(v => {
    const d = document.createElement('div'); d.style.margin = '4px 0';
    const a = document.createElement('a'); a.href = 'https://www.youtube.com/watch?v=' + v.vid; a.target = '_blank';
    a.style.color = 'var(--link)'; a.textContent = '▶ ' + (v.title || v.vid);
    d.append(a, document.createTextNode('  +' + v.added + '개  (열면 화면 자동 캡처)'));
    list.appendChild(d);
  });
  if (r.added) $('tabText').value = '';
  drawStats();
};

const msg = (t) => { $('bkMsg').textContent = t; };
$('bkMemo').onclick = async () => {
  msg('백업 중…');
  const r = await send({ t: 'backupNow' });
  msg(r.ok ? (r.saved ? '메모 ' + r.saved + '개 영상 백업 완료 → 다운로드/' + prefs.folder + '/_백업/' : '백업할 메모가 없어요') : '백업 실패: ' + (r.err || ''));
  drawStats();
};
$('bkFull').onclick = async () => {
  msg('전체 백업 만드는 중… (그림이 많으면 시간이 걸립니다)');
  const keys = (await keysAll()).filter(k => /^(log|meta|img|rounds|board|roster|ann|pics|scnHide|scnMove|tacSent|tags):/.test(k));   // 1.11.1: 분석 화면에 그린 것(ann)·붙인 스크린샷(pics)도
  const data = await S.get(keys);
  const blob = new Blob([JSON.stringify({ app: 'won-clip', kind: 'full', version: 1, at: new Date().toISOString(), data })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  try {
    await chrome.downloads.download({ url, filename: (prefs.folder || '관전캡처') + '/_백업/전체백업_' + day + '.json', conflictAction: 'uniquify', saveAs: false });
    msg('전체 백업 저장됨 (' + fmtBytes(blob.size) + ') → 다운로드/' + prefs.folder + '/_백업/');
  } catch (e) { msg('저장 실패: ' + e.message); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
$('bkLoad').onclick = () => $('bkFile').click();
$('bkFile').onchange = async () => {
  const f = $('bkFile').files[0]; if (!f) return;
  msg('불러오는 중…');
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== 'won-clip' || !j.data) throw new Error('이 도구의 백업 파일이 아니에요');
    const cur = await S.get(Object.keys(j.data));
    const put = {}; let vids = 0, imgs = 0, skipped = 0;
    for (const [k, v] of Object.entries(j.data)) {
      if (k.startsWith('img:')) { if (!cur[k]) { put[k] = v; imgs++; } continue; }
      if (k.startsWith('rounds:') || k.startsWith('board:')) { if (!cur[k] || (v.updated || 0) > (cur[k].updated || 0)) put[k] = v; continue; }
      if (k.startsWith('roster:')) { if (!cur[k]) put[k] = v; continue; }
      if (/^(ann|pics|scnHide|scnMove|tacSent|tags):/.test(k)) { if (!cur[k]) put[k] = v; continue; }   // 1.11.1: 없는 것만 되살림 (지금 것을 안 덮음)
      if (k.startsWith('meta:')) {
        const vidKey = 'log:' + k.slice(5);
        const mine = cur[k];
        if (!mine || (v.updated || 0) > (mine.updated || 0)) { put[k] = v; if (j.data[vidKey]) put[vidKey] = j.data[vidKey]; vids++; }
        else skipped++;
      }
    }
    await S.set(put);
    msg('복원 완료 — 영상 ' + vids + '개, 그림 ' + imgs + '장' + (skipped ? ' (이미 더 새 기록이 있는 영상 ' + skipped + '개는 건너뜀)' : ''));
  } catch (e) { msg('불러오기 실패: ' + e.message); }
  $('bkFile').value = '';
  drawStats();
};

chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && Object.keys(ch).some(k => k.startsWith('meta:') || k.startsWith('rounds:'))) drawStats(); });

(async () => { await loadPrefs(); drawStats(); checkAsr(); })();
