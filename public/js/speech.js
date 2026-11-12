// 음성: 면접관 말하기(TTS)와 답변 듣기(음성 인식, STT)
// - TTS: [설정]의 '면접관 목소리'에 따라
//     · openai  : OpenAI 음성 (서버가 대신 요청, 키는 브라우저 설정의 OpenAI 키)
//     · piper   : 서버에 설치된 Piper 음성
//     · browser : 브라우저 내장 음성 (speechSynthesis)
//   설정이 없으면 Piper가 있으면 Piper, 없으면 브라우저 음성. OpenAI·Piper가 실패하면 이유를 한 번 알리고 브라우저 음성으로 읽는다.
// - STT: 브라우저 음성 인식(Web Speech API). Chrome·Edge·Safari에서 동작. 없으면 키보드 입력으로 대신한다.
// - 음성 원본은 저장하지 않는다. 인식된 텍스트만 쓴다.
import * as store from './store.js';
import { apiAudio, toast } from './ui.js';

let serverTts = false;
let ttsOptions = { voices: [], models: [] };

/** 면접관 사진 번호별 기본 목소리 (OpenAI)와 성별 (브라우저 음성 고를 때 사용) */
export const INTERVIEWER_VOICES = {
  1: { voice: 'ash', gender: 'm' }, 2: { voice: 'nova', gender: 'f' }, 3: { voice: 'onyx', gender: 'm' },
  4: { voice: 'coral', gender: 'f' }, 5: { voice: 'echo', gender: 'm' }, 6: { voice: 'sage', gender: 'f' },
  7: { voice: 'verse', gender: 'm' }, 8: { voice: 'shimmer', gender: 'f' }, 9: { voice: 'ballad', gender: 'm' },
  10: { voice: 'alloy', gender: 'f' },
};
export const COACH_VOICE = 'nova'; // 깜자 목소리
const audio = new Audio();
audio.preload = 'auto';
let speakToken = 0;
const clips = new Map(); // 같은 문장은 다시 요청하지 않는다 (요금·대기 시간 절약)
let lastWarned = '';

export function configure({ tts, ttsOptions: opts }) {
  serverTts = !!tts;
  if (opts) ttsOptions = opts;
}
export function voiceList() { return ttsOptions.voices || []; }

/** 지금 쓰는 면접관 목소리 */
export function ttsEngine() {
  const t = store.aiConfig().tts || {};
  if (t.engine === 'openai') return 'openai';
  if (t.engine === 'browser') return 'browser';
  if (t.engine === 'piper') return serverTts ? 'piper' : 'browser';
  return serverTts ? 'piper' : 'browser';
}

export function ttsMode() {
  const e = ttsEngine();
  if (e !== 'browser') return 'server';
  return 'speechSynthesis' in window ? 'browser' : 'none';
}

const FEMALE = /female|woman|samantha|zira|aria|jenny|susan|karen|victoria|allison|ava|emma|michelle|sara|heami|yuna|sunhi|seoyeon|google 한국|google us english/i;
const MALE = /\bmale\b|man|david|mark|guy|daniel|alex|fred|tom|james|ryan|christopher|eric|injoon|hyunsu/i;

/** 브라우저 음성 고르기: 언어(영어/한국어)와 성별(가능하면)을 맞춘다 */
function pickVoice(lang = 'en', gender) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const inLang = voices.filter((v) => (lang === 'ko' ? /^ko/i : /^en/i).test(v.lang));
  const pref = lang === 'ko' ? inLang : inLang.filter((v) => /en-US/i.test(v.lang)).concat(inLang);
  if (gender === 'f') { const f = pref.find((v) => FEMALE.test(v.name) && !MALE.test(v.name)); if (f) return f; }
  if (gender === 'm') { const m = pref.find((v) => MALE.test(v.name)); if (m) return m; }
  return pref.find((v) => /Google|Natural|Samantha|Aria|Jenny|Yuna|Heami/i.test(v.name)) || pref[0];
}

/* ---------- 말소리 크기 (깜자 입 움직임용) ---------- */
let audioCtx = null;
let analyser = null;
let levelBuf = null;
function ensureAnalyser() {
  if (analyser || typeof window.AudioContext === 'undefined') return;
  try {
    audioCtx = new AudioContext();
    const src = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    levelBuf = new Uint8Array(analyser.fftSize);
  } catch (_) {
    analyser = null;
  }
}
/** 지금 나오는 음성의 크기 0~1. 파일 음성일 때만 알 수 있고, 브라우저 음성이면 null */
export function audioLevel() {
  if (!analyser || audio.paused) return null;
  analyser.getByteTimeDomainData(levelBuf);
  let sum = 0;
  for (let i = 0; i < levelBuf.length; i++) { const d = (levelBuf[i] - 128) / 128; sum += d * d; }
  return Math.min(1, Math.sqrt(sum / levelBuf.length) * 4);
}
let browserSpeaking = false;
/** 지금 무언가를 말하고 있는지 */
export function isSpeaking() {
  return browserSpeaking || (!audio.paused && !audio.ended);
}

async function clipUrl(text, engine, opts = {}) {
  const t = store.aiConfig().tts || {};
  const voice = opts.voice || t.voice || '';
  const model = opts.model || t.model || '';
  const role = opts.role || 'interviewer';
  const key = `${engine}|${voice}|${model}|${role}|${text}`;
  if (clips.has(key)) return clips.get(key);
  const blob = await apiAudio('/api/tts', { text, engine, voice, model, role, lang: opts.lang });
  const url = URL.createObjectURL(blob);
  clips.set(key, url);
  if (clips.size > 60) {
    const [oldKey, oldUrl] = clips.entries().next().value;
    URL.revokeObjectURL(oldUrl);
    clips.delete(oldKey);
  }
  return url;
}

function playUrl(url, rate, token) {
  ensureAnalyser();
  try { audioCtx?.resume?.(); } catch (_) { /* 무시 */ }
  return new Promise((resolve, reject) => {
    audio.src = url;
    audio.playbackRate = rate;
    audio.onended = () => token === speakToken && resolve();
    audio.onerror = () => token === speakToken && reject(new Error('음성 파일을 재생하지 못했어요.'));
    audio.play().catch((err) => {
      if (token !== speakToken) return;
      reject(Object.assign(new Error('소리를 재생하지 못했어요. 화면을 한 번 누른 뒤 [질문 다시 듣기]를 눌러 주세요.'), { code: err.name }));
    });
  });
}

/**
 * 영어 문장을 읽는다. 다 읽으면 resolve. 실패하면 reject(Error).
 * opts.engine/voice/model로 이번 한 번만 다른 목소리를 쓸 수 있다 (설정의 '미리 듣기').
 */
export async function speak(text, { rate = 1, engine: forced, voice, model, strict = false, role = 'interviewer', lang = 'en', gender } = {}) {
  stopSpeaking();
  const token = ++speakToken;
  if (!text) return;
  let engine = forced || ttsEngine();
  if (engine === 'piper' && lang === 'ko') engine = 'browser'; // Piper 음성은 영어만
  const fb = () => fallbackSpeak(text, rate, token, lang, gender);
  if (engine === 'browser') return fb();

  let url;
  try {
    url = await clipUrl(text, engine, { voice, model, role, lang });
  } catch (err) {
    if (token !== speakToken) return;
    if (strict) throw err;
    // 면접이 멈추지 않도록 이유를 한 번 알리고 브라우저 음성으로 읽는다
    if (lastWarned !== err.message) {
      lastWarned = err.message;
      toast(`${err.message} (지금은 브라우저 기본 음성으로 읽어요)`, 8000);
    }
    return fb();
  }
  if (token !== speakToken) return;
  try {
    await playUrl(url, rate, token);
  } catch (err) {
    if (err.code === 'NotAllowedError' || strict) throw err;
    return fb();
  }
}

function fallbackSpeak(text, rate, token, lang = 'en', gender) {
  if (!('speechSynthesis' in window)) return Promise.reject(new Error('이 브라우저는 음성 읽기를 지원하지 않아요. 화면의 글을 보고 진행해 주세요.'));
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
    u.rate = 0.95 * rate;
    const v = pickVoice(lang, gender);
    if (v) u.voice = v;
    const done = () => { browserSpeaking = false; if (token === speakToken) resolve(); };
    // 일부 브라우저는 onend가 오지 않으므로 예상 시간 뒤에도 끝낸다 (한국어는 글자 수로 계산)
    const est = lang === 'ko' ? text.length * 170 : text.split(/\s+/).length * 520;
    const guard = setTimeout(done, 1500 + est / rate);
    u.onend = () => { clearTimeout(guard); done(); };
    u.onerror = () => { clearTimeout(guard); done(); };
    browserSpeaking = true;
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  speakToken++;
  browserSpeaking = false;
  try { audio.pause(); } catch (_) { /* 무시 */ }
  try { window.speechSynthesis?.cancel(); } catch (_) { /* 무시 */ }
}
/* ---------------- 음성 인식 ---------------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const sttSupported = !!SR;

const ERROR_TEXT = {
  'not-allowed': '마이크 사용이 막혀 있어요. 주소창 왼쪽의 자물쇠(사이트 설정)에서 마이크를 [허용]으로 바꾼 뒤 다시 시도해 주세요.',
  'service-not-allowed': '이 브라우저에서 음성 인식을 쓸 수 없어요. Chrome을 쓰거나 키보드로 입력해 주세요.',
  'audio-capture': '마이크를 찾지 못했어요. 마이크(이어폰)가 연결돼 있는지 확인해 주세요.',
  network: '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  'language-not-supported': '영어 음성 인식을 지원하지 않는 환경이에요. 키보드로 입력해 주세요.',
};

/**
 * 답변 한 번을 듣는 인식기. stop()을 누를 때까지 계속 듣고, 중간에 끊기면 자동으로 다시 켠다.
 * onUpdate(finalText, interimText), onState(state, message)
 */
export class Listener {
  constructor({ onUpdate, onState }) {
    this.onUpdate = onUpdate || (() => {});
    this.onState = onState || (() => {});
    this.finalText = '';
    this.active = false;
    this.rec = null;
  }

  start(initial = '') {
    if (!SR) {
      this.onState('error', '이 브라우저는 음성 인식을 지원하지 않아요. Chrome이나 Edge를 쓰거나 키보드로 입력해 주세요.');
      return false;
    }
    this.finalText = initial ? initial.trim() + ' ' : '';
    this.active = true;
    this._open();
    return true;
  }

  _open() {
    const rec = new SR();
    this.rec = rec;
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => this.onState('listening');
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript.trim() + ' ';
        else interim += r[0].transcript;
      }
      this.onUpdate(this.finalText.trim(), interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // 조용하면 다시 켠다
      this.active = false;
      this.onState('error', ERROR_TEXT[e.error] || `음성 인식 오류(${e.error}). 다시 시도하거나 키보드로 입력해 주세요.`);
    };
    rec.onend = () => {
      if (this.active && this.rec === rec) {
        try { rec.start(); } catch (_) { setTimeout(() => this.active && this._open(), 250); }
        return;
      }
      this.onState('stopped');
    };
    try {
      rec.start();
    } catch (_) {
      this.active = false;
      this.onState('error', '음성 인식을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    }
  }

  /** 듣기를 멈추고 지금까지 인식한 텍스트를 돌려준다 */
  stop() {
    this.active = false;
    try { this.rec?.stop(); } catch (_) { /* 무시 */ }
    return this.finalText.trim();
  }

  abort() {
    this.active = false;
    try { this.rec?.abort(); } catch (_) { /* 무시 */ }
  }
}
