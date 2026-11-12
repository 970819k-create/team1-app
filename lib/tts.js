// 면접관 음성(TTS). Piper가 설치돼 있으면 서버에서 자연스러운 음성 파일을 만들고,
// 없으면 /api/status에서 tts:false를 알려 브라우저 내장 음성을 쓰게 한다.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const VOICE = process.env.PIPER_VOICE || path.join(ROOT, 'voices', 'en_US-ryan-medium.onnx');
const PYTHON = process.env.PYTHON || 'python3';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-tts-'));

let worker = null;
let ready = null;
let queue = Promise.resolve();
const cache = new Map();

export function ttsAvailable() {
  if (ready !== null) return ready;
  if (!fs.existsSync(VOICE)) return (ready = false);
  const check = spawnSync(PYTHON, ['-c', 'import piper'], { stdio: 'ignore' });
  ready = check.status === 0;
  return ready;
}

function startWorker() {
  if (worker) return worker;
  const proc = spawn(PYTHON, [path.join(ROOT, 'tools', 'piper_worker.py'), VOICE], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  const waiters = [];
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      const msg = JSON.parse(line);
      if (msg.ready) continue;
      waiters.shift()?.(msg);
    }
  });
  proc.on('exit', () => {
    worker = null;
    while (waiters.length) waiters.shift()({ ok: false, error: 'worker exited' });
  });
  worker = {
    run(req) {
      return new Promise((resolve) => {
        waiters.push(resolve);
        proc.stdin.write(JSON.stringify(req) + '\n');
      });
    },
  };
  return worker;
}

/** @returns {Promise<Buffer>} WAV 데이터 */
export function synthesize(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim().slice(0, 800);
  const key = crypto.createHash('sha1').update(clean).digest('hex');
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  const job = queue.then(async () => {
    const out = path.join(TMP, `${key}.wav`);
    const res = await startWorker().run({ text: clean, out });
    if (!res.ok) throw new Error(res.error || 'TTS 실패');
    const data = fs.readFileSync(out);
    fs.unlink(out, () => {});
    cache.set(key, data);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return data;
  });
  queue = job.catch(() => {});
  return job;
}
