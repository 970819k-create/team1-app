// 영어 면접 질문지(data/english_interview_questions.md)를 읽어 질문 목록으로 만든다.
// 팀원이 md 파일의 표만 고치면 앱의 질문이 바뀐다 (서버를 다시 켜면 반영).
//
// 형식: "## N부. 제목" 아래 "### N. 분야" 와 표 (| No | Question | 해석 | 출처? |)
//       "출처: ..." 줄은 그 부의 기본 출처, 표의 '출처' 칸이 있으면 그 칸이 우선.
//       맨 아래 "## 출처 목록" 표에서 출처 이름 → URL을 찾는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'english_interview_questions.md');

// 표에 질문 문장 대신 주제만 적힌 줄은 면접관이 말할 수 있는 질문으로 바꿔 쓴다 (원문은 note에 남김)
const REPHRASE = {
  'Thread vs. process / bit manipulation problems': ['What is the difference between a thread and a process?', '스레드와 프로세스의 차이는 무엇인가요?'],
  'Questions on CAN, Vector tools, and your ECU debugging approach': ['How do you debug an ECU issue using CAN and Vector tools?', 'CAN 통신과 Vector 툴로 ECU 문제를 어떻게 디버깅하나요?'],
};

// 분야 이름으로 질문 유형을 정한다 (피드백·답변 예시 구조에 씀)
function typeOf(category, en) {
  if (/역질문/.test(category)) return 'reverse';
  if (/introduce|about yourself|why (did|do|are) you (apply|want)|why .*company|leave|leaving|relocate|five years|how long/i.test(en)) return 'motivation';
  if (/tell me about a time|describe a time|describe a difficult|example|handled|leadership|team|conflict|failed|differently|deadline|pressure|stress|proudest|walk me through your resume|recent role|expert/i.test(en)) return 'behavioral';
  if (/공통|인성|자기소개|이력서|행동/.test(category)) return 'behavioral';
  return 'technical';
}

const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function parseQuestionBank(md) {
  const lines = md.split(/\r?\n/);
  const sourceUrls = {};
  // 출처 목록 먼저
  let inSources = false;
  for (const line of lines) {
    if (/^##\s+출처 목록/.test(line)) { inSources = true; continue; }
    if (inSources && /^##\s/.test(line)) inSources = false;
    if (inSources && line.startsWith('|') && !/^\|\s*-/.test(line)) {
      const [name, url] = cells(line);
      if (url && /^https?:\/\//.test(url)) sourceUrls[name] = url;
    }
  }
  const findUrl = (src) => {
    if (!src) return '';
    const exact = sourceUrls[src];
    if (exact) return exact;
    // 출처 목록에서 이 이름을 포함한 항목이 하나뿐이면 그것을 쓴다
    const contains = Object.keys(sourceUrls).filter((name) => name.toLowerCase().includes(src.toLowerCase()));
    if (contains.length === 1) return sourceUrls[contains[0]];
    // "Glassdoor (TSMC 후기)" 같은 표기는 출처 목록에서 가장 비슷한 이름을 찾는다
    const key = src.replace(/[()]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
    let best = '';
    let bestScore = 0;
    for (const [name, url] of Object.entries(sourceUrls)) {
      const score = key.filter((w) => name.includes(w)).length;
      if (score > bestScore) { best = url; bestScore = score; }
    }
    return bestScore >= 2 ? best : '';
  };

  const categories = [];
  let part = '';
  let partSource = '';
  let cat = null;
  let header = null;
  for (const line of lines) {
    const h2 = /^##\s+(\d+)부\.\s*(.+)$/.exec(line);
    if (h2) { part = `${h2[1]}부 ${h2[2].trim()}`; partSource = ''; cat = null; continue; }
    if (/^##\s+출처 목록/.test(line)) { cat = null; part = ''; continue; }
    const src = /^출처:\s*(.+)$/.exec(line);
    if (src && part) { partSource = src[1].trim(); continue; }
    const h3 = /^###\s+(\d+)\.\s*(.+)$/.exec(line);
    if (h3 && part) {
      cat = { id: `${part.match(/^\d+/)[0]}-${h3[1]}`, part, name: h3[2].trim(), tip: '', questions: [] };
      categories.push(cat);
      header = null;
      continue;
    }
    if (!cat) continue;
    const tip = /^>\s*(?:준비\s*)?팁:\s*(.+)$/.exec(line);
    if (tip) { cat.tip = tip[1].trim(); continue; }
    if (!line.startsWith('|')) continue;
    if (/^\|\s*-/.test(line)) continue;
    const c = cells(line);
    if (!header) { header = c; continue; }
    const col = (name) => header.findIndex((h) => h.toLowerCase().includes(name));
    const original = c[col('question')] || '';
    if (!original) continue;
    const [en, koFix] = REPHRASE[original] || [original, ''];
    const source = c[col('출처')] || partSource || '';
    cat.questions.push({
      id: `B${cat.id}-${c[col('no')] || cat.questions.length + 1}`,
      en,
      ko: koFix || c[col('해석')] || '',
      type: typeOf(cat.name, en),
      category: cat.name,
      categoryId: cat.id,
      part,
      source,
      sourceUrl: findUrl(source),
      note: REPHRASE[original] ? `질문지 원문: "${original}" (면접 질문 문장으로 다듬음)` : '',
    });
  }
  return categories
    .filter((c) => c.questions.length)
    .map((c) => ({ ...c, interviewer: c.questions.some((q) => q.type !== 'reverse') }));
}

let cached = null;
let cachedMtime = 0;
/** 질문지를 읽는다. 파일이 바뀌면 다시 읽는다. 파일이 없으면 빈 목록 */
export function questionBank() {
  try {
    const st = fs.statSync(FILE);
    if (!cached || st.mtimeMs !== cachedMtime) {
      cached = parseQuestionBank(fs.readFileSync(FILE, 'utf8'));
      cachedMtime = st.mtimeMs;
    }
    return cached;
  } catch {
    return [];
  }
}
