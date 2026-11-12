// 링크의 본문을 가져와 텍스트로 바꾼다.
// 읽지 못하거나 내용이 짧으면 그 이유를 돌려주어, 화면에서 '텍스트 직접 붙여넣기'를 안내한다.
import dns from 'node:dns/promises';
import net from 'node:net';

const MIN_CHARS = 300;
const MAX_CHARS = 30000;
const MAX_BYTES = 3 * 1024 * 1024;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.');
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('링크 형식이 올바르지 않아요.'), { code: 'invalid' });
  }
  if (!/^https?:$/.test(url.protocol)) throw Object.assign(new Error('http 또는 https 링크만 읽을 수 있어요.'), { code: 'invalid' });
  if (process.env.ALLOW_PRIVATE_URLS === '1') return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw Object.assign(new Error('사이트 주소를 찾지 못했어요.'), { code: 'dns' });
  if (ips.some(isPrivateIp)) throw Object.assign(new Error('내부 네트워크 주소는 읽을 수 없어요.'), { code: 'invalid' });
  return url;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function htmlToText(html) {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim());
  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)[\s\S]*?<\/\1>/gi, ' ');
  // 본문 영역이 따로 있으면 그 부분을 우선 쓴다
  const main = /<(article|main)[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2];
  if (main && main.replace(/<[^>]+>/g, '').trim().length > 500) body = main;
  else body = body.replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ');
  const text = decode(
    body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim();
  return { title, text };
}

/**
 * @returns {{status:'ok'|'short'|'failed', title:string, text:string, message?:string}}
 */
export async function fetchSource(rawUrl) {
  try {
    const url = await assertPublicUrl(rawUrl);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InterviewPrepReader/0.1)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'ko,en;q=0.8',
      },
    });
    if (!res.ok) {
      const why = res.status === 401 || res.status === 403 ? '로그인이 필요하거나 접근이 막힌 페이지예요' : res.status === 404 ? '페이지를 찾지 못했어요' : `사이트가 오류(${res.status})를 돌려줬어요`;
      return { status: 'failed', title: '', text: '', message: `${why}. 공고·자료의 본문을 복사해 '텍스트 직접 입력'에 붙여넣어 주세요.` };
    }
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) {
      return { status: 'failed', title: '', text: '', message: `웹페이지가 아닌 파일(${type.split(';')[0] || '알 수 없음'})이에요. 내용을 복사해 텍스트로 붙여넣어 주세요.` };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return { status: 'failed', title: '', text: '', message: '페이지가 너무 커서 읽지 못했어요. 필요한 부분만 텍스트로 붙여넣어 주세요.' };
    }
    const raw = new TextDecoder('utf-8').decode(buf);
    const { title, text } = /text\/plain/.test(type) ? { title: '', text: raw.trim() } : htmlToText(raw);
    if (text.length < MIN_CHARS) {
      return {
        status: 'short', title, text,
        message: '읽은 내용이 너무 적어요. 로그인이 필요하거나 화면을 자바스크립트로 그리는 사이트일 수 있어요. 본문을 복사해 텍스트로 붙여넣어 주세요.',
      };
    }
    return { status: 'ok', title, text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS };
  } catch (err) {
    const msg = err.code === 'invalid' || err.code === 'dns'
      ? err.message
      : err.name === 'TimeoutError'
        ? '사이트가 너무 오래 응답하지 않았어요.'
        : '링크를 열지 못했어요.';
    return { status: 'failed', title: '', text: '', message: `${msg} 본문을 복사해 '텍스트 직접 입력'에 붙여넣어 주세요.` };
  }
}
