// 깜자 쇼릴을 MP4로 뽑는다. 웹앱이 쓰는 public/motion/kkamja-showreel.js를 그대로 프레임마다 찍는다.
//
//   node tools/render-showreel.mjs                       → public/motion/kkamja-showreel.mp4 (1920×1080, 30fps)
//   node tools/render-showreel.mjs --out reel.mp4 --no-hud --no-sound --shutter 1 --workers 2
//
// 필요한 것: ffmpeg, Playwright (npx playwright install chromium)
// 모션 블러: 한 프레임을 --shutter 장(기본 4)의 순간으로 나눠 찍고 평균낸다 (180° 셔터).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = name => args.includes(`--${name}`);
const OUT = path.resolve(opt('out', path.join(PUBLIC, 'motion', 'kkamja-showreel.mp4')));
const FPS = 30, SHUTTER = Math.max(1, Number(opt('shutter', 4)));
const WORKERS = Math.max(1, Number(opt('workers', Math.min(4, Math.max(1, os.cpus().length - 1)))));
const SCALE = Number(opt('scale', 1)); // 0.5 → 960×540 빠른 확인용

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch {}
  const g = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim();
  try { return createRequire(path.join(g, '/'))('playwright'); } catch {}
  console.error('Playwright가 없어요. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.');
  process.exit(1);
}

// public/ 폴더를 잠깐 띄우는 정적 서버 (ES 모듈은 file://에서 불러올 수 없다)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };
function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(PUBLIC, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ───────── 효과음: 한 가지 재료(부드러운 나무·공기·저음)를 한 방의 잔향 안에서 ─────────
function synthSfx(file, duration, OFF = 0) { // OFF: 영상이 원래 타임라인의 몇 초부터 시작하는지
  const SR = 48000, N = Math.ceil(duration * SR);
  const L = new Float32Array(N), Rr = new Float32Array(N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const add = (t0, fn, len, gain = 1, pan = 0) => {
    t0 -= OFF;
    if (t0 < 0) return; // 잘려 나간 앞부분의 소리
    const s0 = Math.floor(t0 * SR), n = Math.floor(len * SR);
    const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < n && s0 + i < N; i++) { const v = fn(i / SR); L[s0 + i] += v * gl; Rr[s0 + i] += v * gr; }
  };
  const knock = (f, d = 22) => t => Math.sin(2 * Math.PI * f * t) * Math.exp(-d * t) + 0.15 * Math.sin(2 * Math.PI * f * 2.7 * t) * Math.exp(-d * 2 * t);
  const thud = (f0 = 70) => t => Math.sin(2 * Math.PI * (f0 + 60 * Math.exp(-30 * t)) * t) * Math.exp(-9 * t);
  // 1) 점 등장, 글자 착지
  add(0.12, knock(880, 30), 0.3, 0.18);
  [0.87, 0.93, 0.99, 1.05, 1.11].forEach((t, i) => add(t, knock(520 + i * 40, 26), 0.25, 0.12, -0.3 + i * 0.15));
  // 2) 하드컷 4번
  [2.4, 2.55, 2.7, 2.85].forEach((t, i) => { add(t, thud(90), 0.4, 0.35); add(t, knock(300 + i * 90, 35), 0.2, 0.22); });
  // 3) 공 바운스 (점점 작게)
  [3.6, 4.15, 4.75, 5.15].forEach((t, i) => add(t, thud(80 + i * 10), 0.5, 0.5 * Math.pow(0.75, i), [0, 0.4, -0.3, 0][i]));
  // 4) EASY 글자 4개
  [5.7, 5.83, 5.96, 6.09].forEach((t, i) => add(t, knock(640 + i * 60, 28), 0.25, 0.15, -0.2 + i * 0.13));
  // 5) 슈우욱 (걸러낸 잡음이 점점 높아지고 오른쪽 → 왼쪽)
  { let y1 = 0, y2 = 0; const len = 0.95;
    add(7.1, t => { const u = t / len, f = 300 + 2600 * Math.pow(u, 1.6), q = 0.12, w = 2 * Math.PI * f / SR;
      const x = rnd(); y1 += w * (x - y1 - q * y2); y2 += w * y1; // 간단한 2극 필터
      return y2 * 2.2 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 2; }, len, 0.55, 0); }
  for (let i = 0; i < Math.floor(0.95 * SR); i++) { const s = Math.floor((7.1 - OFF) * SR) + i, u = i / (0.95 * SR), p = 0.9 - 1.6 * u; // 패닝
    const v = (L[s] + Rr[s]) / 2; L[s] = v * Math.cos((p + 1) * Math.PI / 4) * 1.4; Rr[s] = v * Math.sin((p + 1) * Math.PI / 4) * 1.4; }
  // 글자가 맞는 소리
  [7.62, 7.68, 7.74, 7.8].forEach((t, i) => add(t, knock(420 - i * 30, 24), 0.25, 0.18, 0.5 - i * 0.25));
  // 6) 착지 쿵
  add(8.08, thud(55), 0.9, 0.9, -0.25);
  add(8.08, t => rnd() * Math.exp(-40 * t), 0.2, 0.12, -0.25);
  // 7) 말풍선 뽁 + 글자
  add(8.7, t => Math.sin(2 * Math.PI * (300 + 900 * Math.min(1, t * 14)) * t) * Math.exp(-18 * t), 0.35, 0.3, 0.3);
  [8.82, 8.88, 8.94, 9.0, 9.16, 9.22].forEach((t, i) => add(t, knock(900 + i * 50, 40), 0.15, 0.07, 0.3));
  // 8) 엔드 카드 종소리
  [523.25, 659.25, 783.99].forEach((f, i) => add(13.2 + i * 0.06, t => Math.sin(2 * Math.PI * f * t) * Math.exp(-2.2 * t) * (1 - Math.exp(-80 * t)), 2.2, 0.12));
  // 한 방의 잔향 (작은 방, 피드백 지연선 몇 개)
  const rev = (buf, taps) => { const out = Float32Array.from(buf); for (const [ms, g] of taps) { const d = Math.floor(ms * SR / 1000); for (let i = d; i < N; i++) out[i] += out[i - d] * g; } return out; };
  const Lw = rev(L, [[29, 0.22], [37, 0.18], [53, 0.12]]), Rw = rev(Rr, [[31, 0.22], [41, 0.18], [59, 0.12]]);
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(Lw[i]), Math.abs(Rw[i]));
  const g = 0.4 / (peak || 1); // −8 dBFS 근처
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lw[i] * g)) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rw[i] * g)) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}

// ───────── 렌더 ─────────
const { chromium } = loadPlaywright();
const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kkamja-reel-'));
const W = Math.round(1920 * SCALE), H = Math.round(1080 * SCALE);
const url = `${base}/motion/preview.html?bare&assets=../images/${flag('no-hud') ? '&hud=0' : ''}`;

const browser = await chromium.launch();
const probe = await browser.newPage();
await probe.goto(url);
await probe.waitForFunction(() => window.__ready);
const [DURATION, START] = await probe.evaluate(() => [window.__duration, window.__start || 0]);
await probe.close();
const frames = Math.round(DURATION * FPS);
const total = frames * SHUTTER;
console.log(`${W}×${H} · ${FPS}fps · ${frames}프레임 × 셔터 ${SHUTTER}장 = ${total}번 촬영 · 브라우저 ${WORKERS}개`);
const started = Date.now();
let done = 0;
async function worker(w) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready);
  await page.evaluate(() => window.__ready);
  for (let i = w; i < total; i += WORKERS) {
    const f = Math.floor(i / SHUTTER), k = i % SHUTTER;
    const t = (f + (SHUTTER > 1 ? (k / SHUTTER) * 0.5 : 0)) / FPS; // 180° 셔터: 프레임 시간의 앞 절반
    await page.evaluate(t => window.__seek(t), t);
    await page.screenshot({ path: path.join(tmp, `${String(i).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 95 });
    if (++done % 120 === 0) process.stdout.write(`  ${done}/${total} (${((Date.now() - started) / 1000).toFixed(0)}초)\n`);
  }
  await page.close();
}
await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)));
await browser.close();
srv.close();

const vf = SHUTTER > 1 ? `tmix=frames=${SHUTTER},select='eq(mod(n\\,${SHUTTER})\\,${SHUTTER - 1})',setpts=N/${FPS}/TB,format=yuv420p` : 'format=yuv420p';
const ff = ['-y', '-loglevel', 'error', '-framerate', String(FPS * SHUTTER), '-i', path.join(tmp, '%06d.jpg')];
if (!flag('no-sound')) { const wav = path.join(tmp, 'sfx.wav'); synthSfx(wav, DURATION, START); ff.push('-i', wav, '-c:a', 'aac', '-b:a', '192k', '-shortest'); }
ff.push('-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', OUT);
const r = spawnSync('ffmpeg', ff, { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`완료: ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)}MB, ${((Date.now() - started) / 1000).toFixed(0)}초)`);
