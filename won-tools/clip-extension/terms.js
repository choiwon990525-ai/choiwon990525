/* 받아쓰기 용어 교정 — whisper가 발로란트 용어를 잘못 알아들은 것을 고침
   content.js(받아쓰기 직후), background.js(예전 메모 한 번 고치기), 시험 코드에서 같이 씀
   원칙: 확실한 것만. 코치 말투(가라지·방탄·퉁 등)는 그대로 둠
   v2(1.11.0): 코치 실제 메모에서 자주 틀린 것 — 하버공→하버 궁, 삐팝→B팝, 알람보→알람봇, 리컨→리콘, 택틱→텍틱 등
   + 코치가 관리 페이지에 적은 '틀린 말 = 바른 말'(prefs.asrFix)도 같이 적용 (fix(text, userText)) */
(function (root) {
  // [찾을 것(정규식 조각), 바꿀 것] — 앞뒤가 글자가 아닌 자리(단어 경계)에서만
  const WORDS = [
    ['페이퍼\\s?렉스|페이파\\s?렉스|페이파렉스|페이퍼렉스|패퍼렉스|페렙|피알엑스', 'PRX'],
    ['래퀴드|리퀴더', '리퀴드'],
    ['체인\\s?버|체임 버|채임버', '체임버'],
    ['요로', '요루'],
    ['유르\\s?티피', '요루 TP'],
    ['유르\\s?마스킹', '요루 마스킹'],
    ['유르', '요루'],
    ['티피', 'TP'],
    ['퀴즈이|킬죠이', '킬조이'],
    ['알람보|알람바|알람보트|알람볼|알람봇트', '알람봇'],
    ['리컨', '리콘'],
    ['택틱|텍틱스|택틱스', '텍틱'],
    ['삐\\s?팝|비\\s?팝|삐빱|비빱', 'B팝'],
    ['에이\\s?팝', 'A팝'],
    ['씨\\s?팝', 'C팝'],
    ['미드\\s?선진', '미드 전진'],
    ['안티\\s?이코|엔티\\s?이코', '안티이코'],
    ['원\\s?웨이', '원웨이'],
    ['에이드\\s?폴트|에이\\s?디폴트', 'A 디폴트'],
    ['비\\s?디폴트', 'B 디폴트'],
    ['씨\\s?디폴트', 'C 디폴트'],
    ['에이\\s?로비', 'A 로비'],
    ['에이\\s?롱', 'A 롱'],
    ['에이\\s?숏', 'A 숏'],
    ['에이\\s?메인|에이매인', 'A 메인'],
    ['에이\\s?사이[드트]', 'A 사이드'],
    ['에이\\s?링크', 'A 링크'],
    ['에이\\s?헤비', 'A 헤비'],
    ['비\\s?롱', 'B 롱'],
    ['비\\s?로비', 'B 로비'],
    ['비\\s?메인|삐\\s?메인|삐\\s?매인|비매인', 'B 메인'],
    ['비\\s?사이[드트]', 'B 사이드'],
    ['비\\s?헤비', 'B 헤비'],
    ['씨\\s?롱', 'C 롱'],
    ['씨\\s?로비', 'C 로비'],
    ['씨\\s?숏', 'C 숏'],
    ['씨\\s?사이[드트]', 'C 사이드'],
    ['씨\\s?헤비', 'C 헤비'],
    ['에\\s사이[드트]', 'A 사이드'],
    ['에이', 'A']
  ];
  const AGENTS = '하버|오멘|바이퍼|브림스톤|브림|아스트라|클로브|소바|킬조이|사이퍼|세이지|제트|레이즈|요루|네온|피닉스|레이나|스카이|페이드|브리치|케이오|게코|데드록|아이소|바이스|테호|웨이레이|체임버|믹스|비토';
  const NUM = { '일': 1, '이': 2, '삼': 3, '사': 4 };
  // 앞: 문장 시작/공백/문장부호, 뒤: 공백/문장부호/조사
  const PRE = '(^|[\\s.,!?·/()\\[\\]「」"\'])';
  const POST = '(?=$|[\\s.,!?·/()\\[\\]「」"\']|[은는이가을를에의도로와과만으까부처랑])';
  const RULES = WORDS.map(([a, b]) => [new RegExp(PRE + '(?:' + a + ')' + POST, 'g'), b]);
  // 요원 궁극기: '하버공'·'오멘 콩' → '하버 궁'
  const ULT = new RegExp(PRE + '(' + AGENTS + ')\\s?[공콩꿍궁]' + POST, 'g');
  // 일삼일 → 1-3-1, 이일이 → 2-1-2 (세 글자 숫자 배치만)
  const FORM = new RegExp(PRE + '([일이삼사]{3})' + POST, 'g');
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 코치가 적은 교정: 줄마다 '틀린 말 = 바른 말' (여러 개는 '틀린1, 틀린2 = 바른')
  function userRules(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach(ln => {
      const m = ln.split(/\s*(?:=|→|->)\s*/); if (m.length < 2) return;
      const to = m.slice(1).join(' ').trim(); if (!to) return;
      m[0].split(/\s*,\s*/).map(x => x.trim()).filter(Boolean).forEach(from => { if (from !== to) out.push([new RegExp(PRE + escRe(from) + POST, 'g'), to]); });
    });
    return out;
  }
  function fix(text, userText) {
    let s = String(text == null ? '' : text);
    const extra = userText ? userRules(userText) : [];
    for (const [re, b] of extra) s = s.replace(re, (m, p) => p + b);   // 코치 교정 먼저 (코치 뜻이 우선)
    for (let pass = 0; pass < 2; pass++) for (const [re, b] of RULES) s = s.replace(re, (m, p) => p + b);   // 두 번: 겹친 자리(에이롱 에이로비) 처리
    s = s.replace(ULT, (m, p, a) => p + a + ' 궁');
    s = s.replace(FORM, (m, p, w) => { const d = w.split('').map(c => NUM[c]); return d.reduce((a, b) => a + b, 0) === 5 ? p + d.join('-') : m; });   // 합이 5(인원 배치)일 때만
    return s;
  }
  /* 받아쓰기 결과 거르기: 해설(영어)·빈 소리에서 whisper가 지어내는 말 */
  const HALLU = /(시청해\s*주셔서\s*감사|구독과\s*좋아요|구독\s*부탁|좋아요와\s*구독|자막\s*(제공|by)|MBC\s*뉴스|KBS\s*뉴스|다음\s*영상에서\s*만나|영상\s*편집|끝까지\s*시청)[^.!?]*[.!?]?/g;
  function clean(text) {
    let s = String(text || '').replace(/^\s*\[.*?\]\s*/, '').replace(HALLU, ' ').replace(/\s+/g, ' ').trim();
    const han = (s.match(/[가-힣]/g) || []).length, lat = (s.match(/[A-Za-z]/g) || []).length;
    if (!han && lat > 6) return { text: '', why: 'english' };   // 한글이 하나도 없고 영어만 → 해설 소리로 봄
    return { text: s, why: s ? '' : 'empty' };
  }
  const api = { fix, clean, userRules, version: 2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WonTerms = api;
})(typeof self !== 'undefined' ? self : this);
