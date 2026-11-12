// ③-B 실전 면접 시뮬레이션: 면접방에서 AI 면접관과 연속 대화 → 결과 화면
// 면접 중에는 피드백을 보여 주지 않는다. 답변 예시·개선 표현은 끝난 뒤 결과 화면에서만.
import * as store from './store.js';
import { speak, stopSpeaking, Listener, sttSupported, INTERVIEWER_VOICES, COACH_VOICE, voiceList, ttsEngine, audioLevel, isSpeaking } from './speech.js';
import { interviewerCategories, pickFromBank, bankQuestion } from './bank.js';
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
  const pref = setupPref();
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
        <h2>면접 설정</h2>
        <fieldset class="interviewer-picker">
          <legend>면접관 선택</legend>
          <p class="small muted">면접관을 고르면 그 면접관의 목소리로 인사해요. 목소리는 아래에서 바꿀 수 있어요.</p>
          <div class="interviewer-grid">
            ${Array.from({ length: 10 }, (_, i) => i + 1).map((number) => `
              <label class="interviewer-choice">
                <input type="radio" name="interviewer" value="${number}" ${number === pref.interviewer ? 'checked' : ''} aria-label="면접관 ${number}">
                <span class="interviewer-thumbnail"><img src="/images/interviewers/interviewer-${number}.webp" alt="" loading="lazy"><span class="interviewer-selected" aria-hidden="true">✓</span></span>
                <span class="interviewer-number">면접관 ${number}</span>
              </label>`).join('')}
          </div>
        </fieldset>
        ${voicePickerHTML(pref.interviewer, pref.voice)}

        <fieldset class="source-picker">
          <legend>질문 출처</legend>
          <div class="seg" role="radiogroup" aria-label="질문 출처">
            ${[['mine', '내 자료로 만든 질문'], ['bank', '영어 면접 질문지'], ['mix', '둘 다 섞기']].map(([k, l]) => `
              <label class="seg-radio"><input type="radio" name="qsource" value="${k}" ${pref.source === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
          <div class="bank-cats" id="bank-cats" ${pref.source === 'mine' ? 'hidden' : ''}>
            <p class="small muted">질문지에서 물어볼 분야를 골라 주세요. 고른 분야에서 섞어서 물어봐요.</p>
            ${interviewerCategories().map((c) => `
              <label class="check bank-cat"><input type="checkbox" name="bankcat" value="${esc(c.id)}" ${pref.cats.includes(c.id) ? 'checked' : ''}>
                <span>${esc(c.name)} <span class="faint small">· ${c.questions.length}개 · ${esc(c.part.replace(/^\d부\s*/, ''))}</span></span></label>`).join('') || '<p class="small warn">질문지를 불러오지 못했어요.</p>'}
          </div>
        </fieldset>

        <label class="field-label" for="sim-count">메인 질문 수</label>
        <select id="sim-count" class="input">
          ${[3, 4, 5, 6].map((k) => `<option value="${k}" ${k === pref.count ? 'selected' : ''}>${k}개 (약 ${k * 2 + 2}~${k * 3 + 2}분)</option>`).join('')}
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
  const current = () => ({
    interviewer: Number(form.querySelector('input[name="interviewer"]:checked')?.value) || 1,
    voice: form.dataset.voice,
  });
  form.dataset.voice = setupPref().voice;

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'interviewer') {
      // 면접관을 바꾸면 그 면접관의 목소리로 바꾸고 바로 인사를 들려준다
      const n = Number(t.value);
      form.dataset.voice = INTERVIEWER_VOICES[n].voice;
      refreshVoicePicker(form, n, form.dataset.voice);
      savePref({ interviewer: n, voice: form.dataset.voice });
      previewVoice(n, form.dataset.voice);
    } else if (t.name === 'qsource') {
      $('#bank-cats', form).hidden = t.value === 'mine';
      savePref({ source: t.value });
    } else if (t.name === 'bankcat') {
      savePref({ cats: [...form.querySelectorAll('input[name="bankcat"]:checked')].map((x) => x.value) });
    } else if (t.id === 'sim-count') {
      savePref({ count: Number(t.value) });
    }
  });

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'pick-voice') {
      form.dataset.voice = btn.dataset.voice;
      const { interviewer } = current();
      refreshVoicePicker(form, interviewer, form.dataset.voice);
      savePref({ voice: form.dataset.voice });
      previewVoice(interviewer, form.dataset.voice);
    } else if (btn.dataset.action === 'voice-preview') {
      const { interviewer, voice } = current();
      previewVoice(interviewer, voice);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    stopSpeaking();
    const source = form.querySelector('input[name="qsource"]:checked')?.value || 'mine';
    const cats = [...form.querySelectorAll('input[name="bankcat"]:checked')].map((x) => x.value);
    if (source !== 'mine' && !cats.length) {
      toast('질문지에서 물어볼 분야를 하나 이상 골라 주세요.');
      return;
    }
    const { interviewer, voice } = current();
    startSim(p, {
      interviewer, voice,
      source, cats,
      count: Number($('#sim-count', form).value),
      showText: $('#sim-text', form).checked,
      keyboard: $('#sim-keyboard', form).checked || !sttSupported,
    });
  });
}

/* ---------- 면접 설정 기억 (이 브라우저) ---------- */
function setupPref() {
  const t = store.aiConfig().tts || {};
  const s = t.setup || {};
  const interviewer = s.interviewer >= 1 && s.interviewer <= 10 ? s.interviewer : 1;
  return {
    interviewer,
    voice: s.voice || INTERVIEWER_VOICES[interviewer].voice,
    source: ['mine', 'bank', 'mix'].includes(s.source) ? s.source : 'mine',
    cats: Array.isArray(s.cats) && s.cats.length ? s.cats : ['1-1'],
    count: [3, 4, 5, 6].includes(s.count) ? s.count : 4,
  };
}
function savePref(patch) {
  store.setAiConfig((c) => { c.tts = { ...(c.tts || {}), setup: { ...((c.tts || {}).setup || {}), ...patch } }; });
}

/* ---------- 면접관 목소리 고르기 ---------- */
function voiceNote(voice) {
  return voiceList().find((v) => v.id === voice)?.note || '';
}
function voicePickerHTML(interviewer, voice) {
  const engine = ttsEngine();
  const def = INTERVIEWER_VOICES[interviewer]?.voice;
  return `
    <fieldset class="voice-picker" id="voice-picker">
      <legend>면접관 목소리</legend>
      ${engine === 'openai' ? `
        <p class="small muted">OpenAI 음성 · 면접관 ${interviewer}의 기본 목소리는 <b>${esc(def)}</b>예요. 누르면 바로 들어볼 수 있어요.</p>
        <div class="voice-grid compact" role="radiogroup" aria-label="면접관 목소리">
          ${voiceList().map((v) => `<button type="button" class="voice-chip ${v.id === voice ? 'on' : ''}" data-action="pick-voice" data-voice="${esc(v.id)}" aria-pressed="${v.id === voice}">
            <b>${esc(v.id)}${v.id === def ? ' ★' : ''}</b><span>${esc(v.note)}</span></button>`).join('')}
        </div>`
      : `<p class="small muted">지금은 <b>브라우저 기본 음성</b>이에요. 면접관에 맞춰 남성·여성 목소리를 골라 읽어요 (컴퓨터에 따라 다를 수 있음).
          더 자연스러운 목소리는 <a href="#settings">[설정]</a>에서 'OpenAI 음성'을 켜면 면접관마다 다르게 고를 수 있어요.</p>`}
      <button type="button" class="btn ghost small" data-action="voice-preview">▶ 면접관 목소리 들어보기</button>
    </fieldset>`;
}
function refreshVoicePicker(form, interviewer, voice) {
  const box = $('#voice-picker', form);
  if (box) box.outerHTML = voicePickerHTML(interviewer, voice);
}
function previewVoice(interviewer, voice) {
  speak("Hello, I'm your interviewer today. Nice to meet you.", { voice, gender: INTERVIEWER_VOICES[interviewer]?.gender })
    .catch((err) => toast(err.message, 5000));
}

/* ------------------------------------------------------------------ */
/* 면접방                                                              */
/* ------------------------------------------------------------------ */

function buildPlan(p, opts) {
  const mine = p.analysis.questions.map((q) => ({ ...q, from: 'mine' }));
  const bank = opts.source === 'mine' ? [] : pickFromBank(opts.cats, opts.count).map((q) => ({ ...q, from: 'bank' }));
  if (opts.source === 'bank') return bank.length ? bank : mine.slice(0, opts.count);
  if (opts.source === 'mix') {
    // 내 자료 질문으로 시작해서 질문지와 번갈아 묻는다
    const out = [];
    let i = 0;
    let j = 0;
    while (out.length < opts.count && (i < mine.length || j < bank.length)) {
      if ((out.length % 2 === 0 && i < mine.length) || j >= bank.length) out.push(mine[i++]);
      else out.push(bank[j++]);
    }
    return out;
  }
  return mine.slice(0, opts.count);
}

function startSim(p, opts) {
  const plan = buildPlan(p, opts);
  const company = p.analysis.company_name && p.analysis.company_name !== '확인되지 않음' ? p.analysis.company_name.replace(/\s*\(.*?\)\s*/g, '') : '';
  const role = p.role || (p.analysis.role_title !== '확인되지 않음' ? p.analysis.role_title : '');
  const greeting = `Hello, and thank you for joining us today. This is the English interview${role ? ` for the ${role} position` : ''}${company ? ` at ${company}` : ''}. Let's begin. ${plan[0].en}`;
  sim = {
    pid: p.id, phase: 'room', plan, mainIdx: 0, followUps: 0,
    showText: opts.showText, keyboard: opts.keyboard, interviewer: opts.interviewer,
    voice: opts.voice, gender: INTERVIEWER_VOICES[opts.interviewer]?.gender, source: opts.source,
    transcript: [], startedAt: Date.now(), status: 'speaking',
    draft: '', interim: '', listener: null, timer: null, sessionId: store.uid('s'),
  };
  document.body.classList.add('in-room');
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
        <div class="participant-tile"><div class="participant-name"><span class="participant-dot"></span> AI 면접관</div><img class="participant-portrait" src="/images/interviewers/interviewer-${sim.interviewer}.webp" alt="선택한 AI 면접관 ${sim.interviewer}"><div class="participant-label">AI 면접관</div></div>
        <p class="room-status ${st.cls}" role="status">${st.label}</p>
        <div class="kkamja-room-tip" aria-label="깜자의 응원"><img src="/images/kkamja-practice.webp" alt=""><div><b>깜자</b><p>${sim.status === 'listening' || sim.status === 'waiting' ? '천천히, 내 경험을 떠올리며 말해 보세요.' : sim.status === 'thinking' ? '잠시만요, 면접관이 다음 질문을 준비하고 있어요.' : '질문을 듣고 핵심을 생각해 보세요.'}</p></div></div>
        ${sim.showText && cur ? `<p class="room-caption" lang="en">${esc(cur.text)}</p>` : '<p class="room-caption muted">질문 텍스트를 숨겼어요. 소리로 들어 보세요.</p>'}
        <div class="row gap-s center wrap">
          <button class="btn room-ghost" data-action="sim-replay" ${sim.status === 'thinking' ? 'disabled' : ''}>🔊 질문 다시 듣기</button>
          <button class="btn room-ghost" data-action="sim-toggle-text">${sim.showText ? '텍스트 숨기기' : '텍스트 보기'}</button>
        </div>
      </div>

      <div class="room-answer"><div class="room-answer-heading"><span>내 답변</span><span class="room-answer-hint">마이크와 답변을 확인하세요</span></div>
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
    await speak(cur.text, { voice: sim.voice, gender: sim.gender });
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
    plan: s.plan.map(({ id, en, ko, type, from, source, sourceUrl, category, sources }) => ({ id, en, ko, type, from, source, sourceUrl, category, sources })),
    interviewer: s.interviewer, voice: s.voice, coachPending: true,
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
      try { await speak(lastInterviewer().text, { voice: sim.voice, gender: sim.gender }); } catch (err) { toast(err.message); }
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
  document.body.classList.remove('in-room');
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
  const planById = Object.fromEntries((s.plan || []).map((q) => [q.id, q]));
  const metaOf = (id) => (id ? planById[id] || qById[id] || bankQuestion(id) : null);
  const script = r ? coachScript(s, r) : [];
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
    ${r ? `
    <section class="kkamja-talk" id="kkamja-talk" aria-label="깜자의 면접 피드백">
      <div class="kkamja-stage" id="kkamja-stage">
        <img class="kkamja-speaker" src="/images/kkamja-consultant.webp" alt="피드백을 말해 주는 깜자">
        <span class="talk-waves" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
      <div class="kkamja-bubble">
        <div class="row between wrap gap-s"><b>깜자의 피드백</b><span class="small muted">${r.basic ? '기본 피드백' : '면접 답변을 바탕으로 정리했어요'}</span></div>
        <p class="kkamja-caption" id="kkamja-caption" aria-live="polite">${esc(script[0] || r.overall_ko)}</p>
        <div class="row gap-s wrap">
          <button class="btn primary small" data-action="kkamja-play">▶ 깜자 피드백 듣기</button>
          <button class="btn ghost small" data-action="kkamja-stop">■ 멈추기</button>
          <span class="small muted" id="kkamja-progress">${script.length}문장</span>
        </div>
      </div>
    </section>` : ''}

    <ol class="result-list">
      ${s.pairs.map((pair, i) => {
        const it = r?.items?.find((x) => x.turn_index === i);
        const q = metaOf(pair.question_id);
        const isBank = q && (q.from === 'bank' || /^B\d/.test(q.id || ''));
        return `
        <li class="card">
          <div class="row between wrap gap-s">
            <span class="tag">${i + 1}. ${pair.kind === 'follow_up' ? '후속 질문' : isBank ? `질문지 · ${esc(q.category || '')}` : esc(pair.question_id || '질문')}</span>
            <span class="row gap-s wrap">${q && pair.kind !== 'follow_up' ? (isBank ? bankSourceChip(q) : `<span class="chips">${sourceChips(q.sources, p.id)}</span>`) : ''}
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
    if (location.hash === `#result/${p.id}/${s.id}`) {
      const fresh = store.project(p.id);
      renderResult($('#view'), fresh, s.id);
      const ss = fresh.sessions.find((y) => y.id === s.id);
      if (ss?.report && ss.coachPending) {
        store.updateProject(p.id, (x) => { x.sessions.find((y) => y.id === s.id).coachPending = false; });
        playCoach(ss); // 면접 직후 한 번은 깜자가 먼저 말해 준다
      }
    }
  }
}

export function onResultAction(btn, p, sid) {
  const s = p.sessions.find((x) => x.id === sid);
  if (!s) return false;
  if (btn.dataset.action === 'report-retry') { makeReport(p, s); return true; }
  if (btn.dataset.action === 'kkamja-play') { playCoach(s); return true; }
  if (btn.dataset.action === 'kkamja-stop') { stopCoach(); return true; }
  return false;
}

/** 질문지 질문의 출처 표시 */
export function bankSourceChip(q) {
  const label = `질문지 · ${q.source || '출처 없음'}`;
  return q.sourceUrl
    ? `<a class="src-chip bank" href="${esc(q.sourceUrl)}" target="_blank" rel="noopener" title="질문 출처 열기">${esc(label)} ↗</a>`
    : `<span class="src-chip bank" title="${esc(q.note || '')}">${esc(label)}</span>`;
}

/* ------------------------------------------------------------------ */
/* 깜자가 말하는 피드백                                                 */
/* ------------------------------------------------------------------ */

/** 결과를 깜자가 말할 한국어 문장들로 바꾼다 */
function coachScript(s, r) {
  const lines = ['면접 수고 많았어요! 깜자가 들은 대로 정리해 줄게요.'];
  String(r.overall_ko || '').split(/(?<=[.!?。])\s+/).map((x) => x.trim()).filter(Boolean).forEach((x) => lines.push(x));
  let tips = 0;
  (r.items || []).forEach((it) => {
    if (tips >= 3) return;
    const fix = (it.improvements || [])[0];
    if (!fix) return;
    const n = (it.turn_index ?? 0) + 1;
    lines.push(`${n}번째 답변에서는 "${fix.original}" 대신 "${fix.better}"라고 말해 보세요.`);
    if (fix.reason_ko) lines.push(fix.reason_ko);
    tips++;
  });
  lines.push(tips ? '아래에서 질문별 답변 예시도 꼭 확인해 보세요.' : '아래에서 질문별 답변 예시를 보면서 한 번 더 연습해 봐요.');
  lines.push('다음 면접도 깜자가 함께할게요!');
  return lines;
}

let coach = null;

function setTalking(on) {
  const stage = $('#kkamja-stage');
  if (stage) stage.classList.toggle('talking', on);
}

function animateCoach(token) {
  const stage = $('#kkamja-stage');
  if (!coach || coach.token !== token || !stage) return;
  // 파일 음성이면 실제 소리 크기로, 브라우저 음성이면 리듬 애니메이션으로 입을 움직인다
  const level = audioLevel();
  if (level === null) {
    stage.classList.toggle('css-talk', isSpeaking());
    stage.style.setProperty('--talk', '0');
  } else {
    stage.classList.remove('css-talk');
    coach.smooth = coach.smooth * 0.6 + level * 0.4;
    stage.style.setProperty('--talk', coach.smooth.toFixed(3));
  }
  coach.raf = requestAnimationFrame(() => animateCoach(token));
}

async function playCoach(s) {
  stopCoach();
  const r = s.report;
  if (!r) return;
  const lines = coachScript(s, r);
  const token = Date.now();
  coach = { token, smooth: 0, raf: 0 };
  setTalking(true);
  animateCoach(token);
  const cap = () => $('#kkamja-caption');
  const prog = () => $('#kkamja-progress');
  try {
    for (let i = 0; i < lines.length; i++) {
      if (!coach || coach.token !== token) return;
      if (cap()) cap().textContent = lines[i];
      if (prog()) prog().textContent = `${i + 1} / ${lines.length}`;
      await speak(lines[i], { role: 'coach', lang: 'ko', voice: COACH_VOICE, gender: 'f' });
      await new Promise((res) => setTimeout(res, 250));
    }
  } catch (err) {
    toast(err.message, 5000);
  } finally {
    if (coach && coach.token === token) stopCoach(false);
  }
}

export function stopCoach(silence = true) {
  if (coach) cancelAnimationFrame(coach.raf);
  coach = null;
  if (silence) stopSpeaking();
  setTalking(false);
  const stage = $('#kkamja-stage');
  if (stage) { stage.classList.remove('css-talk'); stage.style.setProperty('--talk', '0'); }
}
