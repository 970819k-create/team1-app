// ① 자료 입력 (+ 내 준비 목록)
import * as store from './store.js';
import { $, $$, esc, api, toast, confirmBox, fmtDate } from './ui.js';

let companyRows = 1;

function sourceField(name, label, { required = false, idx = 0 } = {}) {
  return `
    <div class="source-field" data-field="${name}">
      <div class="row between">
        <label class="field-label" for="${name}-url">${label}${required ? ' <span class="req">필수</span>' : ''}</label>
        ${idx > 0 ? `<button type="button" class="link small" data-action="remove-company" data-idx="${idx}">삭제</button>` : ''}
      </div>
      <div class="seg" role="tablist">
        <button type="button" role="tab" class="on" data-action="mode" data-target="${name}" data-mode="url" aria-selected="true">링크</button>
        <button type="button" role="tab" data-action="mode" data-target="${name}" data-mode="text" aria-selected="false">텍스트 직접 입력</button>
      </div>
      <input id="${name}-url" name="${name}-url" type="url" inputmode="url" placeholder="https://" class="input" autocomplete="off">
      <textarea id="${name}-text" name="${name}-text" class="input" rows="6" hidden
        placeholder="${name === 'job' ? '공고 본문(주요 업무, 자격 요건 등)을 복사해 붙여넣어 주세요.' : '기사나 회사 소개 본문을 복사해 붙여넣어 주세요.'}"></textarea>
    </div>`;
}

export function renderInput(view, status) {
  companyRows = 1;
  const list = store.projects();
  view.innerHTML = `
    <section class="hero">
      <h1>지원할 회사의 공고로<br>영어 면접을 준비하세요</h1>
      <p class="muted">채용공고와 기업 자료를 넣으면 핵심을 한글·영어로 정리하고, 그 내용으로 영어 면접 질문을 만들어 AI 면접관과 연습해요.</p>
      <div class="row wrap gap">
        <a class="badge ${status.ai ? 'ai' : 'warn'}" href="#settings">${status.ai ? `${esc(status.providerLabel)} 연결됨 · 바꾸기` : status.problem === 'ollama_offline' ? 'Ollama가 꺼져 있어요 · 설정에서 다른 AI 고르기' : 'AI 미연결 · 설정에서 연결하기'}</a>
        <button class="btn ghost" data-action="sample">샘플로 체험하기</button>
      </div>
    </section>

    <div class="grid-2">
      <form id="input-form" class="card form" novalidate>
        <h2>① 자료 입력</h2>
        ${sourceField('job', '채용공고', { required: true })}
        <div id="company-list">
          ${sourceField('company0', '기업 관련 기사·자료')}
        </div>
        <button type="button" class="btn ghost small" data-action="add-company">+ 기업 자료 추가</button>

        <label class="field-label" for="role">지원 직무명 <span class="opt">선택</span></label>
        <input id="role" class="input" placeholder="예: Product Marketing Associate">

        <label class="field-label" for="experience">나의 경험·이력 핵심 <span class="opt">선택</span></label>
        <textarea id="experience" class="input" rows="4"
          placeholder="예: 경영학 전공, 교내 마케팅 동아리에서 SNS 캠페인 운영(팔로워 30% 증가), 교환학생 팀 프로젝트"></textarea>
        <p class="hint">입력한 경험만 답변 예시에 써요. 입력하지 않은 경력은 [자리 표시자]로 비워 둬요.</p>

        <div id="input-result" aria-live="polite"></div>

        <button class="btn primary wide" type="submit" id="analyze-btn">분석 시작</button>
        <details class="notice small">
          <summary>입력한 정보는 어떻게 쓰이나요?</summary>
          <ul>
            <li>자료, 분석 결과, 답변 텍스트는 <b>이 브라우저에만</b> 저장되고 언제든 삭제할 수 있어요.</li>
            <li>분석·피드백을 만들 때 자료와 답변 텍스트가 AI 제공업체(Anthropic API)로 전송돼요.</li>
            <li>음성 원본은 저장하지 않아요. 음성 인식은 브라우저 기능을 쓰며, Chrome은 인식을 위해 음성을 Google 서버로 보낼 수 있어요.</li>
          </ul>
        </details>
      </form>

      <section class="card">
        <h2>내 면접 준비</h2>
        ${list.length ? `<ul class="project-list">${list.map((p) => `
          <li>
            <a href="#p/${esc(p.id)}" class="project-item">
              <span class="project-name">${esc(p.name)}</span>
              <span class="small muted">${fmtDate(p.createdAt)} · 질문 ${p.analysis?.questions?.length || 0}개 · 연습 ${Object.values(p.practice || {}).reduce((n, x) => n + (x.attempts?.length || 0), 0)}회 · 면접 ${p.sessions?.length || 0}회</span>
            </a>
            <button class="icon-btn" data-action="delete-project" data-id="${esc(p.id)}" aria-label="${esc(p.name)} 삭제" title="삭제">🗑</button>
          </li>`).join('')}</ul>`
          : '<p class="muted">아직 준비 중인 회사가 없어요. 왼쪽에 자료를 넣거나 샘플로 시작해 보세요.</p>'}
      </section>
    </div>`;
}

function readSource(form, name) {
  const mode = $(`[data-field="${name}"] .seg .on`, form)?.dataset.mode || 'url';
  const url = $(`#${name}-url`, form).value.trim();
  const text = $(`#${name}-text`, form).value.trim();
  return mode === 'text' ? { text, url: '' } : { url, text: '' };
}

function setMode(form, name, mode) {
  $$(`[data-field="${name}"] .seg button`, form).forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on);
  });
  $(`#${name}-url`, form).hidden = mode !== 'url';
  $(`#${name}-text`, form).hidden = mode !== 'text';
}

const STATUS_TEXT = { ok: '읽음', short: '내용 부족', failed: '읽지 못함' };

function showSourceResult(form, data) {
  const box = $('#input-result', form);
  box.innerHTML = `
    <div class="alert ${data.reason === 'no_ai' ? 'info' : 'error'}">
      <p><b>${esc(data.message)}</b></p>
      ${data.sources?.length ? `<ul class="source-status">${data.sources.map((s) => `
        <li class="${s.status}">
          <span class="badge ${s.status === 'ok' ? 'ok' : 'warn'}">${s.id} · ${STATUS_TEXT[s.status]}</span>
          <span class="small">${esc(s.kind === 'job' ? '채용공고' : '기업 자료')} ${s.url ? `· ${esc(s.url)}` : ''}</span>
          ${s.message ? `<span class="small">${esc(s.message)}</span>` : ''}
        </li>`).join('')}</ul>` : ''}
      ${data.reason === 'no_ai' ? '<button type="button" class="btn ghost small" data-action="sample">샘플로 체험하기</button>' : ''}
    </div>`;
  // 읽지 못한 자료는 텍스트 입력 칸을 열어 준다
  const names = ['job', ...$$('#company-list [data-field]', form).map((el) => el.dataset.field)];
  (data.sources || []).forEach((s, i) => {
    if (s.status !== 'ok' && names[i]) {
      setMode(form, names[i], 'text');
      $(`#${names[i]}-text`, form).classList.add('attention');
    }
  });
}

export function bindInput(view, { go }) {
  view.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    const form = $('#input-form', view);
    if (!btn || (!form && btn.dataset.action !== 'sample')) return;
    switch (btn.dataset.action) {
      case 'mode': setMode(form, btn.dataset.target, btn.dataset.mode); break;
      case 'add-company': {
        if ($$('#company-list [data-field]', form).length >= 4) { toast('기업 자료는 4개까지 넣을 수 있어요.'); break; }
        const name = `company${companyRows++}`;
        $('#company-list', form).insertAdjacentHTML('beforeend', sourceField(name, '기업 관련 기사·자료', { idx: companyRows }));
        $(`#${name}-url`, form).focus();
        break;
      }
      case 'remove-company': btn.closest('.source-field').remove(); break;
      case 'sample': {
        const sample = await api('/api/sample');
        const existing = store.projects().find((p) => p.sample);
        const p = existing || store.addProject(sample);
        if (!existing) store.logEvent('analysis_complete', p.id, { sample: true });
        go(`#p/${p.id}`);
        break;
      }
      case 'delete-project': {
        const p = store.project(btn.dataset.id);
        if (p && await confirmBox(`'${p.name}'의 자료, 분석, 연습·면접 기록, 저장한 표현을 모두 삭제할까요? 되돌릴 수 없어요.`, { ok: '삭제', danger: true })) {
          store.deleteProject(p.id);
          toast('삭제했어요.');
          go('#home', true);
        }
        break;
      }
      default: break;
    }
  });

  view.addEventListener('submit', async (e) => {
    if (e.target.id !== 'input-form') return;
    e.preventDefault();
    const form = e.target;
    const job = readSource(form, 'job');
    if (!job.url && !job.text) {
      toast('채용공고 링크나 본문을 넣어 주세요.');
      $('#job-url', form).hidden ? $('#job-text', form).focus() : $('#job-url', form).focus();
      return;
    }
    const company = $$('#company-list [data-field]', form).map((el) => readSource(form, el.dataset.field)).filter((c) => c.url || c.text);
    const role = $('#role', form).value.trim();
    const experience = $('#experience', form).value.trim();
    const btn = $('#analyze-btn', form);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 자료를 읽고 분석하는 중… (30초~1분)';
    $('#input-result', form).innerHTML = '';
    store.logEvent('analysis_start');
    try {
      const data = await api('/api/analyze', { job, company, role, experience });
      if (!data.ok) {
        showSourceResult(form, data);
        return;
      }
      const a = data.analysis;
      const missed = data.sources.filter((src) => src.status !== 'ok');
      if (missed.length) {
        a.warnings = [`${missed.map((src) => src.id).join(', ')} 자료는 읽지 못해 분석에서 빠졌어요. 필요하면 본문을 텍스트로 넣어 다시 분석해 주세요.`, ...(a.warnings || [])];
      }
      const name = [a.company_name, role || a.role_title].filter((x) => x && x !== '확인되지 않음').join(' · ') || '새 면접 준비';
      const p = store.addProject({
        name, role, experience,
        inputs: { job, company },
        sources: data.sources,
        analysis: a,
      });
      store.logEvent('analysis_complete', p.id);
      go(`#p/${p.id}`);
    } catch (err) {
      $('#input-result', form).innerHTML = `<div class="alert error"><p><b>${esc(err.message)}</b></p></div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '분석 시작';
    }
  });
}
