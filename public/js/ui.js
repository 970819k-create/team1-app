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

export async function api(path, body) {
  let res;
  try {
    res = await fetch(path, body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_) {
    throw new Error('서버에 연결하지 못했어요. 터미널에서 서버(npm start)가 켜져 있는지 확인해 주세요.');
  }
  let data = {};
  try { data = await res.json(); } catch (_) { /* 무시 */ }
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

export const TYPE_LABEL = { motivation: '지원 동기', role_fit: '직무 적합', experience: '경험', company: '기업 이해', behavioral: '협업·태도' };
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
