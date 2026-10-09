/* 이름 표 (요원·맵 한글) — 분석 화면·텍틱 창·받아쓰기가 같이 씀 (보드는 assets-data.js의 요원 정보를 씀) */
(function (root) {
  const AGENT_KO = { Astra: '아스트라', Breach: '브리치', Brimstone: '브림스톤', Chamber: '체임버', Clove: '클로브', Cypher: '사이퍼', Deadlock: '데드록', Fade: '페이드',
    Gekko: '게코', Harbor: '하버', Iso: '아이소', Jett: '제트', 'KAY/O': '케이/오', Killjoy: '킬조이', Miks: '믹스', Neon: '네온', Omen: '오멘', Phoenix: '피닉스',
    Raze: '레이즈', Reyna: '레이나', Sage: '세이지', Skye: '스카이', Sova: '소바', Tejo: '테호', Veto: '비토', Viper: '바이퍼', Vyse: '바이스', Waylay: '웨이레이', Yoru: '요루' };
  const MAPKO = { Abyss: '어비스', Ascent: '어센트', Bind: '바인드', Breeze: '브리즈', Corrode: '코로드', Fracture: '프랙처', Haven: '헤이븐', Icebox: '아이스박스', Lotus: '로터스',
    Pearl: '펄', Split: '스플릿', Summit: '서밋', Sunset: '선셋' };
  const api = { AGENT_KO, MAPKO, agentKo: (a) => AGENT_KO[a] || a || '', mapKo: (m) => MAPKO[m] || m || '' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WonNames = api;
})(typeof self !== 'undefined' ? self : this);
