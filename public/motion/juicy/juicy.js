// 쥬씨~ 감귤 — 15초 모션 그래픽 (캔버스, 의존성 없는 ES 모듈)
//
// 감귤이 통통 튀며 굴러와 화면 중앙에서 슬로모션으로 '펑' 터지고, 과즙이 화면을 덮은 뒤
// 젤리 같은 입체 글씨 "쥬씨~"가 튀어나온다. 모든 그림은 시간 t(초)에 대한 순수 함수라서
// 실시간 재생과 MP4 렌더링 결과가 같다.
//
//   import { createJuicy } from '/motion/juicy/juicy.js';
//   const reel = createJuicy(el, { autoplay: true, loop: true });
//   // reel.play() · pause() · seek(t) · rate · loop · on('time'|'end', fn) · destroy()

export const TITLE = '쥬씨~ 감귤 · 15초';
export const DURATION = 15;
export const FPS = 30;

export const BEATS = [
  { t: 0.0, name: '정적 · 파스텔 스튜디오' },
  { t: 0.25, name: '감귤 등장 (오른쪽 뒤편)' },
  { t: 0.55, name: '통통 튀며 다가옴' },
  { t: 3.05, name: '데굴데굴 굴러오기' },
  { t: 4.5, name: '멈춤 · 부르르 부풀기' },
  { t: 5.0, name: '펑! 슬로모션 폭발' },
  { t: 8.2, name: '원래 속도로 복귀' },
  { t: 9.0, name: '주황 과즙 파동 확산' },
  { t: 10.0, name: '"쥬씨~" 팝업' },
  { t: 11.2, name: 'JUICY~ · 물방울' },
  { t: 12.4, name: '마무리 홀드' },
];

// ───────────────────────────── 기본 함수 ─────────────────────────────
const W = 1920, H = 1080;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = {
  quadIn: u => u * u,
  cubicOut: u => 1 - Math.pow(1 - u, 3),
  expoOut: u => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  expoIn: u => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10)),
  sineInOut: u => -(Math.cos(Math.PI * u) - 1) / 2,
};
function spring(tau, zeta = 0.5, omega = 18) {
  if (tau <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * tau) * (Math.cos(wd * tau) + (zeta * omega / wd) * Math.sin(wd * tau));
}
function impact(t, tHit, amt = 0.2, decay = 8, omega = 24) {
  const tau = t - tHit;
  if (tau < 0) return { sx: 1, sy: 1 };
  const k = Math.exp(-decay * tau) * Math.cos(omega * tau) * amt;
  return { sx: 1 + k, sy: 1 - k };
}
function shake(t, tHit, amp) {
  const tau = t - tHit;
  if (tau < 0 || tau > 1) return { x: 0, y: 0 };
  const d = Math.exp(-7 * tau) * amp;
  return { x: d * Math.sin(TAU * 11 * tau + 0.7), y: d * 0.8 * Math.sin(TAU * 15 * tau + 2.1) };
}
function rng(seed) { // mulberry32 — 매번 같은 난수
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ───────────────────────────── 색 ─────────────────────────────
const C = {
  skyTop: '#DDF6EF', skyLow: '#FFF4E4', floorNear: '#FFE6C7', floorFar: '#FFF0DC',
  peel: '#FF8A1C', peelHi: '#FFC25C', peelLo: '#E25F00', dimple: '#C94F00',
  leaf: '#46A54F', leafLo: '#2E7D3A', juice: '#FF9A1F', juiceHi: '#FFC960', juiceLo: '#F27300',
  pulp: '#FFB347', cream: '#FFF8E8', deep: '#9A3A00', white: '#FFFFFF',
};
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Jua&display=swap';
const FONT = "'Jua', 'Noto Sans KR', 'Apple SD Gothic Neo', system-ui, sans-serif";

// ───────────────────────────── 감귤의 길 (0.25 ~ 5초) ─────────────────────────────
const GROUND = 840, R = 165, HORIZON = 640;
const ENTER = 0.25, STOP = 4.5, BURST = 5.0;
const HOPS = [ // [시작, 끝, 높이(px, 가까이 왔을 때 기준)]
  [0.55, 1.25, 420], [1.25, 1.85, 300], [1.85, 2.35, 200], [2.35, 2.75, 120], [2.75, 3.05, 50],
];
const HITS = [0.55, 1.25, 1.85, 2.35, 2.75, 3.05];
function progress(t) { return 1 - Math.pow(1 - seg(t, ENTER, STOP), 2.2); } // 다가오며 점점 느려짐
function tangerine(t) {
  const p = progress(t);
  const s = lerp(0.3, 1, Math.pow(p, 0.85));               // 원근: 멀리서 작게 → 가까이 크게
  const x = lerp(1560, 960, p) - Math.sin(p * Math.PI) * 120;
  const ground = lerp(HORIZON + 70, GROUND, p);            // 바닥에 닿는 높이
  let lift = 0;
  if (t < HOPS[0][0]) lift = lerp(520, 0, ease.quadIn(seg(t, ENTER, HOPS[0][0])));
  else for (const [a, b, h] of HOPS) if (t >= a && t < b) { const u = seg(t, a, b); lift = 4 * h * u * (1 - u); }
  const angle = -TAU * 3 * p;                              // 왼쪽으로 3바퀴
  return { x, ground, s, lift: lift * s, angle };
}

// ───────────────────────────── 슬로모션 시간 ─────────────────────────────
// 터진 뒤 0.08초는 그대로, 8.2초까지 0.18배속, 8.8초까지 원래 속도로 돌아온다.
const SLOW = 0.18;
function physTime(t) {
  const a = BURST + 0.08, b = 8.2, c = 8.8;
  if (t <= BURST) return 0;
  if (t <= a) return t - BURST;
  if (t <= b) return (a - BURST) + (t - a) * SLOW;
  if (t <= c) { const u = t - b, k = (1 - SLOW) / (c - b); return (a - BURST) + (b - a) * SLOW + SLOW * u + 0.5 * k * u * u; }
  return physTime(c) + (t - c);
}

// ───────────────────────────── 터지는 것들 (미리 계산) ─────────────────────────────
const CX = 960, CY = GROUND - R; // 멈춘 감귤의 중심
const r1 = rng(11);
const DROPS = Array.from({ length: 150 }, () => {
  const a = -Math.PI / 2 + (r1() - 0.5) * TAU * 0.98, sp = 380 + Math.pow(r1(), 0.7) * 1700;
  return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, r: 5 + Math.pow(r1(), 2) * 24, hi: r1() };
});
const PULP = Array.from({ length: 46 }, () => {
  const a = r1() * TAU, sp = 260 + r1() * 980;
  return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 300, len: 26 + r1() * 30, spin: (r1() - 0.5) * 9, a0: r1() * TAU };
});
const SHARDS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * TAU + r1() * 0.3, sp = 520 + r1() * 520;
  return { a, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 380, spin: (r1() - 0.5) * 7, w: 0.42 + r1() * 0.25 };
});
const SPARKS = Array.from({ length: 36 }, () => {
  const a = r1() * TAU, sp = 200 + r1() * 820;
  return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: 4 + r1() * 7, ph: r1() * TAU };
});
const ARMS = Array.from({ length: 18 }, (_, i) => ({ a: (i / 18) * TAU + (r1() - 0.5) * 0.3, len: 220 + r1() * 300, w: 52 + r1() * 46, ph: r1() * TAU }));
const BOUNCE_DROPS = HITS.slice(0, 5).map((h, k) => Array.from({ length: 7 }, () => ({ vx: (r1() - 0.5) * 520, vy: -(240 + r1() * 420), r: 3 + r1() * 6, k })));
const r2 = rng(29);
const DIMPLES = Array.from({ length: 260 }, () => { const a = r2() * TAU, d = Math.sqrt(r2()); return { a, d, r: 1.6 + r2() * 3.2 }; });
const DEW = [[-0.35, -0.42, 0.11], [0.28, -0.18, 0.08], [-0.05, 0.3, 0.12], [0.45, 0.32, 0.07], [-0.52, 0.12, 0.06], [0.1, -0.58, 0.06], [0.55, -0.48, 0.05]];
const r3 = rng(53);
const BUBBLES = Array.from({ length: 34 }, () => ({ x: r3() * W, v: 70 + r3() * 140, r: 4 + r3() * 13, ph: r3(), wob: 10 + r3() * 26, f: 0.6 + r3() * 1.2 }));
const DRIPS = [[11.4, 0], [11.9, 1], [12.5, 0.6], [13.0, 1.4], [13.5, 0.3], [13.9, 1.1], [14.3, 1.7]];

// ───────────────────────────── 효과음 (렌더러가 합성) ─────────────────────────────
// kind: roll · bump · pop · splash · whoosh · boing · chime · fizz · drip
export const SFX = [
  { t: ENTER, kind: 'roll', len: STOP - ENTER, gain: 0.32, pan: 0.6, pan1: 0 },
  ...HITS.map((t, i) => ({ t, kind: 'bump', gain: 0.25 + 0.5 * (i / HITS.length), pan: lerp(0.6, 0, i / HITS.length) })),
  { t: 4.6, kind: 'fizz', len: 0.4, gain: 0.12 },
  { t: BURST, kind: 'pop', gain: 1 },
  { t: BURST, kind: 'splash', len: 3.2, gain: 0.55 },
  { t: 9.0, kind: 'whoosh', len: 1.1, gain: 0.6 },
  { t: 10.05, kind: 'boing', gain: 0.5, pitch: 1 }, { t: 10.3, kind: 'boing', gain: 0.5, pitch: 1.25 }, { t: 10.55, kind: 'boing', gain: 0.4, pitch: 1.5 },
  { t: 10.6, kind: 'chime', gain: 0.35 },
  { t: 10.0, kind: 'fizz', len: 5, gain: 0.14 },
  { t: 11.2, kind: 'chime', gain: 0.2, pitch: 1.5 },
  ...DRIPS.map(([t], i) => ({ t: t + 0.55, kind: 'drip', gain: 0.18, pitch: 1 + (i % 3) * 0.2 })),
];

// ───────────────────────────── 그리기 ─────────────────────────────
function drawBackground(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, C.skyTop); g.addColorStop(1, C.skyLow);
  ctx.fillStyle = g; ctx.fillRect(-200, -200, W + 400, HORIZON + 200);
  const f = ctx.createLinearGradient(0, HORIZON, 0, H);
  f.addColorStop(0, C.floorFar); f.addColorStop(1, C.floorNear);
  ctx.fillStyle = f; ctx.fillRect(-200, HORIZON, W + 400, H - HORIZON + 200);
  // 바닥과 벽이 만나는 부드러운 빛
  const glow = ctx.createRadialGradient(960, HORIZON, 0, 960, HORIZON, 900);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(-200, -200, W + 400, H + 400);
}

function drawTangerine(ctx, x, y, r, angle, sx, sy, glow = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  // 몸통 (빛은 왼쪽 위에 고정, 껍질 무늬만 돈다 → 굴러가는 느낌)
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05);
  body.addColorStop(0, C.peelHi); body.addColorStop(0.45, C.peel); body.addColorStop(1, C.peelLo);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.04, r * 0.96, 0, 0, TAU); ctx.fillStyle = body; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.rotate(angle);
  ctx.fillStyle = C.dimple;
  for (const d of DIMPLES) {
    const px = Math.cos(d.a) * d.d * r, py = Math.sin(d.a) * d.d * r;
    ctx.globalAlpha = 0.16 * (1 - d.d * d.d * 0.6);
    ctx.beginPath(); ctx.arc(px, py, d.r * (r / 165) * (1 - d.d * 0.4), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 물방울 (껍질에 맺힌 이슬)
  for (const [dx, dy, dr] of DEW) {
    const px = dx * r, py = dy * r, rr = dr * r;
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(px, py, rr, rr * 1.15, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(180,70,0,0.25)'; ctx.lineWidth = Math.max(1, rr * 0.12); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(px - rr * 0.35, py - rr * 0.4, rr * 0.28, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // 그림자 쪽 어둡게 + 반사광
  const shade = ctx.createRadialGradient(r * 0.45, r * 0.5, r * 0.2, r * 0.2, r * 0.25, r * 1.1);
  shade.addColorStop(0, 'rgba(160,50,0,0)'); shade.addColorStop(1, 'rgba(160,50,0,0.28)');
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.04, r * 0.96, 0, 0, TAU); ctx.fillStyle = shade; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.ellipse(-r * 0.42, -r * 0.5, r * 0.22, r * 0.12, -0.6, 0, TAU); ctx.fill();
  if (glow > 0) { ctx.fillStyle = `rgba(255,236,170,${0.45 * glow})`; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.04, r * 0.96, 0, 0, TAU); ctx.fill(); }
  // 꼭지와 잎 (껍질과 함께 돈다)
  ctx.rotate(angle);
  ctx.translate(0, -r * 0.93);
  ctx.fillStyle = '#6B4A1E'; ctx.fillRect(-r * 0.03, -r * 0.1, r * 0.06, r * 0.13);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.06);
  ctx.quadraticCurveTo(r * 0.28, -r * 0.42, r * 0.58, -r * 0.2);
  ctx.quadraticCurveTo(r * 0.3, r * 0.04, 0, -r * 0.06);
  const lg = ctx.createLinearGradient(0, -r * 0.4, r * 0.5, 0);
  lg.addColorStop(0, C.leaf); lg.addColorStop(1, C.leafLo);
  ctx.fillStyle = lg; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = r * 0.015;
  ctx.beginPath(); ctx.moveTo(r * 0.04, -r * 0.08); ctx.quadraticCurveTo(r * 0.28, -r * 0.24, r * 0.52, -r * 0.2); ctx.stroke();
  ctx.restore();
}

function drop(ctx, x, y, r, vx, vy, color, alpha = 1, hi = true) {
  const sp = Math.hypot(vx, vy), st = clamp(sp * 0.0016, 0, 1.6);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(Math.atan2(vy, vx));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + st), r / (1 + st * 0.35), 0, 0, TAU); ctx.fill();
  if (hi) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.3, r * 0.3, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// "쥬씨~" 한 글자씩 젤리 입체 글자 그림을 미리 만들어 둔다
function makeGlyph(doc, ch, size) {
  const pad = size * 0.35, depth = Math.round(size * 0.07);
  const m = doc.createElement('canvas').getContext('2d');
  m.font = `${size}px ${FONT}`;
  const w = Math.ceil(m.measureText(ch).width + pad * 2), h = Math.ceil(size * 1.3 + pad * 2 + depth);
  const cv = doc.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.font = `${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const bx = w / 2, by = pad + size * 1.0;
  // 1) 두께 (아래로 쌓이는 진한 층)
  for (let i = depth; i >= 1; i--) {
    g.fillStyle = i > depth * 0.5 ? '#7A2C00' : C.deep; g.strokeStyle = g.fillStyle; g.lineWidth = size * 0.09;
    g.strokeText(ch, bx + i * 0.25, by + i); g.fillText(ch, bx + i * 0.25, by + i);
  }
  // 2) 흰 테두리
  g.strokeStyle = C.white; g.lineWidth = size * 0.09; g.strokeText(ch, bx, by);
  // 3) 젤리 색 면 + 하이라이트 (면에만)
  const f = doc.createElement('canvas'); f.width = w; f.height = h;
  const fg = f.getContext('2d');
  fg.font = g.font; fg.textAlign = 'center'; fg.textBaseline = 'alphabetic';
  const grd = fg.createLinearGradient(0, by - size * 0.85, 0, by + size * 0.05);
  grd.addColorStop(0, '#FFFCEB'); grd.addColorStop(0.45, '#FFE27A'); grd.addColorStop(1, '#FFAA1F');
  fg.fillStyle = grd; fg.fillText(ch, bx, by);
  fg.globalCompositeOperation = 'source-atop';
  fg.fillStyle = 'rgba(255,255,255,0.75)';
  fg.beginPath(); fg.ellipse(bx - size * 0.12, by - size * 0.62, size * 0.36, size * 0.11, -0.25, 0, TAU); fg.fill();
  fg.fillStyle = 'rgba(255,140,0,0.35)';
  fg.beginPath(); fg.ellipse(bx + size * 0.1, by - size * 0.02, size * 0.5, size * 0.12, 0, 0, TAU); fg.fill();
  // 글자에 맺힌 물방울
  fg.fillStyle = 'rgba(255,255,255,0.9)';
  fg.beginPath(); fg.arc(bx + size * 0.18, by - size * 0.35, size * 0.035, 0, TAU); fg.fill();
  fg.beginPath(); fg.arc(bx - size * 0.22, by - size * 0.18, size * 0.022, 0, TAU); fg.fill();
  g.drawImage(f, 0, 0);
  return { cv, ox: bx, oy: by, w: m.measureText(ch).width };
}

// ───────────────────────────── 플레이어 ─────────────────────────────
export function createJuicy(container, opts = {}) {
  const o = { autoplay: false, loop: false, rate: 1, respectReducedMotion: true, onEnd: null, onTime: null, ...opts };
  const doc = container.ownerDocument;
  if (![...doc.querySelectorAll('link')].some(l => l.href === FONT_URL)) {
    const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = FONT_URL; doc.head.appendChild(link);
  }
  const root = doc.createElement('div');
  root.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#FFF4E4';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', '감귤이 굴러와 터지며 "쥬씨~" 글자가 튀어나오는 15초 모션 그래픽');
  const cv = doc.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.style.cssText = 'display:block;width:100%;height:100%';
  root.appendChild(cv);
  container.appendChild(root);
  const ctx = cv.getContext('2d');
  let glyphs = null, sub = null;

  function render(t) {
    t = clamp(t, 0, DURATION);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 카메라: 감귤을 살짝 따라가고, 터질 때 펀치 줌 + 흔들림
    const tg = tangerine(Math.min(t, STOP));
    const follow = (1 - seg(t, 4.2, 5.0)) * 0.12;
    let camX = (tg.x - 960) * follow, camY = 0, zoom = lerp(1, 1.04, ease.sineInOut(seg(t, 0.25, 4.8)));
    zoom *= 1 + 0.07 * ease.expoOut(seg(t, BURST, BURST + 0.25)) * (1 - ease.sineInOut(seg(t, 6, 9.2)));
    const sh = shake(t, BURST, 22);
    camX += sh.x; camY += sh.y;
    for (const h of HITS) { const s2 = shake(t, h, 4 * tangerine(h).s); camX += s2.x; camY += s2.y; }
    ctx.setTransform(zoom, 0, 0, zoom, W / 2 - (W / 2 + camX) * zoom, H / 2 - (H / 2 + camY) * zoom);

    drawBackground(ctx, t);

    // ── 1. 감귤 굴러오기 ──
    if (t >= ENTER && t < BURST) {
      const r = R * tg.s;
      let sx = 1, sy = 1;
      for (const h of HITS) { const im = impact(t, h, 0.22, 9, 26); sx *= im.sx; sy *= im.sy; }
      const im2 = impact(t, STOP, 0.07, 6, 18); sx *= im2.sx; sy *= im2.sy;
      // 부르르 부풀기 (터지기 직전)
      const inflate = ease.quadIn(seg(t, 4.6, BURST));
      const jit = Math.sin(t * 90) * 0.018 * inflate;
      sx *= 1 + 0.15 * inflate + jit; sy *= 1 + 0.15 * inflate - jit;
      // 그림자
      const air = clamp(tg.lift / (420 * tg.s));
      ctx.fillStyle = `rgba(150,70,10,${0.22 * (1 - air * 0.7) * clamp((t - ENTER) * 4)})`;
      ctx.beginPath(); ctx.ellipse(tg.x, tg.ground, r * 1.05 * (1 - air * 0.4) * sx, r * 0.18 * (1 - air * 0.4), 0, 0, TAU); ctx.fill();
      // 몸통 (발이 바닥에 닿는 기준으로 찌그러짐)
      const cy = tg.ground - tg.lift - r * sy;
      drawTangerine(ctx, tg.x, cy, r, tg.angle, sx, sy, inflate);
      // 튈 때마다 물방울
      BOUNCE_DROPS.forEach((list, k) => {
        const h = HITS[k], tau = t - h;
        if (tau < 0 || tau > 0.6) return;
        const at = tangerine(h);
        for (const d of list) {
          const x = at.x + d.vx * tau * at.s, y = at.ground - 10 + (d.vy * tau + 0.5 * 1600 * tau * tau) * at.s;
          drop(ctx, x, y, d.r * at.s, d.vx, d.vy + 1600 * tau, 'rgba(210,240,255,0.9)', 1 - seg(tau, 0.35, 0.6));
        }
      });
    }

    // ── 2. 펑! 슬로모션 폭발 ──
    if (t >= BURST && t < 10.4) {
      const tp = physTime(t), G = 1500;
      const fade = 1 - seg(t, 9.6, 10.3);
      // 섬광과 충격파 링
      const fl = 1 - seg(t, BURST, BURST + 0.35);
      if (fl > 0) {
        const rg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 520);
        rg.addColorStop(0, `rgba(255,255,230,${0.95 * fl})`); rg.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = rg; ctx.fillRect(-200, -200, W + 400, H + 400);
      }
      const ring = seg(tp, 0, 0.5);
      if (ring < 1) { ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - ring)})`; ctx.lineWidth = 18 * (1 - ring) + 2; ctx.beginPath(); ctx.ellipse(CX, CY, 60 + ring * 900, (60 + ring * 900) * 0.8, 0, 0, TAU); ctx.stroke(); }
      // 가운데 과즙 덩어리: 크게 출렁였다가 줄기로 빠져나가며 작아진다
      const core = ease.expoOut(seg(tp, 0, 0.18)) * (1 - ease.quadIn(seg(tp, 0.25, 0.75)));
      if (core > 0.01) {
        ctx.globalAlpha = 0.95 * fade;
        ctx.beginPath();
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * TAU, rr = core * 230 * (1 + 0.13 * Math.sin(7 * a + tp * 14) + 0.07 * Math.sin(12 * a - tp * 20));
          const x = CX + Math.cos(a) * rr, y = CY + Math.sin(a) * rr * 0.9;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        const cg = ctx.createRadialGradient(CX - 60, CY - 70, 10, CX, CY, 260 * core + 1);
        cg.addColorStop(0, C.juiceHi); cg.addColorStop(0.6, C.juice); cg.addColorStop(1, C.juiceLo);
        ctx.fillStyle = cg; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(CX - 80 * core, CY - 95 * core, 70 * core, 26 * core, -0.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 과즙 줄기 (왕관처럼 뻗었다가 끊어짐)
      for (const a of ARMS) {
        const grow = ease.expoOut(seg(tp, 0, 0.32)), brk = seg(tp, 0.3, 0.7);
        const L = a.len * grow, base = L * brk;
        if (L - base < 4) continue;
        const ux = Math.cos(a.a), uy = Math.sin(a.a), px = -uy, py = ux;
        const sag = 0.5 * G * Math.max(0, tp - 0.15) ** 2 * 0.6;
        const P = d => ({ x: CX + ux * d, y: CY + uy * d + sag * (d / a.len) });
        const p0 = P(base), p1 = P(L), wid = a.w * (1 - brk * 0.6) * (1 + 0.12 * Math.sin(tp * 18 + a.ph));
        ctx.fillStyle = C.juice; ctx.globalAlpha = 0.92 * fade;
        ctx.beginPath();
        ctx.moveTo(p0.x + px * wid * 0.5, p0.y + py * wid * 0.5);
        ctx.quadraticCurveTo((p0.x + p1.x) / 2 + px * wid * 0.32, (p0.y + p1.y) / 2 + py * wid * 0.32, p1.x + px * wid * 0.2, p1.y + py * wid * 0.2);
        ctx.lineTo(p1.x - px * wid * 0.2, p1.y - py * wid * 0.2);
        ctx.quadraticCurveTo((p0.x + p1.x) / 2 - px * wid * 0.32, (p0.y + p1.y) / 2 - py * wid * 0.32, p0.x - px * wid * 0.5, p0.y - py * wid * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(p1.x, p1.y, wid * 0.36, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,190,0.7)'; ctx.beginPath(); ctx.arc(p1.x - wid * 0.1, p1.y - wid * 0.12, wid * 0.11, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 껍질 조각
      for (const s of SHARDS) {
        const x = CX + s.vx * tp, y = CY + s.vy * tp + 0.5 * G * tp * tp;
        ctx.save(); ctx.translate(x, y); ctx.rotate(s.a + s.spin * tp); ctx.globalAlpha = fade;
        ctx.fillStyle = C.peel;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.62, -s.w, s.w); ctx.arc(0, 0, R * 0.48, s.w, -s.w, true); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.cream; ctx.beginPath(); ctx.arc(0, 0, R * 0.5, -s.w, s.w); ctx.arc(0, 0, R * 0.47, s.w, -s.w, true); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // 귤 알갱이
      for (const p of PULP) {
        const x = CX + p.vx * tp, y = CY + p.vy * tp + 0.5 * G * tp * tp;
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.a0 + p.spin * tp); ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = C.pulp;
        ctx.beginPath(); ctx.ellipse(0, 0, p.len * 0.5, p.len * 0.17, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-p.len * 0.12, -p.len * 0.04, p.len * 0.16, p.len * 0.05, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // 과즙 방울
      for (const d of DROPS) {
        const x = CX + d.vx * tp, y = CY + d.vy * tp + 0.5 * G * tp * tp;
        if (x < -100 || x > W + 100 || y > H + 100) continue;
        drop(ctx, x, y, d.r, d.vx * (t < 8.2 ? SLOW : 1), (d.vy + G * tp) * (t < 8.2 ? SLOW : 1), d.hi > 0.5 ? C.juice : C.juiceHi, 0.92 * fade);
      }
      // 비타민 반짝이
      for (const s of SPARKS) {
        const x = CX + s.vx * tp, y = CY + s.vy * tp + 0.5 * 300 * tp * tp;
        const tw = 0.6 + 0.4 * Math.sin(t * 9 + s.ph);
        ctx.globalAlpha = tw * fade * (1 - seg(tp, 1.2, 2.2));
        const sg = ctx.createRadialGradient(x, y, 0, x, y, s.r * 3);
        sg.addColorStop(0, 'rgba(255,255,220,1)'); sg.addColorStop(0.35, 'rgba(255,230,120,0.8)'); sg.addColorStop(1, 'rgba(255,220,100,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, s.r * 3, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ── 3. 주황 과즙 파동 ──
    if (t >= 9.0) {
      const k = ease.expoOut(seg(t, 9.0, 10.0));
      const rad = k * 1400;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * TAU;
        const rr = rad * (1 + 0.06 * Math.sin(5 * a + t * 3) * (1 - k * 0.6) + 0.035 * Math.sin(9 * a - t * 5));
        const x = CX + Math.cos(a) * rr, y = CY + Math.sin(a) * rr * 0.92;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      const bg = ctx.createRadialGradient(CX, CY - 120, 50, CX, CY, 1300);
      bg.addColorStop(0, '#FFB548'); bg.addColorStop(0.55, '#FF9622'); bg.addColorStop(1, '#F57A00');
      ctx.fillStyle = bg; ctx.fill();
      // 일렁이는 빛 무늬
      ctx.save(); ctx.clip();
      for (let b = 0; b < 4; b++) {
        ctx.strokeStyle = `rgba(255,236,170,${0.16 - b * 0.03})`; ctx.lineWidth = 46 - b * 8;
        ctx.beginPath();
        for (let x = -100; x <= W + 100; x += 40) {
          const y = 760 + b * 90 + Math.sin(x * 0.006 + t * (1.4 + b * 0.3) + b) * 26;
          x === -100 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // 탄산 거품
      for (const bb of BUBBLES) {
        const age = t - 9.4; if (age < 0) break;
        const y = H + 60 - ((age * bb.v + bb.ph * 1300) % 1300);
        const x = bb.x + Math.sin(age * bb.f * TAU / 2 + bb.ph * 6) * bb.wob;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, bb.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - bb.r * 0.35, y - bb.r * 0.35, bb.r * 0.25, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // 파동 링
      for (const [t0, lw] of [[9.15, 16], [9.4, 12], [9.7, 9], [10.15, 14], [10.4, 8]]) {
        const u = seg(t, t0, t0 + 1.4); if (u <= 0 || u >= 1) continue;
        const rr = 40 + ease.cubicOut(u) * 1250;
        ctx.strokeStyle = `rgba(255,232,170,${0.75 * (1 - u)})`; ctx.lineWidth = lw * (1 - u * 0.6);
        ctx.beginPath(); ctx.ellipse(CX, CY - 60, rr, rr * 0.82, 0, 0, TAU); ctx.stroke();
      }
    }

    // ── 4. "쥬씨~" + JUICY~ ──
    if (t >= 9.95 && glyphs) {
      const TY = 560; // 글자 기준선
      const total = glyphs.reduce((s, g) => s + g.w, 0) + 30 * (glyphs.length - 1);
      let x = 960 - total / 2;
      glyphs.forEach((g, i) => {
        const t0 = 10.0 + i * 0.25;
        const k = spring(t - t0, 0.38, 16);
        const im = impact(t, t0 + 0.16, 0.22, 6, 20);
        const idle = t > 12.4 ? Math.sin((t - 12.4) * 3.2 + i * 1.3) * 0.02 : 0; // 마무리 홀드에서 젤리처럼 살랑
        const cxg = x + g.w / 2;
        x += g.w + 30;
        if (t < t0) return;
        ctx.save();
        ctx.translate(cxg, TY + (1 - clamp(k, 0, 1.2)) * 120);
        ctx.rotate((1 - clamp(k)) * (i % 2 ? 0.25 : -0.25) + idle * 0.5);
        ctx.scale(k * im.sx * (1 + idle), k * im.sy * (1 - idle));
        ctx.drawImage(g.cv, -g.ox, -g.oy);
        ctx.restore();
      });
      // 글자에서 떨어지는 물방울
      DRIPS.forEach(([t0, gx]) => {
        const tau = t - t0; if (tau < 0 || tau > 1.2) return;
        const xx = 960 - total / 2 + gx * (total / 2.2) + 40;
        const grow = seg(tau, 0, 0.45), fall = Math.max(0, tau - 0.45);
        const y = TY + 34 + grow * 14 + 0.5 * 2200 * fall * fall;
        ctx.fillStyle = 'rgba(255,250,230,0.95)';
        ctx.beginPath(); ctx.ellipse(xx, y, 9 + grow * 4, 11 + grow * 6 + fall * 30, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(xx - 3, y - 5, 3, 0, TAU); ctx.fill();
      });
      // JUICY~
      if (sub) {
        const t0 = 11.2, k = spring(t - t0, 0.55, 14);
        if (t >= t0) {
          ctx.save(); ctx.globalAlpha = clamp((t - t0) * 5);
          ctx.translate(960, 760 + (1 - clamp(k)) * 50); ctx.scale(k, k);
          ctx.drawImage(sub.cv, -sub.ox, -sub.oy);
          ctx.restore();
        }
      }
    }
  }

  // ── 재생 ──
  let time = 0, playing = false, raf = 0, last = 0, rate = o.rate, loop = o.loop;
  const listeners = { end: new Set(), time: new Set(), play: new Set(), pause: new Set(), say: new Set() };
  if (o.onEnd) listeners.end.add(o.onEnd);
  if (o.onTime) listeners.time.add(o.onTime);
  const emit = (n, v) => listeners[n].forEach(fn => { try { fn(v); } catch (e) { console.error(e); } });
  function frame(now) {
    if (!playing) return;
    time += ((now - last) / 1000) * rate; last = now;
    if (time >= DURATION) {
      if (loop) time %= DURATION;
      else { time = DURATION; playing = false; render(time); emit('time', time); emit('end'); emit('pause'); return; }
    }
    render(time); emit('time', time);
    raf = requestAnimationFrame(frame);
  }
  const api = {
    element: root, duration: DURATION, beats: BEATS,
    get time() { return time; }, get playing() { return playing; },
    get rate() { return rate; }, set rate(v) { rate = v; },
    get loop() { return loop; }, set loop(v) { loop = !!v; },
    play() { if (playing) return; if (time >= DURATION) time = 0; playing = true; last = performance.now(); raf = requestAnimationFrame(frame); emit('play'); },
    pause() { if (!playing) return; playing = false; cancelAnimationFrame(raf); emit('pause'); },
    toggle() { playing ? api.pause() : api.play(); },
    seek(t) { time = clamp(t, 0, DURATION); render(time); emit('time', time); },
    render,
    on(name, fn) { listeners[name].add(fn); return () => listeners[name].delete(fn); },
    destroy() { api.pause(); root.remove(); },
    ready: null,
  };
  render(0);
  const fontReady = doc.fonts && doc.fonts.load
    ? Promise.race([doc.fonts.load(`300px 'Jua'`, '쥬씨~JUICY').then(() => doc.fonts.ready), new Promise(r => setTimeout(r, 3000))])
    : Promise.resolve();
  api.ready = fontReady.then(() => {
    glyphs = [...'쥬씨~'].map(ch => makeGlyph(doc, ch, 330));
    sub = makeGlyph(doc, 'JUICY~', 120);
    const reduce = o.respectReducedMotion && typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) api.seek(13);
    else { api.seek(time); if (o.autoplay) api.play(); }
    return api;
  });
  return api;
}

export const createReel = createJuicy;
