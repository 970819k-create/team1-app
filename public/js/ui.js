// 화면 공통 도구
import * as store from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** [자리 표시자]를 눈에 띄게 표시 */
export const withPlaceholders = (s) => esc(s).replace(/\[([^\]]{1,80})\]/g, '<mark class="ph">[$1]</mark>');

let toastTimer;
export function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 200);
  }, ms);
}

store.setErrorHandler(() => toast('브라우저 저장 공간이 부족해요. 나의 복습 > 데이터 관리에서 오래된 프로젝트를 지워 주세요.', 6000));

/** 이 브라우저에 저장한 AI 설정을 요청 헤더로 보낸다 (서버는 저장하지 않고 그 요청에만 쓴다) */
const VALID_KEY = /^[\x21-\x7e]+$/;
const VALID_MODEL = /^[\w.:/-]+$/;

function aiHeader() {
  let c = store.aiConfig();
  // 예전에 잘못 저장된 키(한글·보이지 않는 글자 포함)는 지우고 알려 준다
  const bad = Object.keys(c.keys).filter((id) => !VALID_KEY.test(c.keys[id]));
  const badModels = Object.keys(c.models).filter((id) => !VALID_MODEL.test(c.models[id]));
  if (bad.length || badModels.length) {
    c = store.setAiConfig((cfg) => {
      bad.forEach((id) => { delete cfg.keys[id]; });
      badModels.forEach((id) => { delete cfg.models[id]; });
    });
    if (bad.length) setTimeout(() => toast('저장된 키에 쓸 수 없는 글자가 섞여 있어 지웠어요. [설정]에서 키를 다시 넣어 주세요.', 7000), 0);
  }
  if (!c.provider && !Object.keys(c.keys).length) return {};
  // 영문만 들어가지만, 혹시 모를 글자에도 실패하지 않게 UTF-8로 바꿔 base64로 보낸다
  // 모델 목록 같은 화면용 정보는 빼고, 요청에 필요한 것만 보낸다
  const send = { provider: c.provider, keys: c.keys, models: c.models, tts: { engine: c.tts?.engine, voice: c.tts?.voice, model: c.tts?.model } };
  const bytes = new TextEncoder().encode(JSON.stringify(send));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return { 'X-AI-Config': btoa(bin) };
}

/** 음성 파일 요청 (브라우저 AI 설정을 함께 보냄). 실패하면 이유가 담긴 Error */
export async function apiAudio(path, body) {
  let res;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...aiHeader() }, body: JSON.stringify(body) });
  } catch (_) {
    throw Object.assign(new Error('앱 서버에 연결하지 못했어요.'), { code: 'network' });
  }
  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch (_) { /* 무시 */ }
    throw Object.assign(new Error(data.error || `음성 요청 실패 (${res.status})`), { code: data.code || res.status });
  }
  return res.blob();
}

export async function api(path, body) {
  let res;
  let extra = {};
  try {
    extra = aiHeader();
  } catch (_) {
    store.setAiConfig((cfg) => { cfg.keys = {}; cfg.models = {}; cfg.provider = null; });
    throw new Error('저장된 AI 설정을 읽지 못해 초기화했어요. [설정]에서 키를 다시 넣어 주세요.');
  }
  try {
    res = await fetch(path, body === undefined ? { headers: extra } : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify(body),
    });
  } catch (_) {
    throw new Error('앱 서버에 연결하지 못했어요. 서버를 켠 검은 창이 닫혔거나 멈췄을 수 있어요. 그 폴더에서 npm start로 다시 켠 뒤 새로고침해 주세요.');
  }
  let data = {};
  try { data = await res.json(); } catch (_) { /* 무시 */ }
  if (res.status === 404 && (data.code === 'unknown_api' || data.error === '없는 API예요.')) {
    throw Object.assign(new Error('서버가 옛 버전으로 켜져 있어요. 서버 창에서 Ctrl + C를 누른 뒤 npm start로 다시 켜고 새로고침해 주세요.'), { status: 404, code: 'old_server' });
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `요청 실패 (${res.status})`), { status: res.status, code: data.code });
  return data;
}

/** 페이지 안 확인 창. resolve(true/false) */
export function confirmBox(message, { ok = '확인', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <p>${esc(message)}</p>
      <div class="row end">
        <button class="btn ghost" value="no">취소</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" value="yes">${esc(ok)}</button>
      </div>`;
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) dlg.close(b.value);
    });
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'yes');
      dlg.remove();
    });
    dlg.showModal();
  });
}

/* ---------- 출처 ---------- */

export function sourceChips(ids, projectId) {
  if (!ids?.length) return '<span class="src-chip none" title="근거 자료 없음">출처 없음</span>';
  return ids.map((id) => `<button class="src-chip" data-action="source" data-project="${esc(projectId)}" data-source="${esc(id)}" title="근거 자료 ${esc(id)} 보기">${esc(id)}</button>`).join('');
}

export function openSource(project, id) {
  const s = project?.sources?.find((x) => x.id === id);
  if (!s) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog source-dialog';
  dlg.innerHTML = `
    <header class="row between">
      <div>
        <span class="eyebrow">${esc(s.id)} · ${s.kind === 'job' ? '채용공고' : '기업 자료'}</span>
        <h3>${esc(s.title || s.url || '직접 입력한 텍스트')}</h3>
        ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" class="small">원문 링크 열기 ↗</a>` : ''}
      </div>
      <button class="icon-btn" value="close" aria-label="닫기">✕</button>
    </header>
    <pre class="source-text">${esc(s.text || '(읽은 내용 없음)')}</pre>`;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('button[value=close]') || e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

/* ---------- 저장 버튼 ---------- */

export function starExpr(projectId, expr, from) {
  const on = store.isExpressionSaved(projectId, expr.en);
  return `<button class="star ${on ? 'on' : ''}" data-action="save-expr" data-project="${esc(projectId)}" data-from="${esc(from)}"
    data-expr="${esc(JSON.stringify({ en: expr.en, ko: expr.ko, example_en: expr.example_en, example_ko: expr.example_ko }))}"
    aria-pressed="${on}" title="${on ? '복습 목록에서 빼기' : '복습 목록에 저장'}">${on ? '★ 저장됨' : '☆ 저장'}</button>`;
}

export function starQuestion(projectId, q) {
  const on = store.isQuestionSaved(projectId, q.en);
  return `<button class="star ${on ? 'on' : ''}" data-action="save-question" data-project="${esc(projectId)}"
    data-q="${esc(JSON.stringify({ id: q.id, en: q.en, ko: q.ko }))}" aria-pressed="${on}">${on ? '★ 질문 저장됨' : '☆ 질문 저장'}</button>`;
}

/** 공통 클릭 처리 (출처 보기, 저장). 처리했으면 true */
export function handleCommon(btn) {
  const a = btn.dataset.action;
  if (a === 'source') {
    openSource(store.project(btn.dataset.project), btn.dataset.source);
    return true;
  }
  if (a === 'save-expr') {
    const expr = JSON.parse(btn.dataset.expr);
    const on = store.toggleExpression(btn.dataset.project, expr, btn.dataset.from);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on);
    btn.textContent = on ? '★ 저장됨' : '☆ 저장';
    toast(on ? `'${expr.en}'을(를) 복습 목록에 저장했어요.` : '복습 목록에서 뺐어요.');
    return true;
  }
  if (a === 'save-question') {
    const q = JSON.parse(btn.dataset.q);
    const on = store.toggleQuestion(btn.dataset.project, q);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on);
    btn.textContent = on ? '★ 질문 저장됨' : '☆ 질문 저장';
    toast(on ? '질문을 저장했어요. 나의 복습에서 다시 연습할 수 있어요.' : '저장한 질문에서 뺐어요.');
    return true;
  }
  return false;
}

export const TYPE_LABEL = { motivation: '지원 동기', role_fit: '직무 적합', experience: '경험', company: '기업 이해', behavioral: '협업·태도', technical: '직무 지식', reverse: '역질문' };
export const CAT_LABEL = { business: '사업', product: '제품·서비스', trend: '동향', other: '기타' };

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function aiBadge(basic) {
  return basic
    ? '<span class="badge warn" title="API 키가 없어 규칙 기반으로 만든 결과예요">기본 피드백 · AI 미연결</span>'
    : '<span class="badge ai">AI 피드백</span>';
}
