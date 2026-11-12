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
    note: 'ChatGPT 구독과 별개로 API 결제가 필요해요.',
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
    keyEnv: 'HF_TOKEN', modelEnv: 'HF_MODEL', defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    keyPrefix: 'hf_', keyHint: 'hf_로 시작하는 Access Token',
    baseEnv: 'HF_BASE_URL', defaultBase: 'https://router.huggingface.co/v1',
    url: 'https://huggingface.co/settings/tokens', urlLabel: 'Hugging Face → Settings → Access Tokens',
    note: 'Qwen, Llama 같은 공개 모델을 써요. 매달 소량의 무료 사용량이 있어요. 토큰 권한에 "Inference Providers 호출"을 켜 주세요.',
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

function extractJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* 아래에서 다시 */ }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(t.slice(s, e + 1)); } catch { /* 실패 */ }
  }
  return null;
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
    if (res.status === 429) throw new ProviderError('rate', '사용량 한도에 걸렸어요. 잠시 뒤 다시 시도하거나 [설정]에서 다른 AI를 골라 주세요.');
    if (res.status === 404) throw new ProviderError('model', `모델(${modelOf(label)})을 찾지 못했어요. [설정]에서 모델 이름을 확인해 주세요.`);
    if (res.status === 402) throw new ProviderError('rate', '무료 사용량을 다 썼거나 결제가 필요해요. [설정]에서 다른 AI를 골라 주세요.');
    throw new ProviderError('api', `AI 서버 오류(${res.status}): ${String(msg).slice(0, 160)}`);
  }
  return data;
}

async function callOpenAICompat(id, { system, user }) {
  const body = {
    model: modelOf(id),
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  if (id === 'openai') {
    body.response_format = { type: 'json_object' };
    body.max_completion_tokens = 12000;
  } else {
    body.max_tokens = 8000;
  }
  const data = await http(`${baseOf(id)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyOf(id)}` },
    body: JSON.stringify(body),
  }, id);
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
export async function generateOther(id, { system, user, schema, jsonSchema }) {
  const instruction = `\n\n출력 형식: 아래 JSON Schema에 맞는 JSON 객체 하나만 출력하세요. 마크다운, 설명, 코드 블록 없이 JSON만 씁니다.\n${JSON.stringify(jsonSchema)}`;
  let prompt = user + instruction;
  for (let attempt = 0; attempt < 2; attempt++) {
    const call = id === 'gemini' ? callGemini : id === 'ollama' ? callOllama : (args) => callOpenAICompat(id, args);
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
  if (id === 'huggingface' && data?.auth?.accessToken?.role === 'fineGrained') {
    return '토큰을 확인했어요. Fine-grained 토큰이면 권한에 "Make calls to Inference Providers"가 켜져 있어야 해요.';
  }
  return null;
}
