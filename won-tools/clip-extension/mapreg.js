/* 방송 미니맵 ↔ 깨끗한 맵(valorant-api 미니맵 그림) 맞추기 + 요원 표시 찾기
   좌표계
   - 방송 미니맵 칸(crop): 1920x1080 화면 기준 (35,20)-(405,420), 370x400
   - 깨끗한 맵(api): valorant-api displayIcon 1024x1024
   변환: crop = s · R(θ) · (api − 512) + (tx, ty)      θ ∈ {0, 90, 180, 270}
   window.WonMapReg 로 내보냄 (확장 content/보드 페이지, 시험 주입 모두 같은 코드) */
(function () {
  const MAPS = {
    Abyss: '224b0a95-48b9-f703-1bd8-67aca101a61f', Ascent: '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319', Bind: '2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba',
    Breeze: '2fb9a4fd-47b8-4e7d-a969-74b4046ebd53', Corrode: '1c18ab1f-420d-0d8b-71d0-77ad3c439115', Fracture: 'b529448b-4d60-346e-e89e-00a4c527a405',
    Haven: '2bee0dc9-4ffe-519b-1cbd-7fbe763a6047', Icebox: 'e2ad5c54-4114-a870-9641-8ea21279579a', Lotus: '2fe4ed3a-450a-948b-6d6b-e89a78e680a9',
    Pearl: 'fd267378-4d1d-484f-ff52-77821ed10dc2', Split: 'd960549e-485c-e861-8d71-aa9d1aed12a2', Summit: '756da597-416b-c0f2-f47b-afbdf28670bc',
    Sunset: '92584fbe-486a-b1b2-9faa-39b0f486b498'
  };
  let mapUrlFn = null;
  const mapUrl = (name) => mapUrlFn ? mapUrlFn(name) : 'https://media.valorant-api.com/maps/' + MAPS[name] + '/displayicon.png';
  const CROP = [35, 20, 405, 420], CW = 370, CH = 400;
  /* 1.9.0부터 스캔은 더 넓게 찍음(WIDE, 520x500) — 중계에 따라 미니맵이 405·420 밖으로 나가서 잘리던 것.
     분석(맵 맞춤·요원 찾기)은 예전처럼 왼쪽 위 370x400만 씀 → 예전 맞춤값(tx·ty·s)이 그대로 맞음. 넓은 그림은 가로:세로 비로 알아봄 */
  const WIDE = [35, 20, 555, 520], WW = 520, WH = 500;
  const dimsOf = (im) => [im.naturalWidth || im.videoWidth || im.width || 0, im.naturalHeight || im.videoHeight || im.height || 0];
  const isWide = (im) => { const [w, h] = dimsOf(im); return !!(w && h && Math.abs(w / h - WW / WH) < 0.03); };
  const units = (im) => isWide(im) ? [WW, WH] : [CW, CH];   // 그림 한 장이 방송 화면(1080p) 몇 px 칸인지
  function drawCore(ctx, im, W, H) {   // 분석용 370x400 칸만 W×H로
    if (isWide(im)) { const sc = dimsOf(im)[0] / WW; ctx.drawImage(im, 0, 0, CW * sc, CH * sc, 0, 0, W, H); }
    else ctx.drawImage(im, 0, 0, W, H);
  }
  // 방송별 저장된 변환 (VCT 2026 중계 기준). 없는 맵은 처음 볼 때 자동으로 맞춤
  const KNOWN = {};

  const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('그림을 못 불러옴: ' + src)); im.src = src; });
  const apiCache = {};
  /* 깨끗한 맵 바닥 마스크 (N x N으로 줄여서) */
  async function apiMask(name, N) {
    const k = name + N; if (apiCache[k]) return apiCache[k];
    const im = await loadImg(mapUrl(name));
    const c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data, m = new Uint8Array(N * N);
    for (let i = 0, p = 0; i < m.length; i++, p += 4) m[i] = (d[p + 3] > 128 && Math.abs(d[p] - 118) <= 24 && Math.abs(d[p] - d[p + 2]) <= 12) ? 1 : 0;
    return (apiCache[k] = { m, N, img: im });
  }
  /* 방송 미니맵 바닥 마스크: 바닥은 (118,118,118) 회색 — 영상 배경은 색이 섞여 있어 걸러짐 */
  function cropMask(imgData, W, H) {
    const d = imgData.data, m = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < m.length; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      m[i] = (Math.abs(r - g) <= 6 && Math.abs(g - b) <= 6 && r >= 100 && r <= 140) ? 1 : 0;
    }
    return m;
  }
  const bbox = (m, W, H) => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1]; };
  /* 변환 t(api 1024 좌표 → crop 좌표). 역변환으로 crop 격자(W×H, 배율 f)에 api 마스크를 그려 IoU 계산 */
  function iou(t, am, bm, W, H, f) {
    const N = am.N, sc = 1024 / N, rad = t.th * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    let inter = 0, uni = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = x / f - t.tx, cy = y / f - t.ty;               // crop 좌표 기준
      const ux = (c * cx + s * cy) / t.s + 512, uy = (-s * cx + c * cy) / t.s + 512;   // R(−θ)
      const ax = (ux / sc) | 0, ay = (uy / sc) | 0;
      const a = (ax >= 0 && ay >= 0 && ax < N && ay < N) ? am.m[ay * N + ax] : 0, b = bm[y * W + x];
      if (a && b) inter++; if (a || b) uni++;
    }
    return uni ? inter / uni : 0;
  }
  const fwd = (t, ax, ay) => { const r = t.th * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), x = ax - 512, y = ay - 512; return [t.s * (c * x - s * y) + t.tx, t.s * (s * x + c * y) + t.ty]; };
  const inv = (t, cx, cy) => { const r = t.th * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), x = cx - t.tx, y = cy - t.ty; return [(c * x + s * y) / t.s + 512, (-s * x + c * y) / t.s + 512]; };
  /* 한 맵에 대해 가장 잘 맞는 변환 찾기 (거친 탐색 → 세밀 탐색) */
  async function registerOne(name, bm, W, H, f) {
    const am = await apiMask(name, 128);
    const bb = bbox(bm, W, H); if (!bb) return null;
    let best = null;
    for (const th of [0, 90, 180, 270]) {
      // api 바닥의 bbox를 회전해 크기 추정
      const am2 = am, N = am2.N, sc = 1024 / N; let ax0 = 1e9, ay0 = 1e9, ax1 = -1e9, ay1 = -1e9;
      for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) if (am2.m[y * N + x]) {
        const p = fwd({ th, s: 1, tx: 0, ty: 0 }, x * sc, y * sc); if (p[0] < ax0) ax0 = p[0]; if (p[0] > ax1) ax1 = p[0]; if (p[1] < ay0) ay0 = p[1]; if (p[1] > ay1) ay1 = p[1];
      }
      const s0 = ((bb[2] - bb[0]) / f / (ax1 - ax0) + (bb[3] - bb[1]) / f / (ay1 - ay0)) / 2;
      for (let k = -3; k <= 3; k++) {
        const s = s0 * (1 + k * 0.02);
        const tx0 = bb[0] / f - ax0 * s, ty0 = bb[1] / f - ay0 * s;
        for (let dx = -6; dx <= 6; dx += 3) for (let dy = -6; dy <= 6; dy += 3) {
          const t = { th, s, tx: tx0 + dx, ty: ty0 + dy }, v = iou(t, am, bm, W, H, f);
          if (!best || v > best.iou) best = Object.assign(t, { iou: v });
        }
      }
    }
    // 세밀
    for (let pass = 0; pass < 2; pass++) {
      const st = pass ? 0.5 : 1.5, ss = pass ? 0.004 : 0.01;
      const b0 = Object.assign({}, best);
      for (let k = -2; k <= 2; k++) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const t = { th: b0.th, s: b0.s * (1 + k * ss), tx: b0.tx + dx * st, ty: b0.ty + dy * st }, v = iou(t, am, bm, W, H, f);
        if (v > best.iou) best = Object.assign(t, { iou: v });
      }
    }
    best.map = name;
    return best;
  }
  /* 방송 미니맵 칸 그림(캔버스/이미지 370x400) → {map, th, s, tx, ty, iou}. mapName을 알면 그 맵만 */
  async function register(cropCanvas, mapName) {
    const f = 0.5, W = Math.round(CW * f), H = Math.round(CH * f);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); drawCore(x, cropCanvas, W, H);
    const bm = cropMask(x.getImageData(0, 0, W, H), W, H);
    const names = mapName ? [mapName] : Object.keys(MAPS);
    let best = null;
    for (const n of names) {
      if (KNOWN[n] && !mapName) {   // 알려진 변환이 있으면 그걸로 빠르게 점수만
        const am = await apiMask(n, 128); const v = iou(KNOWN[n], am, bm, W, H, f);
        const r = Object.assign({}, KNOWN[n], { iou: v, map: n, known: true });
        if (!best || r.iou > best.iou) best = r; continue;
      }
      const r = await registerOne(n, bm, W, H, f);
      if (r && (!best || r.iou > best.iou)) best = r;
    }
    return best;
  }

  /* ---------- 요원 표시 찾기 ----------
     방송 미니맵의 요원 = 초상화 원(지름 약 16px) + 팀 색 테두리(청록 수비 / 빨강 공격).
     테두리 색 픽셀로 원 중심을 투표(허프 변환) → 겹친 요원도 어느 정도 나뉨. 맵 바닥 근처만 인정 */
  function cropData(cropCanvas) {
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const x = c.getContext('2d', { willReadFrequently: true }); drawCore(x, cropCanvas, CW, CH);
    return x.getImageData(0, 0, CW, CH).data;
  }
  function detect(cropCanvas, opts) {
    opts = opts || {};
    const W = CW, H = CH, d = cropData(cropCanvas);
    const teal = new Uint8Array(W * H), red = new Uint8Array(W * H), floor = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      if (g > 160 && b > 140 && g - r > 55) teal[i] = 1;
      else if (r > 115 && r - g > 52 && r - b > 42 && g - b <= 20 && b - g <= 35) red[i] = 1;   // 주황 배경(g−b 큼) 제외
      if (Math.abs(r - g) <= 6 && Math.abs(g - b) <= 6 && r >= 100 && r <= 140) floor[i] = 1;
    }
    // 바닥 주변 10px 안인지 (영상 배경의 빨간/청록 물체 걸러내기). 맞춤 변환이 있으면 깨끗한 맵 모양으로 판단(공격 스폰의 붉은 바닥도 포함)
    const near = new Uint8Array(W * H), R0 = 10;
    if (opts.foot) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) near[y * W + x] = opts.foot(x, y) ? 1 : 0; }
    else {
    const rowHas = new Int32Array(W * H);   // 누적합으로 빠르게
    for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x < W; x++) { run += floor[y * W + x]; rowHas[y * W + x] = run; } }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let cnt = 0; const xa = Math.max(0, x - R0), xb = Math.min(W - 1, x + R0);
      for (let yy = Math.max(0, y - R0); yy <= Math.min(H - 1, y + R0); yy += 2) cnt += rowHas[yy * W + xb] - (xa ? rowHas[yy * W + xa - 1] : 0);
      near[y * W + x] = cnt > 12 ? 1 : 0;
    }
    }
    // 길게 이어진 색 덩어리(무대 네온 줄·배경 물체)는 요원 표시가 아님 → 지움. 표시는 겹쳐도 45px 안쪽
    const dropLong = (mask0) => {
      // 2px 불려서 이음 (맵 선에 끊긴 네온 줄 조각도 한 덩어리로)
      const mask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) if (mask0[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) mask[yy * W + xx] = 1; } }
      const seen = new Uint8Array(W * H), st = [];
      for (let i = 0; i < W * H; i++) {
        if (!mask[i] || seen[i]) continue;
        const comp = []; st.push(i); seen[i] = 1; let x0 = W, y0 = H, x1 = 0, y1 = 0;
        while (st.length) { const j = st.pop(); comp.push(j); const x = j % W, y = (j / W) | 0;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && mask[k] && !seen[k] && Math.abs((k % W) - x) <= 1) { seen[k] = 1; st.push(k); } }
        const tooBig = Math.max(x1 - x0, y1 - y0) > (opts.maxExt || 48);
        // 가늘고 곧은 줄(네온 조각): 원래 색 픽셀만으로 길쭉함 재기 (주성분 비율)
        let n = 0, mx = 0, my = 0; for (const j of comp) if (mask0[j]) { n++; mx += j % W; my += (j / W) | 0; }
        if (n < 8) { if (tooBig) for (const j of comp) mask0[j] = 0; continue; }
        mx /= n; my /= n;
        let sxx = 0, syy = 0, sxy = 0; for (const j of comp) if (mask0[j]) { const dx = j % W - mx, dy = ((j / W) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
        sxx /= n; syy /= n; sxy /= n;
        const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det)), l1 = tr / 2 + disc, l2 = Math.max(0.05, tr / 2 - disc);
        // 네온 줄 조각: 길쭉함 25 이상. 겹친 요원 테두리 옆선은 12 안팎이라 남김
        if (tooBig || (l1 / l2 > (opts.maxElong || 18) && Math.sqrt(l1) > 4)) {
          if (l1 / l2 > 12) {   // 곧은 줄: 줄 위 픽셀만 지움 (줄에 붙은 요원 표시는 살림)
            const a0 = 0.5 * Math.atan2(2 * sxy, sxx - syy), nx = -Math.sin(a0), ny = Math.cos(a0);
            for (const j of comp) if (Math.abs((j % W - mx) * nx + (((j / W) | 0) - my) * ny) <= 2.6) mask0[j] = 0;
          } else for (const j of comp) mask0[j] = 0;
          // 맵 위의 길고 곧은 줄 = 벽 스킬(바이퍼·하버 등). 양 끝 = 주축 방향 가장 먼 두 점
          const L = 4 * Math.sqrt(l1); let inMap = 0, onFloor = 0;
          if (L >= (opts.minWall || 55) && l1 / l2 > (tooBig ? 8 : 12)) {
            const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
            let tmin = 1e9, tmax = -1e9;
            for (const j of comp) if (mask0Copy[j]) { const t = (j % W - mx) * ux + (((j / W) | 0) - my) * uy; if (t < tmin) tmin = t; if (t > tmax) tmax = t; if (near[j]) inMap++; if (opts.footC && opts.footC(j % W, (j / W) | 0)) onFloor++; }
            if (inMap / n > 0.85 && (!opts.footC || onFloor / n > 0.45)) walls.push({ side: curSide, x1: mx + ux * tmin, y1: my + uy * tmin, x2: mx + ux * tmax, y2: my + uy * tmax, len: tmax - tmin });
          }
        }
      }
    };
    const walls = []; let curSide = 'def', mask0Copy = null;
    mask0Copy = teal.slice(); curSide = 'def'; dropLong(teal);
    mask0Copy = red.slice(); curSide = 'atk'; dropLong(red);
    const rs = [6, 7, 8, 9], NA = 48, cosT = [], sinT = [];
    for (let k = 0; k < NA; k++) { cosT.push(Math.cos(2 * Math.PI * k / NA)); sinT.push(Math.sin(2 * Math.PI * k / NA)); }
    const out = [];
    for (const [mask, side] of [[teal, 'def'], [red, 'atk']]) {
      const best = new Float32Array(W * H), bestR = new Uint8Array(W * H);
      for (const r of rs) {
        const acc = new Float32Array(W * H), wgt = 1 / (2 * Math.PI * r);
        for (let i = 0; i < W * H; i++) {
          if (!mask[i]) continue;
          const px = i % W, py = (i / W) | 0;
          for (let k = 0; k < NA; k++) {
            const cx = Math.round(px - r * cosT[k]), cy = Math.round(py - r * sinT[k]);
            if (cx >= 0 && cy >= 0 && cx < W && cy < H) acc[cy * W + cx] += wgt;
          }
        }
        for (let i = 0; i < W * H; i++) if (acc[i] > best[i]) { best[i] = acc[i]; bestR[i] = r; }
      }
      const thr = opts.thr || 0.3, mind = opts.mind || 12, maxN = opts.maxN || 8;   // 후보는 넉넉히(8) → identify에서 초상화 비교로 팀당 5명까지 고름
      for (let n = 0, tries = 0; n < maxN && tries < 40; tries++) {
        let bi = -1, bv = thr;
        for (let i = 0; i < W * H; i++) if (best[i] > bv && near[i]) { bv = best[i]; bi = i; }
        if (bi < 0) break;
        const x = bi % W, y = (bi / W) | 0, rr = bestR[bi];
        // 진짜 표시인지: 테두리가 원 둘레에 고르게 있고(직선·네온 줄은 한쪽만), 속은 같은 색으로 차 있지 않아야 함(초상화)
        let sec = 0, inn = 0, innN = 0;
        for (let q = 0; q < 12; q++) {
          let hit = 0;
          for (let a = 0; a < 4 && !hit; a++) { const t = 2 * Math.PI * (q * 4 + a) / 48;
            for (const dr of [-1, 0, 1]) { const px = Math.round(x + (rr + dr) * Math.cos(t)), py = Math.round(y + (rr + dr) * Math.sin(t)); if (px >= 0 && py >= 0 && px < W && py < H && mask[py * W + px]) { hit = 1; break; } } }
          sec += hit;
        }
        for (let yy = -rr + 3; yy <= rr - 3; yy++) for (let xx = -rr + 3; xx <= rr - 3; xx++) { if (xx * xx + yy * yy > (rr - 3) * (rr - 3)) continue; const px = x + xx, py = y + yy; if (px < 0 || py < 0 || px >= W || py >= H) continue; innN++; inn += mask[py * W + px]; }
        const ok = sec >= (opts.minSec || 4);
        if (ok) {
          // 속(초상화 자리) 밝기 고르기: 연막·장판은 속이 어둡고 고름(표준편차 작음), 초상화는 얼굴 무늬가 있음
          let s1 = 0, s2 = 0, sn = 0; const ri = Math.max(2, rr - 2);
          for (let yy = -ri; yy <= ri; yy++) for (let xx = -ri; xx <= ri; xx++) { if (xx * xx + yy * yy > ri * ri) continue; const px = x + xx, py = y + yy; if (px < 0 || py < 0 || px >= W || py >= H) continue; const q = (py * W + px) * 4, l = (d[q] + d[q + 1] + d[q + 2]) / 3; s1 += l; s2 += l * l; sn++; }
          const lum = sn ? s1 / sn : 0, sd = sn ? Math.sqrt(Math.max(0, s2 / sn - lum * lum)) : 0;
          // 속 평균 색 → 연막(팀 색이 비치는 어두운 원)인지
          let cr = 0, cg = 0, cb = 0, cn = 0, fl = 0;
          for (let yy = -ri; yy <= ri; yy++) for (let xx = -ri; xx <= ri; xx++) { if (xx * xx + yy * yy > ri * ri) continue; const px = x + xx, py = y + yy; if (px < 0 || py < 0 || px >= W || py >= H) continue; const q = (py * W + px) * 4; cr += d[q]; cg += d[q + 1]; cb += d[q + 2]; cn++;
            if (floor[py * W + px] || (Math.abs(d[q] - d[q + 1]) <= 10 && Math.abs(d[q + 1] - d[q + 2]) <= 10 && d[q] >= 95 && d[q] <= 150)) fl++; }
          cr /= cn || 1; cg /= cn || 1; cb /= cn || 1; fl /= cn || 1;
          // 연막 = 어둡고 팀 색이 비침(공격 빨강 / 수비 청록 — 오멘 초상화 같은 파랑은 아님)
          const blue = cb - cr > 30 && cb - cg > 12;
          const smoke = lum < 92 && (side === 'atk' ? cr - (cg + cb) / 2 > 25 && sd < 40 : (cg + cb) / 2 - cr > 12 && Math.abs(cg - cb) < 25 && !blue && sd < 30);
          // 가짜 = 속이 밋밋하거나(무늬 없음, 단 오멘처럼 파란 초상화는 예외) 대부분 맵 바닥 회색 · 나머지 = 요원 초상화 후보
          let kind = smoke ? 'smoke' : ((sd < (opts.minSd || 15) && !blue) || fl > (opts.maxFloor || 0.5)) ? 'junk' : 'agent';
          if (opts.footC && !opts.footC(x, y)) kind = 'junk';   // 요원·연막은 늘 맵 바닥 위(벽·배경 위에 중심이 있으면 가짜)
          out.push({ side, x, y, r: rr, v: +bv.toFixed(2), sec, lum: Math.round(lum), sd: Math.round(sd), fl: +fl.toFixed(2), rgb: [Math.round(cr), Math.round(cg), Math.round(cb)], kind }); n++;
        }
        for (let yy = Math.max(0, y - mind); yy <= Math.min(H - 1, y + mind); yy++) for (let xx = Math.max(0, x - mind); xx <= Math.min(W - 1, x + mind); xx++) best[yy * W + xx] = 0;
      }
    }
    out.walls = walls;
    return out;
  }

  /* ---------- 누가 누구인지: 초상화를 요원 아이콘과 비교 ----------
     teams: {A: [5명], B: [5명]}. 같은 색(공수) 표시는 한 팀 → 두 경우(A 수비/B 수비) 중 더 잘 맞는 쪽 */
  const iconCache = {};
  async function iconPatch(url, R, dia) {   // dia: 미니맵 초상화(원)를 이 지름(px)으로 가운데에 그림 — 없으면 칸 전체
    const k = url + R + ':' + (dia || 0); if (iconCache[k]) return iconCache[k];
    const im = await loadImg(url), n = 2 * R + 1, c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = 'rgb(40,40,50)'; x.fillRect(0, 0, n, n);
    x.imageSmoothingQuality = 'high'; if (dia) x.drawImage(im, (n - dia) / 2, (n - dia) / 2, dia, dia); else x.drawImage(im, 0, 0, n, n);
    return (iconCache[k] = x.getImageData(0, 0, n, n).data);
  }
  function patchScore(d, cx, cy, ic, R) {
    let best = 1e9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      let s = 0, n = 0;
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        if (x * x + y * y > R * R) continue;
        const px = cx + dx + x, py = cy + dy + y; if (px < 0 || py < 0 || px >= CW || py >= CH) continue;
        const p = (py * CW + px) * 4, q = ((y + R) * (2 * R + 1) + (x + R)) * 4;
        for (let c = 0; c < 3; c++) { const e = d[p + c] - ic[q + c]; s += e * e; } n += 3;
      }
      const v = Math.sqrt(s / n); if (v < best) best = v;
    }
    return best;
  }
  function bestAssign(cost, drop) {   // cost[i][j] i=표시, j=요원(5) — 표시마다 다른 요원, 합이 최소. 표시는 버릴 수도 있음(비용 drop: 초상화가 안 닮은 가짜 표시)
    const m = cost.length, n = cost[0] ? cost[0].length : 0; let best = { v: 1e18, a: [], c: [] };
    const D = drop == null ? 1e6 : drop;
    const used = new Array(n).fill(false), cur = [];
    (function rec(i, acc) {
      if (acc >= best.v) return;
      if (i === m) { best = { v: acc, a: cur.slice(), c: cur.map((j, k) => j >= 0 ? cost[k][j] : null) }; return; }
      for (let j = 0; j < n; j++) if (!used[j]) { used[j] = true; cur.push(j); rec(i + 1, acc + cost[i][j]); cur.pop(); used[j] = false; }
      cur.push(-1); rec(i + 1, acc + D); cur.pop();
    })(0, 0);
    return best;
  }
  async function identify(cropCanvas, markers, teams, iconUrl, forceDef, opts) {
    const R = (opts && opts.R) || 5, d = cropData(cropCanvas);
    const pat = {};
    for (const t of ['A', 'B']) for (const a of teams[t]) if (a) pat[a] = await iconPatch(iconUrl(a), R, opts && opts.dia);
    const costFor = (ms, list) => ms.map(m => list.map(a => a ? patchScore(d, m.x, m.y, pat[a], R) : 999));
    markers = markers.filter(m => !m.kind || m.kind === 'agent');   // 연막은 빼고
    const bySide = { def: markers.filter(m => m.side === 'def').slice(0, 8), atk: markers.filter(m => m.side === 'atk').slice(0, 8) };
    const DROP = opts && opts.drop != null ? opts.drop : 64;   // 초상화 차이가 이보다 크면 가짜 표시로 봄
    let best = null; const tots = {};
    for (const defTeam of (forceDef ? [forceDef] : ['A', 'B'])) {
      const atkTeam = defTeam === 'A' ? 'B' : 'A';
      const r1 = bySide.def.length ? bestAssign(costFor(bySide.def, teams[defTeam]), DROP) : { v: 0, a: [], c: [] };
      const r2 = bySide.atk.length ? bestAssign(costFor(bySide.atk, teams[atkTeam]), DROP) : { v: 0, a: [], c: [] };
      const tot = r1.v + r2.v; tots[defTeam] = tot;
      if (!best || tot < best.tot) best = { tot, defTeam, atkTeam, r1, r2 };
    }
    const res = [];
    bySide.def.forEach((m, i) => { if (best.r1.a[i] >= 0) res.push(Object.assign({}, m, { team: best.defTeam, agent: teams[best.defTeam][best.r1.a[i]], cost: best.r1.c[i] })); });
    bySide.atk.forEach((m, i) => { if (best.r2.a[i] >= 0) res.push(Object.assign({}, m, { team: best.atkTeam, agent: teams[best.atkTeam][best.r2.a[i]], cost: best.r2.c[i] })); });
    return { defTeam: best.defTeam, markers: res, tots };
  }

  /* ---------- 연막 찾기: 맵 바닥(밝은 회색) 위의 어두운 원 (테두리 색이 없는 것도) ----------
     footC: 맵 바닥 판정 함수. 돌려줌: [{x, y, r, side: 'atk'|'def'|null}] (crop 좌표) */
  function detectSmokes(cropCanvas, opts) {
    opts = opts || {};
    const W = CW, H = CH, d = cropData(cropCanvas), m = new Uint8Array(W * H), L = new Float32Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2], l = (r + g + b) / 3; L[i] = l;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (l > 28 && l < 100 && mx - mn < 75) m[i] = 1;
    }
    const seen = new Uint8Array(W * H), out = [], st = [];
    for (let i = 0; i < W * H; i++) {
      if (!m[i] || seen[i]) continue;
      const comp = []; st.push(i); seen[i] = 1; let x0 = W, y0 = H, x1 = 0, y1 = 0;
      while (st.length) { const j = st.pop(); comp.push(j); const x = j % W, y = (j / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && m[k] && !seen[k] && Math.abs((k % W) - x) <= 1) { seen[k] = 1; st.push(k); } }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, Rb = (bw + bh) / 4;
      if (comp.length < 60 || Rb < (opts.minR || 6) || Rb > (opts.maxR || 16) || Math.max(bw, bh) / Math.min(bw, bh) > 1.35) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (opts.footC && !opts.footC(Math.round(cx), Math.round(cy))) continue;   // 가운데가 맵 바닥 위
      // 원 안(0.85R)이 거의 다 어두운가 (안의 작은 스킬 그림 구멍은 허용)
      let inD = 0, hit = 0, s1 = 0, s2 = 0, sn = 0, cr = 0, cg = 0, cb = 0; const r2 = Math.pow(Rb * 0.85, 2);
      for (let y = Math.floor(cy - Rb); y <= Math.ceil(cy + Rb); y++) for (let x = Math.floor(cx - Rb); x <= Math.ceil(cx + Rb); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || (x - cx) * (x - cx) + (y - cy) * (y - cy) > r2) continue; inD++; const j = y * W + x;
        if (m[j]) { hit++; s1 += L[j]; s2 += L[j] * L[j]; sn++; const q = j * 4; cr += d[q]; cg += d[q + 1]; cb += d[q + 2]; } }
      if (!inD || hit / inD < 0.75 || !sn) continue;
      const mu = s1 / sn, sd = Math.sqrt(Math.max(0, s2 / sn - mu * mu)); if (sd > (opts.maxSd || 20)) continue;
      cr /= sn; cg /= sn; cb /= sn; if (cg - cr > 15) continue;   // 청록빛 어두운 원 = 설치물 아이콘(사이퍼 등)
      let red = 0, teal = 0;
      for (let k = 0; k < 36; k++) { const t = 2 * Math.PI * k / 36; for (const dr of [0, 1, 2, 3]) { const px = Math.round(cx + (Rb + dr) * Math.cos(t)), py = Math.round(cy + (Rb + dr) * Math.sin(t)); if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const q = (py * W + px) * 4, r = d[q], g = d[q + 1], b = d[q + 2]; if (r - g > 45 && r - b > 35) red++; else if (g - r > 45 && b - r > 30) teal++; } }
      out.push({ x: Math.round(cx), y: Math.round(cy), r: +Rb.toFixed(1), side: (red > 14 && red > teal * 2) || cr - cb > 25 ? 'atk' : teal > 14 && teal > red * 2 ? 'def' : null, lum: Math.round(mu), sd: Math.round(sd) });
    }
    return out;
  }

  /* ---------- 맵 전체를 한꺼번에: 같은 중계 안에서는 한 선수의 미니맵 초상화가 늘 똑같이 그려짐 ----------
     1) 처음엔 요원 아이콘과 비교해 장면마다 배정 → 2) 배정된 표시들의 평균 초상화(이 중계의 실제 모습)를 새 기준으로 → 몇 번 반복
     frames: [{ canvas, markers(detect 결과), defTeam }]  → { frames: 장면마다 [{...표시, team, agent, cost}] } */
  async function identifyMap(frames, teams, iconUrl, opts) {
    opts = opts || {};
    const R = opts.R || 5, S = 2, P = 2 * (R + S) + 1;
    const disc = []; for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R) disc.push([x, y]);
    const F = frames.map(f => {
      const d = cropData(f.canvas);
      const ms = (f.markers || []).filter(m => !m.kind || m.kind === 'agent').map(m => {
        const pch = new Float32Array(P * P * 3);
        for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) { const px = m.x - R - S + x, py = m.y - R - S + y, q = (y * P + x) * 3;
          if (px < 0 || py < 0 || px >= CW || py >= CH) { pch[q] = pch[q + 1] = pch[q + 2] = 40; continue; } const o = (py * CW + px) * 4; pch[q] = d[o]; pch[q + 1] = d[o + 1]; pch[q + 2] = d[o + 2]; }
        return { m, pch };
      });
      return { defTeam: f.defTeam, ms };
    });
    const T = {}, T0 = {};
    for (const t of ['A', 'B']) { T[t] = {}; T0[t] = {}; for (const a of teams[t]) if (a && !T[t][a]) {
      const ic = await iconPatch(iconUrl(a), R, opts.dia), v = new Float32Array(disc.length * 3);
      disc.forEach(([x, y], k) => { const q = ((y + R) * (2 * R + 1) + (x + R)) * 4; v[k * 3] = ic[q]; v[k * 3 + 1] = ic[q + 1]; v[k * 3 + 2] = ic[q + 2]; });
      T[t][a] = v; T0[t][a] = v; } }
    const N3 = disc.length * 3;
    const score = (pch, v) => {   // ±S 안에서 가장 잘 맞는 위치의 RMS 차이
      let best = 1e9, bx = 0, by = 0;
      for (let dy = -S; dy <= S; dy++) for (let dx = -S; dx <= S; dx++) {
        let s = 0; const lim = best * best * N3;
        for (let k = 0; k < disc.length; k++) { const q = ((disc[k][1] + R + S + dy) * P + (disc[k][0] + R + S + dx)) * 3;
          const e0 = pch[q] - v[k * 3], e1 = pch[q + 1] - v[k * 3 + 1], e2 = pch[q + 2] - v[k * 3 + 2]; s += e0 * e0 + e1 * e1 + e2 * e2; if (s > lim) break; }
        const r = Math.sqrt(s / N3); if (r < best) { best = r; bx = dx; by = dy; }
      }
      return { c: best, dx: bx, dy: by };
    };
    const iters = opts.iters == null ? 4 : opts.iters;
    let result = null;
    for (let it = 0; it <= iters; it++) {
      const DROP = it === 0 ? (opts.drop0 || 64) : (opts.drop || 48);
      const sum = {}, cnt = {};
      result = F.map(f => {
        const res = [];
        for (const side of ['def', 'atk']) {
          const team = side === 'def' ? f.defTeam : (f.defTeam === 'A' ? 'B' : 'A');
          const list = teams[team], ms = f.ms.filter(o => o.m.side === side).slice(0, 9);
          if (!ms.length) continue;
          const sc = ms.map(o => list.map(a => a ? score(o.pch, T[team][a]) : { c: 999, dx: 0, dy: 0 }));
          const as = bestAssign(sc.map(row => row.map(z => z.c)), DROP);
          ms.forEach((o, i) => { const j = as.a[i]; if (j < 0) return; const a = list[j], z = sc[i][j];
            res.push(Object.assign({}, o.m, { team, agent: a, cost: Math.round(z.c) }));
            const key = team + ':' + a; if (!sum[key]) { sum[key] = new Float32Array(N3); cnt[key] = 0; }
            disc.forEach(([x, y], k) => { const q = ((y + R + S + z.dy) * P + (x + R + S + z.dx)) * 3; sum[key][k * 3] += o.pch[q]; sum[key][k * 3 + 1] += o.pch[q + 1]; sum[key][k * 3 + 2] += o.pch[q + 2]; });
            cnt[key]++; });
        }
        return res;
      });
      if (it === iters) break;
      const w0 = opts.prior || 2;   // 새 기준 = (아이콘 × w0 + 배정된 조각 합) / (w0 + 개수)
      for (const t of ['A', 'B']) for (const a in T[t]) { const key = t + ':' + a, n = cnt[key] || 0; if (n < 3) continue;
        const v = new Float32Array(N3); for (let k = 0; k < N3; k++) v[k] = (T0[t][a][k] * w0 + sum[key][k]) / (w0 + n); T[t][a] = v; }
    }
    return { frames: result, templates: T, disc, R };
  }

  /* 맞춤 변환으로 '이 crop 좌표가 맵 위(여유 pad px)인가' 함수 만들기 */
  async function footprint(name, t, pad) {
    const am = await apiMask(name, 256), N = am.N, sc = 1024 / N, P = Math.max(1, Math.round((pad || 10) / t.s / sc));
    const dil = new Uint8Array(N * N);   // 여유만큼 넓힌 마스크
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (am.m[y * N + x]) {
      for (let dy = -P; dy <= P; dy++) for (let dx = -P; dx <= P; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N) dil[yy * N + xx] = 1; }
    }
    return (cx, cy) => { const a = inv(t, cx, cy), ax = (a[0] / sc) | 0, ay = (a[1] / sc) | 0; return ax >= 0 && ay >= 0 && ax < N && ay < N && dil[ay * N + ax] === 1; };
  }
  async function silhouette(name) {
    const im = await loadImg(mapUrl(name)), N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N); for (let i = 0; i < d.data.length; i += 4) { const on = d.data[i + 3] > 100; d.data[i] = d.data[i + 1] = d.data[i + 2] = on ? 255 : 0; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); return c.toDataURL('image/png');
  }

  /* ---------- 깨끗한 맵을 발로플랜트처럼(어두운 바닥 + 청록 선) 칠하기 ---------- */
  async function styledMap(name, src) {
    const im = await loadImg(src || mapUrl(name)), N = 1024;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, N, N);
    const id = x.getImageData(0, 0, N, N), d = id.data, a = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) a[i] = d[i * 4 + 3] > 100 ? 1 : 0;
    const o = x.createImageData(N, N), q = o.data;
    for (let y = 0; y < N; y++) for (let x2 = 0; x2 < N; x2++) {
      const i = y * N + x2, p = i * 4;
      if (!a[i]) { q[p + 3] = 0; continue; }
      const edge = (x2 && !a[i - 1]) || (x2 < N - 1 && !a[i + 1]) || (y && !a[i - N]) || (y < N - 1 && !a[i + N]) ||
        (x2 > 1 && !a[i - 2]) || (x2 < N - 2 && !a[i + 2]) || (y > 1 && !a[i - 2 * N]) || (y < N - 2 && !a[i + 2 * N]);
      const r = d[p], g = d[p + 1], b = d[p + 2];
      let col;
      if (edge || (r > 170 && g > 170 && b > 170)) col = [46, 230, 214];            // 벽·선
      else if (r - b > 18 && g - b > 12) col = [16, 78, 86];                         // 사이트(노란 부분)
      else if (r < 90) col = [8, 22, 30];                                            // 어두운 칸(구조물)
      else col = [11, 42, 56];                                                        // 바닥
      q[p] = col[0]; q[p + 1] = col[1]; q[p + 2] = col[2]; q[p + 3] = 255;
    }
    x.putImageData(o, 0, 0);
    return c.toDataURL('image/png');
  }

  window.WonMapReg = { MAPS, mapUrl, CROP, CW, CH, WIDE, WW, WH, isWide, units, KNOWN, apiMask, register, registerOne, detect, detectSmokes, identify, identifyMap, styledMap, footprint, silhouette, fwd, inv, loadImg, setMapUrl: (f) => { mapUrlFn = f; } };
})();
