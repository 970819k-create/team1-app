// ③-B 실전 면접 시뮬레이션: 면접방에서 AI 면접관과 연속 대화 → 결과 화면
// 면접 중에는 피드백을 보여 주지 않는다. 답변 예시·개선 표현은 끝난 뒤 결과 화면에서만.
import * as store from './store.js';
import { speak, stopSpeaking, Listener, sttSupported } from './speech.js';
import { $, esc, api, toast, confirmBox, sourceChips, starExpr, starQuestion, withPlaceholders, fmtDate, aiBadge } from './ui.js';

let sim = null;
let goFn = () => {};

const STATUS = {
  speaking: { label: '면접관이 말하는 중', cls: 'speaking' },
  listening: { label: '답변 차례 · 마이크 켜짐', cls: 'listening' },
  waiting: { label: '답변 차례 · 마이크 꺼짐', cls: 'waiting' },
  thinking: { label: '면접관이 답변을 듣고 다음 질문을 준비하는 중', cls: 'thinking' },
};

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function setNavigator(go) { goFn = go; }

/* ------------------------------------------------------------------ */
/* 준비 화면                                                           */
/* ------------------------------------------------------------------ */

export function renderInterview(view, p) {
  if (sim && sim.pid === p.id && sim.phase === 'room') return renderRoom(view, p);
  leaveInterview();
  const n = p.analysis.questions.length;
  const def = Math.min(4, n);
  view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">③ AI 면접 · 실전 시뮬레이션</span>
        <h1>${esc(p.analysis.company_name)}</h1>
        <p class="muted"><a href="#p/${esc(p.id)}">← 분석 결과</a> · <a href="#practice/${esc(p.id)}">질문별 연습</a></p>
      </div>
    </div>
    <div class="grid-2">
      <section class="card">
        <h2>면접 방식</h2>
        <ol class="steps">
          <li>AI 면접관이 영어로 인사하고 첫 질문을 해요.</li>
          <li>지원자로서 영어로 답하고, 말을 마치면 <b>[답변 완료]</b>를 눌러요.</li>
          <li>면접관이 답변에 따라 <b>후속 질문</b>을 하거나 다음 질문으로 넘어가요.</li>
          <li>면접 중에는 피드백 없이 진행돼요. 끝나면 질문·답변 기록과 답변 예시를 보여 줘요.</li>
        </ol>
        ${sttSupported ? '<p class="small muted">처음 [답하기]를 누르면 브라우저가 마이크 사용 허락을 물어봐요. [허용]을 눌러 주세요. 이어폰을 쓰면 면접관 목소리가 다시 인식되지 않아 더 정확해요.</p>'
          : '<p class="alert info small">이 브라우저는 음성 인식을 지원하지 않아 키보드로 답하게 돼요. Chrome이나 Edge에서는 음성으로 답할 수 있어요.</p>'}
      </section>
      <form class="card form" id="sim-setup">
        <h2>설정</h2>
        <label class="field-label" for="sim-count">메인 질문 수</label>
        <select id="sim-count" class="input">
          ${Array.from({ length: n }, (_, i) => i + 1).filter((k) => k >= Math.min(3, n)).map((k) => `<option value="${k}" ${k === def ? 'selected' : ''}>${k}개 (약 ${k * 2 + 2}~${k * 3 + 2}분)</option>`).join('')}
        </select>
        <label class="check"><input type="checkbox" id="sim-text" checked> 면접관 질문을 영어 텍스트로도 보기</label>
        <label class="check"><input type="checkbox" id="sim-keyboard" ${sttSupported ? '' : 'checked disabled'}> 키보드로 답하기</label>
        <button class="btn primary wide big" type="submit">시뮬레이션 시작</button>
      </form>
    </div>`;
}

export function bindInterviewSetup(view, p) {
  const form = $('#sim-setup', view);
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    startSim(p, {
      count: Number($('#sim-count', form).value),
      showText: $('#sim-text', form).checked,
      keyboard: $('#sim-keyboard', form).checked || !sttSupported,
    });
  });
}

/* ------------------------------------------------------------------ */
/* 면접방                                                              */
/* ------------------------------------------------------------------ */

function startSim(p, opts) {
  const plan = p.analysis.questions.slice(0, opts.count);
  const company = p.analysis.company_name && p.analysis.company_name !== '확인되지 않음' ? p.analysis.company_name.replace(/\s*\(.*?\)\s*/g, '') : '';
  const role = p.role || (p.analysis.role_title !== '확인되지 않음' ? p.analysis.role_title : '');
  const greeting = `Hello, and thank you for joining us today. This is the English interview${role ? ` for the ${role} position` : ''}${company ? ` at ${company}` : ''}. Let's begin. ${plan[0].en}`;
  sim = {
    pid: p.id, phase: 'room', plan, mainIdx: 0, followUps: 0,
    showText: opts.showText, keyboard: opts.keyboard,
    transcript: [], startedAt: Date.now(), status: 'speaking',
    draft: '', interim: '', listener: null, timer: null, sessionId: store.uid('s'),
  };
  sim.transcript.push({ role: 'interviewer', text: greeting, ko: `안녕하세요, 오늘 와 주셔서 감사합니다. 영어 면접을 시작하겠습니다. ${plan[0].ko}`, kind: 'main', qid: plan[0].id });
  store.logEvent('sim_start', p.id);
  sim.timer = setInterval(() => {
    const el = $('#elapsed');
    if (el) el.textContent = fmtTime(Date.now() - sim.startedAt);
  }, 1000);
  renderRoom($('#view'), p);
  interviewerSay(p);
}

function lastInterviewer() {
  return [...sim.transcript].reverse().find((t) => t.role === 'interviewer');
}

function renderRoom(view, p) {
  const cur = lastInterviewer();
  const st = STATUS[sim.status] || STATUS.waiting;
  const canAnswer = sim.status === 'listening' || sim.status === 'waiting';
  const asked = sim.transcript.filter((t) => t.role === 'interviewer' && t.kind === 'main').length;
  view.innerHTML = `
    <section class="room" aria-label="면접방">
      <header class="room-bar">
        <span class="live-dot" aria-hidden="true"></span><b>면접 진행 중</b>
        <span class="mono" id="elapsed">${fmtTime(Date.now() - sim.startedAt)}</span>
        <span>질문 ${asked}/${sim.plan.length}${cur?.kind === 'follow_up' ? ' · 후속 질문' : ''}</span>
        <button class="btn room-end" data-action="sim-end">면접 종료</button>
      </header>

      <div class="room-stage">
        <div class="avatar ${st.cls}" aria-hidden="true"><span>AI</span><i></i><i></i><i></i></div>
        <p class="room-status ${st.cls}" role="status">${st.label}</p>
        ${sim.showText && cur ? `<p class="room-caption" lang="en">${esc(cur.text)}</p>` : '<p class="room-caption muted">질문 텍스트를 숨겼어요. 소리로 들어 보세요.</p>'}
        <div class="row gap-s center wrap">
          <button class="btn room-ghost" data-action="sim-replay" ${sim.status === 'thinking' ? 'disabled' : ''}>🔊 질문 다시 듣기</button>
          <button class="btn room-ghost" data-action="sim-toggle-text">${sim.showText ? '텍스트 숨기기' : '텍스트 보기'}</button>
        </div>
      </div>

      <div class="room-answer">
        ${sim.status === 'thinking' ? '<p class="muted center"><span class="spinner"></span> 잠시만 기다려 주세요…</p>' : ''}
        ${canAnswer && !sim.keyboard ? `
          <div class="mic ${sim.status === 'listening' ? 'on' : ''}">
            <span class="rec-dot" aria-hidden="true"></span>
            <b>${sim.status === 'listening' ? '마이크 켜짐 · 듣는 중' : '마이크 꺼짐'}</b>
          </div>
          <p class="live" lang="en" id="sim-live">${esc(sim.draft)} <span class="interim">${esc(sim.interim)}</span>${!sim.draft && !sim.interim ? '<span class="muted">영어로 답해 주세요…</span>' : ''}</p>
          <div class="row gap-s center wrap">
            ${sim.status === 'listening'
              ? '<button class="btn primary big" data-action="sim-done">답변 완료</button><button class="btn room-ghost" data-action="sim-clear">처음부터 다시 말하기</button>'
              : '<button class="btn primary big" data-action="sim-listen">🎙 답하기</button><button class="btn room-ghost" data-action="sim-keyboard">키보드로 답하기</button>'}
          </div>` : ''}
        ${canAnswer && sim.keyboard ? `
          <label class="field-label" for="sim-typed">답변 (영어로 입력)</label>
          <textarea id="sim-typed" class="input" rows="4" lang="en" placeholder="Type your answer...">${esc(sim.draft)}</textarea>
          <div class="row gap-s center wrap">
            <button class="btn primary big" data-action="sim-done">답변 완료</button>
            ${sttSupported ? '<button class="btn room-ghost" data-action="sim-voice">음성으로 답하기</button>' : ''}
          </div>` : ''}
      </div>
    </section>`;
  if (canAnswer && sim.keyboard) $('#sim-typed')?.focus();
}

async function interviewerSay(p) {
  const cur = lastInterviewer();
  sim.status = 'speaking';
  renderRoom($('#view'), p);
  const mySession = sim.sessionId;
  try {
    await speak(cur.text);
  } catch (err) {
    toast(err.message, 5000);
  }
  if (!sim || sim.sessionId !== mySession || sim.phase !== 'room') return;
  if (cur.kind === 'closing') return finish(p, 'completed');
  beginAnswer(p);
}

function beginAnswer(p) {
  sim.draft = '';
  sim.interim = '';
  if (sim.keyboard) {
    sim.status = 'waiting';
    return renderRoom($('#view'), p);
  }
  listen(p);
}

function listen(p) {
  sim.listener?.abort();
  sim.listener = new Listener({
    onUpdate: (finalText, interim) => {
      sim.draft = finalText;
      sim.interim = interim;
      const el = $('#sim-live');
      if (el) el.innerHTML = `${esc(finalText)} <span class="interim">${esc(interim)}</span>`;
    },
    onState: (state, msg) => {
      if (!sim) return;
      if (state === 'error') {
        sim.listener = null;
        sim.status = 'waiting';
        renderRoom($('#view'), p);
        toast(msg, 7000);
      }
    },
  });
  const ok = sim.listener.start(sim.draft);
  sim.status = ok ? 'listening' : 'waiting';
  renderRoom($('#view'), p);
}

async function submitAnswer(p) {
  let text = '';
  if (sim.keyboard) text = ($('#sim-typed')?.value || '').trim();
  else {
    text = (sim.listener?.stop() || sim.draft || '').trim();
    sim.listener = null;
  }
  if (!text) {
    toast('답변이 인식되지 않았어요. 다시 말하거나 [키보드로 답하기]를 눌러 입력해 주세요.', 5000);
    sim.status = 'waiting';
    return renderRoom($('#view'), p);
  }
  sim.transcript.push({ role: 'candidate', text });
  sim.status = 'thinking';
  renderRoom($('#view'), p);

  const cur = lastInterviewer();
  const allowFollowUp = cur.kind === 'main' && sim.followUps === 0;
  const nextQ = sim.plan[sim.mainIdx + 1] || null;
  const mustEnd = !nextQ && !allowFollowUp;
  const mySession = sim.sessionId;
  let turn;
  try {
    turn = await api('/api/interview/turn', {
      project: { analysis: p.analysis, role: p.role, experience: p.experience },
      transcript: sim.transcript.map(({ role, text: t }) => ({ role, text: t })),
      nextQuestion: nextQ, allowFollowUp, mustEnd,
    });
  } catch (err) {
    // AI 오류로 대화가 끊기지 않도록 정해진 다음 질문으로 이어 간다
    toast(`${err.message} 정해진 다음 질문으로 이어 갈게요.`, 5000);
    turn = nextQ ? { action: 'next_question', say: `Thank you. ${nextQ.en}`, say_ko: nextQ.ko } : { action: 'end', say: "That's all the questions I have. Thank you for your time.", say_ko: '준비한 질문은 여기까지입니다. 감사합니다.' };
  }
  if (!sim || sim.sessionId !== mySession) return;

  // 규칙 강제: 후속 질문은 메인 질문마다 1번, 질문이 남았으면 끝내지 않음
  let action = turn.action;
  if (mustEnd) action = 'end';
  else if (action === 'follow_up' && !allowFollowUp) action = nextQ ? 'next_question' : 'end';
  else if (action === 'end' && nextQ) action = 'next_question';
  else if (action === 'next_question' && !nextQ) action = 'end';

  if (action === 'follow_up') {
    sim.followUps++;
    sim.transcript.push({ role: 'interviewer', text: turn.say, ko: turn.say_ko, kind: 'follow_up', qid: cur.qid });
  } else if (action === 'next_question') {
    sim.mainIdx++;
    sim.followUps = 0;
    const say = turn.action === 'next_question' ? turn.say : `Thank you. ${nextQ.en}`;
    sim.transcript.push({ role: 'interviewer', text: say, ko: turn.action === 'next_question' ? turn.say_ko : nextQ.ko, kind: 'main', qid: nextQ.id });
  } else {
    const say = turn.action === 'end' ? turn.say : "That's all the questions I have for today. Thank you for your time.";
    sim.transcript.push({ role: 'interviewer', text: say, ko: turn.action === 'end' ? turn.say_ko : '오늘 질문은 여기까지입니다. 감사합니다.', kind: 'closing' });
  }
  interviewerSay(p);
}

function buildPairs(transcript) {
  const pairs = [];
  transcript.forEach((t, i) => {
    if (t.role !== 'interviewer' || t.kind === 'closing') return;
    const ans = transcript[i + 1]?.role === 'candidate' ? transcript[i + 1].text : '';
    if (!ans) return; // 답하지 않은 마지막 질문은 기록에서 뺀다
    pairs.push({ question: t.text, question_ko: t.ko || '', question_id: t.qid || null, kind: t.kind, answer: ans });
  });
  return pairs;
}

function finish(p, endedBy) {
  const s = sim;
  leaveInterview();
  const pairs = buildPairs(s.transcript);
  const session = {
    id: s.sessionId, startedAt: new Date(s.startedAt).toISOString(), endedAt: new Date().toISOString(),
    endedBy, transcript: s.transcript, pairs, report: null,
  };
  store.updateProject(p.id, (x) => { x.sessions ||= []; x.sessions.push(session); });
  store.logEvent(endedBy === 'completed' ? 'sim_complete' : 'sim_end_early', p.id, { pairs: pairs.length });
  goFn(`#result/${p.id}/${session.id}`);
}

export async function onInterviewAction(btn, p) {
  if (!sim) return false;
  switch (btn.dataset.action) {
    case 'sim-listen': listen(p); return true;
    case 'sim-done': submitAnswer(p); return true;
    case 'sim-clear': sim.draft = ''; listen(p); return true;
    case 'sim-keyboard':
      sim.listener?.abort();
      sim.keyboard = true;
      sim.status = 'waiting';
      renderRoom($('#view'), p);
      return true;
    case 'sim-voice':
      sim.keyboard = false;
      listen(p);
      return true;
    case 'sim-replay': {
      const was = sim.status;
      sim.listener?.abort();
      sim.listener = null;
      sim.status = 'speaking';
      renderRoom($('#view'), p);
      try { await speak(lastInterviewer().text); } catch (err) { toast(err.message); }
      if (sim && sim.status === 'speaking') { if (was === 'listening') listen(p); else { sim.status = 'waiting'; renderRoom($('#view'), p); } }
      return true;
    }
    case 'sim-toggle-text': sim.showText = !sim.showText; renderRoom($('#view'), p); return true;
    case 'sim-end': {
      const answered = sim.transcript.filter((t) => t.role === 'candidate').length;
      if (await confirmBox(answered ? '면접을 지금 끝내고 결과를 볼까요?' : '아직 답한 질문이 없어요. 면접을 끝낼까요? (기록이 남지 않아요)', { ok: '면접 종료', danger: true })) {
        if (!answered) { leaveInterview(); goFn(`#p/${p.id}`); } else finish(p, 'user');
      }
      return true;
    }
    default: return false;
  }
}

export function leaveInterview() {
  if (!sim) return;
  clearInterval(sim.timer);
  sim.listener?.abort();
  stopSpeaking();
  sim = null;
}

export function interviewActive() {
  return !!sim && sim.phase === 'room';
}

/* ------------------------------------------------------------------ */
/* 결과 화면                                                           */
/* ------------------------------------------------------------------ */

const reportLoading = new Set();

export function renderResult(view, p, sid) {
  const s = p.sessions?.find((x) => x.id === sid);
  if (!s) {
    view.innerHTML = '<div class="empty"><p>면접 기록을 찾지 못했어요.</p><a class="btn" href="#home">처음으로</a></div>';
    return;
  }
  const r = s.report;
  const qById = Object.fromEntries(p.analysis.questions.map((q) => [q.id, q]));
  view.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">③ 실전 면접 결과 · ${fmtDate(s.startedAt)}</span>
        <h1>${esc(p.analysis.company_name)}</h1>
        <p class="muted">답한 질문 ${s.pairs.length}개 · ${s.endedBy === 'completed' ? '끝까지 진행' : '중간에 종료'} · 소요 ${fmtTime(new Date(s.endedAt) - new Date(s.startedAt))}</p>
      </div>
      <div class="row gap-s wrap">
        <a class="btn ghost" href="#practice/${esc(p.id)}">질문별 연습으로</a>
        <a class="btn primary" href="#interview/${esc(p.id)}">다시 시뮬레이션</a>
      </div>
    </div>

    ${!s.pairs.length ? '<div class="alert info"><p>답한 질문이 없어 결과를 만들 수 없어요.</p></div>' : ''}
    ${s.pairs.length && !r ? `<section class="card" id="report-status">
      ${reportLoading.has(sid) ? '<p><span class="spinner"></span> 답변 예시와 개선할 표현을 만드는 중… (30초 정도)</p>' : '<p>결과를 만들지 못했어요.</p><button class="btn primary" data-action="report-retry">결과 다시 만들기</button>'}
    </section>` : ''}
    ${r ? `<section class="card accent"><div class="row between wrap gap-s"><h2>총평</h2>${aiBadge(r.basic)}</div><p>${esc(r.overall_ko)}</p></section>` : ''}

    <ol class="result-list">
      ${s.pairs.map((pair, i) => {
        const it = r?.items?.find((x) => x.turn_index === i);
        const q = pair.question_id ? qById[pair.question_id] : null;
        return `
        <li class="card">
          <div class="row between wrap gap-s">
            <span class="tag">${i + 1}. ${pair.kind === 'follow_up' ? '후속 질문' : esc(pair.question_id || '질문')}</span>
            <span class="row gap-s wrap">${q && pair.kind !== 'follow_up' ? `<span class="chips">${sourceChips(q.sources, p.id)}</span>` : ''}
              ${starQuestion(p.id, { id: pair.kind === 'follow_up' ? null : pair.question_id, en: pair.kind === 'follow_up' ? pair.question : (q?.en || pair.question), ko: pair.question_ko })}</span>
          </div>
          <p class="en strong" lang="en">${esc(pair.question)}</p>
          ${pair.question_ko ? `<p class="small muted">${esc(pair.question_ko)}</p>` : ''}
          <h3>내 답변</h3>
          <p class="answer-text" lang="en">${esc(pair.answer)}</p>
          ${it ? `
            ${it.improvements?.length ? `<h3>개선할 표현</h3><ul class="fix-list">${it.improvements.map((x) => `
              <li><p><del lang="en">${esc(x.original)}</del> → <ins lang="en">${esc(x.better)}</ins></p><p class="small muted">${esc(x.reason_ko)}</p>
              ${starExpr(p.id, { en: x.better, ko: x.reason_ko }, 'interview')}</li>`).join('')}</ul>` : ''}
            <h3>답변 예시 <span class="badge">참고용 · 정답이 하나만 있는 건 아니에요</span></h3>
            <div class="sample"><p lang="en">${withPlaceholders(it.sample_answer_en)}</p><p class="small muted">${withPlaceholders(it.sample_answer_ko)}</p></div>
            ${it.expressions?.length ? `<h3>저장할 만한 표현</h3><ul class="expr-list">${it.expressions.map((x) => `
              <li><div class="row between gap-s"><p><b lang="en">${esc(x.en)}</b> <span class="muted">${esc(x.ko)}</span></p>${starExpr(p.id, x, 'interview')}</div>
              ${x.example_en ? `<p class="small" lang="en">${esc(x.example_en)}</p>` : ''}</li>`).join('')}</ul>` : ''}
          ` : ''}
        </li>`;
      }).join('')}
    </ol>

    <section class="card">
      <h2>참고한 자료</h2>
      <p class="small muted">면접 질문은 아래 자료를 근거로 만들었어요.</p>
      <div class="chips">${p.sources.map((src) => `<button class="src-chip" data-action="source" data-project="${esc(p.id)}" data-source="${esc(src.id)}">${esc(src.id)} · ${src.kind === 'job' ? '채용공고' : '기업 자료'}</button>`).join('')}</div>
    </section>`;

  if (s.pairs.length && !r && !reportLoading.has(sid) && !s.reportFailed) makeReport(p, s);
}

async function makeReport(p, s) {
  reportLoading.add(s.id);
  renderResult($('#view'), store.project(p.id), s.id);
  try {
    const report = await api('/api/interview/report', {
      project: { analysis: p.analysis, role: p.role, experience: p.experience, sample_answers: p.sample_answers },
      pairs: s.pairs,
    });
    store.updateProject(p.id, (x) => { const ss = x.sessions.find((y) => y.id === s.id); ss.report = report; delete ss.reportFailed; });
  } catch (err) {
    toast(err.message, 6000);
    store.updateProject(p.id, (x) => { x.sessions.find((y) => y.id === s.id).reportFailed = true; });
  } finally {
    reportLoading.delete(s.id);
    if (location.hash === `#result/${p.id}/${s.id}`) renderResult($('#view'), store.project(p.id), s.id);
  }
}

export function onResultAction(btn, p, sid) {
  if (btn.dataset.action !== 'report-retry') return false;
  const s = p.sessions.find((x) => x.id === sid);
  if (s) makeReport(p, s);
  return true;
}
