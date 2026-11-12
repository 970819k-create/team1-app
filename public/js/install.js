// 앱으로 설치(PWA)와 친구에게 공유
// - Chrome·Edge·안드로이드: 브라우저가 주는 설치 창을 띄운다
// - 아이폰·아이패드(Safari): 설치 창이 없어서 [공유 → 홈 화면에 추가] 방법을 보여 준다
import { esc, toast } from './ui.js';

let deferredPrompt = null;
const listeners = new Set();

export function initInstall() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    toast('앱으로 설치했어요. 홈 화면이나 앱 목록에서 깜자를 찾아 보세요.', 5000);
    listeners.forEach((fn) => fn());
  });
}

export function onInstallChange(fn) { listeners.add(fn); }

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 처음 화면·설정에 넣는 '앱으로 쓰기' 카드 */
export function installCardHTML() {
  const installed = isStandalone();
  return `
    <div class="app-card">
      <b>깜자를 앱으로 쓰기</b>
      <p class="small muted">${installed ? '지금 앱으로 쓰고 있어요. 친구에게도 링크를 보내 보세요.' : '설치하면 홈 화면 아이콘으로 바로 열려요. 설치 없이 링크로만 써도 돼요.'}</p>
      <div class="row gap-s wrap">
        ${installed ? '' : '<button type="button" class="btn primary small" data-action="app-install">📲 앱으로 설치</button>'}
        <button type="button" class="btn ghost small" data-action="app-share">🔗 친구에게 공유</button>
      </div>
    </div>`;
}

/** 버튼 처리. 처리했으면 true */
export async function handleInstallAction(btn) {
  if (btn.dataset.action === 'app-install') {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome !== 'accepted') toast('나중에 다시 설치할 수 있어요.');
      return true;
    }
    showGuide();
    return true;
  }
  if (btn.dataset.action === 'app-share') {
    const url = `${location.origin}/`;
    const data = { title: '쉬었음 깜자 · AI 영어 면접 준비', text: '지원할 회사 공고로 영어 면접을 연습하는 앱이에요. 깜자랑 같이 준비해 봐요!', url };
    if (navigator.share) {
      try { await navigator.share(data); } catch (_) { /* 사용자가 닫음 */ }
      return true;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(`링크를 복사했어요: ${url}`, 4500);
    } catch (_) {
      prompt('이 링크를 복사해 보내 주세요', url); // 복사가 막힌 브라우저
    }
    return true;
  }
  return false;
}

function showGuide() {
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  const ios = isIOS();
  dlg.innerHTML = `
    <h3>앱으로 설치하는 방법</h3>
    ${ios ? `
      <ol class="install-steps">
        <li><b>Safari</b>로 이 페이지를 열어요. (카카오톡 등 앱 안의 브라우저라면 [Safari로 열기])</li>
        <li>아래쪽 <b>공유 버튼</b>(네모 위로 화살표 ⬆️)을 눌러요.</li>
        <li><b>홈 화면에 추가</b>를 누르고 오른쪽 위 <b>추가</b>를 눌러요.</li>
      </ol>`
    : `
      <ol class="install-steps">
        <li><b>Chrome</b>이나 <b>Edge</b>로 이 페이지를 열어요. (카카오톡 안 브라우저라면 [다른 브라우저로 열기])</li>
        <li>주소창 오른쪽의 <b>설치 아이콘(⊕ 또는 컴퓨터 모양)</b>을 누르거나,</li>
        <li>메뉴(⋮) → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러요.</li>
      </ol>`}
    <p class="small muted">설치해도 링크로 쓸 때와 같은 앱이에요. 기록과 키는 이 기기에만 저장돼요.</p>
    <div class="row end"><button class="btn primary" value="ok">확인</button></div>`;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target.closest('button') || e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

