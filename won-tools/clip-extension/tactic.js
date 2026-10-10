/* 📋 텍틱 시트로 — 보드·분석 화면이 같이 쓰는 창 (1.11.0에서 board.js에서 떼어 냄)
   그림 + 메모 → 맵별 텍틱 시트의 고른 파일 · 탭 · 단계(## 띠) 옆에 그림, 그 단계 아래 B열에 메모 줄
   한 맵에 조합별 파일이 여러 개('텍틱 - 어비스 - 하버 오멘 소바 요루 웨이레이') → 두 팀 조합과 요원이 가장 많이 겹치는 파일을 자동으로 고름
   레퍼런스 보드 웹 앱(GAS v13) {kind:'tacticTabs', mapKo, fileId?, teams} → 파일 목록 + 탭·단계, {kind:'tactic', fileId…} → 넣기, {kind:'tacticNewFile'} → 새 조합 파일
   보낸 기록 tacSent:<영상> = { src: {file, fileId, tab, band, at} } · 기억 prefs.tacticFileBy[영상:맵] / tacticFile[맵] / tacticLast[파일|맵] / tacticBand[파일|탭]
   쓰는 쪽: WonTactic.setup({ vid(), where() → {map, n}, mapKo(), teams() → [{key, name, agents:[한글]}], msg(t), onSent() }) → WonTactic.open({ img, memo, caption, src, label })
   1.11.3 한 번에: WonTactic.open({ batch: [{ img(url|함수), thumb, title, memo, caption, src, on }], label, tab(텍틱 이름 — 같은 이름 탭을 먼저 고름) })
     → 그림마다 탭 맨 아래에 새 단계(N단계) 띠 + 그 옆에 그림 + 그 아래 메모 줄 — 한 장씩 차례로 보냄(시트 연결 GAS는 그대로 'tactic')
   1.11.8: '＋ 새 파일' = 이름을 정해 새 텍틱 파일('텍틱 - 맵 - 이름', GAS v15 tacticNewFile name) · 라운드 탭 C1에 정리 슬라이드 링크(open({linkOf(n)}))
   1.11.9: 그림은 M열 선에 (GAS v16 TK_IMG_COL 13 · 코치 10-09) — 보낸 기록에 col
   1.11.10: 팀 조합마다 파일 (코치 10-10) — 라운드 보내기는 '누구 텍틱' 팀의 그 맵 파일(이름에 팀 · 요원 5명)을 고르고, 없으면 'NS 스플릿 (요원…)'처럼 새로 만들어 보냄(GAS v17 exact) · 기억 prefs.tacticFileByTeam[영상:맵:팀]
   1.11.6 라운드마다 새 탭: WonTactic.open({ rounds: [{ key:'round:맵:라운드', n, name, summary, def(수비 팀 A|B), items:[{ img(), thumb(), caption, src }], on }], team, onTeam(k), onName(n, 이름) })
     → 라운드마다 GAS v14 {kind:'tacticRound'} = 그 파일 '템플릿' 탭 복제 · 탭 이름 · B1 '공격|수비 > 이름' · B3 요원 · 그림만 차례로 (단계 띠·글 없음)
     누구 텍틱(팀)을 고르면 그 팀 기준으로 공격/수비 · 옛 GAS(v13)면 막고 안내 */
(function (root) {
  const S = chrome.storage.local;
  const $ = (id) => document.getElementById(id);
  const MAPKO = (root.WonNames && root.WonNames.MAPKO) || {};
  let CTX = null, TK = null, TK_CUR = null, TSENT = {}, TSVID = null, built = false;
  const TKTABS = {};   // 맵|파일 → { at, data }
  const tsKey = () => 'tacSent:' + CTX.vid();
  const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('그림을 못 불러옴')); im.src = src; });

  function build() {
    if (built) return; built = true;
    const st = document.createElement('style');
    st.textContent = [
      '#tk{position:fixed;inset:0;background:rgba(8,14,28,.55);display:none;align-items:center;justify-content:center;z-index:900;font-family:"Noto Sans KR","Malgun Gothic",system-ui,sans-serif}',
      '#tk .box{background:#fff;color:#3C4A63;width:min(580px,94vw);max-height:92vh;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:0 0 14px;border-top:4px solid #132D65}',
      '#tk .hd{display:flex;align-items:center;gap:8px;font-weight:700;color:#fff;background:#132D65;padding:10px 12px 10px 16px;margin-bottom:4px;clip-path:polygon(0 0,100% 0,100% 100%,14px 100%)}',
      '#tk .hd span{color:#BDD9F2;font-weight:400;font-size:12px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#tk .hd button{background:transparent;border:1px solid #4A88C7;color:#fff;padding:2px 9px;cursor:pointer;border-radius:2px}',
      '#tk .in{display:flex;flex-direction:column;gap:8px;padding:0 16px}',
      '#tk img{max-width:100%;max-height:220px;object-fit:contain;background:#0D1526;align-self:center}',
      '#tk .row{display:grid;grid-template-columns:60px 1fr auto;gap:8px;align-items:center}',
      '#tk .row label,#tk .lab{color:#7A879C;font-size:12px}',
      '#tk select,#tk input[type=text],#tk textarea{width:100%;min-width:0;border:1px solid #BDD9F2;border-radius:2px;padding:6px 8px;font:13px "Noto Sans KR","Malgun Gothic",sans-serif;color:#3C4A63;background:#fff;outline:none}',
      '#tk select:focus,#tk input[type=text]:focus,#tk textarea:focus{border-color:#4A88C7}',
      '#tk textarea{min-height:90px;resize:vertical;line-height:1.5}',
      '#tk button{font:12px "Noto Sans KR","Malgun Gothic",sans-serif}',
      '#tk .in button{background:#EAF2FA;border:1px solid #BDD9F2;color:#132D65;border-radius:2px;padding:5px 10px;cursor:pointer}',
      '#tk .in button:hover{border-color:#4A88C7}',
      '#tk .in button.pri{background:#132D65;border-color:#132D65;color:#fff;font-weight:700;padding:7px 18px}',
      '#tk .in button:disabled{opacity:.5;cursor:default}',
      '#tk a{color:#4A88C7;font-size:12px;text-decoration:none;white-space:nowrap}',
      '#tkNewFiles{display:flex;flex-wrap:wrap;gap:6px}',
      '#tk .ft{display:flex;align-items:center;gap:10px}',
      '#tk .ft span{flex:1;font-size:12px;color:#7A879C}',
      '#tkSent{font-size:12px;color:#4A88C7}',
      '#tkList{display:flex;flex-direction:column;gap:4px;max-height:300px;overflow:auto;border:1px solid #EAF2FA;padding:4px}',
      '#tkList .it{display:grid;grid-template-columns:18px 72px 1fr auto auto auto;gap:8px;align-items:center;padding:4px 6px;border:1px solid transparent;cursor:pointer}',
      '#tkList .it:hover{border-color:#BDD9F2}',
      '#tkList .it.off{opacity:.55}',
      '#tkList .it input{width:15px;height:15px;accent-color:#132D65;margin:0}',
      '#tkList .it img{width:72px;height:40px;object-fit:contain;background:#0D1526;max-height:none}',
      '#tkList .it .tt{min-width:0;display:flex;flex-direction:column;line-height:1.35}',
      '#tkList .it .tt b{font-size:12px;color:#132D65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#tkList .it .tt em{font-style:normal;font-size:11px;color:#7A879C;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#tkList .it .bd{font-size:10px;color:#4A88C7;white-space:nowrap}',
      '#tkList .it .mv{padding:0 5px!important;font-size:10px!important;line-height:18px}',
      '#tkBatchInfo{font-size:12px;color:#3C4A63;background:#EAF2FA;border-left:4px solid #4A88C7;padding:6px 10px}',
      '#tkCapOnRow{display:flex;align-items:center;gap:7px;font-size:12px;color:#3C4A63;cursor:pointer}',
      '#tkCapOnRow input{width:15px;height:15px;accent-color:#132D65;margin:0}',
      '#tkList .it.rd{grid-template-columns:18px 72px 1fr auto;cursor:default}',
      '#tkList .it.rd .nm{display:flex;align-items:center;gap:6px;min-width:0}',
      '#tkList .it.rd .nm i{font-style:normal;font-size:11px;font-weight:700;color:#132D65;white-space:nowrap}',
      '#tkList .it.rd .nm i.att{color:#D0504A}#tkList .it.rd .nm i.def{color:#2F8F88}',
      '#tkList .it.rd .nm input{padding:3px 6px;font-size:12px;flex:1 1 150px;width:auto;min-width:110px}',
      '#tkList .it.rd img{width:72px;height:56px}',
      '#tkTeams{display:flex;gap:6px;flex-wrap:wrap}',
      '#tkTeams button.on{background:#132D65!important;border-color:#132D65!important;color:#fff!important;font-weight:700}',
      '#tkNameRow .nf{display:flex;align-items:center;gap:4px;min-width:0}',
      '#tkNamePre{font-size:12px;color:#7A879C;white-space:nowrap}',
      '#tkList .it .bd.other{color:#7A879C}'
    ].join('');
    document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'tk';
    d.innerHTML = '<div class="box">' +
      '<div class="hd">📋 텍틱 시트로 <span id="tkLab"></span><button id="tkX" title="닫기 (Esc)">×</button></div>' +
      '<div class="in"><img id="tkImg" alt=""><div id="tkSent"></div><div id="tkList" style="display:none"></div>' +
      '<div class="row"><label>맵</label><select id="tkMap"></select><a id="tkOpen" target="_blank"></a></div>' +
      '<div class="row" id="tkFileRow"><label>파일</label><select id="tkFile" title="같은 맵이라도 조합마다 파일이 따로 — 두 팀 조합과 요원이 가장 많이 겹치는 파일을 자동으로 골라요"></select><button id="tkNameBtn" type="button" style="display:none" title="이 경기·팀용 텍틱 파일을 새로 — 이름을 정하면 텍틱 템플릿으로 만들어요">＋ 새 파일</button></div>' +
      '<div class="row" id="tkNameRow" style="display:none"><label>새 파일</label><div class="nf"><span id="tkNamePre"></span><input type="text" id="tkNewName" placeholder="예: Paper Rex vs LOUD"></div><button id="tkNameGo" type="button">만들기</button></div>' +
      '<div class="row" id="tkNewFileRow" style="display:none"><label></label><div id="tkNewFiles"></div><span></span></div>' +
      '<div class="row" id="tkTeamRow" style="display:none"><label>누구</label><div id="tkTeams"></div><span></span></div>' +
      '<div class="row" id="tkTabRow"><label>탭</label><select id="tkTab"></select><button id="tkRe" title="시트에서 탭·단계 목록 다시 읽기">↻</button></div>' +
      '<div class="row" id="tkBandRow"><label>단계</label><select id="tkBand" title="그림은 이 단계(## 띠) 옆에, 메모 글은 이 단계 맨 아래에 들어가요"></select><span></span></div>' +
      '<div class="row" id="tkNewRow"><label></label><input type="text" id="tkNew" placeholder="새 단계 이름 (예: 2단계 A 장악) — 탭 맨 아래에 ## 띠로 만들어요" style="display:none"><span></span></div>' +
      '<div id="tkBatchInfo" style="display:none"></div>' +
      '<div class="row" id="tkCapRow"><label>그림 글</label><input type="text" id="tkCap" placeholder="그림 위 남색 띠에 들어갈 한 줄 (비우면 띠 없음)"><span></span></div>' +
      '<label id="tkCapOnRow" style="display:none"><input type="checkbox" id="tkCapOn" checked> 그림 위에 라운드·라운드 시계 띠 넣기 (예: R4 · 1:20)</label>' +
      '<div class="row"><label>그림</label><select id="tkW"><option value="640">보통 (가로 640)</option><option value="900">크게 (가로 900)</option><option value="0">그림 안 보냄 (글만)</option></select><span></span></div>' +
      '<div class="lab" id="tkMemoLab">메모 → 그 단계 아래 B열 글 (한 줄 = 한 칸 · <b>##</b> 띠 · <b>?</b> 조건 · <b>!</b> 팁 · 앞 공백 2칸 = 들여쓰기 · 비우면 글은 안 넣음)</div>' +
      '<textarea id="tkMemo" placeholder="예) 요루 TP로 B 메인 먼저 → 하버 벽 따라 진입"></textarea>' +
      '<div class="ft"><span id="tkMsg"></span><button id="tkGo" class="pri">보내기</button></div></div></div>';
    document.body.appendChild(d);
    $('tkMap').onchange = () => loadTabs(false);
    $('tkFile').onchange = async () => {   // 고른 파일은 이 영상에서 이 맵에 계속 씀 (라운드 보내기는 이 영상·맵·팀마다)
      const mapKo = $('tkMap').value, id = $('tkFile').value, p = await prefs(), T = teamNow();
      if (TK && TK.rounds) {
        TK.manual = true; if (id === '__new') return;
        if (T) { p.tacticFileByTeam = Object.assign({}, p.tacticFileByTeam, { [CTX.vid() + ':' + mapKo + ':' + T.key]: id }); await S.set({ prefs: p }); }
        return loadTabs(false, id);
      }
      p.tacticFileBy = Object.assign({}, p.tacticFileBy, { [CTX.vid() + ':' + mapKo]: id }); await S.set({ prefs: p });
      loadTabs(false, id);
    };
    $('tkTab').onchange = () => bands();
    $('tkNameBtn').onclick = () => {   // 1.11.8 이름을 정해 새 파일
      const r = $('tkNameRow'), on = r.style.display === 'none'; r.style.display = on ? '' : 'none';
      if (on) { const named = TK_CUR && TK_CUR.named, T = teamNow(); $('tkNamePre').textContent = named ? '' : '텍틱 - ' + $('tkMap').value + ' - '; if (!$('tkNewName').value) $('tkNewName').value = named ? (T ? proposeName(T, $('tkMap').value) : (((TK && TK.fileHint) || '') + ' ' + $('tkMap').value).trim()) : ((TK && TK.fileHint) || ''); $('tkNewName').focus(); $('tkNewName').select(); }
    };
    $('tkNameGo').onclick = () => newNamedFile();
    $('tkNewName').onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); newNamedFile(); } };
    $('tkBand').onchange = () => { $('tkNew').style.display = $('tkBand').value === '__new' ? '' : 'none'; if ($('tkBand').value === '__new') $('tkNew').focus(); };
    $('tkRe').onclick = () => loadTabs(true, TK_CUR && TK_CUR.mapKo === $('tkMap').value ? TK_CUR.fileId : undefined);
    $('tkGo').onclick = send;
    $('tkX').onclick = close;
    d.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
    d.addEventListener('paste', (e) => e.stopPropagation());
  }
  let SENDING = false;
  function close() { if (SENDING) { say('보내는 중이에요 — 끝날 때까지 기다려 주세요'); return; } $('tk').style.display = 'none'; TK = null; }
  const isOpen = () => built && $('tk').style.display === 'flex';

  async function image(url, caption, maxW) {   // 그림 위에 글 한 줄(남색 띠)을 얹은 jpeg — 시트 그림은 100만 화소 안쪽
    const im = await loadImg(url);
    const cap = String(caption || '').trim(), bandOf = (w) => cap ? Math.max(34, Math.round(w * 0.05)) : 0;
    let W = Math.min(maxW || 1280, im.width);
    while (W > 200 && W * (Math.round(im.height * W / im.width) + bandOf(W)) > 1000000) W = Math.floor(W * 0.97);
    const h = Math.round(im.height * W / im.width), band = bandOf(W);
    const c = document.createElement('canvas'); c.width = W; c.height = h + band;
    const x = c.getContext('2d');
    if (band) {
      x.fillStyle = '#132D65'; x.fillRect(0, 0, W, band);
      x.fillStyle = '#ffffff'; x.font = '700 ' + Math.round(band * 0.5) + 'px "Noto Sans KR","Malgun Gothic",sans-serif'; x.textBaseline = 'middle';
      let t = cap; while (x.measureText(t).width > W - 24 && t.length > 4) t = t.slice(0, -2);
      x.fillText(t === cap ? t : t + '…', 12, band / 2 + 1);
    }
    x.drawImage(im, 0, band, W, h);
    return { data: c.toDataURL('image/jpeg', 0.86), w: W, h: h + band };
  }
  function say(t, err) { $('tkMsg').textContent = t || ''; $('tkMsg').style.color = err ? '#D0504A' : '#7A879C'; }
  async function prefs() { return (await S.get('prefs')).prefs || {}; }
  const short = (name, mapKo) => { const n = String(name || '').trim(), b = '텍틱 - ' + mapKo; return n.indexOf(b + ' - ') === 0 ? n.slice(b.length + 3) : n === b ? '기본 파일 (' + n + ')' : n; };   // 코치가 지은 이름은 그대로
  const teamNow = () => (TK && TK.rounds && TK.team) ? (TK.teams || CTX.teams()).find(t => t.key === TK.team) || null : null;
  function teamFile(files, T) {   // 1.11.10 그 팀 파일: 요원을 알면 이름에 요원이 다 있는 파일(다른 팀 이름이 붙은 건 빼고 · 팀 이름도 있으면 먼저) · 모르면 이름에 팀이 있는 파일 · 같으면 최근에 고친 것
    if (!T || !files) return null;
    const N = root.WonNames, info = N.teamInfo(T.name), ags = (T.agents || []).map(N.agKey).filter(Boolean);
    let best = null, bs = -1;
    files.forEach(f => {
      const mine = N.teamInName(f.name, info); if (!mine && N.teamOfName(f.name)) return;
      const fa = (f.agents || []).map(N.agKey), comp = ags.filter(a => fa.indexOf(a) >= 0).length;
      let sc; if (ags.length >= 4) { if (comp < ags.length) return; sc = 10 + (mine ? 5 : 0); } else { if (!mine) return; sc = 5; }
      sc += (f.t || 0) / 1e14; if (sc > bs) { bs = sc; best = f; }
    });
    return best;
  }
  const proposeName = (T, mapKo) => root.WonNames.teamInfo(T.name).short + ' ' + mapKo + (T.agents && T.agents.length ? ' (' + T.agents.join(' ') + ')' : '');
  const sentTxt = (s) => (s.file ? '[' + s.file + '] ' : '') + s.tab + (s.band ? ' › ' + s.band : '');
  async function reload() { if (!CTX) return TSENT; TSVID = CTX.vid(); TSENT = (await S.get(tsKey()))[tsKey()] || {}; return TSENT; }
  const sent = (src) => (CTX && TSVID === CTX.vid() ? TSENT[src] : null) || null;

  // 한 장 보내기 ↔ 한 번에 보내기(1.11.3): 보이는 칸만 바꿈
  function mode(batch, rounds) {
    batch = batch || rounds;
    ['tkList', 'tkBatchInfo', 'tkCapOnRow'].forEach(id => { $(id).style.display = batch ? '' : 'none'; });
    ['tkImg', 'tkBandRow', 'tkNewRow', 'tkCapRow', 'tkMemoLab', 'tkMemo'].forEach(id => { $(id).style.display = batch ? 'none' : ''; });
    $('tkTeamRow').style.display = rounds ? '' : 'none'; $('tkTabRow').style.display = rounds ? 'none' : '';
    $('tkCapOnRow').lastChild.textContent = rounds ? ' 그림 위에 라운드·시계·그 장면 메모 띠 넣기 (예: R13 · 1:20 · 마스킹 B2)' : ' 그림 위에 라운드·라운드 시계 띠 넣기 (예: R4 · 1:20)';
    const zero = [...$('tkW').options].find(x => x.value === '0'); if (zero) zero.disabled = !!batch;
    $('tkGo').textContent = '보내기';
  }
  async function open(o) {
    build(); TK = o;
    const rounds = Array.isArray(o.rounds), batch = Array.isArray(o.batch);
    mode(batch, rounds);
    $('tkLab').textContent = o.label || '';
    $('tkSent').textContent = ''; $('tkNew').value = ''; $('tkNew').style.display = 'none';
    if (batch || rounds) { $('tkW').value = '640'; $('tkCapOn').checked = true; }
    else {
      const isUrl = typeof o.img === 'string'; $('tkImg').src = isUrl ? o.img : ''; $('tkImg').style.display = isUrl ? '' : 'none';
      $('tkCap').value = o.caption || ''; $('tkMemo').value = o.memo || ''; $('tkW').value = o.img ? '640' : '0';
    }
    $('tk').style.display = 'flex';
    if (TSVID !== CTX.vid()) await reload();
    if (rounds) { drawTeams(); drawRoundList(); }
    else if (batch) drawList();
    else { const s = TSENT[o.src]; $('tkSent').textContent = s ? '이미 보냄: ' + sentTxt(s) + ' (' + new Date(s.at).toLocaleString('ko-KR') + ')' : ''; }
    const ms = $('tkMap'); if (!ms.options.length) Object.values(MAPKO).forEach(m => ms.add(new Option(m, m)));
    const p = await prefs(), mk = CTX.mapKo();
    ms.value = (mk && Object.values(MAPKO).includes(mk)) ? mk : (p.tacticMap || ms.options[0].value);
    say('');
    await loadTabs(false);
  }
  /* ---- 한 번에 보내기: 그림 목록 (체크 · 순서 ▲▼ · 이미 보낸 것 표시) ---- */
  function drawList() {
    const box = $('tkList'); box.textContent = '';
    TK.batch.forEach((it, i) => {
      const row = document.createElement('div'); row.className = 'it' + (it.on ? '' : ' off'); row.title = '누르면 넣기/빼기';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!it.on;
      const set = (v) => { it.on = v; cb.checked = v; row.classList.toggle('off', !v); info(); };
      cb.onclick = (e) => { e.stopPropagation(); set(cb.checked); };
      row.onclick = () => set(!it.on);
      const im = document.createElement('img'); im.alt = ''; im.src = it.thumb || (typeof it.img === 'string' ? it.img : '');
      const tt = document.createElement('span'); tt.className = 'tt';
      const b = document.createElement('b'); b.textContent = it.title || it.caption || ('그림 ' + (i + 1));
      const em = document.createElement('em'); em.textContent = String(it.memo || '').trim().split('\n')[0] || '메모 없음';
      tt.append(b, em);
      const s = TSENT[it.src], bd = document.createElement('span'); bd.className = 'bd'; bd.textContent = s ? '이미 보냄' : ''; if (s) bd.title = sentTxt(s);
      const mv = (txt, tip, d) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'mv'; x.textContent = txt; x.title = tip; x.disabled = (i + d < 0 || i + d >= TK.batch.length); x.onclick = (e) => { e.stopPropagation(); const a = TK.batch, j = i + d; [a[i], a[j]] = [a[j], a[i]]; drawList(); }; return x; };
      row.append(cb, im, tt, bd, mv('▲', '앞 단계로', -1), mv('▼', '뒤 단계로', 1));
      box.append(row);
    });
    info();
  }
  const curTab = () => { const c = TK_CUR && TKTABS[TK_CUR.mapKo + '|' + (TK_CUR.fileId || 'auto')]; return c ? c.data.tabs.find(x => x.name === $('tkTab').value) : null; };
  const stepBase = (t) => { let mx = 0; ((t && t.bands) || []).forEach(b => { const m = /^(\d+)\s*단계/.exec(String(b.text || '').trim()); if (m) mx = Math.max(mx, +m[1]); }); return mx; };   // 이미 있는 'N단계' 중 가장 큰 N
  function info() {
    if (TK && TK.rounds) return roundInfo();
    if (!TK || !TK.batch) return;
    const n = TK.batch.filter(x => x.on).length, base = stepBase(curTab());
    $('tkBatchInfo').textContent = n ? '고른 ' + n + '장 → 탭 맨 아래에 그림마다 새 단계 (' + (base + 1) + '단계' + (n > 1 ? ' ~ ' + (base + n) + '단계' : '') + ') · 띠 옆에 그림, 아래에 그 그림 메모 — 단계 이름은 시트에서 고치세요' : '보낼 그림을 골라 주세요';
    $('tkGo').textContent = n ? n + '장 보내기' : '보내기';
  }
  const tkNorm = (s) => String(s || '').replace(/[\s\-·.]+/g, '').toLowerCase();   // '1-1-3 롱 헤비' = '113 롱헤비'
  async function loadTabs(force, fileId) {
    const mapKo = $('tkMap').value, ts = $('tkTab'), bs = $('tkBand'), fs = $('tkFile');
    ts.textContent = ''; bs.textContent = ''; $('tkGo').disabled = true; $('tkOpen').style.display = 'none'; $('tkNameRow').style.display = 'none';
    const p = await prefs(), vkey = CTX.vid() + ':' + mapKo, rounds = !!(TK && TK.rounds), T = teamNow(), explicit = fileId !== undefined;
    if (!explicit) fileId = rounds ? ((T && (p.tacticFileByTeam || {})[vkey + ':' + T.key]) || '') : ((p.tacticFileBy || {})[vkey] || '');   // 이 영상에서 이 맵에 쓰던 파일(라운드는 팀마다) → 없으면 자동
    say('시트에서 파일·탭 목록 읽는 중… (처음엔 10초쯤)');
    try {
      const teams = CTX.teams(), ask = async (id) => {
        const k = mapKo + '|' + (id || 'auto'), c0 = TKTABS[k];
        if (!force && c0 && Date.now() - c0.at < 60000) return c0;
        const j = await WonNet.postBoard({ kind: 'tacticTabs', mapKo, fileId: id || '', teams: teams.map(t => t.agents) });
        if (!j.ok) { if (id && j.files && j.files.length) return null; throw new Error(j.err || '실패'); }
        const c = { at: Date.now(), data: j }; TKTABS[k] = c; if (j.fileId) TKTABS[mapKo + '|' + j.fileId] = c; return c;
      };
      let c = await ask(fileId);
      if (!c || (fileId && c.data.files && !c.data.files.some(f => f.id === fileId))) c = await ask('');   // 기억한 파일이 지워졌으면 자동으로
      let d = c.data, newName = null, picked = null;
      if (rounds && d.named) {   // 1.11.10 팀 조합마다 파일 (GAS v17): 기억한 파일 → 그 팀 파일 → 없으면 새로 만들 이름
        const mem = !explicit && fileId && d.files.some(f => f.id === fileId) ? fileId : null;
        let want = explicit ? (fileId || null) : mem;
        if (!want && !explicit && T) { picked = teamFile(d.files, T); want = picked ? picked.id : null; }
        if (want && want !== d.fileId) { c = await ask(want) || c; d = c.data; }
        if (!want && !explicit && T) newName = proposeName(T, mapKo);
      } else if (!rounds) {
        const mapLast = (p.tacticFile || {})[mapKo];   // 조합이 맞는 파일이 없으면 이 맵에서 마지막으로 쓴 파일
        if (d.auto && d.files && !d.files.some(f => f.score > 0) && mapLast && mapLast !== d.fileId && d.files.some(f => f.id === mapLast)) { c = await ask(mapLast) || c; d = c.data; }
      }
      TK_CUR = { mapKo, fileId: newName ? '' : (d.fileId || ''), file: newName || d.file || '', files: d.files || null, links: !!d.links, named: !!d.named, isNew: !!newName, data: d };
      fs.textContent = '';
      if (newName) fs.add(new Option('＋ 새 파일: ' + newName, '__new'));
      if (d.files && d.files.length) {
        d.files.forEach(f => { const t = teams[f.team]; fs.add(new Option(short(f.name, mapKo) + (f.score && t ? '  — ' + t.name + ' 조합 ' + f.score + '/' + t.agents.length : ''), f.id)); });
        fs.value = newName ? '__new' : d.fileId;
      } else fs.add(new Option(d.file || '', ''));
      $('tkFileRow').style.display = d.files ? '' : 'none';
      $('tkNameBtn').style.display = d.links ? '' : 'none';   // GAS v15부터
      if (rounds && d.named) { $('tkNewFileRow').style.display = 'none'; } else newFileBtns(d, teams);   // 라운드 보내기(v17)는 팀 파일을 알아서 만듦
      $('tkOpen').href = d.url; $('tkOpen').style.display = newName ? 'none' : ''; $('tkOpen').textContent = '↗ 시트 열기';
      if (newName) { $('tkNamePre').textContent = ''; $('tkNewName').value = newName; $('tkNameRow').style.display = ''; }
      const tabs = d.tabs.filter(t => t.tactic && !/^(템플릿|예시)$/.test(t.name)).concat(d.tabs.filter(t => !t.tactic || /^(템플릿|예시)$/.test(t.name)));
      tabs.forEach(t => ts.add(new Option(t.name + (t.tactic ? '' : ' (텍틱 탭 아님)'), t.name)));
      const last = (p.tacticLast || {})[d.fileId || mapKo] || (!d.files || d.files.length < 2 ? (p.tacticLast || {})[mapKo] : '');
      const hint = TK && TK.tab ? tkNorm(TK.tab) : '', hit = hint ? (tabs.find(t => tkNorm(t.name) === hint) || tabs.find(t => tkNorm(t.name).includes(hint))) : null;   // 라운드 텍틱 이름과 같은 탭
      ts.value = hit ? hit.name : tabs.some(t => t.name === last) ? last : (tabs[0] ? tabs[0].name : '');
      bands();
      const real = tabs.filter(t => t.tactic && !/^(템플릿|예시)$/.test(t.name)).length;
      const f0 = (d.files || []).find(f => f.id === d.fileId), t0 = f0 && teams[f0.team];
      say(!tabs.length ? '탭이 없어요' : !real ? '이 파일엔 아직 텍틱 탭이 없어요 — 템플릿 탭에 넣거나, 시트에서 템플릿 탭을 복사·이름 바꾼 뒤 ↻'
        : hint && !hit ? '\'' + TK.tab + '\' 탭이 없어요 — 시트에서 템플릿 탭을 복사해 이름을 \'' + TK.tab + '\'로 바꾼 뒤 ↻ (지금은 \'' + ts.value + '\' 탭)'
        : d.auto && f0 && f0.score && t0 ? t0.name + ' 조합과 ' + f0.score + '명 겹치는 파일을 골랐어요' : '');
      $('tkGo').disabled = !tabs.length;
      if (TK && TK.rounds) {
        if (!TK.team && f0 && f0.score && t0) { TK.team = t0.key; try { TK.onTeam && TK.onTeam(t0.key); } catch (e) {} drawTeams(); drawRoundList(); if (d.named && !explicit) return loadTabs(false); }   // 조합 파일의 팀 = 누구 텍틱 (v17이면 그 팀 파일로 다시)
        if (!d.round) { say('시트 스크립트(GAS)가 옛 버전이라 라운드마다 새 탭을 못 만들어요 — 새 버전(v14) 배포가 필요해요', true); $('tkGo').disabled = true; }
        else if (newName) { say('\'' + newName + '\' 파일이 아직 없어서 보낼 때 새로 만들어요 — 이름은 위 칸에서 고칠 수 있어요'); $('tkGo').disabled = false; }
        else if (picked) say('\'' + short(picked.name, mapKo) + '\' — ' + T.name + ' 파일에 보내요');
        else if (!/파일을 골랐어요/.test($('tkMsg').textContent)) say(d.tabs.some(t => t.name === '템플릿') ? '' : '이 파일엔 \'템플릿\' 탭이 없어서 텍틱 템플릿 파일의 틀을 가져다 써요');
        if (!TK.onlyCur) TK.rounds.forEach(rd => { if (!rd.touched) { const st = TSENT[rd.key]; rd.on = !(st && (!st.fileId || st.fileId === TK_CUR.fileId)); } });   // 이 파일에 아직 안 보낸 라운드만 기본으로
        drawRoundList();
      }
    } catch (e) { say('못 읽었어요: ' + e.message, true); }
  }
  function newFileBtns(d, teams) {   // '＋ 팀 조합으로 새 파일' — 그 팀 5명이 다 맞는 파일이 아직 없을 때만
    const box = $('tkNewFiles'); box.textContent = '';
    if (!d.files) { $('tkNewFileRow').style.display = 'none'; return; }
    teams.forEach((t, i) => {
      if (t.agents.length < 2 || d.files.some(f => f.team === i && f.score >= t.agents.length)) return;
      const b = document.createElement('button'); b.textContent = '＋ ' + t.name + ' 조합으로 새 파일'; b.title = "'텍틱 - " + $('tkMap').value + ' - ' + t.agents.join(' ') + "' — 텍틱 템플릿을 복사하고 요원 줄(B3)을 채워요";
      b.onclick = () => newFile(t); box.append(b);
    });
    $('tkNewFileRow').style.display = box.children.length ? '' : 'none';
  }
  async function newFile(t) {
    const mapKo = $('tkMap').value;
    if (!confirm("'텍틱 - " + mapKo + ' - ' + t.agents.join(' ') + "' 파일을 새로 만들까요?\n(텍틱 템플릿 복사 · 요원 줄 채움 · 같은 이름이 있으면 그 파일을 씀)")) return;
    [...$('tkNewFiles').children].forEach(b => { b.disabled = true; });
    say('새 파일 만드는 중… (10~20초)');
    try {
      const j = await WonNet.postBoard({ kind: 'tacticNewFile', mapKo, agents: t.agents, team: t.name });
      if (!j.ok) throw new Error(j.err || '실패');
      const p = await prefs(); p.tacticFileBy = Object.assign({}, p.tacticFileBy, { [CTX.vid() + ':' + mapKo]: j.id }); await S.set({ prefs: p });
      Object.keys(TKTABS).forEach(k => { if (k.indexOf(mapKo + '|') === 0) delete TKTABS[k]; });
      await loadTabs(true, j.id);
      if (!/못 읽었어요/.test($('tkMsg').textContent)) say((j.created ? '새 파일을 만들었어요' : '같은 조합 파일이 이미 있어서 그 파일을 골랐어요') + ' — 템플릿 탭에 바로 넣거나, 시트에서 템플릿 탭을 복사해 텍틱 탭을 만든 뒤 ↻');
    } catch (e) { say('새 파일 실패: ' + e.message, true); [...$('tkNewFiles').children].forEach(b => { b.disabled = false; }); }
  }
  async function newNamedFile() {   // 1.11.8 '텍틱 - 맵 - 이름' 새 파일 (같은 이름이 있으면 그 파일)
    const mapKo = $('tkMap').value, named = !!(TK_CUR && TK_CUR.named), T = teamNow(), nm = $('tkNewName').value.replace(/\s+/g, ' ').trim().replace(/^텍틱\s*-\s*[^-]+?\s*-\s*/, '');   // '텍틱 - 맵 - '까지 적어도 이름만
    if (!nm) { say('파일 이름을 적어 주세요', true); $('tkNewName').focus(); return; }
    $('tkNameGo').disabled = true; say('\'' + (named ? nm : '텍틱 - ' + mapKo + ' - ' + nm) + '\' 만드는 중… (10~20초)');
    try {
      const j = await WonNet.postBoard(Object.assign({ kind: 'tacticNewFile', mapKo, name: nm }, named ? { exact: true, agents: T ? T.agents : [] } : {}));   // v17: 코치 방식 이름 그대로
      if (!j.ok) throw new Error(j.err || '실패');
      const p = await prefs(); p.tacticFileBy = Object.assign({}, p.tacticFileBy, { [CTX.vid() + ':' + mapKo]: j.id });
      if (T) p.tacticFileByTeam = Object.assign({}, p.tacticFileByTeam, { [CTX.vid() + ':' + mapKo + ':' + T.key]: j.id });
      if (TK) TK.manual = true; await S.set({ prefs: p });
      Object.keys(TKTABS).forEach(k => { if (k.indexOf(mapKo + '|') === 0) delete TKTABS[k]; });
      await loadTabs(true, j.id);
      if (!/못 읽었어요/.test($('tkMsg').textContent)) say((j.created ? '새 파일을 만들었어요: ' : '같은 이름 파일이 이미 있어서 그 파일로: ') + j.name);
    } catch (e) { say('새 파일 실패: ' + e.message, true); }
    $('tkNameGo').disabled = false;
  }
  async function bands() {
    const c = TK_CUR && TKTABS[TK_CUR.mapKo + '|' + (TK_CUR.fileId || 'auto')], bs = $('tkBand'); bs.textContent = '';
    const t = c && c.data.tabs.find(x => x.name === $('tkTab').value); if (!t) return;
    t.bands.forEach(b => bs.add(new Option(b.text, JSON.stringify({ row: b.row, text: b.text }))));
    bs.add(new Option('— 맨 아래에 (단계 없이)', '__end')); bs.add(new Option('＋ 새 단계 만들기…', '__new'));
    const p = await prefs(), tb = p.tacticBand || {}, want = tb[(TK_CUR.fileId || TK_CUR.mapKo) + '|' + t.name] || tb[TK_CUR.mapKo + '|' + t.name];
    const hit = t.bands.find(b => b.text === want);
    bs.value = hit ? JSON.stringify({ row: hit.row, text: hit.text }) : (t.bands.length ? JSON.stringify({ row: t.bands[t.bands.length - 1].row, text: t.bands[t.bands.length - 1].text }) : '__end');
    $('tkNew').style.display = bs.value === '__new' && !(TK && TK.batch) ? '' : 'none';
    info();
  }
  async function send() {
    if (!TK) return;
    if (TK.rounds) return sendRounds();
    if (TK.batch) return sendBatch();
    const mapKo = $('tkMap').value, tab = $('tkTab').value, bv = $('tkBand').value, W = +$('tkW').value;
    const memo = $('tkMemo').value.replace(/\s+$/, ''), newBand = bv === '__new' ? $('tkNew').value.trim() : '';
    if (bv === '__new' && !newBand) { say('새 단계 이름을 적어 주세요', true); $('tkNew').focus(); return; }
    if (!W && !memo.trim() && !newBand) { say('보낼 게 없어요 (그림 안 보냄 + 메모 없음)', true); return; }
    const old = TSENT[TK.src]; if (old && !confirm('이 그림은 이미 \'' + sentTxt(old) + '\'에 보냈어요. 또 보낼까요?')) return;
    const cur = TK_CUR || { mapKo, fileId: '', file: '' }, at = CTX.where(), vid = CTX.vid();
    $('tkGo').disabled = true;
    try {
      const body = { kind: 'tactic', mapKo, fileId: cur.fileId || '', tab, band: (bv === '__end' || bv === '__new') ? null : JSON.parse(bv), newBand, memo, caption: $('tkCap').value.trim(), width: W, src: { vid, map: at.map, n: at.n, key: TK.src } };
      if (W && TK.img) { say('그림 만드는 중…'); const im = await image(typeof TK.img === 'function' ? await TK.img() : TK.img, body.caption, 1280); body.jpeg = im.data; body.imgW = im.w; body.imgH = im.h; }
      say('텍틱 시트에 넣는 중… (5~15초)');
      const j = await WonNet.postBoard(body);
      if (!j.ok) throw new Error(j.err || '실패');
      const bandTxt = j.band || '', fid = j.fileId || cur.fileId || '', fshort = cur.files && cur.files.length > 1 ? short(j.file || cur.file, mapKo) : '';
      const k = 'tacSent:' + vid, all = (await S.get(k))[k] || {};
      all[TK.src] = { file: fshort, fileId: fid, tab, band: bandTxt, at: Date.now() }; await S.set({ [k]: all }); TSENT = all; TSVID = vid;
      const p = await prefs(), fk = fid || mapKo; p.tacticMap = mapKo;
      p.tacticLast = Object.assign({}, p.tacticLast, { [mapKo]: tab, [fk]: tab }); p.tacticBand = Object.assign({}, p.tacticBand, { [mapKo + '|' + tab]: bandTxt, [fk + '|' + tab]: bandTxt });
      if (fid) { p.tacticFileBy = Object.assign({}, p.tacticFileBy, { [vid + ':' + mapKo]: fid }); p.tacticFile = Object.assign({}, p.tacticFile, { [mapKo]: fid }); }
      await S.set({ prefs: p });
      Object.keys(TKTABS).forEach(x => { if (x.indexOf(mapKo + '|') === 0) delete TKTABS[x]; });
      const src = TK.src; close();
      CTX.msg('📋 텍틱 시트 \'' + sentTxt(all[src]) + '\'에 넣음 ✓' + (j.image ? ' 그림' + (j.count > 1 ? ' (이 단계 ' + j.count + '번째)' : '') : '') + (j.lines ? ' · 글 ' + j.lines + '줄' : '') + (j.count >= 5 ? ' — 한 단계에 그림이 많아요' : ''));
      try { CTX.onSent && CTX.onSent(src, all[src]); } catch (e) {}
    } catch (e) { say('보내기 실패: ' + e.message, true); }
    if (built) $('tkGo').disabled = false;
  }
  /* 한 번에 보내기 (1.11.3): 고른 그림을 순서대로 — 한 장마다 새 단계 'N단계' 띠 + 그림 + 그 그림 메모. 중간에 실패하면 거기서 멈추고 보낸 것은 표시 */
  async function sendBatch() {
    const items = TK.batch.filter(x => x.on);
    if (!items.length) { say('보낼 그림을 골라 주세요', true); return; }
    const again = items.filter(x => TSENT[x.src]).length;
    if (again && !confirm('이미 보낸 그림 ' + again + '장이 섞여 있어요. 또 보낼까요?')) return;
    const mapKo = $('tkMap').value, tab = $('tkTab').value, W = +$('tkW').value || 640, capOn = $('tkCapOn').checked;
    if (!tab) { say('탭을 골라 주세요', true); return; }
    const cur = TK_CUR || { mapKo, fileId: '', file: '' }, at = CTX.where(), vid = CTX.vid(), base = stepBase(curTab());
    const k = 'tacSent:' + vid;
    let done = 0, first = '', lastBand = '', fid = cur.fileId || '', fileName = cur.file || '';
    $('tkGo').disabled = true;
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i], cap = capOn ? String(it.caption || '').trim() : '';
        say((i + 1) + '/' + items.length + ' 그림 만드는 중…');
        const src = typeof it.img === 'function' ? await it.img() : it.img;
        const im = await image(src, cap, 1280);
        say((i + 1) + '/' + items.length + ' 텍틱 시트에 넣는 중… (한 장에 5~15초)');
        const j = await WonNet.postBoard({ kind: 'tactic', mapKo, fileId: fid, tab, band: null, newBand: (base + i + 1) + '단계', memo: String(it.memo || '').replace(/\s+$/, ''), caption: cap, width: W, jpeg: im.data, imgW: im.w, imgH: im.h, src: { vid, map: at.map, n: at.n, key: it.src } });
        if (!j.ok) throw new Error(j.err || '실패');
        fid = j.fileId || fid; fileName = j.file || fileName; lastBand = j.band || lastBand; if (!first) first = j.band || '';
        const fshort = cur.files && cur.files.length > 1 ? short(fileName, mapKo) : '';
        const all = (await S.get(k))[k] || {}; all[it.src] = { file: fshort, fileId: fid, tab, band: j.band || '', at: Date.now() }; await S.set({ [k]: all }); TSENT = all; TSVID = vid;
        it.on = false; done++;
      }
      const p = await prefs(), fk = fid || mapKo; p.tacticMap = mapKo;
      p.tacticLast = Object.assign({}, p.tacticLast, { [mapKo]: tab, [fk]: tab }); p.tacticBand = Object.assign({}, p.tacticBand, { [mapKo + '|' + tab]: lastBand, [fk + '|' + tab]: lastBand });
      if (fid) { p.tacticFileBy = Object.assign({}, p.tacticFileBy, { [vid + ':' + mapKo]: fid }); p.tacticFile = Object.assign({}, p.tacticFile, { [mapKo]: fid }); }
      await S.set({ prefs: p });
      Object.keys(TKTABS).forEach(x => { if (x.indexOf(mapKo + '|') === 0) delete TKTABS[x]; });
      close();
      CTX.msg('📋 텍틱 시트 \'' + tab + '\' 탭에 ' + done + '장 넣음 ✓ (' + (first === lastBand ? first : first + ' ~ ' + lastBand) + ') — 단계 이름은 시트에서 고치세요');
      try { CTX.onSent && CTX.onSent(null, null); } catch (e) {}
    } catch (e) {
      Object.keys(TKTABS).forEach(x => { if (x.indexOf(mapKo + '|') === 0) delete TKTABS[x]; });
      if (built && isOpen()) { await loadTabs(true, fid || undefined); drawList(); }
      say((done ? done + '장 넣고 ' : '') + (done + 1) + '번째에서 멈췄어요: ' + e.message + (done ? ' — 남은 것만 다시 보내면 돼요' : ''), true);
      try { if (done) CTX.onSent && CTX.onSent(null, null); } catch (e2) {}
    }
    if (built) $('tkGo').disabled = false;
  }
  /* ---- 1.11.6 라운드마다 새 탭 ---- */
  const sideOf = (rd) => !TK || !TK.team ? '' : rd.def === TK.team ? '수비' : '공격';
  function drawTeams() {
    const box = $('tkTeams'); box.textContent = '';
    (TK.teams || CTX.teams()).forEach(t => {
      const b = document.createElement('button'); b.type = 'button'; b.className = TK.team === t.key ? 'on' : ''; b.textContent = t.name + ' 텍틱';
      b.title = t.agents.join(' · ') + ' — 이 팀 기준으로 탭 제목 공격/수비 · B3 요원 줄';
      b.onclick = () => { const ch = TK.team !== t.key; TK.team = t.key; try { TK.onTeam && TK.onTeam(t.key); } catch (e) {} drawTeams(); drawRoundList(); if (ch && TK.rounds && !TK.manual && TK_CUR && TK_CUR.named) loadTabs(false); };   // 1.11.10 팀이 바뀌면 그 팀 파일로
      box.append(b);
    });
  }
  function drawRoundList() {
    const box = $('tkList'); box.textContent = '';
    TK.rounds.forEach((rd) => {
      const row = document.createElement('div'); row.className = 'it rd' + (rd.on ? '' : ' off');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!rd.on; cb.title = '이 라운드 보내기';
      cb.onclick = (e) => { e.stopPropagation(); rd.on = cb.checked; rd.touched = true; row.classList.toggle('off', !rd.on); roundInfo(); };
      const im = document.createElement('img'); im.alt = '';
      const it0 = rd.items[0]; if (it0) Promise.resolve(typeof it0.thumb === 'function' ? it0.thumb() : it0.thumb).then(u => { if (u) im.src = u; }).catch(() => {});
      const tt = document.createElement('span'); tt.className = 'tt';
      const nm = document.createElement('span'); nm.className = 'nm';
      const sd = sideOf(rd), lab = document.createElement('i'); lab.className = sd === '공격' ? 'att' : sd === '수비' ? 'def' : ''; lab.textContent = 'R' + rd.n + (sd ? ' ' + sd : '');
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = rd.name; inp.title = '탭 이름 (= 텍틱 이름) — 고치면 분석 화면 텍틱 이름도 바뀜'; inp.placeholder = 'R' + rd.n;
      inp.oninput = () => { rd.name = inp.value; };
      nm.append(lab, inp);
      const em = document.createElement('em'); em.textContent = '그림 ' + rd.items.length + '장' + (rd.summary ? ' · B2: ' + rd.summary : '');
      if (rd.summary) em.title = rd.summary;
      tt.append(nm, em);
      const s = TSENT[rd.key], here = s && (!s.fileId || !TK_CUR || s.fileId === TK_CUR.fileId), bd = document.createElement('span');
      bd.className = 'bd' + (s && !here ? ' other' : ''); bd.textContent = s ? (here ? '보냄' : '다른 파일') : ''; if (s) bd.title = '이미 만든 탭: ' + sentTxt(s);
      row.append(cb, im, tt, bd);
      box.append(row);
    });
    roundInfo();
  }
  function roundInfo() {
    if (!TK || !TK.rounds) return;
    const on = TK.rounds.filter(x => x.on), n = on.length, imgs = on.reduce((a, x) => a + x.items.length, 0);
    $('tkBatchInfo').textContent = !TK.team ? '누구 텍틱인지 먼저 골라 주세요 — 그 팀 기준으로 탭 제목이 \'공격 > 이름\' / \'수비 > 이름\'이 돼요'
      : n ? '고른 ' + n + '라운드 · 그림 ' + imgs + '장 → 라운드마다 \'템플릿\' 탭을 복제한 새 탭 (탭 이름 = 위 이름, 같은 이름이 있으면 (2)) · 그림만 위에서부터 차례로 — 단계·글은 안 넣어요 (B열은 비워 둠)'
      : '보낼 라운드를 골라 주세요';
    $('tkGo').textContent = n ? n + '라운드 보내기' : '보내기';
  }
  async function sendRounds() {
    const R0 = TK, list = R0.rounds.filter(x => x.on);
    if (!list.length) { say('보낼 라운드를 골라 주세요', true); return; }
    const T = (R0.teams || CTX.teams()).find(t => t.key === R0.team);
    if (!T) { say('누구 텍틱인지 골라 주세요 (탭 제목 공격/수비 · 요원 줄에 써요)', true); return; }
    const c = TK_CUR && (TK_CUR.data ? { data: TK_CUR.data } : TKTABS[TK_CUR.mapKo + '|' + (TK_CUR.fileId || 'auto')]);
    if (!c || !c.data.round) { say('시트 스크립트(GAS)가 옛 버전이라 라운드마다 새 탭을 못 만들어요 — 새 버전(v14) 배포가 필요해요', true); return; }
    const newNm = TK_CUR.isNew ? ($('tkNewName').value || TK_CUR.file).replace(/\s+/g, ' ').trim() : '';
    if (TK_CUR.isNew && !newNm) { say('새 파일 이름을 적어 주세요', true); $('tkNewName').focus(); return; }
    const again = list.filter(x => TSENT[x.key] && TSENT[x.key].fileId === (TK_CUR && TK_CUR.fileId)).length;   // 같은 파일에 또 만드는 것만 묻기
    if (again && !confirm('이미 탭을 만든 라운드 ' + again + '개가 섞여 있어요. 새 탭을 또 만들까요? (같은 이름이면 \'(2)\'가 붙어요)')) return;
    const mapKo = $('tkMap').value, W = +$('tkW').value || 640, capOn = $('tkCapOn').checked;
    const cur = TK_CUR || { mapKo, fileId: '', file: '' }, vid = CTX.vid(), at = CTX.where(), k = 'tacSent:' + vid;
    let done = 0, fid = cur.fileId || '', fileName = cur.file || '', lastUrl = '', curN = null, lost = 0, made = null;
    const known = new Set(cur.isNew ? ['템플릿', '예시', '자료'] : ((c && c.data.tabs) || []).map(t => t.name));   // 보내기 전에 있던 탭 — 응답이 사라졌을 때 새 탭이 생겼는지 비교
    SENDING = true; $('tkGo').disabled = true; $('tkX').disabled = true;
    try {
      if (cur.isNew) {   // 1.11.10 이 팀 파일이 없으면 먼저 만듦 ('NS 스플릿 (요원…)' — 같은 이름이 있으면 그 파일)
        say('\'' + newNm + '\' 새 파일 만드는 중… (10~20초)');
        made = await WonNet.postBoard({ kind: 'tacticNewFile', mapKo, name: newNm, exact: true, agents: T.agents });
        if (!made.ok) throw new Error('새 파일: ' + (made.err || '실패'));
        fid = made.id; fileName = made.name; TK_CUR = Object.assign({}, cur, { fileId: made.id, file: made.name, isNew: false });
        const p0 = await prefs(); p0.tacticFileByTeam = Object.assign({}, p0.tacticFileByTeam, { [vid + ':' + mapKo + ':' + T.key]: made.id }); await S.set({ prefs: p0 });
      }
      for (const rd of list) {
        curN = rd.n;
        const name = String(rd.name || '').replace(/\s+/g, ' ').trim() || ('R' + rd.n), side = rd.def === T.key ? '수비' : '공격', head = 'R' + rd.n + ' (' + (done + 1) + '/' + list.length + ') ';
        let link = null; if (R0.linkOf && cur.links) { try { link = await R0.linkOf(rd.n); } catch (e) {} }   // 정리 슬라이드 그 라운드 장 (PPT를 보낸 맵만 · GAS v15)
        if (name !== rd.name0 && R0.onName) { try { await R0.onName(rd.n, name); } catch (e) {} }
        const ims = [];
        for (let i = 0; i < rd.items.length; i++) {
          say(head + '그림 ' + (i + 1) + '/' + rd.items.length + ' 만드는 중…');
          const u = await rd.items[i].img(); if (!u) continue;
          const cap = capOn ? String(rd.items[i].caption || '').trim() : '';
          const im = await image(u, cap, 1280); ims.push({ jpeg: im.data, imgW: im.w, imgH: im.h, caption: rd.items[i].caption || '' });
        }
        const chunks = []; let ch = [], size = 0;   // 한 번에 너무 크지 않게 (6장 · 6MB씩) — 같은 탭에 이어 붙임
        ims.forEach(x => { if (ch.length && (ch.length >= 6 || size + x.jpeg.length > 6e6)) { chunks.push(ch); ch = []; size = 0; } ch.push(x); size += x.jpeg.length; });
        chunks.push(ch);
        let j = null, sheetId = null;
        for (let q = 0; q < chunks.length; q++) {
          say(head + (q ? '그림 이어 붙이는 중…' : '\'' + name + '\' 탭 만드는 중… (탭 하나에 5~20초)'));
          if (q && sheetId == null) { lost += chunks[q].length; continue; }   // 탭은 생겼는데 주소를 몰라 더 못 붙임
          try { j = await WonNet.postBoard({ kind: 'tacticRound', mapKo, fileId: fid, name, title: side + ' > ' + name, summary: rd.summary || '', agents: T.agents.join(' · '), images: chunks[q], width: W, sheetId, link, src: { vid, map: at.map, n: rd.n, key: rd.key } }); }
          catch (e) {   // 응답만 사라졌을 수 있음 → 시트에 그 이름 탭이 새로 생겼는지 보고, 생겼으면 보낸 것으로 (같은 탭을 두 번 만들지 않게)
            if (q || !/응답을 못 읽었어요/.test(e.message)) throw e;
            say(head + '응답이 안 와서 시트에 들어갔는지 확인하는 중…');
            const chk = await WonNet.postBoard({ kind: 'tacticTabs', mapKo, fileId: fid, teams: [] }).catch(() => null);
            const hit = chk && chk.ok && (chk.tabs || []).map(t => t.name).find(n => !known.has(n) && (n === name || n.indexOf(name + ' (') === 0));
            if (!hit) throw e;
            j = { ok: true, tab: hit, sheetId: null, url: chk.url || '', file: chk.file, fileId: chk.fileId, col: chk.imgCol || 0 };
          }
          if (!j.ok) throw new Error(j.err || '실패');
          known.add(j.tab);
          sheetId = j.sheetId; fid = j.fileId || fid; fileName = j.file || fileName;
        }
        const fshort = fileName ? short(fileName, mapKo) : '';
        const all = (await S.get(k))[k] || {}; all[rd.key] = { file: fshort, fileId: fid, tab: j.tab, band: '', at: Date.now(), sheetId: j.sheetId, url: j.url || '', link: link && j.linked ? link.url : '', col: j.col || 0 };   // 링크는 시트가 넣었다고 한 것만 · col = 그림 열(v16 M=13, 예전 C면 분석 화면을 열 때 M열로)
        await S.set({ [k]: all }); TSENT = all; TSVID = vid;
        rd.on = false; rd.name0 = name; done++; lastUrl = j.url || lastUrl;
      }
      const p = await prefs(); p.tacticMap = mapKo;
      if (fid) { p.tacticFileBy = Object.assign({}, p.tacticFileBy, { [vid + ':' + mapKo]: fid }); p.tacticFile = Object.assign({}, p.tacticFile, { [mapKo]: fid }); p.tacticFileByTeam = Object.assign({}, p.tacticFileByTeam, { [vid + ':' + mapKo + ':' + T.key]: fid }); }
      await S.set({ prefs: p });
      Object.keys(TKTABS).forEach(x => { if (x.indexOf(mapKo + '|') === 0) delete TKTABS[x]; });
      SENDING = false; close();
      const w = document.createElement('span'); w.append(document.createTextNode('📋 텍틱 시트' + (fileName ? ' \'' + short(fileName, mapKo) + '\'' + (made && made.created ? '(새 파일)' : '') : '') + '에 새 탭 ' + done + '개 만듦 ✓ (라운드마다 그림만 차례로)' + (lost ? ' · 그림 ' + lost + '장은 응답이 끊겨 못 붙였어요 — 시트에서 확인' : '') + ' — '));
      const a = document.createElement('a'); a.href = lastUrl || (c.data.url || '#'); a.target = '_blank'; a.textContent = '시트 열기'; w.append(a);
      CTX.msg(w);
      try { CTX.onSent && CTX.onSent(null, null); } catch (e) {}
    } catch (e) {
      SENDING = false;
      Object.keys(TKTABS).forEach(x => { if (x.indexOf(mapKo + '|') === 0) delete TKTABS[x]; });
      if (made && made.ok && built && isOpen() && TK === R0) { $('tkNameRow').style.display = 'none'; loadTabs(true, made.id); }   // 새 파일은 만들었으면 그 파일로
      if (built && isOpen() && TK === R0) drawRoundList();
      say((done ? done + '라운드 만들고 ' : '') + 'R' + curN + '에서 멈췄어요: ' + e.message + (done ? ' — 남은 라운드만 다시 보내면 돼요' : ''), true);
      try { if (done) CTX.onSent && CTX.onSent(null, null); } catch (e2) {}
    }
    SENDING = false;
    if (built) { $('tkGo').disabled = false; $('tkX').disabled = false; }
  }
  function setImg(u) { if (!built) return; $('tkImg').src = u || ''; $('tkImg').style.display = u ? '' : 'none'; }
  const current = () => TK;
  root.WonTactic = { setup: (ctx) => { CTX = ctx; }, open, close, isOpen, reload, sent, sentTxt, setImg, current, image };
})(typeof self !== 'undefined' ? self : this);
