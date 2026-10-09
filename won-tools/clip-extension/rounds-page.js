/* 라운드 미니맵 모아보기 */
const S = chrome.storage.local;
const $ = (id) => document.getElementById(id);
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const pad = (n) => String(n).padStart(2, '0');
const fmt = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(x); };
const safeName = (s, max = 60) => { s = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, ''); return s || 'untitled'; };
const VID = new URLSearchParams(location.search).get('v');
let DATA = null, show = 'all';
const MAPKO = { Abyss: '어비스', Ascent: '어센트', Bind: '바인드', Breeze: '브리즈', Corrode: '코로드', Fracture: '프랙처', Haven: '헤이븐', Icebox: '아이스박스', Lotus: '로터스', Pearl: '펄', Split: '스플릿', Summit: '서밋', Sunset: '선셋' };
const mapLabel = (d, m) => { const n = d && d.maps && d.maps[m] && d.maps[m].name; return m + '맵' + (n ? '(' + (MAPKO[n] || n) + ')' : ''); };

async function listAll() {
  const ks = S.getKeys ? (await S.getKeys()).filter(k => k.startsWith('rounds:')) : null;   // 그림까지 통째로 읽지 않게
  const all = ks ? await S.get(ks) : await S.get(null);
  const rs = Object.entries(all).filter(([k]) => k.startsWith('rounds:')).map(([, v]) => v).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const body = $('body'); body.textContent = '';
  $('ttl').textContent = '라운드 미니맵 — 경기 고르기';
  document.querySelector('.bar').style.display = 'none';
  if (!rs.length) { body.append(mk('p', 'sub', '아직 없어요. 유튜브 경기 영상 아래 "라운드 자동 찾기"를 눌러 보세요.')); return; }
  for (const r of rs) { const d = mk('p'); const a = mk('a', null, '🎯 ' + (r.title || r.vid)); a.href = '?v=' + encodeURIComponent(r.vid); d.append(a, document.createTextNode('  · 라운드 ' + r.rounds.length + '개')); body.append(d); }
}

/* 라운드별 코치 장면: 그 라운드 시작(배리어 5초 전) ~ 다음 라운드 시작 사이에 저장한 장면 */
//   (보드에서 ◀ ▶로 옮긴 장면은 scnMove:<영상>대로 — scenes-util.js)
async function scenesByRound(rounds) {
  const got = await S.get(['log:' + VID, 'scnMove:' + VID]);
  return WonScenes.assign(rounds, got['log:' + VID] || [], got['scnMove:' + VID] || {});
}
let saving = Promise.resolve();
function saveNote(r, text) {
  saving = saving.then(async () => {
    const d = (await S.get('rounds:' + VID))['rounds:' + VID]; if (!d) return;
    const x = d.rounds.find(q => q.map === r.map && q.n === r.n); if (!x || (x.note || '') === text) return;
    x.note = text; r.note = text; d.noteAt = Date.now();
    skipRedraw = true; await S.set({ ['rounds:' + VID]: d });
    $('msg').textContent = 'R' + r.n + ' 메모 저장됨';
  });
}
let skipRedraw = false;

async function draw() {
  DATA = (await S.get('rounds:' + VID))['rounds:' + VID];
  const body = $('body'); body.textContent = '';
  if (!DATA || !DATA.rounds || !DATA.rounds.length) { $('ttl').textContent = '라운드 미니맵'; body.append(mk('p', 'sub', '이 영상은 아직 라운드를 찾지 않았어요.')); return; }
  document.title = (DATA.title || VID) + ' — 라운드 미니맵';
  $('ttl').textContent = DATA.title || VID;
  $('meta').textContent = '';
  const yl = mk('a', null, '유튜브에서 열기'); yl.href = 'https://www.youtube.com/watch?v=' + VID; yl.target = '_blank';
  $('meta').append(yl, document.createTextNode('  · 라운드 ' + DATA.rounds.length + '개' + (DATA.partial ? ' (중간에 멈춤)' : '') + ' · 투명벽 / 오프닝(1:25) / 1:00 미니맵 자동 캡처'));
  const names = [];
  DATA.rounds.forEach(r => Object.values(r.shots || {}).forEach(n => names.push('img:' + n)));
  const imgs = names.length ? await S.get(names) : {};
  const scenes = await scenesByRound(DATA.rounds);
  const maps = {};
  DATA.rounds.forEach(r => (maps[r.map] = maps[r.map] || []).push(r));
  const multi = Object.keys(maps).length > 1;
  for (const m of Object.keys(maps)) {
    const hd = mk('h2', null, mapLabel(DATA, m)); hd.id = 'map-' + m; body.append(hd);
    const grid = mk('div', 'grid');
    for (const r of maps[m]) {
      if (r.n === 13) grid.append(mk('div', 'half', '후반 (공수 교대)'));
      if (r.n === 25) grid.append(mk('div', 'half', '연장'));
      const c = mk('div', 'card' + (r.win ? ' ' + r.win : '') + (show !== 'all' ? ' one' : ''));
      const h = mk('div', 'head');
      h.append(mk('span', 'rn', 'R' + r.n), mk('span', 'sc', r.sL + ' : ' + r.sR));
      const a = mk('a', null, '▶ ' + fmt(r.jump)); a.href = 'https://www.youtube.com/watch?v=' + VID + '&t=' + Math.floor(r.jump) + 's'; a.target = '_blank';
      h.append(a);
      const pics = mk('div', 'pics');
      const fig = (k, lab) => {
        const f = mk('figure'), n = r.shots && r.shots[k], rec = n ? imgs['img:' + n] : null;
        if (rec) {
          const im = document.createElement('img'); im.src = rec.full || rec.thumb; im.alt = 'R' + r.n + ' ' + lab;
          im.onclick = () => { $('lbImg').src = rec.full || rec.thumb; $('lbCap').textContent = 'R' + r.n + ' · ' + lab + ' · 점수 ' + r.sL + ':' + r.sR; $('lb').classList.add('on'); };
          f.append(im);
        } else f.append(mk('div', 'none', k === '100' && r.ended100 ? '1:00 전에 라운드가 끝났어요' : r.t0 == null ? '라운드 시작을 못 찾았어요' : k === '140' ? '투명벽 때 미니맵이 안 보였어요' : '못 찍었어요'));
        f.append(mk('figcaption', null, k === '100' && r.lab100 ? r.lab100 : lab + (k === '100' && r.planted100 ? ' · 설치 후' : '')));
        if (rec) { const bt = mk('a', 'bd', '🧩 보드'); bt.href = 'board.html?v=' + encodeURIComponent(VID) + '&m=' + r.map + '&r=' + r.n + '&k=' + k; bt.target = '_blank'; f.append(bt); }
        return f;
      };
      if (show === 'all' || show === '140') pics.append(fig('140', r.lab140 || '투명벽'));
      if (show === 'all' || show === '130') pics.append(fig('130', r.lab130 || '1:30'));
      if (show === 'all' || show === '100') pics.append(fig('100', '1:00'));
      c.append(h, pics);
      // 코치가 이 라운드 안에서 저장한 장면(S)
      const sc = scenes.get(r) || [];
      if (sc.length) {
        const box = mk('div', 'scenes');
        for (const x of sc) {
          const row = mk('a', 'scene'); row.href = 'https://www.youtube.com/watch?v=' + VID + '&t=' + Math.floor(x.sec) + 's'; row.target = '_blank';
          row.append(mk('b', null, x.seq), mk('span', null, ' ' + fmt(x.sec) + '  '), mk('span', 'sm', x.memo || '(메모 없음)'));
          box.append(row);
        }
        c.append(box);
      }
      // 해석 메모
      const ta = document.createElement('textarea'); ta.className = 'note'; ta.placeholder = '해석 메모 — 이 라운드에서 본 것 (자동 저장)';
      ta.value = r.note || '';
      let tmr = null;
      ta.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => saveNote(r, ta.value), 500); };
      ta.onblur = () => { clearTimeout(tmr); saveNote(r, ta.value); };
      c.append(ta);
      grid.append(c);
    }
    body.append(grid);
  }
  // 시트의 '🗂 미니맵' 링크로 열었으면 그 맵으로 (?m=2) — 처음 한 번만
  const wantM = new URLSearchParams(location.search).get('m');
  if (wantM && !draw.jumped) { draw.jumped = true; const t = document.getElementById('map-' + wantM); if (t) setTimeout(() => t.scrollIntoView({ block: 'start' }), 50); }
}

$('seg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; show = b.dataset.k; [...$('seg').children].forEach(x => x.classList.toggle('on', x === b)); draw(); };
$('size').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; document.documentElement.style.setProperty('--cw', b.dataset.s + 'px'); [...$('size').children].forEach(x => x.classList.toggle('on', x === b)); };
$('lb').onclick = () => $('lb').classList.remove('on');
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('lb').classList.remove('on'); });
$('saveAll').onclick = async () => {
  if (!DATA) return;
  const prefs = (await S.get('prefs')).prefs || {};
  const folder = safeName(prefs.folder || '관전캡처', 40) + '/' + safeName(DATA.title || VID) + ' [' + VID + ']/라운드/';
  let n = 0;
  for (const r of DATA.rounds) for (const name of Object.values(r.shots || {})) {
    const rec = (await S.get('img:' + name))['img:' + name];
    if (!rec || !rec.full) continue;
    await chrome.downloads.download({ url: rec.full, filename: folder + name, conflictAction: 'overwrite', saveAs: false }); n++;
  }
  $('msg').textContent = '미니맵 ' + n + '장 저장 → 다운로드/' + folder;
};
/* 자료로 내보내기: 경기 폴더/라운드/ 에 라운드정리.html(그림 포함, 그대로 열어 보기·공유) + .md + .json(Claude가 덱 만들 때 읽는 용) */
$('exp').onclick = async () => {
  if (!DATA) return;
  await saving;
  const d = (await S.get('rounds:' + VID))['rounds:' + VID]; if (!d) return;
  const prefs = (await S.get('prefs')).prefs || {};
  const folder = safeName(prefs.folder || '관전캡처', 40) + '/' + safeName(d.title || VID) + ' [' + VID + ']/라운드/';
  const scenes = await scenesByRound(d.rounds);
  const imgOf = async (n) => n ? ((await S.get('img:' + n))['img:' + n] || {}).full || '' : '';
  const esc = (x) => String(x || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const yt = (sec) => 'https://www.youtube.com/watch?v=' + VID + '&t=' + Math.floor(sec) + 's';
  const lab100 = (r) => r.lab100 || (r.planted100 ? '1:00 · 설치 후' : '1:00');
  let md = '# ' + (d.title || VID) + ' — 라운드 정리\n\n영상: https://www.youtube.com/watch?v=' + VID + '\n\n| 맵 | 라운드 | 점수(왼:오) | 이긴 쪽 | 수비 | 시작 | 투명벽 미니맵 | 오프닝 미니맵 | 1:00 미니맵 | 해석 메모 | 코치 장면 |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
  const json = { app: 'won-clip', kind: 'rounds', vid: VID, title: d.title, url: 'https://www.youtube.com/watch?v=' + VID, rounds: [] };
  let html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(d.title) + ' — 라운드 정리</title><style>body{font-family:system-ui,"Malgun Gothic",sans-serif;background:#151a24;color:#eef1f6;margin:0;padding:24px}h1{font-size:20px}h2{color:#e8b84b;font-size:16px;margin:24px 0 8px}a{color:#7cc4ff}.r{display:grid;grid-template-columns:120px 190px 190px 190px 1fr;gap:12px;align-items:start;background:#1f2634;border:1px solid #3a4763;border-radius:10px;padding:10px;margin:8px 0}.r.L{border-left:4px solid #3fb8b0}.r.R{border-left:4px solid #d0504a}.r img{width:190px;border-radius:6px;display:block}.cap{color:#9aa6b8;font-size:11px;text-align:center}.n{font-size:18px;font-weight:800}.sc{color:#9aa6b8;font-size:12px}.memo{white-space:pre-wrap;line-height:1.5}.scn{color:#b9c1cf;font-size:12px;margin-top:6px}.none{width:190px;height:205px;border:1px dashed #3a4763;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#667;font-size:12px}</style></head><body><h1>' + esc(d.title) + ' — 라운드 정리</h1><p><a href="https://www.youtube.com/watch?v=' + VID + '">유튜브 영상</a> · 왼쪽 띠 색 = 그 라운드 이긴 쪽(청록 점수판 왼쪽 팀 / 빨강 오른쪽 팀) · 미니맵 색은 공수(청록 수비 / 빨강 공격)</p>';
  let curMap = null;
  for (const r of d.rounds) {
    const sc = (scenes.get(r) || []);
    const scTxt = sc.map(x => x.seq + ' ' + fmt(x.sec) + (x.memo ? ' ' + x.memo : '')).join(' / ');
    const f140 = r.shots && r.shots['140'], f130 = r.shots && r.shots['130'], f100 = r.shots && r.shots['100'];
    const defTxt = r.defSide === 'L' ? '왼쪽' : r.defSide === 'R' ? '오른쪽' : '';
    md += '| ' + mapLabel(d, r.map) + ' | R' + r.n + ' | ' + r.sL + ':' + r.sR + ' | ' + (r.win === 'L' ? '왼쪽' : r.win === 'R' ? '오른쪽' : '') + ' | ' + defTxt + ' | [' + fmt(r.jump) + '](' + yt(r.jump) + ') | ' + (f140 || '') + ' | ' + (f130 || '') + ' | ' + (f100 ? f100 + ' (' + lab100(r) + ')' : '') + ' | ' + String(r.note || '').replace(/\|/g, '/').replace(/\n/g, ' ') + ' | ' + scTxt.replace(/\|/g, '/') + ' |\n';
    json.rounds.push({ map: r.map, mapName: (d.maps && d.maps[r.map] && d.maps[r.map].name) || null, defender: r.defSide === 'L' ? 'left' : r.defSide === 'R' ? 'right' : null, minimap140: f140 || null, minimap140Label: f140 ? r.lab140 : null, round: r.n, scoreLeft: r.sL, scoreRight: r.sR, winner: r.win === 'L' ? 'left' : r.win === 'R' ? 'right' : null, start: Math.floor(r.jump), link: yt(r.jump), minimap130: f130 || null, minimap130Label: f130 ? (r.lab130 || '1:30') : null, minimap100: f100 || null, minimap100Label: f100 ? lab100(r) : null, note: r.note || '', scenes: sc.map(x => ({ seq: x.seq, sec: x.sec, memo: x.memo || '', files: (x.files && x.files.length) ? x.files : [x.file] })) });
    if (r.map !== curMap) { html += '<h2>' + esc(mapLabel(d, r.map)) + '</h2>'; curMap = r.map; }
    const im = async (n, cap) => { const u = await imgOf(n); return u ? '<div><img src="' + u + '"><div class="cap">' + esc(cap) + '</div></div>' : '<div><div class="none">없음</div><div class="cap">' + esc(cap) + '</div></div>'; };
    html += '<div class="r ' + (r.win || '') + '"><div><div class="n">R' + r.n + '</div><div class="sc">' + r.sL + ' : ' + r.sR + '</div><a href="' + yt(r.jump) + '">▶ ' + fmt(r.jump) + '</a></div>' + await im(f140, r.lab140 || '투명벽') + await im(f130, r.lab130 || '1:30') + await im(f100, lab100(r)) +
      '<div><div class="memo">' + (esc(r.note) || '<span class="sc">(해석 메모 없음)</span>') + '</div>' + (sc.length ? '<div class="scn">📌 ' + sc.map(x => '<a href="' + yt(x.sec) + '">' + esc(x.seq) + ' ' + fmt(x.sec) + '</a> ' + esc(x.memo || '')).join('<br>📌 ') + '</div>' : '') + '</div></div>';
  }
  html += '</body></html>';
  const dl = async (text, mime, name) => { const u = URL.createObjectURL(new Blob([text], { type: mime })); await chrome.downloads.download({ url: u, filename: folder + name, conflictAction: 'overwrite', saveAs: false }); setTimeout(() => URL.revokeObjectURL(u), 60000); };
  await dl(html, 'text/html', '라운드정리.html');
  await dl(md, 'text/markdown', '라운드정리.md');
  await dl(JSON.stringify(json, null, 1), 'application/json', '라운드정리.json');
  $('msg').textContent = '내보냄 → 다운로드/' + folder + ' (라운드정리.html · .md · .json)';
};
$('del').onclick = async () => {
  if (!DATA || !confirm('이 경기의 라운드 정보와 미니맵을 지울까요? (폴더에 받은 파일은 남아요)')) return;
  const ks = ['rounds:' + VID];
  DATA.rounds.forEach(r => Object.values(r.shots || {}).forEach(n => ks.push('img:' + n)));
  await S.remove(ks); draw();
};
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local' || !VID || !ch['rounds:' + VID]) return;
  if (skipRedraw) { skipRedraw = false; return; }
  if (document.activeElement && document.activeElement.classList.contains('note')) return;   // 메모 쓰는 중엔 안 건드림
  draw();
});
if (VID) draw(); else listAll();
