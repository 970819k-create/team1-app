// 여러 AI 제공자 설정과 호출.
// - claude: Anthropic SDK (lib/ai.js에서 구조화 출력으로 직접 호출)
// - openai, huggingface: OpenAI 호환 Chat Completions API
// - gemini: Google Gemini REST API
// - ollama: 내 PC에서 실행하는 공개 모델 (Ollama, Hugging Face의 모델을 받아 실행)
// Claude 외의 제공자는 JSON 스키마를 프롬프트에 넣고, 돌아온 JSON을 zod로 검사한다.

export const PROVIDERS = {
  claude: {
    label: 'Claude (Anthropic)',
    keyEnv: 'ANTHROPIC_API_KEY', modelEnv: 'CLAUDE_MODEL', defaultModel: 'claude-opus-5-5',
    keyPrefix: 'sk-ant-', keyHint: 'sk-ant-로 시작',
    url: 'https://console.anthropic.com', urlLabel: 'Claude Console → API Keys',
    note: '분석·피드백 품질이 가장 좋아요. 쓴 만큼 요금이 나가요.',
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    keyEnv: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', defaultModel: 'gpt-4.1-mini',
    keyPrefix: 'sk-', keyHint: 'sk-로 시작',
    baseEnv: 'OPENAI_BASE_URL', defaultBase: 'https://api.openai.com/v1',
    url: 'https://platform.openai.com/api-keys', urlLabel: 'OpenAI Platform → API keys',
    note: 'ChatGPT 구독과 별개로 API 결제가 필요해요. 키를 저장하면 이 계정에서 쓸 수 있는 가장 높은 버전의 모델을 자동으로 골라요.',
  },
  gemini: {
    label: 'Google Gemini',
    keyEnv: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL', defaultModel: 'gemini-2.5-flash',
    keyHint: 'Google AI Studio에서 만든 키',
    baseEnv: 'GEMINI_BASE_URL', defaultBase: 'https://generativelanguage.googleapis.com/v1beta',
    url: 'https://aistudio.google.com/apikey', urlLabel: 'Google AI Studio → API 키',
    note: '무료 사용량이 있어요(한도 초과 시 잠시 막힘).',
  },
  huggingface: {
    label: 'Hugging Face',
    keyEnv: 'HF_TOKEN', modelEnv: 'HF_MODEL', defaultModel: 'openai/gpt-oss-120b',
    // 2026-11-12 기준 Hugging Face Inference Providers에서 대화용으로 서비스 중인 모델 (서비스 업체 수가 많을수록 안정적)
    suggestions: [
      { id: 'openai/gpt-oss-120b', note: '추천 · 서비스 10곳 · 빠르고 형식을 잘 지킴' },
      { id: 'zai-org/GLM-5.3', note: '서비스 9곳 · 대형 다국어 모델' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct', note: '서비스 4곳 · 모델 페이지에서 사용 동의 필요' },
      { id: 'openai/gpt-oss-20b', note: '서비스 4곳 · 작고 빠름, 정확도는 낮을 수 있음' },
    ],
    keyPrefix: 'hf_', keyHint: 'hf_로 시작하는 Access Token',
    baseEnv: 'HF_BASE_URL', defaultBase: 'https://router.huggingface.co/v1',
    url: 'https://huggingface.co/settings/tokens', urlLabel: 'Hugging Face → Settings → Access Tokens',
    note: 'gpt-oss, GLM, Llama 같은 공개 모델을 써요. 매달 소량의 무료 사용량이 있어요. 토큰 권한에 "Inference Providers 호출"을 켜 주세요.',
  },
  ollama: {
    label: 'Ollama (내 PC, 무료)',
    keyEnv: null, modelEnv: 'OLLAMA_MODEL', defaultModel: 'qwen2.5:7b',
    baseEnv: 'OLLAMA_BASE_URL', defaultBase: 'http://localhost:11434',
    url: 'https://ollama.com/download', urlLabel: 'ollama.com에서 설치',
    note: '공개 모델을 내 컴퓨터에서 돌려요. 키·요금이 없지만 메모리 8GB 이상이 필요하고, 답이 느리거나 덜 정확할 수 있어요.',
  },
};

export const ORDER = ['claude', 'openai', 'gemini', 'huggingface', 'ollama'];

/* 면접관 목소리(TTS) 선택지 */
export const TTS_ENGINES = ['browser', 'openai', 'piper'];
export const OPENAI_TTS_MODELS = [
  { id: 'gpt-4o-mini-tts', note: '자연스럽고 말투 지시 가능 (추천)' },
  { id: 'tts-1', note: '빠름' },
  { id: 'tts-1-hd', note: '고음질, 조금 느림' },
];
export const OPENAI_VOICES = [
  { id: 'alloy', note: '중성적, 차분함', gender: 'n' },
  { id: 'ash', note: '남성, 또렷함', gender: 'm' },
  { id: 'ballad', note: '남성, 따뜻함', gender: 'm' },
  { id: 'coral', note: '여성, 따뜻함', gender: 'f' },
  { id: 'echo', note: '남성, 부드러움', gender: 'm' },
  { id: 'fable', note: '중성적, 표현이 풍부함', gender: 'n' },
  { id: 'nova', note: '여성, 밝음', gender: 'f' },
  { id: 'onyx', note: '남성, 낮고 묵직함', gender: 'm' },
  { id: 'sage', note: '여성, 침착함', gender: 'f' },
  { id: 'shimmer', note: '여성, 맑음', gender: 'f' },
  { id: 'verse', note: '남성, 생동감', gender: 'm' },
  { id: 'marin', note: '최신 목소리 · 일부 음성 모델만', gender: 'f' },
  { id: 'cedar', note: '최신 목소리 · 일부 음성 모델만', gender: 'm' },
];
export const isTtsModelId = (m) => typeof m === 'string' && /^[\w.-]{1,80}$/.test(m) && /tts/i.test(m);
export function ttsConfig() {
  return cfg().tts || {};
}

// 요청마다 브라우저가 보낸 AI 설정(제공자·키·모델). 키는 서버에 저장하지 않는다.
import { AsyncLocalStorage } from 'node:async_hooks';
export const requestConfig = new AsyncLocalStorage();
const cfg = () => requestConfig.getStore() || {};

/** 브라우저가 보낸 X-AI-Config 헤더(base64 JSON)를 읽는다. 형식이 틀리면 무시한다. */
export function parseConfigHeader(value) {
  if (!value) return {};
  try {
    const raw = JSON.parse(Buffer.from(String(value), 'base64').toString('utf8'));
    const out = { keys: {}, models: {} };
    if (PROVIDERS[raw.provider]) out.provider = raw.provider;
    if (raw.tts && typeof raw.tts === 'object') {
      out.tts = {};
      if (TTS_ENGINES.includes(raw.tts.engine)) out.tts.engine = raw.tts.engine;
      if (OPENAI_VOICES.some((v) => v.id === raw.tts.voice)) out.tts.voice = raw.tts.voice;
      if (isTtsModelId(raw.tts.model)) out.tts.model = raw.tts.model;
    }
    for (const id of ORDER) {
      const k = raw.keys?.[id];
      if (typeof k === 'string' && /^[\x21-\x7e]{8,300}$/.test(k)) out.keys[id] = k;
      const m = raw.models?.[id];
      if (typeof m === 'string' && /^[\w.:/-]{1,120}$/.test(m)) out.models[id] = m;
    }
    return out;
  } catch {
    return {};
  }
}

export function modelOf(id) {
  const p = PROVIDERS[id];
  return cfg().models?.[id] || process.env[p.modelEnv] || p.defaultModel;
}
export function baseOf(id) {
  const p = PROVIDERS[id];
  return (process.env[p.baseEnv] || p.defaultBase || '').replace(/\/$/, '');
}
export function keyOf(id) {
  const p = PROVIDERS[id];
  return p.keyEnv ? cfg().keys?.[id] || process.env[p.keyEnv] || '' : '';
}
export function hasKey(id) {
  return PROVIDERS[id].keyEnv ? Boolean(keyOf(id)) : true;
}

/** 지금 쓰는 제공자: AI_PROVIDER 설정 → 없으면 키가 있는 첫 제공자 */
export function activeProvider() {
  if (cfg().provider) return cfg().provider;
  const set = process.env.AI_PROVIDER;
  if (set && PROVIDERS[set]) return set;
  return ORDER.find((id) => PROVIDERS[id].keyEnv && hasKey(id)) || 'claude';
}
export function providerReady() {
  return hasKey(activeProvider());
}

/** Ollama가 켜져 있는지 1.5초 안에 확인한다 (상태 표시용) */
export async function ollamaReachable() {
  try {
    const res = await fetch(`${baseOf('ollama')}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* JSON 받기 (Claude 외)                                               */
/* ------------------------------------------------------------------ */

export function extractJson(text) {
  const t = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // 추론 모델의 생각 과정은 버린다
    .trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* 아래에서 다시 */ }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(t.slice(s, e + 1)); } catch { /* 실패 */ }
  }
  return null;
}

/**
 * 429·402 응답을 원인별로 나눠 설명한다.
 * - 크레딧(잔액) 없음: 기다려도 안 풀림 → 결제·충전 안내
 * - 무료 등급에서 그 모델을 못 씀(limit: 0): 다른 모델·결제 안내
 * - 잠깐 요청이 많음: 1분 뒤 다시
 * AI 회사가 보낸 원래 문구도 짧게 붙여, 실제 이유를 확인할 수 있게 한다.
 */
export function quotaMessage(id, res, data, msg) {
  const name = PROVIDERS[id].label;
  const code = String(data?.error?.code || data?.error?.type || data?.error?.status || '');
  const raw = msg.replace(/\s+/g, ' ').slice(0, 180);
  const tail = raw ? ` (${name} 응답: ${raw})` : '';
  const wait = Number(res.headers.get('retry-after')) || null;

  if (id === 'openai' && /insufficient_quota/.test(code + msg)) {
    return `OpenAI 계정에 API 크레딧이 없어요. ChatGPT 구독과 API 요금은 따로라서, platform.openai.com → Settings → Billing에서 크레딧을 충전해야 써요. 충전 전에는 다시 시도해도 같은 오류가 나요. 지금은 [설정]에서 무료 사용량이 있는 Gemini를 골라 쓸 수 있어요.${tail}`;
  }
  if (id === 'gemini' && /limit:\s*0\b/.test(msg)) {
    return `이 Google 계정은 무료 등급에서 ${modelOf(id)} 모델을 쓸 수 없어요. [설정]의 Gemini 모델 칸에 gemini-2.5-flash-lite 같은 다른 모델을 넣어 보거나, Google AI Studio에서 결제를 연결해 주세요.${tail}`;
  }
  if (id === 'gemini' && /per ?day|PerDay/i.test(msg)) {
    return `Gemini 무료 사용량을 오늘 다 썼어요. 내일 다시 쓰거나 [설정]에서 다른 AI를 골라 주세요.${tail}`;
  }
  if (res.status === 402 || (id === 'huggingface' && /credit|quota|exceeded/i.test(msg))) {
    return `${name} 무료 사용량(크레딧)을 다 썼어요. 결제를 연결하거나 [설정]에서 다른 AI를 골라 주세요.${tail}`;
  }
  if (id === 'claude' || /rate.?limit|per ?minute|PerMinute|tokens per min|requests per min/i.test(code + msg)) {
    return `${name}에 짧은 시간 동안 요청이 많았어요. ${wait ? `${wait}초` : '1분 정도'} 뒤에 다시 시도해 주세요.${tail}`;
  }
  return `${name}가 사용량 한도로 요청을 막았어요. 크레딧(잔액)이 남아 있는지 확인하고, 1분 뒤 다시 시도해 주세요.${tail}`;
}

async function http(url, init, label) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(180000) });
  } catch (err) {
    if (label === 'ollama') throw new ProviderError('network', 'Ollama에 연결하지 못했어요. Ollama를 설치하고 켜 두었는지 확인해 주세요. Ollama를 쓰지 않으려면 오른쪽 위 [설정]에서 Claude나 Gemini 같은 다른 AI를 고르세요.');
    throw new ProviderError('network', err.name === 'TimeoutError' ? 'AI 응답이 너무 오래 걸려요. 잠시 뒤 다시 시도해 주세요.' : 'AI 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 텍스트 응답 */ }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || text.slice(0, 200);
    if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|invalid api key|Invalid credentials/i.test(String(msg))) {
      throw new ProviderError('auth', `${PROVIDERS[label].label} 키가 올바르지 않거나 권한이 없어요. 오른쪽 위 [설정]에서 확인해 주세요.`);
    }
    if (res.status === 429 || res.status === 402) throw new ProviderError('rate', quotaMessage(label, res, data, String(msg)));
    if (res.status === 404) throw new ProviderError('model', `모델(${modelOf(label)})을 찾지 못했어요. [설정]에서 모델 이름을 확인해 주세요.`);
    throw new ProviderError('api', `AI 서버 오류(${res.status}): ${String(msg).slice(0, 160)}`);
  }
  return data;
}

/** gpt-5 계열·o 계열처럼 '생각하는' 모델인지 */
export function isReasoningModel(model) {
  return /^(o\d|gpt-5|gpt-[6-9])/i.test(String(model || ''));
}

const DATED = /-\d{4}-\d{2}-\d{2}$/;
const NOT_CHAT = /(audio|realtime|transcribe|tts|search|image|dall-e|embedding|moderation|instruct|codex|computer|vision|whisper|davinci|babbage|-pro\b|-pro-)/i;

function versionOf(id) {
  const g = /^gpt-(\d+)(?:\.(\d+))?/i.exec(id);
  if (g) return Number(g[1]) + (g[2] ? Number(`0.${g[2]}`) : 0) + (/^gpt-4o/i.test(id) ? 0.05 : 0);
  const o = /^o(\d+)/i.exec(id);
  if (o) return 4.15 + Number(o[1]) * 0.05; // o3·o4는 gpt-4.1과 gpt-5 사이로 본다
  return 0;
}

/**
 * OpenAI 계정에서 쓸 수 있는 모델 목록을 받아 분석용·음성용으로 나누고 높은 버전부터 줄 세운다.
 * 버전이 높을수록, 크기가 클수록(mini·nano보다 기본), 날짜 고정판보다 최신 별칭을 앞에 둔다.
 */
export function rankOpenAIModels(ids) {
  const chat = ids
    .filter((id) => /^(gpt-\d|o\d)/i.test(id) && !NOT_CHAT.test(id))
    .map((id) => {
      let score = versionOf(id);
      if (/nano/i.test(id)) score -= 0.6;
      else if (/mini/i.test(id)) score -= 0.3;
      if (/chat-latest/i.test(id)) score -= 0.05;
      if (DATED.test(id)) score -= 0.01;
      if (/preview/i.test(id)) score -= 0.02;
      return { id, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map((x) => x.id);
  const tts = ids
    .filter((id) => /tts/i.test(id))
    .map((id) => {
      let score = /^gpt-/i.test(id) ? 10 + versionOf(id) : /hd/i.test(id) ? 2 : 1;
      if (/mini/i.test(id) && /^gpt-/i.test(id)) score -= 0.3;
      if (DATED.test(id)) score -= 0.01;
      return { id, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map((x) => x.id);
  return { chat, tts, best: { chat: chat[0] || null, tts: tts[0] || null } };
}

/** 이 OpenAI 키로 쓸 수 있는 모델 목록 */
export async function listOpenAIModels(key) {
  const res = await fetch(`${baseOf('openai')}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new ProviderError('auth', 'OpenAI가 이 키를 거부했어요. 키를 다시 확인해 주세요.');
  if (!res.ok) throw new ProviderError('api', `OpenAI 모델 목록을 받지 못했어요(${res.status}).`);
  const data = await res.json();
  return rankOpenAIModels((data.data || []).map((m) => m.id).filter(Boolean));
}

async function callOpenAICompat(id, { system, user, effort }) {
  const body = {
    model: modelOf(id),
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  const reasoning = id === 'openai' && isReasoningModel(body.model);
  if (id === 'openai') {
    body.response_format = { type: 'json_object' };
    // 생각하는 모델은 생각 과정도 이 한도에 포함되므로 넉넉하게
    body.max_completion_tokens = reasoning ? 32000 : 12000;
    if (reasoning) body.reasoning_effort = effort === 'low' ? 'low' : 'medium';
  } else {
    body.max_tokens = 12000; // 추론 모델은 생각 과정도 이 한도에 포함된다
  }
  const send = () => http(`${baseOf(id)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyOf(id)}` },
    body: JSON.stringify(body),
  }, id);
  let data;
  try {
    data = await send();
  } catch (err) {
    // 모델이 일부 옵션(reasoning_effort, response_format)을 받지 않으면 그 옵션을 빼고 한 번 더
    if (id === 'openai' && err.code === 'api' && /reasoning_effort|response_format|unsupported|not supported/i.test(err.message)) {
      delete body.reasoning_effort;
      delete body.response_format;
      data = await send();
    } else {
      throw err;
    }
  }
  return data?.choices?.[0]?.message?.content || '';
}

async function callGemini({ system, user }) {
  const data = await http(`${baseOf('gemini')}/models/${encodeURIComponent(modelOf('gemini'))}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keyOf('gemini') },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 12000 },
    }),
  }, 'gemini');
  const cand = data?.candidates?.[0];
  if (!cand && data?.promptFeedback?.blockReason) throw new ProviderError('refusal', 'Gemini가 이 요청을 처리하지 않았어요. 자료 내용을 확인해 주세요.');
  return (cand?.content?.parts || []).map((p) => p.text || '').join('');
}

async function callOllama({ system, user }) {
  const data = await http(`${baseOf('ollama')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelOf('ollama'),
      stream: false,
      format: 'json',
      options: { num_ctx: 16384 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  }, 'ollama');
  return data?.message?.content || '';
}

/** Claude 외 제공자로 JSON 결과 만들기. 스키마에 맞지 않으면 한 번 더 요청한다. */
export async function generateOther(id, { system, user, schema, jsonSchema, effort }) {
  const instruction = `\n\n출력 형식: 아래 JSON Schema에 맞는 JSON 객체 하나만 출력하세요. 마크다운, 설명, 코드 블록 없이 JSON만 씁니다.\n${JSON.stringify(jsonSchema)}`;
  let prompt = user + instruction;
  for (let attempt = 0; attempt < 2; attempt++) {
    const call = id === 'gemini' ? callGemini : id === 'ollama' ? callOllama : (args) => callOpenAICompat(id, { ...args, effort });
    const text = await call({ system, user: prompt });
    const json = extractJson(text);
    const parsed = json ? schema.safeParse(json) : null;
    if (parsed?.success) return parsed.data;
    const why = parsed ? parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : 'JSON이 아님';
    prompt = `${user}${instruction}\n\n이전 출력이 형식에 맞지 않았어요 (${why}). 스키마의 모든 필드를 채운 JSON만 다시 출력하세요.`;
  }
  throw new ProviderError('parse', `${PROVIDERS[id].label}의 결과가 형식에 맞지 않았어요. 다시 시도하거나 [설정]에서 더 큰 모델이나 다른 AI를 골라 주세요.`);
}

/* ------------------------------------------------------------------ */
/* 키 확인 (요금이 들지 않는 조회 요청)                                 */
/* ------------------------------------------------------------------ */

/**
 * 키 저장 때 1토큰짜리 아주 작은 요청을 보내, 크레딧이 없거나 무료 등급에서 막힌 계정을 미리 알려 준다.
 * (모델 조회만으로는 잔액 문제를 알 수 없기 때문). 문제 없으면 null.
 */
async function tinyCall(id, key, model) {
  try {
    if (id === 'openai') {
      const res = await fetch(`${baseOf(id)}/chat/completions`, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_completion_tokens: 16 }),
      });
      if (res.status === 429 || res.status === 402) {
        const data = await res.json().catch(() => null);
        return `키는 맞아요. 하지만 ${quotaMessage(id, res, data, String(data?.error?.message || ''))}`;
      }
    } else if (id === 'gemini') {
      const res = await fetch(`${baseOf(id)}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 16 } }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => null);
        return `키는 맞아요. 하지만 ${quotaMessage(id, res, data, String(data?.error?.message || ''))}`;
      }
    }
  } catch { /* 확인을 못 했을 뿐이므로 막지 않는다 */ }
  return null;
}

/** Hugging Face 모델이 지금 대화용으로 서비스 중인지 확인 (공개 API, 키 불필요). 문제 없으면 null */
export async function checkHfModel(model) {
  try {
    const res = await fetch(`https://huggingface.co/api/models/${model.split(':')[0]}?expand[]=inferenceProviderMapping`, { signal: AbortSignal.timeout(10000) });
    if (res.status === 404) return `Hugging Face에서 ${model} 모델을 찾지 못했어요. 모델 이름을 확인해 주세요.`;
    if (res.status === 401 || res.status === 403) return `Hugging Face에서 ${model}을(를) 찾지 못했거나 사용 동의가 필요한 모델이에요. 모델 이름을 확인하거나 모델 페이지에서 동의해 주세요.`;
    if (!res.ok) return null;
    const data = await res.json();
    let map = data.inferenceProviderMapping || [];
    if (!Array.isArray(map)) map = Object.entries(map).map(([provider, v]) => ({ provider, ...v }));
    const live = map.filter((m) => m.status === 'live' && m.task === 'conversational');
    if (!live.length) return `${model}은(는) 지금 바로 호출할 수 있는 곳이 없어요. 추천 모델 중에서 골라 주세요.`;
    return null;
  } catch {
    return null; // 확인을 못 했을 뿐이므로 막지 않는다
  }
}

/** 키·모델이 쓸 수 있는지 확인. 문제가 있으면 ProviderError, 확인만 못 했으면 warning 문자열 반환 */
export async function verify(id, key, model) {
  const t = { signal: AbortSignal.timeout(15000) };
  let res;
  try {
    if (id === 'openai') res = await fetch(`${baseOf(id)}/models/${encodeURIComponent(model)}`, { ...t, headers: { Authorization: `Bearer ${key}` } });
    else if (id === 'gemini') res = await fetch(`${baseOf(id)}/models/${encodeURIComponent(model)}`, { ...t, headers: { 'x-goog-api-key': key } });
    else if (id === 'huggingface') res = await fetch('https://huggingface.co/api/whoami-v2', { ...t, headers: { Authorization: `Bearer ${key}` } });
    else if (id === 'ollama') res = await fetch(`${baseOf(id)}/api/tags`, t);
  } catch {
    if (id === 'ollama') throw new ProviderError('network', 'Ollama에 연결하지 못했어요. Ollama를 설치하고 실행한 뒤 다시 눌러 주세요.');
    return '저장했지만 지금 서버에 연결해 확인하지는 못했어요. 인터넷 연결을 확인해 주세요.';
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 무시 */ }
  if (id === 'ollama') {
    const names = (data?.models || []).map((m) => m.name);
    const found = names.some((n) => n === model || n === `${model}:latest` || n.split(':')[0] === model);
    if (!found) return `Ollama는 켜져 있지만 ${model} 모델이 아직 없어요. 명령 프롬프트에서 "ollama pull ${model}"을 실행해 주세요.${names.length ? ` (받아 둔 모델: ${names.join(', ')})` : ''}`;
    return null;
  }
  if (res.status === 401 || res.status === 403 || /API_KEY_INVALID/.test(text)) {
    throw new ProviderError('auth', `${PROVIDERS[id].label}가 이 키를 거부했어요. 삭제된 키이거나 복사가 잘못됐을 수 있어요.`);
  }
  if (res.status === 404) return `키는 확인했지만 ${model} 모델을 찾지 못했어요. 모델 이름을 확인해 주세요.`;
  if (!res.ok) return `저장했지만 확인 중 오류(${res.status})가 났어요.`;
  if (id === 'openai' || id === 'gemini') {
    const quota = await tinyCall(id, key, model);
    if (quota) return quota;
  }
  if (id === 'huggingface') {
    const modelProblem = await checkHfModel(model);
    if (modelProblem) return modelProblem;
    if (data?.auth?.accessToken?.role === 'fineGrained') {
      return '토큰을 확인했어요. Fine-grained 토큰이면 권한에 "Make calls to Inference Providers"가 켜져 있어야 해요.';
    }
  }
  return null;
}
