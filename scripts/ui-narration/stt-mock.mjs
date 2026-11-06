// OpenAI-compatible /v1/audio/transcriptions stand-in: validates the WAV it gets
// (format, duration, loudness) and logs it. Text comes from the synthesized script,
// since Whisper models can't be downloaded in this sandbox.
import { createServer } from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';
const lines = readFileSync('' + (process.env.LINES ?? '/tmp/audio/lines.txt') + '', 'utf8').split('\n');
let n = 0;
createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const i = body.indexOf('RIFF');
    const wav = body.subarray(i);
    const rate = wav.readUInt32LE(24), ch = wav.readUInt16LE(22), bits = wav.readUInt16LE(34), size = wav.readUInt32LE(40);
    const secs = size / 2 / rate;
    let peak = 0; for (let o = 44; o + 1 < 44 + size && o + 1 < wav.length; o += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(o)));
    const auth = req.headers.authorization ?? '';
    const model = /name="model"\r\n\r\n([^\r]+)/.exec(body.toString('latin1'))?.[1];
    const text = lines[n] ?? '';
    appendFileSync('/tmp/audio/stt.log', JSON.stringify({ seg: n, rate, ch, bits, secs: +secs.toFixed(2), peak, model, auth: auth.slice(0, 12), text }) + '\n');
    n++;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text }));
  });
}).listen(9100, '127.0.0.1', () => console.log('stt mock on 9100'));
