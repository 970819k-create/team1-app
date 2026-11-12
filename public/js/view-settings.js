// 설정: 쓸 AI 고르기, 키·모델 넣기/바꾸기/지우기
// 키는 이 브라우저에만 저장한다. 서버에는 저장하지 않고, AI를 부를 때마다 그 요청에만 함께 보낸다.
// 그래서 팀원이 같은 서버에 접속해도 각자 자기 키와 AI를 쓴다.
import * as store from './store.js';
import { $, esc, api, toast, confirmBox } from './ui.js';

let meta = null; // 서버가 알려 주는 제공자 목록과 서버 기본 키 여부
let onChanged = () => {};

export function setSettingsListener(fn) { onChanged = fn; }

const mask = (k) => (k ? (k.length > 16 ? `${k.slice(0, 8)}…${k.slice(-4)}` : '••••') : '');

/** 지금 이 브라우저에서 쓰는 AI */
function current() {
  const c = store.aiConfig();
  if (c.provider) return { id: c.provider, from: 'browser' };
  return { id: meta.active, from: 'server' };
}

function ready(p, c) {
  return !p.needsKey || Boolean(c.keys[p.id]) || p.hasKey;
}

export async function renderSettings(view) {
  view.innerHTML = '<p class="muted center pad">불러오는 중…</p>';
  try {
    // 서버 기본값을 보려고 이 브라우저 설정 없이 요청한다
    const res = await fetch('/api/settings');
    if (res.status === 404) throw new Error('서버가 옛 버전으로 켜져 있어요. 서버 창에서 Ctrl + C를 누른 뒤 npm start로 다시 켜고 새로고침해 주세요.');
    meta = await res.json();
  } catch (err) {
    view.innerHTML = `<div class="alert error"><p><b>${esc(err.message || '서버에 연결하지 못했어요.')}</b></p></div>`;
    return;
  }
  draw(view);
}

function draw(view, notes = {}) {
  const c = store.aiConfig();
  const cur = current();
  view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">설정</span>
        <h1>분석·피드백에 쓸 AI</h1>
        <p class="muted">키를 넣고 [확인하고 저장]을 누른 뒤, 쓸 AI에서 [이 AI 사용]을 누르세요. 키는 <b>이 브라우저에만</b> 저장돼요.</p>
      </div>
    </div>
    <div class="provider-list">
      ${meta.providers.map((p) => card(p, c, cur.id === p.id && ready(p, c), notes[p.id])).join('')}
    </div>
    <details class="card notice small">
      <summary>키는 어디에 저장되나요?</summary>
      <ul>
        <li>키는 지금 쓰는 <b>이 브라우저에만</b> 저장돼요. 다른 브라우저나 다른 컴퓨터에서는 다시 넣어야 해요.</li>
        <li>서버에는 저장되지 않아요. AI를 부를 때마다 그 요청에만 함께 보내요. 그래서 팀원이 같은 서버에 접속해도 각자 자기 키를 써요.</li>
        <li>다른 사람과 같이 쓰는 컴퓨터라면 다 쓴 뒤 [키 삭제]를 눌러 주세요.</li>
        <li>키를 채팅이나 메신저에 보여 줬다면, 발급한 곳에서 지우고 새로 만드세요.</li>
      </ul>
    </details>`;
}

function card(p, c, active, note) {
  const myKey = c.keys[p.id];
  const myModel = c.models[p.id] || '';
  const canUse = ready(p, c);
  const keyState = myKey ? `저장됨: ${mask(myKey)}` : p.hasKey ? '서버에 넣어 둔 공용 키를 써요' : '';
  return `
    <section class="card provider ${active ? 'active' : ''}" data-provider="${p.id}">
      <header class="row between wrap gap-s">
        <div>
          <h2>${esc(p.label)}</h2>
          <p class="small muted">${esc(p.note)}</p>
        </div>
        ${active ? '<span class="badge ai">사용 중</span>'
          : `<button class="btn small ${canUse ? 'primary' : 'ghost'}" data-action="use-provider" data-id="${p.id}" ${canUse ? '' : 'disabled title="키를 먼저 저장하세요"'}>이 AI 사용</button>`}
      </header>
      <form class="provider-form" data-form="provider" data-id="${p.id}">
        ${p.needsKey ? `
          <label class="field-label" for="key-${p.id}">API 키 <span class="opt">${esc(p.keyHint)}</span></label>
          <div class="row gap-s">
            <input id="key-${p.id}" class="input" type="password" autocomplete="off" spellcheck="false"
              placeholder="${keyState ? `${esc(keyState)} (바꾸려면 새 키 입력)` : '키를 붙여넣으세요'}">
            <button type="button" class="btn ghost small" data-action="toggle-key" data-id="${p.id}">보기</button>
          </div>` : ''}
        <label class="field-label" for="model-${p.id}">모델 <span class="opt">비우면 기본값 ${esc(p.defaultModel)}</span></label>
        <input id="model-${p.id}" class="input" autocomplete="off" spellcheck="false" value="${esc(myModel)}" placeholder="${esc(p.defaultModel)}">
        ${note ? `<p class="alert ${note.error ? 'error' : 'info'} small">${esc(note.text)}</p>` : ''}
        <div class="row gap-s wrap provider-actions">
          <button class="btn primary small" type="submit">${p.needsKey ? '확인하고 저장' : '연결 확인하고 사용'}</button>
          ${myKey ? `<button type="button" class="btn ghost small" data-action="delete-key" data-id="${p.id}">키 삭제</button>` : ''}
          <a class="small" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.urlLabel)} ↗</a>
        </div>
        ${p.id === 'ollama' ? `<p class="hint">Ollama는 <b>서버를 켠 컴퓨터</b>에서 실행돼야 해요. 설치 후 명령 프롬프트에서 <code>ollama pull ${esc(myModel || p.defaultModel)}</code>를 한 번 실행해 모델을 받아 두세요. Hugging Face의 GGUF 모델도 <code>ollama pull hf.co/사용자/모델</code> 형식으로 받을 수 있어요.</p>` : ''}
      </form>
    </section>`;
}

export async function onSettingsAction(btn, view) {
  const id = btn.dataset.id;
  switch (btn.dataset.action) {
    case 'toggle-key': {
      const input = $(`#key-${id}`);
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.textContent = input.type === 'password' ? '보기' : '숨기기';
      return true;
    }
    case 'use-provider':
      if (id === 'ollama') {
        // 키가 없는 Ollama는 실제로 켜져 있는지 확인한 뒤에만 고른다
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 확인 중…';
        try {
          const r = await api('/api/settings/verify', { id, model: store.aiConfig().models.ollama || '' });
          if (r.warning) { draw(view, { ollama: { text: r.warning } }); return true; }
        } catch (err) {
          draw(view, { ollama: { error: true, text: err.message } });
          return true;
        }
      }
      store.setAiConfig((c) => { c.provider = id; });
      draw(view);
      toast(`이제 ${meta.providers.find((p) => p.id === id).label}를 써요.`);
      onChanged();
      return true;
    case 'delete-key': {
      const p = meta.providers.find((x) => x.id === id);
      if (!await confirmBox(`이 브라우저에 저장한 ${p.label} 키를 지울까요?`, { ok: '삭제', danger: true })) return true;
      store.setAiConfig((c) => {
        delete c.keys[id];
        if (c.provider === id && !p.hasKey) c.provider = null;
      });
      draw(view);
      toast('키를 지웠어요.');
      onChanged();
      return true;
    }
    default: return false;
  }
}

export async function onSettingsSubmit(form, view) {
  if (form.dataset.form !== 'provider') return false;
  const id = form.dataset.id;
  const p = meta.providers.find((x) => x.id === id);
  const c = store.aiConfig();
  const typed = $(`#key-${id}`)?.value.trim() || '';
  const key = typed || c.keys[id] || '';
  const model = $(`#model-${id}`).value.trim();
  if (p.needsKey && !key && !p.hasKey) {
    draw(view, { [id]: { error: true, text: 'API 키를 입력해 주세요.' } });
    $(`#key-${id}`)?.focus();
    return true;
  }
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 연결 확인 중…';
  try {
    // 공용 키만 있고 내 키가 없으면 키 확인은 건너뛴다(서버 키는 브라우저로 보내지 않음)
    const r = key || !p.needsKey ? await api('/api/settings/verify', { id, key, model }) : { warning: null };
    store.setAiConfig((cfg) => {
      if (p.needsKey && typed) cfg.keys[id] = r.key;
      if (model && model !== p.defaultModel) cfg.models[id] = model; else delete cfg.models[id];
      const cur = cfg.provider;
      if (!cur || id === 'ollama' || !(cfg.keys[cur] || meta.providers.find((x) => x.id === cur)?.hasKey)) cfg.provider = id;
    });
    draw(view, r.warning ? { [id]: { text: r.warning } } : {});
    toast(r.warning ? '저장했어요. 안내 문구를 확인해 주세요.' : '연결을 확인하고 이 브라우저에 저장했어요.', 4500);
    onChanged();
  } catch (err) {
    draw(view, { [id]: { error: true, text: err.message } });
    if (typed) $(`#key-${id}`).value = typed;
  }
  return true;
}
