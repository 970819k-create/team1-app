# 깜자 쇼릴 (15초 모션 그래픽)

모션 디자이너 쇼릴 느낌의 15초 영상이에요. 글자가 만들어지다가 **깜자가 슈우욱 날아와 글자를 다 쳐내고**,
가만히 서서 말풍선으로 **"easy 면접"**이라고 말한 뒤 "쉬었음 깜자" 로고로 끝나요.

| 파일 | 무엇 |
|---|---|
| `kkamja-showreel.js` | 모션 본체. 의존성 없는 ES 모듈 하나. 웹앱에서 실시간으로 그린다 (영상 파일 필요 없음) |
| `preview.html` | 미리보기: 타임라인, 비트로 점프, 1프레임 이동, 0.25배속, 저장하면 자동 새로고침 |
| `kkamja-showreel.mp4` | 같은 모듈로 뽑은 영상 (1920×1080, 30fps, 효과음, 2.5MB) |
| `../../tools/render-showreel.mjs` | MP4를 다시 뽑는 스크립트 |

## 바로 보기

```bash
npm start
```

브라우저에서 **http://localhost:3000/motion/preview.html** 을 엽니다.

- `kkamja-showreel.js`를 고치고 저장하면 미리보기가 **보고 있던 시간 그대로** 다시 열립니다.
- `?t=8.1`을 붙이면 그 순간에서 멈춘 채로 열립니다.
- 단축키: `Space` 재생/정지, `←` `→` 1프레임, `Shift`+`←` `→` 1초, `[` `]` 이전/다음 비트

## 웹앱에 넣기

### 방법 1: 태그 한 줄

```html
<script type="module" src="/motion/kkamja-showreel.js"></script>
<kkamja-showreel autoplay loop no-hud></kkamja-showreel>
```

| 속성 | 뜻 |
|---|---|
| `autoplay` | 열리면 바로 재생 |
| `loop` | 반복 |
| `no-hud` | 쇼릴 장식(타임코드, REC, 모서리 표시)을 숨김. 앱 화면에는 숨기는 걸 추천 |
| `asset-base="/images/"` | 깜자 이미지 폴더 (기본값 `/images/`) |
| `rate="0.5"` | 재생 속도 |

크기는 부모 너비에 맞춰 16:9로 자동 조절돼요. `style="max-width:720px"`처럼 감싸서 쓰면 됩니다.

### 방법 2: 앱 코드 안에서 (예: 홈 화면)

```js
import { createKkamjaShowreel } from '/motion/kkamja-showreel.js';
import { speak } from '/js/speech.js';

const reel = createKkamjaShowreel(document.querySelector('#intro'), {
  autoplay: true,
  hud: false,
  onSay: () => speak('easy 면접'),   // 깜자가 말하는 순간 (8.75초) 앱의 목소리로 읽기
  onEnd: () => console.log('끝'),
});
// reel.play() · reel.pause() · reel.seek(8.7) · reel.rate = 0.5 · reel.loop = true
// reel.on('time', t => ...) · reel.destroy()   ← 화면을 떠날 때 꼭 호출
```

브라우저는 사용자가 한 번도 누르지 않은 페이지에서 소리를 막아요. 목소리를 넣을 때는 버튼을 누른 뒤에 재생하세요.

**움직임 줄이기**를 켠 사용자에게는 애니메이션 대신 깜자가 말하는 장면(11초) 한 장만 보여줘요
(`respectReducedMotion: false`로 끌 수 있음).

### 방법 3: 그냥 영상으로

```html
<video src="/motion/kkamja-showreel.mp4" autoplay muted loop playsinline></video>
```

## 타이밍 고치기

모든 장면이 시간 `t`(초)에 대한 함수라서, 숫자만 바꾸면 돼요. 미리보기를 켜 둔 채로 저장하면 바로 보입니다.

| 시간 | 비트 | 코드에서 찾을 곳 |
|---|---|---|
| 0–0.6s | 빈 화면에 점 하나 | `// ── 1. 점 → MOTION의 O` |
| 0.6–2.4s | 점이 MOTION의 O가 되고, DESIGN이 올라옴 | 같은 곳 |
| 2.4–2.95s | 하드컷 4번 (TYPE / EASE / SPRING / TIMING) | `const cuts = [...]` |
| 2.95–5.5s | 화면이 원으로 줄어 공이 되고 3번 튄 뒤 트랙이 됨 | `HOPS`, `HITS` |
| 5.6–7.1s | 트랙 위에 E·A·S·Y가 떨어짐 | `// ── 4.` |
| 7.1–8.1s | **슈우욱**: 깜자가 회전하며 날아와 글자를 쳐내고 착지 | `FLY`, `KNOCK`, `kkamjaFoot()` |
| 8.7–12.6s | 가만히 서서 말풍선 **"easy 면접"**, 약 3초 멈춤 | `SAY_AT`, `// ── 6.` |
| 12.6–15s | 깜자가 로고로 줄어들며 엔드 카드 | `// ── 7.` |

- 깜자가 날아오는 길: `kkamjaFoot()`의 `P0`(출발) → `P1`(휘는 지점) → `P2`(착지)
- 말풍선 문구: `template()` 안의 `letters('easy', 'b')`, `letters('면접', 'b')`
- 색: 위쪽 `const C = {...}`

## MP4 다시 뽑기

```bash
npm run render:showreel
```

옵션: `--no-hud`, `--no-sound`, `--out 파일.mp4`, `--scale 0.5`(빠른 확인), `--shutter 1`(모션 블러 끄기).
Playwright와 ffmpeg가 필요해요. 처음이면 먼저 아래를 실행하세요.

```bash
npm i -D playwright && npx playwright install chromium
```

한 프레임을 4장으로 나눠 찍고 평균을 내서 모션 블러를 만들어요 (1080p 기준 4코어에서 약 1분 40초).
효과음은 스크립트가 직접 합성해서, 저작권 걱정 없이 쓸 수 있어요.
