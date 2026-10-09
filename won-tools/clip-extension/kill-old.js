/* 예전 북마클릿/자동 삽입 버전(window.__wonClip)이 같이 켜지면 S키 한 번에 두 번 저장되므로,
   유튜브 페이지 쪽(MAIN world)에서 예전 도구가 켜지는 순간 바로 꺼버린다. */
(() => {
  const kill = (v) => { try { if (v && typeof v.destroy === 'function') v.destroy(); } catch (e) {} };
  try {
    const cur = window.__wonClip;
    if (cur) kill(cur);
    Object.defineProperty(window, '__wonClip', {
      configurable: false,
      get() { return undefined; },
      set(v) { setTimeout(() => { kill(v); document.documentElement.dataset.wonOldBlocked = String(Date.now()); }, 0); }
    });
  } catch (e) {}
})();
