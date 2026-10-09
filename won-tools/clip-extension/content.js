/* 장면 캡처 도구 — 크롬 확장판 (북마클릿 v24 + 시청 모드 버전에서 이식)
   달라진 점
   - 북마크 누를 필요 없음: 유튜브 영상 페이지면 자동으로 켜짐
   - 메모·그림을 유튜브가 아니라 확장 저장소에 보관 (사이트 데이터 지워도 안전) + 자동 백업
   - 캡처 파일이 다운로드/관전캡처/경기별 폴더로 바로 저장 (정리 스크립트 불필요)
   - 받아쓰기 서버가 없으면 브라우저 음성인식으로 자동 전환 (다른 코치 PC에서도 동작)
   - 예전 북마클릿으로 쌓은 메모·그림은 처음 켤 때 자동으로 옮겨옴 */
(async () => {
  if (window.__wonClipExt) return;
  window.__wonClipExt = true;

  const S = chrome.storage.local;
  const send = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r || { ok: false }); }); }
    catch (e) { res({ ok: false, err: e.message }); }
  });

  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const fmtFile = (s) => { s = Math.floor(s); return pad(Math.floor(s/3600))+'-'+pad(Math.floor(s%3600/60))+'-'+pad(s%60); };
  const fmtLab  = (s) => { s = Math.floor(s); return pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60); };
  const safeName = (s, max = 60) => { s = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, ''); return s || 'untitled'; };

  const vidId = () => {
    const u = new URL(location.href);
    return u.searchParams.get('v') || (location.pathname.match(/^\/(?:live|shorts)\/([\w-]{6,})/) || [])[1] || null;
  };

  /* ---------- 설정 ---------- */
  const DEF = { folder: '관전캡처', saveFiles: true, asr: 'auto', asrUrl: 'http://127.0.0.1:5005', autoBackup: true,
                voiceOn: false, mode: 'analyze', clean: false, pos: null };   // 1.11.0: 메모는 글로 쓰는 게 기본 (말하기는 🎤 버튼)
  let prefs = Object.assign({}, DEF, (await S.get('prefs')).prefs || {});
  /* 확장을 새로고침하면 이미 열려 있던 유튜브 탭의 도구는 확장과 끊김(저장이 안 돼 버튼이 먹통) → 알아채서 새로고침 안내 */
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  let onDead = () => {};
  const setPref = (k, v) => { prefs[k] = v; try { if (!alive()) throw new Error('dead'); S.set({ prefs }).catch(() => onDead()); } catch (e) { onDead(); } };
  if (prefs.voiceV2 !== 1) { prefs.voiceOn = false; setPref('voiceV2', 1); }   // 1.11.0 코치 요청: 예전에 켜 둔 자동 받아쓰기도 한 번 끔 → 글 메모가 기본
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.prefs && ch.prefs.newValue) prefs = Object.assign({}, DEF, ch.prefs.newValue);
  });

  /* ---------- 예전 북마클릿 데이터 옮기기 (한 번만) ---------- */
  const blobToDataUrl = (b) => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  const oldIdb = () => new Promise((res) => {
    try {
      const rq = indexedDB.open('wonClipShots', 1);
      rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('shots')) rq.result.createObjectStore('shots', { keyPath: 'file' }); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  const oldIdbGet = (db, file) => new Promise((res) => {
    try { const rq = db.transaction('shots', 'readonly').objectStore('shots').get(file); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); }
    catch (e) { res(null); }
  });
  async function migrateOld() {
    if ((await S.get('migratedV1')).migratedV1) return 0;
    let n = 0;
    try {
      const up = {};
      if (localStorage.getItem('wonClipVoice') === '0') up.voiceOn = false;
      if (localStorage.getItem('wonClipMode') === 'watch') up.mode = 'watch';
      if (localStorage.getItem('wonClipClean') === '1') up.clean = true;
      try { const p = JSON.parse(localStorage.getItem('wonClipPos') || 'null'); if (p && typeof p.x === 'number') up.pos = p; } catch (e) {}
      if (Object.keys(up).length) { prefs = Object.assign(prefs, up); await S.set({ prefs }); }

      const keys = Object.keys(localStorage).filter(k => k.startsWith('wonClipLog_'));
      const db = keys.length ? await oldIdb() : null;
      for (const k of keys) {
        const id = k.slice('wonClipLog_'.length);
        let arr; try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { continue; }
        if (!Array.isArray(arr) || !arr.length) continue;
        const ex = (await S.get('log:' + id))['log:' + id];
        if (ex && ex.length) continue;
        for (const r of arr) {
          for (const f of ((r.files && r.files.length) ? r.files : [r.file])) {
            if (!f || !db) continue;
            const s = await oldIdbGet(db, f);
            if (s) await S.set({ ['img:' + f]: { thumb: s.thumb || null, full: s.full ? await blobToDataUrl(s.full) : null, at: s.at || Date.now() } });
          }
        }
        await S.set({ ['log:' + id]: arr, ['meta:' + id]: { vid: id, title: arr[0].title || id, count: arr.length, updated: Date.now(), migrated: true } });
        n++;
      }
    } catch (e) { console.warn('[장면캡처] 옮기기 실패', e); }
    await S.set({ migratedV1: true });
    return n;
  }
  const migrated = await migrateOld();

  /* ---------- 메모 저장소 (확장 저장소, 영상별) ---------- */
  let LOG = [], LOGVID = null;
  const TAB_ID = Math.random().toString(36).slice(2);
  const load = () => LOG;
  const save = (a) => {
    LOG = a;
    if (!LOGVID) return;
    const meta = { vid: LOGVID, title: (a[0] && a[0].title) || vidTitle(), count: a.length, updated: Date.now(), writer: TAB_ID, pending: a.filter(r => r.needShot).length };
    if (a.length) S.set({ ['log:' + LOGVID]: a, ['meta:' + LOGVID]: meta });
    else S.remove(['log:' + LOGVID, 'meta:' + LOGVID]);
  };
  const loadFor = async (id) => { LOGVID = id; LOG = id ? ((await S.get('log:' + id))['log:' + id] || []) : []; };

  /* ---------- 그림 저장소 ---------- */
  const imgPut = (file, rec) => S.set({ ['img:' + file]: rec });
  const imgGet = async (file) => (await S.get('img:' + file))['img:' + file] || null;
  const imgDel = (file) => S.remove('img:' + file);

  const vid = () => document.querySelector('.html5-main-video') || document.querySelector('video');
  const vidTitle = () => ((document.querySelector('h1.ytd-watch-metadata') || document.querySelector('.slim-video-information-title') || {}).innerText || document.title.replace(/ - YouTube$/, '')).trim();
  const videoFolder = () => safeName((LOG[0] && LOG[0].title) || vidTitle(), 60) + ' [' + (LOGVID || vidId() || 'video') + ']';
  const fileSave = (url, name) => { if (prefs.saveFiles) send({ t: 'dl', url, sub: videoFolder() + '/' + name }); };
  const textSave = async (text, mime, name) => {
    const r = await send({ t: 'dlText', text, mime, sub: videoFolder() + '/' + name });
    if (!r.ok) { // 너무 크면 예전 방식으로
      const u = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    }
    return r;
  };

  /* ---------- 화면 ---------- */
  const host = document.createElement('div');
  host.id = 'won-clip-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;right:22px;bottom:300px;';
  const sh = host.attachShadow({ mode: 'open' });

  const st = document.createElement('style');
  st.textContent = [
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Malgun Gothic",sans-serif}',
    '.wrap{display:flex;flex-direction:column;align-items:flex-end;gap:7px;transition:opacity .2s}',
    '.wrap.dim{opacity:.18}',
    '.dead{cursor:pointer;border:2px solid #fff;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;background:#b3261e;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.45)}',
    '.wrap.isdead{opacity:1 !important}',
    '.wrap.dim:hover{opacity:1}',
    '.btn{cursor:pointer;border:2px solid #BDD9F2;border-radius:2px;padding:12px 20px;font-size:15px;font-weight:700;background:#132D65;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.45);transition:transform .08s;display:flex;align-items:center;gap:8px}',
    '.btn:active{transform:scale(.94)}',
    '.cnt{background:#fff;color:#132D65;border-radius:2px;padding:1px 8px;font-size:13px}',
    '.row{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
    '.mini{font-size:12px;padding:7px 11px;background:rgba(19,45,101,.94);color:#fff;border-radius:2px;border:1px solid #4A88C7;cursor:pointer;text-align:left;white-space:nowrap}',
    '.mini:hover{background:#1C3B7A}',
    '.mini.on{background:#4A88C7;border-color:#BDD9F2;color:#fff}',
    '.mini.watch{background:#1C3B7A;border-color:#BDD9F2;color:#fff}',
    '.mini.pri{background:#fff;color:#132D65;border-color:#fff;font-weight:700}',
    '.mini.pri:hover{background:#EAF2FA}',
    '.menu{display:none;flex-direction:column;gap:4px;background:rgba(13,21,38,.96);border:1px solid #4A88C7;padding:6px;min-width:220px}',
    '.menu.on{display:flex}',
    '.menu .mlab{color:#BDD9F2;font-size:11px;padding:2px 4px}',
    '.grip{cursor:grab;touch-action:none;user-select:none;font-size:13px;padding:7px 9px;background:rgba(19,45,101,.94);color:#BDD9F2;border:1px solid #4A88C7;border-radius:2px}',
    '.grip:active{cursor:grabbing;background:#444}',
    '.strip{display:flex;gap:4px;flex:none;align-items:center;flex-wrap:wrap;max-width:230px}',
    '.th.sm{width:62px;height:35px}',
    '.lbnav{position:fixed;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:999px;width:46px;height:46px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.toast{position:fixed;left:50%;top:13%;transform:translateX(-50%);background:rgba(0,0,0,.86);color:#fff;padding:12px 20px;border-radius:10px;font-size:15px;font-weight:600;opacity:0;transition:opacity .18s;pointer-events:none;white-space:nowrap;max-width:76vw;overflow:hidden;text-overflow:ellipsis}',
    '.toast.on{opacity:1}',
    '.memo{position:fixed;left:50%;bottom:16%;transform:translateX(-50%);display:none;align-items:center;gap:10px;background:rgba(10,10,10,.95);border:1px solid rgba(255,255,255,.28);border-radius:12px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.6);width:min(820px,86vw)}',
    '.memo.on{display:flex}',
    '.memo .tag{color:#BDD9F2;font-weight:700;font-size:13px;white-space:nowrap}',
    '.memo input{flex:1;min-width:0;background:#191919;border:1px solid rgba(255,255,255,.22);border-radius:8px;color:#fff;font-size:15px;padding:10px 12px;outline:none}',
    '.memo input:focus{border-color:#4A88C7}',
    '.memo .hint{color:#999;font-size:11px;white-space:nowrap}',
    '.mic{cursor:pointer;border:1px solid #4A88C7;background:#132D65;color:#fff;border-radius:2px;min-width:40px;height:40px;font-size:14px;display:flex;align-items:center;justify-content:center;padding:0 10px;white-space:nowrap}',
    '.mic.rec{background:#c0392b;border-color:#ff8d8d;color:#fff;animation:pulse 1s infinite}',
    '.mic.busy{background:#2e5f9e;border-color:#8fc4ff;color:#fff}',
    '@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(224,43,60,.7)}70%{box-shadow:0 0 0 12px rgba(224,43,60,0)}100%{box-shadow:0 0 0 0 rgba(224,43,60,0)}}',
    '.panel{position:fixed;right:22px;bottom:370px;width:min(700px,94vw);max-height:56vh;overflow:auto;background:rgba(15,15,15,.97);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px;color:#eee;font-size:13px;display:none}',
    '.panel.on{display:block}',
    '.item{display:flex;gap:8px;align-items:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.item a{color:#7cc4ff;text-decoration:none;white-space:nowrap}',
    '.item .mi{flex:1;min-width:0;background:transparent;border:1px solid transparent;border-radius:6px;color:#ddd;font-size:12px;padding:4px 6px;outline:none}',
    '.item .mi:hover{border-color:rgba(255,255,255,.18)}',
    '.item .mi:focus{border-color:#4A88C7;background:#1c1c1c}',
    '.x{cursor:pointer;color:#ff7b7b;padding:0 4px}',
    '.seqh{cursor:grab;user-select:none;padding:2px 4px;border-radius:5px}',
    '.seqh:hover{background:#333}',
    '.item.dropimg{outline:2px dashed #3ddc84;outline-offset:2px;background:rgba(61,220,132,.08)}',
    '.item.dropmove{border-top:2px solid #4A88C7}',
    '.item.sel{background:rgba(74,136,199,.16);outline:1px solid rgba(74,136,199,.6);border-radius:2px}',
    '.item.subrow{margin-left:26px;border-left:2px solid rgba(189,217,242,.45);padding-left:8px}',
    '.item.subrow .seqh{color:#BDD9F2;font-size:12px}',
    '.open{cursor:pointer;background:#2a2a2a;border:1px solid rgba(255,255,255,.2);color:#ddd;border-radius:6px;font-size:11px;padding:4px 7px;flex:none}',
    '.open:hover{background:#444}',
    '.dt textarea{width:100%;min-height:110px;background:#191919;border:1px solid rgba(255,255,255,.22);border-radius:8px;color:#fff;font-size:14px;padding:10px 12px;outline:none;resize:vertical;line-height:1.55;font-family:inherit}',
    '.dt textarea:focus{border-color:#4A88C7}',
    '.dt .lab{font-size:12px;color:#999;margin:12px 0 5px}',
    '.shot{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.shot img{width:170px;border-radius:6px;border:1px solid rgba(255,255,255,.2);cursor:zoom-in;flex:none}',
    '.shot .cap{flex:1;min-width:0;background:#191919;border:1px solid rgba(255,255,255,.18);border-radius:6px;color:#ddd;font-size:12px;padding:7px 9px;outline:none}',
    '.shot .cap:focus{border-color:#4A88C7}',
    '.dz{margin-top:10px;border:1px dashed rgba(255,255,255,.25);border-radius:8px;padding:12px;text-align:center;color:#999;font-size:12px}',
    '.dz.hot{border-color:#3ddc84;color:#3ddc84;background:rgba(61,220,132,.08)}',
    '.phead{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
    '.pclose{margin-left:auto;cursor:pointer;background:#333;border:1px solid rgba(255,255,255,.25);color:#eee;border-radius:8px;padding:4px 10px;font-size:13px}',
    '.pclose:hover{background:#c0392b;border-color:#ff8d8d}',
    '.th{width:96px;height:54px;object-fit:cover;border-radius:5px;border:1px solid rgba(255,255,255,.2);cursor:zoom-in;flex:none;background:#000}',
    '.th.none{display:flex;align-items:center;justify-content:center;font-size:10px;color:#777}',
    '.th.sm.none{font-size:9px}',
    '.lb{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;z-index:2147483647;cursor:zoom-out}',
    '.lb.on{display:flex}',
    '.lb img{max-width:94vw;max-height:88vh;border-radius:8px}',
    '.lbcap{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);color:#ddd;font-size:14px;background:rgba(0,0,0,.7);padding:8px 16px;border-radius:8px;max-width:80vw;text-align:center}'
  ].join('');
  sh.appendChild(st);

  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const wrap = mk('div', 'wrap');
  const row  = mk('div', 'row');
  const grip = mk('button', 'grip', '✥');
  grip.title = '끌어서 위치 옮기기';
  const bClean = mk('button', 'mini', '');
  const bVoice = mk('button', 'mini', '');
  const bMemoAuto = mk('button', 'mini', '');
  const bList = mk('button', 'mini', '목록');
  bList.title = '이 영상에서 찍은 장면 목록 (메모 고치기·부연·그림)';
  const bAna = mk('button', 'mini pri', '분석 열기');
  bAna.title = '분석 화면 — 라운드마다 방송 미니맵·찍은 장면·스크린샷을 한곳에서 보고 그리고, PPT·텍틱 시트로 보내기';
  const bMore = mk('button', 'mini', '⚙');
  bMore.title = '더보기 — 모드·받아쓰기·깔끔 화면·내보내기·관리 페이지';
  const bExp  = mk('button', 'mini', '메모 내보내기 (.md)');
  const bExpH = mk('button', 'mini', '메모 내보내기 (HTML)');
  const bMng  = mk('button', 'mini', '관리 페이지 (설정·백업)');
  const bHide = mk('button', 'mini', '도구 숨기기 (S로 다시)');
  /* 1.11.0: 막대에는 목록 · 분석 열기 · ⚙만, 나머지는 ⚙ 안으로 */
  const menu = mk('div', 'menu');
  menu.append(mk('div', 'mlab', 'S 키를 누르면'), bMemoAuto, mk('div', 'mlab', '메모'), bVoice, mk('div', 'mlab', '화면'), bClean, bExp, bExpH, bMng, bHide);
  row.append(grip, bList, bAna, bMore);
  bMore.onclick = () => menu.classList.toggle('on');
  [bExp, bExpH, bMng, bHide].forEach(b => b.addEventListener('click', () => menu.classList.remove('on')));
  const bCap = mk('button', 'btn');
  const bCapLabel = mk('span', null, '장면 저장');
  bCap.append(bCapLabel);
  const cnt = mk('span', 'cnt', '0');
  bCap.append(cnt);
  wrap.append(menu, row, bCap);

  const toastEl = mk('div', 'toast');
  const panel = mk('div', 'panel');

  const memoBox = mk('div', 'memo');
  const memoTag = mk('span', 'tag', '메모');
  const micBtn = mk('button', 'mic', '녹음');
  micBtn.title = '녹음 시작/중지';
  const memoIn = document.createElement('input');
  memoIn.type = 'text';
  memoIn.placeholder = '말하세요 — Enter로 녹음 끝내기 (Esc 취소)';
  const addBtn = mk('button', 'mic', '다음 →');
  addBtn.title = '지금 메모 저장하고, 이 장면의 부연(001-1)을 새로 만들어 이어서 말하기 (S 키)';
  const memoHint = mk('span', 'hint', 'Enter: 녹음 끝 → 다시 Enter: 저장 · S: 저장하고 부연으로 넘어가기 · Esc: 취소');
  memoBox.append(memoTag, micBtn, addBtn, memoIn, memoHint);

  sh.append(wrap, toastEl, panel, memoBox);
  document.documentElement.appendChild(host);

  const toast = (m, ms = 1500) => { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(toastEl._h); toastEl._h = setTimeout(() => toastEl.classList.remove('on'), ms); };
  let deadShown = false;
  onDead = () => {
    if (deadShown || alive()) return; deadShown = true;
    const b = mk('button', 'dead', '↻ 확장이 새로 고쳐졌어요 — 눌러서 이 탭 새로고침');
    b.title = '확장을 새로고침하면 이미 열려 있던 탭의 도구는 확장과 끊겨 버튼이 안 먹어요. 탭을 새로고침하면 다시 돼요 (영상 위치는 유지)';
    b.onclick = () => { try { const v = document.querySelector('video'), u = new URL(location.href); if (v && v.currentTime > 5) u.searchParams.set('t', Math.floor(v.currentTime) + 's'); location.href = u.toString(); } catch (e) { location.reload(); } };
    wrap.prepend(b); wrap.classList.add('isdead');
    toast('확장이 새로 고쳐져서 이 탭의 도구가 끊겼어요 — 빨간 버튼(또는 F5)으로 새로고침해 주세요', 6000);
  };
  setInterval(() => { if (!alive()) onDead(); }, 3000);
  const refresh = () => { cnt.textContent = load().length; if (panel.classList.contains('on')) draw(); };

  /* 시청 모드: 영상 안 멈추고 스샷만(북마크) / 분석 모드: 멈추고 메모창+받아쓰기 */
  let mode = prefs.mode === 'watch' ? 'watch' : 'analyze';
  let memoAuto = mode === 'analyze';
  const paintMemoAuto = () => {
    bMemoAuto.textContent = mode === 'watch' ? '👁 안 멈추고 장면만 저장 (시청 모드)' : '🔍 멈추고 메모창 열기 (분석 모드)';
    bMemoAuto.classList.toggle('on', mode === 'analyze');
    bMemoAuto.classList.toggle('watch', mode === 'watch');
    bMemoAuto.title = mode === 'watch' ? 'S: 안 멈추고 북마크만 저장. 누르면 분석 모드로' : 'S: 멈추고 메모창 열림. 누르면 시청 모드로';
    bCapLabel.textContent = mode === 'watch' ? '북마크' : '장면 저장';
  };
  let voiceOn = prefs.voiceOn !== false;
  const paintVoice = () => {
    bVoice.textContent = voiceOn ? '🎤 메모창 열면 바로 받아쓰기 (켜짐)' : '⌨ 글로 쓰기 (받아쓰기는 🎤 버튼)';
    bVoice.classList.toggle('on', voiceOn);
    memoIn.placeholder = voiceOn ? '말하세요 — Enter로 녹음 끝내기 (Esc 취소)' : '메모를 쓰세요 — Enter 저장 · Esc 취소 · 🎤 누르면 말로';
    memoHint.textContent = voiceOn ? 'Enter: 녹음 끝 → 다시 Enter: 저장 · S: 저장하고 부연으로 넘어가기 · Esc: 취소' : 'Enter: 저장 · 🎤: 말로 받아쓰기 · S: 저장하고 부연으로 · Esc: 취소';
  };
  paintVoice();
  paintMemoAuto();

  /* ---------- 깔끔 모드 ---------- */
  let cleanOn = !!prefs.clean;
  let cleanStyle = null;
  const applyClean = () => {
    const on = cleanOn && !!vidId();
    if (on) {
      if (!cleanStyle) {
        cleanStyle = document.createElement('style');
        cleanStyle.id = 'won-clean-style';
        cleanStyle.textContent = [
          '#secondary.ytd-watch-flexy{display:none !important}',
          'ytd-watch-flexy[flexy] #primary.ytd-watch-flexy{max-width:none !important;width:100% !important}',
          '#columns.ytd-watch-flexy{max-width:none !important}',
          'ytd-watch-flexy #player-wide-container,ytd-watch-flexy #player-container-outer{max-width:none !important}',
          '#comments{display:none !important}',
          'ytd-merch-shelf-renderer,ytd-engagement-panel-section-list-renderer{display:none !important}'
        ].join('');
        document.documentElement.appendChild(cleanStyle);
      }
    } else if (cleanStyle) { cleanStyle.remove(); cleanStyle = null; }
    wrap.classList.toggle('dim', cleanOn);
    bClean.textContent = cleanOn ? '깔끔 화면 (추천영상·댓글 숨김) 켜짐' : '깔끔 화면 꺼짐';
    bClean.classList.toggle('on', cleanOn);
    window.dispatchEvent(new Event('resize'));
  };
  bClean.onclick = () => {
    cleanOn = !cleanOn; setPref('clean', cleanOn);
    applyClean();
    toast(cleanOn ? '추천영상·댓글 숨김' : '원래 화면으로');
  };

  const setPos = (x, y) => {
    host.style.left = x + 'px'; host.style.top = y + 'px';
    host.style.right = 'auto'; host.style.bottom = 'auto';
  };
  /* 저장된 위치가 현재 창보다 오른쪽/아래면 화면 안으로 끌어온다 */
  const fitPos = () => {
    const r = host.getBoundingClientRect();
    if (!r.width) return;
    const x = Math.max(4, Math.min(r.left, innerWidth - r.width - 4));
    const y = Math.max(4, Math.min(r.top, innerHeight - r.height - 4));
    if (Math.abs(x - r.left) > 1 || Math.abs(y - r.top) > 1) setPos(Math.round(x), Math.round(y));
  };
  (function restorePos() {
    const p = prefs.pos;
    if (p && typeof p.x === 'number') setPos(Math.min(p.x, innerWidth - 80), Math.min(p.y, innerHeight - 60));
    requestAnimationFrame(fitPos);
  })();
  window.addEventListener('resize', fitPos);
  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = host.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { grip.setPointerCapture(e.pointerId); } catch (err) {}
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = Math.max(4, Math.min(innerWidth - 80, e.clientX - drag.dx));
    const y = Math.max(4, Math.min(innerHeight - 60, e.clientY - drag.dy));
    setPos(x, y);
    if (panel.classList.contains('on')) placePanel();
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    const r = host.getBoundingClientRect();
    setPref('pos', { x: Math.round(r.left), y: Math.round(r.top) });
    toast('위치 저장됨', 900);
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  const placePanel = () => {
    const r = host.getBoundingClientRect();
    const pw = panel.offsetWidth || 560, ph = panel.offsetHeight || 300;
    let left = r.right - pw; if (left < 8) left = 8;
    let top = r.top - ph - 10; if (top < 8) top = Math.min(r.bottom + 10, innerHeight - ph - 8);
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
  };

  const relocate = () => { (document.fullscreenElement || document.documentElement).appendChild(host); };
  document.addEventListener('fullscreenchange', relocate);

  /* 영상이 바뀌면 그 영상의 기록으로 교체 (유튜브는 페이지 이동 없이 영상이 바뀜) */
  let navBusy = null;
  const onNav = () => {
    if (navBusy) return navBusy;
    navBusy = (async () => {
      const id = vidId();
      if (id !== LOGVID) {
        panel.classList.remove('on'); closeMemo(); detailIdx = -1; selIdx = -1;
        await loadFor(id);
      }
      host.style.display = id ? '' : 'none';
      applyClean();
      refresh();
      setTimeout(fillPending, 1500);
    })().finally(() => { navBusy = null; });
    return navBusy;
  };
  window.addEventListener('yt-navigate-finish', onNav);
  const navPoll = setInterval(() => { if (vidId() !== LOGVID) onNav(); }, 1000);

  const lb = mk('div', 'lb');
  const lbImg = document.createElement('img');
  const lbCap = mk('div', 'lbcap', '');
  lb.append(lbImg, lbCap);
  const lbPrev = mk('button', 'lbnav', '‹'); lbPrev.style.left = '18px';
  const lbNext = mk('button', 'lbnav', '›'); lbNext.style.right = '18px';
  lb.append(lbPrev, lbNext);
  lbPrev.onclick = (e) => { e.stopPropagation(); lbIdx = (lbIdx - 1 + lbFiles.length) % lbFiles.length; showLb(); };
  lbNext.onclick = (e) => { e.stopPropagation(); lbIdx = (lbIdx + 1) % lbFiles.length; showLb(); };
  lb.onclick = () => { lb.classList.remove('on'); lbImg.removeAttribute('src'); };
  sh.appendChild(lb);
  let selIdx = -1, detailIdx = -1;
  let lbFiles = [], lbIdx = 0, lbRec = null;
  const showLb = async () => {
    const s = await imgGet(lbFiles[lbIdx]);
    if (!s) { toast('저장된 이미지가 없어요'); return; }
    lbImg.src = s.full || s.thumb;
    lbCap.textContent = '#' + lbRec.seq + '  ' + lbRec.time + '  (' + (lbIdx + 1) + '/' + lbFiles.length + ')' + (lbRec.memo ? '  ·  ' + lbRec.memo : '');
    lb.classList.add('on');
    lbPrev.style.display = lbNext.style.display = lbFiles.length > 1 ? 'flex' : 'none';
  };
  const openShot = async (rec, i) => {
    lbRec = rec; lbFiles = (rec.files && rec.files.length) ? rec.files : [rec.file]; lbIdx = i || 0;
    await showLb();
  };

  /* ---------- 받아쓰기 ----------
     local  : 내 PC의 whisper 서버 (정확, 게임 용어 잘 알아들음)
     browser: 크롬 기본 음성인식 (설치 불필요, 구글 서버로 전송, 용어 정확도 낮음)
     auto   : 서버가 켜져 있으면 local, 아니면 browser */
  const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let serverOk = false;
  const pingServer = async () => { const r = await send({ t: 'ping' }); serverOk = !!(r && r.ok); return serverOk; };
  let browserAsrBroken = !!(await S.get('asrBrowserBroken')).asrBrowserBroken;
  const pickEngine = () => {
    if (prefs.asr === 'local') return 'local';
    if (prefs.asr === 'browser') return 'browser';
    if (serverOk) return 'local';
    return (SRClass && !browserAsrBroken) ? 'browser' : 'none';
  };
  /* 받아쓰기 힌트(1.11.0): 늘 쓰는 말 몇 개 + 지금 경기의 두 팀·맵·요원(시트/보드에서 불러온 조합) + 코치가 관리 페이지에 적은 말
     예전엔 모든 맵·요원 + 한 경기(TL·PRX) 이름을 길게 넣어서 오히려 헷갈림 */
  const ASR_BASE = '발로란트 대회 분석 메모. 궁, 팝, 연막, 원웨이, 알람봇, 리콘, 드론, 터렛, TP, 디폴트, 리테이크, 전진, 러시, 미드 컨트롤, 이코, 안티이코, 스파이크 설치, A 메인, B 메인.';
  async function asrPrompt() {
    let ctx = '';
    try {
      const id = vidId(), rec = (await S.get('rounds:' + id))['rounds:' + id], v = vid();
      let m = 1;
      if (rec && (rec.rounds || []).length) { const t = v ? v.currentTime : 0; rec.rounds.slice().sort((x, y) => x.jump - y.jump).forEach(r => { if (t >= r.jump - 0.5) m = r.map; }); }
      const rk = 'roster:' + id + ':' + m, ro = (await S.get(rk))[rk];
      if (ro && ro.teams) {
        const tn = [ro.teams.A && ro.teams.A.name, ro.teams.B && ro.teams.B.name].filter(Boolean);
        const ag = [...new Set([].concat((ro.teams.A || {}).agents || [], (ro.teams.B || {}).agents || []).filter(Boolean).map(a => WonNames.agentKo(a)))];
        ctx = (tn.length ? tn.join(' 대 ') + '. ' : '') + (ro.mapName ? WonNames.mapKo(ro.mapName) + '. ' : '') + (ag.length ? ag.join(', ') + '.' : '');
      }
    } catch (e) {}
    const words = String(prefs.asrWords || '').replace(/\s+/g, ' ').trim();
    return (ASR_BASE + ' ' + ctx + (words ? ' ' + words + '.' : '')).trim();
  }
  function trimSilence(x, rate) {   // 앞뒤 조용한 부분 잘라 냄 — 빈 소리에서 whisper가 말을 지어내는 것 줄이기
    const fr = Math.round(rate * 0.02), n = Math.floor(x.length / fr); if (!n) return null;
    const rms = new Float32Array(n);
    for (let i = 0; i < n; i++) { let q = 0; for (let j = i * fr; j < (i + 1) * fr; j++) q += x[j] * x[j]; rms[i] = Math.sqrt(q / fr); }
    const sorted = Array.from(rms).sort((p, q) => p - q), floor = sorted[Math.floor(n * 0.1)] || 0, peak = sorted[Math.floor(n * 0.95)] || 0;
    const th = Math.max(0.01, Math.min(floor * 3, peak * 0.25));   // 조용한 바닥의 3배 — 계속 소리가 나면(바닥≈최대) 최대의 1/4
    let a = 0, b = n - 1; while (a < n && rms[a] < th) a++; while (b > a && rms[b] < th) b--;
    if (a >= n) return null;
    const padF = Math.round(0.3 / 0.02); a = Math.max(0, a - padF); b = Math.min(n - 1, b + padF);
    return x.subarray(a * fr, (b + 1) * fr);
  }

  let mediaStream = null, recorder = null, chunks = [], recording = false, busy = false;
  let pendingDone = null, curEngine = null;
  let silenceTimer = null, hardStop = null, sawSpeech = false, recFor = -1;

  const setMic = (state) => {
    micBtn.classList.remove('rec', 'busy');
    if (state === 'rec') { micBtn.classList.add('rec'); micBtn.textContent = '■ 듣는 중'; }
    else if (state === 'busy') { micBtn.classList.add('busy'); micBtn.textContent = '받아쓰는 중'; }
    else micBtn.textContent = '🎤 말하기';
  };
  setMic('idle');

  function encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buf);
    const w = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    w(36, 'data'); view.setUint32(40, samples.length * 2, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }
  const abToB64 = (ab) => {
    const u8 = new Uint8Array(ab); let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  // text = 용어 교정한 글, raw = 받아쓰기 원문(있으면 그 장면의 memoRaw에 이어 붙여 보관 — 보드에서 '받아쓰기 원문'으로 보임)
  const appendToTarget = (text, targetIdx, raw) => {
    if (raw && raw !== text) { const l0 = load(); if (l0[targetIdx]) { l0[targetIdx].memoRaw = ((l0[targetIdx].memoRaw || l0[targetIdx].memo || '') + ' ' + raw).trim(); save(l0); } }
    if (memoBox.classList.contains('on') && memoIdx === targetIdx) {
      memoIn.value = (memoIn.value ? memoIn.value + ' ' : '') + text;
      memoIn.focus();
    } else {
      const log = load();
      if (log[targetIdx]) { log[targetIdx].memo = ((log[targetIdx].memo || '') + ' ' + text).trim(); save(log); refresh(); toast('#' + log[targetIdx].seq + ' 메모 추가됨'); }
    }
  };

  async function transcribe(blob, targetIdx) {
    busy = true; setMic('busy');
    try {
      const ac = new AudioContext();
      const decoded = await ac.decodeAudioData(await blob.arrayBuffer());
      ac.close();
      const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
      const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
      const rendered = await off.startRendering();
      const pcm = trimSilence(rendered.getChannelData(0), 16000);
      if (!pcm) { toast('들린 말이 없어요'); return; }
      const wav = encodeWav(pcm, 16000);
      const r = await send({ t: 'asr', wav: abToB64(wav), prompt: await asrPrompt() });
      if (!r.ok) throw new Error(r.err || '서버 응답 없음');
      const c = WonTerms.clean((r.json && r.json.text) || '');
      if (!c.text || /^[\s.·]*$/.test(c.text)) toast(c.why === 'english' ? '한국어가 안 들렸어요 — 영상 소리(해설)가 섞였을 수 있어요. 영상을 멈추고 다시 말해 주세요' : '들린 말이 없어요', 3500);
      else appendToTarget(WonTerms.fix(c.text, prefs.asrFix), targetIdx, c.text);
    } catch (e) {
      serverOk = false;
      toast('받아쓰기 실패 — 받아쓰기 서버가 켜져 있는지 확인 (' + e.message + ')', 4200);
    } finally {
      busy = false; setMic('idle');
    }
  }

  /* 브라우저 음성인식 */
  let sr = null, srStopReq = false, srDone = null, srFinal = '', srBase = '';
  function startBrowserRec() {
    if (!SRClass) { toast('이 브라우저는 음성인식을 지원하지 않아요 — ⚙ 관리 페이지에서 받아쓰기 방식을 확인하세요', 3200); return; }
    curEngine = 'browser'; srFinal = ''; srBase = memoIn.value; srStopReq = false;
    sr = new SRClass();
    sr.lang = 'ko-KR'; sr.continuous = true; sr.interimResults = true;
    sr.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) srFinal += t + ' '; else interim += t;
      }
      if (memoBox.classList.contains('on') && memoIdx === recFor)
        memoIn.value = ((srBase ? srBase + ' ' : '') + srFinal + interim).replace(/\s+/g, ' ').trim();
    };
    sr.onerror = (e) => {
      if (e.error === 'not-allowed') { srStopReq = true; toast('마이크 권한이 없어요 — 주소창 왼쪽 자물쇠에서 마이크 허용', 3000); }
      else if (e.error === 'network' || e.error === 'service-not-allowed' || e.error === 'language-not-supported' || e.error === 'audio-capture') {
        // 이 브라우저(예: 어사이드 등 크롬 이외)에서는 브라우저 음성인식이 안 됨 → 다시 시도하지 않음
        srStopReq = true; browserAsrBroken = true; S.set({ asrBrowserBroken: true });
        toast('이 브라우저는 자체 음성인식이 안 돼요 — 바탕화면 "받아쓰기 서버 재시작"을 켜주세요 (지금은 타이핑으로)', 5000);
      }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('음성인식 오류: ' + e.error, 2500);
    };
    sr.onend = () => {
      if (!srStopReq && recording) { try { sr.start(); return; } catch (e) {} }
      recording = false; setMic('idle');
      const txt = srFinal.replace(/\s+/g, ' ').trim();
      if (txt && !(memoBox.classList.contains('on') && memoIdx === recFor)) appendToTarget(WonTerms.fix(txt, prefs.asrFix), recFor, txt);
      else if (memoBox.classList.contains('on') && memoIdx === recFor) memoIn.value = WonTerms.fix(memoIn.value, prefs.asrFix);
      if (srDone) { srDone(); srDone = null; }
      pendingDone = null;
    };
    try { sr.start(); } catch (e) { toast('음성인식 시작 실패: ' + e.message); return; }
    recording = true; setMic('rec');
    clearTimeout(hardStop);
    hardStop = setTimeout(() => { if (recording) { stopRec(); toast('5분 넘어 녹음을 끊었어요'); } }, 300000);
  }

  async function startRec() {
    if (recording || busy) return;
    recFor = memoIdx;
    if (!serverOk && prefs.asr !== 'browser') await pingServer();
    const eng = pickEngine();
    if (eng === 'none') { toast('받아쓰기 서버가 꺼져 있어요 — 바탕화면 "받아쓰기 서버 재시작" (지금은 타이핑으로)', 4000); return; }
    if (eng === 'browser') return startBrowserRec();
    curEngine = 'local';
    { const vv = vid(); if (vv && !vv.paused) { vv.pause(); wasPlaying = true; } }   // 영상 소리(해설)가 같이 녹음되지 않게 — 메모창 닫으면 다시 재생
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (e) { toast('마이크를 열 수 없어요: ' + e.name, 3000); return; }
    chunks = []; sawSpeech = false;
    recorder = new MediaRecorder(mediaStream);
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      let done; pendingDone = new Promise(r => done = r);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
      recording = false; setMic('idle');
      if (blob.size > 2000 && sawSpeech) await transcribe(blob, recFor);
      done(); pendingDone = null;
    };
    recorder.start();
    recording = true; setMic('rec');

    // 말소리 감지 (아무 말 없으면 서버로 안 보냄)
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(mediaStream);
    const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const tick = () => {
      if (!recording) { try { ac.close(); } catch (e) {} return; }
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      if (Math.sqrt(sum / buf.length) > 0.02) sawSpeech = true;
      silenceTimer = setTimeout(tick, 120);
    };
    tick();
    clearTimeout(hardStop);
    hardStop = setTimeout(() => { if (recording) { stopRec(); toast('5분 넘어 녹음을 끊었어요'); } }, 300000);
  }

  function stopRec() {
    clearTimeout(silenceTimer); clearTimeout(hardStop);
    if (curEngine === 'browser') {
      if (sr && recording) { srStopReq = true; pendingDone = new Promise(r => srDone = r); try { sr.stop(); } catch (e) {} }
      recording = false;
      return;
    }
    if (recorder && recording) { try { recorder.stop(); } catch (e) {} }
    recording = false;
  }
  micBtn.onclick = (e) => { e.preventDefault(); if (recording) stopRec(); else startRec(); memoIn.focus(); };

  /* ---------- 메모 ---------- */
  let memoIdx = -1, wasPlaying = false;
  function openMemo(idx) {
    memoIdx = idx;
    const log = load();
    memoIn.value = (log[idx] && log[idx].memo) || '';
    memoBox.classList.add('on');
    memoTag.textContent = '#' + (log[idx] ? log[idx].seq : '') + ' 메모';
    setTimeout(() => memoIn.focus(), 30);
    if (voiceOn) setTimeout(startRec, 150);
  }
  function closeMemo() {
    const wasOpen = memoBox.classList.contains('on');
    stopRec(); memoBox.classList.remove('on'); memoIdx = -1; memoIn.blur();
    if (wasOpen && wasPlaying) { const vv = vid(); if (vv && vv.paused) vv.play().catch(() => {}); }
  }
  function commitMemo() {
    stopRec();
    if (memoIdx < 0) { closeMemo(); return; }
    const log = load();
    const v = memoIn.value.trim();
    if (log[memoIdx]) { log[memoIdx].memo = v; save(log); }
    closeMemo(); refresh();
    if (v) toast('메모 저장됨');
  }
  ['keydown', 'keyup', 'keypress'].forEach(ev => memoIn.addEventListener(ev, (e) => {
    e.stopPropagation();
    if (ev !== 'keydown') return;
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (recording) { stopRec(); toast('녹음 끝 — 받아쓰는 중'); }
      else if (busy) { toast('받아쓰는 중이에요, 잠시만'); }
      else commitMemo();
    }
    else if (e.key === 'Escape') { e.preventDefault(); closeMemo(); }
  }, true));

  /* 캡처 한 장 저장: 확장 저장소(썸네일+원본) + 다운로드/관전캡처/경기 폴더 */
  /* 태블릿 북마크(needShot)의 화면을 자동으로 채운다: 그 시점으로 잠깐 이동 → 캡처 → 원래 자리로 */
  let filling = false;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const seekTo = (v, sec) => new Promise((res) => {
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', on); res(); };
    const on = () => {
      if (v.requestVideoFrameCallback) { v.requestVideoFrameCallback(() => setTimeout(fin, 80)); setTimeout(fin, 1500); }
      else setTimeout(fin, 350);
    };
    v.addEventListener('seeked', on);
    v.currentTime = sec;
    setTimeout(fin, 8000);
  });
  async function fillPending() {
    if (filling || !LOGVID) return;
    if (!LOG.some(r => r.needShot)) return;
    if (window.__wonScanning) { setTimeout(fillPending, 5000); return; }
    if (memoBox.classList.contains('on') || recording || busy) { setTimeout(fillPending, 3000); return; }
    const v = vid();
    for (let i = 0; i < 50 && (!v || !v.videoWidth || v.readyState < 2); i++) await sleep(200);
    if (!v || !v.videoWidth) return;
    filling = true; window.__wonFilling = true;
    const myVid = LOGVID, back = v.currentTime, wasP = !v.paused;
    try { v.pause(); } catch (e) {}
    const total = LOG.filter(r => r.needShot).length;
    let n = 0;
    try {
      for (const r of LOG) {
        if (!r.needShot) continue;
        if (vidId() !== myVid || LOGVID !== myVid) break;
        toast('📱 태블릿 북마크 화면 채우는 중… ' + (n + 1) + '/' + total, 60000);
        await seekTo(v, r.sec);
        if (!v.videoWidth) continue;
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        if (!r.title || r.title === myVid) { const tt = vidTitle(); if (tt) LOG.forEach(x => { if (!x.title || x.title === myVid) x.title = tt; }); }
        r.file = myVid + '_' + fmtFile(r.sec) + '_' + r.seq + '.jpg'; r.files = [r.file];
        delete r.needShot;
        save(LOG);
        await storeFrame(c, r.file);
        n++;
      }
    } finally {
      if (vidId() === myVid) { await seekTo(v, back); if (wasP) v.play().catch(() => {}); }
      filling = false; window.__wonFilling = false;
      refresh();
      toast(n ? '📱 태블릿 북마크 ' + n + '개 화면 채움 완료' : '화면을 채우지 못했어요', 2500);
    }
  }

  async function storeFrame(c, name) {
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    const full = await blobToDataUrl(blob);
    fileSave(full, name);
    try {
      const tc = document.createElement('canvas');
      tc.width = 320; tc.height = Math.round(320 * c.height / c.width);
      tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
      await imgPut(name, { thumb: tc.toDataURL('image/jpeg', 0.6), full, at: Date.now() });
      if (panel.classList.contains('on')) draw();
    } catch (e) { toast('그림 저장 실패: ' + e.message, 2500); }
  }

  // 번호 재계산: 본 장면 001,002... / 부연 001-1, 001-2...
  function renumber(log) {
    let main = 0, sub = 0;
    for (const r of log) {
      if (r.sub) { sub++; r.seq = pad(main, 3) + '-' + sub; }
      else { main++; sub = 0; r.seq = pad(main, 3); }
    }
    return log;
  }

  async function capture(asSub, parentIdx) {
    asSub = asSub === true;
    if (vidId() !== LOGVID) await onNav();
    const v = vid();
    if (!v || !v.videoWidth) { toast('영상을 찾지 못했어요'); return; }
    const log = load();
    if (asSub && !log.length) { toast('부연을 달 장면이 없어요 — S로 먼저 만드세요'); return; }
    const t = v.currentTime;
    const quick = mode === 'watch';
    wasPlaying = !v.paused;
    if (!quick && !v.paused) { try { v.pause(); } catch (e) {} }
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const url = 'https://www.youtube.com/watch?v=' + vidId() + '&t=' + Math.floor(t) + 's';
    const rec = { seq: '', time: fmtLab(t), sec: Math.floor(t), url, file: '', files: [], memo: '', title: vidTitle(), saved: new Date().toISOString(), sub: asSub, bm: quick };
    let idx;
    if (asSub) {
      let lastMain = -1;
      if (typeof parentIdx === 'number' && parentIdx >= 0 && parentIdx < log.length) {
        lastMain = parentIdx;
        while (lastMain >= 0 && log[lastMain].sub) lastMain--;
      } else {
        for (let i = log.length - 1; i >= 0; i--) if (!log[i].sub) { lastMain = i; break; }
      }
      idx = lastMain + 1;
      while (idx < log.length && log[idx].sub) idx++;
      log.splice(idx, 0, rec);
    } else { log.push(rec); idx = log.length - 1; }
    renumber(log);
    const base = vidId() + '_' + fmtFile(t) + '_' + rec.seq;
    rec.file = base + '.jpg'; rec.files = [rec.file];
    save(log); refresh();
    if (quick) toast('★ 북마크  #' + rec.seq + '   ' + fmtLab(t), 1100);
    else toast((asSub ? '부연 저장  #' : '저장됨  #') + rec.seq + '   ' + fmtLab(t));
    if (quick) { /* 시청 모드: 아무것도 안 멈추고 계속 */ }
    else if (memoAuto) openMemo(idx);
    else if (wasPlaying) { const vv = vid(); if (vv && vv.paused) vv.play().catch(() => {}); }
    try { navigator.clipboard.writeText(url).catch(function () {}); } catch (e) {}
    await storeFrame(c, base + '.jpg');
  }
  const continueLast = () => capture(true);

  // 말하는 도중 S: 지금 메모 마무리 -> 부연 항목 새로 만들고 그쪽으로 녹음 이어감
  let spawning = false;
  async function spawnSub() {
    if (spawning) return;
    spawning = true;
    const parent = memoIdx;
    const keepPlaying = wasPlaying;
    try {
      if (recording) stopRec();
      if (pendingDone) { toast('받아쓰는 중... 잠시만', 1500); await pendingDone; }
      wasPlaying = false;
      commitMemo();
      await capture(true, parent);
      wasPlaying = keepPlaying;
    } finally { spawning = false; }
  }

  function drawDetail() {
    const log = load();
    const r = log[detailIdx];
    if (!r) { detailIdx = -1; draw(); return; }
    const files = (r.files && r.files.length) ? r.files : [r.file];
    r.caps = r.caps || {};

    const wrapD = mk('div', 'dt');
    const head = mk('div', 'phead');
    const back = mk('button', 'pclose', '← 목록');
    back.onclick = () => { detailIdx = -1; draw(); };
    const ttl = mk('div', null, (r.sub ? '↳ 부연 ' : '#') + r.seq + '   ' + r.time);
    ttl.style.cssText = 'font-weight:700;font-size:15px';
    const lnk = mk('a', null, '유튜브에서 보기');
    lnk.href = r.url; lnk.target = '_blank';
    lnk.style.cssText = 'color:#7cc4ff;text-decoration:none;font-size:12px';
    const cls = mk('button', 'pclose', '✕ 닫기');
    cls.onclick = () => { detailIdx = -1; panel.classList.remove('on'); };
    head.append(back, ttl, lnk, cls);
    wrapD.appendChild(head);

    wrapD.appendChild(mk('div', 'lab', '메모 (여러 줄 가능 · 자동 저장)'));
    const ta = document.createElement('textarea');
    ta.value = r.memo || '';
    ta.placeholder = '이 장면에 대한 메모';
    ['keydown', 'keyup', 'keypress'].forEach(ev => ta.addEventListener(ev, (e) => e.stopPropagation(), true));
    const saveMemo = () => { const l = load(); if (l[detailIdx]) { l[detailIdx].memo = ta.value; save(l); cnt.textContent = l.length; } };
    ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(saveMemo, 400); });
    ta.addEventListener('blur', saveMemo);
    wrapD.appendChild(ta);
    if (r.memoRaw && r.memoRaw !== r.memo) { const rw = mk('div', 'lab', '받아쓰기 원문 (용어 자동 교정 전): ' + r.memoRaw); rw.style.cssText = 'color:#888;font-weight:400;white-space:pre-wrap'; wrapD.appendChild(rw); }

    wrapD.appendChild(mk('div', 'lab', '스크린샷 ' + files.length + '장 · 그림을 클릭하면 크게, 오른쪽 칸에 설명을 적을 수 있습니다'));
    files.forEach((f, k) => {
      const row2 = mk('div', 'shot');
      const im = document.createElement('img');
      im.onclick = () => openShot(r, k);
      imgGet(f).then(s => {
        if (s && s.thumb) im.src = s.thumb;
        else { const ph = mk('div', null, '이미지 없음'); ph.style.cssText = 'width:170px;height:96px;display:flex;align-items:center;justify-content:center;background:#222;border-radius:6px;color:#a66;font-size:12px;flex:none'; im.replaceWith(ph); }
      });
      row2.appendChild(im);
      const cap = document.createElement('input');
      cap.className = 'cap'; cap.type = 'text';
      cap.placeholder = '이 그림 설명 (예: 킬조이 터렛 위치)';
      cap.value = r.caps[f] || '';
      ['keydown', 'keyup', 'keypress'].forEach(ev => cap.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Enter' && !e.isComposing) cap.blur(); }, true));
      const saveCap = () => { const l = load(); if (l[detailIdx]) { l[detailIdx].caps = l[detailIdx].caps || {}; l[detailIdx].caps[f] = cap.value.trim(); save(l); } };
      cap.addEventListener('change', saveCap);
      cap.addEventListener('blur', saveCap);
      row2.appendChild(cap);
      const del = mk('span', 'x', 'X');
      del.title = '이 그림 빼기';
      del.onclick = () => {
        if (!confirm('이 그림을 이 메모에서 뺄까요?')) return;
        const l = load();
        const rr = l[detailIdx];
        rr.files = ((rr.files && rr.files.length) ? rr.files : [rr.file]).filter(z => z !== f);
        if (rr.caps) delete rr.caps[f];
        save(l); imgDel(f); draw();
      };
      row2.appendChild(del);
      wrapD.appendChild(row2);
    });

    const dz = mk('div', 'dz', '여기에 그림을 끌어다 놓거나  Ctrl+V  로 붙여넣기   ·   클릭하면 파일 선택');
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true; fi.style.display = 'none';
    fi.addEventListener('change', async () => { if (fi.files && fi.files.length) { await attachFiles(detailIdx, fi.files); draw(); } });
    dz.onclick = () => fi.click();
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('hot'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('hot'));
    dz.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation(); dz.classList.remove('hot');
      if (e.dataTransfer.files && e.dataTransfer.files.length) { await attachFiles(detailIdx, e.dataTransfer.files); draw(); }
    });
    wrapD.append(dz, fi);

    const btnRow = mk('div', 'row');
    btnRow.style.cssText = 'margin-top:10px;justify-content:flex-start';
    const addFrame = mk('button', 'mini', '부연 추가 (지금 화면)');
    addFrame.title = '이 장면 밑에 부연 항목을 새로 만듭니다';
    addFrame.onclick = async () => { const p = detailIdx; panel.classList.remove('on'); detailIdx = -1; await capture(true, p); };
    const talkMore = mk('button', 'mini', '메모 이어 말하기');
    talkMore.title = '이 항목의 메모에 말을 덧붙입니다';
    talkMore.onclick = () => {
      const v = vid(); wasPlaying = v ? !v.paused : false;
      if (v && !v.paused) { try { v.pause(); } catch (e) {} }
      const idx = detailIdx;
      panel.classList.remove('on');
      openMemo(idx);
    };
    btnRow.append(addFrame, talkMore);
    wrapD.appendChild(btnRow);

    panel.appendChild(wrapD);
  }

  async function attachFiles(idx, fileList) {
    const log = load();
    const r = log[idx];
    if (!r) return;
    let added = 0;
    for (const f of Array.from(fileList)) {
      if (!/^image\//.test(f.type)) continue;
      try {
        const bmp = await createImageBitmap(f);
        const tc = document.createElement('canvas');
        tc.width = 320; tc.height = Math.max(1, Math.round(320 * bmp.height / bmp.width));
        tc.getContext('2d').drawImage(bmp, 0, 0, tc.width, tc.height);
        const files = (r.files && r.files.length) ? r.files : [r.file];
        const ext = (f.type === 'image/png') ? '.png' : '.jpg';
        const name = (LOGVID || vidId()) + '_' + r.time.replace(/:/g, '-') + '_' + r.seq + '-' + (files.length + 1) + ext;
        const full = await blobToDataUrl(f);
        await imgPut(name, { thumb: tc.toDataURL('image/jpeg', 0.6), full, at: Date.now(), added: true });
        fileSave(full, name);
        r.files = files.concat([name]);
        added++;
      } catch (err) {}
    }
    if (added) { save(log); refresh(); toast('#' + r.seq + ' 에 그림 ' + added + '장 첨부됨'); }
    else toast('이미지 파일이 아니에요');
  }

  function draw() {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    if (detailIdx >= 0) { drawDetail(); return; }
    const log = load();
    const phead = mk('div', 'phead');
    const htxt = mk('div', null, '장면 ' + log.filter(r => !r.sub).length + '개 · 부연 ' + log.filter(r => r.sub).length + '개  ·  S: 새 장면 / Shift+S: 직전 장면의 부연');
    htxt.style.cssText = 'font-weight:700';
    const pclose = mk('button', 'pclose', '✕ 닫기');
    pclose.onclick = () => panel.classList.remove('on');
    phead.append(htxt, pclose);
    panel.appendChild(phead);
    if (!log.length) { panel.appendChild(mk('div', null, '(비어 있음)')); return; }
    log.forEach((r, i) => {
      const it = mk('div', 'item');
      if (r.sub) it.classList.add('subrow');
      const seqEl = mk('span', 'seqh', (r.sub ? '↳ ' : '#') + r.seq + (r.tablet ? ' 📱' : r.bm ? ' ★' : ''));
      seqEl.draggable = true;
      seqEl.title = r.bm ? '시청 모드 북마크 · 끌어서 순서 변경' : '끌어서 순서 변경';
      seqEl.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/won-idx', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      it.appendChild(seqEl);

      if (i === selIdx) it.classList.add('sel');
      it.addEventListener('mousedown', () => {
        selIdx = i;
        [...panel.querySelectorAll('.item')].forEach(x => x.classList.remove('sel'));
        it.classList.add('sel');
      });
      it.addEventListener('dragover', (e) => {
        const types = Array.from(e.dataTransfer.types || []);
        if (types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; it.classList.add('dropimg'); }
        else if (types.includes('text/won-idx')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; it.classList.add('dropmove'); }
      });
      it.addEventListener('dragleave', () => it.classList.remove('dropimg', 'dropmove'));
      it.addEventListener('drop', async (e) => {
        e.preventDefault(); e.stopPropagation();
        it.classList.remove('dropimg', 'dropmove');
        const fl = e.dataTransfer.files;
        if (fl && fl.length) { await attachFiles(i, fl); return; }
        const from = parseInt(e.dataTransfer.getData('text/won-idx'), 10);
        if (isNaN(from) || from === i) return;
        const l = load();
        const [moved] = l.splice(from, 1);
        l.splice(i, 0, moved);
        renumber(l);
        save(l); refresh();
        toast('순서 변경됨');
      });
      const files = (r.files && r.files.length) ? r.files : [r.file];
      const strip = mk('div', 'strip');
      files.forEach((f, k) => {
        const th = document.createElement('img');
        th.className = k === 0 ? 'th' : 'th sm';
        th.alt = '';
        th.title = (r.caps && r.caps[f]) ? r.caps[f] : f;
        th.onclick = (e) => { e.stopPropagation(); openShot(r, k); };
        strip.appendChild(th);
        imgGet(f).then(s => {
          if (s && s.thumb) th.src = s.thumb;
          else { const ph = mk('div', th.className + ' none', '없음'); ph.onclick = (e) => { e.stopPropagation(); openShot(r, k); }; th.replaceWith(ph); }
        });
      });
      it.appendChild(strip);
      const a = mk('a', null, r.time); a.href = r.url; a.target = '_blank';
      it.appendChild(a);
      const mi = document.createElement('input');
      mi.className = 'mi'; mi.type = 'text'; mi.value = r.memo || ''; mi.placeholder = '메모 없음';
      ['keydown', 'keyup', 'keypress'].forEach(ev => mi.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev === 'keydown' && e.key === 'Enter' && !e.isComposing) mi.blur();
      }, true));
      const commit = () => { const l = load(); if (l[i]) { l[i].memo = mi.value.trim(); save(l); } };
      mi.addEventListener('change', commit);
      mi.addEventListener('blur', commit);
      it.appendChild(mi);
      const ob = mk('button', 'open', '자세히');
      ob.onclick = (e) => { e.stopPropagation(); detailIdx = i; draw(); };
      it.appendChild(ob);
      const x = mk('span', 'x', 'X');
      x.title = '삭제';
      x.onclick = () => {
        const l = load();
        let n = 1;
        if (!l[i].sub) { while (i + n < l.length && l[i + n].sub) n++; }
        if (n > 1 && !confirm('본 장면을 지우면 부연 ' + (n - 1) + '개도 같이 지워집니다. 계속할까요?')) return;
        for (let k = 0; k < n; k++) ((l[i + k].files && l[i + k].files.length) ? l[i + k].files : [l[i + k].file]).forEach(f => imgDel(f));
        l.splice(i, n); renumber(l); save(l); refresh();
      };
      it.appendChild(x);
      panel.appendChild(it);
    });
    const clr = mk('button', 'mini', '전체 비우기');
    clr.style.marginTop = '8px';
    clr.onclick = () => {
      if (!confirm('이 영상의 저장 목록을 비울까요? (다운로드 폴더에 받은 이미지 파일은 그대로 남습니다)')) return;
      load().forEach(r => ((r.files && r.files.length) ? r.files : [r.file]).forEach(f => imgDel(f)));
      save([]); refresh();
    };
    panel.appendChild(clr);
  }

  async function exportHtml() {
    const log = load();
    if (!log.length) { toast('저장된 장면이 없어요'); return; }
    toast('이미지 넣는 중...', 4000);
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let body = '';
    for (const r of log) {
      const files = (r.files && r.files.length) ? r.files : [r.file];
      let imgs = '';
      for (const f of files) {
        const s = await imgGet(f);
        const cap = (r.caps && r.caps[f]) ? r.caps[f] : '';
        if (s && s.full) imgs += '<figure><img src="' + s.full + '"><figcaption>' + (cap ? '<b>' + esc(cap) + '</b><br>' : '') + esc(f) + '</figcaption></figure>';
        else if (s && s.thumb) imgs += '<figure><img src="' + s.thumb + '"><figcaption>' + (cap ? '<b>' + esc(cap) + '</b><br>' : '') + esc(f) + ' (썸네일)</figcaption></figure>';
        else imgs += '<figure class="miss">이미지 없음<figcaption>' + esc(f) + '</figcaption></figure>';
      }
      const block = '<h2>' + (r.sub ? '<span class="subtag">부연</span> ' : '#') + esc(r.seq) + '  <a href="' + esc(r.url) + '" target="_blank">' + esc(r.time) + '</a></h2>' +
              '<p class="memo">' + (r.memo ? esc(r.memo) : '<span class="none">(메모 없음)</span>') + '</p>' +
              '<div class="shots">' + imgs + '</div>';
      if (r.sub) body += '<div class="sub">' + block + '</div>';
      else body += (body ? '</section>' : '') + '<section>' + block;
    }
    if (body) body += '</section>';
    const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(log[0].title) + '</title>' +
      '<style>body{font-family:system-ui,"Malgun Gothic",sans-serif;background:#141414;color:#eee;margin:0;padding:36px;line-height:1.65}' +
      '.w{max-width:1100px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}.meta{color:#888;margin-bottom:26px;font-size:13px}' +
      'section{background:#1d1d1d;border:1px solid #333;border-radius:12px;padding:18px 22px;margin:16px 0}' +
      'h2{font-size:17px;margin:0 0 8px}h2 a{color:#7cc4ff;text-decoration:none}' +
      '.memo{font-size:15px;margin:0 0 14px;white-space:pre-wrap}.none{color:#777}' +
      '.shots{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;max-width:520px}' +
      'img{width:100%;border-radius:8px;border:1px solid #333;display:block}' +
      'figcaption{color:#777;font-size:11px;margin-top:4px}.miss{color:#a66;font-size:13px}' +
      '.sub{margin:14px 0 0 22px;padding:12px 16px;border-left:3px solid #e02b3c;background:#171717;border-radius:0 8px 8px 0}.sub h2{font-size:15px}.subtag{background:#e02b3c;color:#fff;font-size:11px;padding:2px 7px;border-radius:4px;vertical-align:middle}' +
      '</style></head><body><div class="w"><h1>' + esc(log[0].title) + '</h1>' +
      '<div class="meta">장면 ' + log.length + '건 · 내보낸 날짜 ' + new Date().toLocaleString('ko-KR') + '</div>' +
      body + '</div></body></html>';
    await textSave(html, 'text/html;charset=utf-8', (LOGVID || vidId()) + '_관전일지.html');
    toast('HTML 내보냄 (이미지 포함, ' + log.length + '장면) — 경기 폴더에 저장', 2500);
  }

  async function exportLog() {
    const log = load();
    if (!log.length) { toast('저장된 장면이 없어요'); return; }
    let md = '# ' + log[0].title + '\n\n';
    md += '| # | 시점 | 링크 | 스크린샷 파일 | 메모 |\n|---|---|---|---|---|\n';
    log.forEach(r => {
      const files = (r.files && r.files.length) ? r.files : [r.file];
      const fcol = files.map(f => (r.caps && r.caps[f]) ? f + ' (' + r.caps[f].replace(/\|/g, '/') + ')' : f).join(' / ');
      md += '| ' + (r.sub ? '↳ ' : '') + r.seq + ' | ' + r.time + ' | ' + r.url + ' | ' + fcol + ' | ' + (r.memo || '').replace(/\|/g, '/').replace(/\n/g, ' ') + ' |\n';
    });
    await textSave('﻿' + md, 'text/markdown;charset=utf-8', (LOGVID || vidId()) + '_clip-log.md');
    toast('목록 내보냄 (' + log.length + '장면)');
  }

  bCap.onclick = () => capture();
  bExp.onclick = exportLog;
  bExpH.onclick = exportHtml;
  /* 1.11.1: 확장 페이지(분석 화면·관리 페이지)는 링크처럼 '이 창의 새 탭'으로 연다.
     어사이드에서는 백그라운드가 만든 탭(chrome.tabs.create)이 코치 창에 안 보였음.
     열린 페이지가 pageOpen을 남기면 끝 — 6초 안에 소식이 없으면 예전 방식(백그라운드가 이 탭 바로 옆에 만들기)으로 한 번 더 */
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
  bMng.onclick = () => openPage('manage.html', { t: 'openManage' });
  bList.onclick = () => { panel.classList.toggle('on'); if (panel.classList.contains('on')) { draw(); placePanel(); } };
  bHide.onclick = () => { wrap.style.display = 'none'; panel.classList.remove('on'); toast('S 키를 누르면 다시 나타납니다', 1800); };
  bAna.onclick = () => {   // 지금 보고 있는 영상 시각의 라운드로 분석 화면 열기 (라운드 고르기는 분석 화면이 t로 함 — 누른 순간 바로 열려야 새 탭이 막히지 않음)
    const id = vidId(); if (!id) return;
    const v = vid(), t = v ? Math.floor(v.currentTime) : 0;
    openPage('analyze.html?v=' + encodeURIComponent(id) + '&t=' + t + '&yt=1', { t: 'openAnalyze', vid: id, sec: t });
  };
  addBtn.onclick = (e) => { e.preventDefault(); if (memoIdx >= 0) spawnSub(); };
  bMemoAuto.onclick = () => {
    mode = mode === 'watch' ? 'analyze' : 'watch';
    memoAuto = mode === 'analyze';
    setPref('mode', mode);
    paintMemoAuto();
    toast(mode === 'watch' ? '👁 시청 모드 — S 누르면 안 멈추고 북마크만 남깁니다' : '🔍 분석 모드 — S 누르면 멈추고 메모창이 열립니다', 2200);
  };
  bVoice.onclick = () => {
    voiceOn = !voiceOn;
    setPref('voiceOn', voiceOn);
    paintVoice();
    if (!voiceOn) stopRec();
    else if (memoBox.classList.contains('on')) startRec();
    toast(voiceOn ? '받아쓰기 켜짐 (메모창 열리면 자동 녹음)' : '받아쓰기 꺼짐 (타이핑만)');
  };

  const onKey = (e) => {
    if (!LOGVID) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (memoBox.classList.contains('on')) {
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (recording) { stopRec(); toast('녹음 끝 — 받아쓰는 중'); }
        else if (busy) { toast('받아쓰는 중이에요, 잠시만'); }
        else commitMemo();
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        closeMemo();
      } else if ((e.code === 'KeyS' || (!e.code && /^[sSㄴ]$/.test(e.key))) && (recording || busy)) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (memoIdx >= 0) spawnSub();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (lb.classList.contains('on')) { lb.click(); return; }
      if (panel.classList.contains('on')) { panel.classList.remove('on'); return; }
    }
    const el = document.activeElement;
    const tag = ((el || {}).tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (el && el.isContentEditable)) return;
    if (e.code === 'KeyS' || e.code === 'Backquote' || (!e.code && /^[sSㄴ]$/.test(e.key))) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (wrap.style.display === 'none') { wrap.style.display = ''; return; }
      if (e.shiftKey) continueLast(); else capture();
    }
  };
  const onPaste = async (e) => {
    const txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    const ae = document.activeElement, typing = ae && (/^(input|textarea)$/i.test(ae.tagName) || ae.isContentEditable || ae === host);
    const hasTimedLink = /(youtu\.be\/[\w-]{11}|youtube\.com\/(watch|live|shorts))[^\s<>]*[?&](t|start)=\d/.test(txt);
    const hasLinkAndTimes = /(youtu\.be\/[\w-]{11}|youtube\.com\/(watch|live|shorts))/.test(txt) && /^\s*\[?\s*(\d{1,2}:)?\d{1,2}:\d{2}(?!\d)/m.test(txt);
    if (/^\s*WONCLIP1\|/.test(txt) || ((hasTimedLink || hasLinkAndTimes) && !typing && !memoBox.classList.contains('on'))) {
      e.preventDefault(); e.stopPropagation();
      const r = await send({ t: 'importTablet', text: txt });
      if (!r.ok) { toast(r.err || '가져오기 실패', 3000); return; }
      const here = (r.videos || []).find(v => v.vid === LOGVID);
      toast('태블릿 북마크 ' + r.added + '개 가져옴' + (r.dup ? ' (중복 ' + r.dup + '개 제외)' : '') +
        ((r.videos || []).length > 1 ? ' — 영상 ' + r.videos.length + '개, 각 영상을 열면 화면이 채워져요' : here ? ' — 화면 채우는 중…' : ' — 그 영상을 열면 화면이 채워져요'), 4000);
      return;
    }
    if (!LOGVID) return;
    const items = (e.clipboardData && e.clipboardData.items) ? Array.from(e.clipboardData.items) : [];
    const imgs = items.filter(it => it.type && it.type.indexOf('image/') === 0).map(it => it.getAsFile()).filter(Boolean);
    if (!imgs.length) return;
    let target = -1;
    if (panel.classList.contains('on') && detailIdx >= 0) target = detailIdx;
    else if (memoBox.classList.contains('on') && memoIdx >= 0) target = memoIdx;
    else if (panel.classList.contains('on')) {
      const log = load();
      target = (selIdx >= 0 && selIdx < log.length) ? selIdx : log.length - 1;
    }
    if (target < 0) { toast('붙여넣을 곳이 없어요 — 목록을 열고 줄을 먼저 클릭하세요', 2600); return; }
    e.preventDefault(); e.stopPropagation();
    await attachFiles(target, imgs);
    if (detailIdx >= 0 && panel.classList.contains('on')) draw();
  };
  window.addEventListener('paste', onPaste, true);
  window.addEventListener('keydown', onKey, true);

  /* 다른 탭(관리 페이지 등)에서 이 영상 기록이 바뀌면 반영 */
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !LOGVID) return;
    const c = ch['log:' + LOGVID];
    if (!c) return;
    const m = ch['meta:' + LOGVID];
    if (m && m.newValue && m.newValue.writer === TAB_ID) return;
    const nv = c.newValue || [];
    if (JSON.stringify(nv) !== JSON.stringify(LOG)) { LOG = nv; if (detailIdx < 0) refresh(); else cnt.textContent = LOG.length; setTimeout(fillPending, 500); }
  });

  /* 예전 도구가 자동으로 켜졌다가 꺼지면 알림 (kill-old.js) */
  new MutationObserver(() => toast('예전 장면 저장 도구가 같이 켜져서 꺼뒀어요 (중복 저장 방지)', 3000))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-won-old-blocked'] });

  await onNav();
  if (LOGVID) bCap.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 520, iterations: 3 });
  await pingServer();
  if (migrated) toast('예전 북마크 도구 기록 ' + migrated + '개 영상을 옮겨왔어요', 3500);
  else if (LOGVID) {
    const eng = pickEngine();
    toast(eng === 'local' ? '도구 켜짐 · 받아쓰기 서버 연결됨 — S: 새 장면 / Shift+S: 부연'
      : eng === 'browser' ? '도구 켜짐 · 브라우저 음성인식 사용 — S: 새 장면 / Shift+S: 부연'
      : '도구 켜짐 · 받아쓰기 서버가 꺼져 있어요 — 바탕화면 "받아쓰기 서버 재시작"', 3500);
  }
  setInterval(() => { if (!recording && !busy) pingServer(); }, 60000);
})();
