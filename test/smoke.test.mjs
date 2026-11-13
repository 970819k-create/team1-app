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
  const env = { ...process.env, PORT: String(PORT), IGNORE_DOTENV: '1', AI_PROVIDER: '', PIPER_VOICE: '/nonexistent', OLLAMA_BASE_URL: 'http://127.0.0.1:9' };
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

test('깜자 쇼릴: 모듈·미리보기·영상 제공, 12초 안에 비트가 순서대로', async () => {
  assert.equal(spawnSync(process.execPath, ['--check', 'public/motion/kkamja-showreel.js'], { cwd: ROOT }).status, 0);
  const js = await fetch(BASE + '/motion/kkamja-showreel.js');
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(BASE + '/motion/preview.html')).status, 200);
  const mp4 = await fetch(BASE + '/motion/kkamja-showreel.mp4');
  assert.equal(mp4.headers.get('content-type'), 'video/mp4');
  const { DURATION, BEATS, SAY_AT } = await import('../public/motion/kkamja-showreel.js');
  assert.equal(DURATION, 12);
  assert.equal(BEATS[0].t, 0);
  assert.ok(SAY_AT > 0 && SAY_AT < DURATION);
  BEATS.forEach((b, i) => assert.ok(b.t >= (BEATS[i - 1]?.t ?? 0) && b.t < DURATION, b.name));
});

test('쥬씨 감귤: 모듈·영상 제공, 15초, 효과음 목록이 영상 안에', async () => {
  assert.equal(spawnSync(process.execPath, ['--check', 'public/motion/juicy/juicy.js'], { cwd: ROOT }).status, 0);
  assert.equal((await fetch(BASE + '/motion/juicy/juicy.js')).status, 200);
  assert.equal((await fetch(BASE + '/motion/juicy/juicy.mp4')).headers.get('content-type'), 'video/mp4');
  const { DURATION, BEATS, SFX } = await import('../public/motion/juicy/juicy.js');
  assert.equal(DURATION, 15);
  BEATS.forEach((b, i) => assert.ok(b.t >= (BEATS[i - 1]?.t ?? 0) && b.t < DURATION, b.name));
  SFX.forEach((e) => assert.ok(e.t >= 0 && e.t + (e.len || 0) <= DURATION + 0.01, e.kind));
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

test('키 확인: 다른 회사 키를 넣으면 알맞은 칸을 안내', async () => {
  const res = await post('/api/settings/verify', { id: 'claude', key: 'AQ.fakeGoogleKeyForTest123' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Gemini/);
});

test('브라우저가 보낸 AI 설정은 그 요청에만 쓰임', async () => {
  const cfg = Buffer.from(JSON.stringify({ provider: 'claude', keys: { claude: 'sk-ant-test-0000000000' } })).toString('base64');
  const withKey = await (await fetch(BASE + '/api/status', { headers: { 'X-AI-Config': cfg } })).json();
  assert.equal(withKey.ai, true);
  assert.equal(withKey.provider, 'claude');
  const without = await (await fetch(BASE + '/api/status')).json();
  assert.equal(without.ai, false);
  const broken = await (await fetch(BASE + '/api/status', { headers: { 'X-AI-Config': '%%%not-base64' } })).json();
  assert.equal(broken.ai, false);
});

test('서버는 키를 저장하지 않음 (설정 목록에 키가 없음)', async () => {
  const s = await (await fetch(BASE + '/api/settings')).text();
  assert.doesNotMatch(s, /sk-ant-[A-Za-z0-9_-]{6,}|"preview"/);
});

test('Ollama가 꺼져 있으면 미연결로 표시하고 이유를 알림', async () => {
  const cfg = Buffer.from(JSON.stringify({ provider: 'ollama' })).toString('base64');
  const s = await (await fetch(BASE + '/api/status', { headers: { 'X-AI-Config': cfg } })).json();
  assert.equal(s.provider, 'ollama');
  assert.equal(s.ai, false);
  assert.equal(s.problem, 'ollama_offline');
});

test('AI 답에서 JSON만 골라냄 (생각 과정·코드 블록 제거)', async () => {
  const { extractJson } = await import('../lib/providers.js');
  assert.deepEqual(extractJson('<think>먼저 생각…{"x":0}</think>\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('설명입니다 {"b":2} 끝'), { b: 2 });
  assert.equal(extractJson('JSON 없음'), null);
});

test('Hugging Face 기본 모델과 추천 목록', async () => {
  const s = await (await fetch(BASE + '/api/settings')).json();
  const hf = s.providers.find((p) => p.id === 'huggingface');
  assert.equal(hf.defaultModel, 'openai/gpt-oss-120b');
  assert.ok(hf.suggestions.length >= 3);
});

test('키 정리: 보이지 않는 글자는 지우고, 한글이 섞이면 이유를 알림', async () => {
  const { cleanKey } = await import('../lib/settings.js');
  assert.equal(cleanKey(' "sk-proj-abc\u200bdef"\n'), 'sk-proj-abcdef');
  const res = await post('/api/settings/verify', { id: 'openai', key: 'sk-proj-abc한def12345' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /한글/);
});

test('면접관 목소리: OpenAI 키가 없으면 이유를 알리고, 선택지 목록을 제공', async () => {
  const st = await (await fetch(BASE + '/api/status')).json();
  assert.ok(st.ttsOptions.voices.some((v) => v.id === 'alloy'));
  assert.ok(st.ttsOptions.models.some((m) => m.id === 'gpt-4o-mini-tts'));
  const r1 = await post('/api/tts', { text: 'Hello', engine: 'openai' });
  assert.equal(r1.status, 400);
  assert.equal((await r1.json()).code, 'tts_no_key');
  const r2 = await post('/api/tts', { text: 'Hello', engine: 'piper' });
  assert.equal((await r2.json()).code, 'tts_unavailable');
});

test('옛 서버 안내: 없는 API는 다시 켜라고 알림', async () => {
  const r = await (await fetch(BASE + '/api/nope')).json();
  assert.equal(r.code, 'unknown_api');
});

