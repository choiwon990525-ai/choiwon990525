/* 코치 장면(S 캡처, log:<영상>) ↔ 라운드 자동 연결 — 보드·미니맵 모아보기가 같이 씀
   기본: 장면 시각이 [이 라운드 시작-2초, 다음 라운드 시작-2초) 안이면 이 라운드
   예외: 코치가 보드에서 ◀ ▶로 옮긴 장면은 scnMove:<영상> 에 {장면키: '맵:라운드'}로 저장해 그 라운드로 */
(function (root) {
  const key = (x) => String(x.seq) + '@' + Math.floor(x.sec || 0);
  const rkey = (r) => r.map + ':' + r.n;
  // rounds: 라운드 목록(모든 맵), log: 장면 목록, moves: {장면키: '맵:라운드'} → Map(라운드 객체 → 장면 배열, 시각 순)
  function assign(rounds, log, moves) {
    moves = moves || {};
    const out = new Map(), byKey = {};
    const sorted = (rounds || []).slice().sort((a, b) => a.jump - b.jump);
    sorted.forEach(r => { out.set(r, []); byKey[rkey(r)] = r; });
    for (const x of (log || [])) {
      if (x == null || x.sec == null) continue;
      let r = moves[key(x)] ? byKey[moves[key(x)]] : null;
      if (!r) for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i], nx = sorted[i + 1], end = nx ? nx.jump : a.jump + 150;
        if (x.sec >= a.jump - 2 && x.sec < end - 2) { r = a; break; }
      }
      if (r) out.get(r).push(x);
    }
    out.forEach(v => v.sort((a, b) => a.sec - b.sec));
    return out;
  }
  // 옆 라운드 (같은 맵 안에서만): dir = -1 / +1
  function neighbor(rounds, r, dir) {
    const same = (rounds || []).filter(q => q.map === r.map).sort((a, b) => a.n - b.n);
    const i = same.indexOf(r); return same[i + dir] || null;
  }
  /* 1.11.6: 방송 화면 캡처(16:9)에서 왼쪽 위 미니맵 칸만 잘라 크게 — VCT 중계 1080p 기준 (35,20)~(555,520) = 스캔·'미니맵으로 쓰기'와 같은 칸
     → { full(520x500 jpeg), thumb, w, h } · 16:9가 아니거나 너무 작으면(가로 900 미만 = 작은 미리보기) null · 같은 그림은 기억해 둠(긴 주소 대신 짧은 지문으로) */
  const CROPS = new Map();
  const finger = (u) => { let h = 2166136261; const st = Math.max(1, Math.floor(u.length / 400)); for (let i = 0; i < u.length; i += st) { h ^= u.charCodeAt(i); h = Math.imul(h, 16777619); } return u.length + ':' + (h >>> 0).toString(36) + ':' + u.slice(-24); };
  function cropMinimap(url) {
    if (!url || typeof document === 'undefined') return Promise.resolve(null);
    const fk = finger(String(url));
    if (CROPS.has(fk)) return CROPS.get(fk);
    const p = new Promise((ok) => {
      const im = new Image();
      im.onload = () => {
        const M = root.WonMapReg, w = im.naturalWidth, h = im.naturalHeight, a = w / h;
        if (!M || !(a > 1.7 && a < 1.85) || w < 900) return ok(null);
        const k = w / 1920, [x0, y0, x1, y1] = M.WIDE, c = document.createElement('canvas'); c.width = M.WW; c.height = M.WH;
        c.getContext('2d').drawImage(im, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, c.width, c.height);
        const tc = document.createElement('canvas'); tc.width = Math.round(200 * c.width / c.height); tc.height = 200; tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
        ok({ full: c.toDataURL('image/jpeg', 0.92), thumb: tc.toDataURL('image/jpeg', 0.75), w: c.width, h: c.height });
      };
      im.onerror = () => ok(null);
      im.src = url;
    });
    CROPS.set(fk, p);
    if (CROPS.size > 80) CROPS.delete(CROPS.keys().next().value);
    return p;
  }
  /* 장면·스크린샷을 어떻게 보고·보내나: 'mm'(미니맵만 크게) | 'full'(화면 전체) — 분석 화면·PPT 보내기가 같은 규칙
     view = view:<영상> {그림키: 'mm'|'full'} (코치가 M으로 바꾼 것) · 없으면 장면은 미니맵, 붙인 스크린샷은 화면 전체
     예전에 화면 전체에 그려 둔 장면(그림키에만 그린 것이 있고 '#mm'엔 없음)은 화면 전체 그대로 */
  function viewMode(key, view, ann, hasCrop) {
    if (!hasCrop) return 'full';
    const v = view && view[key]; if (v === 'mm' || v === 'full') return v;
    if (String(key).indexOf('scn:') !== 0) return 'full';
    return ann && (ann[key] || []).length && !(ann[key + '#mm'] || []).length ? 'full' : 'mm';
  }
  /* 1.11.6 텍틱 이름 자동: 라운드 첫 장면 메모 → 짧은 이름 (예: '113 롱 헤비' · 'B러수' → 'B러시' · '킬조이궁' → '킬조이 궁')
     cleanMemo = 첫 줄 · 빈칸 하나로 · 뒤 괄호 덧말·끝 문장부호 뺌 · 흔한 오타 · 머리의 '팀 수비/공격' 뺌 (시트 제목에 공격/수비가 따로 붙음)
     memoTag = 짧으면(14자) 그대로 · 요원 이름으로 시작해 요원 여럿이면(역할 나열) 없음 · 길면 셋업 숫자·텍틱 말까지만(요원 이름부터는 역할 설명이라 자름) · 셋업 숫자 없는 긴 문장(받아쓰기)은 없음 */
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  let AGS = null;
  const agents = () => AGS || (AGS = Object.values((root.WonNames && root.WonNames.AGENT_KO) || {}).concat(['챔버', '케이오', '브림']).sort((a, b) => b.length - a.length).map(esc).join('|'));
  const TEAMS = /^(농심|젠지|티원|디알엑스|프나틱|센티넬즈|센티|리퀴드|라우드|카르민|헤레틱스|페이퍼렉스|페렉|바이탈리티|나비|제타|데토|탈론|엔알지|백띵|클나|미브르|퓨리아|레비아탄|에드|지투|온사이드|알알큐|PRX|KC|NS|TL|ONG|G2|NRG|EDG|XLG|FNC|SEN|DRX|GEN|GENG|T1|RRQ|BLG|TE|DFM|GE|ZETA|LOUD|FUT|MIBR|TH|VIT|NAVI|BBL|KRU|C9|100T|EG|LEV|TLN|DRG|FPX|WOL|AG|TEC|NOVA|FUR|GX|M8|APK|TS|JDG|TYL|BME|FS)$/i;
  const KEYW = /디폴트|러시|팝|스플릿|안티이코|이코|패시브|밸런스|클래식|퉁|스택|리테이크|헤비|라이트|페이크|퀵|슬로우|컨트롤|장악|궁|포스|풀바이|세이브|미드|가라지|롱|숏|로비|메인|사이트|모여라|피스톨|오퍼/;
  const setupOk = (ds) => ds.length >= 2 && ds.reduce((a, b) => a + +b, 0) === 5;
  function hasSetup(s) { const re = /(?:^|\s)([0-5])[\s.,·-]*([0-5])(?:[\s.,·-]*([0-5]))?(?=\s|$)/g; let m; while ((m = re.exec(s))) if (setupOk([m[1], m[2], m[3]].filter(x => x != null))) return true; return false; }
  const keyWord = (w) => (/^[0-5]{2,3}$/.test(w) && setupOk(w.split(''))) || (/^[0-5](-[0-5]){1,2}$/.test(w) && setupOk(w.split('-'))) || KEYW.test(w);
  function cleanMemo(memo) {
    let s = String(memo || '').split(/\r?\n/).map(x => x.trim()).find(Boolean) || '';
    s = s.replace(/(\S)\s*[(（].*$/, '$1').replace(/[\s.。…!?~,·]+$/, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/러수/g, '러시').replace(/오맨/g, '오멘').replace(/안티\s*이코/g, '안티이코').replace(/킬\s+조이/g, '킬조이');
    const m = /^(\S+)\s+(수비|공격)\s+(\S.*)$/.exec(s); if (m && TEAMS.test(m[1])) s = m[3];
    s = s.replace(/^(수비|공격)\s+(?=\S)/, '');
    return s.replace(new RegExp('(' + agents() + ')궁', 'g'), '$1 궁');
  }
  function memoTag(memo) {
    const s = cleanMemo(memo); if (!s) return '';
    const A = agents(), all = s.match(new RegExp(A, 'g')) || [];
    if (new RegExp('^(' + A + ')').test(s) && new Set(all).size >= 2) return '';
    if (s.length <= 14) return s;
    const isAg = new RegExp('^(' + A + ')'), ws = s.split(' ');
    if (s.length <= 18 && !ws.some((w, i) => i > 0 && isAg.test(w))) return s;
    if (s.length > 24 && !hasSetup(s)) return '';
    let out = '', best = '';
    for (let i = 0; i < ws.length; i++) {
      if (i > 0 && isAg.test(ws[i])) break;   // 요원 이름부터는 역할 설명
      const nx = out ? out + ' ' + ws[i] : ws[i]; if (nx.length > 18) break;
      const had = hasSetup(out); out = nx; if (keyWord(ws[i]) || (!had && hasSetup(out))) best = out;   // 텍틱 말·셋업 숫자로 끝나는 데까지
    }
    return best;
  }
  const api = { assign, neighbor, key, rkey, cropMinimap, viewMode, cleanMemo, memoTag };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WonScenes = api;
})(typeof self !== 'undefined' ? self : this);
