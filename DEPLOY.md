# 배포와 앱 공유 (Vercel + 앱 설치)

이 앱은 **Vercel**에 올려서 링크 하나로 공유하고, 받은 사람은 그 링크를 **앱으로 설치(PWA)**해 홈 화면 아이콘으로 쓸 수 있습니다.
앱스토어 등록 없이 아이폰·안드로이드·PC 모두 됩니다.

## 1. Vercel에 처음 연결하기 (저장소 주인이 한 번만)

1. https://vercel.com 에 접속해 **Continue with GitHub**로 로그인합니다. (무료 Hobby 플랜이면 충분)
2. **Add New… → Project** → GitHub 저장소 목록에서 **team1-app**의 **Import**를 누릅니다.
   - 목록에 없으면 **Adjust GitHub App Permissions**에서 team1-app 접근을 허용합니다.
3. 설정 화면은 **그대로 두고** **Deploy**를 누릅니다.
   - Framework Preset: **Other** (자동) · Build Command: 비워 둠 · Output Directory: `public` (vercel.json에 들어 있음)
   - Environment Variables: **넣지 않아도 됩니다.** (아래 '공용 키' 참고)
4. 1~2분 뒤 `https://team1-app-xxxx.vercel.app` 같은 주소가 나오면 끝입니다.

이후에는 **`main`에 올릴 때마다 Vercel이 자동으로 새 버전을 배포**합니다. 다른 브랜치에 올리면 미리보기 주소가 따로 생깁니다.

> 주소를 바꾸고 싶으면 Vercel 프로젝트 → **Settings → Domains**에서 `kkamja.vercel.app`처럼 비어 있는 이름으로 바꿀 수 있습니다.

## 2. 아는 사람과 공유하기

- 앱 처음 화면 오른쪽 **'깜자를 앱으로 쓰기' → [🔗 친구에게 공유]**를 누르면 휴대폰 공유 창이 열리거나 링크가 복사됩니다.
- 받은 사람은 링크를 열고 **[📲 앱으로 설치]**를 누르면 됩니다.
  - **안드로이드·PC (Chrome·Edge):** 설치 창이 바로 뜹니다.
  - **아이폰 (Safari):** 공유 버튼(⬆️) → **홈 화면에 추가**. 앱이 방법을 그림 없이 순서대로 안내합니다.
  - 카카오톡으로 받은 링크는 카톡 안 브라우저로 열리므로 **[다른 브라우저로 열기]**(아이폰은 Safari) 후 설치하세요.
- 각자 **[설정]**에서 자기 AI 키를 넣어 씁니다. 키·기록은 **각자의 기기(브라우저)에만** 저장되고 서로 보이지 않습니다.
- 키가 없어도 **[샘플로 체험]**으로 전체 흐름을 써 볼 수 있습니다.

## 3. 공용 키 (선택, 주의)

Vercel 프로젝트 **Settings → Environment Variables**에 `OPENAI_API_KEY` 등을 넣으면, 키가 없는 사람도 그 키로 AI를 씁니다.
**링크를 아는 누구나 그 키로 요금을 쓸 수 있으니**, 아는 사람끼리만 쓰고 OpenAI·Claude 콘솔에서 사용 한도(Usage limit)를 꼭 걸어 두세요.
넣지 않으면 각자 자기 키를 넣어 쓰는 방식으로 동작합니다(추천).

## 4. Vercel에서 달라지는 점

| 항목 | 내 PC (`npm start`) | Vercel |
|---|---|---|
| 화면·분석·면접·피드백 | 동작 | 동작 |
| 면접관 목소리 | 브라우저 · OpenAI · Piper | 브라우저 · OpenAI (Piper는 서버에 설치할 수 없어 빠짐) |
| Ollama (내 PC AI) | 동작 | 사용 불가 (Vercel 서버에서 내 PC에 접속할 수 없음) |
| 분석 대기 시간 | 제한 없음 | 한 번에 최대 300초 (vercel.json의 `maxDuration`) |

## 5. 구조 (개발자용)

```
api/index.js       Vercel 서버리스 함수. lib/app.js의 handler를 그대로 내보냄
lib/app.js         모든 요청 처리 (화면 파일 + /api/*). 내 PC와 Vercel이 함께 씀
server.js          내 PC용 http 서버 (lib/app.js 사용)
vercel.json        /api/* → api/index.js 연결, 화면 폴더(public), 함수 최대 시간, data·samples 포함
public/manifest.webmanifest, public/sw.js, public/icons/   앱 설치(PWA) 정보·오프라인 저장·아이콘
public/js/install.js   [앱으로 설치]·[친구에게 공유] 버튼
assets-src/images/     디자인 원본 PNG (배포에는 안 들어감). 앱은 public/images의 WebP를 씀
```

이미지를 새로 넣을 때는 원본은 `assets-src/images/`에 두고, 화면에는 가로 400~640px 정도의 **WebP**로 줄여서 `public/images/`에 넣어 주세요. 휴대폰에서 빠르게 열립니다.
