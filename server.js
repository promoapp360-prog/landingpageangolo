// Landing Epilazione Laser 3D — L'Angolo del Benessere
// Node 22+, nessuna dipendenza. Avvio: npm start
process.env.TZ = process.env.TZ || 'Europe/Rome';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const env = process.env;

// ---------------------------------------------------------------- config
function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  if (env.POSTI_DISPONIBILI) cfg.posti_disponibili = Number(env.POSTI_DISPONIBILI);
  cfg.meta_pixel_id = env.META_PIXEL_ID || '';
  return cfg;
}

// ---------------------------------------------------------------- database
const DATA_DIR = env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'leads.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY, created_at TEXT DEFAULT (datetime('now','localtime')),
  nome TEXT, telefono TEXT, email TEXT, zone TEXT, pacchetto TEXT, fascia TEXT, note TEXT,
  stato TEXT DEFAULT 'nuovo', nota_interna TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  fbclid TEXT, landing TEXT, ip TEXT, ua TEXT, event_id TEXT);
CREATE TABLE IF NOT EXISTS clicks (id INTEGER PRIMARY KEY, created_at TEXT DEFAULT (datetime('now','localtime')), tipo TEXT, utm_campaign TEXT);
CREATE TABLE IF NOT EXISTS visits (day TEXT PRIMARY KEY, n INTEGER DEFAULT 0);`);

// ---------------------------------------------------------------- utils
const send = (res, status, data, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(data)); };
const sha = (v) => (v ? crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex') : undefined);
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function normPhone(p) {
  let n = String(p || '').replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) n = '+39' + n;
  return n;
}
function readBody(req, limit = 50 * 1024) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('json')); } });
  });
}

// Rate limit semplice: max 5 invii ogni 10 minuti per IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600e3);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 5;
}

// ---------------------------------------------------------------- notifiche
async function notifyLead(lead, cfg) {
  const text = `🔔 NUOVO CONTATTO LASER\n\n👤 ${lead.nome}\n📞 ${lead.telefono}${lead.email ? '\n✉️ ' + lead.email : ''}\n📍 Zone: ${lead.zone || '-'}\n📦 Interesse: ${lead.pacchetto || '-'}\n🕐 Preferisce: ${lead.fascia || '-'}${lead.note ? '\n📝 ' + lead.note : ''}\n\nCampagna: ${lead.utm_campaign || lead.utm_source || 'diretto'}\nScrivile: https://wa.me/${normPhone(lead.telefono).replace('+', '')}`;
  const jobs = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    for (const chat of env.TELEGRAM_CHAT_ID.split(',')) {
      jobs.push(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat.trim(), text }) }));
    }
  }
  if (env.NOTIFY_EMAIL && (env.RESEND_API_KEY || env.BREVO_API_KEY)) {
    const html = `<pre style="font:15px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${text.replace(/</g, '&lt;')}</pre>`;
    const subject = `Nuovo contatto laser: ${lead.nome}`;
    if (env.RESEND_API_KEY) jobs.push(fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.EMAIL_FROM || 'onboarding@resend.dev', to: env.NOTIFY_EMAIL.split(','), subject, html }) }));
    else jobs.push(fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { email: env.EMAIL_FROM, name: cfg.nome_centro }, to: env.NOTIFY_EMAIL.split(',').map((e) => ({ email: e.trim() })), subject, htmlContent: html }) }));
  }
  if (env.LEAD_WEBHOOK_URL) jobs.push(fetch(env.LEAD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...lead, source: 'landing-laser' }) }));
  const res = await Promise.allSettled(jobs);
  res.filter((r) => r.status === 'rejected').forEach((r) => console.error('Notifica fallita:', r.reason?.message));
}

// Meta Conversions API (lato server, deduplicata con il Pixel tramite event_id)
async function metaCapi(eventName, { eventId, req, lead, url }) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;
  const c = cookies(req);
  const [fn, ...ln] = String(lead?.nome || '').trim().split(/\s+/);
  const user_data = {
    client_ip_address: clientIp(req), client_user_agent: req.headers['user-agent'],
    fbp: c._fbp, fbc: c._fbc || (lead?.fbclid ? `fb.1.${Date.now()}.${lead.fbclid}` : undefined),
    ph: lead?.telefono ? [sha(normPhone(lead.telefono).replace('+', ''))] : undefined,
    em: lead?.email ? [sha(lead.email)] : undefined,
    fn: fn ? [sha(fn)] : undefined, ln: ln.length ? [sha(ln.join(' '))] : undefined,
    ct: [sha('barletta')], country: [sha('it')],
  };
  const body = { data: [{ event_name: eventName, event_time: Math.floor(Date.now() / 1000), event_id: eventId, action_source: 'website', event_source_url: url, user_data, custom_data: lead ? { content_name: 'Epilazione laser 3D', content_category: lead.pacchetto || 'consulenza' } : undefined }] };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) console.error('Meta CAPI:', await r.text());
  } catch (e) { console.error('Meta CAPI:', e.message); }
}

// ---------------------------------------------------------------- admin auth
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || 'angolo2026';
const adminToken = () => crypto.createHmac('sha256', ADMIN_PASSWORD).update('angolo-admin').digest('hex');
const isAdmin = (req) => cookies(req).adm === adminToken();

// ---------------------------------------------------------------- pagine
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

function renderPage(file, req) {
  const cfg = loadConfig();
  let html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  const pub = { ...cfg };
  const base = env.BASE_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  html = html.replace('/*__CFG__*/', `window.CFG=${JSON.stringify(pub).replace(/</g, '\\u003c')};`)
    .replace(/\{\{BASE_URL\}\}/g, base)
    .replace(/\{\{([a-z_]+)\}\}/g, (m, k) => (cfg[k] !== undefined && typeof cfg[k] !== 'object' ? String(cfg[k]).replace(/</g, '&lt;') : m));
  return html;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    // ---- API
    if (p === '/api/lead' && req.method === 'POST') {
      const ip = clientIp(req);
      const b = await readBody(req);
      if (b.website) return send(res, 200, { ok: true }); // honeypot anti-spam
      if (limited(ip)) return send(res, 429, { error: 'Troppi invii, riprova tra qualche minuto o scrivici su WhatsApp.' });
      const nome = String(b.nome || '').trim().slice(0, 80);
      const telefono = String(b.telefono || '').trim().slice(0, 30);
      if (nome.length < 2) return send(res, 400, { error: 'Inserisci il tuo nome' });
      if (String(telefono).replace(/\D/g, '').length < 8) return send(res, 400, { error: 'Inserisci un numero di cellulare valido' });
      if (!b.privacy) return send(res, 400, { error: "Per essere ricontattata devi accettare l'informativa privacy" });
      const lead = {
        nome, telefono, email: String(b.email || '').trim().slice(0, 120) || null,
        zone: Array.isArray(b.zone) ? b.zone.join(', ').slice(0, 200) : String(b.zone || '').slice(0, 200),
        pacchetto: String(b.pacchetto || '').slice(0, 80), fascia: String(b.fascia || '').slice(0, 40), note: String(b.note || '').slice(0, 500),
        utm_source: b.utm_source || null, utm_medium: b.utm_medium || null, utm_campaign: b.utm_campaign || null, utm_content: b.utm_content || null, utm_term: b.utm_term || null,
        fbclid: b.fbclid || null, landing: String(b.landing || '').slice(0, 300), ip, ua: String(req.headers['user-agent'] || '').slice(0, 300),
        event_id: String(b.event_id || crypto.randomUUID()).slice(0, 64),
      };
      const keys = Object.keys(lead);
      const r = db.prepare(`INSERT INTO leads (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => lead[k] ?? null));
      const cfg = loadConfig();
      notifyLead(lead, cfg).catch(() => {});
      metaCapi('Lead', { eventId: lead.event_id, req, lead, url: lead.landing });
      return send(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
    }
    if (p === '/api/click' && req.method === 'POST') {
      const b = await readBody(req).catch(() => ({}));
      db.prepare('INSERT INTO clicks (tipo, utm_campaign) VALUES (?,?)').run(String(b.tipo || '').slice(0, 20), b.utm_campaign || null);
      if (b.event_id) metaCapi('Contact', { eventId: b.event_id, req, url: b.landing });
      return send(res, 200, { ok: true });
    }
    // ---- Admin
    if (p === '/api/admin/login' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.password !== ADMIN_PASSWORD) return send(res, 401, { error: 'Password errata' });
      return send(res, 200, { ok: true }, { 'Set-Cookie': `adm=${adminToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 86400}` });
    }
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Non autorizzato' });
      if (p === '/api/admin/leads' && req.method === 'GET') {
        const leads = db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 2000').all().map((r) => ({ ...r }));
        const stats = {
          visite_oggi: db.prepare('SELECT n FROM visits WHERE day=?').get(new Date().toISOString().slice(0, 10))?.n || 0,
          visite_30: db.prepare("SELECT COALESCE(SUM(n),0) s FROM visits WHERE day>=date('now','-30 day')").get().s,
          wa_30: db.prepare("SELECT COUNT(*) n FROM clicks WHERE tipo='whatsapp' AND created_at>=datetime('now','-30 day')").get().n,
          tel_30: db.prepare("SELECT COUNT(*) n FROM clicks WHERE tipo='telefono' AND created_at>=datetime('now','-30 day')").get().n,
        };
        return send(res, 200, { leads, stats });
      }
      const m = p.match(/^\/api\/admin\/leads\/(\d+)$/);
      if (m && req.method === 'PUT') {
        const b = await readBody(req);
        if (b.stato) db.prepare('UPDATE leads SET stato=? WHERE id=?').run(String(b.stato), m[1]);
        if (b.nota_interna !== undefined) db.prepare('UPDATE leads SET nota_interna=? WHERE id=?').run(String(b.nota_interna), m[1]);
        return send(res, 200, { ok: true });
      }
      if (m && req.method === 'DELETE') { db.prepare('DELETE FROM leads WHERE id=?').run(m[1]); return send(res, 200, { ok: true }); }
      if (p === '/api/admin/leads.csv') {
        const rows = db.prepare('SELECT created_at,nome,telefono,email,zone,pacchetto,fascia,note,stato,nota_interna,utm_source,utm_campaign,utm_content FROM leads ORDER BY id DESC').all();
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csv = ['data;nome;telefono;email;zone;pacchetto;fascia;note;stato;nota;fonte;campagna;inserzione', ...rows.map((r) => Object.values(r).map(esc).join(';'))].join('\n');
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="contatti-laser.csv"' });
        return res.end('﻿' + csv);
      }
      return send(res, 404, { error: 'Non trovato' });
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Non trovato' });

    // ---- Pagine HTML (con config iniettata)
    const pages = { '/': 'index.html', '/grazie': 'grazie.html', '/privacy': 'privacy.html', '/admin': 'admin.html' };
    if (pages[p]) {
      if (p === '/') db.prepare('INSERT INTO visits(day,n) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET n=n+1').run(new Date().toISOString().slice(0, 10));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return res.end(renderPage(pages[p], req));
    }
    // ---- File statici
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile() && !file.endsWith('.html')) {
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.webp' || ext === '.jpg' ? 'public, max-age=604800' : 'public, max-age=3600' });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(302, { Location: '/' + url.search }); res.end();
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Errore, riprova o scrivici su WhatsApp' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Landing laser attiva su http://localhost:${PORT}  ·  contatti: /admin`));
