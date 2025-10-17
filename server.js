// server.js — kết hợp DChart (polling) + PriceAPI (WebSocket realtime)

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
// const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const DCHART_URL = 'https://dchart-api.vndirect.com.vn/dchart/history';
const PRICE_WS_URL = 'wss://price-api.vndirect.com.vn/realtime';

const cache = new Map();
const clients = new Set();

// --- Hàm lấy dữ liệu lịch sử ---
async function fetchHistory(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 3 * 86400; // 3 ngày gần nhất
  const url = `${DCHART_URL}?symbol=${symbol}&resolution=D&from=${from}&to=${now}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.s !== 'ok' || json.t.length === 0) return null;
  const i = json.t.length - 1;
  return {
    code: symbol,
    close: json.c[i],
    reference: json.c[i-1],
    open: json.o[i],
    high: json.h[i],
    low: json.l[i],
    volume: json.v[i],
    date: new Date(json.t[i] * 1000).toISOString()
  };
}

// --- REST endpoint ---
app.get('/api/stocks', async (req, res) => {
  const symbols = (req.query.symbols || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const results = {};
  for (const s of symbols) {
    const data = await fetchHistory(s);
    if (data) {
      cache.set(s, data);
      results[s] = data;
    }
  }
  res.json({ data: results });
});

// --- WebSocket server (cho client Angular) ---
const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
const wss = new WebSocketServer({ server });

// --- Kết nối tới WebSocket realtime của VNDIRECT ---
const vndWS = new (require('ws'))(PRICE_WS_URL);

vndWS.on('open', () => {
  console.log('[VNDIRECT] Realtime WS connected');
  // Sub các mã mặc định
  vndWS.send(JSON.stringify({ type: 'SUBSCRIBE', codes: [] }));
});

vndWS.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw.toString());
    if (msg && msg.code && msg.price) {
      cache.set(msg.code, {
        ...(cache.get(msg.code) || {}),
        code: msg.code,
        price: msg.price,
        change: msg.change,
        pctChange: msg.pctChange,
        time: msg.time,
      });
      // Gửi realtime cho tất cả client Angular
      const data = JSON.stringify({ type: 'tick', data: msg });
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(data);
      }
    }
  } catch (err) {
    console.warn('[VNDIRECT WS Error]', err);
  }
});

wss.on('connection', (ws) => {
  console.log('[Client] connected');
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === 'subscribe') {
        vndWS.send(JSON.stringify({ type: 'SUBSCRIBE', codes: msg.symbols }));
      }
    } catch (err) {
      console.warn('Invalid message', err);
    }
  });
});
