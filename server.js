// 인터뷰 브리프(쉬었음 깜자) — 내 PC에서 실행하는 서버
// 실행: npm start  →  http://localhost:3000   (Vercel에서는 api/index.js가 같은 handler를 씀)
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// IGNORE_DOTENV=1이면 .env를 읽지 않는다 (자동 점검에서 실제 키로 AI를 부르지 않게)
if (process.env.IGNORE_DOTENV !== '1') {
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* .env 없음 */ }
}

// .env를 읽은 뒤에 불러와야 모듈이 설정을 볼 수 있다
const { handler } = await import('./lib/app.js');
const { aiEnabled, aiInfo } = await import('./lib/ai.js');
const { ttsAvailable, synthesize } = await import('./lib/tts.js');

const PORT = Number(process.env.PORT || 3000);
const server = http.createServer(handler);

// 예상하지 못한 오류가 나도 서버가 꺼지지 않게 기록만 하고 계속 실행한다
process.on('uncaughtException', (err) => console.error('[오류]', err));
process.on('unhandledRejection', (err) => console.error('[오류]', err));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ${PORT}번 포트를 이미 다른 프로그램(또는 이미 켜 둔 서버)이 쓰고 있어요.`);
    console.error('  이미 켜 둔 서버 창이 있으면 그 창을 쓰거나, 그 창에서 Ctrl + C로 끈 뒤 다시 실행하세요.\n');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`\n  기업 자료 기반 AI 영어 면접 준비`);
  console.log(`  ▶ http://localhost:${PORT}\n`);
  console.log(`  AI 분석·피드백: ${aiEnabled() ? `연결됨 (${aiInfo().providerLabel} · ${aiInfo().model})` : '연결 안 됨 — 화면 오른쪽 위 [설정]에서 AI와 키를 고르면 켜져요.'}`);
  console.log(`  면접관 음성: ${ttsAvailable() ? 'Piper 음성 사용' : '브라우저 내장 음성 사용'}\n`);
  if (ttsAvailable()) synthesize('Hello.').catch(() => {}); // 음성 모델을 미리 불러 첫 질문 지연을 줄인다
});
