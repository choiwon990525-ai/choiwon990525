/* 오프스크린: 라운드 스캔이 보낸 미니맵 그림으로 맵 알아내기 */
const AS = window.__wonAssets;
WonMapReg.setMapUrl((n) => AS.files['maps/' + n + '.png']);
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.t !== 'offIdentify') return false;
  (async () => {
    try {
      const im = await WonMapReg.loadImg(msg.img);
      const reg = await WonMapReg.register(im, null);
      if (!reg || reg.iou < 0.45) return reply({ ok: false, err: 'low', iou: reg && reg.iou });
      reply({ ok: true, map: reg.map, reg: { th: reg.th, s: reg.s, tx: reg.tx, ty: reg.ty, iou: reg.iou } });
    } catch (e) { reply({ ok: false, err: e.message }); }
  })();
  return true;
});
