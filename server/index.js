// FH6 Dashboard server.
//   - Listens for Forza Horizon 6 "Data Out" UDP packets
//   - Parses + derives race-engineer metrics
//   - Broadcasts frames to browsers over WebSocket
//   - Serves the built client and handles session-recorder control

import http from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { parsePacket } from './parser.js';
import { deriveFrame, engineerNotes } from './metrics.js';
import { Recorder } from './recorder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

const HTTP_PORT = Number(process.env.PORT || 8080);
const UDP_PORT = Number(process.env.UDP_PORT || 5300);
const UDP_HOST = process.env.UDP_HOST || '0.0.0.0';

const recorder = new Recorder();

let prevFrame = null;
let prevTs = 0;
let lastPacketAt = 0;
let lastFrame = null;
let packetCount = 0;
let lastPacketLen = 0;

// ---- HTTP static server (serves built client) -----------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      udpPort: UDP_PORT,
      packets: packetCount,
      lastPacketLen,
      hasTireWear: lastPacketLen >= 339,
      recording: recorder.status(),
    }));
    return;
  }

  if (!fs.existsSync(CLIENT_DIST)) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>FH6 Dashboard server running</h1><p>Client not built yet. Run <code>npm run build</code>, or use <code>npm run dev</code> for the dev UI on port 5173.</p>');
    return;
  }

  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(CLIENT_DIST, path.normalize(urlPath));
  if (!filePath.startsWith(CLIENT_DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(CLIENT_DIST, 'index.html'); // SPA fallback
  }
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---- WebSocket: telemetry stream + recorder control -----------------------
const wss = new WebSocketServer({ server });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'hello',
    udpPort: UDP_PORT,
    connected: Date.now() - lastPacketAt < 2000,
    recording: recorder.status(),
    sessions: recorder.list(),
    last: lastFrame,
  }));

  ws.on('message', (raw) => {
    let cmd;
    try { cmd = JSON.parse(raw.toString()); } catch { return; }
    switch (cmd.type) {
      case 'record-start':
        broadcast({ type: 'recording', status: recorder.start(cmd.meta || {}) });
        break;
      case 'record-stop': {
        const summary = recorder.stop();
        broadcast({ type: 'recording', status: recorder.status() });
        if (summary) broadcast({ type: 'session-saved', summary, sessions: recorder.list() });
        break;
      }
      case 'sessions-list':
        ws.send(JSON.stringify({ type: 'sessions', sessions: recorder.list() }));
        break;
      case 'session-get': {
        const summary = recorder.getSummary(cmd.id);
        ws.send(JSON.stringify({ type: 'session', summary }));
        break;
      }
      case 'session-delete': {
        recorder.delete(cmd.id);
        broadcast({ type: 'sessions', sessions: recorder.list() });
        break;
      }
      case 'sessions-delete-all': {
        recorder.deleteAll();
        broadcast({ type: 'sessions', sessions: recorder.list() });
        break;
      }
    }
  });
});

// ---- UDP telemetry listener -----------------------------------------------
const udp = dgram.createSocket('udp4');

udp.on('message', (buf) => {
  const t = parsePacket(buf);
  if (!t) return;
  if (buf.length !== lastPacketLen) {
    console.log(`[udp] packet length = ${buf.length} bytes (tire-wear data ${buf.length >= 339 ? 'present' : 'NOT present'})`);
    lastPacketLen = buf.length;
  }
  packetCount++;

  const now = Date.now();
  const dt = prevTs ? (now - prevTs) / 1000 : 0;
  const d = deriveFrame(t, prevFrame, dt);
  const notes = engineerNotes(t, d);
  const frame = { type: 'telemetry', t, d, notes, ts: now };

  lastFrame = frame;
  lastPacketAt = now;
  prevFrame = t;
  prevTs = now;

  // A race capture ends itself; add() returns the summary when it does.
  const autoSummary = recorder.add(frame);
  if (autoSummary) {
    console.log(`[recorder] race finished — auto-stopped ${autoSummary.id} (${autoSummary.frames} frames, ${autoSummary.durationSec}s)`);
    broadcast({ type: 'recording', status: recorder.status() });
    broadcast({ type: 'session-saved', summary: autoSummary, sessions: recorder.list(), auto: true });
  }
  broadcast(frame);
});

udp.on('error', (err) => {
  console.error('[udp] error:', err.message);
  if (err.code === 'EADDRINUSE') process.exit(1);
});

udp.bind(UDP_PORT, UDP_HOST, () => {
  console.log(`[udp] listening for Forza Data Out on ${UDP_HOST}:${UDP_PORT}`);
});

// ---- Status heartbeat (lets the client show connection/recording state) ---
setInterval(() => {
  broadcast({
    type: 'status',
    connected: Date.now() - lastPacketAt < 2000,
    packets: packetCount,
    recording: recorder.status(),
  });
}, 1000);

server.listen(HTTP_PORT, () => {
  console.log(`[http] dashboard + WebSocket on http://localhost:${HTTP_PORT}`);
  console.log(`[info] point Forza "Data Out" at this machine's IP, port ${UDP_PORT}`);
});

function shutdown() { recorder.stop(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
