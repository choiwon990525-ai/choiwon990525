// 헤드리스 Chromium으로 index.html을 열어 프레임 캡처 / 자동 점검 / MP4 제작
//   node tools/shoot.mjs frames <출력폴더> [시간들 쉼표구분, 기본 0..30 매 1초]
//   node tools/shoot.mjs checks
//   node tools/shoot.mjs audio <출력.wav>          (소리만 렌더링)
//   node tools/shoot.mjs player                    (실제 재생 UI 동작 점검)
//   node tools/shoot.mjs video <출력.mp4> [fps=30] [crf=23] [초=30]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(path.join(here, '..', 'index.html')).href + '?capture';
const PALETTE = ['#f1e6d0', '#2b2733', '#f26a21', '#c8433a', '#1f2c55', '#f5d46a'];

async function openPage(browser, { instrument = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  if (instrument) {
    // 모든 캔버스의 색/투명도/그라디언트/그림자 사용을 기록 (팔레트 6색 규칙 점검용)
    await page.addInitScript(() => {
      const log = (window.__colorLog = { fill: new Set(), stroke: new Set(), alpha: new Set(), other: new Set() });
      const P = CanvasRenderingContext2D.prototype;
      for (const [prop, key] of [['fillStyle', 'fill'], ['strokeStyle', 'stroke']]) {
        const d = Object.getOwnPropertyDescriptor(P, prop);
        Object.defineProperty(P, prop, { get: d.get, set(v) { log[key].add(typeof v === 'string' ? v.toLowerCase() : 'NON-STRING'); d.set.call(this, v); } });
      }
      const ga = Object.getOwnPropertyDescriptor(P, 'globalAlpha');
      Object.defineProperty(P, 'globalAlpha', { get: ga.get, set(v) { log.alpha.add(v); ga.set.call(this, v); } });
      for (const prop of ['shadowBlur', 'filter', 'globalCompositeOperation']) {
        const d = Object.getOwnPropertyDescriptor(P, prop);
        Object.defineProperty(P, prop, { get: d.get, set(v) { log.other.add(prop + '=' + v); d.set.call(this, v); } });
      }
      for (const fn of ['createLinearGradient', 'createRadialGradient', 'createPattern', 'createConicGradient', 'drawImage']) {
        const orig = P[fn];
        P[fn] = function (...a) { if (fn !== 'drawImage') log.other.add(fn); else log.other.add('drawImage(' + (a[0] && a[0].width) + 'x' + (a[0] && a[0].height) + ')'); return orig.apply(this, a); };
      }
    });
  }
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.waitForFunction(() => typeof window.__render === 'function');
  return { page, errors };
}
const grab = (page, t) => page.evaluate(t => { window.__render(t); return document.getElementById('c').toDataURL('image/png'); }, t)
  .then(u => Buffer.from(u.split(',')[1], 'base64'));
const sha = async buf => (await import('node:crypto')).createHash('sha256').update(buf).digest('hex').slice(0, 16);

async function frames(outDir, list) {
  fs.mkdirSync(outDir, { recursive: true });
  const times = list ? list.split(',').map(Number) : Array.from({ length: 31 }, (_, i) => i);
  const browser = await playwright.chromium.launch();
  const { page, errors } = await openPage(browser);
  for (const t of times) {
    const buf = await grab(page, t);
    const name = 't' + t.toFixed(2).padStart(5, '0') + '.png';
    fs.writeFileSync(path.join(outDir, name), buf);
  }
  await browser.close();
  console.log(`saved ${times.length} frames → ${outDir}`);
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
}

async function checks() {
  const browser = await playwright.chromium.launch();
  const report = {};
  // 1) 결정성: 같은 t를 순서를 바꿔 다시 그려도, 새 페이지에서 그려도 픽셀이 같아야 한다
  const { page, errors } = await openPage(browser, { instrument: true });
  const probe = [0, 3.3, 7.77, 12.34, 13.9, 19.55, 22.2, 25.6, 26.1, 29.99];
  const first = {};
  for (const t of probe) first[t] = await sha(await grab(page, t));
  const again = {};
  for (const t of [...probe].reverse()) again[t] = await sha(await grab(page, t));
  const { page: page2 } = await openPage(browser);
  const fresh = {};
  for (const t of probe) fresh[t] = await sha(await grab(page2, t));
  report.determinism = probe.map(t => ({ t, same_order_swap: first[t] === again[t], same_new_page: first[t] === fresh[t] }));
  // 2) 팔레트: 0~30초를 0.25초 간격으로 그리며 쓰인 색 기록
  for (let t = 0; t <= 30; t += 0.25) await page.evaluate(t => window.__render(t), t);
  const log = await page.evaluate(() => ({ fill: [...window.__colorLog.fill], stroke: [...window.__colorLog.stroke], alpha: [...window.__colorLog.alpha], other: [...window.__colorLog.other] }));
  const used = [...new Set([...log.fill, ...log.stroke])];
  report.palette = { used, outside: used.filter(c => !PALETTE.includes(c)), globalAlphaSet: log.alpha, other: log.other };
  // 3) 연속성: 캐릭터 파라미터를 1/240초 간격으로 샘플 → 한 칸에서 튀는 값(불연속) 탐지
  const keys = ['sy', 'cf', 'lean', 'armL', 'armR', 'eyeL', 'eyeR', 'happy', 'px', 'py', 'browUp', 'browTilt', 'smile', 'mouthOpen', 'sweat', 'antenna', 'spin', 'sparkle'];
  const samples = await page.evaluate(keys => {
    const out = []; const dt = 1 / 240;
    for (let i = 0; i <= 30 * 240; i++) { const s = window.__state(i * dt); out.push([...keys.map(k => s[k]), s.cp.x, s.cp.y, s.cp.s, s.cam.cx, s.cam.cy, s.cam.z]); }
    return out;
  }, keys);
  const names = [...keys, 'screenX', 'screenY', 'screenScale', 'camX', 'camY', 'camZ'];
  report.continuity = names.map((n, j) => {
    let maxStep = 0, at = 0;
    for (let i = 1; i < samples.length; i++) { const d = Math.abs(samples[i][j] - samples[i - 1][j]); if (d > maxStep) { maxStep = d; at = i / 240; } }
    return { param: n, maxStepPer240th: +maxStep.toFixed(4), at: +at.toFixed(3) };
  });
  // 4) 소리 이벤트
  report.events = await page.evaluate(() => window.__events().map(e => `${e.t.toFixed(2)} ${e.type}`));
  report.pageErrors = errors;
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
}

async function video(out, fps = 30, crf = 23, secs = 30) {
  const tmp = fs.mkdtempSync(path.join(path.dirname(path.resolve(out)), '.render-'));
  const wav = path.join(tmp, 'audio.wav');
  const browser = await playwright.chromium.launch();
  const { page, errors } = await openPage(browser);
  // 소리: 같은 오디오 그래프를 OfflineAudioContext로 렌더링
  const b64 = await page.evaluate(() => window.__renderAudio());
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  const total = Math.round(secs * fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-tune', 'animation',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', path.resolve(out)], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const buf = await grab(page, i / fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 90 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${out} (${total} frames @ ${fps}fps)`);
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
}

async function audio(out) {
  const browser = await playwright.chromium.launch();
  const { page } = await openPage(browser);
  fs.writeFileSync(out, Buffer.from(await page.evaluate(() => window.__renderAudio()), 'base64'));
  await browser.close();
  console.log('wrote ' + out);
}
async function player() {   // ?capture 없이 열어서 재생 버튼 → 시간이 흐르는지, 에러가 없는지
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE.replace('?capture', ''));
  await page.click('#start');
  await page.waitForTimeout(1500);
  const a = await page.textContent('#time'), l1 = await page.textContent('#label');
  await page.fill('#scrub', '13.9'); await page.dispatchEvent('#scrub', 'input');
  await page.waitForTimeout(200);
  const b = await page.textContent('#time'), l2 = await page.textContent('#label');
  await page.screenshot({ path: path.join(here, '..', '.player-check.png') });
  await browser.close();
  console.log(JSON.stringify({ afterPlay: a, label1: l1, afterSeek: b, label2: l2, errors }));
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'frames') await frames(a, b);
else if (cmd === 'checks') await checks();
else if (cmd === 'audio') await audio(a);
else if (cmd === 'player') await player();
else if (cmd === 'video') await video(a, b ? +b : 30, process.argv[5] ? +process.argv[5] : 23, process.argv[6] ? +process.argv[6] : 30);
else console.log('usage: frames <dir> [times] | checks | video <out.mp4> [fps]');
