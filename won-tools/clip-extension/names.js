/* 이름 표 (요원·맵 한글) — 분석 화면·텍틱 창·받아쓰기가 같이 씀 (보드는 assets-data.js의 요원 정보를 씀) */
(function (root) {
  const AGENT_KO = { Astra: '아스트라', Breach: '브리치', Brimstone: '브림스톤', Chamber: '체임버', Clove: '클로브', Cypher: '사이퍼', Deadlock: '데드록', Fade: '페이드',
    Gekko: '게코', Harbor: '하버', Iso: '아이소', Jett: '제트', 'KAY/O': '케이/오', Killjoy: '킬조이', Miks: '믹스', Neon: '네온', Omen: '오멘', Phoenix: '피닉스',
    Raze: '레이즈', Reyna: '레이나', Sage: '세이지', Skye: '스카이', Sova: '소바', Tejo: '테호', Veto: '비토', Viper: '바이퍼', Vyse: '바이스', Waylay: '웨이레이', Yoru: '요루' };
  const MAPKO = { Abyss: '어비스', Ascent: '어센트', Bind: '바인드', Breeze: '브리즈', Corrode: '코로드', Fracture: '프랙처', Haven: '헤이븐', Icebox: '아이스박스', Lotus: '로터스',
    Pearl: '펄', Split: '스플릿', Summit: '서밋', Sunset: '선셋' };
  /* 1.11.10 팀 짧은 이름·다른 이름 — 텍틱 파일 이름에서 팀 찾기('라우드 어비스 (…)', '스플릿 (prx …)') · 새 파일 이름('NS 스플릿 (…)') */
  const TEAMS = [
    ['Paper Rex', 'PRX', 'prx 페렉 페이퍼렉스'], ['LOUD', 'LOUD', 'loud 라우드'], ['Nongshim RedForce', 'NS', 'ns nsrf 농심 농심레드포스'],
    ['Team Vitality', 'VIT', 'vit vitality 바이탈리티 비탈리티'], ['Team Liquid', 'TL', 'tl liquid 리퀴드'], ['Gen.G', 'GEN', 'gen geng 젠지'],
    ['T1', 'T1', 't1 티원'], ['DRX', 'DRX', 'drx 디알엑스'], ['Fnatic', 'FNC', 'fnc fnatic 프나틱'], ['Sentinels', 'SEN', 'sen sentinels 센티넬즈'],
    ['G2 Esports', 'G2', 'g2 지투'], ['100 Thieves', '100T', '100t'], ['Cloud9', 'C9', 'c9 클라우드나인'], ['NRG', 'NRG', 'nrg'],
    ['Evil Geniuses', 'EG', 'eg'], ['MIBR', 'MIBR', 'mibr 미브르'], ['FURIA', 'FUR', 'furia fur 퓨리아'], ['KRÜ Esports', 'KRU', 'kru 크루'],
    ['LEVIATÁN', 'LEV', 'lev leviatan 레비아탄'], ['Team Heretics', 'TH', 'th heretics 헤레틱스'], ['Karmine Corp', 'KC', 'kc 카르민'],
    ['Natus Vincere', 'NAVI', 'navi 나비'], ['FUT Esports', 'FUT', 'fut'], ['BBL Esports', 'BBL', 'bbl'], ['GIANTX', 'GX', 'gx giantx'],
    ['Gentle Mates', 'M8', 'm8 젠틀메이츠'], ['Movistar KOI', 'KOI', 'koi 코이'], ['EDward Gaming', 'EDG', 'edg'], ['Bilibili Gaming', 'BLG', 'blg'],
    ['FunPlus Phoenix', 'FPX', 'fpx'], ['Trace Esports', 'TE', 'te trace'], ['Titan Esports Club', 'TEC', 'tec'], ['Dragon Ranger Gaming', 'DRG', 'drg'],
    ['Wolves Esports', 'WOL', 'wol wolves'], ['Xi Lai Gaming', 'XLG', 'xlg'], ['JDG Esports', 'JDG', 'jdg'], ['All Gamers', 'AG', 'ag'], ['Nova Esports', 'NOVA', 'nova'],
    ['TYLOO', 'TYL', 'tyloo tyl'], ['ZETA DIVISION', 'ZETA', 'zeta 제타'], ['DetonatioN FocusMe', 'DFM', 'dfm'], ['Global Esports', 'GE', 'ge'],
    ['Talon Esports', 'TLN', 'tln talon 탈론'], ['Team Secret', 'TS', 'ts secret 시크릿'], ['Rex Regum Qeon', 'RRQ', 'rrq'], ['BLEED', 'BLD', 'bld bleed 블리드'],
    ['BOOM Esports', 'BOOM', 'boom'], ['ONSIDE GAMING', 'ONS', 'ons onside 온사이드']];
  const nk = (s) => String(s || '').toLowerCase().replace(/[\s.\-_'’·]+/g, '');
  const toks = (s) => String(s || '').toLowerCase().split(/[\s·,\/()\[\]{}_+&|~-]+/).filter(Boolean);
  const AG_ALIAS = { '오맨': '오멘', kj: '킬조이', '킬조': '킬조이', '케이오': '케이/오', kayo: '케이/오', '브림': '브림스톤', '데드락': '데드록', '페닉스': '피닉스', '아스': '아스트라' };
  const agKey = (s) => { const k = nk(s); return nk(AG_ALIAS[k] || k); };
  function teamInfo(name) {   // → { canon, short, keys(낱말이 같으면), subs(길게 이어 쓴 정식 이름) } — 모르는 팀이면 이름 그대로
    const k = nk(name);
    const hit = TEAMS.find(t => nk(t[0]) === k || nk(t[1]) === k || t[2].split(' ').some(a => nk(a) === k));
    const canon = hit ? hit[0] : String(name || '').trim(), w = canon.split(/\s+/).filter(x => !/^team$/i.test(x));
    const keys = (hit ? [nk(hit[1])].concat(hit[2].split(' ').map(nk)) : []).concat([nk(canon)], w.length > 1 && nk(w[0]).length >= 4 ? [nk(w[0])] : []);
    return { canon, short: hit ? hit[1] : canon, keys: keys.filter((x, i, a) => x && a.indexOf(x) === i), subs: nk(canon).length >= 6 ? [nk(canon)] : [] };
  }
  function teamInName(fileName, info) {   // 파일 이름 낱말 중에 그 팀 이름(짧은 이름·한글 이름)이 있나 — 'cloud9'에 'loud'처럼 글자 일부는 안 봄
    const ts = toks(fileName).map(nk), all = nk(fileName);
    return info.keys.some(k => ts.indexOf(k) >= 0) || info.subs.some(k => all.indexOf(k) >= 0);
  }
  const teamOfName = (fileName) => { const t = TEAMS.find(x => teamInName(fileName, teamInfo(x[0]))); return t ? t[0] : null; };
  const api = { AGENT_KO, MAPKO, agentKo: (a) => AGENT_KO[a] || a || '', mapKo: (m) => MAPKO[m] || m || '', teamInfo, teamInName, teamOfName, agKey, toks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WonNames = api;
})(typeof self !== 'undefined' ? self : this);
