// 기업 자료 기반 AI 영어 면접 준비 — 로컬 서버
// 실행: npm start  →  http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// IGNORE_DOTENV=1이면 .env를 읽지 않는다 (자동 점검에서 실제 키로 AI를 부르지 않게)
if (process.env.IGNORE_DOTENV !== '1') {
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* .env 없음 */ }
}

const { aiEnabled, aiInfo, analyze, feedback, interviewTurn, interviewReport, AiError } = await import('./lib/ai.js');
const { basicFeedback, basicTurn, basicReport } = await import('./lib/basic.js');
const { fetchSource } = await import('./lib/fetch-source.js');
const { ttsAvailable, synthesize } = await import('./lib/tts.js');
const { settingsStatus, verifyOnly, KeyError } = await import('./lib/settings.js');
const { requestConfig, parseConfigHeader, ollamaReachable, ttsConfig, ProviderError, OPENAI_VOICES, OPENAI_TTS_MODELS } = await import('./lib/providers.js');
const { openaiSpeech } = await import('./lib/tts-openai.js');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(ROOT, 'public');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples', 'sample-project.json'), 'utf8'));
const MAX_BODY = 2 * 1024 * 1024;
const MIN_TOTAL_CHARS = 200;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isBuf ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('입력이 너무 커요. 자료를 줄여 주세요.'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('요청 형식이 올바르지 않아요.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) {
      // 화면 주소는 모두 index.html이 처리한다
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
        if (e2) return send(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': TYPES['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

const routes = {
  'GET /api/status': async () => {
    const info = aiInfo();
    let ai = aiEnabled();
    let problem = null;
    if (info.provider === 'ollama' && !(await ollamaReachable())) {
      ai = false;
      problem = 'ollama_offline';
    }
    return { ai, problem, ...info, tts: ttsAvailable(), ttsOptions: { piper: ttsAvailable(), voices: OPENAI_VOICES, models: OPENAI_TTS_MODELS } };
  },

  'GET /api/sample': async () => structuredClone(SAMPLE),

  // AI 설정: 제공자 목록(서버 공용 키 여부)과 키 확인. 키 자체는 브라우저에만 저장한다.
  'GET /api/settings': async () => settingsStatus(),
  'POST /api/settings/verify': async (body) => verifyOnly(body),

  // ① 자료 읽기 + ② 분석
  'POST /api/analyze': async (body) => {
    const inputs = [];
    if (body.job?.url || body.job?.text) inputs.push({ kind: 'job', ...body.job });
    for (const c of body.company || []) if (c?.url || c?.text) inputs.push({ kind: 'company', ...c });
    if (!inputs.some((i) => i.kind === 'job')) throw Object.assign(new Error('채용공고 링크나 본문을 넣어 주세요.'), { status: 400 });

    // 링크 읽기 (텍스트를 직접 넣었으면 그 텍스트를 우선 사용)
    const sources = await Promise.all(inputs.map(async (inp, i) => {
      const id = `S${i + 1}`;
      const text = (inp.text || '').trim();
      if (text) return { id, kind: inp.kind, url: inp.url || '', title: inp.url ? '' : '직접 입력한 텍스트', status: 'ok', text: text.slice(0, 30000) };
      const r = await fetchSource(inp.url);
      return { id, kind: inp.kind, url: inp.url, title: r.title || inp.url, status: r.status, text: r.text, message: r.message };
    }));

    const usable = sources.filter((s) => s.status !== 'failed' && s.text);
    const total = usable.reduce((n, s) => n + s.text.length, 0);
    const jobOk = usable.some((s) => s.kind === 'job');
    if (!jobOk || total < MIN_TOTAL_CHARS) {
      return {
        ok: false,
        reason: 'not_enough',
        message: !jobOk ? '채용공고 내용을 읽지 못했어요. 공고 본문을 복사해 텍스트로 붙여넣어 주세요.' : '읽은 자료가 너무 적어 분석할 수 없어요. 본문을 텍스트로 붙여넣어 주세요.',
        sources: sources.map(({ text, ...s }) => ({ ...s, chars: text?.length || 0 })),
      };
    }
    if (!aiEnabled()) {
      return {
        ok: false,
        reason: 'no_ai',
        message: 'AI가 연결되지 않아 새 자료를 분석할 수 없어요. 오른쪽 위 [설정]에서 쓸 AI와 키를 넣어 주세요. 키 없이도 [샘플로 체험하기]로 전체 흐름을 써 볼 수 있어요.',
        sources: sources.map(({ text, ...s }) => ({ ...s, chars: text?.length || 0 })),
      };
    }
    const analysis = await analyze({ sources: usable, role: body.role, experience: body.experience });
    return { ok: true, sources, analysis };
  },

  // ③-A 질문별 연습 피드백
  'POST /api/feedback': async (body) => {
    const { project, question, answer } = body;
    if (!answer?.trim()) throw Object.assign(new Error('답변 내용이 비어 있어요.'), { status: 400 });
    if (!aiEnabled()) return basicFeedback({ project, question, answer });
    return feedback({ project, question, answer, previous: body.previous });
  },

  // ③-B 실전 면접 다음 발화
  'POST /api/interview/turn': async (body) => {
    if (!aiEnabled()) return basicTurn(body);
    return interviewTurn(body);
  },

  // ③-B 실전 면접 결과
  'POST /api/interview/report': async (body) => {
    if (!aiEnabled()) return basicReport(body);
    return interviewReport(body);
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // 면접관 목소리: 브라우저 설정에 따라 OpenAI 음성 또는 Piper로 만든다
  if (url.pathname === '/api/tts' && req.method === 'POST') {
    const config = parseConfigHeader(req.headers['x-ai-config']);
    return requestConfig.run(config, async () => {
      try {
        const body = await readJson(req);
        const t = ttsConfig();
        const engine = body.engine || t.engine || 'piper';
        if (engine === 'openai') {
          const mp3 = await openaiSpeech(body.text, { voice: body.voice || t.voice, model: body.model || t.model });
          return send(res, 200, mp3, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
        }
        if (engine === 'piper' && ttsAvailable()) {
          const wav = await synthesize(String(body.text || ''));
          return send(res, 200, wav, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
        }
        return send(res, 400, { error: '이 서버에서는 그 음성을 쓸 수 없어요. 브라우저 기본 음성으로 읽을게요.', code: 'tts_unavailable' });
      } catch (err) {
        if (err instanceof ProviderError) return send(res, err.code === 'auth' ? 401 : err.code === 'rate' ? 429 : 400, { error: err.message, code: err.code });
        console.error('[TTS 오류]', err);
        return send(res, 500, { error: '음성을 만들지 못했어요. 브라우저 기본 음성으로 읽을게요.' });
      }
    });
  }

  if (url.pathname === '/api/tts' && req.method === 'GET') {
    if (!ttsAvailable()) return send(res, 501, { error: 'tts_unavailable' });
    try {
      const wav = await synthesize(url.searchParams.get('text') || '');
      return send(res, 200, wav, { 'Content-Type': 'audio/wav', 'Cache-Control': 'max-age=86400' });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) {
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: '서버가 이 기능을 모르는 옛 버전이에요. 서버를 다시 켜 주세요.', code: 'unknown_api' });
    return serveStatic(req, res);
  }
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    // 브라우저에 저장한 AI 설정(X-AI-Config)으로 이 요청만 처리한다
    const config = parseConfigHeader(req.headers['x-ai-config']);
    send(res, 200, await requestConfig.run(config, () => handler(body, req)));
  } catch (err) {
    if (err instanceof KeyError) return send(res, 400, { error: err.message });
    if (err instanceof AiError) return send(res, err.code === 'auth' ? 401 : err.code === 'rate' ? 429 : 502, { error: err.message, code: err.code });
    if (err.status) return send(res, err.status, { error: err.message });
    console.error(err);
    send(res, 500, { error: '서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.' });
  }
});

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
