/* 라운드 찾는 동안 유튜브 화질을 1080p(없으면 720p)로 고정 — 플레이어 기능은 페이지 쪽(MAIN)에서만 부를 수 있음.
   rounds.js가 document에 'won-yt-quality' 이벤트를 보내면 여기서 처리 */
(() => {
  if (window.__wonYtQ) return;
  window.__wonYtQ = true;
  document.addEventListener('won-yt-quality', (e) => {
    const q = e && e.detail;
    const p = document.getElementById('movie_player');
    if (!p || q === 'auto') return;
    try {
      const lv = (p.getAvailableQualityLevels && p.getAvailableQualityLevels()) || [];
      const pick = ['hd1080', 'hd720'].find(x => lv.indexOf(x) >= 0) || lv[0] || 'hd1080';
      if (p.setPlaybackQualityRange) p.setPlaybackQualityRange(pick, pick);
      if (p.setPlaybackQuality) p.setPlaybackQuality(pick);
    } catch (err) {}
  });
})();
