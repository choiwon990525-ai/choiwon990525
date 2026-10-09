/* 라운드 보드 — 발로플랜트처럼 깨끗한 맵 위에 요원·스킬·동선을 놓고 고치는 화면
   주소: board.html?v=영상ID&m=맵번호&r=라운드&k=130|100
   저장: board:<영상>:<맵>:<라운드>:<130|100>  /  roster:<영상>:<맵> (맵 이름, 맞춤 변환, 두 팀 조합, 전반 수비 팀) */
const S = chrome.storage.local;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const q = new URLSearchParams(location.search);
const VID = q.get('v');
let MAPI = +(q.get('m') || 1), RN = +(q.get('r') || 1), KEY = q.get('k') || '130';
const SHEET_DEFAULT = '1qWUYBYoxLdzCXmmVG1rMeqKJ6y1gd0X9eUveR6ScBxU';
const TK_ON = true;   // 📋 텍틱 시트로 (공유판은 끔)
const ACT = q.get('act');   // 분석 화면이 보이지 않게 띄워 일을 맡길 때: 'send' = PPT로 보내기 · 'thumbs' = 보드 미리보기 그림
const { parseCSV, readCfgSheet, clearCfg, sheetCfg, postBoard } = WonNet;   // 시트·웹 앱 연결 (net.js — 분석 화면·텍틱 창과 같이 씀)

const pad = (n) => String(n).padStart(2, '0');
const fmt = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(x); };
const safeName = (s, max = 60) => { s = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, ''); return s || 'untitled'; };
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in (attrs || {})) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const msg = (t) => { $('msg').textContent = t; if (ACT && parent !== window) parent.postMessage({ won: 'board', type: 'msg', text: String(t) }, '*'); };

const AS = window.__wonAssets;
const asset = (p) => AS.files[p] || '';
WonMapReg.setMapUrl((n) => asset('maps/' + n + '.png'));
const iconUrl = (a) => asset(AGI[a] ? AGI[a].icon : 'agents/Omen.png');

/* ---------- 스킬 모양 (발로플랜트처럼 실제 크기로 놓임) — 단위 m, 게임 수치(발로란트 위키 Stats 표) ----------
   circle r: 범위(연막·장판) · sm 1 = 연막(시야 차단, 어둡게) · ring 1 = 감지·정보 범위(점선 테두리)
   rect len·w: 요원 쪽 흰 점(시작)에서 뻗는 직사각형 · min 있으면 끝 마름모로 길이 조절(min~len)
   wall len·w: 벽/선 · ctr 1 = 가운데 기준(세이지 벽)  · lane: 두 줄 벽(네온) · cross: 十자 벽(데드락)
   cone r·ang: 부채꼴(킬조이 포탑 시야 등) */
const SHAPE = {
  'Astra:Grenade': { k: 'circle', r: 4.75 }, 'Astra:Ability1': { k: 'circle', r: 4.75 }, 'Astra:Ability2': { k: 'circle', r: 4.75, sm: 1 }, 'Astra:Ultimate': { k: 'wall', len: 120, min: 10, w: 1 },
  'Breach:Grenade': { k: 'rect', len: 10, w: 6 }, 'Breach:Ability2': { k: 'rect', len: 56, min: 8, w: 8 }, 'Breach:Ultimate': { k: 'rect', len: 32, w: 18 },
  'Brimstone:Grenade': { k: 'circle', r: 6 }, 'Brimstone:Ability1': { k: 'circle', r: 4.5 }, 'Brimstone:Ability2': { k: 'circle', r: 4.15, sm: 1 }, 'Brimstone:Ultimate': { k: 'circle', r: 9 },
  'Chamber:Grenade': { k: 'circle', r: 10, ring: 1 }, 'Chamber:Ability2': { k: 'circle', r: 18, ring: 1 },
  'Clove:Ability1': { k: 'circle', r: 4 }, 'Clove:Ability2': { k: 'circle', r: 4, sm: 1 },
  'Cypher:Grenade': { k: 'wall', len: 15, min: 2, w: 0.4 }, 'Cypher:Ability1': { k: 'circle', r: 3.72, sm: 1 },
  'Deadlock:Grenade': { k: 'cross', len: 10, w: 1 }, 'Deadlock:Ability1': { k: 'rect', len: 9, w: 8 }, 'Deadlock:Ability2': { k: 'circle', r: 6.5 }, 'Deadlock:Ultimate': { k: 'rect', len: 40, min: 5, w: 6 },
  'Fade:Ability1': { k: 'circle', r: 6.58 }, 'Fade:Ability2': { k: 'circle', r: 30, ring: 1 }, 'Fade:Ultimate': { k: 'rect', len: 40, w: 20 },
  'Gekko:Grenade': { k: 'circle', r: 6.2 }, 'Gekko:Ultimate': { k: 'circle', r: 5 },
  'Harbor:Grenade': { k: 'circle', r: 6 }, 'Harbor:Ability1': { k: 'wall', len: 60, min: 5, w: 1 }, 'Harbor:Ability2': { k: 'circle', r: 4.6, sm: 1 }, 'Harbor:Ultimate': { k: 'rect', len: 34, w: 21 },
  'Iso:Grenade': { k: 'rect', len: 27.5, w: 7 }, 'Iso:Ability1': { k: 'rect', len: 34.9, w: 6 }, 'Iso:Ultimate': { k: 'rect', len: 36, w: 15 },
  'Jett:Grenade': { k: 'circle', r: 3.35, sm: 1 },
  'KAY/O:Grenade': { k: 'circle', r: 4 }, 'KAY/O:Ability2': { k: 'circle', r: 15, ring: 1 }, 'KAY/O:Ultimate': { k: 'circle', r: 42.5, ring: 1 },
  'Killjoy:Grenade': { k: 'circle', r: 4.5 }, 'Killjoy:Ability1': { k: 'circle', r: 5.5, ring: 1 }, 'Killjoy:Ability2': { k: 'cone', r: 30, min: 5, ang: 100 }, 'Killjoy:Ultimate': { k: 'circle', r: 32.5 },
  'Miks:Grenade': { k: 'circle', r: 5.5 }, 'Miks:Ability2': { k: 'circle', r: 4.72, sm: 1 }, 'Miks:Ultimate': { k: 'cone', r: 40, min: 5, ang: 60 },
  'Neon:Grenade': { k: 'lane', len: 46.5, min: 5, w: 3.5 }, 'Neon:Ability1': { k: 'circle', r: 5 },
  'Omen:Ability1': { k: 'rect', len: 25, w: 8.6 }, 'Omen:Ability2': { k: 'circle', r: 4.1, sm: 1 },
  'Phoenix:Grenade': { k: 'wall', len: 21, min: 2, w: 1 }, 'Phoenix:Ability1': { k: 'circle', r: 4.5 },
  'Raze:Ability2': { k: 'circle', r: 5.5 },
  'Sage:Grenade': { k: 'wall', len: 10.4, w: 1.5, ctr: 1 }, 'Sage:Ability1': { k: 'circle', r: 7 },
  'Skye:Grenade': { k: 'circle', r: 18, ring: 1 },
  'Sova:Ability1': { k: 'circle', r: 4 }, 'Sova:Ability2': { k: 'circle', r: 30, ring: 1 }, 'Sova:Ultimate': { k: 'rect', len: 66, w: 3.5 },
  'Tejo:Ability1': { k: 'circle', r: 5.25 }, 'Tejo:Ability2': { k: 'circle', r: 4.5 }, 'Tejo:Ultimate': { k: 'rect', len: 32, w: 12 },
  'Veto:Ability1': { k: 'circle', r: 6.58 }, 'Veto:Ability2': { k: 'circle', r: 18, ring: 1 },
  'Viper:Grenade': { k: 'circle', r: 4.5 }, 'Viper:Ability1': { k: 'circle', r: 4.5, sm: 1 }, 'Viper:Ability2': { k: 'wall', len: 60, min: 5, w: 1 }, 'Viper:Ultimate': { k: 'circle', r: 9, sm: 1 },
  'Vyse:Grenade': { k: 'circle', r: 6.25 }, 'Vyse:Ability1': { k: 'wall', len: 12, min: 2, w: 1 }, 'Vyse:Ultimate': { k: 'circle', r: 28, ring: 1 },
  'Waylay:Grenade': { k: 'circle', r: 6 }, 'Waylay:Ultimate': { k: 'rect', len: 36, w: 13.5 },
  'Yoru:Ability2': { k: 'circle', r: 4, ring: 1 }
};
const SLOTKEY = { Grenade: 'C', Ability1: 'Q', Ability2: 'E', Ultimate: 'X', Star: '' };
// 아스트라 별(설치만 한 별 — 연막·파동·중력으로 바꾸기 전) = 스킬 슬롯이 아니라 따로 그림
AS.files['__star'] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.5l7.1-.6z" fill="#f4d35e" stroke="#fff" stroke-width="1"/></svg>');
const STAR = { slot: 'Star', ko: '별', icon: '__star' };
const COLORS = ['#e8b84b', '#ffffff', '#3fb8b0', '#d0504a', '#7cc4ff'];

let AG = [], AGI = {}, MAPMETA = {}, ROUNDS = null, R = null, ROSTER = null, B = null, CROP = null, CROPURL = null;
let EXPORT = false, tool = 'sel', color = COLORS[0], sel = null, pendAgent = null, pendAbil = null, undo = [];
const svg = $('board');

/* ---------- 불러오기 ---------- */
const bKey = () => 'board:' + VID + ':' + MAPI + ':' + RN + ':' + KEY;
const rKey = () => 'roster:' + VID + ':' + MAPI;
const other = (t) => t === 'A' ? 'B' : 'A';
const roundOf = (n) => ROUNDS && ROUNDS.rounds.find(r => r.map === MAPI && r.n === n);
const defTeamFor = (n, flip) => {   // n라운드 수비 팀 — ① 점수판 색(스캔 때 저장한 defSide) + 왼쪽 팀이 누군지 ② 없으면 전반 수비 팀 기준 교대
  const r = roundOf(n); let def;
  if (r && r.defSide && ROSTER.left) def = r.defSide === 'L' ? ROSTER.left : other(ROSTER.left);
  else { const fd = ROSTER.firstDef || 'A', swapHalf = n > 24 ? (n % 2 === 0) : n > 12; def = swapHalf ? other(fd) : fd; }
  return flip ? other(def) : def;
};
const sideOf = (team) => team === defTeamFor(RN, B && B.flip) ? 'def' : 'atk';   // 이 라운드에서 team의 공수
const lab1 = () => (R && R.lab130) || '1:30';
const keyLab = (k) => k === 'tac' ? '전술' : k === '140' ? ((R && R.lab140) || '투명벽') : k === '130' ? lab1() : '1:00';
const KEYS = ['140', '130', '100'];
// 시트로 보내기·자료 내보내기에 넣을 보드: 기본 = 투명벽(오프닝) 보드만 + 영상에서 찍은 장면 스샷 · 'all' = 세 장면 보드 모두
/* 보내기·내보내기 방식: 'mm'(기본) = 투명벽은 보드, 1:25·1:00은 스캔 때 찍은 방송 미니맵 사진 / 'all' = 세 장면 모두 보드 */
const OUTMODE = async () => (((await S.get('prefs')).prefs || {}).outKeys === 'all' ? 'all' : 'mm');
const OUTK = async () => KEYS;
const BOARDK = async () => (await OUTMODE()) === 'all' ? KEYS : ['140'];   // 보드 그림으로 내보낼 장면
/* 1.11.5 (코치 10-04 '오프닝 보드는 필요 없음'): 기본(mm)은 보내기 전에 자동 배치를 안 하고, 오프닝 칸은 직접 만든 보드(손댐·대조 끝)가 있을 때만 보드 — 아니면 투명벽 방송 미니맵 사진 */
const manualBoard = (b) => !!b && ((b.auto !== true && (b.items || []).length > 0) || !!b.done);   // 빈 보드·자동으로만 놓인 보드는 아님
async function photoJpeg(r, k, ann) {   // 방송 미니맵 사진 → 1024 정사각(보드 그림과 같은 칸 크기) + 아래 설명 줄 · ann = 분석 화면에서 그린 것(있으면 얹음)
  const name = r.shots && r.shots[k]; if (!name) return null;
  const rec = (await S.get('img:' + name))['img:' + name]; if (!rec || !rec.full) return null;
  const src = (ann && ann.length) ? await WonAnn.apply(rec.full, ann, 1040, 0.92) : rec.full;
  const im = await WonMapReg.loadImg(src), c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d'); x.fillStyle = '#070b10'; x.fillRect(0, 0, 1024, 1024);
  const sc = Math.min(1024 / im.width, 976 / im.height), w = im.width * sc, h = im.height * sc;
  x.drawImage(im, (1024 - w) / 2, (976 - h) / 2, w, h);
  const lab = k === '140' ? (r.lab140 || '투명벽') : k === '130' ? (r.lab130 || '1:30') : (r.lab100 || '1:00');
  x.fillStyle = '#c9d2e0'; x.font = '22px system-ui, sans-serif'; x.textBaseline = 'bottom';
  x.fillText((ROSTER.mapName || '') + ' · R' + r.n + ' ' + lab + ' · 방송 미니맵', 14, 1016);
  return c.toDataURL('image/jpeg', 0.86);
}
const MAPKO = { Abyss: '어비스', Ascent: '어센트', Bind: '바인드', Breeze: '브리즈', Corrode: '코로드', Fracture: '프랙처', Haven: '헤이븐', Icebox: '아이스박스', Lotus: '로터스', Pearl: '펄', Split: '스플릿', Summit: '서밋', Sunset: '선셋' };
const mapLabel = (m, name) => m + '맵' + (name ? '(' + (MAPKO[name] || name) + ')' : '');
const sideColor = (team) => sideOf(team) === 'def' ? '#3fb8b0' : '#d0504a';
const mapScale = () => { const mm = MAPMETA[ROSTER.mapName]; return mm ? Math.abs(mm.xm) * 1024 : 0.075; };

async function init() {
  AG = AS.agents; AG.forEach(a => { AGI[a.name] = a; });
  MAPMETA = AS.maps;
  ROUNDS = (await S.get('rounds:' + VID))['rounds:' + VID];
  if (!ROUNDS) { msg('이 영상은 아직 라운드를 찾지 않았어요'); return; }
  document.title = (ROUNDS.title || VID) + ' — 라운드 보드';
  $('ttl').textContent = ROUNDS.title || VID;
  const maps = [...new Set(ROUNDS.rounds.map(r => r.map))];
  $('mapSel').textContent = '';
  for (const m of maps) { const o = document.createElement('option'); o.value = m; o.textContent = mapLabel(m, ROUNDS.maps && ROUNDS.maps[m] && ROUNDS.maps[m].name); $('mapSel').append(o); }
  COLORS.forEach(c => { const s = document.createElement('span'); s.style.background = c; s.onclick = () => { color = c; paintColors(); }; $('colors').append(s); });
  paintColors();
  { const pf = (await S.get('prefs')).prefs || {}; if (pf.underOn === false) $('under').checked = false; if (pf.underOp != null) $('op').value = pf.underOp; }   // 겹쳐보기 설정 기억
  await openRound();
}
function paintColors() { [...$('colors').children].forEach((s, i) => s.classList.toggle('on', COLORS[i] === color)); }

async function openRound() {
  R = ROUNDS.rounds.find(r => r.map === MAPI && r.n === RN) || ROUNDS.rounds.find(r => r.map === MAPI) || ROUNDS.rounds[0];
  MAPI = R.map; RN = R.n;
  history.replaceState(null, '', '?v=' + encodeURIComponent(VID) + '&m=' + MAPI + '&r=' + RN + '&k=' + KEY);
  $('mapSel').value = MAPI;
  const rs = ROUNDS.rounds.filter(r => r.map === MAPI);
  $('rSel').textContent = '';
  for (const r of rs) { const o = document.createElement('option'); o.value = r.n; o.textContent = 'R' + r.n + ' · ' + r.sL + ':' + r.sR; $('rSel').append(o); }
  $('rSel').value = RN;
  [...$('keySeg').children].forEach(b => { b.classList.toggle('on', b.dataset.k === KEY); b.textContent = keyLab(b.dataset.k); });
  const off1 = R.lab130 === '1:30' || !R.lab130 ? 10 : 100 - (+R.lab130.split(':')[0] * 60 + +R.lab130.split(':')[1]);
  $('toAna').href = 'analyze.html?v=' + encodeURIComponent(VID) + '&m=' + MAPI + '&r=' + RN;
  $('yt').href = 'https://www.youtube.com/watch?v=' + VID + '&t=' + Math.floor(R.t0 != null ? R.t0 + (KEY === '140' ? 0 : KEY === '130' || KEY === 'tac' ? off1 : 40) : R.jump) + 's';
  // 방송 미니맵 그림
  const shot = R.shots && (R.shots[KEY] || R.shots['130'] || R.shots['140'] || R.shots['100']);
  const rec = shot ? (await S.get('img:' + shot))['img:' + shot] : null;
  CROPURL = rec ? (rec.full || rec.thumb) : null;
  CROP = CROPURL ? await WonMapReg.loadImg(CROPURL) : null;
  // 맵 명단
  ROSTER = (await S.get(rKey()))[rKey()] || { teams: { A: { name: '왼쪽 팀', agents: ['', '', '', '', ''] }, B: { name: '오른쪽 팀', agents: ['', '', '', '', ''] } } };
  if (!ROSTER.mapName || !ROSTER.reg) {
    if (!CROP) { msg('미니맵 그림이 없어요 — 맵을 직접 고르세요'); }
    else {
      msg('맵 알아내는 중… (처음 한 번, 몇 초)');
      const reg = await WonMapReg.register(CROP, ROSTER.mapName || null);
      if (reg) { ROSTER.mapName = reg.map; ROSTER.reg = { th: reg.th, s: reg.s, tx: reg.tx, ty: reg.ty, iou: reg.iou }; }
      await saveRoster();
      msg(reg ? reg.map + ' (일치 ' + Math.round(reg.iou * 100) + '%)' : '맵을 못 알아냈어요');
    }
  }
  if (!ROSTER.teams.A.agents.some(Boolean) && !ROSTER.triedSheet) { ROSTER.triedSheet = true; await fromSheet(true); }
  B = (await S.get(bKey()))[bKey()] || null;
  const fresh = !B;
  if (!B) B = { items: [], notes: { start: '', skill: '', mid: '' }, flip: false };
  if (fresh && KEY === 'tac') await tacFrom(null);   // 전술 보드는 1:25(없으면 투명벽·1:00) 보드를 복사해서 시작
  $('tacBar').style.display = KEY === 'tac' ? 'flex' : 'none';
  await loadMemo(); await loadPics(); paintBak(); paintDone();
  undo = []; sel = null; pendAbil = null; pendAgent = null;
  await drawMap();
  drawTeams();
  MODE = await OUTMODE();
  const photoKey = KEY !== 'tac' && !AUTO_AG(KEY);   // 1:25·1:00 — 방송 미니맵 사진으로 나가는 장면
  if (fresh && KEY !== 'tac' && AUTO_AG(KEY) && CROP && ROSTER.teams.A.agents.some(Boolean) && !ACT) await autoPlace();   // 1.11.5: 분석 화면이 뒤에서 여는 보드(보내기·미리보기)는 자동 배치 안 함
  else if (photoKey && !fresh && !B.done && B.items.length && B.items.every(i => i.auto)) {   // 예전에 자동으로만 채워진(손 안 댄) 1:25·1:00 보드 → 비움
    const n = B.items.length; push(); B.items = []; clearTimeout(saveT); saveT = null; await S.set({ [bKey()]: B });
    msg('자동으로 놓였던 ' + n + '개를 뺐어요 — 이 장면은 방송 미니맵 사진으로 나가요 (되살리려면 Ctrl+Z)');
  } else if (photoKey) msg('이 장면(' + (KEY === '130' ? (R.lab130 || '1:30') : (R.lab100 || '1:00')) + ')은 시트·자료에 방송 미니맵 사진으로 나가요 — 보드는 비워 둬도 돼요');
  drawItems(); drawAbil();
}

/* ---------- 맵 그리기 ---------- */
let mapCacheName = null, mapCacheUrl = null, silName = null, silUrl = null;
async function drawMap() {
  const g = $('gMap'); g.textContent = '';
  const th = ROSTER.reg ? ROSTER.reg.th : 0;
  if (ROSTER.mapName) {
    if (mapCacheName !== ROSTER.mapName) { mapCacheUrl = await WonMapReg.styledMap(ROSTER.mapName); mapCacheName = ROSTER.mapName; }
    el('image', { href: mapCacheUrl, x: 0, y: 0, width: 1024, height: 1024, transform: 'rotate(' + th + ' 512 512)' }, g);
  }
  const u = $('gUnder'); u.textContent = '';
  if (CROPURL && ROSTER.reg && $('under').checked) {
    const r = ROSTER.reg;
    if (silName !== ROSTER.mapName) { silUrl = await WonMapReg.silhouette(ROSTER.mapName); silName = ROSTER.mapName; }
    const mask = el('mask', { id: 'mk', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1024, height: 1024 }, u);
    el('image', { href: silUrl, x: 0, y: 0, width: 1024, height: 1024, transform: 'rotate(' + th + ' 512 512)' }, mask);
    const mg = el('g', { mask: 'url(#mk)' }, u);
    const [uw, uh] = WonMapReg.units(await WonMapReg.loadImg(CROPURL));   // 넓게 찍은 그림(1.9.0)이면 520x500
    el('image', { href: CROPURL, x: 0, y: 0, width: uw, height: uh, opacity: $('op').value / 100, transform: 'translate(' + (512 - r.tx / r.s) + ' ' + (512 - r.ty / r.s) + ') scale(' + (1 / r.s) + ')' }, mg);
    return finishMapSel();
  }
  finishMapSel();
}
function finishMapSel() {
  const ms = $('mapSel');
  [...ms.options].forEach(o => { o.textContent = mapLabel(o.value, +o.value === MAPI && ROSTER.mapName ? ROSTER.mapName : (ROUNDS.maps && ROUNDS.maps[o.value] && ROUNDS.maps[o.value].name)); });
}
const cropToView = (x, y) => { const r = ROSTER.reg; return [(x - r.tx) / r.s + 512, (y - r.ty) / r.s + 512]; };

/* ---------- 요원 자동 배치 ---------- */
const mmUrl = (a) => asset(AGI[a] && AGI[a].mm ? AGI[a].mm : (AGI[a] ? AGI[a].icon : 'agents/Omen.png'));   // 방송 미니맵에 쓰이는 원형 초상화
// 연막을 누가 깔았나: 팀에 있는 연막 요원 (앞쪽이 우선, 숫자 = 한 라운드에 깔 수 있는 개수)
const SMOKERS = [['Omen', 'Ability2', 2], ['Brimstone', 'Ability2', 3], ['Astra', 'Ability2', 4], ['Clove', 'Ability2', 2], ['Viper', 'Ability1', 1], ['Harbor', 'Ability2', 1], ['Miks', 'Ability2', 1], ['Jett', 'Grenade', 2], ['Cypher', 'Ability1', 2]];
const WALLERS = [['Viper', 'Ability2'], ['Harbor', 'Ability1'], ['Astra', 'Ultimate'], ['Phoenix', 'Grenade'], ['Neon', 'Grenade'], ['Vyse', 'Ability1'], ['Sage', 'Grenade']];
let MODE = 'mm';   // 보내기·내보내기 방식 (OUTMODE) — 열 때마다 새로 읽음
const AUTO_AG = (k) => k === '140' || MODE === 'all';   // 요원 자동 배치: 'mm'(1:25·1:00은 방송 미니맵 사진으로 나감)이면 투명벽만
const AUTO_ABIL = (k) => k === '140';   // 스킬(연막·벽) 자동은 오프닝(투명벽) 장면만 — 1:25·1:00은 코치가 채움
async function autoItems(img, n, flip, withAbil = true, withAgents = true, key = KEY) {   // 한 장의 방송 미니맵에서 요원 표시 (+ withAbil이면 연막·벽) → 보드 항목
  const teams = { A: ROSTER.teams.A.agents, B: ROSTER.teams.B.agents };
  const foot = await WonMapReg.footprint(ROSTER.mapName, ROSTER.reg, 12), footC = await WonMapReg.footprint(ROSTER.mapName, ROSTER.reg, 4);
  const mk = WonMapReg.detect(img, { foot, footC });
  const def = defTeamFor(n, flip), atk = other(def);
  const id = await WonMapReg.identify(img, mk, teams, mmUrl, def, { R: 6, dia: 14 });
  const out = withAgents ? id.markers.filter(m => m.agent).map(m => { const [x, y] = cropToView(m.x, m.y); return { id: uid(), t: 'agent', agent: m.agent, team: m.team, x, y, auto: true }; }) : [];
  if (!withAbil) return out;
  // 연막: 테두리 색 원(detect) + 어두운 원(detectSmokes) — 8px 안 겹치면 하나로
  const sm = mk.filter(m => m.kind === 'smoke').map(m => ({ x: m.x, y: m.y, side: m.side }));
  for (const z of WonMapReg.detectSmokes(img, { footC })) if (!sm.some(q => Math.hypot(q.x - z.x, q.y - z.y) < 9)) sm.push(z);
  const left = {}; for (const t of ['A', 'B']) left[t] = SMOKERS.filter(([a]) => teams[t].includes(a)).map(([a, sl, c]) => ({ a, sl, c }));
  const teamOfSide = (side) => side === 'def' ? def : side === 'atk' ? atk : null;
  for (const z of sm) {
    let t = teamOfSide(z.side);
    if (!t) {   // 테두리 색이 없으면: 연막 요원이 한 팀에만 있으면 그 팀, 아니면 가장 가까운 요원의 팀
      const has = ['A', 'B'].filter(tt => left[tt].length);
      if (has.length === 1) t = has[0];
      else if (id.markers.length) { let best = null, bd = 1e9; for (const m of id.markers) { const dd = Math.hypot(m.x - z.x, m.y - z.y); if (dd < bd) { bd = dd; best = m; } } t = best ? best.team : null; }
    }
    if (!t) continue;
    const who = left[t].find(q => q.c > 0) || left[t][0]; if (!who) continue;
    who.c--;
    // 아스트라: 투명벽(구매 시간)엔 설치만 한 별, 그 뒤엔 크기로 — 성운(연막)보다 확실히 작으면 별
    const star = who.a === 'Astra' && (key === '140' || (z.r || 6) / ROSTER.reg.s < 0.8 * px(4.75));
    const [x, y] = cropToView(z.x, z.y), it = makeAbil(who.a, star ? 'Star' : who.sl, t, x, y, 0); it.auto = true; out.push(it);
  }
  // 벽: 길고 곧은 팀 색 줄 → 그 팀의 벽 요원 (나란한 두 줄은 하나로 — 네온)
  const walls = [];
  for (const w of (mk.walls || [])) { if (walls.some(q => q.side === w.side && Math.abs(Math.atan2(q.y2 - q.y1, q.x2 - q.x1) - Math.atan2(w.y2 - w.y1, w.x2 - w.x1)) < 0.2 && Math.hypot((q.x1 + q.x2) / 2 - (w.x1 + w.x2) / 2, (q.y1 + q.y2) / 2 - (w.y1 + w.y2) / 2) < 25)) continue; walls.push(w); }
  for (const w of walls) {
    const t = teamOfSide(w.side), wa = WALLERS.find(([a]) => teams[t].includes(a)); if (!wa) continue;
    const [x1, y1] = cropToView(w.x1, w.y1), [x2, y2] = cropToView(w.x2, w.y2);
    const it = makeAbil(wa[0], wa[1], t, x1, y1, Math.atan2(y2 - y1, x2 - x1)); if (it.a == null) continue;
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (it.ctr || it.k === 'cross') { it.x = (x1 + x2) / 2; it.y = (y1 + y2) / 2; }
    it.L = L; it.max = Math.max(it.max, L); it.min = Math.min(it.min, L); it.auto = true; out.push(it);
  }
  return out;
}
function readyForAuto() {
  if (!ROSTER.reg) { msg('맵 맞춤이 안 돼서 자동 배치를 못 해요'); return false; }
  if (!ROSTER.teams.A.agents.some(Boolean) || !ROSTER.teams.B.agents.some(Boolean)) { msg('먼저 두 팀 조합을 채워 주세요 (📊 시트에서 불러오기)'); return false; }
  return true;
}
async function autoPlace(what) {   // what: undefined = 처음 열 때(요원 + 투명벽이면 스킬) · 'agents' = 요원만 다시 · 'abil' = 스킬만 다시
  if (!CROP) { msg('방송 미니맵이 없어서 자동 배치를 못 해요'); return; }
  if (KEY === 'tac') { msg('전술 보드는 자동 배치 대신 위의 복사해 오기를 쓰세요'); return; }
  if (!readyForAuto()) return;
  msg(what === 'abil' ? '연막·벽 읽는 중…' : '요원 위치 읽는 중…');
  await ensureSides();
  const doAg = what !== 'abil', doAb = what === 'abil' || (!what && AUTO_ABIL(KEY));
  const items = (await autoItems(CROP, RN, B.flip, doAb, doAg, KEY)).filter(notNope(B.nope));
  push();
  B.items = B.items.filter(it => !(doAg && it.t === 'agent') && !(doAb && it.t === 'abil' && it.auto)).concat(items);   // 손으로 놓은 스킬은 그대로
  save(!what || (what === 'agents' && B.auto)); drawItems(); drawTeams();
  const n = items.filter(i => i.t === 'agent').length, u = items.length - n;
  if (what === 'abil') msg('연막·벽·별 ' + u + '개 자동 배치 (손으로 놓은 스킬은 그대로)' + (u ? '' : ' — 못 찾았어요'));
  else msg('요원 ' + n + '명' + (u ? ' · 연막·벽 ' + u + '개' : '') + ' 자동 배치' + (n < 10 ? ' · 못 찾은 요원은 왼쪽에서 끌어다 놓으세요' : '') + ' · 얼굴이 틀리면 요원을 누르고 오른쪽 위에서 바로잡기');
}
/* 코치가 지운 자동 항목 기억(B.nope) → 다시 읽어도 같은 자리에 또 안 놓음 */
function noteDel(list) {
  const add = list.filter(i => i && i.auto && (i.t === 'agent' || i.t === 'abil')).map(i => ({ t: i.t, agent: i.agent, slot: i.slot || null, x: Math.round(i.x), y: Math.round(i.y) }));
  if (add.length) B.nope = (B.nope || []).concat(add).slice(-80);
}
const notNope = (nope) => (f) => !(nope || []).some(n => n.t === f.t && n.agent === f.agent && (n.slot || null) === (f.slot || null) && Math.hypot(n.x - f.x, n.y - f.y) < 30);
/* 지우기: 스킬만 · 그림(화살표·펜·글자)만 · 요원만 · 전부 — 되돌리기(Ctrl+Z) 됨 */
function clearItems(kind) {
  const keep = { abil: (it) => it.t !== 'abil', draw: (it) => !['arrow', 'pen', 'text'].includes(it.t), agent: (it) => it.t !== 'agent', all: () => false }[kind];
  if (!keep) return;
  const n = B.items.filter(it => !keep(it)).length; if (!n) { msg('지울 게 없어요'); return; }
  push(); noteDel(B.items.filter(it => !keep(it))); B.items = B.items.filter(keep); sel = null; save(); drawItems(); drawTeams(); drawAbil();
  msg({ abil: '스킬', draw: '그림', agent: '요원', all: '전부' }[kind] + ' ' + n + '개 지움 · Ctrl+Z로 되돌리기');
}
/* 이 맵 전부: 보드가 아직 없는 라운드·장면마다 자동 배치해서 저장 (이미 만든 보드는 건드리지 않음) */
async function autoAll(opts) {
  opts = opts || {};
  if (!readyForAuto()) return;
  const btn = $('autoAll'); btn.disabled = true;
  try {
    if (B && saveT) { clearTimeout(saveT); saveT = null; await S.set({ [bKey()]: B }); }   // 지금 보드의 저장 안 된 것 먼저
    msg('공수·팀 위치 확인 중…'); await ensureSides();
    const rs = ROUNDS.rounds.filter(r => r.map === MAPI);
    if (opts.redo) {   // 다시 읽기 전에 이 맵 보드를 통째로 백업 → '↩ 되돌리기'로 원래대로
      const bk = []; rs.forEach(r => KEYS.forEach(k => bk.push('board:' + VID + ':' + MAPI + ':' + r.n + ':' + k)));
      const cur = await S.get(bk);
      await S.set({ ['boardBak:' + VID + ':' + MAPI]: { at: Date.now(), boards: cur } });
    }
    let made = 0, redone = 0, skip = 0, agents = 0, total = 0;
    MODE = await OUTMODE();
    for (const r of rs) for (const k of (opts.keys || KEYS.filter(AUTO_AG))) {   // 'mm'이면 투명벽만 (1:25·1:00은 사진으로 나감)
      const shot = r.shots && r.shots[k]; if (!shot) continue;
      const key = 'board:' + VID + ':' + MAPI + ':' + r.n + ':' + k;
      const prev = (await S.get(key))[key];
      if (prev && !opts.redo) { skip++; continue; }   // 이미 있는 보드는 그대로 (시트로 보내기·내보내기 전 빈 곳 채우기)
      if (prev && prev.done) { skip++; continue; }   // ✅ 대조 끝 표시한 보드는 다시 읽기에서도 절대 안 건드림
      msg('자동 배치 중… R' + r.n + ' ' + (k === '140' ? (r.lab140 || '투명벽') : k === '130' ? (r.lab130 || '1:30') : '1:00'));
      const rec = (await S.get('img:' + shot))['img:' + shot]; if (!rec) continue;
      const im = await WonMapReg.loadImg(rec.full || rec.thumb);
      if (prev) {   // 다시 읽기: 코치가 놓거나 옮긴 것(auto 표시 없음)은 그대로, 자동으로 놓인 것만 새로
        const agAuto = prev.items.filter(i => i.t === 'agent').every(i => i.auto);   // 요원을 하나라도 옮겼으면 요원은 그대로
        const fresh = (await autoItems(im, r.n, !!prev.flip, AUTO_ABIL(k), agAuto)).filter(notNope(prev.nope));
        const before = JSON.stringify(prev.items);
        prev.items = prev.items.filter(i => !(i.t === 'abil' && i.auto) && !(agAuto && i.t === 'agent')).concat(fresh);
        if (JSON.stringify(prev.items) !== before) { prev.updated = Date.now(); await S.set({ [key]: prev }); redone++; } else skip++;
        agents += prev.items.filter(i => i.t === 'agent').length; total += 10;
        continue;
      }
      const items = await autoItems(im, r.n, false, AUTO_ABIL(k));
      await S.set({ [key]: { items, notes: { start: '', skill: '', mid: '' }, flip: false, auto: true, updated: Date.now(), map: MAPI, round: r.n, key: k, mapName: ROSTER.mapName, th: ROSTER.reg.th } });
      made++; agents += items.filter(i => i.t === 'agent').length; total += 10;
    }
    msg('자동 배치 끝: 새 보드 ' + made + '장' + (redone ? ' · 다시 읽음 ' + redone + '장(손댄 요원·스킬은 그대로, 1:25·1:00 자동 스킬은 뺌)' : '') + (skip ? ' · 그대로 ' + skip + '장' : '') + ' · 요원 ' + agents + '/' + total + '명 — 라운드를 넘기며 빠진 요원·스킬을 채워 주세요');
    if (!opts.quiet) await openRound();
    paintBak();
    return made;
  } finally { btn.disabled = false; }
}
/* 공수 정하기: 점수판 색(defSide)이 있으면 '왼쪽 팀이 A인지 B인지'만 정하면 됨 → 영상 제목 순서, 없으면 초상화 비교.
   점수판 색이 없는 옛 기록은 전반 수비 팀을 초상화로 추정 */
/* 이 맵 최종 점수(점수판 왼쪽 : 오른쪽) */
function hudFinal() {
  const rs = ROUNDS.rounds.filter(r => r.map === MAPI); const last = rs[rs.length - 1] || {};
  return last.win === 'L' ? [last.sL + 1, last.sR] : last.win === 'R' ? [last.sL, last.sR + 1] : [last.sL || 0, last.sR || 0];
}
/* 점수판 왼쪽이 어느 팀인지: 시트(_data)의 최종 점수와 점수판 최종 점수를 맞춰 봄 — 맵마다 방송이 좌우를 바꾸기도 해서 제목 순서보다 확실 */
function leftFromScore() {
  const a = ROSTER.teams.A.score, b = ROSTER.teams.B.score; if (a == null || b == null || a === b) return null;
  const [L, R] = hudFinal();
  if (L === a && R === b) return 'A'; if (L === b && R === a) return 'B';
  return null;
}
function leftFromTitle() {
  const title = String(ROUNDS.title || ''), low = title.toLowerCase();
  const pos = (name) => {
    if (!name) return -1; let best = low.indexOf(name.toLowerCase());
    for (const [ab, full] of Object.entries(TEAM_ABBR)) if (full === name) { const m = new RegExp('(^|[^A-Za-z0-9])' + ab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9]|$)').exec(title); if (m && (best < 0 || m.index < best)) best = m.index; }
    return best;
  };
  const a = pos(ROSTER.teams.A.name), b = pos(ROSTER.teams.B.name);
  if (a < 0 || b < 0 || a === b) return null;
  return a < b ? 'A' : 'B';
}
async function voteLeft(teams) {
  const rs = ROUNDS.rounds.filter(r => r.map === MAPI && r.defSide && r.shots && r.shots['130']).slice(0, 8);
  let h1 = 0, h2 = 0;   // h1: A가 왼쪽 / h2: B가 왼쪽
  for (const r of rs) {
    const rec = (await S.get('img:' + r.shots['130']))['img:' + r.shots['130']]; if (!rec) continue;
    const im = await WonMapReg.loadImg(rec.full || rec.thumb);
    const mk = WonMapReg.detect(im, { foot: await WonMapReg.footprint(ROSTER.mapName, ROSTER.reg, 12) });
    const res = await WonMapReg.identify(im, mk, teams, iconUrl, null, { drop: 1e6 });
    h1 += res.tots[r.defSide === 'L' ? 'A' : 'B']; h2 += res.tots[r.defSide === 'L' ? 'B' : 'A'];
  }
  return h1 <= h2 ? 'A' : 'B';
}
async function ensureSides() {
  const teams = { A: ROSTER.teams.A.agents, B: ROSTER.teams.B.agents };
  const hud = ROUNDS.rounds.filter(r => r.map === MAPI && r.defSide);
  if (hud.length) {
    if (!ROSTER.left) {
      const bs = leftFromScore();
      if (bs) { ROSTER.left = bs; ROSTER.leftBy = 'score'; }
      else { ROSTER.left = await voteLeft(teams); ROSTER.leftBy = 'faces'; }   // 제목 순서는 맵마다 좌우가 바뀔 수 있어 쓰지 않음
    }
    const r1 = hud.find(r => r.n <= 12); if (r1) ROSTER.firstDef = r1.defSide === 'L' ? ROSTER.left : other(ROSTER.left);
    await saveRoster(); return;
  }
  if (!ROSTER.left) { const bs = leftFromScore(); if (bs) { ROSTER.left = bs; ROSTER.leftBy = 'score'; await saveRoster(); } }   // 점수 순서만이라도 바로잡기
  if (!ROSTER.firstDef) await voteFirstDef(teams);
}
/* 전반 수비 팀: 전반 라운드 몇 개의 초상화 비교 점수를 합쳐 결정 (한 번만) */
async function voteFirstDef(teams) {
  const firsts = ROUNDS.rounds.filter(r => r.map === MAPI && r.n <= 12 && r.shots && r.shots['130']).slice(0, 6);
  const tot = { A: 0, B: 0 };
  for (const r of firsts) {
    const rec = (await S.get('img:' + r.shots['130']))['img:' + r.shots['130']]; if (!rec) continue;
    const im = await WonMapReg.loadImg(rec.full || rec.thumb);
    const mk = WonMapReg.detect(im, { foot: await WonMapReg.footprint(ROSTER.mapName, ROSTER.reg, 12) });
    const res = await WonMapReg.identify(im, mk, teams, iconUrl, null, { drop: 1e6 });
    tot.A += res.tots.A; tot.B += res.tots.B;
  }
  ROSTER.firstDef = tot.A <= tot.B ? 'A' : 'B';
  await saveRoster();
}

/* ---------- 팀 칸 ---------- */
function drawTeams() {
  const box = $('teams'); box.textContent = '';
  for (const t of ['A', 'B']) {
    const T = ROSTER.teams[t], d = document.createElement('div'); d.className = 'team';
    const hd = document.createElement('div'); hd.className = 'hd';
    const nm = document.createElement('input'); nm.type = 'text'; nm.value = T.name || ''; nm.onchange = () => { T.name = nm.value; saveRoster(); };
    const sd = document.createElement('span'); sd.className = 'side ' + sideOf(t); sd.textContent = sideOf(t) === 'def' ? '수비' : '공격';
    hd.append(nm, sd); d.append(hd);
    T.agents.forEach((a, i) => {
      const s = document.createElement('div'); s.className = 'slot' + (pendAgent && pendAgent.team === t && pendAgent.agent === a ? ' sel' : ''); s.draggable = !!a;
      const im = document.createElement('img'); if (a) im.src = iconUrl(a); im.style.borderColor = sideColor(t);
      const se = document.createElement('select');
      const o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— 요원 —'; se.append(o0);
      for (const g of AG) { const o = document.createElement('option'); o.value = g.name; o.textContent = g.ko + ' ' + g.name; se.append(o); }
      se.value = a || '';
      se.onchange = () => { const old = T.agents[i]; T.agents[i] = se.value; B.items.forEach(it => { if (it.team === t && it.agent === old && old) it.agent = se.value; }); saveRoster(); save(); drawTeams(); drawItems(); };
      const st = document.createElement('span'); st.className = 'st'; st.textContent = a && B.items.some(it => it.t === 'agent' && it.team === t && it.agent === a) ? '맵에' : (a ? '—' : '');
      s.append(im, se, st);
      s.onclick = (e) => {
        if (e.target === se || !a) return;
        selectAgent(t, a);
        const on = B.items.find(it => it.t === 'agent' && it.team === t && it.agent === a);
        if (on) { sel = on.id; pendAgent = { team: t, agent: a }; msg(AGI[a].ko + ' 선택 — 맵을 누르면 그 자리로 옮겨요 · 1~4 키로 스킬'); }
        else { push(); const it = { id: uid(), t: 'agent', agent: a, team: t, x: 512, y: 512 }; B.items.push(it); sel = it.id; save(); msg(AGI[a].ko + ' 놓음(가운데) — 끌어서 옮기세요 · 1~4 키로 스킬'); }
        tool = 'sel'; paintTools(); drawItems(); drawTeams();
      };
      s.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ team: t, agent: a })); };
      d.append(s);
    });
    box.append(d);
  }
}
async function saveRoster() { await S.set({ [rKey()]: ROSTER }); }

/* ---------- 시트에서 조합 불러오기 (_data 탭: 영상 링크로 찾기) ---------- */
const normAgent = (s) => { s = String(s || '').trim(); if (/^kay\/?o$/i.test(s)) return 'KAY/O'; const f = AG.find(a => a.name.toLowerCase() === s.toLowerCase() || a.ko === s); return f ? f.name : ''; };
/* 영상 제목의 팀 이름(약칭 포함)으로 시트 경기 찾기 — 영상 링크가 아직 안 붙은 경기용 */
const TEAM_ABBR = { 'TL': 'Team Liquid', 'PRX': 'Paper Rex', 'SEN': 'Sentinels', 'G2': 'G2 Esports', 'NRG': 'NRG', 'C9': 'Cloud9', '100T': '100 Thieves',
  'EG': 'Evil Geniuses', 'LOUD': 'LOUD', 'FUR': 'FURIA', 'KRU': 'KRÜ Esports', 'KRÜ': 'KRÜ Esports', 'LEV': 'LEVIATÁN', 'MIBR': 'MIBR', '2G': '2Game Esports', 'ENVY': 'ENVY',
  'FNC': 'FNATIC', 'NAVI': 'Natus Vincere', 'KC': 'Karmine Corp', 'TH': 'Team Heretics', 'VIT': 'Team Vitality', 'GX': 'GIANTX', 'M8': 'Gentle Mates', 'BBL': 'BBL Esports',
  'FUT': 'FUT Esports', 'ULF': 'ULF Esports', 'PCF': 'PCIFIC Esports', 'GEN': 'Gen.G', 'GENG': 'Gen.G', 'T1': 'T1', 'DRX': 'KIWOOM DRX', 'ZETA': 'ZETA DIVISION', 'DFM': 'DetonatioN FocusMe',
  'GE': 'Global Esports', 'TS': 'Team Secret', 'RRQ': 'Rex Regum Qeon', 'NS': 'Nongshim RedForce', 'FS': 'FULL SENSE', 'VL': 'VARREL', 'EDG': 'EDward Gaming',
  'FPX': 'FunPlus Phoenix', 'BLG': 'Bilibili Gaming', 'TE': 'Trace Esports', 'TEC': 'Titan Esports Club', 'XLG': 'Xi Lai Gaming', 'DRG': 'Dragon Ranger Gaming',
  'NOVA': 'Nova Esports', 'JDG': 'JD Gaming', 'AG': 'All Gamers', 'TYL': 'TYLOO', 'WOL': 'Wolves Esports' };
function byTitle(rows, ix) {
  const title = String(ROUNDS.title || document.title || '');
  const low = title.toLowerCase();
  const words = new Set(title.toUpperCase().split(/[^A-Z0-9Ü]+/).filter(Boolean));
  const hit = (name) => { if (!name) return false; if (low.includes(name.toLowerCase())) return true;
    for (const [ab, full] of Object.entries(TEAM_ABBR)) if (full === name && words.has(ab)) return true; return false; };
  const matches = {};
  for (const row of rows.slice(1)) {
    if (!hit(row[ix('team')]) || !hit(row[ix('opp')])) continue;
    const id = row[ix('matchId')]; const m = matches[id] = matches[id] || { date: row[ix('date')] || '', games: {} };
    const gid = row[ix('gameId')];
    const g = m.games[gid] = m.games[gid] || { gid: +gid, t: null, map: row[ix('map')], teams: [], by: 'title' };
    g.teams.push({ name: row[ix('team')], comp: row[ix('comp')].split('/').map(normAgent), players: (row[ix('players')] || '').split('/').map(s => s.trim()), score: ix('ts') >= 0 && row[ix('ts')] !== '' ? +row[ix('ts')] : null });
  }
  const ms = Object.values(matches).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!ms.length) return null;
  const games = Object.values(ms[0].games).sort((a, b) => a.gid - b.gid);
  return games.find(g => g.map === ROSTER.mapName) || games[MAPI - 1] || null;
}

async function fromSheet(quiet) {
  const prefs = (await S.get('prefs')).prefs || {};
  const sid = prefs.sheetId || SHEET_DEFAULT;
  try {
    if (!quiet) msg('시트 읽는 중…');
    const r = await fetch('https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=_data', { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = parseCSV(await r.text()); const H = rows[0]; const ix = (k) => H.indexOf(k);
    const games = {};
    for (const row of rows.slice(1)) {
      const m = /youtu\.be\/([\w-]{11})\D+(\d+)/.exec(row[ix('yt')] || '') || /[?&]v=([\w-]{11}).*?[?&]t=(\d+)/.exec(row[ix('yt')] || '');
      if (!m || m[1] !== VID) continue;
      const g = games[row[ix('gameId')]] = games[row[ix('gameId')]] || { t: +m[2], map: row[ix('map')], teams: [] };
      g.teams.push({ name: row[ix('team')], comp: row[ix('comp')].split('/').map(normAgent), players: (row[ix('players')] || '').split('/').map(s => s.trim()), score: ix('ts') >= 0 && row[ix('ts')] !== '' ? +row[ix('ts')] : null });
    }
    let list = Object.values(games).sort((a, b) => a.t - b.t);
    let g = null;
    if (list.length) {
      const firstT = (ROUNDS.rounds.find(r => r.map === MAPI) || {}).jump || 0;
      g = list[0]; for (const x of list) if (x.t <= firstT + 90) g = x;
    } else {
      g = byTitle(rows, ix);   // 영상 링크가 아직 없는 경기 → 제목의 팀 이름 + 맵으로 찾기
      if (!g) { if (!quiet) msg('시트에 이 영상이 없어요 — 조합을 직접 골라 주세요'); return; }
    }
    const [ta, tb] = g.teams;
    ROSTER.teams.A = { name: ta.name, agents: ta.comp.slice(0, 5), players: ta.players, score: ta.score };
    delete ROSTER.left; delete ROSTER.firstDef;   // 팀이 바뀌었으니 공수 다시 판단
    if (tb) ROSTER.teams.B = { name: tb.name, agents: tb.comp.slice(0, 5), players: tb.players, score: tb.score };
    if (g.map && WonMapReg.MAPS[g.map] && g.map !== ROSTER.mapName) {
      ROSTER.mapName = g.map;
      if (CROP) { const reg = await WonMapReg.register(CROP, g.map); if (reg) ROSTER.reg = { th: reg.th, s: reg.s, tx: reg.tx, ty: reg.ty, iou: reg.iou }; }
      mapCacheName = null;
    }
    ROSTER.sheet = { gameStart: g.t || null, map: g.map, by: g.by || 'video' };
    await saveRoster();
    if (!quiet) { await drawMap(); drawTeams(); drawItems(); }
    msg('시트에서 불러옴: ' + g.map + ' · ' + ta.name + (tb ? ' vs ' + tb.name : ''));
  } catch (e) { if (!quiet) msg('시트를 못 읽었어요 (' + e.message + ') — 조합을 직접 골라 주세요'); }
}

/* ---------- 스킬 칸 ---------- */
let selAgent = null;
function selectAgent(team, agent) { selAgent = { team, agent }; drawAbil(); }
function drawAbil() {
  const box = $('abil'), bar = $('abilBar'); box.textContent = ''; bar.textContent = '';
  if (!selAgent || !AGI[selAgent.agent]) { $('abilHd').textContent = '스킬 — 요원을 누르세요'; bar.style.display = 'none'; return; }
  const a = AGI[selAgent.agent], c = sideColor(selAgent.team);
  $('abilHd').textContent = '스킬 — ' + a.ko + ' (' + (ROSTER.teams[selAgent.team].name || selAgent.team) + ')';
  const face = document.createElement('img'); face.src = iconUrl(a.name); face.className = 'face'; face.style.borderColor = c; bar.append(face);
  for (const ab of a.name === 'Astra' ? a.abilities.concat(STAR) : a.abilities) {
    const n = ['Grenade', 'Ability1', 'Ability2', 'Ultimate', 'Star'].indexOf(ab.slot) + 1, sh = SHAPE[a.name + ':' + ab.slot];
    const tip = ab.slot === 'Star' ? '별 — 설치만 한 아스트라 별 (연막·파동·중력으로 바꾸기 전) · 단축키 5' : ab.ko + ' (' + (SLOTKEY[ab.slot] || '') + ') — 누르면 요원 앞에 실제 크기로 놓여요 · 맵으로 끌어다 놓아도 돼요 · 단축키 ' + n + (sh ? '' : ' · 범위 없는 스킬은 아이콘만');
    const mk = (withText) => {
      const b = document.createElement('button');
      const im = document.createElement('img'); im.src = asset(ab.icon); b.append(im);
      if (withText) b.append(document.createTextNode((SLOTKEY[ab.slot] || '') + ' ' + ab.ko));
      else { const k = document.createElement('span'); k.textContent = n; b.append(k); }
      b.title = tip; b.draggable = true;
      b.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ abil: { agent: a.name, slot: ab.slot, team: selAgent.team } })); };
      b.onclick = () => placeAbilNear(a.name, ab.slot, selAgent.team);
      return b;
    };
    box.append(mk(true)); bar.append(mk(false));
  }
  bar.style.display = 'flex';
}

/* 스킬 놓기 (발로플랜트처럼: 누르면 바로 요원 앞에 실제 크기로, 끌어다 놓으면 그 자리)
   방향 있는 스킬(직사각형·벽·부채꼴)은 흰 점 = 시작점(끌면 이동), 끝 마름모 = 방향(길이 조절 되는 스킬은 길이도) */
const px = (m) => m * 100 * mapScale();   // m → 보드 px
const abilInfo = (agent, slot) => slot === 'Star' ? STAR : ((AGI[agent] || { abilities: [] }).abilities.find(a => a.slot === slot)) || {};
function makeAbil(agent, slot, team, x, y, ang) {
  const sh = SHAPE[agent + ':' + slot] || { k: 'icon' };
  const it = { id: uid(), t: 'abil', agent, slot, team, x, y, k: sh.k };
  if (sh.k === 'circle') { it.r = Math.max(10, px(sh.r)); if (sh.sm) it.sm = 1; if (sh.ring) it.ring = 1; }
  else if (sh.k !== 'icon') {
    it.a = ang || 0; it.max = Math.max(30, px(sh.k === 'cone' ? sh.r : sh.len));
    it.min = sh.min ? Math.max(12, px(sh.min)) : it.max; it.L = it.max;
    it.w = Math.max(sh.k === 'rect' || sh.k === 'lane' ? 10 : 5, px(sh.w || 0));
    if (sh.ang) it.ang = sh.ang; if (sh.ctr) it.ctr = 1;
  }
  return it;
}
function placeAbil(agent, slot, team, x, y, ang) {
  push();
  const it = makeAbil(agent, slot, team, x, y, ang);
  B.items.push(it); sel = it.id; pendAbil = null; tool = 'sel'; paintTools();
  save(); drawItems(); drawAbil();
  const ab = abilInfo(agent, slot);
  msg((ab.ko || '스킬') + ' 놓음 — 끌어서 옮기기' + (it.a != null ? (it.min < it.max ? ' · 끝 마름모로 방향·길이' : ' · 끝 마름모로 방향') : it.k === 'circle' ? ' · 휠로 크기' : '') + ' · Delete로 지우기');
}
function placeAbilNear(agent, slot, team) {
  const ag = B.items.find(i => i.t === 'agent' && i.team === team && i.agent === agent);
  const sh = SHAPE[agent + ':' + slot] || { k: 'icon' };
  let x = 512, y = 512, ang = -Math.PI / 2;
  if (ag) {
    const dx = 512 - ag.x, dy = 512 - ag.y, d = Math.hypot(dx, dy) || 1; ang = Math.atan2(dy, dx);
    if (sh.k === 'circle' || sh.k === 'icon') { const off = sh.k === 'circle' ? Math.max(70, px(sh.r) + 34) : 60; x = ag.x + dx / d * Math.min(off, d); y = ag.y + dy / d * Math.min(off, d); }
    else if (sh.ctr || sh.k === 'cross') { x = ag.x + dx / d * 90; y = ag.y + dy / d * 90; ang += Math.PI / 2; }   // 세이지 벽·데드락: 앞에 가로로
    else { x = ag.x + dx / d * 30; y = ag.y + dy / d * 30; }   // 요원 바로 앞에서 맵 가운데 쪽으로 뻗음
  }
  placeAbil(agent, slot, team, x, y, ang);
}

/* ---------- 항목 그리기 ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const hdl = (grp, x, y, h, id) => { const c = el('circle', { cx: x, cy: y, r: 11, fill: '#fff', stroke: '#e8b84b', 'stroke-width': 3, class: 'hdl', 'data-h': h, 'data-id': id }, grp); c.style.cursor = 'grab'; };
function drawItems() {
  const g = $('gItems'); g.textContent = '';
  const order = { abil: 0, pen: 1, arrow: 1, text: 3, agent: 2 };
  const sub = { rect: 0, cone: 0, lane: 0, circle: 1, wall: 2, cross: 2, line: 2, icon: 3 };   // 넓은 구역 → 원 → 벽 → 아이콘
  const items = B.items.slice().sort((a, b) => (order[a.t] - order[b.t]) || ((sub[a.k] || 0) - (sub[b.k] || 0)));
  for (const it of items) {
    const grp = el('g', { 'data-id': it.id, class: 'it' }, g);
    const on = sel === it.id;
    if (it.t === 'agent') {
      const c = sideColor(it.team);
      el('title', {}, grp).textContent = ((AGI[it.agent] || {}).ko || it.agent) + ' (' + (ROSTER.teams[it.team].name || it.team) + ') — 누르면 오른쪽에 스킬';
      grp.setAttribute('transform', 'translate(' + it.x + ' ' + it.y + ')');
      if (on) el('circle', { r: 33, fill: 'none', stroke: '#e8b84b', 'stroke-width': 4 }, grp);
      el('circle', { r: 26, fill: '#000', stroke: c, 'stroke-width': 5 }, grp);
      el('image', { href: iconUrl(it.agent), x: -23, y: -23, width: 46, height: 46, 'clip-path': 'url(#cp)' }, grp);
    } else if (it.t === 'abil') {
      const c = sideColor(it.team), ab = abilInfo(it.agent, it.slot), ic = asset(ab.icon), hi = on ? '#e8b84b' : c;
      el('title', {}, grp).textContent = ((AGI[it.agent] || {}).ko || it.agent) + ' · ' + (SLOTKEY[it.slot] || '') + ' ' + (ab.ko || '');
      const badge = (bx, by, r) => { el('circle', { cx: bx, cy: by, r, fill: '#0b1118', 'fill-opacity': 0.85, stroke: c, 'stroke-width': 2 }, grp); el('image', { href: ic, x: bx - r * 0.72, y: by - r * 0.72, width: r * 1.44, height: r * 1.44 }, grp); };
      if (it.k === 'circle') {
        if (it.sm) el('circle', { cx: it.x, cy: it.y, r: it.r, fill: '#1a2130', 'fill-opacity': 0.72, stroke: hi, 'stroke-width': on ? 4 : 2.5 }, grp);   // 연막: 시야 막힘
        else if (it.ring) el('circle', { cx: it.x, cy: it.y, r: it.r, fill: c, 'fill-opacity': 0.07, stroke: hi, 'stroke-width': on ? 4 : 2.5, 'stroke-dasharray': '10 7' }, grp);   // 감지·정보 범위
        else el('circle', { cx: it.x, cy: it.y, r: it.r, fill: c, 'fill-opacity': 0.28, stroke: hi, 'stroke-width': on ? 5 : 3 }, grp);
        if (it.ring || it.r < 22) badge(it.x, it.y, 15); else el('image', { href: ic, x: it.x - 14, y: it.y - 14, width: 28, height: 28 }, grp);
        if (on && !EXPORT) hdl(grp, it.x + it.r, it.y, 'r', it.id);
      } else if (it.a != null) {
        const ux = Math.cos(it.a), uy = Math.sin(it.a), nx = -uy, ny = ux, w = it.w;
        const s0 = it.ctr || it.k === 'cross' ? -it.L / 2 : 0, s1 = s0 + it.L;
        const P = (s, t, rot) => rot ? [it.x + nx * s - ux * t, it.y + ny * s - uy * t] : [it.x + ux * s + nx * t, it.y + uy * s + ny * t];
        const poly = (pts, at) => el('polygon', Object.assign({ points: pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ') }, at), grp);
        const band = (t0, t1, at, rot) => poly([P(s0, t0, rot), P(s1, t0, rot), P(s1, t1, rot), P(s0, t1, rot)], at);
        const wallAt = on ? { fill: '#e8b84b', 'fill-opacity': 0.95 } : { fill: c, 'fill-opacity': 0.9 };
        if (it.k === 'rect') band(-w / 2, w / 2, { fill: c, 'fill-opacity': 0.3, stroke: hi, 'stroke-width': on ? 4 : 2.5 });
        else if (it.k === 'wall') { band(-Math.max(w, 22) / 2, Math.max(w, 22) / 2, { fill: 'transparent' }); band(-w / 2, w / 2, wallAt); }
        else if (it.k === 'cross') { for (const rot of [0, 1]) { band(-11, 11, { fill: 'transparent' }, rot); band(-w / 2, w / 2, wallAt, rot); } }
        else if (it.k === 'lane') { band(-w / 2, w / 2, { fill: c, 'fill-opacity': 0.12 }); band(-w / 2 - 2.5, -w / 2 + 2.5, wallAt); band(w / 2 - 2.5, w / 2 + 2.5, wallAt); }
        else if (it.k === 'cone') {
          const h = (it.ang || 90) * Math.PI / 360, e0 = [it.x + Math.cos(it.a - h) * it.L, it.y + Math.sin(it.a - h) * it.L], e1 = [it.x + Math.cos(it.a + h) * it.L, it.y + Math.sin(it.a + h) * it.L];
          el('path', { d: 'M' + it.x + ' ' + it.y + ' L' + e0[0].toFixed(1) + ' ' + e0[1].toFixed(1) + ' A' + it.L.toFixed(1) + ' ' + it.L.toFixed(1) + ' 0 ' + (h > Math.PI / 2 ? 1 : 0) + ' 1 ' + e1[0].toFixed(1) + ' ' + e1[1].toFixed(1) + ' Z', fill: c, 'fill-opacity': 0.2, stroke: hi, 'stroke-width': on ? 4 : 2.5 }, grp);
        }
        const mid = it.k === 'cone' ? P(Math.min(it.L * 0.4, 60), 0) : it.k === 'cross' ? [it.x, it.y] : P((s0 + s1) / 2, 0);
        badge(mid[0], mid[1], on ? 16 : 14);
        if (!EXPORT) {   // 발로플랜트처럼: 흰 점 = 시작(끌면 이동) · 마름모 = 방향/길이
          if (it.k !== 'cross') { const o = el('circle', { cx: it.x, cy: it.y, r: on ? 8 : 6, fill: '#fff', stroke: '#0b1118', 'stroke-width': 2, class: 'hdl', 'data-h': 'o', 'data-id': it.id }, grp); o.style.cursor = 'move'; }
          const e = P(s1, 0), dsz = on ? 10 : 7;
          const dm = el('rect', { x: e[0] - dsz, y: e[1] - dsz, width: dsz * 2, height: dsz * 2, fill: on ? '#e8b84b' : c, stroke: '#fff', 'stroke-width': 2, transform: 'rotate(45 ' + e[0].toFixed(1) + ' ' + e[1].toFixed(1) + ')', class: 'hdl', 'data-h': 'a', 'data-id': it.id }, grp);
          dm.style.cursor = 'grab';
        }
      } else if (it.k === 'line') {   // 예전에 저장된 선 스킬
        el('line', { x1: it.x, y1: it.y, x2: it.x2, y2: it.y2, stroke: 'transparent', 'stroke-width': 24 }, grp);
        el('line', { x1: it.x, y1: it.y, x2: it.x2, y2: it.y2, stroke: hi, 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.85 }, grp);
        badge((it.x + it.x2) / 2, (it.y + it.y2) / 2, 17);
        if (on && !EXPORT) { hdl(grp, it.x, it.y, '1', it.id); hdl(grp, it.x2, it.y2, '2', it.id); }
      } else if (it.slot === 'Star') {   // 아스트라 별: 팀 색 별 모양 (연막 원과 구분)
        const pts = []; for (let k = 0; k < 10; k++) { const rr = k % 2 ? 7.5 : 17, t = -Math.PI / 2 + k * Math.PI / 5; pts.push((it.x + rr * Math.cos(t)).toFixed(1) + ',' + (it.y + rr * Math.sin(t)).toFixed(1)); }
        el('circle', { cx: it.x, cy: it.y, r: 22, fill: 'transparent' }, grp);
        el('polygon', { points: pts.join(' '), fill: c, 'fill-opacity': 0.9, stroke: on ? '#e8b84b' : '#fff', 'stroke-width': on ? 3.5 : 2, 'stroke-linejoin': 'round' }, grp);
      } else {
        el('circle', { cx: it.x, cy: it.y, r: 18, fill: '#0b1118', stroke: hi, 'stroke-width': on ? 4 : 3 }, grp);
        el('image', { href: ic, x: it.x - 13, y: it.y - 13, width: 26, height: 26 }, grp);
      }
    } else if (it.t === 'arrow' || it.t === 'pen') {
      const d = it.pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 22 }, grp);   // 잡기 쉬우라고
      el('path', { d, fill: 'none', stroke: it.color, 'stroke-width': on ? 8 : 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'marker-end': it.t === 'arrow' ? 'url(#ah)' : '', 'stroke-dasharray': on ? '14 6' : '' }, grp);
    } else if (it.t === 'text') {
      const t = el('text', { x: it.x, y: it.y, fill: it.color, 'font-size': 30, 'font-weight': 700, 'font-family': 'system-ui, Malgun Gothic, sans-serif', stroke: '#000', 'stroke-width': 5, 'paint-order': 'stroke', 'text-anchor': 'middle' }, grp);
      t.textContent = it.text;
      if (on) { const bb = t.getBBox(); el('rect', { x: bb.x - 4, y: bb.y - 2, width: bb.width + 8, height: bb.height + 4, fill: 'none', stroke: '#e8b84b', 'stroke-width': 2 }, grp); }
    }
  }
  paintSel();
}
/* 선택한 것 이름 (발로플랜트 오른쪽 위 'Omen - Q Paranoia'처럼) */
function paintSel() {
  const lab = $('selLab'); if (!lab) return;
  const it = sel && B.items.find(i => i.id === sel);
  if (!it || (it.t !== 'abil' && it.t !== 'agent')) { lab.style.display = 'none'; paintSwap(null); return; }
  const ag = (AGI[it.agent] || {}).ko || it.agent, tn = (ROSTER.teams[it.team] || {}).name || it.team, sd = sideOf(it.team);
  lab.innerHTML = '';
  const dot = document.createElement('i'); dot.style.background = sideColor(it.team); lab.append(dot);
  const t = document.createElement('b'); t.textContent = it.t === 'abil' ? ag + ' — ' + (SLOTKEY[it.slot] || '') + ' ' + (abilInfo(it.agent, it.slot).ko || '') : ag; lab.append(t);
  const sm = document.createElement('span'); sm.textContent = tn + ' · ' + (sd === 'def' ? '수비' : '공격') + (it.t === 'abil' && it.a != null ? ' · ' + (it.L / (100 * mapScale())).toFixed(1) + 'm' : it.t === 'abil' && it.r ? ' · 반경 ' + (it.r / (100 * mapScale())).toFixed(1) + 'm' : ''); lab.append(sm);
  lab.style.display = 'flex';
  paintSwap(it);
}
/* 얼굴을 잘못 읽었을 때: 맵의 요원을 누르면 오른쪽 위에 그 팀 5명 → 맞는 얼굴을 누르면 바로 바뀜(그 요원이 이미 맵에 있으면 서로 자리 바꿈) */
function paintSwap(it) {
  const bar = $('swapBar'); if (!bar) return; bar.textContent = '';
  if (it && !EXPORT && it.t === 'abil' && it.agent === 'Astra' && (it.slot === 'Star' || it.slot === 'Ability2')) {   // 별 ↔ 연막
    const toStar = it.slot === 'Ability2';
    const b = document.createElement('button'); b.className = 'txt'; b.textContent = toStar ? '⭐ 별로 바꾸기' : '☁ 연막으로 바꾸기';
    b.title = toStar ? '연막이 아니라 설치만 한 별이면' : '별을 연막(성운)으로 켰으면';
    b.onclick = () => { push(); const n = makeAbil('Astra', toStar ? 'Star' : 'Ability2', it.team, it.x, it.y, 0); n.id = it.id; Object.keys(it).forEach(k => delete it[k]); Object.assign(it, n); save(); drawItems(); msg(toStar ? '별로 바꿈' : '연막으로 바꿈'); };
    bar.append(b); bar.style.display = 'flex'; return;
  }
  if (!it || it.t !== 'agent' || EXPORT) { bar.style.display = 'none'; return; }
  const hd = document.createElement('span'); hd.textContent = '이 자리는 사실…'; bar.append(hd);
  for (const a of ROSTER.teams[it.team].agents) {
    if (!a) continue;
    const b = document.createElement('button'); b.title = ((AGI[a] || {}).ko || a) + '(으)로 바꾸기' + (a === it.agent ? ' (지금)' : '');
    const im = document.createElement('img'); im.src = mmUrl(a); b.append(im); if (a === it.agent) b.className = 'on';
    b.onclick = () => {
      if (a === it.agent) return;
      push();
      const o = B.items.find(x => x.t === 'agent' && x.team === it.team && x.agent === a && x !== it);
      if (o) { o.agent = it.agent; o.auto = false; }
      it.agent = a; it.auto = false; selectAgent(it.team, a);
      save(); drawItems(); drawTeams();
      msg(((AGI[a] || {}).ko || a) + '(으)로 바꿈' + (o ? ' — 원래 ' + ((AGI[a] || {}).ko || a) + ' 자리는 ' + ((AGI[o.agent] || {}).ko || o.agent) + '(으)로' : ''));
    };
    bar.append(b);
  }
  bar.style.display = 'flex';
}

/* ---------- ✅ 대조 끝 표시: 장면(투명벽·1:25·1:00)마다 — 라운드 목록 ✓/◐, 장면 버튼 ✓, 맵 진행 N/M ---------- */
async function paintDone() {
  const rs = ROUNDS.rounds.filter(r => r.map === MAPI), keys = [];
  rs.forEach(r => KEYS.forEach(k => { if (r.shots && r.shots[k]) keys.push('board:' + VID + ':' + MAPI + ':' + r.n + ':' + k); }));
  const all = await S.get(keys);
  const isDone = (r, k) => { const bk = 'board:' + VID + ':' + MAPI + ':' + r.n + ':' + k; return r.n === RN && k === KEY ? !!(B && B.done) : !!(all[bk] && all[bk].done); };
  let tot = 0, dn = 0;
  [...$('rSel').options].forEach(o => {
    const r = rs.find(q => q.n === +o.value); if (!r) return;
    const ks = KEYS.filter(k => r.shots && r.shots[k]), d = ks.filter(k => isDone(r, k)).length;
    tot += ks.length; dn += d;
    o.textContent = (ks.length && d === ks.length ? '✅ ' : d ? '◐ ' : '') + 'R' + r.n + ' · ' + r.sL + ':' + r.sR;
  });
  [...$('keySeg').children].forEach(b => { const k = b.dataset.k; if (k === 'tac') return; b.textContent = keyLab(k) + (R && isDone(R, k) ? ' ✓' : ''); });
  $('done').textContent = B && B.done ? '✅ 대조 끝' : '☐ 대조 끝 표시';
  $('done').classList.toggle('on', !!(B && B.done));
  $('done').style.display = KEY === 'tac' ? 'none' : '';
  $('doneProg').textContent = tot ? '대조 ' + dn + '/' + tot + (dn === tot ? ' — 이 맵 끝 🎉' : '') : '';
}
function toggleDone() {
  if (!B || KEY === 'tac') return;
  B.done = !B.done; save(B.auto); paintDone();
  msg(B.done ? 'R' + RN + ' ' + keyLab(KEY) + ' 대조 끝 ✓ (D 키로 켜고 끄기)' : '대조 끝 표시 뺌');
}
$('done').onclick = toggleDone;

/* ---------- 저장·되돌리기 ---------- */
let saveT = null;
function save(auto) {
  B.auto = auto === true || (auto === undefined && !!B.auto && B.items.every(i => i.auto));   // 누르기(선택)만 한 건 손댄 걸로 안 침 — 놓기·옮기기(auto 표시 없음)면 손댄 보드
  B.updated = Date.now(); B.map = MAPI; B.round = RN; B.key = KEY; B.mapName = ROSTER.mapName; B.th = ROSTER.reg ? ROSTER.reg.th : 0;
  clearTimeout(saveT); saveT = setTimeout(async () => { saveT = null; await S.set({ [bKey()]: B }); msg('저장됨 ' + new Date().toLocaleTimeString().slice(0, -3)); }, 300);
}
function push() { undo.push(JSON.stringify(B.items)); if (undo.length > 60) undo.shift(); }
function doUndo() { if (!undo.length) return; B.items = JSON.parse(undo.pop()); sel = null; save(); drawItems(); drawTeams(); }
/* ---------- ✏️ 전술 보드: 라운드마다 하나 더 — 전술 설명용으로 자유롭게 고치는 보드 (board:…:tac) ---------- */
async function tacFrom(k) {   // k: 복사할 장면 (null이면 1:25 → 투명벽 → 1:00 중 있는 것), 'empty'면 비우기
  let src = null;
  if (k !== 'empty') for (const kk of (k ? [k] : ['130', '140', '100'])) { const bk = 'board:' + VID + ':' + MAPI + ':' + RN + ':' + kk; const b = (await S.get(bk))[bk]; if (b && b.items && b.items.length) { src = b; break; } }
  if (B.items && B.items.length && k) push();
  B.items = src ? JSON.parse(JSON.stringify(src.items)).map(it => Object.assign(it, { id: uid(), auto: false })) : [];
  if (src) B.flip = !!src.flip;
  B.tacFrom = src ? src.key || k : null;
  save(); drawItems(); drawTeams();
  if (k) msg(src ? keyLab(src.key || k) + ' 보드를 복사했어요' : (k === 'empty' ? '비웠어요' : '복사할 보드가 없어요'));
}
document.querySelectorAll('#tacBar button[data-from]').forEach(b => { b.onclick = () => tacFrom(b.dataset.from); });

/* ---------- 📎 스크린샷: 라운드마다 (pics:<영상>:<맵>:<라운드>) — Ctrl+V 붙여넣기 · 끌어다 놓기 · 파일 ---------- */
const pKey = () => 'pics:' + VID + ':' + MAPI + ':' + RN;
let PICS = [], picsAt = null, SCENES = [];
/* 🎬 영상 보면서 장면 캡처로 찍은 장면(log:<영상>) → 그 라운드 시간 안에 찍은 것 자동으로 이 라운드에 */
//   라운드 경계가 틀리면(쉬는 시간·리플레이 중 찍은 장면) 장면 칸의 ◀ ▶로 옆 라운드로 옮김 → scnMove:<영상>
const mvKey = () => 'scnMove:' + VID;
async function scenesOf(r, log) {
  const moves = (await S.get(mvKey()))[mvKey()] || {}, hides = (await S.get(hideKey()))[hideKey()] || {};
  const out = [];
  for (const x of (WonScenes.assign(ROUNDS.rounds, log, moves).get(r) || [])) {
    const f = (x.files && x.files[0]) || x.file; const rec = f ? (await S.get('img:' + f))['img:' + f] : null;
    const key = WonScenes.key(x);
    out.push({ seq: x.seq, sec: x.sec, memo: x.memo || '', raw: x.memoRaw || '', img: rec ? (rec.full || rec.thumb) : null, sub: !!x.sub, key, moved: !!moves[key], hide: hides[key] || null });
  }
  return out;
}
/* 🚫 PPT·내보내기에서 뺄 장면 (1.10.0) — scnHide:<영상> = { 장면키: 'mm'(미니맵 채우려고 찍은 것) | 'x'(코치가 뺌) }
   빠진 장면은 보드 장면 칸에는 흐리게 남고, 시트로 보내기(정리 슬라이드)·자료 내보내기에만 안 들어감 */
const hideKey = () => 'scnHide:' + VID;
async function setSceneHide(key, v) {
  const h = (await S.get(hideKey()))[hideKey()] || {};
  if (v) h[key] = v; else delete h[key];
  await S.set({ [hideKey()]: h });
}
const shownScenes = (arr) => arr.filter(sc => !sc.hide);
const shownPics = (arr) => arr.filter(p => !p.hide);
async function moveScene(sc, dir) {   // 장면을 옆 라운드로 (같은 맵 안)
  const to = WonScenes.neighbor(ROUNDS.rounds, R, dir); if (!to) { msg(dir < 0 ? '첫 라운드예요' : '마지막 라운드예요'); return; }
  const moves = (await S.get(mvKey()))[mvKey()] || {};
  moves[sc.key] = WonScenes.rkey(to);
  await S.set({ [mvKey()]: moves });
  msg('🎬 ' + sc.seq + ' → R' + to.n + '로 옮김');
  await loadPics();
}
async function loadPics() {
  PICS = (await S.get(pKey()))[pKey()] || []; picsAt = [MAPI, RN];
  SCENES = R ? await scenesOf(R, (await S.get('log:' + VID))['log:' + VID]) : [];
  await WonTactic.reload();
  drawPics();
}
async function savePics() { if (!picsAt) return; const k = 'pics:' + VID + ':' + picsAt[0] + ':' + picsAt[1]; if (PICS.length) await S.set({ [k]: PICS }); else await S.remove(k); }
function drawPics() {
  const box = $('pics'); box.textContent = ''; try { paintMmState(); paintTkBoard(); } catch (e) {}
  $('picsHd').textContent = '📎 장면·스크린샷 — R' + RN + (PICS.length + SCENES.length ? ' (' + (PICS.length + SCENES.length) + ')' : '');
  SCENES.forEach(sc => {   // 영상에서 찍은 장면 (읽기 전용 · 메모는 장면 캡처 쪽에서)
    const w = document.createElement('div'); w.className = 'pic scene';
    if (sc.img) { const im = document.createElement('img'); im.src = sc.img; im.title = '크게 보기'; im.onclick = () => { $('lbImg').src = sc.img; $('lbCap').textContent = '🎬 ' + sc.seq + ' · ' + fmt(sc.sec) + (sc.memo ? ' · ' + sc.memo : ''); $('lb').style.display = 'flex'; }; w.append(im); }
    const cap = document.createElement('div'); cap.className = 'scap';
    const a = document.createElement('a'); a.href = 'https://www.youtube.com/watch?v=' + VID + '&t=' + Math.max(0, sc.sec - 2) + 's'; a.target = '_blank'; a.textContent = '🎬 ' + sc.seq + ' · ' + fmt(sc.sec);
    cap.append(a, document.createTextNode(sc.memo ? ' ' + sc.memo : ''));
    if (sc.raw && sc.raw !== sc.memo) { const rw = document.createElement('div'); rw.className = 'sraw'; rw.textContent = '받아쓰기 원문: ' + sc.raw; cap.append(rw); }
    const mv = document.createElement('div'); mv.className = 'smv';
    const b1 = document.createElement('button'); b1.textContent = '◀ 앞 라운드로'; b1.onclick = () => moveScene(sc, -1);
    const b2 = document.createElement('button'); b2.textContent = '뒤 라운드로 ▶'; b2.onclick = () => moveScene(sc, 1);
    mv.append(b1, b2); if (sc.moved) mv.append(document.createTextNode(' (옮긴 장면)'));
    w.append(cap, mv);
    if (sc.img) { const um = document.createElement('button'); um.className = 'usemm'; um.textContent = '🗺 이 화면을 R' + RN + ' ' + mmKeyLab() + ' 미니맵으로'; um.title = '이 장면 화면에서 방송 미니맵을 잘라 이 라운드 ' + mmKeyLab() + ' 미니맵으로 씀 — 쓰고 나면 이 장면은 PPT·내보내기에서 빠짐'; um.onclick = () => useAsMinimap(sc.img, sc.sec, { scene: sc }); w.append(um); }
    cardTools(w, { hide: sc.hide, onHide: async (v) => { await setSceneHide(sc.key, v); await loadPics(); },
      tac: sc.img ? { img: sc.img, memo: sc.memo, caption: 'R' + RN + ' · ' + fmt(sc.sec), src: 'scn:' + sc.key, label: '🎬 ' + sc.seq } : null });
    box.append(w);
  });
  PICS.forEach((p, i) => {
    const w = document.createElement('div'); w.className = 'pic';
    const im = document.createElement('img'); im.src = p.img; im.title = '크게 보기'; im.onclick = () => { $('lbImg').src = p.img; $('lbCap').textContent = p.cap || ''; $('lb').style.display = 'flex'; };
    const cap = document.createElement('input'); cap.type = 'text'; cap.placeholder = '설명 (선택)'; cap.value = p.cap || ''; cap.onchange = () => { p.cap = cap.value; savePics(); };
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '×'; del.title = '지우기'; del.onclick = () => { if (!confirm('이 스크린샷을 지울까요?')) return; PICS.splice(i, 1); savePics(); drawPics(); };
    const um = document.createElement('button'); um.className = 'usemm'; um.textContent = '🗺 이 화면을 R' + RN + ' ' + mmKeyLab() + ' 미니맵으로'; um.onclick = () => useAsMinimap(p.img, null, { pic: p });
    w.append(im, cap, del, um);
    cardTools(w, { hide: p.hide, onHide: async (v) => { if (v) p.hide = v; else delete p.hide; await savePics(); drawPics(); },
      tac: { img: p.img, memo: p.cap || '', caption: 'R' + RN + (p.cap ? ' · ' + p.cap : ''), src: 'pic:' + p.id, label: '📎 스크린샷' } });
    box.append(w);
  });
}
/* 카드 아래 줄: 🚫 PPT에서 빼기/넣기 · 📋 텍틱 시트로 (+ 보낸 기록) */
function cardTools(w, o) {
  if (o.hide) w.classList.add('hid');
  const row = document.createElement('div'); row.className = 'ctools';
  if (o.hide) { const t = document.createElement('span'); t.className = 'hidtag'; t.textContent = o.hide === 'mm' ? '🗺 미니맵용 — PPT·내보내기에서 빠짐' : '🚫 PPT·내보내기에서 뺀 장면'; row.append(t); }
  const hb = document.createElement('button'); hb.textContent = o.hide ? '↩ PPT에 다시 넣기' : '🚫 PPT에서 빼기';
  hb.title = o.hide ? '시트로 보내기(정리 슬라이드)·자료 내보내기에 다시 넣음' : '시트로 보내기(정리 슬라이드)·자료 내보내기에 안 넣음 — 보드에는 흐리게 남음';
  hb.onclick = () => o.onHide(o.hide ? null : 'x'); row.append(hb);
  if (o.tac && TK_ON) {
    const tb = document.createElement('button'); tb.className = 'tacb'; tb.textContent = '📋 텍틱 시트로'; tb.onclick = () => tacOpen(o.tac); row.append(tb);
    const sent = WonTactic.sent(o.tac.src); if (sent) { const t = document.createElement('span'); t.className = 'tsent'; t.textContent = '📋 보냄: ' + tkSentTxt(sent); row.append(t); }
  }
  w.append(row);
}
async function addPic(file) {
  const url = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(file); });
  const im = await WonMapReg.loadImg(url), sc = Math.min(1, 1600 / Math.max(im.width, im.height));
  const c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  PICS.push({ id: uid(), img: c.toDataURL('image/jpeg', 0.85), cap: '', at: Date.now(), w: c.width, h: c.height });
  await savePics(); drawPics(); msg('스크린샷 붙임 (R' + RN + ')');
}
/* ---------- 🗺 스캔이 못 딴 미니맵을 코치가 채우기 (1.9.3) ----------
   장면 캡처(S) 화면·📎 스크린샷·파일 중 하나에서 방송 미니맵 칸(1080p 기준 35,20 ~ 555,520)을 잘라
   이 라운드의 지금 장면(투명벽/1:25/1:00) 미니맵으로 저장 → 보드 겹쳐보기·자동 배치·시트/자료 사진에 그대로 쓰임 */
const mmKey = () => KEY === 'tac' ? '130' : KEY;
const mmKeyLab = () => { const k = mmKey(); return k === '140' ? '투명벽' : k === '130' ? '1:25' : '1:00'; };
async function cropMinimap(url) {
  const im = await WonMapReg.loadImg(url), w = im.width, h = im.height, a = w / h;
  const c = document.createElement('canvas'), x = c.getContext('2d');
  if (a > 1.7 && a < 1.85) {   // 유튜브 영상 화면 전체(16:9)
    const k = w / 1920, [x0, y0, x1, y1] = WonMapReg.WIDE; c.width = WonMapReg.WW; c.height = WonMapReg.WH;
    x.drawImage(im, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, c.width, c.height);
  } else if (Math.abs(a - WonMapReg.WW / WonMapReg.WH) < 0.03) { c.width = WonMapReg.WW; c.height = WonMapReg.WH; x.drawImage(im, 0, 0, c.width, c.height); }   // 이미 잘라 둔 넓은 칸
  else if (Math.abs(a - WonMapReg.CW / WonMapReg.CH) < 0.03) { c.width = WonMapReg.CW; c.height = WonMapReg.CH; x.drawImage(im, 0, 0, c.width, c.height); }   // 예전 좁은 칸
  else return null;
  const tc = document.createElement('canvas'); tc.width = Math.round(200 * c.width / c.height); tc.height = 200; tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
  return { full: c.toDataURL('image/jpeg', 0.9), thumb: tc.toDataURL('image/jpeg', 0.7) };
}
async function useAsMinimap(url, sec, src) {
  const k = mmKey(), lab = mmKeyLab();
  const out = await cropMinimap(url);
  if (!out) { msg('유튜브 영상 화면 전체(16:9) 스크린샷이어야 해요 — 전체 화면으로 보고 찍거나, 장면 캡처(S)로 찍은 장면을 쓰세요'); return; }
  const old = R.shots && R.shots[k];
  if (old && !confirm('이 라운드 ' + lab + ' 미니맵이 이미 있어요. 이 사진으로 바꿀까요?')) return;
  const name = VID + '_M' + MAPI + '_R' + pad(RN) + '_' + k + '_직접.jpg';
  await S.set({ ['img:' + name]: { thumb: out.thumb, full: out.full, at: Date.now(), kind: 'minimap', manual: true, h: 1080 } });
  // 라운드 기록에 넣기 (시각을 알면 그 시계로 라벨)
  const rk = 'rounds:' + VID, all = (await S.get(rk))[rk];
  const rr = all && all.rounds.find(r => r.map === MAPI && r.n === RN); if (!rr) { msg('라운드 기록을 못 찾았어요'); return; }
  rr.shots = rr.shots || {}; rr.shots[k] = name; rr.manual = Object.assign({}, rr.manual, { [k]: true });
  const clk = (sec != null && rr.t0 != null) ? 100 - (sec - rr.t0) : null;
  const L = (clk != null && clk > 0 && clk <= 100) ? fmt(clk) + ' · 직접' : lab + ' · 직접';
  if (k === '140') rr.lab140 = L; else if (k === '130') rr.lab130 = L; else rr.lab100 = L;
  await S.set({ [rk]: all });
  ROUNDS = all;
  if (KEY === 'tac') KEY = k;
  // 미니맵 채우려고 찍은 장면·스크린샷은 PPT·내보내기에서 뺌 (카드의 '↩ PPT에 다시 넣기'로 되돌림)
  let hid = '';
  if (src && src.scene && src.scene.key && !src.scene.hide) { await setSceneHide(src.scene.key, 'mm'); hid = ' · 이 장면은 PPT에서 빠짐'; }
  if (src && src.pic && !src.pic.hide) { src.pic.hide = 'mm'; await savePics(); hid = ' · 이 스크린샷은 내보내기에서 빠짐'; }
  const hadBoard = !!(await S.get(bKey()))[bKey()];
  await openRound();
  msg('R' + RN + ' ' + lab + ' 미니맵을 넣었어요' + hid + (hadBoard ? ' — 보드는 그대로 (요원 다시 읽기는 \'요원 자동 배치\')' : ''));
}
function paintMmState() {
  const k = mmKey(), has = R && R.shots && R.shots[k], man = R && R.manual && R.manual[k];
  $('mmState').textContent = has ? ('🗺 ' + mmKeyLab() + ' 미니맵 ' + (man ? '직접 넣음' : '있음')) : ('🗺 R' + RN + ' ' + mmKeyLab() + ' 미니맵 없음 — 아래 장면·스크린샷의 \'미니맵으로\' 또는');
  $('mmState').style.color = has ? '' : 'var(--amber,#e8b84b)';
}
$('mmUp').onclick = () => $('mmFile').click();
$('mmFile').onchange = async () => { const f = $('mmFile').files[0]; $('mmFile').value = ''; if (!f) return; const url = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); }); await useAsMinimap(url, null); };
document.addEventListener('paste', (e) => {
  const fs = [...(e.clipboardData ? e.clipboardData.items : [])].filter(x => x.kind === 'file' && /^image\//.test(x.type)).map(x => x.getAsFile()).filter(Boolean);
  if (!fs.length) return;   // 글자 붙여넣기는 그대로
  e.preventDefault(); fs.forEach(f => addPic(f));
});
$('picAdd').onclick = (e) => { e.preventDefault(); $('picFile').click(); };
$('picFile').onchange = () => { [...$('picFile').files].forEach(f => addPic(f)); $('picFile').value = ''; };
$('picDrop').addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); $('picDrop').classList.add('over'); } });
$('picDrop').addEventListener('dragleave', () => $('picDrop').classList.remove('over'));
$('picDrop').addEventListener('drop', (e) => { const fs = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type)); if (!fs.length) return; e.preventDefault(); $('picDrop').classList.remove('over'); fs.forEach(f => addPic(f)); });
$('lb').onclick = () => { $('lb').style.display = 'none'; };

/* ---------- 📋 텍틱 시트로 — 창은 tactic.js (1.11.0부터 분석 화면과 같이 씀) ---------- */
function tkTeams() {   // 두 팀 조합 (한글 요원 이름) — 파일 고르기·새 파일 이름에 씀
  if (!ROSTER || !ROSTER.teams) return [];
  return ['A', 'B'].map(t => { const T = ROSTER.teams[t] || {}; return { key: t, name: T.name || t, agents: (T.agents || []).filter(Boolean).map(a => (AGI[a] || {}).ko || a) }; }).filter(t => t.agents.length);
}
WonTactic.setup({ vid: () => VID, where: () => ({ map: MAPI, n: RN }), mapKo: () => MAPKO[ROSTER && ROSTER.mapName] || '', teams: tkTeams, msg: (t) => msg(t), onSent: () => { drawPics(); paintTkBoard(); } });
const tacOpen = (o) => WonTactic.open(o);
const tkSentTxt = WonTactic.sentTxt;
function paintTkBoard() {
  if (!TK_ON) { const r = $('tkBoardRow'); if (r) r.style.display = 'none'; return; }
  const el = $('tkBoardSent'); if (!el) return;
  const s = WonTactic.sent('board:' + MAPI + ':' + RN + ':' + KEY);
  el.textContent = s ? '📋 보냄: ' + tkSentTxt(s) : '';
}
if (!TK_ON) paintTkBoard();   // 공유판: 보드가 다 뜨기 전에도 텍틱 줄 숨김
$('tkBoard').onclick = () => {
  const lab = KEY === 'tac' ? '전술' : keyLab(KEY);
  WonTactic.open({ img: () => renderJpeg(B, R, KEY), memo: '', caption: 'R' + RN + ' · ' + lab, src: 'board:' + MAPI + ':' + RN + ':' + KEY, label: '보드 R' + RN + ' ' + lab, board: true });
  WonTactic.setImg('');
  renderPng(false).then(u => { const c = WonTactic.current(); if (c && c.board) WonTactic.setImg(u); }).catch(() => {});
};

/* ---------- 라운드 메모: 라운드마다 한 칸 (투명벽·1:25·1:00 공통) = 미니맵 모아보기 '해석 메모'(rounds:<영상>의 note) ---------- */
const oldNotes = (n) => n ? [['스타팅', n.start], ['스킬', n.skill], ['미드라운드', n.mid]].filter(x => String(x[1] || '').trim()).map(x => x[0] + ': ' + String(x[1]).trim()).join('\n') : '';
async function loadMemo() {
  let t = (R && R.note) || '';
  if (!t.trim()) {   // 예전 보드의 세 칸(스타팅·스킬·미드라운드)에 적어 둔 게 있으면 한 칸으로 옮김
    const ks = KEYS.map(k => 'board:' + VID + ':' + MAPI + ':' + RN + ':' + k), o = await S.get(ks);
    const parts = [...new Set(ks.map(k => oldNotes(o[k] && o[k].notes)).filter(Boolean))];
    if (parts.length) { t = parts.join('\n'); await saveMemo(t); }
  }
  $('nMemo').value = t; memoAt = [MAPI, RN];
  $('memoHd').textContent = '라운드 메모 — R' + RN;
}
let memoT = null;
async function saveMemo(text, m = MAPI, n = RN) {   // m·n: 적던 라운드 (라운드를 넘긴 뒤 늦게 저장돼도 엉뚱한 라운드에 안 들어가게)
  const k = 'rounds:' + VID, d = (await S.get(k))[k]; if (!d) return;
  const x = d.rounds.find(q => q.map === m && q.n === n); if (!x || (x.note || '') === text) return;
  x.note = text; d.noteAt = Date.now();
  const mine = ROUNDS && ROUNDS.rounds.find(q => q.map === m && q.n === n); if (mine) mine.note = text;
  await S.set({ [k]: d });
  msg('메모 저장됨 ' + new Date().toLocaleTimeString().slice(0, -3));
}
let memoAt = null;   // 메모 칸이 어느 라운드 것인지
$('nMemo').oninput = () => { clearTimeout(memoT); const t = $('nMemo').value, [m, n] = memoAt || [MAPI, RN]; memoT = setTimeout(() => saveMemo(t, m, n), 400); };
$('nMemo').onblur = () => { clearTimeout(memoT); const [m, n] = memoAt || [MAPI, RN]; saveMemo($('nMemo').value, m, n); };
chrome.storage.onChanged.addListener((ch, area) => {   // 미니맵 모아보기에서 고친 메모를 바로 반영
  const c = ch['rounds:' + VID]; if (area !== 'local' || !c || !c.newValue || !ROUNDS) return;
  c.newValue.rounds.forEach(nr => { const m = ROUNDS.rounds.find(q => q.map === nr.map && q.n === nr.n); if (m) m.note = nr.note; });
  if (document.activeElement !== $('nMemo') && R) $('nMemo').value = R.note || '';
});
const memoOf = (r, boards) => (r.note && r.note.trim()) ? r.note : [...new Set(KEYS.map(k => oldNotes((boards[k] || {}).notes)).filter(Boolean))].join('\n');

/* ---------- 마우스 ---------- */
const pt = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const r = p.matrixTransform(svg.getScreenCTM().inverse()); return [r.x, r.y]; };
const itemAt = (e) => { const g = e.target.closest && e.target.closest('g.it'); return g ? B.items.find(it => it.id === g.dataset.id) : null; };
let drag = null;
svg.addEventListener('contextmenu', (e) => { const it = itemAt(e); e.preventDefault(); if (it) { push(); noteDel([it]); B.items = B.items.filter(x => x !== it); sel = null; save(); drawItems(); drawTeams(); } });
svg.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const [x, y] = pt(e); const it = itemAt(e);
  svg.setPointerCapture(e.pointerId);
  const h = e.target.dataset && e.target.dataset.h;
  if (h && it) {
    sel = it.id; push();
    if (h === 'o') drag = { mode: 'move', it, x0: x, y0: y, moved: false, snap: JSON.parse(JSON.stringify(it)) };
    else drag = { mode: 'handle', h, it };
    drawItems(); return;
  }
  if (pendAgent) {   // 요원 놓기
    push();
    const ex = B.items.find(i => i.t === 'agent' && i.team === pendAgent.team && i.agent === pendAgent.agent);
    if (ex) { ex.x = x; ex.y = y; ex.auto = false; } else B.items.push({ id: uid(), t: 'agent', agent: pendAgent.agent, team: pendAgent.team, x, y });
    pendAgent = null; save(); drawItems(); drawTeams(); msg(''); return;
  }
  if (pendAbil) {   // 누른 자리에 놓기 — 방향 있는 스킬은 누른 채 끌면 그쪽으로
    push();
    const it2 = makeAbil(pendAbil.agent, pendAbil.slot, pendAbil.team, x, y, -Math.PI / 2);
    B.items.push(it2); sel = it2.id;
    if (it2.a != null) drag = { mode: 'handle', h: 'a', it: it2, fresh: true };
    if (!e.shiftKey) pendAbil = null; drawAbil(); save(); drawItems(); return;
  }
  if (tool === 'erase') { if (it) { push(); noteDel([it]); B.items = B.items.filter(i => i !== it); save(); drawItems(); drawTeams(); } return; }
  if (tool === 'text') { drag = { mode: 'text', x, y, cx: e.clientX, cy: e.clientY }; return; }
  if (tool === 'arrow' || tool === 'pen') { push(); const n = { id: uid(), t: tool, pts: [[x, y]], color }; B.items.push(n); drag = { mode: 'draw', it: n }; return; }
  // 선택·이동
  if (it) { sel = it.id; push(); drag = { mode: 'move', it, x0: x, y0: y, moved: false, snap: JSON.parse(JSON.stringify(it)) }; if (it.t === 'agent') selectAgent(it.team, it.agent); drawItems(); }
  else { sel = null; drawItems(); }
});
svg.addEventListener('pointermove', (e) => {
  if (!drag) return; const [x, y] = pt(e);
  if (drag.mode === 'move') {
    const dx = x - drag.x0, dy = y - drag.y0; if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    const s = drag.snap, it = drag.it;
    if (it.pts) it.pts = s.pts.map(p => [p[0] + dx, p[1] + dy]);
    else { it.x = s.x + dx; it.y = s.y + dy; if (it.x2 != null) { it.x2 = s.x2 + dx; it.y2 = s.y2 + dy; } }
    it.auto = false; drawItems();
  } else if (drag.mode === 'line') { drag.it.x2 = x; drag.it.y2 = y; drawItems(); }
  else if (drag.mode === 'handle') {
    const it = drag.it;
    if (drag.h === 'r') it.r = Math.max(8, Math.hypot(x - it.x, y - it.y));
    else if (drag.h === 'a') {   // 방향(+길이): Shift = 15° 단위
      let a = Math.atan2(y - it.y, x - it.x); if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      const d = Math.hypot(x - it.x, y - it.y) * (it.ctr || it.k === 'cross' ? 2 : 1);
      if (!(drag.fresh && d < 6)) it.a = a;
      if (it.min < it.max && !(drag.fresh && d < 6)) it.L = Math.max(it.min, Math.min(it.max, d));
    }
    else if (drag.h === '1') { it.x = x; it.y = y; } else { it.x2 = x; it.y2 = y; }
    it.auto = false; drawItems();
  }
  else if (drag.mode === 'draw') {
    const p = drag.it.pts, l = p[p.length - 1];
    if (drag.it.t === 'arrow') { if (p.length === 1) p.push([x, y]); else p[p.length - 1] = [x, y]; }
    else if (Math.hypot(x - l[0], y - l[1]) > 4) p.push([x, y]);
    drawItems();
  }
});
svg.addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.mode === 'text') { const d = drag; drag = null; setTimeout(() => openText({ clientX: d.cx, clientY: d.cy }, d.x, d.y), 0); return; }
  if (drag.mode === 'line') { const it = drag.it; if (Math.hypot(it.x2 - it.x, it.y2 - it.y) < 8) { it.x -= drag.def / 2; it.x2 = it.x + drag.def; it.y2 = it.y; } }
  if (drag.mode === 'draw' && drag.it.pts.length < 2) B.items = B.items.filter(i => i !== drag.it);
  if (drag.mode === 'move' && !drag.moved) undo.pop();
  drag = null; save(); drawItems(); drawTeams();
});
svg.addEventListener('wheel', (e) => {
  const it = itemAt(e) || B.items.find(i => i.id === sel);
  if (!it || it.t !== 'abil' || (it.k !== 'circle' && it.a == null)) return;
  e.preventDefault(); push();
  if (it.k === 'circle') it.r = Math.max(8, it.r * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  else it.a += (e.deltaY < 0 ? -1 : 1) * Math.PI / 24;   // 방향 스킬: 휠로 7.5°씩 돌리기
  sel = it.id; save(); drawItems();
}, { passive: false });
svg.addEventListener('dragover', (e) => e.preventDefault());
svg.addEventListener('drop', (e) => {
  e.preventDefault(); let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (x) { return; }
  const [x, y] = pt(e);
  if (d.abil) {   // 끌어다 놓은 자리가 시작점, 방향은 요원 → 그 자리
    const ag = B.items.find(i => i.t === 'agent' && i.team === d.abil.team && i.agent === d.abil.agent);
    const ang = ag && Math.hypot(x - ag.x, y - ag.y) > 5 ? Math.atan2(y - ag.y, x - ag.x) : -Math.PI / 2;
    placeAbil(d.abil.agent, d.abil.slot, d.abil.team, x, y, ang); return;
  }
  push();
  const ex = B.items.find(i => i.t === 'agent' && i.team === d.team && i.agent === d.agent);
  if (ex) { ex.x = x; ex.y = y; } else B.items.push({ id: uid(), t: 'agent', agent: d.agent, team: d.team, x, y });
  save(); drawItems(); drawTeams();
});
function openText(e, x, y) {
  const inp = $('txtIn'), r = $('stage').getBoundingClientRect();
  inp.style.left = (e.clientX - r.left) + 'px'; inp.style.top = (e.clientY - r.top - 14) + 'px'; inp.style.display = 'block'; inp.value = ''; inp.focus();
  inp.onkeydown = (ev) => {
    if (ev.key === 'Enter' && inp.value.trim()) { push(); B.items.push({ id: uid(), t: 'text', x, y, text: inp.value.trim(), color }); inp.style.display = 'none'; save(); drawItems(); }
    else if (ev.key === 'Escape') inp.style.display = 'none';
    ev.stopPropagation();
  };
  inp.onblur = () => { inp.style.display = 'none'; };
}

/* ---------- 도구·키 ---------- */
function paintTools() { [...$('tools').querySelectorAll('button[data-t]')].forEach(b => b.classList.toggle('on', b.dataset.t === tool)); svg.style.cursor = tool === 'sel' && !pendAbil && !pendAgent ? 'default' : 'crosshair'; }
$('tools').onclick = (e) => { const b = e.target.closest('button[data-t]'); if (!b) return; tool = b.dataset.t; pendAbil = null; pendAgent = null; paintTools(); drawAbil(); };
$('undo').onclick = doUndo;
document.addEventListener('keydown', (e) => {
  const tg = (e.target.tagName || '').toLowerCase(); if (tg === 'textarea' || tg === 'input' || tg === 'select') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (sel) { push(); noteDel(B.items.filter(i => i.id === sel)); B.items = B.items.filter(i => i.id !== sel); sel = null; save(); drawItems(); drawTeams(); } return; }
  if (e.key === 'Escape') { pendAbil = null; pendAgent = null; sel = null; paintTools(); drawAbil(); drawItems(); drawTeams(); msg(''); return; }
  if (/^[1-5]$/.test(e.key) && selAgent && AGI[selAgent.agent]) { const slot = ['Grenade', 'Ability1', 'Ability2', 'Ultimate', 'Star'][+e.key - 1]; if (slot === 'Star' ? selAgent.agent === 'Astra' : AGI[selAgent.agent].abilities.some(a => a.slot === slot)) placeAbilNear(selAgent.agent, slot, selAgent.team); return; }
  if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) { toggleDone(); return; }
  const m = { v: 'sel', a: 'arrow', p: 'pen', t: 'text', e: 'erase' }[e.key.toLowerCase()];
  if (m) { tool = m; pendAbil = null; paintTools(); return; }
  if (e.key === ',' ) $('prev').click(); if (e.key === '.') $('next').click();
});

/* ---------- 상단 ---------- */
$('mapSel').onchange = () => { MAPI = +$('mapSel').value; RN = (ROUNDS.rounds.find(r => r.map === MAPI) || {}).n || 1; openRound(); };
$('rSel').onchange = () => { RN = +$('rSel').value; openRound(); };
const stepRound = (d) => { const rs = ROUNDS.rounds.filter(r => r.map === MAPI); const i = rs.findIndex(r => r.n === RN); const n = rs[i + d]; if (n) { RN = n.n; openRound(); } };
$('prev').onclick = () => stepRound(-1); $('next').onclick = () => stepRound(1);
$('keySeg').onclick = (e) => { const b = e.target.closest('button'); if (!b || b.dataset.k === KEY) return; KEY = b.dataset.k; openRound(); };
/* 겹쳐보기 켜기·진하기는 기억 (내보내기·시트 그림도 이 값으로) — 처음은 진하게(100) */
const saveUnder = async () => { const p = (await S.get('prefs')).prefs || {}; p.underOn = $('under').checked; p.underOp = +$('op').value; await S.set({ prefs: p }); };
$('under').onchange = () => { drawMap(); saveUnder(); }; $('op').oninput = drawMap; $('op').onchange = saveUnder;
$('auto').onclick = () => autoPlace('agents');
$('autoAb').onclick = () => autoPlace('abil');
$('clr').onchange = () => { const v = $('clr').value; $('clr').value = ''; clearItems(v); };
$('autoAll').onclick = () => {
  if (!confirm('이 맵의 모든 라운드 보드를 방송 미니맵에서 다시 읽을까요?\n\n· 직접 놓거나 옮기거나 돌린 요원·스킬, 화살표·글자는 그대로\n· 지운 자동 항목은 다시 안 생김\n· 1:25·1:00에 자동으로 들어갔던(손 안 댄) 연막·벽은 빠짐\n· 요원을 하나도 안 옮긴 보드만 요원 자리를 새로 읽음\n· ✅ 대조 끝 표시한 보드는 아예 안 건드림\n\n끝난 뒤 마음에 안 들면 ↩ 되돌리기로 전부 원래대로 돌아가요.')) return;
  autoAll({ redo: true });
};
async function paintBak() { const k = 'boardBak:' + VID + ':' + MAPI, b = (await S.get(k))[k]; $('bak').style.display = b ? '' : 'none'; if (b) $('bak').title = new Date(b.at).toLocaleString() + ' 자동 배치 전으로 이 맵 보드를 전부 되돌리기'; }
$('bak').onclick = async () => {
  const k = 'boardBak:' + VID + ':' + MAPI, b = (await S.get(k))[k]; if (!b) return;
  if (!confirm('이 맵 보드를 ' + new Date(b.at).toLocaleTimeString() + ' 자동 배치 전으로 되돌릴까요?')) return;
  clearTimeout(saveT); saveT = null;
  const all = []; ROUNDS.rounds.filter(r => r.map === MAPI).forEach(r => KEYS.forEach(kk => all.push('board:' + VID + ':' + MAPI + ':' + r.n + ':' + kk)));
  const gone = all.filter(x => !b.boards[x]);
  await S.set(b.boards); if (gone.length) await S.remove(gone); await S.remove(k);
  await openRound(); paintBak(); msg('자동 배치 전으로 되돌렸어요');
};
$('flip').onclick = () => { B.flip = !B.flip; save(); drawTeams(); drawItems(); };
$('sheet').onclick = async () => { await fromSheet(false); await drawMap(); drawTeams(); drawItems(); };

/* ---------- PNG 저장 (그림을 모두 속에 넣은 SVG → 캔버스) ---------- */
const dataUrlCache = {};
async function toDataUrl(u) {
  if (!u || u.startsWith('data:')) return u;
  if (dataUrlCache[u]) return dataUrlCache[u];
  const b = await (await fetch(u)).blob();
  return (dataUrlCache[u] = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }));
}
async function renderPng(withUnder) {
  const keepSel = sel; sel = null; EXPORT = true; drawItems();
  const clone = svg.cloneNode(true);
  sel = keepSel; EXPORT = false; drawItems();
  if (!withUnder) clone.querySelector('#gUnder').textContent = '';
  clone.querySelector('#gTemp').textContent = '';
  for (const im of clone.querySelectorAll('image')) im.setAttribute('href', await toDataUrl(im.getAttribute('href')));
  // 제목 띠
  const cap = document.createElementNS(NS, 'text');
  cap.setAttribute('x', 16); cap.setAttribute('y', 1004); cap.setAttribute('fill', '#e9eef5'); cap.setAttribute('font-size', 24); cap.setAttribute('font-family', 'system-ui, Malgun Gothic, sans-serif');
  cap.textContent = (ROSTER.mapName || '') + ' · R' + RN + ' ' + keyLab(KEY) + ' · ' + (ROSTER.teams[defTeamFor(RN, B.flip)].name || '') + ' 수비 · ' + (ROSTER.teams.A.name || 'A') + ' ' + (ROSTER.left === 'B' ? R.sR + ':' + R.sL : R.sL + ':' + R.sR) + ' ' + (ROSTER.teams.B.name || 'B');
  clone.appendChild(cap);
  clone.setAttribute('width', 1024); clone.setAttribute('height', 1024);
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', 1024); bg.setAttribute('height', 1024); bg.setAttribute('fill', '#070b10'); clone.insertBefore(bg, clone.firstChild);
  const txt = new XMLSerializer().serializeToString(clone);
  const img = await WonMapReg.loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt));
  const c = document.createElement('canvas'); c.width = c.height = 1024; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}
$('png').onclick = async () => {
  msg('그림 만드는 중…');
  const url = await renderPng(false);
  const prefs = (await S.get('prefs')).prefs || {};
  const folder = safeName(prefs.folder || '관전캡처', 40) + '/' + safeName(ROUNDS.title || VID) + ' [' + VID + ']/보드/';
  const name = '보드_M' + MAPI + '_R' + pad(RN) + '_' + keyLab(KEY).replace(':', '-') + '.png';
  await chrome.downloads.download({ url, filename: folder + name, conflictAction: 'overwrite', saveAs: false });
  msg('저장 → 다운로드/' + folder + name);
};
/* ---------- 시트로 보내기: 이 맵에서 보드를 만든 라운드를 모두 그림(jpeg)+메모로 묶어 Apps Script 웹 앱에 보냄 ---------- */
async function renderJpeg(bstate, round, key) {   // 내보내기·시트용 그림 — '방송 미니맵 겹쳐보기'가 켜져 있으면 그 라운드 미니맵을 그 진하기로 깔아서
  const keep = { B, R, RN, KEY, CROPURL, CROP };
  B = bstate; R = round; RN = round.n; KEY = key;
  const under = key !== 'tac' && $('under').checked;
  if (under) {
    const shot = round.shots && (round.shots[key] || round.shots['130'] || round.shots['140'] || round.shots['100']);
    const rec = shot ? (await S.get('img:' + shot))['img:' + shot] : null;
    CROPURL = rec ? (rec.full || rec.thumb) : null;
    await drawMap();
  }
  drawItems();
  const png = await renderPng(under && !!CROPURL);
  B = keep.B; R = keep.R; RN = keep.RN; KEY = keep.KEY; CROPURL = keep.CROPURL; CROP = keep.CROP;
  if (under) await drawMap();
  drawItems();
  const im = await WonMapReg.loadImg(png), c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d'); x.fillStyle = '#070b10'; x.fillRect(0, 0, 1024, 1024); x.drawImage(im, 0, 0);
  return c.toDataURL('image/jpeg', 0.86);
}
async function smallIcons() {   // 정리 슬라이드 표지에 넣을 요원 얼굴(64px)
  const out = {};
  for (const a of [...ROSTER.teams.A.agents, ...ROSTER.teams.B.agents]) {
    if (!a || out[a] || !AGI[a]) continue;
    try { const im = await WonMapReg.loadImg(iconUrl(a)); const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d').drawImage(im, 0, 0, 64, 64); out[a] = c.toDataURL('image/png'); } catch (e) {}
  }
  return out;
}
async function sceneJpeg(u, ann) {   // 장면·스크린샷 → 1280x720 jpeg (정리 슬라이드 16:9 칸에 안 찌그러지게 가운데 맞춤 · ann = 분석 화면에서 그린 것)
  try {
    const src = (ann && ann.length) ? await WonAnn.apply(u, ann, 1920, 0.9) : u;
    const im = await WonMapReg.loadImg(src), W = 1280, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.fillStyle = '#0D1526'; x.fillRect(0, 0, W, H);
    const sc = Math.min(W / im.width, H / im.height), w = Math.round(im.width * sc), h = Math.round(im.height * sc);
    x.drawImage(im, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
    return c.toDataURL('image/jpeg', 0.8);
  } catch (e) { return null; }
}
async function sendToSheet() {
  const btn = $('send'); btn.disabled = true;
  try {
    const cfg = await sheetCfg();
    if (!ACT) { save(B.auto); clearTimeout(memoT); await saveMemo($('nMemo').value); await new Promise(r => setTimeout(r, 400)); }   // 분석 화면이 뒤에서 연 보드는 아무것도 저장 안 함 (빈 보드가 생기지 않게)
    const rs = ROUNDS.rounds.filter(r => r.map === MAPI);
    // 보드가 없는 라운드·장면은 먼저 자동 배치 (보내기 전에 '이 맵 전부 자동 배치'를 안 눌렀어도 빠짐없이)
    const OK = await OUTK(), BK = await BOARDK(), MODE = await OUTMODE();
    if (MODE === 'all' && readyForAuto()) { const made = await autoAll({ quiet: true, keys: BK }); if (made) msg('빠진 보드 ' + made + '장 자동 배치함 — 보내는 중…'); }
    const keys = []; rs.forEach(r => KEYS.forEach(k => keys.push('board:' + VID + ':' + MAPI + ':' + r.n + ':' + k)));
    const saved = await S.get(keys), sceneLog = (await S.get('log:' + VID))['log:' + VID] || [];
    const extra = await S.get(rs.map(r => WonAnn.key(VID, MAPI, r.n)).concat(rs.map(r => 'pics:' + VID + ':' + MAPI + ':' + r.n), ['view:' + VID]));   // 분석 화면에서 그린 것 · 붙인 스크린샷 · 보기(미니맵만/화면 전체)
    const VIEW = extra['view:' + VID] || {};
    const shown = async (u, key, ann) => {   // 1.11.6 분석 화면에 보이는 대로: 장면은 미니맵만 크게(코치가 M으로 바꾼 건 그대로) + 그 보기에 그린 것
      const crop = await WonScenes.cropMinimap(u), mm = WonScenes.viewMode(key, VIEW, ann, !!crop) === 'mm';
      return sceneJpeg(mm ? crop.full : u, ann[mm ? key + '#mm' : key]);
    };
    const out = [];
    for (const r of rs) {
      const images = {}, bs = {}, ann = extra[WonAnn.key(VID, MAPI, r.n)] || {};
      for (const k of KEYS) { const b = saved['board:' + VID + ':' + MAPI + ':' + r.n + ':' + k]; if (b) bs[k] = b; }   // 메모·공수는 세 장면 다 봄
      let board140 = false;
      for (const k of OK) {
        msg('그림 만드는 중… R' + r.n + ' ' + (k === '140' ? (r.lab140 || '투명벽') : k === '130' ? (r.lab130 || '1:30') : '1:00'));
        const b = bs[k];
        if (BK.includes(k) && b && (MODE === 'all' || manualBoard(b))) { images[k] = await renderJpeg(b, r, k); if (k === '140') board140 = true; }
        else { const ph = await photoJpeg(r, k, ann['mm:' + k]); if (ph) images[k] = ph; }   // 방송 미니맵 사진 (분석 화면에서 그린 것 포함)
      }
      const notes = { memo: memoOf(r, bs) };
      // 🎬 코치가 영상 보며 찍은 장면(스샷+메모) → 정리 슬라이드 '코치 장면' 장 · 보기 페이지
      const scenes = [];
      if ((ann['mm:140'] || []).length && r.shots && r.shots['140'] && board140) {   // 오프닝 칸이 보드일 때만: 투명벽 미니맵 사진에 그린 것은 코치 장면 장으로
        const rec = (await S.get('img:' + r.shots['140']))['img:' + r.shots['140']];
        if (rec && rec.full) scenes.push({ seq: '투명벽', sec: shotSec(r, '140'), memo: '', raw: '', img: await sceneJpeg(rec.full, ann['mm:140']) });
      }
      for (const sc of shownScenes(await scenesOf(r, sceneLog))) {
        msg('장면 그림 줄이는 중… R' + r.n + ' 🎬 ' + sc.seq);
        scenes.push({ seq: String(sc.seq), sec: Math.floor(sc.sec), memo: sc.memo, raw: sc.raw && sc.raw !== sc.memo ? sc.raw : '', img: sc.img ? await shown(sc.img, 'scn:' + sc.key, ann) : null });
      }
      const pics = shownPics(extra['pics:' + VID + ':' + MAPI + ':' + r.n] || []);   // 📎 붙인 스크린샷도 코치 장면 장으로 (1.11.0)
      for (let i = 0; i < pics.length; i++) scenes.push({ seq: '스샷' + (i + 1), sec: Math.floor(r.t0 != null ? r.t0 : (r.jump || 0)), memo: pics[i].cap || '', raw: '', img: await shown(pics[i].img, 'pic:' + pics[i].id, ann) });
      const b130 = saved['board:' + VID + ':' + MAPI + ':' + r.n + ':130'] || saved['board:' + VID + ':' + MAPI + ':' + r.n + ':100'];
      if (Object.keys(images).length || scenes.length) out.push({ n: r.n, sL: r.sL, sR: r.sR, win: r.win || null, t: Math.floor(r.jump), t0: r.t0 != null ? Math.floor(r.t0) : null, notes, images, scenes, def: defTeamFor(r.n, b130 && b130.flip), lab130: r.lab130 || '1:30', lab140: r.lab140 || '투명벽', lab100: r.lab100 || '1:00' });
    }
    if (!out.length) throw new Error('이 맵에 저장된 보드가 없어요');
    const hf = hudFinal(), fin = ROSTER.left === 'B' ? [hf[1], hf[0]] : hf;   // 시트에는 A : B 순서로
    const body = { token: cfg.token, vid: VID, title: ROUNDS.title, mapIdx: MAPI, mapName: ROSTER.mapName, mapStart: (ROSTER.sheet && ROSTER.sheet.gameStart) || Math.floor((rs[0] || {}).jump || 0),
      firstDef: ROSTER.firstDef, left: ROSTER.left || null, teams: ROSTER.teams, final: fin.join(' : '), rounds: out, outKeys: OK, mapLabel: mapLabel(MAPI, ROSTER.mapName), icons: await smallIcons() };
    msg('시트로 보내는 중… (' + out.length + '라운드 · 30초~1분 걸려요)');
    delete body.token; const j = await postBoard(body);
    if (!j.ok) throw new Error(j.err || '실패');
    await S.set({ ['sent:' + VID + ':' + MAPI]: { at: Date.now(), rounds: out.length, deck: j.deck || null } });   // 관리 페이지 '스크랩한 경기' · 분석 화면 '정리 슬라이드 ↗' (1.11.4: 주소도)
    const done = 'PPT(정리 슬라이드)에 올림 ✓ ' + j.rounds + '라운드' + (j.scenes ? ' · 코치 장면 ' + j.scenes + '개' : '') + (j.deckErr ? ' · 정리 슬라이드를 못 만들었어요: ' + j.deckErr : '');
    msg(done);
    btn.disabled = false;
    return { ok: !j.deckErr, text: done, deck: j.deck || null };
  } catch (e) { msg('보내기 실패: ' + e.message); btn.disabled = false; return { ok: false, text: '보내기 실패: ' + e.message }; }
}
$('send').onclick = sendToSheet;
$('moreBtn').onclick = () => { const on = $('moreBox').classList.toggle('on'); $('moreBtn').classList.toggle('on', on); $('moreBtn').textContent = on ? '더보기 ▴' : '더보기 ▾'; };
/* ---------- 자료 내보내기: 이 맵의 라운드마다 보드 3장(스킬·동선 그린 그대로) + 라운드 메모 → 한 파일 ----------
   다운로드/관전캡처/<경기> [영상]/보드/보드정리_1맵(선셋).html (그림 포함, 그대로 열어 보기·공유) + .md + .json(Claude가 덱 만들 때 읽는 용) */
async function shrink(dataUrl, W) {
  const im = await WonMapReg.loadImg(dataUrl), c = document.createElement('canvas'); c.width = c.height = W;
  c.getContext('2d').drawImage(im, 0, 0, W, W); return c.toDataURL('image/jpeg', 0.82);
}
const clockSec = (lab) => { const m = /(\d):(\d\d)/.exec(String(lab || '')); return m ? +m[1] * 60 + +m[2] : null; };
const shotSec = (r, k) => {   // 그 장면이 영상 몇 초인지 (라운드 시작 t0 = 1:40 기준)
  const t0 = r.t0 != null ? r.t0 : (r.jump || 0) + 5, lab = k === '140' ? r.lab140 : k === '130' ? (r.lab130 || '1:30') : (r.lab100 || '1:00'), cs = clockSec(lab);
  return Math.floor(t0 + (k === '140' ? (cs != null && cs <= 100 ? 100 - cs : 1) : k === '130' ? (cs != null ? 100 - cs : 15) : (cs != null && !/설치/.test(lab || '') ? 100 - cs : 40)));
};
async function exportDoc() {
  const btn = $('exp'); btn.disabled = true;
  try {
    save(B.auto); clearTimeout(memoT); if (memoAt) await saveMemo($('nMemo').value, memoAt[0], memoAt[1]); await new Promise(r => setTimeout(r, 400));
    const rs = ROUNDS.rounds.filter(r => r.map === MAPI);
    const OK = await OUTK(), BK = await BOARDK(), one = false;   // (one: 예전 '투명벽 보드만' 모양 — 이제 안 씀)
    if ((await OUTMODE()) === 'all' && readyForAuto()) { const made = await autoAll({ quiet: true, keys: BK }); if (made) msg('빠진 보드 ' + made + '장 자동 배치함'); }
    const keys = []; rs.forEach(r => { KEYS.concat('tac').forEach(k => keys.push('board:' + VID + ':' + MAPI + ':' + r.n + ':' + k)); keys.push('pics:' + VID + ':' + MAPI + ':' + r.n); });
    const saved = await S.get(keys), sceneLog = (await S.get('log:' + VID))['log:' + VID] || [];
    const A = ROSTER.teams.A, Bt = ROSTER.teams.B, label = mapLabel(MAPI, ROSTER.mapName);
    const shrinkW = async (u, W) => { const im = await WonMapReg.loadImg(u); if (im.width <= W) return u; const c = document.createElement('canvas'); c.width = W; c.height = Math.round(im.height * W / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.82); };
    const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const yt = (sec) => 'https://www.youtube.com/watch?v=' + VID + '&t=' + Math.max(0, Math.floor(sec)) + 's';
    const labOf = (r, k) => k === '140' ? (r.lab140 || '투명벽') : k === '130' ? (r.lab130 || '1:30') : (r.lab100 || '1:00');
    const scAB = (r) => ROSTER.left === 'B' ? [r.sR, r.sL] : [r.sL, r.sR];
    const hf = hudFinal(), fin = ROSTER.left === 'B' ? [hf[1], hf[0]] : hf;
    const agents = (T) => (T.agents || []).filter(Boolean).map(a => (AGI[a] && AGI[a].ko) || a).join(' · ');
    let html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(label + ' ' + (A.name || 'A') + ' vs ' + (Bt.name || 'B')) + ' — 보드 정리</title><style>' +
      'body{font-family:system-ui,"Malgun Gothic",sans-serif;background:#151a24;color:#eef1f6;margin:0;padding:24px}h1{font-size:20px;margin:0 0 6px}.sub{color:#9aa6b8;font-size:13px;line-height:1.7}a{color:#7cc4ff}' +
      'h2{color:#e8b84b;font-size:15px;margin:26px 0 8px}.r{display:grid;grid-template-columns:110px repeat(3,minmax(0,260px)) minmax(220px,1fr);gap:12px;align-items:start;background:#1f2634;border:1px solid #3a4763;border-radius:10px;padding:10px;margin:8px 0}' +
      '.r.one{grid-template-columns:110px minmax(0,300px) minmax(0,1.7fr) minmax(220px,1fr)}.scn{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}.scn .cap{text-align:left}' +
      '.x{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin:0 0 14px 24px;padding:10px;border-left:2px dashed #3a4763}.x img{width:100%;border-radius:6px;display:block}' +
      '.r.def{border-left:4px solid #3fb8b0}.r.atk{border-left:4px solid #d0504a}.r img{width:100%;border-radius:6px;display:block}.cap{color:#9aa6b8;font-size:11px;text-align:center;margin-top:3px}.n{font-size:18px;font-weight:800}.sc{color:#9aa6b8;font-size:12px;line-height:1.6}' +
      '.memo{white-space:pre-wrap;line-height:1.6;font-size:13px}.none{aspect-ratio:1;border:1px dashed #3a4763;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#667;font-size:12px}.dt{color:#3fb8b0;font-weight:700}.at{color:#d0504a;font-weight:700}' +
      '@media (max-width:900px){.r{grid-template-columns:1fr 1fr}}</style></head><body>' +
      '<h1>' + esc(label) + ' · ' + esc(A.name || 'A') + ' vs ' + esc(Bt.name || 'B') + '</h1><div class="sub">' + esc(ROUNDS.title || '') + '<br>' +
      '<b>' + esc(A.name || 'A') + '</b> ' + esc(agents(A)) + '<br><b>' + esc(Bt.name || 'B') + '</b> ' + esc(agents(Bt)) + '<br>' +
      (fin[0] != null ? '최종 ' + esc((A.name || 'A') + ' ' + fin.join(' : ') + ' ' + (Bt.name || 'B')) + ' · ' : '') + '<a href="' + yt(rs[0] ? rs[0].jump : 0) + '">유튜브 영상</a> · 왼쪽 띠 = 그 라운드 ' + esc(A.name || 'A') + '의 공수(청록 수비 / 빨강 공격) · 그림을 누르면 그 시점 영상</div>';
    let md = '# ' + label + ' · ' + (A.name || 'A') + ' vs ' + (Bt.name || 'B') + ' — 보드 정리\n\n' + (ROUNDS.title || '') + '\n\n- ' + (A.name || 'A') + ': ' + agents(A) + '\n- ' + (Bt.name || 'B') + ': ' + agents(Bt) + '\n- 영상: https://www.youtube.com/watch?v=' + VID + '\n\n| 라운드 | 점수(' + (A.name || 'A') + ':' + (Bt.name || 'B') + ') | 수비 | 시작 | 메모 |\n|---|---|---|---|---|\n';
    const json = { app: 'won-clip', kind: 'boards', vid: VID, title: ROUNDS.title, map: MAPI, mapName: ROSTER.mapName, mapLabel: label, teams: { A: { name: A.name, agents: A.agents }, B: { name: Bt.name, agents: Bt.agents } }, final: fin, url: 'https://www.youtube.com/watch?v=' + VID, rounds: [] };
    let prevHalf = null, done = 0;
    for (const r of rs) {
      const bs = {}; KEYS.forEach(k => { const b = saved['board:' + VID + ':' + MAPI + ':' + r.n + ':' + k]; if (b) bs[k] = b; });
      const memo = memoOf(r, bs), sc = scAB(r);
      const b0 = bs['130'] || bs['100'] || bs['140'], def = defTeamFor(r.n, b0 && b0.flip), atk = other(def);
      const half = r.n <= 12 ? '전반' : r.n <= 24 ? '후반' : '연장';
      if (half !== prevHalf) { html += '<h2>' + half + ' — ' + esc(ROSTER.teams[def].name || def) + ' 수비 · ' + esc(ROSTER.teams[atk].name || atk) + ' 공격</h2>'; prevHalf = half; }
      html += '<div class="r ' + (def === 'A' ? 'def' : 'atk') + (one ? ' one' : '') + '"><div><div class="n">R' + r.n + '</div><div class="sc">' + esc(sc[0]) + ' : ' + esc(sc[1]) + '<br><span class="dt">' + esc(ROSTER.teams[def].name || def) + '</span> 수비<br><span class="at">' + esc(ROSTER.teams[atk].name || atk) + '</span> 공격</div><a href="' + yt((r.t0 != null ? r.t0 : r.jump) - 5) + '">▶ ' + fmt(r.jump) + '</a></div>';
      const tac = saved['board:' + VID + ':' + MAPI + ':' + r.n + ':tac'], pics = shownPics(saved['pics:' + VID + ':' + MAPI + ':' + r.n] || []), scenes = shownScenes(await scenesOf(r, sceneLog));
      const sceneHtml = async () => { let h = ''; for (const sc of scenes) h += '<div>' + (sc.img ? '<a href="' + yt(sc.sec - 2) + '"><img src="' + await shrinkW(sc.img, 1000) + '"></a>' : '') + '<div class="cap"><a href="' + yt(sc.sec - 2) + '">🎬 ' + esc(sc.seq) + ' · ' + fmt(sc.sec) + '</a> ' + esc(sc.memo) + '</div></div>'; return h; };
      for (const k of OK) {
        const lab = labOf(r, k);
        if (!BK.includes(k)) {   // 방송 미니맵 사진
          msg('자료 만드는 중… R' + r.n + ' ' + lab + ' (' + (++done) + ')');
          const ph = await photoJpeg(r, k);
          html += ph ? '<div><a href="' + yt(shotSec(r, k)) + '"><img src="' + await shrink(ph, 620) + '"></a><div class="cap">' + esc(lab) + ' · 방송 미니맵</div></div>' : '<div><div class="none">미니맵 없음</div><div class="cap">' + esc(lab) + '</div></div>';
        } else if (bs[k]) {
          msg('자료 만드는 중… R' + r.n + ' ' + lab + ' (' + (++done) + ')');
          const im = await shrink(await renderJpeg(bs[k], r, k), 620);
          html += '<div><a href="' + yt(shotSec(r, k)) + '"><img src="' + im + '"></a><div class="cap">' + esc(lab) + '</div></div>';
        } else html += '<div><div class="none">보드 없음</div><div class="cap">' + esc(lab) + '</div></div>';
      }
      if (one) { msg('자료 만드는 중… R' + r.n + ' 장면'); html += '<div class="scn">' + (scenes.length ? await sceneHtml() : '<div class="sc">(찍은 장면 없음)</div>') + '</div>'; }
      html += '<div class="memo">' + (memo.trim() ? esc(memo) : '<span class="sc">(메모 없음)</span>') + '</div></div>';
      if ((tac && tac.items && tac.items.length) || pics.length || (!one && scenes.length)) {   // ✏️ 전술 보드 + (세 장면 모드면 🎬 찍은 장면) + 📎 스크린샷 줄
        html += '<div class="x">';
        if (tac && tac.items && tac.items.length) { msg('자료 만드는 중… R' + r.n + ' 전술'); html += '<div><a href="' + yt(shotSec(r, '130')) + '"><img src="' + await shrink(await renderJpeg(tac, r, 'tac'), 620) + '"></a><div class="cap">✏️ 전술</div></div>'; }
        if (!one) html += await sceneHtml();
        for (const pc of pics) html += '<div><img src="' + await shrinkW(pc.img, 1000) + '"><div class="cap">📎 ' + esc(pc.cap || '') + '</div></div>';
        html += '</div>';
      }
      const extra = [(tac && tac.items && tac.items.length) ? '✏️ 전술 보드' : '', scenes.length ? '🎬 찍은 장면 ' + scenes.length + '장' : '', pics.length ? '📎 스크린샷 ' + pics.length + '장' : ''].filter(Boolean).join(' · ');
      md += '| R' + r.n + ' | ' + sc[0] + ':' + sc[1] + ' | ' + (ROSTER.teams[def].name || def) + ' | [' + fmt(r.jump) + '](' + yt(r.jump) + ') | ' + memo.replace(/\|/g, '/').replace(/\n/g, '<br>') + (extra ? '<br>(' + extra + ' — html 참고)' : '') + ' |\n';
      json.rounds.push({ round: r.n, scoreA: sc[0], scoreB: sc[1], defender: def, start: Math.floor(r.jump), link: yt(r.jump), memo, photos: OK.filter(k => !BK.includes(k) && r.shots && r.shots[k]).map(k => ({ key: k, label: labOf(r, k), sec: shotSec(r, k) })), shots: BK.filter(k => bs[k]).map(k => ({ key: k, label: labOf(r, k), sec: shotSec(r, k), items: bs[k].items.filter(it => it.t === 'agent' || it.t === 'abil').map(it => ({ t: it.t, team: it.team, agent: it.agent, slot: it.slot || null, x: Math.round(it.x), y: Math.round(it.y) })) })),
        tactic: (tac && tac.items && tac.items.length) ? tac.items.filter(it => it.t === 'agent' || it.t === 'abil').map(it => ({ t: it.t, team: it.team, agent: it.agent, slot: it.slot || null, x: Math.round(it.x), y: Math.round(it.y) })) : null,
        screenshots: pics.map(pc => ({ caption: pc.cap || '' })), scenes: scenes.map(sc => ({ seq: sc.seq, sec: sc.sec, memo: sc.memo })) });
    }
    html += '</body></html>';
    const prefs = (await S.get('prefs')).prefs || {};
    const folder = safeName(prefs.folder || '관전캡처', 40) + '/' + safeName(ROUNDS.title || VID) + ' [' + VID + ']/보드/';
    const base = '보드정리_' + safeName(label, 30);
    const dl = async (text, mime, name) => { const u = URL.createObjectURL(new Blob([text], { type: mime })); await chrome.downloads.download({ url: u, filename: folder + name, conflictAction: 'overwrite', saveAs: false }); setTimeout(() => URL.revokeObjectURL(u), 60000); };
    await dl(html, 'text/html', base + '.html');
    await dl(md, 'text/markdown', base + '.md');
    await dl(JSON.stringify(json, null, 1), 'application/json', base + '.json');
    msg('내보냄 ✓ ' + rs.length + '라운드 → 다운로드/' + folder + base + '.html (.md · .json)');
  } catch (e) { msg('내보내기 실패: ' + e.message); }
  btn.disabled = false;
}
$('exp').onclick = exportDoc;
S.get('prefs').then(o => { $('outK').value = ((o.prefs || {}).outKeys === 'all') ? 'all' : 'mm'; });
$('outK').onchange = async () => { const p = (await S.get('prefs')).prefs || {}; p.outKeys = $('outK').value; MODE = p.outKeys === 'all' ? 'all' : 'mm'; await S.set({ prefs: p }); msg($('outK').value === 'all' ? '보내기·내보내기: 세 장면 모두 보드' : '보내기·내보내기: 투명벽은 보드, 1:25·1:00은 방송 미니맵 사진 (+ 찍은 장면)'); };

window.__board = { useAsMinimap, cropMinimap, renderPng, sendToSheet, exportDoc, autoItems, clearItems, get CROP() { return CROP; }, autoAll, placeAbil, get B() { return B; }, get ROSTER() { return ROSTER; }, autoPlace, renderJpeg, get R() { return R; } };

/* ---------- 분석 화면이 맡긴 일 (보이지 않는 창) ---------- */
async function makeThumbs() {   // 빈 맵 보드 미리보기 그림 bimg:<영상>:<맵>:<라운드>:140 — 없거나 보드가 바뀐 것만
  const rs = ROUNDS.rounds.filter(r => r.map === MAPI);
  const bk = rs.map(r => 'board:' + VID + ':' + MAPI + ':' + r.n + ':140'), ik = rs.map(r => 'bimg:' + VID + ':' + MAPI + ':' + r.n + ':140');
  const got = await S.get(bk.concat(ik)); let n = 0;
  for (let i = 0; i < rs.length; i++) {
    const b = got[bk[i]]; if (!manualBoard(b)) continue;   // 1.11.5: 직접 만든 보드만 (자동으로만 놓인 오프닝 보드는 미리보기 안 만듦)
    const sig = WonAnn.sig(b); if (got[ik[i]] && got[ik[i]].sig === sig) continue;
    const jpg = await renderJpeg(b, rs[i], '140');
    const im = await WonMapReg.loadImg(jpg), c = document.createElement('canvas'); c.width = c.height = 720; c.getContext('2d').drawImage(im, 0, 0, 720, 720);
    await S.set({ [ik[i]]: { img: c.toDataURL('image/jpeg', 0.82), sig, at: Date.now() } }); n++;
  }
  return n;
}
const doneAct = (d) => { if (ACT && parent !== window) parent.postMessage(Object.assign({ won: 'board', type: 'done' }, d), '*'); };
init().then(async () => {
  if (ACT === 'send') doneAct(ROUNDS ? await sendToSheet() : { ok: false, text: '이 영상은 아직 라운드를 찾지 않았어요' });
  else if (ACT === 'thumbs') { try { doneAct({ ok: true, n: ROUNDS ? await makeThumbs() : 0 }); } catch (e) { doneAct({ ok: false, text: e.message }); } }
}).catch(e => { msg('오류: ' + e.message); doneAct({ ok: false, text: '오류: ' + e.message }); });
