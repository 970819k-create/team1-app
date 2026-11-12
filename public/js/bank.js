// 영어 면접 질문지 (서버의 data/english_interview_questions.md를 읽은 결과)
let categories = [];
let loading = null;

export function loadBank() {
  if (!loading) {
    loading = fetch('/api/question-bank')
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d) => { categories = d.categories || []; })
      .catch(() => { categories = []; });
  }
  return loading;
}

/** 면접관이 물을 수 있는 분야 (역질문 제외) */
export function interviewerCategories() {
  return categories.filter((c) => c.interviewer);
}
export function allCategories() { return categories; }

export function bankQuestion(id) {
  for (const c of categories) {
    const q = c.questions.find((x) => x.id === id);
    if (q) return q;
  }
  return null;
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 질문지에서 n개 뽑기. 자기소개·지원 동기 같은 질문이 있으면 첫 질문으로 둔다 */
export function pickFromBank(categoryIds, n) {
  const pool = categories
    .filter((c) => categoryIds.includes(c.id))
    .flatMap((c) => c.questions)
    .filter((q) => q.type !== 'reverse');
  const mixed = shuffle(pool);
  const opener = mixed.findIndex((q) => /introduce yourself|about yourself/i.test(q.en));
  if (opener > 0) mixed.unshift(...mixed.splice(opener, 1));
  return mixed.slice(0, n);
}
