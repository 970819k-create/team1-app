// ② 기업·직무 분석 결과
import * as store from './store.js';
import { esc, sourceChips, starExpr, starQuestion, fmtDate, TYPE_LABEL, CAT_LABEL } from './ui.js';

let lang = 'both';

function bi(item, pid) {
  return `
    <li class="bi">
      ${lang !== 'en' ? `<p class="ko">${esc(item.ko)}</p>` : ''}
      ${lang !== 'ko' ? `<p class="en" lang="en">${esc(item.en)}</p>` : ''}
      <span class="chips">${sourceChips(item.sources, pid)}</span>
    </li>`;
}

export function renderAnalysis(view, p) {
  const a = p.analysis;
  const id = p.id;
  const statusLabel = { ok: '읽음', short: '내용 부족', failed: '읽지 못함' };
  view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">② 기업·직무 분석 ${p.sample ? '· 샘플' : ''}</span>
        <h1>${esc(a.company_name)}</h1>
        <p class="muted">${esc(p.role || a.role_title)} · ${fmtDate(p.createdAt)} 분석</p>
      </div>
      <div class="seg lang-seg" role="group" aria-label="언어">
        ${[['both', '함께'], ['ko', '한글'], ['en', 'English']].map(([k, l]) => `<button class="${lang === k ? 'on' : ''}" data-action="lang" data-lang="${k}">${l}</button>`).join('')}
      </div>
    </div>

    ${(a.warnings || []).length ? `<div class="alert info">${a.warnings.map((w) => `<p>${esc(w)}</p>`).join('')}</div>` : ''}

    <div class="layout-side">
      <div class="stack">
        <section class="card">
          <h2>핵심 요약</h2>
          <ul class="bi-list">${bi(a.summary, id)}</ul>
        </section>

        <div class="grid-2 tight">
          <section class="card">
            <h2>주요 업무 <span class="muted small">채용공고</span></h2>
            <ul class="bi-list">${a.duties.map((x) => bi(x, id)).join('') || '<li class="muted">확인되지 않음</li>'}</ul>
          </section>
          <section class="card">
            <h2>요구 역량 <span class="muted small">채용공고</span></h2>
            <ul class="bi-list">${a.competencies.map((x) => bi(x, id)).join('') || '<li class="muted">확인되지 않음</li>'}</ul>
          </section>
        </div>

        <section class="card">
          <h2>기업 사업·제품·동향 <span class="muted small">기업 자료</span></h2>
          <ul class="bi-list">${a.company_insights.map((x) => `
            <li class="bi"><span class="tag">${CAT_LABEL[x.category] || '기타'}</span>
              ${lang !== 'en' ? `<p class="ko">${esc(x.ko)}</p>` : ''}${lang !== 'ko' ? `<p class="en" lang="en">${esc(x.en)}</p>` : ''}
              <span class="chips">${sourceChips(x.sources, id)}</span></li>`).join('') || '<li class="muted">기업 자료에서 확인되지 않음</li>'}
          </ul>
        </section>

        ${a.connections?.length ? `<section class="card accent">
          <h2>면접에서 연결할 포인트</h2>
          <ul class="bi-list">${a.connections.map((x) => bi(x, id)).join('')}</ul>
        </section>` : ''}

        <section class="card">
          <h2>확인되지 않음</h2>
          <p class="small muted">아래 내용은 넣은 자료에 없어요. 면접 전에 직접 확인하거나, 면접에서 질문할 거리로 쓸 수 있어요.</p>
          <ul class="dash-list">${(a.not_found || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li class="muted">없음</li>'}</ul>
        </section>

        <section class="card">
          <h2>예상 영어 면접 질문 <span class="muted small">${a.questions.length}개</span></h2>
          <ol class="q-list">${a.questions.map((q) => `
            <li>
              <div class="row between wrap gap-s">
                <span class="tag">${esc(q.id)} · ${TYPE_LABEL[q.type] || q.type}</span>
                <span class="chips">${sourceChips(q.sources, id)}</span>
              </div>
              <p class="en strong" lang="en">${esc(q.en)}</p>
              <p class="ko muted">${esc(q.ko)}</p>
              <p class="small muted">왜 묻나요? ${esc(q.intent_ko)}</p>
              <div class="row gap-s wrap">
                <a class="btn ghost small" href="#practice/${esc(id)}/${esc(q.id)}">이 질문 연습</a>
                ${starQuestion(id, q)}
              </div>
            </li>`).join('')}</ol>
        </section>

        <section class="card">
          <h2>면접 표현 <span class="muted small">저장하면 나의 복습에서 반복해요</span></h2>
          <ul class="expr-list">${a.expressions.map((x) => `
            <li>
              <div class="row between gap-s">
                <p><b lang="en">${esc(x.en)}</b> <span class="muted">${esc(x.ko)}</span></p>
                ${starExpr(id, x, 'analysis')}
              </div>
              <p class="small" lang="en">${esc(x.example_en)}</p>
              <p class="small muted">${esc(x.example_ko)} <span class="chips">${sourceChips(x.sources, id)}</span></p>
            </li>`).join('')}</ul>
        </section>
      </div>

      <aside class="side stack">
        <section class="card cta">
          <h2>③ AI 면접 시작</h2>
          <a class="mode-card" href="#practice/${esc(id)}">
            <b>질문별 연습</b>
            <span class="small muted">질문을 하나씩 듣고 답한 뒤, 답변 예시와 개선할 표현을 확인해요.</span>
          </a>
          <a class="mode-card strong" href="#interview/${esc(id)}">
            <b>실전 면접 시뮬레이션</b>
            <span class="small muted">AI 면접관과 영어로 연속 대화해요. 피드백은 면접이 끝난 뒤 보여 줘요.</span>
          </a>
        </section>
        <section class="card">
          <h2>참고한 자료</h2>
          <ul class="source-status">${p.sources.map((s) => `
            <li>
              <button class="src-chip" data-action="source" data-project="${esc(id)}" data-source="${esc(s.id)}">${esc(s.id)}</button>
              <span class="small"><b>${s.kind === 'job' ? '채용공고' : '기업 자료'}</b> · ${esc(statusLabel[s.status] || '')}<br>
              <span class="muted break">${esc(s.title || s.url || '직접 입력한 텍스트')}</span></span>
            </li>`).join('')}</ul>
          <p class="small muted">S1, S2 같은 표시를 누르면 근거가 된 원문을 볼 수 있어요. 생성 결과가 원문과 다르면 원문을 믿어 주세요.</p>
        </section>
        ${p.sessions?.length ? `<section class="card">
          <h2>지난 실전 면접</h2>
          <ul class="plain">${p.sessions.slice().reverse().map((s) => `<li><a href="#result/${esc(id)}/${esc(s.id)}">${fmtDate(s.startedAt)} · 질문 ${s.pairs?.length || 0}개</a></li>`).join('')}</ul>
        </section>` : ''}
      </aside>
    </div>`;
}

export function onAnalysisAction(btn, rerender) {
  if (btn.dataset.action === 'lang') {
    lang = btn.dataset.lang;
    rerender();
    return true;
  }
  return false;
}
