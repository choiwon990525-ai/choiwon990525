/* 분석 화면 (1.11.0) — 보드·미니맵 모아보기를 한 화면으로
   주소: analyze.html?v=영상ID&m=맵&r=라운드
   한 라운드 = 아래 그림 줄(빈 맵 보드 · 방송 미니맵 투명벽·1:25·1:00 · 영상에서 찍은 장면 · 붙인 스크린샷) → 고르면 가운데에 크게, 그 위에 바로 그리기
   저장은 예전 그대로 씀: rounds:<영상>(라운드 메모 note·미니맵 shots) · log:<영상>(장면 메모) · pics:<영상>:<맵>:<라운드>(스크린샷)
                         scnHide:<영상>(PPT에서 뺄 장면) · scnMove:<영상>(옆 라운드로 옮긴 장면) · tacSent:<영상>(텍틱 시트로 보낸 기록)
   새로 생긴 저장: ann:<영상>:<맵>:<라운드> = { 그림키: 그린 것 } (ann.js) · bimg:<영상>:<맵>:<라운드>:140 = 빈 맵 보드 미리보기 그림
   1.11.2: tags:<영상> = { '맵:라운드': 텍틱 이름 } · 모아 보기(G) = 한 팀 공격/수비 라운드의 같은 순간 미니맵 격자 · 스샷 칸 ×·Delete 지우기(되돌리기)
   PPT로 보내기·보드 미리보기 그림은 보이지 않는 보드 페이지(board.html?act=send|thumbs)가 대신 만듦 — 보드 그리는 코드가 한 곳에만 있게
   1.11.6: 장면(방송 화면)은 미니맵만 잘라 크게(M으로 화면 전체 ↔ 미니맵) — view:<영상> = { 그림키: 'mm'|'full' }, 미니맵에 그린 것은 '그림키#mm'
           텍틱 이름 자동 = 라운드 첫 장면 메모 (tags에 코치가 적은 이름이 우선, ''은 '이름 없음')
           📋 텍틱 시트로 = 라운드마다 텍틱 시트 '템플릿' 탭 복제 → 탭 이름 = 텍틱 이름 · 그림만 차례로 (tacSent의 'round:맵:라운드') */
const TK_ON = true;   // 📋 텍틱 시트로 (공유판은 끔)
const S = chrome.storage.local;
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const VID = q.get('v');
let MAPI = +(q.get('m') || 0), RN = +(q.get('r') || 0);
const TSEC = q.has('t') && !q.get('r') ? +q.get('t') : null;   // 유튜브 도구 막대 '분석 열기': 누른 순간의 영상 시각 → 그 라운드
try { S.set({ pageOpen: { page: 'analyze', vid: VID, at: Date.now() } }); } catch (e) {}   // 1.11.1: 여는 쪽(유튜브 탭)에 '열렸어요' 알림
if (q.has('yt')) setTimeout(() => {   // 유튜브에서 열었는데 뒤쪽 탭·다른 창에 열려 안 보이면 앞으로 (어사이드)
  if (document.visibilityState !== 'hidden') return;
  try { chrome.tabs.getCurrent(t => { if (!t) return; chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); }); } catch (e) {}
}, 900);
let ROUNDS = null, R = null, ROSTER = null, LOG = [], MOVES = {}, HIDES = {}, PICS = [], ANN = {}, TILES = [], PICKEYS = new Set();
let SEL = 0, CMP = -1, FOCUS = 0, TWO = false, TOOL = 'sel', COLOR = WonAnn.COLORS[0];
let TAGS = {};   // 1.11.2 텍틱 이름: tags:<영상> = { '맵:라운드': 'A 스플릿' } — 모아 보기에서 이 이름으로 걸러 봄
let VIEW = {};   // 1.11.6 장면·스크린샷 보기: view:<영상> = { 그림키: 'mm'(미니맵만 크게) | 'full'(화면 전체) }

const pad = (n) => String(n).padStart(2, '0');
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(x); };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const other = (t) => t === 'A' ? 'B' : 'A';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mapNameOf = (m) => (ROUNDS && ROUNDS.maps && ROUNDS.maps[m] && ROUNDS.maps[m].name) || '';
const mapLabel = (m, name) => m + '맵' + (name ? '(' + WonNames.mapKo(name) + ')' : '');
const ytAt = (sec) => 'https://www.youtube.com/watch?v=' + VID + '&t=' + Math.max(0, Math.floor(sec)) + 's';
const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('그림을 못 불러옴')); im.src = src; });
let msgT = null;
function msg(t, err, stay) {
  const m = $('msg'); m.classList.toggle('err', !!err);
  if (t && typeof t === 'object') { m.textContent = ''; m.append(t); } else m.textContent = t || '';
  clearTimeout(msgT); if (t && !stay && !err) msgT = setTimeout(() => { if (!BUSY) m.textContent = ''; }, 9000);
}

/* ---------- 팀·공수 (보드와 같은 계산) ---------- */
const teamName = (t) => (ROSTER && ROSTER.teams && ROSTER.teams[t] && ROSTER.teams[t].name) || (t === 'A' ? '왼쪽 팀' : '오른쪽 팀');
function defTeam(r) {   // 이 라운드 수비 팀 — 점수판 색(defSide) + 왼쪽 팀, 없으면 전반 수비 팀 기준 교대
  if (!ROSTER) return 'A';
  if (r && r.defSide && ROSTER.left) return r.defSide === 'L' ? ROSTER.left : other(ROSTER.left);
  const fd = ROSTER.firstDef || 'A', swap = r.n > 24 ? (r.n % 2 === 0) : r.n > 12;
  return swap ? other(fd) : fd;
}
const scoreAB = (r) => (ROSTER && ROSTER.left === 'B') ? [r.sR, r.sL] : [r.sL, r.sR];   // 점수판 왼쪽:오른쪽 → A:B
const winner = (r) => { if (!r.win) return null; const L = (ROSTER && ROSTER.left) || 'A'; return r.win === 'L' ? L : other(L); };
function teams() {   // 텍틱 창: 두 팀 조합 (한글 요원 이름)
  if (!ROSTER || !ROSTER.teams) return [];
  return ['A', 'B'].map(t => { const T = ROSTER.teams[t] || {}; return { key: t, name: T.name || t, agents: (T.agents || []).filter(Boolean).map(WonNames.agentKo) }; }).filter(t => t.agents.length);
}
const labOf = (r, k) => k === '140' ? (r.lab140 || '투명벽') : k === '130' ? (r.lab130 || '1:25') : (r.lab100 || '1:00');
const shotSec = (r, k) => {   // 그 미니맵이 영상 몇 초인지 (라운드 시작 t0 = 1:40)
  const t0 = r.t0 != null ? r.t0 : (r.jump || 0) + 5, m = /(\d):(\d\d)/.exec(String(labOf(r, k))), cs = m ? +m[1] * 60 + +m[2] : null;
  return Math.floor(t0 + (k === '140' ? (cs != null && cs <= 100 ? 100 - cs : 1) : k === '130' ? (cs != null ? 100 - cs : 15) : (cs != null ? 100 - cs : 40)));
};

/* ---------- 열기 ---------- */
async function init() {
  if (!VID) { $('main').innerHTML = '<div id="empty">영상 정보가 없어요 — 유튜브 영상 아래 라운드 막대의 \'분석 열기\'로 들어오세요</div>'; return; }
  const got = await S.get(['rounds:' + VID, 'log:' + VID, 'scnMove:' + VID, 'scnHide:' + VID, 'tags:' + VID, 'view:' + VID]);
  TAGS = got['tags:' + VID] || {}; VIEW = got['view:' + VID] || {};
  ROUNDS = got['rounds:' + VID];
  LOG = got['log:' + VID] || []; MOVES = got['scnMove:' + VID] || {}; HIDES = got['scnHide:' + VID] || {};
  if (!ROUNDS || !(ROUNDS.rounds || []).length) {
    $('ttl').textContent = (LOG[0] && LOG[0].title) || VID;
    $('main').innerHTML = '<div id="empty"><b style="color:var(--navy);font-size:15px">이 영상은 아직 라운드를 찾지 않았어요</b><span>유튜브 영상 아래 라운드 막대에서 \'라운드 자동 찾기\'를 먼저 눌러 주세요 (경기당 5~10분)</span></div>';
    return;
  }
  document.title = (ROUNDS.title || VID) + ' — 분석';
  $('ttl').textContent = ROUNDS.title || VID;
  if (TSEC != null) {   // 그 시각에 진행 중이던 라운드 (라운드 시작 조금 전 jump부터 그 라운드)
    const rs = ROUNDS.rounds.slice().sort((a, b) => (a.jump || 0) - (b.jump || 0));
    let cur = rs[0]; rs.forEach(r => { if (TSEC >= (r.jump || 0) - 0.5) cur = r; });
    if (cur) { MAPI = cur.map; RN = cur.n; }
  }
  const maps = [...new Set(ROUNDS.rounds.map(r => r.map))].sort((a, b) => a - b);
  $('mapSel').textContent = '';
  maps.forEach(m => $('mapSel').add(new Option(mapLabel(m, mapNameOf(m)), m)));
  if (!maps.includes(MAPI)) MAPI = maps[0];
  try { if (S.getKeys) (await S.getKeys()).forEach(k => { if (k.startsWith('pics:' + VID + ':')) PICKEYS.add(k); }); } catch (e) {}
  WonTactic.setup({ vid: () => VID, where: () => ({ map: MAPI, n: RN }), mapKo: () => WonNames.mapKo((ROSTER && ROSTER.mapName) || mapNameOf(MAPI)), teams, msg: (t) => msg(t), onSent: (src) => { drawStrip(); drawItem(); if (src == null) afterTacticRounds(); } });
  await WonTactic.reload();
  buildTools();
  await openMap(MAPI, RN);
}
async function openMap(m, n) {
  MAPI = m; $('mapSel').value = m;
  const rk = 'roster:' + VID + ':' + m;
  ROSTER = (await S.get(rk))[rk] || null;
  const A = teamName('A'), B = teamName('B');
  $('sub').textContent = A + ' vs ' + B + ' · ' + mapLabel(m, (ROSTER && ROSTER.mapName) || mapNameOf(m));
  const rs = roundsOfMap();
  await openRound(rs.find(r => r.n === n) ? n : (rs[0] ? rs[0].n : 1));
  if (GRID) drawGrid();
  drawDeckLink();
  setTimeout(() => thumbsIfNeeded(), 1500);
  setTimeout(() => fillDeckLinks(false).catch(() => {}), 2500);   // 1.11.8 PPT를 보낸 맵이면 텍틱 라운드 탭에 정리 슬라이드 링크 (빠진 것만)
}
const roundsOfMap = () => ROUNDS.rounds.filter(r => r.map === MAPI).sort((a, b) => a.n - b.n);
async function openRound(n, keepKey) {
  await flushSaves();
  RN = n; R = roundsOfMap().find(r => r.n === n) || roundsOfMap()[0]; RN = R.n;
  history.replaceState(null, '', '?v=' + encodeURIComponent(VID) + '&m=' + MAPI + '&r=' + RN);
  $('yt').href = ytAt(R.t0 != null ? R.t0 - 2 : R.jump);
  drawRounds(); drawHead(); drawTag();
  noteAt = [MAPI, RN]; $('note').value = R.note || '';
  await buildTiles();
  let i = keepKey ? TILES.findIndex(t => t.key === keepKey) : -1;
  if (i < 0) i = TILES.findIndex(t => t.kind === 'mm' && t.k === '130');
  if (i < 0) i = TILES.findIndex(t => t.url);
  SEL = Math.max(0, i); CMP = -1; FOCUS = 0;
  if (TWO) CMP = nextWithImg(SEL);
  drawStrip(); await showAll(); drawItem();
}

/* ---------- 왼쪽 라운드 목록 ---------- */
function drawRounds() {
  const box = $('rlist'); box.textContent = '';
  const rs = roundsOfMap(), scn = scnMap();
  $('rcount').textContent = rs.length + 'R';
  rs.forEach(r => {
    if (r.n === 13 || r.n === 25) { const h = document.createElement('div'); h.className = 'half'; h.textContent = r.n === 13 ? '후반' : '연장'; box.append(h); }
    const def = defTeam(r), [a, b] = scoreAB(r), w = winner(r), ns = (scn.get(r) || []).length, hasPic = PICKEYS.has('pics:' + VID + ':' + MAPI + ':' + r.n);
    const row = document.createElement('div'); row.className = 'rrow' + (r.n === RN ? ' on' : '') + (GRID && GSET.has(r.n) ? ' ing' : ''); row.dataset.n = r.n;
    const sentR = WonTactic.sent('round:' + MAPI + ':' + r.n);
    const meta = (tagOf(r) ? '<span class="tg' + (isAutoTag(r) ? ' auto' : '') + '"' + (isAutoTag(r) ? ' title="첫 장면 메모에서 자동"' : '') + '>' + esc(tagOf(r)) + '</span> ' : '') + [ns ? '장면 ' + ns : '', hasPic ? '스샷' : '', (r.note || '').trim() ? '<b>메모</b>' : '', sentR ? '<span title="텍틱 시트 탭: ' + esc(sentR.tab) + '">📋</span>' : '', w ? esc(teamName(w)) + ' 승' : ''].filter(Boolean).join(' · ');
    row.innerHTML = '<span class="rn">R' + r.n + '</span><span class="who"><i style="background:var(--def)"></i>' + esc(teamName(def)) + ' 수비</span><span class="sc">' + a + ':' + b + '</span>' +
      '<span class="meta">' + (meta || '&nbsp;') + '</span>';
    row.onclick = () => { if (GRID) toggleGrid(false); openRound(r.n); };
    box.append(row);
  });
  const on = box.querySelector('.rrow.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
function drawHead() {
  const r = R, def = defTeam(r), atk = other(def), [a, b] = scoreAB(r), w = winner(r);
  const comp = (t) => ((ROSTER && ROSTER.teams && ROSTER.teams[t] && ROSTER.teams[t].agents) || []).filter(Boolean).map(WonNames.agentKo).join(' · ');
  const half = r.n <= 12 ? '전반' : r.n <= 24 ? '후반' : '연장';
  $('rhead').innerHTML = '<div class="big"><b>R' + r.n + '</b><span>' + half + ' · ' + mapLabel(MAPI, (ROSTER && ROSTER.mapName) || mapNameOf(MAPI)) + '</span></div>' +
    '<div class="score">' + esc(teamName('A')) + ' <span class="n">' + a + ' : ' + b + '</span> ' + esc(teamName('B')) + (w ? ' <span class="chip">' + esc(teamName(w)) + ' 승</span>' : '') + '</div>' +
    '<div class="score"><span class="chip"><i style="background:var(--def)"></i>수비 ' + esc(teamName(def)) + '</span><span class="chip"><i style="background:var(--atk)"></i>공격 ' + esc(teamName(atk)) + '</span></div>' +
    (comp('A') || comp('B') ? '<div class="comp">' + esc(teamName('A')) + ': ' + esc(comp('A') || '—') + '<br>' + esc(teamName('B')) + ': ' + esc(comp('B') || '—') + '</div>' : '');
}

/* ---------- 그림 줄 ---------- */
async function buildTiles() {
  const r = R, pk = 'pics:' + VID + ':' + MAPI + ':' + RN, ak = WonAnn.key(VID, MAPI, RN), bk = 'board:' + VID + ':' + MAPI + ':' + RN + ':140', ik = 'bimg:' + VID + ':' + MAPI + ':' + RN + ':140';
  const shots = r.shots || {}, scenes = scnMap().get(r) || [];
  const fileOf = (x) => (x.files && x.files[0]) || x.file;
  const keys = [pk, ak, bk, ik].concat(['140', '130', '100'].filter(k => shots[k]).map(k => 'img:' + shots[k]), scenes.map(fileOf).filter(Boolean).map(f => 'img:' + f));
  const got = await S.get(keys);
  PICS = got[pk] || []; ANN = got[ak] || {};
  if (PICS.length) PICKEYS.add(pk); else PICKEYS.delete(pk);
  const T = [], bd = got[bk], bi = got[ik];
  // 1.11.5: 오프닝 자동 보드는 안 보여 줌 (코치 10-04) — 직접 만든(손댐·대조 끝) 보드만 첫 칸에
  if (manualB(bd)) T.push({ kind: 'board', key: 'board', k: '140', lab: '빈 맵 보드', url: bi && bi.img, thumb: bi && bi.img, has: true, stale: !bi || bi.sig !== WonAnn.sig(bd), n: (bd.items || []).length });
  ['140', '130', '100'].forEach(k => { if (!shots[k]) return; const rec = got['img:' + shots[k]]; T.push({ kind: 'mm', k, key: 'mm:' + k, lab: labOf(r, k), url: rec && (rec.full || rec.thumb), thumb: rec && (rec.thumb || rec.full), manual: !!(r.manual && r.manual[k]), sec: shotSec(r, k) }); });
  scenes.forEach(x => { const f = fileOf(x), rec = f ? got['img:' + f] : null, sk = WonScenes.key(x); T.push({ kind: 'scn', key: 'scn:' + sk, sk, x, lab: '장면 ' + x.seq, sec: x.sec, url: rec && (rec.full || rec.thumb), thumb: rec && (rec.thumb || rec.full), hide: HIDES[sk] || null, moved: !!MOVES[sk] }); });
  PICS.forEach(p => T.push({ kind: 'pic', key: 'pic:' + p.id, p, lab: '스크린샷', url: p.img, thumb: p.img, hide: p.hide || null }));
  // 1.11.6 방송 화면(16:9) 장면·스크린샷은 미니맵만 잘라 크게 볼 수 있음 — 장면은 미니맵이 기본, 스크린샷은 화면 전체가 기본 (M으로 바꿈)
  await Promise.all(T.filter(t => (t.kind === 'scn' || t.kind === 'pic') && t.url).map(async t => { t.crop = await WonScenes.cropMinimap(t.url); }));
  const pin = {};
  T.forEach(t => { if (t.kind !== 'scn' && t.kind !== 'pic') return; t.mode = WonScenes.viewMode(t.key, VIEW, ANN, !!t.crop); if (t.kind === 'scn' && t.crop && t.mode === 'full' && !VIEW[t.key]) pin[t.key] = 'full'; });
  if (Object.keys(pin).length) saveView(pin);   // 예전에 화면 전체에 그려 둔 장면은 화면 전체로 고정 (그린 것을 지워도 갑자기 바뀌지 않게)
  TILES = T;
}
const isMm = (t) => !!t && t.mode === 'mm' && !!t.crop;
const aKey = (t) => isMm(t) ? t.key + '#mm' : t.key;   // 그린 것 저장 칸 — 미니맵으로 볼 때 그린 것은 따로
const vUrl = (t) => isMm(t) ? t.crop.full : t.url;
const vThumb = (t) => isMm(t) ? t.crop.thumb : t.thumb;
async function saveView(obj) {
  const k = 'view:' + VID, cur = (await S.get(k))[k] || {};
  Object.assign(cur, obj); VIEW = cur; await S.set({ [k]: cur });
}
async function toggleView(t) {
  if (!t || (t.kind !== 'scn' && t.kind !== 'pic')) return;
  if (!t.crop) { msg('방송 화면 전체(16:9) 그림이 아니라 미니맵만 볼 수 없어요'); return; }
  if (annT) await saveAnn();
  const to = isMm(t) ? 'full' : 'mm', left = (ANN[aKey(t)] || []).length;
  t.mode = to; await saveView({ [t.key]: to });
  drawStrip(); await showAll(); drawItem();
  msg((to === 'mm' ? '미니맵만 크게' : '화면 전체') + ' — 텍틱 시트·PPT에도 이렇게 가요' + (left ? ' · ' + (to === 'mm' ? '화면 전체' : '미니맵') + '에 그린 것 ' + left + '개는 그쪽에 그대로 있어요 (M)' : ''));
}
const manualB = (b) => !!b && ((b.auto !== true && (b.items || []).length > 0) || !!b.done);   // 직접 만든 보드 (빈 보드·자동으로만 놓인 보드는 빼고)
const boardOn = () => TILES.some(t => t.kind === 'board');   // 이 라운드에 직접 만든 보드가 있으면 PPT 오프닝 칸은 보드
const tileSrc = (t) => t.kind === 'scn' ? 'scn:' + t.sk : t.kind === 'pic' ? 'pic:' + t.p.id : t.kind === 'mm' ? 'mm:' + MAPI + ':' + RN + ':' + t.k : 'board:' + MAPI + ':' + RN + ':140';
const inPpt = (t) => t.kind === 'board' ? t.has : t.kind === 'mm' ? (t.k !== '140' || !boardOn() || !!(ANN[t.key] || []).length) : !t.hide;   // 방송 미니맵은 보기 바꾸기 없음 (aKey = key)
const dimmed = (t) => (t.kind === 'scn' || t.kind === 'pic') && !!t.hide;   // PPT에서 뺀 장면·스크린샷만 흐리게 (투명벽 미니맵은 참고용이라 그대로)
function drawStrip() {
  const box = $('strip'); box.textContent = '';
  TILES.forEach((t, i) => {
    const d = document.createElement('div'); d.className = 'tile' + (i === SEL ? ' on' : '') + (TWO && i === CMP ? ' cmp' : '') + (dimmed(t) ? ' out' : '');
    const th = document.createElement('div'); th.className = 'th';
    if (vThumb(t)) { const im = document.createElement('img'); im.src = vThumb(t); im.loading = 'lazy'; th.append(im); }
    else th.textContent = t.kind === 'board' ? (t.has ? '보드 그림 만드는 중…' : '빈 맵 보드 만들기') : '그림 없음';
    const kind = document.createElement('span'); kind.className = 'kind' + (t.kind === 'board' ? ' b' : '');
    kind.textContent = t.kind === 'board' ? '보드' : t.kind === 'mm' ? '미니맵' : (t.kind === 'scn' ? '장면' : '스샷') + (isMm(t) ? ' · 미니맵' : '');
    const flags = document.createElement('span'); flags.className = 'flags';
    if ((ANN[aKey(t)] || []).length) { const f = document.createElement('span'); f.textContent = '그림'; f.title = '그린 것 ' + ANN[aKey(t)].length + '개'; flags.append(f); }
    if (WonTactic.sent(tileSrc(t))) { const f = document.createElement('span'); f.textContent = '텍틱'; f.title = '텍틱 시트로 보냄: ' + WonTactic.sentTxt(WonTactic.sent(tileSrc(t))); flags.append(f); }
    if (t.hide === 'mm') { const f = document.createElement('span'); f.textContent = '미니맵용'; flags.append(f); }
    const cap = document.createElement('div'); cap.className = 'cap';
    const tt = t.kind === 'scn' ? fmt(t.sec) : t.kind === 'mm' ? t.lab : '';
    cap.innerHTML = (tt ? '<b>' + esc(tt) + '</b>' : '') + esc(t.kind === 'scn' ? (t.x.memo || t.lab) : t.kind === 'pic' ? (t.p.cap || t.lab) : t.kind === 'mm' ? '방송 미니맵' + (t.manual ? ' · 직접' : '') + (t.k === '140' && !inPpt(t) ? ' · 참고' : '') : (t.has ? '오프닝 · ' + t.n + '개' : '없음'));
    d.append(th, kind, flags, cap);
    if (t.kind === 'pic') { const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = '이 스크린샷 지우기 (되돌리기 가능)'; x.onclick = (e) => { e.stopPropagation(); delPic(t); }; d.append(x); }
    d.onclick = () => pickTile(i);
    d.ondblclick = () => { if (t.kind === 'board') openBoard(); };
    box.append(d);
  });
  const add = document.createElement('div'); add.className = 'tile add';
  add.innerHTML = '<div class="th"><b style="font-size:18px">＋</b>스크린샷 붙이기<br>Ctrl+V · 끌어다 놓기</div>';
  add.onclick = () => $('picFile').click();
  box.append(add);
  const on = box.children[SEL]; if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
async function pickTile(i) {
  if (TILES[i] && TILES[i].kind === 'board' && !TILES[i].has) { openBoard(); return; }
  if (TWO && FOCUS === 1) CMP = i; else SEL = i;
  drawStrip(); await showAll(); drawItem();
}
const nextWithImg = (from) => { for (let k = 1; k <= TILES.length; k++) { const j = (from + k) % TILES.length; if (TILES[j].url && j !== from) return j; } return -1; };

/* ---------- 가운데 큰 그림 + 그리기 ---------- */
let V = [];
function buildTools() {
  V = [0, 1].map(i => {
    const el = $('v' + i), svg = el.querySelector('svg');
    const ed = WonAnn.Editor(svg, { onChange: (items) => annChanged(i, items), onFocus: () => setFocus(i), askText });
    ed.tool = TOOL; ed.color = COLOR;
    el.addEventListener('pointerdown', () => setFocus(i), true);
    return { el, ed, t: -1 };
  });
  document.querySelectorAll('#tools button[data-t]').forEach(b => { b.onclick = () => setTool(b.dataset.t); });
  WonAnn.COLORS.forEach(c => { const s = document.createElement('span'); s.className = 'sw' + (c === COLOR ? ' on' : ''); s.style.background = c; s.title = '색'; s.onclick = () => setColor(c); $('swatches').append(s); });
  $('undoBtn').onclick = () => curEd().doUndo();
  $('clearBtn').onclick = () => { const e = curEd(); if (e.items.length && confirm('이 그림에 그린 것을 모두 지울까요? (되돌리기로 살릴 수 있어요)')) e.clear(); };
  $('cmpBtn').onclick = toggleTwo;
  setTool('sel');
}
function setTool(t) {
  TOOL = t; V.forEach(v => { v.ed.tool = t; v.el.dataset.tool = t; v.ed.sel = -1; v.ed.render(); });
  document.querySelectorAll('#tools button[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
}
function setColor(c) { COLOR = c; V.forEach(v => { v.ed.color = c; }); curEd().setColor(c); [...$('swatches').children].forEach((s, i) => s.classList.toggle('on', WonAnn.COLORS[i] === c)); }
const curEd = () => V[TWO ? FOCUS : 0].ed;
function setFocus(i) {
  if (!TWO || FOCUS === i) return;
  FOCUS = i; V.forEach((v, k) => v.el.classList.toggle('focus', k === i)); drawItem();
}
function toggleTwo() {
  TWO = !TWO; $('cmpBtn').classList.toggle('on', TWO);
  V[1].el.style.display = TWO ? '' : 'none';
  V.forEach(v => v.el.classList.toggle('two', TWO));
  if (TWO) { CMP = nextWithImg(SEL); FOCUS = 1; V[1].el.classList.add('focus'); V[0].el.classList.remove('focus'); msg('나란히 보기 — 테두리가 파란 칸이 아래에서 고른 그림을 받아요'); }
  else { FOCUS = 0; CMP = -1; V.forEach(v => v.el.classList.remove('focus')); }
  drawStrip(); showAll(); drawItem();
}
async function showAll() { await show(0, SEL); if (TWO) await show(1, CMP); }
async function show(vi, ti) {
  const v = V[vi], t = TILES[ti], none = v.el.querySelector('.none'), lab = v.el.querySelector('.vlab');
  v.t = ti;
  if (!t || !t.url) {
    v.ed.setImage(null, 1, 1, []); v.ed.locked = true;
    none.textContent = !t ? '아래 그림 줄에서 고르세요' : t.kind === 'board' ? (t.has ? '보드 그림을 만드는 중이에요 — 잠시 뒤 다시 눌러 주세요 (또는 \'보드 편집\')' : '이 라운드는 아직 빈 맵 보드가 없어요 — \'보드 편집\'으로 만들기') : '그림이 없어요';
    lab.textContent = t ? tileTitle(t) : ''; lab.style.display = t ? '' : 'none';
    if (vi === 0 || !TWO) setCurLab(t); return;
  }
  none.textContent = '';
  let W, H;
  if (isMm(t)) { W = t.crop.w; H = t.crop.h; }
  else { W = t.w; H = t.h; if (!W) { try { const im = await loadImg(t.url); W = t.w = im.naturalWidth; H = t.h = im.naturalHeight; } catch (e) { W = 1; H = 1; } } }
  if (v.t !== ti) return;   // 그 사이 다른 그림을 고름
  v.ed.setImage(vUrl(t), W, H, ANN[aKey(t)] || []);
  v.ed.locked = t.kind === 'board';
  v.ed.tool = TOOL; v.el.dataset.tool = t.kind === 'board' ? 'sel' : TOOL;
  lab.textContent = tileTitle(t); lab.style.display = TWO ? '' : 'none';
  if (vi === 0 || !TWO) setCurLab(t);
}
function tileTitle(t) { return (t.kind === 'board' ? 'R' + RN + ' · 빈 맵 보드 (오프닝)' : t.kind === 'mm' ? 'R' + RN + ' · ' + t.lab + ' 방송 미니맵' : t.kind === 'scn' ? 'R' + RN + ' · 장면 ' + t.x.seq + ' · ' + fmt(t.sec) : 'R' + RN + ' · 스크린샷') + (isMm(t) ? ' · 미니맵만' : ''); }
function setCurLab(t) {
  const L = $('curLab'); L.textContent = '';
  if (!t) return;
  L.append(document.createTextNode(tileTitle(t)));
  const sec = t.kind === 'scn' ? t.sec - 2 : t.kind === 'mm' ? t.sec - 1 : null;
  if (sec != null) { const a = document.createElement('a'); a.href = ytAt(sec); a.target = '_blank'; a.textContent = '▶ 이 장면 영상'; L.append(a); }
}
let annT = null, annAt = null;
function annChanged(vi, items) {
  const t = TILES[V[vi].t]; if (!t) return;
  ANN[aKey(t)] = items.slice();
  annAt = [MAPI, RN, ANN];
  clearTimeout(annT); annT = setTimeout(saveAnn, 500);
  drawStripFlags();
}
async function saveAnn() { clearTimeout(annT); annT = null; if (!annAt) return; const [m, n, obj] = annAt; annAt = null; await WonAnn.save(VID, m, n, obj); }
function drawStripFlags() { clearTimeout(drawStripFlags.t); drawStripFlags.t = setTimeout(drawStrip, 250); }
function askText(ev, done) {
  const inp = $('txtIn'); inp.value = ''; inp.style.left = Math.min(ev.clientX, innerWidth - 240) + 'px'; inp.style.top = (ev.clientY - 16) + 'px'; inp.style.display = 'block';
  setTimeout(() => inp.focus(), 0);
  const fin = (ok) => { inp.style.display = 'none'; inp.onkeydown = null; inp.onblur = null; if (ok) done(inp.value.trim()); };
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); fin(true); } else if (e.key === 'Escape') fin(false); };
  inp.onblur = () => fin(!!inp.value.trim());
}

/* ---------- 오른쪽: 고른 그림 ---------- */
let itemT = null, itemFor = null;
function curTile() { return TILES[TWO && FOCUS === 1 ? CMP : SEL]; }
function drawItem() {
  const t = curTile(), show = (id, on) => { $(id).style.display = on ? '' : 'none'; };
  $('mmPick').style.display = 'none';
  if (!t) { $('iLab').textContent = '그림 없음'; ['iMemo', 'iPptRow', 'iTac', 'iEdit', 'iMm', 'iPrev', 'iNext', 'iDel', 'iView'].forEach(x => show(x, false)); $('iInfo').textContent = ''; $('iSent').textContent = ''; return; }
  $('iLab').textContent = '';
  $('iLab').append(document.createTextNode(tileTitle(t)));
  const sec = t.kind === 'scn' ? t.sec - 2 : t.kind === 'mm' ? t.sec - 1 : null;
  if (sec != null) { const a = document.createElement('a'); a.href = ytAt(sec); a.target = '_blank'; a.textContent = '▶ 영상'; $('iLab').append(a); }
  show('iMemo', t.kind === 'scn' || t.kind === 'pic');
  itemFor = t.key;
  if (t.kind === 'scn') { $('iMemo').value = t.x.memo || ''; $('iMemo').placeholder = '이 장면 메모 (영상 보며 적은 메모와 같은 칸)'; }
  if (t.kind === 'pic') { $('iMemo').value = t.p.cap || ''; $('iMemo').placeholder = '이 스크린샷 설명'; }
  show('iPptRow', t.kind === 'scn' || t.kind === 'pic'); $('iPpt').checked = !t.hide;
  show('iTac', TK_ON && (!!t.url || t.kind === 'board')); $('iTac').disabled = !t.url;
  show('iEdit', t.kind === 'board'); $('iEdit').textContent = t.has ? '보드 편집' : '빈 맵 보드 만들기';
  show('iMm', t.kind === 'scn' || t.kind === 'pic');
  show('iPrev', t.kind === 'scn'); show('iNext', t.kind === 'scn');
  show('iDel', t.kind === 'pic');
  show('iView', !!t.crop); $('iView').textContent = isMm(t) ? '🖥 화면 전체 보기 (M)' : '🗺 미니맵만 크게 (M)';
  const n = (ANN[aKey(t)] || []).length;
  $('iInfo').textContent = t.kind === 'board' ? 'PPT 라운드 장 첫 칸(오프닝)으로 들어가요 · 요원·스킬은 \'보드 편집\'에서'
    : t.kind === 'mm' ? (t.k === '140' && boardOn() ? (n ? '그린 게 있어서 PPT 코치 장면 장에도 들어가요' : '투명벽 미니맵 — 오프닝 칸은 직접 만든 보드 · 그리면 PPT 코치 장면 장에도 들어가요') : 'PPT 라운드 장에 ' + (t.k === '140' ? '오프닝(' + t.lab + ')' : t.lab) + ' 칸으로 들어가요' + (n ? ' (그린 것 포함)' : ''))
    : [isMm(t) ? '방송 미니맵 칸만 크게 보는 중 — 텍틱 시트·PPT에도 이 그림으로 가요' : '', t.hide === 'mm' ? '미니맵 채우려고 쓴 화면이라 PPT·텍틱 시트에서 빠져 있어요' : t.moved ? '다른 라운드에서 옮겨 온 장면' : ''].filter(Boolean).join(' · ');
  const s = WonTactic.sent(tileSrc(t)); $('iSent').textContent = s ? '📋 텍틱 시트로 보냄: ' + WonTactic.sentTxt(s) : '';
}
$('iMemo').oninput = () => { const t = TILES.find(x => x.key === itemFor), v = $('iMemo').value; clearTimeout(itemT); itemT = setTimeout(() => saveItemMemo(t, v), 500); };
$('iMemo').onblur = () => { const t = TILES.find(x => x.key === itemFor); clearTimeout(itemT); itemT = null; saveItemMemo(t, $('iMemo').value); };
async function saveItemMemo(t, v) {
  if (!t) return;
  if (t.kind === 'scn') {
    if ((t.x.memo || '') === v) return;
    const k = 'log:' + VID, log = (await S.get(k))[k] || [];
    const e = log.find(x => WonScenes.key(x) === t.sk); if (!e) return;
    e.memo = v; t.x.memo = v; LOG = log; await S.set({ [k]: log });
    drawTag(); drawRoundsSoon();   // 첫 장면 메모 = 자동 텍틱 이름
  } else if (t.kind === 'pic') {
    if ((t.p.cap || '') === v) return;
    t.p.cap = v; await savePics();
  }
  drawStripFlags();
}
$('iPpt').onchange = async () => {
  const t = curTile(); if (!t) return;
  const on = $('iPpt').checked;
  if (t.kind === 'scn') { const k = 'scnHide:' + VID, h = (await S.get(k))[k] || {}; if (on) delete h[t.sk]; else h[t.sk] = 'x'; HIDES = h; await S.set({ [k]: h }); t.hide = on ? null : 'x'; }
  if (t.kind === 'pic') { if (on) delete t.p.hide; else t.p.hide = 'x'; t.hide = t.p.hide || null; await savePics(); }
  drawStrip(); drawItem();
  msg(on ? 'PPT·텍틱 시트에 넣어요' : 'PPT·텍틱 시트(라운드 탭)에서 뺐어요 (여기엔 흐리게 남아요)');
};
$('iTac').onclick = () => tacFor(curTile());
/* 📋 텍틱 시트로 (1.11.6) — 라운드마다 텍틱 시트 '템플릿' 탭을 복제한 새 탭 · 탭 이름 = 텍틱 이름(첫 장면 메모) · 그 라운드 장면·스크린샷만 차례로 (단계 띠·글 없음)
   (1.11.3의 '한 탭에 그림마다 N단계'는 코치가 안 씀 — 10-04) */
const clockOf = (r, sec) => {   // 영상 초 → 그 라운드 시계(1:23) — 라운드 시작(배리어 1:40) t0 기준, 설치 뒤·모르면 null
  if (!r || r.t0 == null || sec == null) return null;
  const d = sec - r.t0; if (d < -35) return null; if (d < 0) return '바이 페이즈';
  const c = 100 - d; return c >= 0 ? fmt(c) : null;
};
const gameClock = (sec) => clockOf(R, sec);
const tacCap = (t) => 'R' + RN + ' · ' + (t.kind === 'scn' ? (gameClock(t.sec) || fmt(t.sec)) : t.kind === 'mm' ? t.lab : t.kind === 'board' ? '오프닝 보드' : (t.p.cap || '스크린샷'));
function viewItem(key, getUrl, ann, caption) {   // 보이는 대로(미니맵만/화면 전체 · 그린 것 포함) 보낼 그림 — 목록을 열 때 다 읽지 않고 필요할 때 만듦
  let base = null;
  const prep = async () => { if (base) return base; const url = await getUrl(); const crop = url ? await WonScenes.cropMinimap(url) : null; base = { url, crop, mm: WonScenes.viewMode(key, VIEW, ann, !!crop) === 'mm' }; return base; };
  return {
    src: key, caption,
    img: async () => { const b = await prep(); if (!b.url) return null; const u = b.mm ? b.crop.full : b.url, its = ann[b.mm ? key + '#mm' : key] || []; return its.length ? WonAnn.apply(u, its, 1600, 0.9) : u; },
    thumb: async () => { const b = await prep(); return b.mm ? b.crop.thumb : b.url; }
  };
}
$('tacAll').onclick = () => tacRounds(true);
if (!TK_ON) { $('tacAll').style.display = 'none'; $('tacBtn').style.display = 'none'; }
$('tacBtn').onclick = () => tacRounds(false);
async function tacRounds(onlyCur) {
  await flushSaves();
  const rs = roundsOfMap(), scn = scnMap(), fileOf = (x) => (x.files && x.files[0]) || x.file;
  const pk = rs.map(r => 'pics:' + VID + ':' + MAPI + ':' + r.n), ak = rs.map(r => WonAnn.key(VID, MAPI, r.n));
  const got = await S.get(pk.concat(ak)), out = [];
  rs.forEach((r, i) => {
    const ann = (r.n === RN ? ANN : got[ak[i]]) || {};
    const sc = (scn.get(r) || []).filter(x => fileOf(x) && !HIDES[WonScenes.key(x)]);
    const pics = ((r.n === RN ? PICS : got[pk[i]]) || []).filter(p => p.img && !p.hide);
    if (!sc.length && !pics.length) return;
    const fx = (scn.get(r) || []).find(x => !x.sub && String(x.memo || '').trim()), full = fx ? WonScenes.cleanMemo(fx.memo) : '';
    const items = sc.map(x => {
      const f = fileOf(x), memo = x === fx ? '' : String(x.memo || '').trim().split('\n')[0];
      return viewItem('scn:' + WonScenes.key(x), async () => { const rec = (await S.get('img:' + f))['img:' + f]; return rec && (rec.full || rec.thumb); }, ann, 'R' + r.n + ' · ' + (clockOf(r, x.sec) || fmt(x.sec)) + (memo ? ' · ' + memo : ''));
    }).concat(pics.map(p => viewItem('pic:' + p.id, async () => p.img, ann, 'R' + r.n + ' · 스크린샷' + (p.cap ? ' · ' + p.cap : ''))));
    const name = tagOf(r) || full.slice(0, 30) || ('R' + r.n), key = 'round:' + MAPI + ':' + r.n;
    out.push({ key, n: r.n, name, name0: name, summary: full && full !== name ? full : '', def: defTeam(r), items, on: onlyCur ? r.n === RN : !WonTactic.sent(key) });
  });
  if (!out.length) { msg('이 맵엔 텍틱 시트로 보낼 장면·스크린샷이 없어요 — 영상에서 S로 찍거나 여기서 Ctrl+V로 붙여 주세요'); return; }
  if (onlyCur && !out.some(x => x.on)) { msg('R' + RN + '엔 보낼 장면·스크린샷이 없어요 — 다른 라운드는 위 \'📋 텍틱 시트로\'에서'); return; }
  const p = (await S.get('prefs')).prefs || {};
  const tms = ['A', 'B'].map(t => ({ key: t, name: teamName(t), agents: ((ROSTER && ROSTER.teams && ROSTER.teams[t] && ROSTER.teams[t].agents) || []).filter(Boolean).map(WonNames.agentKo) }));
  const realName = (t) => !!(ROSTER && ROSTER.teams && ROSTER.teams[t] && ROSTER.teams[t].name && !/^(왼쪽|오른쪽) 팀$/.test(ROSTER.teams[t].name));
  const fileHint = realName('A') && realName('B') ? teamName('A') + ' vs ' + teamName('B') : String((ROUNDS && ROUNDS.title) || '').replace(/\s*[—|]\s.*$/, '').replace(/\s+-\s.*$/, '').slice(0, 40);
  WonTactic.open({ rounds: out, teams: tms, onlyCur, fileHint, linkOf: async (n) => deckLink(await deckInfo(), n),
    label: mapLabel(MAPI, (ROSTER && ROSTER.mapName) || mapNameOf(MAPI)) + ' · 라운드마다 새 탭', team: (p.tacticTeamBy || {})[VID + ':' + MAPI] || null,
    onTeam: async (k) => { const q = (await S.get('prefs')).prefs || {}; q.tacticTeamBy = Object.assign({}, q.tacticTeamBy, { [VID + ':' + MAPI]: k }); await S.set({ prefs: q }); },
    onName: (n, name) => saveTag(MAPI, n, name) });
}
$('iEdit').onclick = () => openBoard();
$('iView').onclick = () => toggleView(curTile());
$('iDel').onclick = () => delPic(curTile());
/* 스크린샷 지우기 (1.11.2: 스샷 칸 × · 오른쪽 버튼 · Delete 키) — 확인 창 대신 지운 뒤 '되돌리기' */
let lastDel = null;
async function delPic(t) {
  if (!t || t.kind !== 'pic') return;
  await flushSaves();
  const m = MAPI, n = RN, idx = PICS.indexOf(t.p), ann = ANN[t.key] ? ANN[t.key].slice() : null, annMm = ANN[t.key + '#mm'] ? ANN[t.key + '#mm'].slice() : null;
  PICS = PICS.filter(p => p !== t.p); delete ANN[t.key]; delete ANN[t.key + '#mm'];
  await WonAnn.save(VID, m, n, ANN); await savePics();
  lastDel = { m, n, p: t.p, idx, ann, annMm, key: t.key };
  await reloadTiles(); drawRounds();
  const w = document.createElement('span'); w.append(document.createTextNode('스크린샷을 지웠어요 (R' + n + ') — '));
  const a = document.createElement('a'); a.href = '#'; a.textContent = '되돌리기'; a.onclick = (e) => { e.preventDefault(); undoDel(); }; w.append(a);
  msg(w);
}
async function undoDel() {
  const d = lastDel; if (!d) return; lastDel = null;
  const pk = 'pics:' + VID + ':' + d.m + ':' + d.n, got = await S.get(pk), arr = got[pk] || [];
  arr.splice(Math.max(0, Math.min(d.idx, arr.length)), 0, d.p);
  await S.set({ [pk]: arr }); PICKEYS.add(pk);
  const annObj = (d.m === MAPI && d.n === RN) ? ANN : await WonAnn.load(VID, d.m, d.n);
  if (d.ann) annObj[d.key] = d.ann; if (d.annMm) annObj[d.key + '#mm'] = d.annMm;
  if (d.ann || d.annMm) await WonAnn.save(VID, d.m, d.n, annObj);
  if (d.m === MAPI && d.n === RN) { PICS = arr; await reloadTiles(d.key); }
  drawRounds(); msg('스크린샷을 되살렸어요');
}
$('iPrev').onclick = () => moveScene(-1);
$('iNext').onclick = () => moveScene(1);
$('iMm').onclick = () => {
  const box = $('mmPick'); if (box.style.display === 'flex') { box.style.display = 'none'; return; }
  box.textContent = ''; box.style.display = 'flex';
  const t = curTile();
  ['140', '130', '100'].forEach(k => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'R' + RN + ' ' + (k === '140' ? '투명벽' : k === '130' ? '1:25' : '1:00'); b.onclick = () => useAsMinimap(t, k); box.append(b); });
};
async function tacFor(t) {
  if (!t || !t.url) return;
  const items = ANN[aKey(t)] || [];
  let img = vUrl(t);
  if (items.length && t.kind !== 'board') { msg('그린 것 얹는 중…'); img = await WonAnn.apply(vUrl(t), items, 1600, 0.9); msg(''); }
  const cap = tacCap(t);
  const memo = t.kind === 'scn' ? (t.x.memo || '') : t.kind === 'pic' ? (t.p.cap || '') : '';
  const rs = WonTactic.sent('round:' + MAPI + ':' + RN);   // 이 라운드 탭을 만들었으면 그 탭을 먼저 고름
  WonTactic.open({ img, memo, caption: cap, src: tileSrc(t), label: tileTitle(t), tab: (rs && rs.tab) || tagOf(R) });
}

/* ---------- 스크린샷 붙이기 · 미니맵으로 쓰기 · 장면 옮기기 ---------- */
async function savePics(m = MAPI, n = RN, arr = PICS) { const k = 'pics:' + VID + ':' + m + ':' + n; if (arr.length) { await S.set({ [k]: arr }); PICKEYS.add(k); } else { await S.remove(k); PICKEYS.delete(k); } }
async function addPic(file) {
  const url = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(file); });
  const im = await loadImg(url), sc = Math.min(1, 1600 / Math.max(im.width, im.height));
  const c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  const p = { id: uid(), img: c.toDataURL('image/jpeg', 0.85), cap: '', at: Date.now(), w: c.width, h: c.height };
  PICS.push(p); await savePics();
  await reloadTiles('pic:' + p.id);
  drawRounds();
  msg('스크린샷 붙임 (R' + RN + ') — 바로 위에 그릴 수 있어요');
}
document.addEventListener('paste', (e) => {
  if (WonTactic.isOpen()) return;
  const fs = [...(e.clipboardData ? e.clipboardData.items : [])].filter(x => x.kind === 'file' && /^image\//.test(x.type)).map(x => x.getAsFile()).filter(Boolean);
  if (!fs.length) return;
  e.preventDefault(); fs.forEach(f => addPic(f));
});
$('picFile').onchange = () => { [...$('picFile').files].forEach(f => addPic(f)); $('picFile').value = ''; $('picFile').blur(); };
$('stage').addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
$('stage').addEventListener('drop', (e) => { const fs = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type)); if (!fs.length) return; e.preventDefault(); fs.forEach(f => addPic(f)); });
async function cropMinimap(url) {   // 16:9 영상 화면에서 방송 미니맵 칸(1080p 기준 35,20 ~ 555,520)을 잘라 520x500 (보드와 같은 방식)
  const im = await loadImg(url), w = im.width, h = im.height, a = w / h, M = WonMapReg;
  const c = document.createElement('canvas'), x = c.getContext('2d');
  if (a > 1.7 && a < 1.85) { const k = w / 1920, [x0, y0, x1, y1] = M.WIDE; c.width = M.WW; c.height = M.WH; x.drawImage(im, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, c.width, c.height); }
  else if (Math.abs(a - M.WW / M.WH) < 0.03) { c.width = M.WW; c.height = M.WH; x.drawImage(im, 0, 0, c.width, c.height); }
  else if (Math.abs(a - M.CW / M.CH) < 0.03) { c.width = M.CW; c.height = M.CH; x.drawImage(im, 0, 0, c.width, c.height); }
  else return null;
  const tc = document.createElement('canvas'); tc.width = Math.round(200 * c.width / c.height); tc.height = 200; tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
  return { full: c.toDataURL('image/jpeg', 0.9), thumb: tc.toDataURL('image/jpeg', 0.7) };
}
async function useAsMinimap(t, k) {
  $('mmPick').style.display = 'none';
  if (!t || !t.url) return;
  const lab = k === '140' ? '투명벽' : k === '130' ? '1:25' : '1:00';
  const out = await cropMinimap(t.url);
  if (!out) { msg('유튜브 영상 화면 전체(16:9) 스크린샷이어야 해요 — 장면 캡처(S)로 찍은 장면을 쓰세요', true); return; }
  if (R.shots && R.shots[k] && !confirm('이 라운드 ' + lab + ' 미니맵이 이미 있어요. 이 화면으로 바꿀까요?')) return;
  const name = VID + '_M' + MAPI + '_R' + pad(RN) + '_' + k + '_직접.jpg';
  await S.set({ ['img:' + name]: { thumb: out.thumb, full: out.full, at: Date.now(), kind: 'minimap', manual: true, h: 1080 } });
  const rk = 'rounds:' + VID, all = (await S.get(rk))[rk], rr = all && all.rounds.find(r => r.map === MAPI && r.n === RN);
  if (!rr) { msg('라운드 기록을 못 찾았어요', true); return; }
  rr.shots = rr.shots || {}; rr.shots[k] = name; rr.manual = Object.assign({}, rr.manual, { [k]: true });
  const clk = (t.kind === 'scn' && rr.t0 != null) ? 100 - (t.sec - rr.t0) : null;
  const L = (clk != null && clk > 0 && clk <= 100) ? fmt(clk) + ' · 직접' : lab + ' · 직접';
  if (k === '140') rr.lab140 = L; else if (k === '130') rr.lab130 = L; else rr.lab100 = L;
  await S.set({ [rk]: all }); ROUNDS = all; R = roundsOfMap().find(r => r.n === RN);
  // 미니맵 채우려고 쓴 장면·스크린샷은 PPT에서 뺌 (체크로 다시 넣을 수 있음)
  if (t.kind === 'scn' && !t.hide) { const hk = 'scnHide:' + VID, h = (await S.get(hk))[hk] || {}; h[t.sk] = 'mm'; HIDES = h; await S.set({ [hk]: h }); }
  if (t.kind === 'pic' && !t.p.hide) { t.p.hide = 'mm'; await savePics(); }
  await reloadTiles('mm:' + k);
  msg('R' + RN + ' ' + lab + ' 미니맵을 넣었어요 · 쓴 화면은 PPT에서 빠짐');
}
async function moveScene(dir) {
  const t = curTile(); if (!t || t.kind !== 'scn') return;
  const to = WonScenes.neighbor(ROUNDS.rounds, R, dir); if (!to) { msg(dir < 0 ? '첫 라운드예요' : '마지막 라운드예요'); return; }
  const k = 'scnMove:' + VID, mv = (await S.get(k))[k] || {};
  mv[t.sk] = WonScenes.rkey(to); MOVES = mv; await S.set({ [k]: mv });
  await reloadTiles(); drawRounds();
  msg('장면 ' + t.x.seq + ' → R' + to.n + '로 옮김');
}
async function reloadTiles(keepKey) {
  const cur = keepKey || (TILES[SEL] && TILES[SEL].key), cmp = TWO && TILES[CMP] ? TILES[CMP].key : null;
  await buildTiles();
  let i = TILES.findIndex(t => t.key === cur); SEL = i >= 0 ? i : Math.min(SEL, TILES.length - 1);
  if (TWO) { const j = cmp ? TILES.findIndex(t => t.key === cmp) : -1; CMP = j >= 0 ? j : nextWithImg(SEL); }
  drawStrip(); await showAll(); drawItem();
}

/* ---------- 라운드 메모 (rounds:<영상>의 note — 보드·모아보기와 같은 칸) ---------- */
let noteT = null, noteAt = null;
async function saveNote(text, m, n) {
  const k = 'rounds:' + VID, d = (await S.get(k))[k]; if (!d) return;
  const x = d.rounds.find(q => q.map === m && q.n === n); if (!x || (x.note || '') === text) return;
  x.note = text; d.noteAt = Date.now(); await S.set({ [k]: d });
  const mine = ROUNDS.rounds.find(q => q.map === m && q.n === n); if (mine) mine.note = text;
}
$('note').oninput = () => { clearTimeout(noteT); const t = $('note').value, [m, n] = noteAt; noteT = setTimeout(() => { noteT = null; saveNote(t, m, n).then(drawRoundsSoon); }, 400); };
$('note').onblur = () => { clearTimeout(noteT); noteT = null; const [m, n] = noteAt; saveNote($('note').value, m, n).then(drawRoundsSoon); };
function drawRoundsSoon() { clearTimeout(drawRoundsSoon.t); drawRoundsSoon.t = setTimeout(drawRounds, 300); }
async function flushSaves() {
  if (noteT) { clearTimeout(noteT); noteT = null; const [m, n] = noteAt; await saveNote($('note').value, m, n); }
  if (itemT) { clearTimeout(itemT); itemT = null; await saveItemMemo(TILES.find(x => x.key === itemFor), $('iMemo').value); }
  if (annT) await saveAnn();
  if (tagT && tagAt) await saveTag(tagAt[0], tagAt[1], $('tagIn').value);
}
window.addEventListener('beforeunload', () => { flushSaves(); });

/* ---------- 보드 페이지 빌려 쓰기: PPT로 보내기 · 보드 미리보기 그림 ---------- */
let BUSY = null;
function runBoard(act, n) {
  return new Promise((ok) => {
    const f = document.createElement('iframe'); f.id = 'busyFrame';
    f.src = 'board.html?v=' + encodeURIComponent(VID) + '&m=' + MAPI + '&r=' + (n || RN) + '&k=140&act=' + act;
    let done = false;
    const fin = (d) => { if (done) return; done = true; window.removeEventListener('message', on); clearTimeout(to); setTimeout(() => f.remove(), 300); ok(d); };
    const on = (e) => { const d = e.data; if (!d || d.won !== 'board' || e.source !== f.contentWindow) return; if (d.type === 'msg' && act === 'send') msg(d.text, false, true); if (d.type === 'done') fin(d); };
    const to = setTimeout(() => fin({ ok: false, text: '시간이 너무 오래 걸려서 멈췄어요' }), 6 * 60 * 1000);
    window.addEventListener('message', on);
    document.body.appendChild(f);
  });
}
$('pptBtn').onclick = async () => {
  if (BUSY) { msg('다른 작업 중이에요 — 잠시만요'); return; }
  const ml = mapLabel(MAPI, (ROSTER && ROSTER.mapName) || mapNameOf(MAPI));
  if (!confirm(ml + ' 라운드 전부를 정리 슬라이드(PPT)로 보낼까요?\n\n· 처음이면 새로 만들고, 다음부터는 바뀐 라운드·그림만 고쳐요\n· 라운드 장 = 투명벽·1:25·1:00 방송 미니맵(그린 것 포함) + 라운드 메모 — 직접 만든 보드가 있는 라운드만 오프닝 칸이 보드\n· 코치 장면 장 = PPT에 넣기로 둔 장면·스크린샷(그린 것 포함)\n· 30초~1분 걸려요')) return;
  await flushSaves();
  BUSY = 'send'; $('pptBtn').disabled = true; msg('PPT로 보내는 중…', false, true);
  const d = await runBoard('send');
  BUSY = null; $('pptBtn').disabled = false;
  setTimeout(thumbsIfNeeded, 500);   // 보내면서 자동 배치된 보드 미리보기
  if (d.ok && d.deck) {
    const w = document.createElement('span'); w.append(document.createTextNode((d.text || 'PPT 준비됨') + ' — ')); const a = document.createElement('a'); a.href = d.deck; a.target = '_blank'; a.textContent = '정리 슬라이드 열기'; w.append(a); msg(w, false, true);
    fillDeckLinks(true).then(r => { const t = linkTxt(r); if (t) w.append(document.createTextNode(' · 텍틱 시트: ' + t)); }).catch(() => {});   // 1.11.8 자료 탭 · 라운드 장이 바뀌었을 수 있어 다시
  }
  else msg(d.text || (d.ok ? 'PPT로 보냄' : '보내기 실패'), !d.ok, true);
};
let thumbsBusy = false;
async function thumbsIfNeeded() {   // 빈 맵 보드 미리보기 그림이 없거나 옛 그림이면 뒤에서 새로 만듦
  if (thumbsBusy || document.hidden) return;
  if (BUSY) { clearTimeout(thumbsIfNeeded.t); thumbsIfNeeded.t = setTimeout(thumbsIfNeeded, 3000); return; }
  const rs = roundsOfMap(), bk = rs.map(r => 'board:' + VID + ':' + MAPI + ':' + r.n + ':140'), ik = rs.map(r => 'bimg:' + VID + ':' + MAPI + ':' + r.n + ':140');
  const got = await S.get(bk.concat(ik));
  const need = rs.filter((r, i) => manualB(got[bk[i]]) && (!got[ik[i]] || got[ik[i]].sig !== WonAnn.sig(got[bk[i]])));   // 직접 만든 보드만 미리보기
  if (!need.length) return;
  thumbsBusy = true; BUSY = 'thumbs';
  await runBoard('thumbs', need[0].n);
  BUSY = null; thumbsBusy = false;
}
/* 정리 슬라이드 ↔ 텍틱 시트 (1.11.8, 코치 10-09 'PPT도 시트 안에 링크 하나'): 텍틱 라운드 탭 C1 = '📊 정리 슬라이드 R13 ↗' → PPT 그 라운드 장
   라운드 장 id는 GAS deckSlides(장 왼쪽 위 'R13' 띠)로 한 번 읽어 sent:<영상>:<맵>.slides에 둠 — PPT를 다시 보내면 board.js가 sent를 새로 써서 다시 읽음
   넣은 링크는 tacSent['round:맵:라운드'].link 에 적어 두고, 빠지거나 바뀐 탭만 GAS tacticLinks로 파일마다 한 번에
   + 코치 10-09 '이렇게 자동으로 자료 칸에 PPT': 같은 요청에 deck을 실어 그 파일 '자료' 탭 B열에 '📊 PPT 이름' 한 줄 (넣은 파일은 sent.dataTab[파일] = PPT 주소) */
let LINKS_OFF = false, MOVE_OFF = false, deckFail = 0;
function afterTacticRounds() {   // 1.11.8 라운드를 텍틱 파일에 보낸 뒤: 이 맵 PPT가 있으면 그 파일 '자료' 탭에도 (새 파일이면 바로)
  fillDeckLinks(true).then(r => { const t = linkTxt(r), m = $('msg'); if (t && /텍틱 시트에 새 탭/.test(m.textContent)) m.append(document.createTextNode(' · ' + t)); else if (t) msg('📋 텍틱 시트: ' + t); }).catch(() => {});
}
async function deckInfo() {
  const k = 'sent:' + VID + ':' + MAPI, s = (await S.get(k))[k];
  if (!s || !s.deck) return null;
  if (s.slides && (s.slidesAt || 0) >= (s.at || 0)) return s;
  if (LINKS_OFF || !TK_ON || Date.now() - deckFail < 60000) return s;   // 1분 안에 실패했으면 다시 안 물음 (라운드마다 묻지 않게)
  try {
    const j = await WonNet.postBoard({ kind: 'deckSlides', deck: s.deck });
    if (j && j.ok && j.slides) { const cur = (await S.get(k))[k]; if (cur && cur.deck === s.deck) { cur.slides = j.slides; cur.slidesAt = Date.now(); await S.set({ [k]: cur }); return cur; } }
    else if (j && !j.ok && /못 열었/.test(j.err || '')) { deckFail = Date.now(); return null; }   // 정리 슬라이드가 지워졌거나 못 엶 → 링크 안 넣음
    else if (j && !j.ok && !/주소/.test(j.err || '')) LINKS_OFF = true;   // 옛 GAS(v14) — 이번 화면에선 더 안 물어봄
  } catch (e) { deckFail = Date.now(); }
  return s;
}
const deckLink = (s, n) => { if (!s || !s.deck) return null; const base = String(s.deck).replace(/[?#].*$/, ''), sid = s.slides && s.slides[n]; return { url: base + (sid ? '#slide=id.' + sid : ''), text: '📊 정리 슬라이드' + (sid ? ' R' + n : '') + ' ↗' }; };
const linkTxt = (r) => [r.nd ? '\'자료\' 탭에 PPT 링크' : '', r.n ? '라운드 탭 ' + r.n + '개에 그 라운드 슬라이드 링크' : '', r.mv ? '그림 ' + r.mv + '장 M열로 옮김' : ''].filter(Boolean).join(' · ');
let fillQ = Promise.resolve();
function fillDeckLinks(quiet) { const p = fillQ.then(() => fillDeckLinks0(quiet)); fillQ = p.catch(() => {}); return p; }   // 차례로 (열 때·PPT 뒤·텍틱 보낸 뒤가 겹쳐도 빠짐없이)
async function fillDeckLinks0(quiet) {   // → { n: 라운드 탭 C1 링크 수, nd: '자료' 탭에 새로 넣은 PPT 수, mv: M열로 옮긴 그림 수 }
  const none = { n: 0, nd: 0, mv: 0 };
  if (!TK_ON || LINKS_OFF || !ROUNDS) return none;
  const tk = 'tacSent:' + VID, ts0 = (await S.get(tk))[tk] || {}, m0 = MAPI, kOf = (r) => 'round:' + m0 + ':' + r.n;
  const rs = roundsOfMap().filter(r => { const t = ts0[kOf(r)]; return t && t.fileId && !t.miss; });
  if (!rs.length) return none;
  const needMove = (t) => !MOVE_OFF && !(t.col >= 13);   // 1.11.9 예전(C열)에 보낸 라운드 탭 → 그림을 M열로 한 번 (GAS v16)
  const s = await deckInfo(); if (LINKS_OFF) return none;
  const hasDeck = !!(s && s.deck);
  if (!hasDeck && !rs.some(r => needMove(ts0[kOf(r)]))) return none;
  const base = hasDeck ? String(s.deck).replace(/[?#].*$/, '') : '', put = (hasDeck && s.dataTab) || {}, by = {};
  rs.forEach(r => {
    const key = kOf(r), t = ts0[key], l = hasDeck ? deckLink(s, r.n) : null, a = by[t.fileId] = by[t.fileId] || [];
    const url = l && t.link !== l.url ? l.url : '', move = needMove(t);
    if (url || move) a.push({ key, sheetId: t.sheetId, tab: t.tab, url, text: url ? l.text : '', move });
  });
  const mapKo = WonNames.mapKo((ROSTER && ROSTER.mapName) || mapNameOf(m0)), okFiles = []; let n = 0, nd = 0, mv = 0;
  for (const fid of Object.keys(by)) {
    const items = by[fid], deck = hasDeck && put[fid] !== base ? base : '';   // '자료' 탭: 이 파일에 이 PPT를 아직 안 넣었으면 (코치 10-09 '자동으로 자료 칸에 PPT')
    if (!items.length && !deck) continue;
    const j = await WonNet.postBoard({ kind: 'tacticLinks', mapKo, fileId: fid, items: items.map(x => ({ sheetId: x.sheetId, tab: x.tab, url: x.url, text: x.text, move: x.move })), deck }).catch(() => null);
    if (!j || !j.ok) { if (j && !j.ok && !/파일/.test(j.err || '')) LINKS_OFF = true; continue; }   // 옛 GAS(v14)면 이번 화면에선 그만
    const v16 = j.moved != null; if (!v16 && items.some(x => x.move)) MOVE_OFF = true;   // v15는 그림 옮기기를 모름
    n += j.n || 0; mv += j.moved || 0;
    const miss = new Set((j.miss || []).map(String)), cur = (await S.get(tk))[tk] || {};
    items.forEach(x => {
      const c = cur[x.key]; if (!c || c.fileId !== fid) return;
      if (miss.has(String(x.tab)) || miss.has(String(x.sheetId))) { if (v16) c.miss = Date.now(); return; }   // 탭이 없어짐 → 다음부터 안 물음
      if (x.url) c.link = x.url; if (x.move && v16) c.col = 13;
    });
    await S.set({ [tk]: cur });
    if (deck && j.deck && !j.deck.err) { if (j.deck.added) nd++; okFiles.push(fid); }
  }
  if (okFiles.length) {   // 자료 탭에 넣은 파일은 sent 기록에 (PPT를 다시 보내면 board.js가 sent를 새로 써서 한 번 더 확인 — 같은 PPT면 시트가 안 넣음)
    const k = 'sent:' + VID + ':' + m0, cur = (await S.get(k))[k];
    if (cur && String(cur.deck || '').replace(/[?#].*$/, '') === base) { cur.dataTab = Object.assign({}, cur.dataTab); okFiles.forEach(f => { cur.dataTab[f] = base; }); await S.set({ [k]: cur }); }
  }
  const r = { n, nd, mv };
  if ((n || nd || mv) && !quiet) msg('📋 텍틱 시트: ' + linkTxt(r));
  return r;
}
/* 정리 슬라이드 ↗ (1.11.4): 이 맵을 PPT로 보낸 적 있으면 머리에 늘 링크 — sent:<영상>:<맵> = { at, rounds, deck } */
async function drawDeckLink() {
  const k = 'sent:' + VID + ':' + MAPI, s = (await S.get(k))[k], a = $('deckLink');
  if (s && s.deck) { a.href = s.deck; a.style.display = ''; a.title = '이 맵 정리 슬라이드 (마지막으로 보낸 때 ' + new Date(s.at).toLocaleString('ko-KR') + ' · ' + (s.rounds || 0) + '라운드)'; }
  else a.style.display = 'none';
}
function openBoard() {
  flushSaves();
  window.open('board.html?v=' + encodeURIComponent(VID) + '&m=' + MAPI + '&r=' + RN + '&k=140', '_blank');
}
$('boardBtn').onclick = openBoard;
$('mapSel').onchange = () => openMap(+$('mapSel').value, 1);

/* ---------- 다른 화면(유튜브·보드)에서 바뀐 것 반영 ---------- */
let reT = null;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local' || !ROUNDS) return;
  let tiles = false, rounds = false;
  for (const k of Object.keys(ch)) {
    const nv = ch[k].newValue;
    if (k === 'rounds:' + VID && nv) { ROUNDS = nv; R = roundsOfMap().find(r => r.n === RN) || R; rounds = true; if (document.activeElement !== $('note') && !noteT) $('note').value = R.note || ''; }
    else if (k === 'log:' + VID) { LOG = nv || []; tiles = rounds = true; drawTag(); }
    else if (k === 'scnMove:' + VID) { MOVES = nv || {}; tiles = rounds = true; }
    else if (k === 'scnHide:' + VID) { HIDES = nv || {}; tiles = true; }
    else if (k === 'pics:' + VID + ':' + MAPI + ':' + RN) tiles = true;
    else if (k === 'bimg:' + VID + ':' + MAPI + ':' + RN + ':140') tiles = true;
    else if (k.startsWith('board:' + VID + ':' + MAPI + ':') && k.endsWith(':140')) { if (k === 'board:' + VID + ':' + MAPI + ':' + RN + ':140') tiles = true; clearTimeout(thumbsIfNeeded.t); thumbsIfNeeded.t = setTimeout(thumbsIfNeeded, 2500); }
    else if (k === 'tacSent:' + VID) WonTactic.reload().then(() => { drawStrip(); drawItem(); drawRoundsSoon(); drawTag(); });
    else if (k === 'view:' + VID) { const v = nv || {}; if (JSON.stringify(v) !== JSON.stringify(VIEW)) { VIEW = v; tiles = true; } }
    else if (k === 'sent:' + VID + ':' + MAPI) drawDeckLink();
    else if (k === 'tags:' + VID) { TAGS = nv || {}; rounds = true; drawTag(); if (GRID) { clearTimeout(drawGrid.t); drawGrid.t = setTimeout(drawGrid, 300); } }
  }
  if (rounds) drawRoundsSoon();
  if (tiles) { clearTimeout(reT); reT = setTimeout(() => { if (document.activeElement === $('iMemo')) return; reloadTiles(); }, 300); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(thumbsIfNeeded, 800); });

/* ---------- 텍틱 이름 (1.11.2) — 라운드마다 한 줄: 'A 스플릿'·'B 러시'… 모아 보기에서 이 이름으로 걸러 봄 ----------
   1.11.6: 코치가 안 적으면 그 라운드 첫 장면(부연 말고) 메모로 자동 (WonScenes.memoTag: '113 롱 헤비' · 'B러수'→'B러시' · 요원 역할 나열은 뺌)
   tags에 ''로 저장된 라운드 = 코치가 지움 → 자동도 안 씀 */
let SCN = null, SCNK = [], AUTO = new Map();
function scnMap() {   // 라운드 → 장면 (라운드·장면·옮김이 바뀔 때만 다시 계산)
  if (!SCN || SCNK[0] !== ROUNDS || SCNK[1] !== LOG || SCNK[2] !== MOVES) { SCN = WonScenes.assign(ROUNDS.rounds, LOG, MOVES); SCNK = [ROUNDS, LOG, MOVES]; AUTO = new Map(); }
  return SCN;
}
function autoTag(r) {
  if (!r || !ROUNDS) return '';
  const m = scnMap(); if (AUTO.has(r)) return AUTO.get(r);
  const x = (m.get(r) || []).find(x => !x.sub && String(x.memo || '').trim()), v = x ? WonScenes.memoTag(x.memo) : '';
  AUTO.set(r, v); return v;
}
const tagOf = (r) => { if (!r) return ''; const v = TAGS[r.map + ':' + r.n]; return v !== undefined ? v : autoTag(r); };
const isAutoTag = (r) => !!r && TAGS[r.map + ':' + r.n] === undefined && !!autoTag(r);
function tagCounts(rs) { const c = new Map(); rs.forEach(r => { const t = tagOf(r); if (t) c.set(t, (c.get(t) || 0) + 1); }); return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')); }
function drawTag() {
  if (!R) return;
  const inp = $('tagIn'); if (document.activeElement !== inp) inp.value = tagOf(R);
  const k = MAPI + ':' + RN, au = autoTag(R), ex = TAGS[k], h = $('tagAuto'); h.textContent = '';
  const link = (txt, fn) => { const a = document.createElement('a'); a.href = '#'; a.textContent = txt; a.onclick = (e) => { e.preventDefault(); fn(); }; return a; };
  if (ex === undefined && au) h.append('첫 장면 메모에서 자동 — 고치면 그 이름으로');
  else if (ex === '' && au) h.append('자동 이름(' + au + ') 안 씀 · ', link('되살리기', () => saveTag(MAPI, RN, au)));
  else if (ex && au && ex !== au) h.append('첫 메모 이름: ' + au + ' · ', link('그걸로', () => saveTag(MAPI, RN, au)));
  const st = WonTactic.sent('round:' + k);
  if (st) { h.append(h.childNodes.length ? ' · ' : ''); const a = document.createElement('a'); a.href = st.url || '#'; a.target = '_blank'; a.textContent = '📋 시트 탭 \'' + st.tab + '\' ↗'; if (!st.url) a.onclick = (e) => e.preventDefault(); h.append(a); }
  const all = tagCounts(ROUNDS.rounds);
  const dl = $('tagList'); dl.textContent = ''; all.forEach(([t]) => { const o = document.createElement('option'); o.value = t; dl.append(o); });
  const q = $('tagQuick'); q.textContent = '';
  tagCounts(roundsOfMap()).filter(([t]) => t !== tagOf(R)).slice(0, 6).forEach(([t, n]) => {
    const c = document.createElement('span'); c.className = 'chip'; c.textContent = t + ' ' + n; c.title = 'R' + RN + '에 이 이름 붙이기';
    c.onclick = () => { inp.value = t; saveTag(MAPI, RN, t); };
    q.append(c);
  });
}
let tagT = null, tagAt = null;
async function saveTag(m, n, v) {
  clearTimeout(tagT); tagT = null;
  const k = m + ':' + n, s = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const r = ROUNDS.rounds.find(x => x.map === m && x.n === n), au = r ? autoTag(r) : '';
  const nv = s === au ? undefined : (s || (au ? '' : undefined));   // 자동 이름과 같으면 자동을 따라감 · 비우면 '' = 자동도 안 씀
  if (TAGS[k] === nv) { if (r === R) drawTag(); return; }
  const cur = (await S.get('tags:' + VID))['tags:' + VID] || {};   // 다른 탭에서 붙인 것도 살림
  if (nv === undefined) delete cur[k]; else cur[k] = nv;
  TAGS = cur;
  if (Object.keys(cur).length) await S.set({ ['tags:' + VID]: cur }); else await S.remove('tags:' + VID);
  drawRoundsSoon(); drawTag(); if (GRID) drawGrid();
}
$('tagIn').oninput = () => { const v = $('tagIn').value; tagAt = [MAPI, RN]; clearTimeout(tagT); tagT = setTimeout(() => saveTag(tagAt[0], tagAt[1], v), 700); };
$('tagIn').onchange = () => { if (tagAt) saveTag(tagAt[0], tagAt[1], $('tagIn').value); };
$('tagIn').onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('tagIn').blur(); } };
$('tagIn').onblur = () => { if (tagT && tagAt) saveTag(tagAt[0], tagAt[1], $('tagIn').value); };

/* ---------- 모아 보기 (1.11.2) — 한 팀의 공격(또는 수비) 라운드들을 같은 순간(투명벽·1:25·1:00) 미니맵으로 한 화면에 ----------
   매번 같은 자리(디폴트)와 바뀌는 자리를 한눈에 · 칸을 누르면 그 라운드로 · 텍틱 이름을 칸에서 바로 붙이고 그 이름으로 걸러 봄 */
let GRID = false, GSET = new Set();
const G = { team: null, side: 'att', k: '130', tag: '', w: 240 };
const NOTAG = '\u0001';
const sideOf = (r, team) => defTeam(r) === team ? 'def' : 'att';
const gridBase = () => roundsOfMap().filter(r => sideOf(r, G.team) === G.side);
const gridList = () => gridBase().filter(r => G.tag === '' || (G.tag === NOTAG ? !tagOf(r) : tagOf(r) === G.tag));
const kLab = (k) => k === '140' ? '투명벽' : k === '130' ? '1:25' : '1:00';
function toggleGrid(on = !GRID) {
  if (on === GRID) return;
  GRID = on; $('stage').classList.toggle('gridmode', on); $('gridBtn').classList.toggle('on', on);
  if (on) {
    G.team = other(defTeam(R)); G.side = 'att'; G.tag = '';   // 지금 라운드의 공격 팀부터
    drawGrid();
    msg('모아 보기 — 그림을 누르면 그 라운드로 · 칸 아래 텍틱 이름을 누르면 바로 붙이기 · Esc 닫기');
  } else { GSET = new Set(); drawRounds(); showAll(); }
}
$('gridBtn').onclick = () => toggleGrid();
function gchip(box, text, on, fn, dot) {
  const b = document.createElement('button'); b.className = 'gchip' + (on ? ' on' : '');
  if (dot) { const i = document.createElement('i'); i.style.background = dot; b.append(i); }
  b.append(document.createTextNode(text)); b.onclick = fn; box.append(b); return b;
}
function growOf(label) { const d = document.createElement('div'); d.className = 'grow1'; const l = document.createElement('span'); l.className = 'glab'; l.textContent = label; d.append(l); return d; }
async function drawGrid() {
  if (!GRID) return;
  const my = drawGrid.seq = (drawGrid.seq || 0) + 1;
  const bar = $('gbar'), box = $('gcells'), all = roundsOfMap();
  bar.textContent = '';
  // 팀 · 편
  const r1 = growOf('팀 · 편');
  ['A', 'B'].forEach(tm => ['att', 'def'].forEach(sd => {
    const n = all.filter(r => sideOf(r, tm) === sd).length;
    gchip(r1, teamName(tm) + ' ' + (sd === 'att' ? '공격' : '수비') + ' ' + n, G.team === tm && G.side === sd, () => { G.team = tm; G.side = sd; G.tag = ''; drawGrid(); }, sd === 'att' ? 'var(--atk)' : 'var(--def)');
  }));
  const sum = document.createElement('span'); sum.id = 'gsum'; r1.append(sum);
  // 순간 + 크기
  const r2 = growOf('순간');
  ['140', '130', '100'].forEach(k => gchip(r2, kLab(k), G.k === k, () => { G.k = k; drawGrid(); }));
  const sz = document.createElement('input'); sz.type = 'range'; sz.id = 'gsize'; sz.min = 160; sz.max = 420; sz.step = 20; sz.value = G.w; sz.title = '칸 크기';
  sz.oninput = () => { G.w = +sz.value; box.style.setProperty('--gw', G.w + 'px'); };
  const szl = document.createElement('span'); szl.className = 'glab'; szl.style.cssText = 'width:auto;margin-left:auto'; szl.textContent = '크기';
  r2.append(szl, sz);
  // 텍틱 이름 (이 팀·편 라운드 안에서: 몇 번 · 몇 승)
  const base = gridBase(), r3 = growOf('텍틱 이름');
  const cnt = new Map(); let none = 0;
  base.forEach(r => { const t = tagOf(r); if (!t) { none++; return; } const c = cnt.get(t) || { n: 0, w: 0 }; c.n++; if (winner(r) === G.team) c.w++; cnt.set(t, c); });
  gchip(r3, '전체 ' + base.length, G.tag === '', () => { G.tag = ''; drawGrid(); });
  [...cnt.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([t, c]) => gchip(r3, t + ' ' + c.n + ' · ' + c.w + '승', G.tag === t, () => { G.tag = G.tag === t ? '' : t; drawGrid(); }));
  if (none && cnt.size) gchip(r3, '이름 없음 ' + none, G.tag === NOTAG, () => { G.tag = G.tag === NOTAG ? '' : NOTAG; drawGrid(); });
  if (!cnt.size) { const h = document.createElement('span'); h.className = 'glab'; h.style.width = 'auto'; h.textContent = '— 칸 아래 \'+ 텍틱 이름\'을 눌러 라운드마다 이름을 붙이면 여기서 걸러 봐요'; r3.append(h); }
  bar.append(r1, r2, r3);
  // 칸
  const list = gridList(); GSET = new Set(list.map(r => r.n)); drawRounds();
  const wins = list.filter(r => winner(r) === G.team).length, loses = list.filter(r => winner(r) && winner(r) !== G.team).length;
  sum.textContent = list.length + '라운드 · ' + wins + '승 ' + loses + '패';
  box.style.setProperty('--gw', G.w + 'px');
  if (!list.length) { box.innerHTML = '<div class="gnone">이 조건의 라운드가 없어요</div>'; return; }
  const imgKeys = list.map(r => r.shots && r.shots[G.k] ? 'img:' + r.shots[G.k] : null), annKeys = list.map(r => WonAnn.key(VID, MAPI, r.n));
  const got = await S.get(imgKeys.filter(Boolean).concat(annKeys));
  if (my !== drawGrid.seq || !GRID) return;
  box.textContent = '';
  list.forEach((r, i) => {
    const cell = document.createElement('div'); cell.className = 'gc' + (r.n === RN ? ' cur' : '');
    const pic = document.createElement('div'); pic.className = 'gimg'; pic.title = 'R' + r.n + ' 열기';
    const rec = imgKeys[i] && got[imgKeys[i]], url = rec && (rec.full || rec.thumb);
    if (url) {
      const cv = document.createElement('canvas'); pic.append(cv);
      const items = ((r.n === RN ? ANN : got[annKeys[i]]) || {})['mm:' + G.k] || [];
      loadImg(url).then(im => { cv.width = im.naturalWidth; cv.height = im.naturalHeight; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); WonAnn.draw(x, items, cv.width, cv.height); }).catch(() => {});
    } else pic.textContent = kLab(G.k) + ' 미니맵 없음';
    pic.onclick = () => { const n = r.n; toggleGrid(false); openRound(n, 'mm:' + G.k); };
    const w = winner(r), res = w ? (w === G.team ? '승' : '패') : '';
    const cap = document.createElement('div'); cap.className = 'gcap';
    cap.innerHTML = '<b>R' + r.n + '</b><span class="lb">' + esc(labOf(r, G.k)) + '</span>' + (res ? '<span class="res ' + (res === '승' ? 'w' : 'l') + '">' + res + '</span>' : '');
    const tg = document.createElement('span'); tg.className = 'gtag' + (tagOf(r) ? (isAutoTag(r) ? ' auto' : '') : ' empty'); tg.textContent = tagOf(r) || '+ 텍틱 이름'; tg.title = isAutoTag(r) ? '첫 장면 메모에서 자동 — 누르면 고치기' : '누르면 텍틱 이름 붙이기 · 고치기';
    tg.onclick = (e) => { e.stopPropagation(); editTagInline(tg, r); };
    cap.append(tg);
    cell.append(pic, cap);
    const note = (r.note || '').trim().split('\n')[0];
    if (note) { const nd = document.createElement('div'); nd.className = 'gnote'; nd.textContent = note; nd.title = r.note; cell.append(nd); }
    box.append(cell);
  });
}
function editTagInline(span, r) {
  const inp = document.createElement('input'); inp.className = 'gtagin'; inp.value = tagOf(r); inp.setAttribute('list', 'tagList'); inp.placeholder = '예: A 스플릿'; inp.autocomplete = 'off';
  span.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const fin = (ok) => { if (done) return; done = true; if (ok && inp.value.trim() !== tagOf(r)) saveTag(r.map, r.n, inp.value); else drawGrid(); if (r.n === RN && r.map === MAPI) drawTag(); };
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); fin(true); } else if (e.key === 'Escape') { e.preventDefault(); fin(false); } };
  inp.onblur = () => fin(true);
}

/* ---------- 키보드 ---------- */
document.addEventListener('keydown', (e) => {
  if (WonTactic.isOpen()) { if (e.key === 'Escape') WonTactic.close(); return; }   // 텍틱 창 밖에 초점이 있어도 Esc로 닫힘
  const a = document.activeElement, tag = ((a || {}).tagName || '').toLowerCase();
  if (tag === 'input' && a.type === 'file') a.blur();
  else if (tag === 'textarea' || tag === 'input' || tag === 'select') { if (e.key === 'Escape') a.blur(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (!GRID) curEd().doUndo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const rs = roundsOfMap(), ri = rs.findIndex(r => r.n === RN);
  const k = e.key;
  if (GRID) {   // 모아 보기 중: G·Esc = 닫기, 나머지 키는 안 씀 (그리기 안 함)
    if (k === 'Escape' || k.toLowerCase() === 'g') { e.preventDefault(); toggleGrid(false); }
    else if (/^Arrow/.test(k)) e.preventDefault();
    return;
  }
  if (k.toLowerCase() === 'g') { e.preventDefault(); toggleGrid(true); return; }
  if (k === 'ArrowUp' || k === '[') { e.preventDefault(); if (ri > 0) openRound(rs[ri - 1].n); }
  else if (k === 'ArrowDown' || k === ']') { e.preventDefault(); if (ri < rs.length - 1) openRound(rs[ri + 1].n); }
  else if (k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault(); const d = k === 'ArrowLeft' ? -1 : 1, cur = TWO && FOCUS === 1 ? CMP : SEL;
    const j = Math.max(0, Math.min(TILES.length - 1, cur + d)); if (j !== cur) pickTile(j);
  }
  else if (k === 'Delete' || k === 'Backspace') { if (curEd().delSel()) e.preventDefault(); else if (k === 'Delete' && curTile() && curTile().kind === 'pic') { e.preventDefault(); delPic(curTile()); } }
  else if (k === 'Escape') setTool('sel');
  else {
    const map = { v: 'sel', a: 'arrow', c: 'circle', p: 'pen', t: 'text', e: 'erase' }, t = map[k.toLowerCase()];
    if (t) setTool(t); else if (k.toLowerCase() === 'd') toggleTwo(); else if (k.toLowerCase() === 'm') toggleView(curTile());
  }
});
window.addEventListener('resize', () => V.forEach(v => v.ed.render()));

init().catch(e => { msg('열기 실패: ' + e.message, true); console.error(e); });
