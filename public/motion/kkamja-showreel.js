// 깜자 쇼릴 — 12초 모션 그래픽 (의존성 없는 ES 모듈)
//
// 모든 장면은 시간 t(초)에 대한 순수 함수다. seek(t)를 두 번 불러도 같은 그림이 나오므로
// 웹앱에서 실시간으로 재생해도, 프레임 단위로 MP4를 뽑아도 결과가 같다.
//
// 웹앱에서 쓰는 법 (둘 중 하나):
//   1) 태그:  <script type="module" src="/motion/kkamja-showreel.js"></script>
//             <kkamja-showreel autoplay loop></kkamja-showreel>
//   2) 코드:  import { createKkamjaShowreel } from '/motion/kkamja-showreel.js';
//             const reel = createKkamjaShowreel(el, { autoplay: true, onSay: () => speak('이지 면접') });
//
// 자세한 설명: public/motion/README.md

// 원래 15초 타임라인(SRC)에서 START초부터 잘라 쓴다. 앞부분(점, MOTION DESIGN, 하드컷)은 쓰지 않는다.
// 장면 함수들은 모두 원래 시간(SRC)으로 적혀 있고, 바깥에 보이는 시간은 0초부터 시작한다.
export const START = 3;
const SRC_END = 15;
export const DURATION = SRC_END - START; // 12초
export const FPS = 30;
const SRC_SAY = 8.75;
export const SAY_AT = SRC_SAY - START; // 깜자가 "easy 면접"이라고 말하는 순간 (5.75초)

// 미리보기 타임라인에 표시되는 비트 (시작 시간, 이름) — 바깥 시간
const SRC_BEATS = [
  { t: 0.0, name: '정적 · 점 하나' },
  { t: 0.6, name: '점 → MOTION의 O' },
  { t: 1.25, name: 'DESIGN 마스크 업' },
  { t: 2.4, name: '하드컷 4번' },
  { t: 3.0, name: 'TIMING 판 → 공 (아이리스)' },
  { t: 3.35, name: '바운스 (스쿼시 & 스트레치)' },
  { t: 5.15, name: '공 → 타임라인 트랙' },
  { t: 5.6, name: 'EASY 글자 드롭' },
  { t: 7.1, name: '슈우욱 — 깜자 등장' },
  { t: 8.08, name: '착지 (스쿼시 + 셰이크)' },
  { t: 8.7, name: '말풍선 "easy 면접"' },
  { t: 9.6, name: '정지 홀드' },
  { t: 12.6, name: '로고로 모이기' },
  { t: 13.6, name: '엔드 카드' },
];
export const BEATS = SRC_BEATS.filter(b => b.t >= START).map(b => ({ t: +(b.t - START).toFixed(3), name: b.name }));

// ───────────────────────────── 움직임 함수 ─────────────────────────────
const W = 1920, H = 1080, GROUND = 840;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = {
  quadIn: u => u * u,
  cubicIn: u => u * u * u,
  cubicInOut: u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  quintOut: u => 1 - Math.pow(1 - u, 5),
  expoOut: u => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  expoIn: u => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10)),
  expoInOut: u => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2),
  sineInOut: u => -(Math.cos(Math.PI * u) - 1) / 2,
};
const tw = (t, a, b, curve = ease.expoOut) => curve(seg(t, a, b));
// 감쇠 스프링: 0 → 1, 살짝 넘쳤다가 자리 잡음
function spring(tau, zeta = 0.55, omega = 18) {
  if (tau <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * tau) * (Math.cos(wd * tau) + (zeta * omega / wd) * Math.sin(wd * tau));
}
// 부딪힌 뒤의 찌그러짐 (가로로 퍼지고 세로로 눌림 → 출렁이며 복귀)
function impact(t, tHit, amt = 0.2, decay = 7, omega = 22) {
  const tau = t - tHit;
  if (tau < 0) return { sx: 1, sy: 1 };
  const k = Math.exp(-decay * tau) * Math.cos(omega * tau) * amt;
  return { sx: 1 + k, sy: 1 - k };
}
function shake(t, tHit, amp = 16) {
  const tau = t - tHit;
  if (tau < 0 || tau > 0.8) return { x: 0, y: 0 };
  const d = Math.exp(-9 * tau) * amp;
  return { x: d * Math.sin(2 * Math.PI * 13 * tau + 0.7), y: d * 0.8 * Math.sin(2 * Math.PI * 17 * tau + 2.1) };
}
const hopY = (u, h) => -4 * h * u * (1 - u); // 포물선 점프

// ───────────────────────────── 공 (바운스) 경로 ─────────────────────────────
const BALL_R = 70;
const HOPS = [ // [시작, 끝, 시작 x, 끝 x, 높이]
  [3.6, 4.15, 960, 1300, 260],
  [4.15, 4.75, 1300, 680, 320],
  [4.75, 5.15, 680, 960, 140],
];
const HITS = [3.6, 4.15, 4.75, 5.15];
function ballCenter(t) {
  const floorY = GROUND - BALL_R;
  if (t < 3.35) return { x: 960, y: 540 };
  if (t < 3.6) return { x: 960, y: lerp(540, floorY, ease.quadIn(seg(t, 3.35, 3.6))) };
  for (const [a, b, x0, x1, h] of HOPS) {
    if (t < b) { const u = seg(t, a, b); return { x: lerp(x0, x1, u), y: floorY + hopY(u, h) }; }
  }
  return { x: 960, y: floorY };
}

// ───────────────────────────── 깜자 비행 경로 ─────────────────────────────
const KK = { w: 475, h: 520, footY: 440, x: 700 }; // footY: 그림 위쪽에서 발바닥까지 (px)
const FLY = { t0: 7.45, t1: 7.95, land: 8.08 };
function kkamjaFoot(t) { // 발 위치 (무대 좌표)
  const P0 = { x: 2350, y: -260 }, P1 = { x: 1560, y: 260 }, P2 = { x: KK.x, y: GROUND - 70 };
  if (t < FLY.t1) {
    const u = ease.quintOut(seg(t, FLY.t0, FLY.t1)), v = 1 - u;
    return { x: v * v * P0.x + 2 * v * u * P1.x + u * u * P2.x, y: v * v * P0.y + 2 * v * u * P1.y + u * u * P2.y };
  }
  return { x: KK.x, y: lerp(GROUND - 70, GROUND, ease.quadIn(seg(t, FLY.t1, FLY.land))) };
}
const KNOCK = [7.8, 7.74, 7.68, 7.62]; // E A S Y — 오른쪽 글자부터 맞는다
const KNOCK_V = [[-760, -900, -520], [-520, -1200, 380], [-300, -1000, -640], [-120, -760, 720]]; // vx, vy, 회전(도/초)

// ───────────────────────────── 화면 구성 ─────────────────────────────
const C = { cream: '#FFF6E6', ink: '#16233F', potato: '#F3BA4A', potatoSoft: '#F8D58C', olive: '#8C9A55', white: '#FFFFFF' };
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Noto+Sans+KR:wght@700;900&display=swap';
const DISPLAY = "'Space Grotesk', 'Noto Sans KR', system-ui, sans-serif";
const KR = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const CSS = `
.ksr{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:${C.cream};contain:layout paint;user-select:none;-webkit-user-select:none}
.ksr *{box-sizing:border-box}
.ksr-stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;overflow:hidden;background:${C.cream}}
.ksr-world,.ksr-hud,.ksr-plates{position:absolute;inset:0}
.ksr-abs{position:absolute;left:0;top:0;will-change:transform,opacity}
.ksr-grid{position:absolute;left:-200px;top:-200px;width:${W + 400}px;height:${H + 400}px;background-image:radial-gradient(${C.ink}22 1.6px,transparent 1.8px);background-size:48px 48px}
.ksr-word{position:absolute;left:0;width:${W}px;display:flex;justify-content:center;font-family:${DISPLAY};font-weight:700;color:${C.ink};letter-spacing:-0.02em;line-height:1}
.ksr-word span{display:inline-block;will-change:transform,opacity}
.ksr-mask{overflow:hidden;padding:0 0 .08em}
.ksr-ring{display:inline-block;border-radius:50%;border:solid ${C.ink}}
.ksr-plate{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:${DISPLAY};font-weight:700;font-size:300px;letter-spacing:-0.03em;line-height:1}
.ksr-ball{width:${BALL_R * 2}px;height:${BALL_R * 2}px;border-radius:${BALL_R}px;background:${C.potato}}
.ksr-kk img{width:100%;height:100%;object-fit:contain;display:block;pointer-events:none}
.ksr-bubble{background:${C.white};border:7px solid ${C.ink};border-radius:72px;padding:46px 74px 54px;display:flex;align-items:baseline;gap:34px;white-space:nowrap;box-shadow:0 18px 0 ${C.ink}14}
.ksr-bubble .en{font-family:${DISPLAY};font-weight:700;font-size:132px;color:${C.ink};letter-spacing:-0.03em;line-height:1}
.ksr-bubble .kr{font-family:${KR};font-weight:900;font-size:132px;color:${C.ink};line-height:1;position:relative}
.ksr-bubble span span{display:inline-block}
.ksr-hud{font-family:${MONO};font-size:22px;letter-spacing:.06em;color:${C.ink};pointer-events:none}
.ksr-hud .tl,.ksr-hud .tr,.ksr-hud .bl,.ksr-hud .br{position:absolute}
.ksr-hud .tl{left:72px;top:58px}.ksr-hud .tr{right:72px;top:58px}.ksr-hud .bl{left:72px;bottom:54px}.ksr-hud .br{right:72px;bottom:54px;font-variant-numeric:tabular-nums}
.ksr-rec{display:inline-block;width:14px;height:14px;border-radius:50%;background:#E0483B;margin-right:12px;vertical-align:1px}
.ksr-lock{position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:flex;align-items:center;justify-content:center;gap:44px}
.ksr-lock .mark{width:220px;height:200px;flex:none}
.ksr-lock .mark img{width:100%;height:100%;object-fit:contain}
.ksr-lock .name{font-family:${KR};font-weight:900;font-size:150px;color:${C.ink};letter-spacing:-0.04em;line-height:1.1;white-space:nowrap}
.ksr-lock .name span{display:inline-block}
.ksr-lock .tag{font-family:${DISPLAY};font-weight:500;font-size:34px;color:${C.ink};opacity:.7;margin-top:10px;letter-spacing:.01em}
`;

const corner = (x, y, sx, sy) => `<path d="M${x} ${y + sy * 40}V${y}H${x + sx * 40}" fill="none" stroke="${C.ink}" stroke-width="3" opacity=".45"/>`;

function template(base) {
  const letters = (s, cls = '') => [...s].map(ch => `<span class="${cls}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  return `
<div class="ksr-stage" data-r="stage">
  <div class="ksr-world" data-r="world">
    <div class="ksr-grid" data-r="grid"></div>
    <div class="ksr-abs" data-r="dot" style="width:40px;height:40px;border-radius:20px;background:${C.ink}"></div>
    <div class="ksr-word" data-r="motion" style="top:300px;font-size:230px">${letters('M')}<span data-r="ring" class="ksr-ring" style="width:.74em;height:.74em;border-width:.105em;margin:0 .03em;vertical-align:-.005em"></span>${letters('TION')}</div>
    <div class="ksr-word ksr-mask" data-r="design" style="top:540px;font-size:230px">${letters('DESIGN')}</div>
    <svg class="ksr-abs" data-r="trailSvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">
      <polyline data-r="trail" fill="none" stroke="${C.ink}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round" opacity=".5"/>
      <g data-r="keys"></g>
    </svg>
    <div class="ksr-abs" data-r="ground" style="width:1600px;height:5px;border-radius:3px;background:${C.ink};left:160px;top:${GROUND}px;transform-origin:50% 50%"></div>
    <div class="ksr-abs" data-r="shadow" style="width:300px;height:34px;border-radius:50%;background:${C.ink};opacity:0"></div>
    <div class="ksr-abs" data-r="ripple" style="width:300px;height:60px;border-radius:50%;border:4px solid ${C.ink};opacity:0"></div>
    <div class="ksr-abs ksr-ball" data-r="ball"></div>
    <div class="ksr-word" data-r="easy" style="top:400px;font-size:300px">${letters('EASY', 'el')}</div>
    <div data-r="dias"></div>
    <svg class="ksr-abs" data-r="speed" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible"></svg>
    <div class="ksr-abs ksr-kk" data-r="ghost3" style="width:${KK.w}px;height:${KK.h}px"><img alt="" src="${base}kkamja-consultant.png"></div>
    <div class="ksr-abs ksr-kk" data-r="ghost2" style="width:${KK.w}px;height:${KK.h}px"><img alt="" src="${base}kkamja-consultant.png"></div>
    <div class="ksr-abs ksr-kk" data-r="ghost1" style="width:${KK.w}px;height:${KK.h}px"><img alt="" src="${base}kkamja-consultant.png"></div>
    <div class="ksr-abs ksr-kk" data-r="kk" style="width:${KK.w}px;height:${KK.h}px"><img alt="깜자" src="${base}kkamja-consultant.png"></div>
    <div class="ksr-abs" data-r="bubbleWrap" style="left:1000px;top:270px">
      <div class="ksr-bubble" data-r="bubble">
        <span class="en">${letters('easy', 'b')}</span>
        <span class="kr">${letters('면접', 'b')}<svg data-r="underline" width="290" height="40" viewBox="0 0 290 40" style="position:absolute;left:-8px;bottom:-18px;overflow:visible"><path d="M6 26 C 80 12, 190 10, 284 22" fill="none" stroke="${C.potato}" stroke-width="16" stroke-linecap="round"/></svg></span>
      </div>
      <svg data-r="tail" width="120" height="110" viewBox="0 0 120 110" style="position:absolute;left:-74px;top:200px;overflow:visible">
        <path d="M118 6 L4 96 L114 64" fill="${C.white}" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round"/>
        <rect x="108" y="0" width="22" height="70" fill="${C.white}"/>
      </svg>
    </div>
    <div class="ksr-lock" data-r="lock">
      <div class="mark" data-r="markSlot"><img data-r="mark" alt="" src="${base}kkamja-logo.png"></div>
      <div><div class="name" data-r="name">${letters('쉬었음 깜자')}</div><div class="tag" data-r="tag">easy 면접, 깜자랑 같이.</div></div>
    </div>
  </div>
  <div class="ksr-plates" data-r="plates">
    <div class="ksr-plate" style="background:${C.ink};color:${C.cream}">TYPE</div>
    <div class="ksr-plate" style="background:${C.olive};color:${C.cream}">EASE</div>
    <div class="ksr-plate" style="background:${C.cream};color:${C.ink}">SPRING</div>
    <div class="ksr-plate" data-r="lastPlate" style="background:${C.potato};color:${C.ink}"><span data-r="lastWord">TIMING</span></div>
  </div>
  <div class="ksr-hud" data-r="hud">
    <svg class="ksr-abs" width="${W}" height="${H}">${corner(40, 40, 1, 1)}${corner(W - 40, 40, -1, 1)}${corner(40, H - 40, 1, -1)}${corner(W - 40, H - 40, -1, -1)}</svg>
    <div class="tl">KKAMJA · MOTION REEL ’26</div>
    <div class="tr"><span class="ksr-rec" data-r="rec"></span><span data-r="recLabel">REC</span></div>
    <div class="bl" data-r="hudBeat">01 / INTRO</div>
    <div class="br" data-r="tc">00:00:00</div>
  </div>
</div>`;
}

const HUD_LABELS = [ // 원래 시간 기준
  [0, '01 / PHYSICS'], [5.15, '02 / TITLE'], [7.1, '03 / ENTRANCE'], [8.7, '04 / DIALOGUE'], [12.6, '05 / LOCKUP'],
];

let cssInjected = false;
function injectAssets(doc) {
  if (cssInjected) return;
  cssInjected = true;
  if (![...doc.querySelectorAll('link')].some(l => l.href.includes('Space+Grotesk:wght@500;700&family=Noto+Sans+KR'))) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    doc.head.appendChild(link);
  }
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
}

// ───────────────────────────── 플레이어 ─────────────────────────────
export function createKkamjaShowreel(container, opts = {}) {
  const o = {
    autoplay: false, loop: false, hud: true, rate: 1,
    assetBase: '/images/', respectReducedMotion: true,
    onSay: null, onEnd: null, onTime: null, ...opts,
  };
  if (!o.assetBase.endsWith('/')) o.assetBase += '/';
  const doc = container.ownerDocument;
  injectAssets(doc);

  const root = doc.createElement('div');
  root.className = 'ksr';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', '깜자가 날아와 "easy 면접"이라고 말하는 12초 모션 그래픽');
  root.innerHTML = template(o.assetBase);
  container.appendChild(root);
  const R = {};
  root.querySelectorAll('[data-r]').forEach(el => { R[el.dataset.r] = el; });
  R.hud.style.display = o.hud ? '' : 'none';
  const motionLetters = [...R.motion.children], designLetters = [...R.design.children];
  const easyLetters = [...R.easy.children], plates = [...R.plates.children];
  const enB = [...R.bubble.querySelectorAll('.en .b')], krB = [...R.bubble.querySelectorAll('.kr .b')];
  const nameLetters = [...R.name.children];
  const ghosts = [R.ghost1, R.ghost2, R.ghost3];

  // 키프레임 마름모 (공이 닿은 자리, 글자 아래)
  R.keys.innerHTML = HITS.map((h, i) => `<rect data-i="${i}" width="18" height="18" fill="${C.ink}" transform="rotate(45)" />`).join('');
  const keyEls = [...R.keys.children];
  R.dias.innerHTML = easyLetters.map(() => `<div class="ksr-abs" style="width:22px;height:22px;background:${C.ink};border-radius:3px"></div>`).join('');
  const diaEls = [...R.dias.children];
  // 속도선
  const SPEED = [[-40, 0.0, 1.0], [70, 0.04, 0.8], [150, 0.02, 0.9], [-130, 0.07, 0.7], [230, 0.09, 0.6], [-220, 0.05, 0.75]];
  R.speed.innerHTML = SPEED.map(() => `<line stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>`).join('');
  const speedEls = [...R.speed.children];

  // 글자 위치 측정 (폰트가 준비된 뒤) — transform은 offset 값에 영향을 주지 않는다
  const M = { ring: { x: 960, y: 420, d: 170 }, easy: [], mark: { x: 690, y: 540, w: 220 } };
  const offsetIn = (el, stop) => { let x = 0, y = 0, n = el; while (n && n !== stop) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y }; };
  function measure() {
    const r = offsetIn(R.ring, R.stage);
    M.ring = { x: r.x + R.ring.offsetWidth / 2, y: r.y + R.ring.offsetHeight / 2, d: R.ring.offsetWidth };
    M.easy = easyLetters.map(el => { const p = offsetIn(el, R.stage); return { x: p.x + el.offsetWidth / 2, base: p.y + el.offsetHeight * 0.86 }; });
    const m = offsetIn(R.markSlot, R.stage);
    M.mark = { x: m.x + R.markSlot.offsetWidth / 2, y: m.y + R.markSlot.offsetHeight / 2, w: R.markSlot.offsetWidth };
  }

  const tf = (el, x, y, s = 1, r = 0, sx = 1, sy = 1) => { el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s * sx},${s * sy})`; };
  const show = (el, op) => { el.style.opacity = op; el.style.visibility = op <= 0.001 ? 'hidden' : 'visible'; };

  function kkamjaPose(t) {
    const f = kkamjaFoot(t);
    const u = seg(t, FLY.t0, FLY.t1);
    const spin = -360 * (1 - ease.expoOut(u)) - 18 * (1 - ease.sineInOut(seg(t, FLY.t1, FLY.land))) * (t > FLY.t1 ? 1 : 0);
    const s = lerp(0.42, 1, ease.expoOut(u));
    const im = impact(t, FLY.land, 0.22, 7, 20);
    let sx = im.sx, sy = im.sy;
    if (t > SRC_SAY && t < 9.6) { const k = 0.018 * Math.sin(2 * Math.PI * 7 * (t - SRC_SAY)) * (1 - seg(t, 9.2, 9.6)); sy *= 1 + k; sx *= 1 - k * 0.5; } // 말하는 들썩임
    if (t >= 9.6) { const k = 0.006 * Math.sin(2 * Math.PI * 0.55 * (t - 9.6)); sy *= 1 + k; } // 숨쉬기
    return { x: f.x, y: f.y, s, r: spin, sx, sy };
  }
  function placeKK(el, p) {
    el.style.transformOrigin = `50% ${(KK.footY / KK.h) * 100}%`;
    tf(el, p.x - KK.w / 2, p.y - KK.footY, p.s, p.r, p.sx, p.sy);
  }

  // 바깥 시간 → 원래 시간
  function render(t) { renderSrc(clamp(t, 0, DURATION) + START); }
  function renderSrc(t) {
    t = clamp(t, 0, SRC_END);
    // ── 카메라 ──
    let camX = 0, camY = 0, camS = 1;
    camS *= lerp(1, 1.05, tw(t, 0.6, 2.4, ease.sineInOut));
    if (t > 3.35 && t < 5.7) { const lag = ballCenter(t - 0.12).x - 960; camX = -lag * 0.32 * (1 - seg(t, 5.15, 5.6)); }
    camS *= lerp(1, 1.035, tw(t, 9.6, 12.6, ease.sineInOut)) / lerp(1, 1.035, tw(t, 12.6, 13.4, ease.cubicInOut));
    const sh = shake(t, FLY.land, 18), sh2 = shake(t, 3.6, 5), sh3 = shake(t, 4.15, 5);
    camX += sh.x + sh2.x + sh3.x; camY += sh.y + sh2.y + sh3.y;
    R.world.style.transformOrigin = '960px 540px';
    R.world.style.transform = `translate(${camX}px,${camY}px) scale(${camS})`;
    R.grid.style.transform = `translate(${-camX * 0.4}px,${-camY * 0.4}px)`;

    // ── 1. 점 → MOTION의 O ──
    const dotIn = spring(t - 0.12, 0.5, 16);
    const grow = tw(t, 0.6, 0.95, ease.expoInOut);
    const dotX = 960, dotY = 540;
    const dx = lerp(dotX, M.ring.x, tw(t, 0.6, 0.9, ease.expoInOut)), dy = lerp(dotY, M.ring.y, tw(t, 0.6, 0.9, ease.expoInOut));
    const dd = lerp(40, M.ring.d, grow);
    R.dot.style.width = R.dot.style.height = `${dd}px`;
    R.dot.style.borderRadius = `${dd / 2}px`;
    tf(R.dot, dx - dd / 2, dy - dd / 2, dotIn);
    show(R.dot, t < 0.95 ? 1 : 0);
    show(R.ring, t >= 0.95 ? 1 : 0);
    const out1 = tw(t, 2.2, 2.4, ease.expoIn);
    motionLetters.forEach((el, i) => {
      if (el === R.ring) { tf(el, 0, -out1 * 160); return; }
      const order = i < 1 ? 0 : i - 1; // M, T, I, O, N
      const tau = t - (0.78 + order * 0.06);
      const k = spring(tau, 0.48, 22);
      const im = impact(t, 0.78 + order * 0.06 + 0.09, 0.12, 9, 26);
      el.style.transformOrigin = '50% 90%';
      tf(el, 0, (1 - k) * -120 - out1 * 160, 1, 0, im.sx, im.sy);
      show(el, clamp(tau * 8) * (1 - out1));
    });
    show(R.motion, t < 2.4 ? 1 : 0);
    designLetters.forEach((el, i) => {
      const k = spring(t - (1.25 + i * 0.05), 0.62, 17);
      tf(el, 0, (1 - k) * 260 + out1 * 220);
    });
    show(R.design, t > 1.2 && t < 2.4 ? 1 : 0);

    // ── 2. 하드컷 4번 → 아이리스 ──
    const cuts = [2.4, 2.55, 2.7, 2.85];
    plates.forEach((p, i) => {
      const on = t >= cuts[i] && (i === 3 ? t < 3.36 : t < cuts[i + 1]);
      p.style.display = on ? 'flex' : 'none';
      if (on && i < 3) p.firstChild.textContent && (p.style.transform = `scale(${lerp(1.08, 1, tw(t, cuts[i], cuts[i] + 0.12))})`);
    });
    if (t >= 2.85 && t < 3.36) {
      const k = tw(t, 2.95, 3.35, ease.expoInOut);
      const r = lerp(1200, BALL_R, k);
      R.lastPlate.style.clipPath = `circle(${r}px at 960px 540px)`;
      R.lastWord.style.display = 'inline-block';
      R.lastWord.style.transform = `scale(${lerp(lerp(1.08, 1, tw(t, 2.85, 2.97)), 0.15, k)})`;
      R.lastWord.style.opacity = 1 - seg(t, 3.1, 3.3);
    }

    // ── 3. 공 바운스 ──
    const ballOn = t >= 3.34 && t < 5.5;
    show(R.ball, ballOn ? 1 : 0);
    show(R.ground, t >= 3.2 && t < 13.1 ? 1 : 0);
    R.ground.style.transform = `scaleX(${tw(t, 3.2, 3.6, ease.expoOut) * (1 - tw(t, 12.7, 13.1, ease.expoIn))})`;
    if (ballOn) {
      const c = ballCenter(t);
      let sx = 1, sy = 1;
      // 날 때는 속도 방향으로 늘어나고, 닿으면 납작해진다
      const c2 = ballCenter(t + 1 / 120), vy = (c2.y - c.y) * 120;
      const nearHit = Math.min(...HITS.map(h => Math.abs(t - h)));
      const st = clamp(Math.abs(vy) * 0.00022, 0, 0.28) * seg(nearHit, 0.02, 0.09); // 닿는 순간엔 늘이지 않는다
      sy = 1 + st; sx = 1 / (1 + st);
      for (const h of HITS) { const im = impact(t, h, 0.32, 10, 26); sx *= im.sx; sy *= im.sy; }
      // 트랙으로 변신
      const m = tw(t, 5.15, 5.5, ease.expoInOut);
      const w = lerp(BALL_R * 2 * sx, 980, m), hgt = lerp(BALL_R * 2 * sy, 16, m);
      const cy = lerp(c.y + BALL_R * (1 - sy), 760, m);
      R.ball.style.width = `${w}px`; R.ball.style.height = `${hgt}px`;
      R.ball.style.borderRadius = `${Math.min(w, hgt) / 2}px`;
      R.ball.style.background = m > 0.5 ? C.ink : C.potato;
      tf(R.ball, c.x - w / 2, cy - hgt / 2);
    }
    // 궤적 (점선) + 키프레임
    const trailOn = t > 3.35 && t < 5.6;
    show(R.trailSvg, trailOn ? 1 - seg(t, 5.2, 5.6) : 0);
    if (trailOn) {
      const pts = [];
      for (let s = 3.35; s <= Math.min(t, 5.15); s += 1 / 60) { const c = ballCenter(s); pts.push(`${c.x.toFixed(1)},${c.y.toFixed(1)}`); }
      R.trail.setAttribute('points', pts.join(' '));
      keyEls.forEach((k, i) => {
        const h = HITS[i], c = ballCenter(h), sp = spring(t - h, 0.5, 20);
        k.setAttribute('transform', `translate(${c.x} ${GROUND + 34}) rotate(45) scale(${sp}) translate(-9 -9)`);
      });
    }

    // ── 4. 트랙 + EASY 글자 ──
    const trackOn = t >= 5.5 && t < 8.1;
    // 트랙은 공이 변한 그 막대를 이어서 쓴다
    if (trackOn) {
      show(R.ball, 1);
      const knock = tw(t, 7.85, 8.05, ease.expoIn);
      R.ball.style.width = '980px'; R.ball.style.height = '16px'; R.ball.style.borderRadius = '8px'; R.ball.style.background = C.ink;
      R.ball.style.transformOrigin = '0 50%';
      R.ball.style.transform = `translate(${470 + knock * 980}px,752px) scaleX(${1 - knock})`;
    } else R.ball.style.transformOrigin = '50% 50%';
    show(R.easy, t >= 5.55 && t < 8.9 ? 1 : 0);
    easyLetters.forEach((el, i) => {
      const t0 = 5.6 + i * 0.13;
      const k = spring(t - t0, 0.45, 20);
      const im = impact(t, t0 + 0.1, 0.16, 9, 26);
      el.style.transformOrigin = '50% 92%';
      let x = 0, y = (1 - k) * -340, r = 0, op = clamp((t - t0) * 10);
      // 7.3초부터 바람에 흔들리다가 깜자에 맞으면 날아간다
      y += Math.sin((t - 7.25) * 40 + i) * 5 * seg(t, 7.25, 7.4) * (t < KNOCK[i] ? 1 : 0);
      const tau = t - KNOCK[i];
      if (tau > 0) {
        const [vx, vy, vr] = KNOCK_V[i];
        x += vx * tau; y += vy * tau + 0.5 * 3600 * tau * tau; r += vr * tau;
        op *= 1 - seg(tau, 0.35, 0.6);
      }
      tf(el, x, y, 1, r, im.sx, im.sy);
      show(el, op);
      // 글자 아래 키프레임 마름모
      const d = diaEls[i], dp = M.easy[i] || { x: 960 };
      const dsp = spring(t - (t0 + 0.08), 0.5, 22);
      const dk = t - (KNOCK[i] + 0.04);
      const ddx = dk > 0 ? KNOCK_V[i][0] * 0.6 * dk : 0, ddy = dk > 0 ? -500 * dk + 1800 * dk * dk : 0;
      tf(d, dp.x - 11 + ddx, 749 + ddy, dsp, 45 + (dk > 0 ? 400 * dk : 0));
      show(d, t > t0 + 0.08 && t < 8.6 ? 1 - (dk > 0 ? seg(dk, 0.2, 0.45) : 0) : 0);
    });

    // ── 5. 슈우욱 — 속도선 + 깜자 ──
    const spOn = t > 7.1 && t < 8.1;
    show(R.speed, spOn ? 1 : 0);
    if (spOn) {
      const dir = { x: -0.86, y: 0.51 }; // 깜자가 날아오는 방향
      speedEls.forEach((ln, i) => {
        const [off, delay, len] = SPEED[i];
        const u = seg(t, 7.1 + delay, 7.75 + delay);
        const head = lerp(-0.2, 1.35, ease.quadIn(u)), tail = head - len * 0.55 * (1 - seg(u, 0.75, 1));
        const ox = 1960 + -dir.y * off, oy = -40 + dir.x * -off * -1;
        const P = s => ({ x: ox + dir.x * s * 1500, y: oy + dir.y * s * 1500 });
        const a = P(Math.max(tail, -0.2)), b = P(head);
        ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
        ln.setAttribute('opacity', (0.55 - i * 0.05) * (1 - seg(u, 0.8, 1)));
      });
    }
    const kkOn = t >= FLY.t0 && t < 13.4;
    show(R.kk, kkOn ? 1 - seg(t, 13.15, 13.35) : 0);
    if (kkOn) {
      let p = kkamjaPose(t);
      // 로고로 모이기: 크기를 줄이며 로고 자리로
      const g = tw(t, 12.75, 13.3, ease.expoInOut);
      if (g > 0) {
        const target = { x: M.mark.x, y: M.mark.y + 95 };
        p = { ...p, x: lerp(p.x, target.x, g), y: lerp(p.y, target.y, g), s: lerp(1, 0.38, g), r: lerp(0, -8, Math.sin(Math.PI * g)) };
      }
      placeKK(R.kk, p);
    }
    // 잔상 (onion skin)
    ghosts.forEach((gh, i) => {
      const dt = (i + 1) * 0.035, tg = t - dt;
      const on = tg >= FLY.t0 && t < FLY.t1 + 0.08;
      show(gh, on ? (0.32 - i * 0.09) * (1 - seg(t, FLY.t1 - 0.05, FLY.t1 + 0.08)) : 0);
      if (on) placeKK(gh, kkamjaPose(tg));
    });
    // 그림자 + 착지 물결
    const shOn = t >= 7.7 && t < 13.0;
    show(R.shadow, shOn ? 0.16 * clamp(1 - Math.abs(kkamjaFoot(Math.min(t, FLY.land)).y - GROUND) / 500) * (1 - seg(t, 12.7, 13.0)) : 0);
    if (shOn) {
      const f = kkamjaFoot(Math.min(t, FLY.land)), im = impact(t, FLY.land, 0.25, 7, 20);
      tf(R.shadow, f.x - 150, GROUND - 17, 1, 0, im.sx, 1);
    }
    const rp = t - FLY.land;
    show(R.ripple, rp > 0 && rp < 0.6 ? 0.5 * (1 - seg(rp, 0, 0.6)) : 0);
    if (rp > 0 && rp < 0.6) { const s = lerp(1, 3.2, ease.expoOut(seg(rp, 0, 0.6))); tf(R.ripple, KK.x - 150, GROUND - 30, 1, 0, s, s * 0.8); }

    // ── 6. 말풍선 "easy 면접" ──
    const bIn = spring(t - 8.7, 0.68, 16);
    const bOut = tw(t, 12.6, 12.85, ease.expoIn);
    const bOn = t >= 8.7 && t < 12.85;
    show(R.bubbleWrap, bOn ? 1 : 0);
    if (bOn) {
      R.bubbleWrap.style.transformOrigin = '-74px 296px'; // 꼬리 끝
      R.bubbleWrap.style.transform = `scale(${bIn * (1 - bOut)}) rotate(${(1 - clamp(bIn)) * -6}deg)`;
      [...enB, ...krB].forEach((el, i) => {
        const t0 = 8.82 + i * 0.06 + (i >= enB.length ? 0.1 : 0);
        const k = spring(t - t0, 0.42, 22);
        el.style.transformOrigin = '50% 100%';
        tf(el, 0, (1 - k) * 60, lerp(0.4, 1, clamp(k, 0, 1.2)));
        show(el, clamp((t - t0) * 12));
      });
      const ul = R.underline.firstElementChild, len = 300;
      ul.style.strokeDasharray = len;
      ul.style.strokeDashoffset = len * (1 - tw(t, 10.2, 10.65, ease.cubicInOut));
    }

    // ── 7. 엔드 카드 ──
    const lockOn = t >= 13.1;
    show(R.lock, lockOn ? 1 : 0);
    if (lockOn) {
      show(R.mark, seg(t, 13.15, 13.35));
      R.mark.style.transform = `scale(${lerp(0.9, 1, spring(t - 13.15, 0.5, 18))})`;
      nameLetters.forEach((el, i) => {
        const k = spring(t - (13.25 + i * 0.045), 0.6, 18);
        tf(el, (1 - k) * -40, 0);
        show(el, seg(t, 13.25 + i * 0.045, 13.35 + i * 0.045));
      });
      R.tag.style.transform = `translateY(${(1 - spring(t - 13.75, 0.7, 14)) * 24}px)`;
      show(R.tag, seg(t, 13.75, 14.0));
    }

    // ── HUD ──
    if (o.hud) {
      const fr = Math.floor((t - START) * FPS + 1e-6);
      const ss = String(Math.floor(fr / FPS)).padStart(2, '0'), ff = String(fr % FPS).padStart(2, '0');
      R.tc.textContent = `00:${ss}:${ff}`;
      let lab = HUD_LABELS[0][1];
      for (const [bt, l] of HUD_LABELS) if (t >= bt) lab = l;
      R.hudBeat.textContent = t >= 14.2 ? 'END ■' : lab;
      R.rec.style.opacity = Math.floor(t * 2) % 2 ? 0.25 : 1;
      // 진한 판 위에서는 HUD를 밝게
      const dark = (t >= 2.4 && t < 2.55) || (t >= 2.55 && t < 2.7);
      R.hud.style.color = dark ? C.cream : C.ink;
    }
  }

  // ── 크기 맞추기 ──
  function fit() { const w = root.clientWidth || W; R.stage.style.transform = `scale(${w / W})`; }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro ? ro.observe(root) : fit();

  // ── 재생 상태 ──
  let time = 0, playing = false, raf = 0, last = 0, rate = o.rate, loop = o.loop;
  const listeners = { say: new Set(), end: new Set(), time: new Set(), play: new Set(), pause: new Set() };
  if (o.onSay) listeners.say.add(o.onSay);
  if (o.onEnd) listeners.end.add(o.onEnd);
  if (o.onTime) listeners.time.add(o.onTime);
  const emit = (n, v) => listeners[n].forEach(fn => { try { fn(v); } catch (e) { console.error(e); } });

  function frame(now) {
    if (!playing) return;
    const prev = time;
    time += ((now - last) / 1000) * rate;
    last = now;
    if (prev < SAY_AT && time >= SAY_AT) emit('say', SAY_AT);
    if (time >= DURATION) {
      if (loop) { time %= DURATION; } else { time = DURATION; playing = false; render(time); emit('time', time); emit('end'); emit('pause'); return; }
    }
    render(time);
    emit('time', time);
    raf = requestAnimationFrame(frame);
  }
  const api = {
    element: root,
    duration: DURATION,
    beats: BEATS,
    get time() { return time; },
    get playing() { return playing; },
    get rate() { return rate; },
    set rate(v) { rate = v; },
    get loop() { return loop; },
    set loop(v) { loop = !!v; },
    play() { if (playing) return; if (time >= DURATION) time = 0; playing = true; last = performance.now(); raf = requestAnimationFrame(frame); emit('play'); },
    pause() { if (!playing) return; playing = false; cancelAnimationFrame(raf); emit('pause'); },
    toggle() { playing ? api.pause() : api.play(); },
    seek(t) { time = clamp(t, 0, DURATION); render(time); emit('time', time); },
    render,
    on(name, fn) { listeners[name].add(fn); return () => listeners[name].delete(fn); },
    destroy() { api.pause(); ro && ro.disconnect(); root.remove(); },
    ready: null,
  };

  // 폰트가 준비되면 글자 위치를 재고 첫 프레임을 그린다
  measure(); render(0);
  const fontsReady = doc.fonts && doc.fonts.load
    ? Promise.race([
        Promise.all([doc.fonts.load(`700 100px 'Space Grotesk'`), doc.fonts.load(`900 100px 'Noto Sans KR'`, '깜자면접'), doc.fonts.load(`500 30px 'Space Grotesk'`)]).then(() => doc.fonts.ready),
        new Promise(r => setTimeout(r, 2500)),
      ])
    : Promise.resolve();
  const imgs = [...root.querySelectorAll('img')].map(img => (img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))).filter(Boolean);
  api.ready = Promise.all([fontsReady, ...imgs]).then(() => {
    measure();
    const reduce = o.respectReducedMotion && typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) api.seek(11 - START); // 움직임을 줄인 사용자: 깜자가 말하는 장면 한 장만
    else { api.seek(time); if (o.autoplay) api.play(); }
    return api;
  });
  return api;
}

// ───────────────────────────── <kkamja-showreel> 태그 ─────────────────────────────
// 속성: autoplay, loop, no-hud, asset-base="/images/", rate="1"
// 이벤트: 'say' (깜자가 말할 때), 'end'
if (typeof customElements !== 'undefined' && !customElements.get('kkamja-showreel')) {
  customElements.define('kkamja-showreel', class extends HTMLElement {
    connectedCallback() {
      if (this.reel) return;
      this.style.display = this.style.display || 'block';
      this.reel = createKkamjaShowreel(this, {
        autoplay: this.hasAttribute('autoplay'),
        loop: this.hasAttribute('loop'),
        hud: !this.hasAttribute('no-hud'),
        rate: Number(this.getAttribute('rate')) || 1,
        assetBase: this.getAttribute('asset-base') || '/images/',
        onSay: () => this.dispatchEvent(new CustomEvent('say', { detail: { text: 'easy 면접' } })),
        onEnd: () => this.dispatchEvent(new CustomEvent('end')),
      });
    }
    disconnectedCallback() { this.reel && this.reel.destroy(); this.reel = null; }
    play() { this.reel && this.reel.play(); }
    pause() { this.reel && this.reel.pause(); }
    seek(t) { this.reel && this.reel.seek(t); }
  });
}
