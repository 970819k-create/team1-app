// 음성: 면접관 말하기(TTS)와 답변 듣기(음성 인식, STT)
// - TTS: 서버에 Piper가 있으면 음성 파일, 없으면 브라우저 내장 음성(speechSynthesis)
// - STT: 브라우저 음성 인식(Web Speech API). Chrome·Edge·Safari에서 동작. 없으면 키보드 입력으로 대신한다.
// - 음성 원본은 저장하지 않는다. 인식된 텍스트만 쓴다.

let serverTts = false;
const audio = new Audio();
audio.preload = 'auto';
let speakToken = 0;

export function configure({ tts }) {
  serverTts = !!tts;
}

export function ttsMode() {
  if (serverTts) return 'server';
  return 'speechSynthesis' in window ? 'browser' : 'none';
}

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find((v) => /en-US/i.test(v.lang) && /Google|Samantha|Aria|Jenny|Natural/i.test(v.name))
    || voices.find((v) => /en-US/i.test(v.lang))
    || voices.find((v) => /^en/i.test(v.lang));
}

/** 영어 문장을 읽는다. 다 읽으면 resolve. 실패하면 reject(Error). */
export function speak(text, { rate = 1 } = {}) {
  stopSpeaking();
  const token = ++speakToken;
  if (!text) return Promise.resolve();

  if (serverTts) {
    return new Promise((resolve, reject) => {
      audio.src = `/api/tts?text=${encodeURIComponent(text)}`;
      audio.playbackRate = rate;
      audio.onended = () => token === speakToken && resolve();
      audio.onerror = () => token === speakToken && fallbackSpeak(text, rate, token).then(resolve, reject);
      audio.play().catch((err) => {
        if (token !== speakToken) return;
        reject(Object.assign(new Error('소리를 재생하지 못했어요. 화면을 한 번 누른 뒤 [질문 다시 듣기]를 눌러 주세요.'), { code: err.name }));
      });
    });
  }
  return fallbackSpeak(text, rate, token);
}

function fallbackSpeak(text, rate, token) {
  if (!('speechSynthesis' in window)) return Promise.reject(new Error('이 브라우저는 음성 읽기를 지원하지 않아요. 질문 텍스트를 보고 답해 주세요.'));
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95 * rate;
    const v = pickVoice();
    if (v) u.voice = v;
    // 일부 브라우저는 onend가 오지 않으므로 예상 시간 뒤에도 끝낸다
    const guard = setTimeout(() => token === speakToken && resolve(), 1500 + text.split(/\s+/).length * 520 / rate);
    u.onend = () => { clearTimeout(guard); if (token === speakToken) resolve(); };
    u.onerror = () => { clearTimeout(guard); if (token === speakToken) resolve(); };
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  speakToken++;
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
