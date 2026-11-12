// AI 설정: 화면에서 AI 제공자를 고르고, 키와 모델을 넣고 바꾸고 지울 수 있게 한다.
// 키는 이 컴퓨터의 .env 파일에만 저장되고, 화면에는 앞뒤 몇 글자만 보여 준다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { resetClient } from './ai.js';
import { PROVIDERS, ORDER, activeProvider, hasKey, keyOf, modelOf, verify, ProviderError } from './providers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');

export class KeyError extends Error {}

function mask(key) {
  if (!key) return null;
  return key.length > 16 ? `${key.slice(0, 8)}…${key.slice(-4)}` : '••••';
}

/** .env에서 한 줄만 바꾸거나 넣거나 지운다(value=null). 다른 줄은 그대로 둔다. */
function setEnv(name, value) {
  let text = '';
  try { text = fs.readFileSync(ENV_FILE, 'utf8'); } catch { /* 새로 만든다 */ }
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => new RegExp(`^\\s*${name}\\s*=`).test(l));
  if (value === null || value === undefined || value === '') {
    if (i >= 0) lines.splice(i, 1);
    delete process.env[name];
  } else {
    if (i >= 0) lines[i] = `${name}=${value}`;
    else lines.push(`${name}=${value}`);
    process.env[name] = value;
  }
  fs.writeFileSync(ENV_FILE, lines.join('\n').replace(/^\n+/, '').replace(/\n*$/, '\n'));
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
        hasKey: p.keyEnv ? hasKey(id) : null, preview: mask(keyOf(id)),
        model: modelOf(id), defaultModel: p.defaultModel,
      };
    }),
  };
}

function checkFormat(id, key) {
  if (/\s/.test(key)) throw new KeyError('키 중간에 띄어쓰기나 줄바꿈이 들어 있어요. 다시 복사해 붙여넣어 주세요.');
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

/** 키·모델 저장. 키를 새로 넣으면 실제로 연결해 확인한다. */
export async function saveProvider({ id, key, model }) {
  const p = PROVIDERS[id];
  if (!p) throw new KeyError('알 수 없는 AI예요.');
  const newKey = String(key || '').trim().replace(/^["']|["']$/g, '');
  const newModel = String(model || '').trim();
  if (p.keyEnv && !newKey && !hasKey(id)) throw new KeyError('API 키를 입력해 주세요.');
  if (newKey) checkFormat(id, newKey);
  if (newModel && !/^[\w.:/-]+$/.test(newModel)) throw new KeyError('모델 이름에는 영문, 숫자, . : / - _ 만 쓸 수 있어요.');

  const useKey = newKey || keyOf(id);
  const useModel = newModel || p.defaultModel;
  let warning;
  try {
    warning = id === 'claude' ? await verifyClaude(useKey, useModel) : await verify(id, useKey, useModel);
  } catch (err) {
    if (err instanceof ProviderError) throw new KeyError(err.message);
    throw err;
  }

  if (newKey) setEnv(p.keyEnv, newKey);
  setEnv(p.modelEnv, newModel && newModel !== p.defaultModel ? newModel : null);
  // 처음 넣은 키이거나 지금 쓰는 AI가 준비되지 않았으면 이 AI로 바꾼다
  const cur = activeProvider();
  if (!process.env.AI_PROVIDER || !hasKey(cur) || id === 'ollama') setEnv('AI_PROVIDER', id);
  resetClient();
  return { ...settingsStatus(), warning };
}

export function setActive(id) {
  if (!PROVIDERS[id]) throw new KeyError('알 수 없는 AI예요.');
  if (!hasKey(id)) throw new KeyError(`${PROVIDERS[id].label} 키를 먼저 저장해 주세요.`);
  setEnv('AI_PROVIDER', id);
  resetClient();
  return settingsStatus();
}

export function deleteKey(id) {
  const p = PROVIDERS[id];
  if (!p) throw new KeyError('알 수 없는 AI예요.');
  if (p.keyEnv) setEnv(p.keyEnv, null);
  if (process.env.AI_PROVIDER === id) setEnv('AI_PROVIDER', null);
  resetClient();
  return settingsStatus();
}
