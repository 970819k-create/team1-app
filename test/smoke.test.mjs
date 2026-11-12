// 자동 점검: npm test
// 서버를 따로 띄워 화면 파일, API, AI 미연결 시 기본 동작, 보안 차단을 확인한다.
// .env의 실제 키는 쓰지 않는다 (AI를 부르지 않고 요금도 들지 않음).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3990 + Math.floor(Math.random() * 9);
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  const env = { ...process.env, PORT: String(PORT), IGNORE_DOTENV: '1', AI_PROVIDER: '', PIPER_VOICE: '/nonexistent' };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'HF_TOKEN']) delete env[k];
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/status`)).ok) return; } catch { /* 아직 켜지는 중 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('서버가 켜지지 않았어요');
});
after(() => server?.kill());

const post = (p, body, headers = {}) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const JOB = 'We are hiring a data analyst. You will analyze sales data with SQL and Excel, build dashboards, and present insights to managers in English. Requirements: bachelor degree, SQL, business English, teamwork.';

test('모든 자바스크립트 파일 문법', () => {
  const files = ['server.js', ...fs.readdirSync(path.join(ROOT, 'lib')).map((f) => `lib/${f}`), ...fs.readdirSync(path.join(ROOT, 'public/js')).map((f) => `public/js/${f}`)].filter((f) => f.endsWith('.js'));
  for (const f of files) assert.equal(spawnSync(process.execPath, ['--check', f], { cwd: ROOT }).status, 0, f);
});

test('화면 파일 제공', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.match(html, /쉬었음 깜자/);
  for (const f of ['/js/app.js', '/css/style.css', '/favicon.svg']) assert.equal((await fetch(BASE + f)).status, 200, f);
});

test('폴더 밖 파일은 열 수 없음', async () => {
  const res = await fetch(BASE + '/..%2fserver.js');
  assert.notEqual(await res.text().then((t) => t.includes('process.loadEnvFile')), true);
});

test('AI 미연결 상태 표시', async () => {
  const s = await (await fetch(BASE + '/api/status')).json();
  assert.equal(s.ai, false);
});

test('샘플 프로젝트: 질문 3개 이상, 모든 질문에 근거 자료', async () => {
  const p = await (await fetch(BASE + '/api/sample')).json();
  assert.ok(p.analysis.questions.length >= 3);
  for (const q of p.analysis.questions) assert.ok(q.sources.length > 0, q.id);
});

test('분석: AI 없으면 안내, 링크를 못 읽으면 이유 안내', async () => {
  const a = await (await post('/api/analyze', { job: { text: JOB } })).json();
  assert.equal(a.reason, 'no_ai');
  const b = await (await post('/api/analyze', { job: { url: 'http://127.0.0.1:1/x' } })).json();
  assert.equal(b.reason, 'not_enough');
  assert.equal(b.sources[0].status, 'failed');
  assert.ok(b.sources[0].message);
});

test('기본 피드백: 표현 교정과 [자리 표시자] 답변 예시', async () => {
  const sample = await (await fetch(BASE + '/api/sample')).json();
  const f = await (await post('/api/feedback', { project: sample, question: sample.analysis.questions[2], answer: 'I have a experience in my club.' })).json();
  assert.equal(f.basic, true);
  assert.ok(f.improvements.some((x) => x.better === 'have experience'));
  assert.match(f.sample_answer_en, /\[[^\]]+\]/);
});

test('기본 면접 진행: 짧은 답엔 후속 질문, 마지막엔 종료', async () => {
  const t1 = await (await post('/api/interview/turn', { transcript: [{ role: 'candidate', text: 'I like it.' }], nextQuestion: { en: 'Next?', ko: '다음' }, allowFollowUp: true, mustEnd: false })).json();
  assert.equal(t1.action, 'follow_up');
  const t2 = await (await post('/api/interview/turn', { transcript: [], nextQuestion: null, allowFollowUp: false, mustEnd: true })).json();
  assert.equal(t2.action, 'end');
});

test('기본 면접 결과: 답한 질문마다 결과', async () => {
  const sample = await (await fetch(BASE + '/api/sample')).json();
  const r = await (await post('/api/interview/report', { project: sample, pairs: [{ question: 'Q', question_id: 'Q1', kind: 'main', answer: 'Hello.' }] })).json();
  assert.equal(r.items.length, 1);
});

test('다른 사이트에서는 AI 설정을 바꿀 수 없음', async () => {
  const res = await post('/api/settings/active', { id: 'openai' }, { Origin: 'http://evil.example' });
  assert.equal(res.status, 403);
});

