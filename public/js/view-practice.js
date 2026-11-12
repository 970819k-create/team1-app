// ③-A 질문별 연습: 질문 듣기 → 음성 답변 → 인식 텍스트 수정 → 예시·개선 표현 확인 → 다시 답하기
import * as store from './store.js';
import { speak, stopSpeaking, Listener, sttSupported, INTERVIEWER_VOICES } from './speech.js';
import { interviewerCategories, bankQuestion } from './bank.js';
import { bankSourceChip } from './view-interview.js';
import { $, esc, api, toast, sourceChips, starExpr, starQuestion, withPlaceholders, TYPE_LABEL, aiBadge } from './ui.js';

const ctx = { pid: null, key: null, listener: null, listening: false, interim: '', draft: '', loading: false, hideText: false, startedFor: null };

/** 연습할 질문 목록: 분석에서 만든 질문 + 이 프로젝트에서 저장한 다른 질문(후속 질문 등) */
const bankLabel = (q) => `${q.category.split(/[\s(/]/)[0]} ${q.id.split('-').pop()}`;
const asBank = (q) => ({ ...q, key: q.id, bank: true, label: bankLabel(q), intent_ko: q.note || `영어 면접 질문지 · ${q.category}`, sources: [] });

function questionList(p, key) {
  const base = p.analysis.questions.map((q) => ({ ...q, key: q.id }));
  const extra = store.savedQuestions()
    .filter((s) => s.projectId === p.id && !base.some((b) => b.en.trim().toLowerCase() === s.en.trim().toLowerCase()))
    .map((s, i) => ({ id: `S${i + 1}`, key: s.id, en: s.en, ko: s.ko, type: 'experience', intent_ko: '면접에서 저장한 질문이에요.', sources: [], saved: true }));
  // 질문지: 고른 분야의 질문 + 이미 연습한 질문지 질문 + 주소로 직접 연 질문
  const cat = interviewerCategories().find((c) => c.id === ctx.bankCat);
  const bankIds = new Set([
    ...(cat ? cat.questions.map((q) => q.id) : []),
    ...Object.keys(p.practice || {}).filter((k) => /^B\d/.test(k)),
    ...(key && /^B\d/.test(key) ? [key] : []),
  ]);
  const bank = [...bankIds].map(bankQuestion).filter(Boolean).filter((q) => !extra.some((e) => e.en === q.en)).map(asBank);
  return [...base, ...extra, ...bank];
}

/** 실전 면접 설정에서 고른 면접관 목소리를 연습에서도 쓴다 */
function myVoice() {
  const setup = (store.aiConfig().tts || {}).setup || {};
  const n = setup.interviewer || 1;
  return { voice: setup.voice || INTERVIEWER_VOICES[n].voice, gender: INTERVIEWER_VOICES[n].gender };
}

/** 질문지 분야 선택 */
export function onPracticeChange(el, p, go) {
  if (el.dataset.change !== 'bank-cat') return false;
  ctx.bankCat = el.value;
  const cat = interviewerCategories().find((c) => c.id === el.value);
  if (cat) go(`#practice/${p.id}/${cat.questions[0].id}`);
  return true;
}

function attemptsOf(p, key) {
  return p.practice?.[key]?.attempts || [];
}

export function renderPractice(view, p, key) {
  const list = questionList(p, key);
  const q = list.find((x) => x.key === key) || list[0];
  if (ctx.pid !== p.id || ctx.key !== q.key) {
    stopListening();
    Object.assign(ctx, { pid: p.id, key: q.key, draft: '', interim: '', loading: false, retry: false });
  }
  if (ctx.startedFor !== p.id) {
    ctx.startedFor = p.id;
    store.logEvent('practice_start', p.id);
  }
  const attempts = attemptsOf(p, q.key);
  const idx = list.indexOf(q);
  const next = list[idx + 1];

  view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">③ AI 면접 · 질문별 연습</span>
        <h1>${esc(p.analysis.company_name)}</h1>
        <p class="muted"><a href="#p/${esc(p.id)}">← 분석 결과</a> · <a href="#interview/${esc(p.id)}">실전 시뮬레이션으로 →</a></p>
      </div>
    </div>

    <div class="bank-select row gap-s wrap">
      <label class="small" for="bank-cat">영어 면접 질문지로 연습</label>
      <select id="bank-cat" class="input inline" data-change="bank-cat">
        <option value="">분야 고르기</option>
        ${interviewerCategories().map((c) => `<option value="${esc(c.id)}" ${ctx.bankCat === c.id ? 'selected' : ''}>${esc(c.name)} (${c.questions.length})</option>`).join('')}
      </select>
    </div>
    <nav class="q-tabs" aria-label="질문 선택">
      ${list.map((x) => `<a href="#practice/${esc(p.id)}/${esc(x.key)}" class="${x.key === q.key ? 'on' : ''} ${attemptsOf(p, x.key).length ? 'done' : ''}"
        aria-current="${x.key === q.key ? 'page' : 'false'}" ${x.bank ? 'data-bank="1"' : ''}>${x.saved ? '★' : ''}${x.bank ? '📘 ' : ''}${esc(x.label || x.id)}${attemptsOf(p, x.key).length ? ' ✓' : ''}</a>`).join('')}
    </nav>

    <div class="layout-side">
      <div class="stack">
        <section class="card question-card">
          <div class="row between wrap gap-s">
            <span class="tag">${q.bank ? `질문지 · ${esc(q.category)}` : `${esc(q.id)} · ${TYPE_LABEL[q.type] || '질문'}`}</span>
            <span class="row gap-s wrap">${q.bank ? bankSourceChip(q) : `<span class="chips">${sourceChips(q.sources, p.id)}</span>`}${starQuestion(p.id, q)}</span>
          </div>
          <p class="q-text en ${ctx.hideText ? 'blurred' : ''}" lang="en">${esc(q.en)}</p>
          <div class="row gap-s wrap">
            <button class="btn primary" data-action="play-q">🔊 질문 듣기</button>
            <button class="btn ghost" data-action="toggle-text">${ctx.hideText ? '질문 텍스트 보기' : '텍스트 가리고 듣기만'}</button>
          </div>
          <details class="ko-help">
            <summary>한국어 뜻과 질문 의도</summary>
            <p>${esc(q.ko)}</p>
            <p class="small muted">${esc(q.intent_ko || '')}</p>
          </details>
        </section>

        <section class="card" id="answer-card"></section>
        <div id="feedback-area"></div>
      </div>

      <aside class="side stack">
        <section class="card">
          <h2>답변 기록 <span class="muted small">${attempts.length}회</span></h2>
          ${attempts.length ? `<ol class="attempts">${attempts.map((at, i) => `
            <li><span class="eyebrow">${i + 1}차 답변</span><p class="small" lang="en">${esc(at.answer)}</p></li>`).join('')}</ol>`
            : '<p class="small muted">아직 답하지 않았어요.</p>'}
        </section>
        ${next ? `<a class="btn ghost wide" href="#practice/${esc(p.id)}/${esc(next.key)}">다음 질문 (${esc(next.id)}) →</a>` : `<a class="btn ghost wide" href="#interview/${esc(p.id)}">실전 시뮬레이션 해 보기 →</a>`}
      </aside>
    </div>`;

  renderAnswer(p, q);
  renderFeedback(p, q);
}

function renderAnswer(p, q) {
  const el = $('#answer-card');
  if (!el) return;
  const attempts = attemptsOf(p, q.key);
  const showingLast = !ctx.draft && !ctx.listening && attempts.length && !ctx.retry;
  const label = `${attempts.length + (showingLast ? 0 : 1)}차 답변${attempts.length && !showingLast ? ' · 다시 답하기' : ''}`;

  if (showingLast) {
    el.innerHTML = `
      <div class="row between"><h2>${attempts.length}차 답변</h2><span class="small muted">피드백 확인 후 같은 질문에 다시 답해 보세요</span></div>
      <p class="answer-text" lang="en">${esc(attempts.at(-1).answer)}</p>
      <button class="btn primary" data-action="retry">🎙 같은 질문에 다시 답하기</button>`;
    return;
  }

  el.innerHTML = `
    <h2>${label}</h2>
    ${ctx.listening ? `
      <div class="rec-box" role="status">
        <span class="rec-dot" aria-hidden="true"></span>
        <div>
          <b>마이크 켜짐 · 듣는 중</b>
          <p class="small muted">영어로 답하고, 말을 마치면 [답변 끝내기]를 눌러 주세요.</p>
          <p class="live" lang="en">${esc(ctx.draft)} <span class="interim">${esc(ctx.interim)}</span></p>
        </div>
      </div>
      <button class="btn danger" data-action="stop-rec">■ 답변 끝내기</button>`
    : `
      ${sttSupported ? '<button class="btn primary big" data-action="start-rec">🎙 음성으로 답하기</button>' : '<p class="alert info small">이 브라우저는 음성 인식을 지원하지 않아요. Chrome이나 Edge에서 열면 음성으로 답할 수 있어요. 지금은 키보드로 입력해 주세요.</p>'}
      <label class="field-label" for="answer-text">${ctx.draft ? '인식된 답변 — 틀리게 인식된 부분은 고쳐 주세요' : '또는 키보드로 입력'}</label>
      <textarea id="answer-text" class="input" rows="5" lang="en" placeholder="Type your answer in English...">${esc(ctx.draft)}</textarea>
      <div class="row gap-s wrap">
        <button class="btn primary" data-action="get-feedback" ${ctx.loading ? 'disabled' : ''}>${ctx.loading ? '<span class="spinner"></span> 피드백 만드는 중…' : '피드백 받기'}</button>
        ${ctx.draft && sttSupported ? '<button class="btn ghost" data-action="start-rec-append">🎙 이어서 말하기</button>' : ''}
        ${ctx.retry ? '<button class="btn ghost" data-action="cancel-retry">취소</button>' : ''}
      </div>`}`;
}

function renderFeedback(p, q) {
  const el = $('#feedback-area');
  if (!el) return;
  const at = attemptsOf(p, q.key).at(-1);
  if (!at?.feedback || ctx.retry) { el.innerHTML = ''; return; }
  const f = at.feedback;
  el.innerHTML = `
    <section class="kkamja-feedback" aria-label="깜자의 답변 피드백"><img src="/images/kkamja-consultant.png" alt=""><div><b>깜자의 피드백</b><p>${esc(f.strengths_ko?.[0] || '답변을 확인했어요. 아래에서 표현과 답변 예시를 함께 살펴봐요.')}</p><span>${f.basic ? '기본 피드백' : '답변을 바탕으로 정리했어요'}</span></div></section>
    <section class="card feedback">
      <div class="row between wrap gap-s"><h2>피드백</h2>${aiBadge(f.basic)}</div>
      ${f.strengths_ko?.length ? `<h3>잘한 점</h3><ul class="check-list">${f.strengths_ko.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${f.improvements?.length ? `<h3>개선할 표현</h3><ul class="fix-list">${f.improvements.map((x) => `
        <li>
          <p><del lang="en">${esc(x.original)}</del> → <ins lang="en">${esc(x.better)}</ins></p>
          <p class="small muted">${esc(x.reason_ko)}</p>
          ${starExpr(p.id, { en: x.better, ko: x.reason_ko, example_en: '', example_ko: '' }, 'practice')}
        </li>`).join('')}</ul>` : '<h3>개선할 표현</h3><p class="small muted">눈에 띄는 표현 오류는 없어요.</p>'}
      ${f.structure_tips_ko?.length ? `<h3>답변 구조 팁</h3><ul class="dash-list">${f.structure_tips_ko.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      <h3>답변 예시 <span class="badge">참고용 · 정답이 하나만 있는 건 아니에요</span></h3>
      <div class="sample">
        <p lang="en">${withPlaceholders(f.sample_answer_en)}</p>
        <p class="small muted">${withPlaceholders(f.sample_answer_ko)}</p>
        <p class="small hint">노란 [대괄호]는 내 경험으로 채울 부분이에요. 입력하지 않은 경력을 지어내지 않았어요.</p>
        <button class="btn ghost small" data-action="play-sample">🔊 예시 듣기</button>
      </div>
      ${f.expressions?.length ? `<h3>다시 쓸 만한 표현</h3><ul class="expr-list">${f.expressions.map((x) => `
        <li><div class="row between gap-s"><p><b lang="en">${esc(x.en)}</b> <span class="muted">${esc(x.ko)}</span></p>${starExpr(p.id, x, 'practice')}</div>
        ${x.example_en ? `<p class="small" lang="en">${esc(x.example_en)}</p>` : ''}</li>`).join('')}</ul>` : ''}
    </section>`;
}

function stopListening() {
  if (ctx.listener) {
    const text = ctx.listener.stop();
    ctx.listener = null;
    if (text) ctx.draft = text;
  }
  ctx.listening = false;
  ctx.interim = '';
}

function startListening(p, q, append) {
  stopSpeaking();
  const prev = append ? ($('#answer-text')?.value || ctx.draft) : '';
  ctx.draft = prev;
  ctx.listener = new Listener({
    onUpdate: (finalText, interim) => {
      ctx.draft = finalText;
      ctx.interim = interim;
      const live = $('.live');
      if (live) live.innerHTML = `${esc(finalText)} <span class="interim">${esc(interim)}</span>`;
    },
    onState: (state, msg) => {
      if (state === 'error') {
        ctx.listening = false;
        ctx.listener = null;
        renderAnswer(p, q);
        toast(msg, 6000);
      }
    },
  });
  if (ctx.listener.start(prev)) {
    ctx.listening = true;
    renderAnswer(p, q);
  }
}

export function onPracticeAction(btn, p, key, rerender) {
  const q = questionList(p, key).find((x) => x.key === key) || questionList(p, key)[0];
  switch (btn.dataset.action) {
    case 'play-q':
      speak(q.en, myVoice()).catch((err) => toast(err.message, 5000));
      return true;
    case 'toggle-text': ctx.hideText = !ctx.hideText; rerender(); return true;
    case 'start-rec': startListening(p, q, false); return true;
    case 'start-rec-append': startListening(p, q, true); return true;
    case 'stop-rec':
      stopListening();
      if (!ctx.draft) toast('인식된 말이 없어요. 다시 말하거나 키보드로 입력해 주세요.', 4500);
      renderAnswer(p, q);
      $('#answer-text')?.focus();
      return true;
    case 'retry':
      ctx.retry = true;
      ctx.draft = '';
      renderAnswer(p, q);
      renderFeedback(p, q);
      speak(q.en, myVoice()).catch(() => {});
      return true;
    case 'cancel-retry':
      ctx.retry = false;
      ctx.draft = '';
      renderAnswer(p, q);
      renderFeedback(p, q);
      return true;
    case 'play-sample': {
      const f = attemptsOf(p, q.key).at(-1)?.feedback;
      if (f) speak(f.sample_answer_en.replace(/\[[^\]]*\]/g, '...')).catch((err) => toast(err.message));
      return true;
    }
    case 'get-feedback': getFeedback(p, q); return true;
    default: return false;
  }
}

async function getFeedback(p, q) {
  const answer = ($('#answer-text')?.value || '').trim();
  if (!answer) {
    toast('답변이 비어 있어요. 음성으로 답하거나 키보드로 입력해 주세요.');
    return;
  }
  ctx.draft = answer;
  ctx.loading = true;
  renderAnswer(p, q);
  const prev = attemptsOf(p, q.key).at(-1)?.answer;
  try {
    const feedback = await api('/api/feedback', {
      project: { analysis: p.analysis, role: p.role, experience: p.experience, sample_answers: p.sample_answers },
      question: { id: q.id, en: q.en, ko: q.ko, type: q.type },
      answer,
      previous: prev,
    });
    store.updateProject(p.id, (x) => {
      x.practice ||= {};
      x.practice[q.key] ||= { attempts: [] };
      x.practice[q.key].attempts.push({ answer, feedback, at: new Date().toISOString() });
    });
    store.logEvent(prev ? 're_answer' : 'practice_answer', p.id, { q: q.key });
    Object.assign(ctx, { draft: '', retry: false, loading: false });
    renderPractice(document.getElementById('view'), store.project(p.id), q.key);
    document.getElementById('feedback-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    ctx.loading = false;
    renderAnswer(p, q);
    toast(err.message, 6000);
  }
}

export function leavePractice() {
  stopListening();
  stopSpeaking();
}
