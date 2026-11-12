// 면접관 목소리: OpenAI 음성 합성(TTS)
// 키는 브라우저가 보낸 설정(X-AI-Config)의 OpenAI 키, 없으면 서버 .env의 OPENAI_API_KEY를 쓴다.
import crypto from 'node:crypto';
import { keyOf, baseOf, PROVIDERS, ProviderError, quotaMessage, OPENAI_VOICES, OPENAI_TTS_MODELS } from './providers.js';

export const DEFAULT_VOICE = 'alloy';
export const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
const INSTRUCTIONS = 'Speak as a calm, friendly professional job interviewer. Clear pronunciation, natural pace, slightly slower than normal conversation.';

// 같은 문장·목소리는 다시 만들지 않는다 (요금 절약). 오디오 자체는 키와 상관없다.
const cache = new Map();

export async function openaiSpeech(text, { voice, model } = {}) {
  const key = keyOf('openai');
  if (!key) {
    throw new ProviderError('tts_no_key', 'OpenAI 음성을 쓰려면 [설정]의 OpenAI 카드에 키를 먼저 저장해 주세요.');
  }
  const v = OPENAI_VOICES.some((x) => x.id === voice) ? voice : DEFAULT_VOICE;
  const m = OPENAI_TTS_MODELS.some((x) => x.id === model) ? model : DEFAULT_TTS_MODEL;
  const input = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!input) throw new ProviderError('tts_empty', '읽을 문장이 없어요.');

  const cacheKey = crypto.createHash('sha1').update(`${m}|${v}|${input}`).digest('hex');
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const body = { model: m, voice: v, input, response_format: 'mp3' };
  if (m === 'gpt-4o-mini-tts') body.instructions = INSTRUCTIONS;
  let res;
  try {
    res = await fetch(`${baseOf('openai')}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new ProviderError('network', err.name === 'TimeoutError' ? 'OpenAI 음성이 너무 오래 걸려요.' : 'OpenAI 음성 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* 무시 */ }
    const msg = String(data?.error?.message || '');
    if (res.status === 401 || res.status === 403) throw new ProviderError('auth', `${PROVIDERS.openai.label} 키가 올바르지 않거나 음성 기능 권한이 없어요. [설정]에서 확인해 주세요.`);
    if (res.status === 429 || res.status === 402) throw new ProviderError('rate', quotaMessage('openai', res, data, msg));
    if (res.status === 404) throw new ProviderError('model', `음성 모델(${m})을 쓸 수 없어요. [설정]에서 다른 음성 모델을 골라 주세요.`);
    throw new ProviderError('api', `OpenAI 음성 오류(${res.status}): ${msg.slice(0, 160)}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  cache.set(cacheKey, audio);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return audio;
}
