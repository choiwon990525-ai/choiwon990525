(() => {
  if (window.__wonClip) { window.__wonClip.destroy(); }

  const ASR_URL = 'http://127.0.0.1:5005/inference';

  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const fmtFile = (s) => { s = Math.floor(s); return pad(Math.floor(s/3600))+'-'+pad(Math.floor(s%3600/60))+'-'+pad(s%60); };
  const fmtLab  = (s) => { s = Math.floor(s); return pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60); };

  const vidId = () => new URL(location.href).searchParams.get('v') || 'video';
  const KEY = () => 'wonClipLog_' + vidId();
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY()) || '[]'); } catch(e){ return []; } };
  const save = (a) => localStorage.setItem(KEY(), JSON.stringify(a));
  const VKEY = 'wonClipVoice';
  let voiceOn = localStorage.getItem(VKEY) !== '0';

  const host = document.createElement('div');
  host.id = 'won-clip-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;right:22px;bottom:300px;';
  const sh = host.attachShadow({ mode:'open' });

  const st = document.createElement('style');
  st.textContent = [
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Malgun Gothic",sans-serif}',
    '.wrap{display:flex;flex-direction:column;align-items:flex-end;gap:7px;transition:opacity .2s}',
    '.wrap.dim{opacity:.18}',
    '.wrap.dim:hover{opacity:1}',
    '.btn{cursor:pointer;border:2px solid #fff;border-radius:999px;padding:14px 22px;font-size:16px;font-weight:700;background:#e02b3c;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.45);transition:transform .08s;display:flex;align-items:center;gap:8px}',
    '.btn:active{transform:scale(.94)}',
    '.cnt{background:#fff;color:#e02b3c;border-radius:999px;padding:1px 9px;font-size:13px}',
    '.row{display:flex;gap:6px}',
    '.mini{font-size:12px;padding:7px 11px;background:rgba(18,18,18,.9);color:#eee;border-radius:8px;border:1px solid rgba(255,255,255,.2);cursor:pointer}',
    '.mini:hover{background:rgba(60,60,60,.95)}',
    '.mini.on{background:#1f6f3f;border-color:#3ddc84;color:#eaffef}',
    '.mini.watch{background:#1f4f7a;border-color:#7cc4ff;color:#eaf6ff}',
    '.grip{cursor:grab;touch-action:none;user-select:none;font-size:13px;padding:7px 9px;background:rgba(18,18,18,.9);color:#bbb;border:1px solid rgba(255,255,255,.2);border-radius:8px}',
    '.grip:active{cursor:grabbing;background:#444}',
    '.strip{display:flex;gap:4px;flex:none;align-items:center;flex-wrap:wrap;max-width:230px}',
    '.th.sm{width:62px;height:35px}',
    
    '.lbnav{position:fixed;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:999px;width:46px;height:46px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.toast{position:fixed;left:50%;top:13%;transform:translateX(-50%);background:rgba(0,0,0,.86);color:#fff;padding:12px 20px;border-radius:10px;font-size:15px;font-weight:600;opacity:0;transition:opacity .18s;pointer-events:none;white-space:nowrap;max-width:76vw;overflow:hidden;text-overflow:ellipsis}',
    '.toast.on{opacity:1}',
    '.memo{position:fixed;left:50%;bottom:16%;transform:translateX(-50%);display:none;align-items:center;gap:10px;background:rgba(10,10,10,.95);border:1px solid rgba(255,255,255,.28);border-radius:12px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.6);width:min(820px,86vw)}',
    '.memo.on{display:flex}',
    '.memo .tag{color:#ff8d8d;font-weight:700;font-size:13px;white-space:nowrap}',
    '.memo input{flex:1;background:#191919;border:1px solid rgba(255,255,255,.22);border-radius:8px;color:#fff;font-size:15px;padding:10px 12px;outline:none}',
    '.memo input:focus{border-color:#e02b3c}',
    '.memo .hint{color:#999;font-size:11px;white-space:nowrap}',
    '.mic{cursor:pointer;border:1px solid rgba(255,255,255,.25);background:#222;color:#eee;border-radius:999px;min-width:40px;height:40px;font-size:15px;display:flex;align-items:center;justify-content:center;padding:0 10px;white-space:nowrap}',
    '.mic.rec{background:#c0392b;border-color:#ff8d8d;color:#fff;animation:pulse 1s infinite}',
    '.mic.busy{background:#2e5f9e;border-color:#8fc4ff;color:#fff}',
    '@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(224,43,60,.7)}70%{box-shadow:0 0 0 12px rgba(224,43,60,0)}100%{box-shadow:0 0 0 0 rgba(224,43,60,0)}}',
    '.panel{position:fixed;right:22px;bottom:370px;width:700px;max-height:56vh;overflow:auto;background:rgba(15,15,15,.97);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px;color:#eee;font-size:13px;display:none}',
    '.panel.on{display:block}',
    '.item{display:flex;gap:8px;align-items:center;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.item a{color:#7cc4ff;text-decoration:none;white-space:nowrap}',
    '.item .mi{flex:1;background:transparent;border:1px solid transparent;border-radius:6px;color:#ddd;font-size:12px;padding:4px 6px;outline:none}',
    '.item .mi:hover{border-color:rgba(255,255,255,.18)}',
    '.item .mi:focus{border-color:#e02b3c;background:#1c1c1c}',
    '.x{cursor:pointer;color:#ff7b7b;padding:0 4px}',
    '.seqh{cursor:grab;user-select:none;padding:2px 4px;border-radius:5px}',
    '.seqh:hover{background:#333}',
    '.item.dropimg{outline:2px dashed #3ddc84;outline-offset:2px;background:rgba(61,220,132,.08)}',
    '.item.dropmove{border-top:2px solid #e02b3c}',
    '.item.sel{background:rgba(224,43,60,.14);outline:1px solid rgba(224,43,60,.55);border-radius:6px}',
    '.item.subrow{margin-left:26px;border-left:2px solid rgba(255,141,141,.45);padding-left:8px}',
    '.item.subrow .seqh{color:#ff8d8d;font-size:12px}',
    '.open{cursor:pointer;background:#2a2a2a;border:1px solid rgba(255,255,255,.2);color:#ddd;border-radius:6px;font-size:11px;padding:4px 7px;flex:none}',
    '.open:hover{background:#444}',
    '.dt textarea{width:100%;min-height:110px;background:#191919;border:1px solid rgba(255,255,255,.22);border-radius:8px;color:#fff;font-size:14px;padding:10px 12px;outline:none;resize:vertical;line-height:1.55;font-family:inherit}',
    '.dt textarea:focus{border-color:#e02b3c}',
    '.dt .lab{font-size:12px;color:#999;margin:12px 0 5px}',
    '.shot{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.shot img{width:170px;border-radius:6px;border:1px solid rgba(255,255,255,.2);cursor:zoom-in;flex:none}',
    '.shot .cap{flex:1;background:#191919;border:1px solid rgba(255,255,255,.18);border-radius:6px;color:#ddd;font-size:12px;padding:7px 9px;outline:none}',
    '.shot .cap:focus{border-color:#e02b3c}',
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

  const wrap = mk('div','wrap');
  const row  = mk('div','row');
  const grip = mk('button','grip','✥');
  grip.title = '끌어서 위치 옮기기';
  const bClean = mk('button','mini','');
  const bVoice = mk('button','mini','');
  const bMemoAuto = mk('button','mini','');
  const bList = mk('button','mini','목록');
  const bExp  = mk('button','mini','내보내기');
  const bExpH = mk('button','mini','HTML');
  const bHide = mk('button','mini','숨기기');
  row.append(grip, bClean, bMemoAuto, bVoice, bList, bExp, bExpH, bHide);
  const bCap = mk('button','btn');
  const bCapLabel = mk('span',null,'장면 저장');
  bCap.append(bCapLabel);
  const cnt = mk('span','cnt','0');
  bCap.append(cnt);
  wrap.append(row, bCap);

  const toastEl = mk('div','toast');
  const panel = mk('div','panel');

  const memoBox = mk('div','memo');
  const memoTag = mk('span','tag','메모');
  const micBtn = mk('button','mic','녹음');
  micBtn.title = '녹음 시작/중지';
  const memoIn = document.createElement('input');
  memoIn.type = 'text';
  memoIn.placeholder = '말하세요 — Enter로 녹음 끝내기 (Esc 취소)';
  const addBtn = mk('button','mic','다음 →');
  addBtn.title = '지금 메모 저장하고, 이 장면의 부연(001-1)을 새로 만들어 이어서 말하기 (S 키)';
  const memoHint = mk('span','hint','Enter: 녹음 끝 → 다시 Enter: 저장 · S: 저장하고 부연으로 넘어가기 · Esc: 취소');
  memoBox.append(memoTag, micBtn, addBtn, memoIn, memoHint);

  sh.append(wrap, toastEl, panel, memoBox);
  document.documentElement.appendChild(host);

  const toast = (m, ms=1500) => { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(toastEl._h); toastEl._h = setTimeout(()=>toastEl.classList.remove('on'), ms); };
  const refresh = () => { cnt.textContent = load().length; if (panel.classList.contains('on')) draw(); };
  /* 시청 모드: 영상 안 멈추고 스샷만(북마크) / 분석 모드: 멈추고 메모창+받아쓰기 */
  const MODEKEY = 'wonClipMode';
  let mode = localStorage.getItem(MODEKEY) === 'watch' ? 'watch' : 'analyze';
  let memoAuto = mode === 'analyze';
  const paintMemoAuto = () => {
    bMemoAuto.textContent = mode === 'watch' ? '👁 시청 모드' : '🔍 분석 모드';
    bMemoAuto.classList.toggle('on', mode === 'analyze');
    bMemoAuto.classList.toggle('watch', mode === 'watch');
    bMemoAuto.title = mode === 'watch' ? 'S: 안 멈추고 북마크만 저장. 누르면 분석 모드로' : 'S: 멈추고 메모창 열림. 누르면 시청 모드로';
    bCapLabel.textContent = mode === 'watch' ? '북마크' : '장면 저장';
  };
  const paintVoice = () => { bVoice.textContent = voiceOn ? '받아쓰기 ON' : '받아쓰기 OFF'; bVoice.classList.toggle('on', voiceOn); };
  paintVoice();
  paintMemoAuto();

  /* ---------- 깔끔 모드 ---------- */
  const CKEY = 'wonClipClean';
  let cleanOn = localStorage.getItem(CKEY) === '1';
  let cleanStyle = null;
  const applyClean = () => {
    if (cleanOn) {
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
    bClean.textContent = cleanOn ? '깔끔 ON' : '깔끔 OFF';
    bClean.classList.toggle('on', cleanOn);
    window.dispatchEvent(new Event('resize'));
  };
  bClean.onclick = () => {
    cleanOn = !cleanOn; localStorage.setItem(CKEY, cleanOn ? '1' : '0');
    applyClean();
    toast(cleanOn ? '추천영상·댓글 숨김' : '원래 화면으로');
  };
  applyClean();

  const PKEY = 'wonClipPos';
  const setPos = (x, y) => {
    host.style.left = x + 'px'; host.style.top = y + 'px';
    host.style.right = 'auto'; host.style.bottom = 'auto';
  };
  /* 저장된 위치가 현재 창보다 오른쪽/아래면 화면 안으로 끌어온다 (창 크기가 바뀌어도 도구가 사라지지 않게) */
  const fitPos = () => {
    const r = host.getBoundingClientRect();
    if (!r.width) return;
    const x = Math.max(4, Math.min(r.left, innerWidth - r.width - 4));
    const y = Math.max(4, Math.min(r.top, innerHeight - r.height - 4));
    if (Math.abs(x - r.left) > 1 || Math.abs(y - r.top) > 1) setPos(Math.round(x), Math.round(y));
  };
  (function restorePos(){
    try {
      const p = JSON.parse(localStorage.getItem(PKEY) || 'null');
      if (p && typeof p.x === 'number') setPos(Math.min(p.x, innerWidth - 80), Math.min(p.y, innerHeight - 60));
    } catch(e) {}
    requestAnimationFrame(fitPos);
  })();
  window.addEventListener('resize', fitPos);
  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = host.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { grip.setPointerCapture(e.pointerId); } catch(err) {}
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = Math.max(4, Math.min(innerWidth - 80, e.clientX - drag.dx));
    const y = Math.max(4, Math.min(innerHeight - 60, e.clientY - drag.dy));
    setPos(x, y);
    if (panel.classList.contains('on')) placePanel();
  });
  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    const r = host.getBoundingClientRect();
    localStorage.setItem(PKEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
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
  const onNav = () => { panel.classList.remove('on'); closeMemo(); refresh(); };
  window.addEventListener('yt-navigate-finish', onNav);

  const vid = () => document.querySelector('.html5-main-video') || document.querySelector('video');
  const vidTitle = () => ((document.querySelector('h1.ytd-watch-metadata')||{}).innerText || document.title.replace(/ - YouTube$/,'')).trim();

  /* ---------- 캡처 이미지 보관 (IndexedDB) ---------- */
  let _db = null;
  const idb = () => new Promise((res, rej) => {
    if (_db) return res(_db);
    const rq = indexedDB.open('wonClipShots', 1);
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('shots')) rq.result.createObjectStore('shots', { keyPath: 'file' }); };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => rej(rq.error);
  });
  const idbPut = async (rec) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('shots','readwrite'); tx.objectStore('shots').put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const idbGet = async (file) => { const db = await idb(); return new Promise((res) => { const rq = db.transaction('shots','readonly').objectStore('shots').get(file); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); }); };
  const idbDel = async (file) => { const db = await idb(); return new Promise((res) => { const tx = db.transaction('shots','readwrite'); tx.objectStore('shots').delete(file); tx.oncomplete = res; tx.onerror = res; }); };

  const lb = mk('div','lb');
  const lbImg = document.createElement('img');
  const lbCap = mk('div','lbcap','');
  lb.append(lbImg, lbCap);
  const lbPrev = mk('button','lbnav','‹'); lbPrev.style.left = '18px';
  const lbNext = mk('button','lbnav','›'); lbNext.style.right = '18px';
  lb.append(lbPrev, lbNext);
  lbPrev.onclick = (e) => { e.stopPropagation(); lbIdx = (lbIdx - 1 + lbFiles.length) % lbFiles.length; showLb(); };
  lbNext.onclick = (e) => { e.stopPropagation(); lbIdx = (lbIdx + 1) % lbFiles.length; showLb(); };
  lb.onclick = () => { lb.classList.remove('on'); if (lbImg.src.startsWith('blob:')) URL.revokeObjectURL(lbImg.src); lbImg.src = ''; };
  sh.appendChild(lb);
  let selIdx = -1, detailIdx = -1;
  let lbFiles = [], lbIdx = 0, lbRec = null;
  const showLb = async () => {
    const s = await idbGet(lbFiles[lbIdx]);
    if (lbImg.src.startsWith('blob:')) URL.revokeObjectURL(lbImg.src);
    if (!s) { toast('저장된 이미지가 없어요 (도구 설치 전에 찍은 장면)'); return; }
    lbImg.src = s.full ? URL.createObjectURL(s.full) : s.thumb;
    lbCap.textContent = '#' + lbRec.seq + '  ' + lbRec.time + '  (' + (lbIdx+1) + '/' + lbFiles.length + ')' + (lbRec.memo ? '  ·  ' + lbRec.memo : '');
    lb.classList.add('on');
    lbPrev.style.display = lbNext.style.display = lbFiles.length > 1 ? 'flex' : 'none';
  };
  const openShot = async (rec, i) => {
    lbRec = rec; lbFiles = (rec.files && rec.files.length) ? rec.files : [rec.file]; lbIdx = i || 0;
    await showLb();
  };

  const dl = (blob, name) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u), 5000); };

  /* ---------- 로컬 받아쓰기 ---------- */
  let mediaStream = null, recorder = null, chunks = [], recording = false, busy = false;
  let pendingDone = null;
  let silenceTimer = null, hardStop = null, sawSpeech = false, recFor = -1;

  const setMic = (state) => {
    micBtn.classList.remove('rec','busy');
    if (state === 'rec') { micBtn.classList.add('rec'); micBtn.textContent = '■ 듣는 중'; }
    else if (state === 'busy') { micBtn.classList.add('busy'); micBtn.textContent = '받아쓰는 중'; }
    else micBtn.textContent = '녹음';
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
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }

  async function transcribe(blob, targetIdx) {
    busy = true; setMic('busy');
    try {
      const ac = new AudioContext();
      const decoded = await ac.decodeAudioData(await blob.arrayBuffer());
      ac.close();
      const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
      const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
      const rendered = await off.startRendering();
      const wav = encodeWav(rendered.getChannelData(0), 16000);

      const fd = new FormData();
      fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'memo.wav');
      fd.append('temperature', '0.0');
      fd.append('response_format', 'json');
      fd.append('language', 'ko');
      fd.append('prompt', "발로란트 대회 분석 메모. 어센트 헤이븐 로터스 스플릿 바인드 아이스박스 브리즈 펄 선셋 어비스 프랙처, 제트 레이즈 요루 페이드 소바 스카이 케이오 바이퍼 오멘 브림스톤 아스트라 하버 클로브 세이지 킬조이 사이퍼 체임버 데드락 네온 게코 아이소 웨이레이, 앵글 로테이션 디폴트 리테이크 이코노미 스파이크 설치 오프닝 듀얼 크로스헤어 배치 어빌리티 궁극기 트레이드 피킹 클리어링.");
      const r = await fetch(ASR_URL, { method: 'POST', body: fd });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      let text = (j.text || '').trim().replace(/^\[.*?\]\s*/, '');
      if (!text || /^[\s.·]*$/.test(text)) { toast('들린 말이 없어요'); }
      else if (memoBox.classList.contains('on') && memoIdx === targetIdx) {
        memoIn.value = (memoIn.value ? memoIn.value + ' ' : '') + text;
        memoIn.focus();
      } else {
        const log = load();
        if (log[targetIdx]) { log[targetIdx].memo = ((log[targetIdx].memo || '') + ' ' + text).trim(); save(log); refresh(); toast('#' + log[targetIdx].seq + ' 메모 추가됨'); }
      }
    } catch (e) {
      toast('받아쓰기 실패 — 바탕화면 "받아쓰기 서버 켜기" 실행했는지 확인 (' + e.message + ')', 4200);
    } finally {
      busy = false; setMic('idle');
    }
  }

  async function startRec() {
    if (recording || busy) return;
    recFor = memoIdx;
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

    // 무음 감지
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(mediaStream);
    const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let quietSince = null;
    const tick = () => {
      if (!recording) { try { ac.close(); } catch(e) {} return; }
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      if (rms > 0.02) { sawSpeech = true; quietSince = null; }
      silenceTimer = setTimeout(tick, 120);
    };
    tick();
    clearTimeout(hardStop);
    hardStop = setTimeout(() => { if (recording) { stopRec(); toast('5분 넘어 녹음을 끊었어요'); } }, 300000);
  }

  function stopRec() {
    clearTimeout(silenceTimer); clearTimeout(hardStop);
    if (recorder && recording) { try { recorder.stop(); } catch(e) {} }
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
    if (wasOpen && wasPlaying) { const vv = vid(); if (vv && vv.paused) vv.play().catch(()=>{}); }
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
  ['keydown','keyup','keypress'].forEach(ev => memoIn.addEventListener(ev, (e) => {
    e.stopPropagation();
    if (ev !== 'keydown') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (recording) { stopRec(); toast('녹음 끝 — 받아쓰는 중'); }
      else if (busy) { toast('받아쓰는 중이에요, 잠시만'); }
      else commitMemo();
    }
    else if (e.key === 'Escape') { e.preventDefault(); closeMemo(); }
  }, true));

  async function storeFrame(c, name) {
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    dl(blob, name);
    try {
      const tc = document.createElement('canvas');
      tc.width = 320; tc.height = Math.round(320 * c.height / c.width);
      tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
      await idbPut({ file: name, thumb: tc.toDataURL('image/jpeg', 0.6), full: blob, at: Date.now() });
      if (panel.classList.contains('on')) draw();
    } catch(e) {}
  }

  const grabFrame = () => {
    const v = vid();
    if (!v || !v.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return { c, t: v.currentTime };
  };

  async function addShot(idx) {
    const g = grabFrame();
    if (!g) { toast('영상을 찾지 못했어요'); return; }
    const log = load();
    if (!log[idx]) return;
    const r = log[idx];
    const n = (r.files ? r.files.length : 1) + 1;
    const name = vidId() + '_' + fmtFile(g.t) + '_' + r.seq + '-' + n + '.jpg';
    r.files = (r.files && r.files.length ? r.files : [r.file]).concat([name]);
    save(log); refresh();
    toast('#' + r.seq + ' 에 사진 추가 (' + r.files.length + '장)  ' + fmtLab(g.t));
    await storeFrame(g.c, name);
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
    const v = vid();
    if (!v || !v.videoWidth) { toast('영상을 찾지 못했어요'); return; }
    const log = load();
    if (asSub && !log.length) { toast('부연을 달 장면이 없어요 — S로 먼저 만드세요'); return; }
    const t = v.currentTime;
    const quick = mode === 'watch';
    wasPlaying = !v.paused;
    if (!quick && !v.paused) { try { v.pause(); } catch(e) {} }
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const url = 'https://www.youtube.com/watch?v=' + vidId() + '&t=' + Math.floor(t) + 's';
    const rec = { seq: '', time: fmtLab(t), sec: Math.floor(t), url, file: '', files: [], memo: '', title: vidTitle(), saved: new Date().toISOString(), sub: !!asSub, bm: quick };
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
    else if (wasPlaying) { const vv = vid(); if (vv && vv.paused) vv.play().catch(()=>{}); }
    try { navigator.clipboard.writeText(url).catch(function(){}); } catch(e) {}
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

    const wrapD = mk('div','dt');
    const head = mk('div','phead');
    const back = mk('button','pclose','← 목록');
    back.onclick = () => { detailIdx = -1; draw(); };
    const ttl = mk('div', null, (r.sub ? '↳ 부연 ' : '#') + r.seq + '   ' + r.time);
    ttl.style.cssText = 'font-weight:700;font-size:15px';
    const lnk = mk('a', null, '유튜브에서 보기');
    lnk.href = r.url; lnk.target = '_blank';
    lnk.style.cssText = 'color:#7cc4ff;text-decoration:none;font-size:12px';
    const cls = mk('button','pclose','✕ 닫기');
    cls.onclick = () => { detailIdx = -1; panel.classList.remove('on'); };
    head.append(back, ttl, lnk, cls);
    wrapD.appendChild(head);

    wrapD.appendChild(mk('div','lab','메모 (여러 줄 가능 · 자동 저장)'));
    const ta = document.createElement('textarea');
    ta.value = r.memo || '';
    ta.placeholder = '이 장면에 대한 메모';
    ['keydown','keyup','keypress'].forEach(ev => ta.addEventListener(ev, (e) => e.stopPropagation(), true));
    const saveMemo = () => { const l = load(); if (l[detailIdx]) { l[detailIdx].memo = ta.value; save(l); cnt.textContent = l.length; } };
    ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(saveMemo, 400); });
    ta.addEventListener('blur', saveMemo);
    wrapD.appendChild(ta);

    wrapD.appendChild(mk('div','lab','스크린샷 ' + files.length + '장 · 그림을 클릭하면 크게, 오른쪽 칸에 설명을 적을 수 있습니다'));
    files.forEach((f, k) => {
      const row2 = mk('div','shot');
      const im = document.createElement('img');
      im.onclick = () => openShot(r, k);
      idbGet(f).then(s => {
        if (s && s.thumb) im.src = s.thumb;
        else { const ph = mk('div', null, '이미지 없음'); ph.style.cssText='width:170px;height:96px;display:flex;align-items:center;justify-content:center;background:#222;border-radius:6px;color:#a66;font-size:12px;flex:none'; im.replaceWith(ph); }
      });
      row2.appendChild(im);
      const cap = document.createElement('input');
      cap.className = 'cap'; cap.type = 'text';
      cap.placeholder = '이 그림 설명 (예: 킬조이 터렛 위치)';
      cap.value = r.caps[f] || '';
      ['keydown','keyup','keypress'].forEach(ev => cap.addEventListener(ev, (e) => { e.stopPropagation(); if (ev==='keydown' && e.key==='Enter') cap.blur(); }, true));
      const saveCap = () => { const l = load(); if (l[detailIdx]) { l[detailIdx].caps = l[detailIdx].caps || {}; l[detailIdx].caps[f] = cap.value.trim(); save(l); } };
      cap.addEventListener('change', saveCap);
      cap.addEventListener('blur', saveCap);
      row2.appendChild(cap);
      const del = mk('span','x','X');
      del.title = '이 그림 빼기';
      del.onclick = () => {
        if (!confirm('이 그림을 이 메모에서 뺄까요?')) return;
        const l = load();
        const rr = l[detailIdx];
        rr.files = ((rr.files && rr.files.length) ? rr.files : [rr.file]).filter(z => z !== f);
        if (rr.caps) delete rr.caps[f];
        if (!rr.files.length) rr.files = [];
        save(l); idbDel(f); draw();
      };
      row2.appendChild(del);
      wrapD.appendChild(row2);
    });

    const dz = mk('div','dz','여기에 그림을 끌어다 놓거나  Ctrl+V  로 붙여넣기   ·   클릭하면 파일 선택');
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

    const btnRow = mk('div','row');
    btnRow.style.marginTop = '10px';
    const addFrame = mk('button','mini','부연 추가 (지금 화면)');
    addFrame.title = '이 장면 밑에 부연 항목을 새로 만듭니다';
    addFrame.onclick = async () => { const p = detailIdx; panel.classList.remove('on'); detailIdx = -1; await capture(true, p); };
    const talkMore = mk('button','mini','메모 이어 말하기');
    talkMore.title = '이 항목의 메모에 말을 덧붙입니다';
    talkMore.onclick = () => {
      const v = vid(); wasPlaying = v ? !v.paused : false;
      if (v && !v.paused) { try { v.pause(); } catch(e) {} }
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
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        c.getContext('2d').drawImage(bmp, 0, 0);
        const tc = document.createElement('canvas');
        tc.width = 320; tc.height = Math.max(1, Math.round(320 * c.height / c.width));
        tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
        const files = (r.files && r.files.length) ? r.files : [r.file];
        const ext = (f.type === 'image/png') ? '.png' : '.jpg';
        const name = vidId() + '_' + r.time.replace(/:/g, '-') + '_' + r.seq + '-' + (files.length + 1) + ext;
        await idbPut({ file: name, thumb: tc.toDataURL('image/jpeg', 0.6), full: f, at: Date.now(), added: true });
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
    const phead = mk('div','phead');
    const htxt = mk('div', null, '장면 ' + log.filter(r=>!r.sub).length + '개 · 부연 ' + log.filter(r=>r.sub).length + '개  ·  S: 새 장면 / Shift+S: 직전 장면의 부연');
    htxt.style.cssText = 'font-weight:700';
    const pclose = mk('button','pclose','✕ 닫기');
    pclose.onclick = () => panel.classList.remove('on');
    phead.append(htxt, pclose);
    panel.appendChild(phead);
    if (!log.length) { panel.appendChild(mk('div',null,'(비어 있음)')); return; }
    log.forEach((r, i) => {
      const it = mk('div','item');
      if (r.sub) it.classList.add('subrow');
      const seqEl = mk('span','seqh', (r.sub ? '↳ ' : '#') + r.seq + (r.bm ? ' ★' : ''));
      if (r.bm) seqEl.title = '시청 모드 북마크 (메모 없음)';
      seqEl.draggable = true;
      seqEl.title = '끌어서 순서 변경';
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
      it.addEventListener('dragleave', () => it.classList.remove('dropimg','dropmove'));
      it.addEventListener('drop', async (e) => {
        e.preventDefault(); e.stopPropagation();
        it.classList.remove('dropimg','dropmove');
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
      const strip = mk('div','strip');
      files.forEach((f, k) => {
        const th = document.createElement('img');
        th.className = k === 0 ? 'th' : 'th sm';
        th.alt = '';
        th.title = (r.caps && r.caps[f]) ? r.caps[f] : f;
        th.onclick = (e) => { e.stopPropagation(); openShot(r, k); };
        strip.appendChild(th);
        idbGet(f).then(s => {
          if (s && s.thumb) th.src = s.thumb;
          else { const ph = mk('div', th.className + ' none', '없음'); ph.onclick = (e) => { e.stopPropagation(); openShot(r, k); }; th.replaceWith(ph); }
        });
      });
      it.appendChild(strip);
      const a = mk('a',null,r.time); a.href = r.url; a.target = '_blank';
      it.appendChild(a);
      const mi = document.createElement('input');
      mi.className = 'mi'; mi.type = 'text'; mi.value = r.memo || ''; mi.placeholder = '메모 없음';
      ['keydown','keyup','keypress'].forEach(ev => mi.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev === 'keydown' && e.key === 'Enter') mi.blur();
      }, true));
      const commit = () => { const l = load(); if (l[i]) { l[i].memo = mi.value.trim(); save(l); } };
      mi.addEventListener('change', commit);
      mi.addEventListener('blur', commit);
      it.appendChild(mi);
      const ob = mk('button','open','자세히');
      ob.onclick = (e) => { e.stopPropagation(); detailIdx = i; draw(); };
      it.appendChild(ob);
      const x = mk('span','x','X');
      x.title = '삭제';
      x.onclick = () => {
        const l = load();
        let n = 1;
        if (!l[i].sub) { while (i + n < l.length && l[i + n].sub) n++; }
        if (n > 1 && !confirm('본 장면을 지우면 부연 ' + (n-1) + '개도 같이 지워집니다. 계속할까요?')) return;
        for (let k = 0; k < n; k++) ((l[i+k].files && l[i+k].files.length) ? l[i+k].files : [l[i+k].file]).forEach(f => idbDel(f));
        l.splice(i, n); renumber(l); save(l); refresh();
      };
      it.appendChild(x);
      panel.appendChild(it);
    });
    const clr = mk('button','mini','전체 비우기');
    clr.style.marginTop = '8px';
    clr.onclick = () => { if (confirm('저장 목록을 비울까요? (이미 받은 이미지 파일은 그대로 남습니다)')) { save([]); refresh(); } };
    panel.appendChild(clr);
  }

  const blobToDataUrl = (b) => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });

  async function exportHtml() {
    const log = load();
    if (!log.length) { toast('저장된 장면이 없어요'); return; }
    toast('이미지 넣는 중...', 4000);
    const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    let body = '';
    for (const r of log) {
      const files = (r.files && r.files.length) ? r.files : [r.file];
      let imgs = '';
      for (const f of files) {
        const s = await idbGet(f);
        const cap = (r.caps && r.caps[f]) ? r.caps[f] : '';
        if (s && s.full) { const d = await blobToDataUrl(s.full); if (d) imgs += '<figure><img src="' + d + '"><figcaption>' + (cap ? '<b>' + esc(cap) + '</b><br>' : '') + esc(f) + '</figcaption></figure>'; }
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
      '.w{max-width:1100px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}.sub{color:#888;margin-bottom:26px;font-size:13px}' +
      'section{background:#1d1d1d;border:1px solid #333;border-radius:12px;padding:18px 22px;margin:16px 0}' +
      'h2{font-size:17px;margin:0 0 8px}h2 a{color:#7cc4ff;text-decoration:none}' +
      '.memo{font-size:15px;margin:0 0 14px;white-space:pre-wrap}.none{color:#777}' +
      '.shots{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;max-width:520px}' +
      'img{width:100%;border-radius:8px;border:1px solid #333;display:block}' +
      'figcaption{color:#777;font-size:11px;margin-top:4px}.miss{color:#a66;font-size:13px}' +
      '.sub{margin:14px 0 0 22px;padding:12px 16px;border-left:3px solid #e02b3c;background:#171717;border-radius:0 8px 8px 0}.sub h2{font-size:15px}.subtag{background:#e02b3c;color:#fff;font-size:11px;padding:2px 7px;border-radius:4px;vertical-align:middle}' +
      '</style></head><body><div class="w"><h1>' + esc(log[0].title) + '</h1>' +
      '<div class="sub">장면 ' + log.length + '건 · 내보낸 날짜 ' + new Date().toLocaleString('ko-KR') + '</div>' +
      body + '</div></body></html>';
    dl(new Blob([html], { type: 'text/html;charset=utf-8' }), vidId() + '_관전일지.html');
    toast('HTML 내보냄 (이미지 포함, ' + log.length + '장면)', 2500);
  }

  function exportLog() {
    const log = load();
    if (!log.length) { toast('저장된 장면이 없어요'); return; }
    let md = '# ' + log[0].title + '\n\n';
    md += '| # | 시점 | 링크 | 스크린샷 파일 | 메모 |\n|---|---|---|---|---|\n';
    log.forEach(r => { md += '| ' + (r.sub ? '↳ ' : '') + r.seq + ' | ' + r.time + ' | ' + r.url + ' | ' + ((r.files && r.files.length ? r.files : [r.file]).join(' / ')) + ' | ' + (r.memo||'').replace(/\|/g,'/') + ' |\n'; });
    dl(new Blob(['\ufeff'+md], {type:'text/markdown;charset=utf-8'}), vidId() + '_clip-log.md');
    toast('목록 내보냄 (' + log.length + '장면)');
  }

  bCap.onclick = capture;
  bExp.onclick = exportLog;
  bExpH.onclick = exportHtml;
  bList.onclick = () => { panel.classList.toggle('on'); if (panel.classList.contains('on')) { draw(); placePanel(); } };
  bHide.onclick = () => { wrap.style.display='none'; panel.classList.remove('on'); toast('S 키를 누르면 다시 나타납니다', 1800); };
  addBtn.onclick = (e) => { e.preventDefault(); if (memoIdx >= 0) spawnSub(); };
  bMemoAuto.onclick = () => {
    mode = mode === 'watch' ? 'analyze' : 'watch';
    memoAuto = mode === 'analyze';
    localStorage.setItem(MODEKEY, mode);
    paintMemoAuto();
    toast(mode === 'watch' ? '👁 시청 모드 — S 누르면 안 멈추고 북마크만 남깁니다' : '🔍 분석 모드 — S 누르면 멈추고 메모창이 열립니다', 2200);
  };
  bVoice.onclick = () => {
    voiceOn = !voiceOn;
    localStorage.setItem(VKEY, voiceOn ? '1' : '0');
    paintVoice();
    if (!voiceOn) stopRec();
    else if (memoBox.classList.contains('on')) startRec();
    toast(voiceOn ? '받아쓰기 켜짐 (메모창 열리면 자동 녹음)' : '받아쓰기 꺼짐 (타이핑만)');
  };

  const onKey = (e) => {
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
      } else if (e.code === 'KeyS' && (recording || busy)) {
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
    const tag = ((el||{}).tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (el && el.isContentEditable)) return;
    if (e.code === 'KeyS' || e.code === 'Backquote') {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (wrap.style.display === 'none') { wrap.style.display=''; return; }
      if (e.shiftKey) continueLast(); else capture();
    }
  };
  const onPaste = async (e) => {
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
    if (!panel.classList.contains('on')) { /* 메모창 중이면 토스트만 */ }
  };
  window.addEventListener('paste', onPaste, true);

  window.addEventListener('keydown', onKey, true);

  window.__wonClip = {
    capture, exportLog, dump: load,
    startRec, stopRec,
    isRecording: () => recording,
    ping: async () => { try { const r = await fetch('http://127.0.0.1:5005/', { method:'GET' }); return r.status; } catch(e) { return 'fail: ' + e.message; } },
    clear: () => { save([]); refresh(); },
    destroy: () => {
      stopRec();
      if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', fitPos);
      window.removeEventListener('paste', onPaste, true);
      document.removeEventListener('fullscreenchange', relocate);
      window.removeEventListener('yt-navigate-finish', onNav);
      if (cleanStyle) { cleanStyle.remove(); cleanStyle = null; }
      host.remove(); delete window.__wonClip;
    }
  };
  refresh();
  bCap.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}], {duration:520, iterations:3});
  fetch('http://127.0.0.1:5005/', { method:'GET' })
    .then(() => toast('도구 켜짐 · 서버 연결됨 — S: 새 장면 / Shift+S: 직전 장면의 부연', 3200))
    .catch(() => { toast('도구는 켜졌는데 받아쓰기 서버가 꺼져 있어요 (바탕화면 "받아쓰기 서버 켜기" 실행)', 5000); });
  return 'installed';
})()