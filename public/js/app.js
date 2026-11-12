// 라우터: #home ① 자료 입력 · #p/<id> ② 분석 · #practice/<id>/<q> ③ 질문별 연습
//        #interview/<id> ③ 실전 면접 · #result/<id>/<session> 면접 결과 · #review ④ 나의 복습
import * as store from './store.js';
import { configure } from './speech.js';
import { $, $$, api, handleCommon, toast } from './ui.js';
import { renderInput, bindInput } from './view-input.js';
import { renderAnalysis, onAnalysisAction } from './view-analysis.js';
import { renderPractice, onPracticeAction, leavePractice, onPracticeChange } from './view-practice.js';
import { renderInterview, bindInterviewSetup, onInterviewAction, leaveInterview, renderResult, onResultAction, setNavigator, interviewActive, stopCoach } from './view-interview.js';
import { loadBank } from './bank.js';
import { initInstall, handleInstallAction } from './install.js';

initInstall();
import { renderReview, onReviewAction, onReviewSubmit, onReviewChange } from './view-review.js';
import { renderSettings, onSettingsAction, onSettingsSubmit, setSettingsListener, onSettingsChange } from './view-settings.js';

const view = $('#view');
let status = { ai: false, tts: false };
let current = { name: 'home' };

function go(hash, replace = false) {
  if (location.hash === hash) route();
  else if (replace) { history.replaceState(null, '', hash); route(); } else location.hash = hash;
}
setNavigator(go);

function parse() {
  const h = decodeURIComponent(location.hash.slice(1) || 'home');
  const [name, a, b] = h.split('/');
  return { name, id: a, sub: b };
}

function notFound() {
  view.innerHTML = '<div class="empty"><p>준비 기록을 찾지 못했어요. 삭제됐을 수 있어요.</p><a class="btn primary" href="#home">처음으로</a></div>';
}

function route() {
  const r = parse();
  if (current.name === 'practice' && r.name !== 'practice') leavePractice();
  if (current.name === 'interview' && r.name !== 'interview' && interviewActive()) leaveInterview();
  if (current.name === 'result') stopCoach();
  current = r;

  // 상단 메뉴 표시
  const tab = ['review', 'settings', 'home'].includes(r.name) ? r.name : 'project';
  $$('.topnav a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
  const p = r.id ? store.project(r.id) : null;
  const crumb = $('#crumb');
  crumb.hidden = !p;
  if (p) {
    crumb.innerHTML = `
      <span class="crumb-name">${p.name.replace(/[<>&]/g, '')}</span>
      <a href="#p/${p.id}" aria-current="${r.name === 'p' ? 'page' : 'false'}">② 분석</a>
      <a href="#practice/${p.id}" aria-current="${r.name === 'practice' ? 'page' : 'false'}">질문별 연습</a>
      <a href="#interview/${p.id}" aria-current="${['interview', 'result'].includes(r.name) ? 'page' : 'false'}">실전 면접</a>`;
  }
  document.body.classList.toggle('in-room', r.name === 'interview' && interviewActive());
  window.scrollTo(0, 0);

  switch (r.name) {
    case 'p': return p ? renderAnalysis(view, p) : notFound();
    case 'practice': return p ? renderPractice(view, p, r.sub) : notFound();
    case 'interview':
      if (!p) return notFound();
      renderInterview(view, p);
      return bindInterviewSetup(view, p);
    case 'result': return p ? renderResult(view, p, r.sub) : notFound();
    case 'review': return renderReview(view);
    case 'settings': return renderSettings(view);
    default: return renderInput(view, status);
  }
}

function rerender() {
  const scroll = window.scrollY;
  const r = parse();
  const p = r.id ? store.project(r.id) : null;
  if (r.name === 'p' && p) renderAnalysis(view, p);
  else if (r.name === 'practice' && p) renderPractice(view, p, r.sub);
  else if (r.name === 'review') renderReview(view);
  window.scrollTo(0, scroll);
}

view.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'SELECT') return;
  if (handleCommon(btn)) return;
  if (await handleInstallAction(btn)) return;
  const r = parse();
  const p = r.id ? store.project(r.id) : null;
  if (r.name === 'p' && onAnalysisAction(btn, rerender)) return;
  if (r.name === 'practice' && p && onPracticeAction(btn, p, r.sub || p.analysis.questions[0].id, () => renderPractice(view, store.project(p.id), r.sub))) return;
  if (r.name === 'interview' && p && await onInterviewAction(btn, p)) {
    document.body.classList.toggle('in-room', interviewActive());
    return;
  }
  if (r.name === 'result' && p && onResultAction(btn, p, r.sub)) return;
  if (r.name === 'review') await onReviewAction(btn, rerender);
  if (r.name === 'settings') await onSettingsAction(btn, view);
});

view.addEventListener('submit', (e) => {
  if (parse().name === 'review' && onReviewSubmit(e.target, rerender)) e.preventDefault();
  if (parse().name === 'settings' && e.target.dataset.form === 'provider') {
    e.preventDefault();
    onSettingsSubmit(e.target, view);
  }
});
view.addEventListener('change', (e) => {
  if (parse().name === 'review') onReviewChange(e.target, rerender);
  if (parse().name === 'settings') onSettingsChange(e.target, view);
  if (parse().name === 'practice') {
    const r = parse();
    const p = r.id ? store.project(r.id) : null;
    if (p) onPracticeChange(e.target, p, go);
  }
});

bindInput(view, { go });
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => {
  if (interviewActive()) { e.preventDefault(); e.returnValue = ''; }
});

async function refreshStatus() {
  try {
    status = await api('/api/status');
  } catch (err) {
    toast(err.message, 8000);
  }
  configure(status);
  const badge = $('#ai-status');
  const short = (status.providerLabel || 'AI').replace(/\s*\(.*\)\s*/, '');
  badge.textContent = status.ai ? `${short} 연결됨` : status.problem === 'ollama_offline' ? 'Ollama 꺼짐 · 설정' : 'AI 미연결 · 설정';
  badge.className = `badge ${status.ai ? 'ai' : 'warn'}`;
  badge.title = status.ai ? `${status.providerLabel} · ${status.model} — 눌러서 바꾸기`
    : status.problem === 'ollama_offline' ? 'Ollama가 꺼져 있어요. 눌러서 다른 AI를 고르거나 Ollama를 켜세요.' : '눌러서 AI 연결하기';
}
setSettingsListener(refreshStatus);

// 시작
(async () => {
  await Promise.all([refreshStatus(), loadBank()]);
  route();
})();
