// AI(API 키)가 연결되지 않았을 때 쓰는 기본 기능.
// 규칙으로만 동작하므로 결과에 basic: true를 붙이고, 화면에서 'AI 미연결 기본 피드백'으로 표시한다.
// 사용자 경험을 지어내지 않도록 답변 예시는 [자리 표시자] 구조만 준다 (샘플 프로젝트는 미리 쓴 예시 사용).

const COMMON_FIXES = [
  { re: /\bhave an? experiences?\b/i, better: 'have experience', reason_ko: "experience가 '경험(전반)'일 때는 셀 수 없는 명사라 a를 쓰지 않아요." },
  { re: /\b(i'?m|i am) (very |really )?interesting in\b/i, better: "I'm (very) interested in", reason_ko: "내가 관심 있다는 뜻은 interested예요. interesting은 '흥미로운(대상)'이에요." },
  { re: /\bdiscuss about\b/i, better: 'discuss', reason_ko: 'discuss 뒤에는 about을 쓰지 않아요.' },
  { re: /\bexplain about\b/i, better: 'explain', reason_ko: 'explain 뒤에는 about 없이 바로 목적어를 써요.' },
  { re: /\bjoin (to|in) (your|the|this) (company|team)\b/i, better: 'join your company', reason_ko: 'join은 전치사 없이 바로 목적어를 써요.' },
  { re: /\bcontact (with|to)\b/i, better: 'contact', reason_ko: 'contact는 전치사 없이 써요.' },
  { re: /\bin my case,?/i, better: 'For example, / In my experience,', reason_ko: "'In my case'는 한국어 '제 경우에는'의 직역이라 어색할 때가 많아요." },
  { re: /\bi think i can do well\b/i, better: "I'm confident I can contribute to", reason_ko: '막연한 표현보다 무엇에 기여할지 구체적으로 말하면 좋아요.' },
  { re: /\bmajor (in|is) /i, better: 'I majored in ...', reason_ko: "전공을 말할 때는 'I majored in ~'이 자연스러워요." },
  { re: /\bvery very\b/i, better: 'extremely / really', reason_ko: '같은 강조어를 반복하기보다 한 단어로 강조해요.' },
  { re: /\bopportunity to (learn|study) many things\b/i, better: 'opportunity to develop [specific skill]', reason_ko: "'많은 것을 배우고 싶다'보다 구체적인 역량을 말하면 직무 적합성이 드러나요." },
];

const FILLERS = /\b(um+|uh+|you know|like,|kind of|sort of)\b/gi;

function words(text) {
  return (text.match(/[A-Za-z0-9']+/g) || []).length;
}

function keywords(analysis) {
  const src = [
    ...(analysis.competencies || []),
    ...(analysis.duties || []),
    ...(analysis.company_insights || []),
  ].map((x) => x.en).join(' ');
  const stop = new Set(['experience', 'ability', 'skills', 'strong', 'support', 'company', 'related', 'including', 'through', 'across', 'within', 'their', 'which', 'would', 'should', 'other', 'about', 'using']);
  const counts = {};
  for (const w of src.toLowerCase().match(/[a-z]{6,}/g) || []) if (!stop.has(w)) counts[w] = (counts[w] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w);
}

function templateAnswer(project, question) {
  const a = project.analysis || {};
  const company = a.company_name && a.company_name !== '확인되지 않음' ? a.company_name : '[company name]';
  const duty = a.duties?.[0]?.en?.replace(/\.$/, '').toLowerCase() || '[a key duty from the job posting]';
  const insight = a.company_insights?.[0]?.en?.replace(/\.$/, '') || '[something you learned from the company materials]';
  const byType = {
    motivation: [
      `I'm applying to ${company} because ${insight.charAt(0).toLowerCase() + insight.slice(1)}, and I want to be part of that.`,
      `이 회사에 지원하는 이유는 [자료에서 본 회사의 움직임] 때문이고, 그 일에 함께하고 싶어서입니다.`,
    ],
    company: [
      `From what I read, ${insight.charAt(0).toLowerCase() + insight.slice(1)}. I think this matters because [your view].`,
      `제가 읽은 자료에서는 [회사 동향]이 눈에 띄었고, 이것이 중요한 이유는 [나의 생각]이라고 봅니다.`,
    ],
  };
  const open = byType[question.type] || [
    `In [your experience/project], I [what you did]. For example, [a specific situation].`,
    `[나의 경험/프로젝트]에서 저는 [한 일]을 했습니다. 예를 들어 [구체적 상황]이 있었습니다.`,
  ];
  return {
    sample_answer_en: `${open[0]} In [your project or class], I [the action you took], and as a result, [the outcome, with a number if possible]. This is why I believe I can help with ${duty} in this role.`,
    sample_answer_ko: `${open[1]} [나의 프로젝트/수업]에서 [내가 한 행동]을 했고, 그 결과 [가능하면 숫자로 된 성과]를 얻었습니다. 그래서 이 직무의 [공고의 주요 업무]에 기여할 수 있다고 생각합니다.`,
  };
}

function sampleAnswerFor(project, question) {
  const s = project.sample_answers?.[question.id];
  return s ? { sample_answer_en: s.en, sample_answer_ko: s.ko } : templateAnswer(project, question);
}

function improvementsFor(answer) {
  const out = [];
  for (const f of COMMON_FIXES) {
    const m = f.re.exec(answer);
    if (m) out.push({ original: m[0], better: f.better, reason_ko: f.reason_ko });
  }
  const fillers = answer.match(FILLERS);
  if (fillers && fillers.length >= 2) {
    out.push({ original: [...new Set(fillers.map((x) => x.toLowerCase()))].join(', '), better: '(잠깐 멈추기)', reason_ko: `채움말이 ${fillers.length}번 나왔어요. 생각할 때는 말 대신 잠깐 멈추는 편이 더 자신 있어 보여요.` });
  }
  return out;
}

export function basicFeedback({ project, question, answer }) {
  const n = words(answer);
  const strengths = [];
  const tips = [];
  const hasExample = /\b(for example|for instance|when i|during my|in my (project|internship|class|club|job))\b/i.test(answer);
  const hasResult = /\b(as a result|which (led|helped)|result(ed)? in|improv(ed|e)|increas(ed|e)|reduc(ed|e)|achiev(ed|e))\b/i.test(answer);
  const kw = keywords(project.analysis || {});
  const used = kw.filter((k) => answer.toLowerCase().includes(k));

  if (n >= 50) strengths.push(`충분한 길이로 답했어요 (${n}단어).`);
  if (hasExample) strengths.push('구체적인 경험이나 예시를 넣었어요.');
  if (hasResult) strengths.push('행동의 결과까지 말했어요.');
  if (used.length) strengths.push(`공고·기업 자료의 핵심어(${used.slice(0, 3).join(', ')})와 연결했어요.`);

  if (n < 40) tips.push(`답변이 짧아요 (${n}단어). 60~120단어, 말로 40초~1분 정도를 목표로 해 보세요.`);
  if (!hasExample) tips.push("'For example, in my [project], I ...'처럼 구체적인 경험 한 가지를 넣어 보세요.");
  if (!hasResult) tips.push("'As a result, ...'로 행동의 결과를 말하면 설득력이 커져요.");
  if (!used.length && kw.length) tips.push(`자료에 나온 핵심어(${kw.slice(0, 3).join(', ')})를 답변에 연결해 보세요.`);
  tips.push('첫 문장에서 결론(내 답)을 먼저 말하고 이유와 예시를 이어 가세요.');

  return {
    basic: true,
    strengths_ko: strengths.length ? strengths : ['끝까지 영어로 답한 것 자체가 좋은 연습이에요.'],
    improvements: improvementsFor(answer),
    structure_tips_ko: tips.slice(0, 4),
    ...sampleAnswerFor(project, question),
    expressions: (project.analysis?.expressions || []).slice(0, 3),
  };
}

const CLOSING = { say: "That's all the questions I have for today. Thank you for your time, and we'll be in touch.", say_ko: '오늘 준비한 질문은 여기까지입니다. 시간 내 주셔서 감사합니다. 곧 연락드리겠습니다.' };
const FOLLOW_UPS = [
  { say: 'Could you give me a specific example of that?', say_ko: '그것에 대한 구체적인 예를 들어 주시겠어요?' },
  { say: 'What was the result, and what did you learn from it?', say_ko: '결과는 어땠고, 그 경험에서 무엇을 배우셨나요?' },
  { say: 'How would that help you in this role?', say_ko: '그것이 이 직무에서 어떻게 도움이 될까요?' },
];
const TRANSITIONS = ['Thank you.', 'I see, thank you.', 'Okay, thank you for sharing that.', 'Got it.'];

export function basicTurn({ transcript, nextQuestion, allowFollowUp, mustEnd }) {
  if (mustEnd || !nextQuestion && !allowFollowUp) return { basic: true, action: 'end', ...CLOSING };
  const last = [...transcript].reverse().find((t) => t.role === 'candidate')?.text || '';
  const turnNo = transcript.filter((t) => t.role === 'candidate').length;
  if (allowFollowUp && (words(last) < 35 || !/\b(for example|for instance|when i)\b/i.test(last))) {
    return { basic: true, action: 'follow_up', ...FOLLOW_UPS[turnNo % FOLLOW_UPS.length] };
  }
  if (!nextQuestion) return { basic: true, action: 'end', ...CLOSING };
  const t = TRANSITIONS[turnNo % TRANSITIONS.length];
  return { basic: true, action: 'next_question', say: `${t} ${nextQuestion.en}`, say_ko: nextQuestion.ko };
}

export function basicReport({ project, pairs }) {
  const qs = project.analysis?.questions || [];
  const items = pairs.map((p, i) => {
    const q = qs.find((x) => x.id === p.question_id) || { id: p.question_id, en: p.question, type: 'experience' };
    const isFollow = p.kind === 'follow_up';
    const sample = isFollow
      ? {
        sample_answer_en: 'Sure. For example, in [your project], I [specific action]. As a result, [outcome]. From that, I learned [lesson], which I would apply to [duty in this role].',
        sample_answer_ko: '네. 예를 들어 [프로젝트]에서 저는 [구체적인 행동]을 했습니다. 그 결과 [성과]가 있었고, 거기서 배운 [교훈]을 이 직무의 [업무]에 적용하겠습니다.',
      }
      : sampleAnswerFor(project, q);
    return { turn_index: i, improvements: improvementsFor(p.answer || ''), ...sample, expressions: [] };
  });
  const answered = pairs.filter((p) => words(p.answer || '') > 0);
  const avg = answered.length ? Math.round(answered.reduce((s, p) => s + words(p.answer), 0) / answered.length) : 0;
  return {
    basic: true,
    overall_ko: `질문 ${pairs.length}개 중 ${answered.length}개에 답했고, 답변 평균 길이는 ${avg}단어예요. ${avg < 50 ? '답변마다 구체적인 예시와 결과를 한 문장씩 더해 60단어 이상을 목표로 해 보세요.' : '길이는 충분해요. 이제 결론-예시-결과 순서로 정리하는 연습을 해 보세요.'}`,
    items,
  };
}
