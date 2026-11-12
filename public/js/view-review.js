// ④ 나의 복습: 저장한 표현(뜻 떠올리기, 빈칸 채우기), 저장한 질문 다시 연습, 학습 기록
import * as store from './store.js';
import { speak } from './speech.js';
import { $, esc, toast, confirmBox, fmtDate } from './ui.js';

const ui = { tab: 'expr', project: 'all', activity: null };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 예문에서 표현을 찾아 빈칸으로 만든다. 못 찾으면 null */
function makeBlank(e) {
  if (!e.example_en) return null;
  const i = e.example_en.toLowerCase().indexOf(e.en.toLowerCase());
  if (i < 0) return null;
  return { before: e.example_en.slice(0, i), answer: e.example_en.slice(i, i + e.en.length), after: e.example_en.slice(i + e.en.length) };
}

function projectName(id) {
  return store.project(id)?.name || '삭제된 프로젝트';
}

function filtered(list) {
  return ui.project === 'all' ? list : list.filter((x) => x.projectId === ui.project);
}

export function renderReview(view) {
  const exprs = filtered(store.savedExpressions());
  const qs = filtered(store.savedQuestions());
  const projects = store.projects();

  view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">④ 나의 복습</span>
        <h1>저장한 표현과 질문</h1>
        <p class="muted">분석·연습·면접에서 ☆ 저장한 것만 모여요.</p>
      </div>
      ${projects.length > 1 ? `<label class="small">회사
        <select class="input inline" data-action="filter-project" id="review-project">
          <option value="all">전체</option>
          ${projects.map((p) => `<option value="${esc(p.id)}" ${ui.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select></label>` : ''}
    </div>

    <div class="tabs-inline" role="tablist">
      <button role="tab" class="${ui.tab === 'expr' ? 'on' : ''}" data-action="tab" data-tab="expr" aria-selected="${ui.tab === 'expr'}">표현 ${exprs.length}</button>
      <button role="tab" class="${ui.tab === 'q' ? 'on' : ''}" data-action="tab" data-tab="q" aria-selected="${ui.tab === 'q'}">질문 ${qs.length}</button>
      <button role="tab" class="${ui.tab === 'log' ? 'on' : ''}" data-action="tab" data-tab="log" aria-selected="${ui.tab === 'log'}">학습 기록·데이터</button>
    </div>

    <div id="review-body"></div>`;

  const body = $('#review-body', view);
  if (ui.tab === 'expr') body.innerHTML = ui.activity ? activityHTML() : exprListHTML(exprs);
  else if (ui.tab === 'q') body.innerHTML = questionsHTML(qs);
  else body.innerHTML = logHTML();
  if (ui.activity?.type === 'blank' && !ui.activity.checked) $('#blank-input')?.focus();
}

function exprListHTML(exprs) {
  if (!exprs.length) {
    return `<div class="empty card"><p>아직 저장한 표현이 없어요.</p><p class="small muted">분석 결과나 피드백에서 <b>☆ 저장</b>을 누르면 여기에 모여요.</p></div>`;
  }
  const blanks = exprs.filter(makeBlank).length;
  return `
    <section class="card activity-pick">
      <h2>복습하기</h2>
      <div class="row gap-s wrap">
        <button class="btn primary" data-action="start-flash">뜻 떠올리기 (${exprs.length})</button>
        <button class="btn ghost" data-action="start-blank" ${blanks ? '' : 'disabled title="예문이 있는 표현이 없어요"'}>예문 빈칸 채우기 (${blanks})</button>
      </div>
      <p class="small muted">뜻 떠올리기: 영어 표현을 보고 뜻을 떠올린 뒤 확인해요. 빈칸 채우기: 면접 예문의 빈칸에 표현을 써요.</p>
    </section>
    <ul class="saved-list">${exprs.map((e) => `
      <li class="card">
        <div class="row between gap-s">
          <p><b lang="en">${esc(e.en)}</b> <span class="muted">${esc(e.ko)}</span></p>
          <span class="row gap-s">
            <button class="icon-btn" data-action="say" data-text="${esc(e.en)}" aria-label="${esc(e.en)} 발음 듣기">🔊</button>
            <button class="icon-btn" data-action="del-expr" data-id="${esc(e.id)}" aria-label="삭제" title="삭제">🗑</button>
          </span>
        </div>
        ${e.example_en ? `<p class="small" lang="en">${esc(e.example_en)}</p>` : ''}
        ${e.example_ko ? `<p class="small muted">${esc(e.example_ko)}</p>` : ''}
        <p class="small faint">${esc(projectName(e.projectId))} · ${fmtDate(e.savedAt)} 저장${e.right || e.wrong ? ` · 복습 ✓${e.right} ✗${e.wrong}` : ''}</p>
      </li>`).join('')}</ul>`;
}

function activityHTML() {
  const a = ui.activity;
  if (a.idx >= a.items.length) {
    const ok = a.results.filter(Boolean).length;
    return `
      <section class="card center activity">
        <span class="eyebrow">${a.type === 'flash' ? '뜻 떠올리기' : '빈칸 채우기'} 완료</span>
        <p class="big-num">${ok} / ${a.items.length}</p>
        <p class="muted">${ok === a.items.length ? '모두 맞혔어요!' : '헷갈린 표현은 면접 전에 한 번 더 봐요.'}</p>
        <div class="row gap-s center wrap">
          <button class="btn primary" data-action="${a.type === 'flash' ? 'start-flash' : 'start-blank'}">한 번 더</button>
          <button class="btn ghost" data-action="end-activity">목록으로</button>
        </div>
      </section>`;
  }
  const e = a.items[a.idx];
  const progress = `<div class="row between small muted"><span>${a.type === 'flash' ? '뜻 떠올리기' : '빈칸 채우기'}</span><span>${a.idx + 1} / ${a.items.length}</span></div>
    <span class="bar"><span style="width:${(a.idx / a.items.length) * 100}%"></span></span>`;

  if (a.type === 'flash') {
    return `
      <section class="card activity">
        ${progress}
        <p class="flash-word" lang="en">${esc(e.en)}</p>
        <button class="icon-btn center-self" data-action="say" data-text="${esc(e.en)}" aria-label="발음 듣기">🔊</button>
        ${a.revealed ? `
          <p class="flash-meaning">${esc(e.ko)}</p>
          ${e.example_en ? `<p class="small" lang="en">${esc(e.example_en)}</p><p class="small muted">${esc(e.example_ko)}</p>` : ''}
          <div class="row gap-s center"><button class="btn ghost" data-action="flash-no">헷갈려요</button><button class="btn primary" data-action="flash-yes">알았어요</button></div>`
        : '<p class="muted center">뜻을 떠올린 뒤 확인해 보세요.</p><button class="btn primary wide" data-action="flash-reveal">뜻 보기</button>'}
        <button class="link small" data-action="end-activity">그만하기</button>
      </section>`;
  }
  const b = makeBlank(e);
  return `
    <section class="card activity">
      ${progress}
      <p class="small muted">뜻: ${esc(e.ko)}</p>
      <p class="blank-sentence" lang="en">${esc(b.before)}<span class="blank">${a.checked ? esc(b.answer) : '_____'}</span>${esc(b.after)}</p>
      ${e.example_ko ? `<p class="small muted">${esc(e.example_ko)}</p>` : ''}
      ${a.checked ? `
        <p class="${a.results[a.idx] ? 'ok-text' : 'err-text'}"><b>${a.results[a.idx] ? '정답이에요!' : '아쉬워요.'}</b> 내가 쓴 답: <span lang="en">${esc(a.input || '(비움)')}</span></p>
        <button class="btn primary wide" data-action="blank-next">다음</button>`
      : `<form class="row gap-s" data-form="blank"><input id="blank-input" class="input" lang="en" autocomplete="off" autocapitalize="off" placeholder="빈칸에 들어갈 표현"><button class="btn primary">확인</button></form>`}
      <button class="link small" data-action="end-activity">그만하기</button>
    </section>`;
}

function questionsHTML(qs) {
  if (!qs.length) {
    return `<div class="empty card"><p>아직 저장한 질문이 없어요.</p><p class="small muted">분석 결과, 질문별 연습, 면접 결과에서 <b>☆ 질문 저장</b>을 누르면 여기에 모여요.</p></div>`;
  }
  return `<ul class="saved-list">${qs.map((q) => {
    const p = store.project(q.projectId);
    const planned = p?.analysis?.questions?.find((x) => x.en.trim().toLowerCase() === q.en.trim().toLowerCase());
    const key = planned ? planned.id : q.id;
    return `
      <li class="card">
        <p class="en strong" lang="en">${esc(q.en)}</p>
        ${q.ko ? `<p class="small muted">${esc(q.ko)}</p>` : ''}
        <p class="small faint">${esc(projectName(q.projectId))} · ${fmtDate(q.savedAt)} 저장</p>
        <div class="row gap-s wrap">
          ${p ? `<a class="btn primary small" href="#practice/${esc(p.id)}/${esc(key)}">🎙 다시 연습</a>` : ''}
          <button class="btn ghost small" data-action="say" data-text="${esc(q.en)}">🔊 듣기</button>
          <button class="btn ghost small" data-action="del-q" data-id="${esc(q.id)}">삭제</button>
        </div>
      </li>`;
  }).join('')}</ul>`;
}

function logHTML() {
  const ev = store.events();
  const count = (t) => ev.filter((e) => e.type === t).length;
  const simStart = count('sim_start');
  const simDone = count('sim_complete');
  const answered = count('practice_answer');
  const re = count('re_answer');
  const rows = [
    ['분석 완료', count('analysis_complete'), '자료 입력 후 분석 결과를 확인한 횟수'],
    ['질문별 연습 답변', answered + re, `첫 답변 ${answered}회 · 다시 답하기 ${re}회`],
    ['재답변', re, '답변 예시를 본 뒤 같은 질문에 다시 답한 횟수'],
    ['실전 시뮬레이션', `${simDone} / ${simStart}`, '끝까지 마친 횟수 / 시작한 횟수'],
    ['표현 저장', count('expression_saved'), '복습 목록에 저장한 횟수'],
    ['복습 완료', count('review_complete'), '복습 활동을 끝까지 마친 횟수'],
  ];
  return `
    <section class="card">
      <h2>나의 학습 기록</h2>
      <table class="table"><tbody>${rows.map(([k, v, d]) => `<tr><th scope="row">${k}</th><td class="num">${v}</td><td class="small muted">${d}</td></tr>`).join('')}</tbody></table>
    </section>
    <section class="card">
      <h2>데이터 관리</h2>
      <p class="small muted">자료, 분석 결과, 답변 텍스트, 저장한 표현·질문, 학습 기록은 이 브라우저에만 저장돼요. 회사별 삭제는 처음 화면의 🗑 버튼으로 할 수 있어요.</p>
      <button class="btn danger" data-action="clear-all">모든 데이터 삭제</button>
    </section>`;
}

function startActivity(type) {
  const pool = filtered(store.savedExpressions()).filter((e) => type === 'flash' || makeBlank(e));
  const items = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
  ui.activity = { type, items, idx: 0, results: [], revealed: false, checked: false, input: '' };
}

function advance() {
  const a = ui.activity;
  a.idx++;
  a.revealed = false;
  a.checked = false;
  a.input = '';
  if (a.idx >= a.items.length) store.logEvent('review_complete', null, { activity: a.type, score: a.results.filter(Boolean).length, total: a.items.length });
}

export async function onReviewAction(btn, rerender) {
  const a = ui.activity;
  switch (btn.dataset.action) {
    case 'tab': ui.tab = btn.dataset.tab; ui.activity = null; break;
    case 'say': speak(btn.dataset.text).catch((err) => toast(err.message)); return true;
    case 'del-expr': store.removeExpression(btn.dataset.id); toast('삭제했어요.'); break;
    case 'del-q': store.removeQuestion(btn.dataset.id); toast('삭제했어요.'); break;
    case 'start-flash': startActivity('flash'); break;
    case 'start-blank': startActivity('blank'); break;
    case 'end-activity': ui.activity = null; break;
    case 'flash-reveal': a.revealed = true; break;
    case 'flash-yes': case 'flash-no': {
      const ok = btn.dataset.action === 'flash-yes';
      a.results[a.idx] = ok;
      store.markExpression(a.items[a.idx].id, ok);
      advance();
      break;
    }
    case 'blank-next': advance(); break;
    case 'clear-all':
      if (!await confirmBox('모든 자료, 분석, 연습·면접 기록, 저장한 표현·질문을 지울까요? 되돌릴 수 없어요.', { ok: '모두 삭제', danger: true })) return true;
      store.clearAll();
      toast('모든 데이터를 지웠어요.');
      break;
    default: return false;
  }
  rerender();
  return true;
}

export function onReviewSubmit(form, rerender) {
  if (form.dataset.form !== 'blank') return false;
  const a = ui.activity;
  const e = a.items[a.idx];
  a.input = $('#blank-input').value;
  a.results[a.idx] = norm(a.input) === norm(makeBlank(e).answer);
  store.markExpression(e.id, a.results[a.idx]);
  a.checked = true;
  rerender();
  return true;
}

export function onReviewChange(el, rerender) {
  if (el.dataset.action !== 'filter-project') return false;
  ui.project = el.value;
  ui.activity = null;
  rerender();
  return true;
}
