// AI 설정: 제공자 목록과 키 확인.
// 각자의 키는 브라우저에만 저장되고 서버에는 저장하지 않는다(요청마다 X-AI-Config 헤더로 받음).
// 서버를 켠 사람이 .env에 키를 넣어 두면 '공용 키'로 쓰인다.
import Anthropic from '@anthropic-ai/sdk';
import { PROVIDERS, ORDER, activeProvider, verify, ProviderError, listOpenAIModels, keyOf } from './providers.js';


export class KeyError extends Error {}


/** 키·모델이 쓸 수 있는지 확인만 한다 (저장하지 않음). 브라우저 저장 방식에서 쓴다. */
export async function verifyOnly({ id, key, model }) {
  const p = PROVIDERS[id];
  if (!p) throw new KeyError('알 수 없는 AI예요.');
  const k = cleanKey(key);
  const m = String(model || '').trim() || p.defaultModel;
  if (p.keyEnv && !k) throw new KeyError('API 키를 입력해 주세요.');
  if (k) checkFormat(id, k);
  if (!/^[\w.:/-]+$/.test(m)) throw new KeyError('모델 이름에는 영문, 숫자, . : / - _ 만 쓸 수 있어요.');
  try {
    const warning = id === 'claude' ? await verifyClaude(k, m) : await verify(id, k, m);
    return { ok: true, key: k, model: m, warning };
  } catch (err) {
    if (err instanceof ProviderError) throw new KeyError(err.message);
    throw err;
  }
}

export function settingsStatus() {
  const active = activeProvider();
  return {
    active,
    providers: ORDER.map((id) => {
      const p = PROVIDERS[id];
      return {
        id, label: p.label, note: p.note, url: p.url, urlLabel: p.urlLabel,
        needsKey: Boolean(p.keyEnv), keyHint: p.keyHint || '',
        hasKey: p.keyEnv ? Boolean(process.env[p.keyEnv]) : null,
        defaultModel: process.env[p.modelEnv] || p.defaultModel,
        suggestions: p.suggestions || [],
      };
    }),
  };
}

/** 복사할 때 따라오는 공백·줄바꿈·보이지 않는 글자(폭 0 문자 등)와 따옴표를 지운다 */
export function cleanKey(raw) {
  return String(raw || '').replace(/[\s\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, '').replace(/^["'`]+|["'`]+$/g, '');
}

function checkFormat(id, key) {
  if (!/^[\x21-\x7e]+$/.test(key)) {
    throw new KeyError('키에 한글이나 특수 문자가 섞여 있어요. 키는 영문·숫자·기호로만 되어 있어요. 발급 화면의 [Copy] 버튼으로 다시 복사해 붙여넣어 주세요.');
  }
  const looksGoogle = key.startsWith('AIza') || key.startsWith('AQ.');
  if (id === 'claude' && !key.startsWith('sk-ant-')) {
    throw new KeyError(looksGoogle
      ? '이 값은 Google(Gemini) 키로 보여요. Google Gemini 칸에 넣어 주세요. Claude 키는 sk-ant-로 시작해요.'
      : 'Claude API 키는 sk-ant-로 시작해요. Claude Console의 API Keys 메뉴에서 만든 키인지 확인해 주세요.');
  }
  if (id === 'openai' && (!key.startsWith('sk-') || key.startsWith('sk-ant-'))) {
    throw new KeyError(key.startsWith('sk-ant-') ? '이 값은 Claude 키예요. Claude 칸에 넣어 주세요.' : 'OpenAI API 키는 sk-로 시작해요.');
  }
  if (id === 'huggingface' && !key.startsWith('hf_')) {
    throw new KeyError('Hugging Face 토큰은 hf_로 시작해요. Settings → Access Tokens에서 만든 토큰인지 확인해 주세요.');
  }
  if (id === 'gemini' && key.startsWith('sk-')) {
    throw new KeyError('이 값은 Claude나 OpenAI 키로 보여요. 알맞은 칸에 넣어 주세요.');
  }
}

async function verifyClaude(key, model) {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15000 }).models.retrieve(model);
    return null;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new KeyError('Claude가 이 키를 거부했어요. 삭제된 키이거나 복사가 잘못됐을 수 있어요.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new KeyError('이 키로는 쓸 수 없는 계정이에요. Console에서 결제(크레딧)와 키 권한을 확인해 주세요.');
    if (err instanceof Anthropic.NotFoundError) return `키는 확인했지만 ${model} 모델을 찾지 못했어요. 모델 이름을 확인해 주세요.`;
    return '저장했지만 지금 Claude 서버에 연결해 확인하지는 못했어요. 인터넷 연결을 확인해 주세요.';
  }
}

/** OpenAI 계정에서 쓸 수 있는 모델 (분석용·음성용, 높은 버전부터). 키는 요청 본문 또는 브라우저 설정의 키 */
export async function openaiModels({ key } = {}) {
  const k = cleanKey(key) || keyOf('openai');
  if (!k) throw new KeyError('OpenAI 키를 먼저 넣어 주세요.');
  try {
    return await listOpenAIModels(k);
  } catch (err) {
    if (err instanceof ProviderError) throw new KeyError(err.message);
    throw new KeyError('OpenAI 모델 목록을 받지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
}
