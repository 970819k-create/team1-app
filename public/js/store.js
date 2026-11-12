// 브라우저 저장소(localStorage). 로그인 없이 이 브라우저에만 저장한다.
// 프로젝트(자료·분석·연습·면접 기록), 저장한 표현·질문, 학습 이벤트를 다룬다.

const KEY = 'interview-prep.v1';
let state = load();
let onError = () => {};

function empty() {
  return { projects: [], saved: { expressions: [], questions: [] }, events: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch (_) { /* 무시 */ }
  return empty();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    onError(err);
  }
}

export function setErrorHandler(fn) { onError = fn; }

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- 프로젝트 ---------- */

export function projects() {
  return [...state.projects].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
export function project(id) {
  return state.projects.find((p) => p.id === id) || null;
}
export function addProject(p) {
  const now = new Date().toISOString();
  const item = { practice: {}, sessions: [], ...p, id: p.id || uid('p'), createdAt: now, updatedAt: now };
  state.projects.push(item);
  persist();
  return item;
}
export function updateProject(id, fn) {
  const p = project(id);
  if (!p) return null;
  fn(p);
  p.updatedAt = new Date().toISOString();
  persist();
  return p;
}
export function deleteProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  state.saved.questions = state.saved.questions.filter((q) => q.projectId !== id);
  state.saved.expressions = state.saved.expressions.filter((e) => e.projectId !== id);
  persist();
}

/* ---------- 저장한 표현·질문 ---------- */

const norm = (s) => String(s || '').trim().toLowerCase();

export function savedExpressions() { return state.saved.expressions; }
export function savedQuestions() { return state.saved.questions; }

export function isExpressionSaved(projectId, en) {
  return state.saved.expressions.some((e) => e.projectId === projectId && norm(e.en) === norm(en));
}
export function toggleExpression(projectId, expr, from) {
  const i = state.saved.expressions.findIndex((e) => e.projectId === projectId && norm(e.en) === norm(expr.en));
  if (i >= 0) {
    state.saved.expressions.splice(i, 1);
    persist();
    return false;
  }
  state.saved.expressions.unshift({
    id: uid('e'), projectId, from,
    en: expr.en, ko: expr.ko || '', example_en: expr.example_en || '', example_ko: expr.example_ko || '',
    savedAt: new Date().toISOString(), right: 0, wrong: 0,
  });
  persist();
  logEvent('expression_saved', projectId);
  return true;
}
export function removeExpression(id) {
  state.saved.expressions = state.saved.expressions.filter((e) => e.id !== id);
  persist();
}
export function markExpression(id, ok) {
  const e = state.saved.expressions.find((x) => x.id === id);
  if (!e) return;
  if (ok) e.right++; else e.wrong++;
  e.lastReviewed = new Date().toISOString();
  persist();
}

export function isQuestionSaved(projectId, en) {
  return state.saved.questions.some((q) => q.projectId === projectId && norm(q.en) === norm(en));
}
export function toggleQuestion(projectId, q) {
  const i = state.saved.questions.findIndex((x) => x.projectId === projectId && norm(x.en) === norm(q.en));
  if (i >= 0) {
    state.saved.questions.splice(i, 1);
    persist();
    return false;
  }
  state.saved.questions.unshift({ id: uid('q'), projectId, qid: q.id || null, en: q.en, ko: q.ko || '', savedAt: new Date().toISOString() });
  persist();
  return true;
}
export function removeQuestion(id) {
  state.saved.questions = state.saved.questions.filter((q) => q.id !== id);
  persist();
}

/* ---------- 학습 이벤트 (PRD 5·7장 지표) ---------- */

export function logEvent(type, projectId = null, extra = {}) {
  state.events.push({ type, projectId, at: new Date().toISOString(), ...extra });
  if (state.events.length > 1000) state.events = state.events.slice(-1000);
  persist();
}
export function events() { return state.events; }

/* ---------- AI 설정 (이 브라우저에만 저장, 서버에는 저장하지 않음) ---------- */

const AI_KEY = 'interview-prep.ai';
export function aiConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_KEY) || '{}');
    return { provider: raw.provider || null, keys: raw.keys || {}, models: raw.models || {}, tts: raw.tts || {} };
  } catch (_) {
    return { provider: null, keys: {}, models: {}, tts: {} };
  }
}
export function setAiConfig(fn) {
  const c = aiConfig();
  fn(c);
  try { localStorage.setItem(AI_KEY, JSON.stringify(c)); } catch (err) { onError(err); }
  return c;
}

export function clearAll() {
  state = empty();
  persist();
  try { localStorage.removeItem(AI_KEY); } catch (_) { /* 무시 */ }
}
