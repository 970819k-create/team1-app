// Vercel 서버리스 함수: 모든 /api/* 요청을 여기서 처리한다 (vercel.json의 rewrites 참고)
// 화면 파일(public/)은 Vercel이 직접 제공한다.
export { handler as default } from '../lib/app.js';
