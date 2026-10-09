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
  const api = { assign, neighbor, key, rkey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WonScenes = api;
})(typeof self !== 'undefined' ? self : this);
