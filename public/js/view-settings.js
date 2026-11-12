// 설정: 쓸 AI 고르기, 키·모델 넣기/바꾸기/지우기
import { $, esc, api, toast, confirmBox } from './ui.js';

let data = null;
let onChanged = () => {};

export function setSettingsListener(fn) { onChanged = fn; }

export async function renderSettings(view) {
  view.innerHTML = '<p class="muted center pad">불러오는 중…</p>';
  try {
    data = await api('/api/settings');
  } catch (err) {
    view.innerHTML = `<div class="alert error"><p>${esc(err.message)}</p></div>`;
    return;
  }
  draw(view);
}

function draw(view, warnings = {}) {
  view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">설정</span>
        <h1>분석·피드백에 쓸 AI</h1>
        <p class="muted">하나를 골라 [이 AI 사용]을 누르세요. 키는 언제든 바꾸거나 지울 수 있어요.</p>
      </div>
    </div>
    <div class="provider-list">
      ${data.providers.map((p) => card(p, data.active === p.id, warnings[p.id])).join('')}
    </div>
    <details class="card notice small">
      <summary>키는 어디에 저장되나요?</summary>
      <ul>
        <li>키는 서버를 켠 이 컴퓨터의 <code>.env</code> 파일에만 저장되고, 화면에는 앞뒤 몇 글자만 보여요.</li>
        <li>키 설정은 서버를 켠 컴퓨터의 브라우저에서만 바꿀 수 있어요.</li>
        <li>키를 다른 사람이나 채팅에 보여 줬다면 발급한 곳에서 지우고 새로 만드세요.</li>
      </ul>
    </details>`;
}

function card(p, active, warning) {
  const ready = p.needsKey ? p.hasKey : true;
  return `
    <section class="card provider ${active ? 'active' : ''}" data-provider="${p.id}">
      <header class="row between wrap gap-s">
        <div>
          <h2>${esc(p.label)}</h2>
          <p class="small muted">${esc(p.note)}</p>
        </div>
        ${active ? '<span class="badge ai">사용 중</span>'
          : `<button class="btn small ${ready ? 'primary' : 'ghost'}" data-action="use-provider" data-id="${p.id}" ${ready ? '' : 'disabled title="키를 먼저 저장하세요"'}>이 AI 사용</button>`}
      </header>
      <form class="provider-form" data-form="provider" data-id="${p.id}">
        ${p.needsKey ? `
          <label class="field-label" for="key-${p.id}">API 키 <span class="opt">${esc(p.keyHint)}</span></label>
          <div class="row gap-s">
            <input id="key-${p.id}" class="input" type="password" autocomplete="off" spellcheck="false"
              placeholder="${p.hasKey ? `저장됨: ${esc(p.preview)} (바꾸려면 새 키 입력)` : '키를 붙여넣으세요'}">
            <button type="button" class="btn ghost small" data-action="toggle-key" data-id="${p.id}" aria-label="키 보기">보기</button>
          </div>` : ''}
        <label class="field-label" for="model-${p.id}">모델 <span class="opt">비우면 기본값 ${esc(p.defaultModel)}</span></label>
        <input id="model-${p.id}" class="input" autocomplete="off" spellcheck="false" value="${esc(p.model === p.defaultModel ? '' : p.model)}" placeholder="${esc(p.defaultModel)}">
        ${warning ? `<p class="alert info small">${esc(warning)}</p>` : ''}
        <div class="row gap-s wrap provider-actions">
          <button class="btn primary small" type="submit">${p.needsKey ? '저장하고 연결 확인' : '연결 확인하고 사용'}</button>
          ${p.needsKey && p.hasKey ? `<button type="button" class="btn ghost small" data-action="delete-key" data-id="${p.id}">키 삭제</button>` : ''}
          <a class="small" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.urlLabel)} ↗</a>
        </div>
        ${p.id === 'ollama' ? `<p class="hint">설치 후 명령 프롬프트에서 <code>ollama pull ${esc(p.model)}</code> 를 한 번 실행해 모델을 받아 두세요. Hugging Face의 GGUF 모델도 <code>ollama pull hf.co/사용자/모델</code> 형식으로 받을 수 있어요.</p>` : ''}
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
      try {
        data = await api('/api/settings/active', { id });
        draw(view);
        toast(`이제 ${data.providers.find((p) => p.id === id).label}를 써요.`);
        onChanged();
      } catch (err) { toast(err.message, 6000); }
      return true;
    case 'delete-key': {
      const p = data.providers.find((x) => x.id === id);
      if (!await confirmBox(`${p.label} 키를 이 컴퓨터에서 지울까요?`, { ok: '삭제', danger: true })) return true;
      try {
        data = await api('/api/settings/delete', { id });
        draw(view);
        toast('키를 지웠어요.');
        onChanged();
      } catch (err) { toast(err.message, 6000); }
      return true;
    }
    default: return false;
  }
}

export async function onSettingsSubmit(form, view) {
  if (form.dataset.form !== 'provider') return false;
  const id = form.dataset.id;
  const btn = form.querySelector('button[type=submit]');
  const key = $(`#key-${id}`)?.value.trim() || '';
  const model = $(`#model-${id}`).value.trim();
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 연결 확인 중…';
  try {
    data = await api('/api/settings/provider', { id, key, model });
    draw(view, data.warning ? { [id]: data.warning } : {});
    toast(data.warning ? '저장했어요. 안내 문구를 확인해 주세요.' : '저장하고 연결을 확인했어요.', 4500);
    onChanged();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '저장하고 연결 확인';
    const box = form.querySelector('.form-error') || Object.assign(document.createElement('p'), { className: 'alert error small form-error' });
    box.textContent = err.message;
    form.querySelector('.provider-actions').before(box);
  }
  return true;
}
