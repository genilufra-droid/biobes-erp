/* Numrat e dokumenteve në kohë reale (F2.7) — front + server i rremë.
   Rrethanë reale: dy pajisje krijojnë dokument të të njëjtit lloj njëkohësisht.
   Të dyja llogarisin «numrin e radhës» nga lista VENDORE, ndaj nxjerrin të njëjtin
   numër. Serveri e refuzon të dytin (409 conflict:'number'); pajisja e rinumeron
   automatikisht dhe rifton — pa humbje, pa dialogë, pa numra të dyfishuar. */
const { chromium } = require('playwright');
const LOCAL = 'http://127.0.0.1:8000/';
const API_HOST = 'biobes-api.onrender.com';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SSE_STUB = () => {
  window.__sse = { events: [], push(ev, data) { this.events.push({ ev, data }); const h = window.__sse.handlers[ev] || []; h.forEach((f) => { try { f({ data: JSON.stringify(data) }); } catch (e) {} }); }, handlers: {} };
  class ES { constructor() { this.readyState = 1; } addEventListener(ev, fn) { (window.__sse.handlers[ev] = window.__sse.handlers[ev] || []).push(fn); } close() {} }
  window.EventSource = ES;
};

function fakeServer() {
  const store = { C1: null }, versions = { C1: 0 };
  const patches = [];
  let takenNumber = 'FH-2026-0007';   // numri që «pajisja tjetër» e zuri në server
  const state0 = () => ({
    products: [{ id: 'P1', code: '101', name: 'Sherëbelë' }],
    suppliers: [{ id: 'S1', code: 'SF1', name: 'Furnitori 1' }],
    customers: [{ id: 'K1', code: 'KL1', name: 'Klienti 1' }],
    lots: [], expenses: [],
    stockDocs: [{ id: 'D6', kind: 'IN', number: 'FH-2026-0006', date: '2026-09-21' }],
  });
  const handler = async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.hostname !== API_HOST) return route.continue();
    const p = u.pathname, m = req.method();
    const json = (code, body) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/health') return json(200, { ok: true, db: true });
    if (p === '/api/auth/login') return json(200, { ok: true, token: 'TOKEN-1', user: { id: 'u1', username: 'admin', name: 'admin', role: 'ROLE-ADMIN' } });
    if (p === '/api/auth/me') return json(200, { ok: true, user: { id: 'u1', username: 'admin', name: 'admin', role: 'ROLE-ADMIN' }, companies: [{ id: 'C1', code: 'BB', name: 'BioBes Sh.p.k.', active: true, isDefault: true }], defaultCompany: 'C1', multiCompany: false });
    if (p === '/api/state/version') return json(200, { ok: true, version: versions.C1 });
    if (p === '/api/state' && m === 'GET') return json(200, { ok: true, state: store.C1, version: versions.C1, updatedAt: null, wipedAt: null });
    if (p === '/api/state' && m === 'PUT') { let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {} store.C1 = b.state; versions.C1++; return json(200, { ok: true, version: versions.C1 }); }
    if (p === '/api/state/patch' && m === 'POST') {
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const ops = b.ops || [];
      const numbers = ops.filter((o) => o.op === 'upsert' && o.doc).map((o) => o.doc.number).filter(Boolean);
      patches.push({ numbers, ops: ops.length, at: Date.now() });
      const clash = ops.find((o) => o.op === 'upsert' && o.doc && String(o.doc.number) === takenNumber);
      if (clash) return json(409, { ok: false, conflict: 'number', kind: 'stockDocs', field: 'number', id: String(clash.id), number: takenNumber, version: versions.C1, error: 'Numri është i zënë' });
      const st = JSON.parse(JSON.stringify(store.C1 || {}));
      for (const o of ops) {
        if (!Array.isArray(st[o.kind])) st[o.kind] = [];
        const list = st[o.kind];
        const i = list.findIndex((x) => x && String(x.id) === String(o.id));
        if (o.op === 'delete') { if (i >= 0) list.splice(i, 1); }
        else { if (i >= 0) list[i] = o.doc; else list.push(o.doc); }
      }
      store.C1 = st; versions.C1++;
      return json(200, { ok: true, version: versions.C1, applied: ops.length });
    }
    if (p === '/api/events') return json(200, { ok: true });
    return json(200, { ok: true, companies: [], users: [] });
  };
  return { store, versions, patches, handler, state0, get takenNumber() { return takenNumber; }, set takenNumber(v) { takenNumber = v; } };
}

async function boot(browser, fake) {
  const user = { id: 'u1', username: 'admin', name: 'admin', role: 'ROLE-ADMIN' };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('biobesBackend', JSON.stringify({ url: 'https://biobes-api.onrender.com' }));
      sessionStorage.setItem('biobesServerToken', 'TOKEN-1');
      localStorage.setItem('biobesCloudBoot', String(Date.now()) + '-' + Math.random());
    } catch (e) {}
  });
  await ctx.addInitScript(SSE_STUB);
  await ctx.route('**/*', fake.handler);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/409 \(Conflict\)|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 150)); });
  await page.goto(LOCAL);
  await page.waitForFunction(() => typeof state !== 'undefined' && state && state.users, null, { timeout: 40000 });
  const toasts = [];
  await page.evaluate((cfg) => {
    window.__toasts = [];
    var t = window.toast;
    window.toast = function (msg) { try { window.__toasts.push(String(msg)); } catch (e) {} return t.apply(this, arguments); };
  }, user);
  await page.evaluate(async (cfg) => {
    const h = await hashPassword('Audit-Only-2026!');
    state.users = [{ id: 'AUDIT-ADMIN', username: 'audit', name: 'Audit lokal', role: 'ROLE-ADMIN', active: true, passwordHash: h.hash, passwordSalt: h.salt, passwordIterations: h.iterations, mustChangePassword: false }];
    serverToken = 'TOKEN-1'; serverUser = cfg; save();
  }, user);
  await page.waitForTimeout(500);
  await page.evaluate(async () => { try { await pullState(); } catch (e) {} });
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}

(async () => {
  let browser = null;
  try {
    const fake = fakeServer();
    fake.store.C1 = fake.state0();          // gjendja e serverit: deri FH-2026-0006
    fake.versions.C1 = 1;
    browser = await chromium.launch({ executablePath: process.env.BIOBES_BROWSER_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const A = await boot(browser, fake);

    // Ruajtja e parë: krijohet baza e sinkronizimit (patch pa konflikt)
    await A.page.evaluate(async () => { save(); await pushState(false); });
    await A.page.waitForTimeout(400);
    ok('1. pajisja u lidh dhe baza e sinkronizimit u krijua', fake.versions.C1 >= 2, 'version ' + fake.versions.C1);

    // Pajisja jonë nxjerr numrin e radhës nga lista VENDORE (1 dokument → FH-2026-0002)
    const num = await A.page.evaluate(() => window.__biobesStockDocs.nextNumber('IN', '2026-09-21'));
    ok('2. numri vendor i radhës është llogaritur (simulim i garës)', num === 'FH-2026-0002', num);

    // «Pajisja tjetër» e ruan të NJËJTIN numër në server një çast më parë
    fake.takenNumber = num;
    fake.store.C1.stockDocs.push({ id: 'B7', kind: 'IN', number: num, date: '2026-09-21' });
    fake.versions.C1++;
    const patches0 = fake.patches.length;

    const res = await A.page.evaluate(async (n) => {
      state.stockDocs.push({ id: 'NEW1', kind: 'IN', number: n, date: '2026-09-21', lines: [] });
      save();
      const r = await pushState(false);
      return { ok: !!(r && (r.ok || r.skipped)), doc: (state.stockDocs.find((d) => d.id === 'NEW1') || {}).number, docNumbers: (window.__cloud || {}).docNumbers || 0, toasts: window.__toasts.slice() };
    }, num);
    await A.page.waitForTimeout(400);

    const attempts = fake.patches.slice(patches0);
    ok('3. serveri refuzoi numrin e zënë (409)', attempts.some((p) => p.numbers.includes('FH-2026-0002')), JSON.stringify(attempts.map((p) => p.numbers)));
    ok('4. pajisja riftoi me numër të ri (2 tentativa)', attempts.length >= 2, attempts.length + ' tentativa');
    ok('5. numri u rinumerua automatikisht në FH-2026-0003', res.doc === 'FH-2026-0003', String(res.doc));
    ok('6. numëratori i rinumerimeve u shënua', res.docNumbers === 1, 'docNumbers=' + res.docNumbers);
    ok('7. përdoruesi u njoftua në ekran', res.toasts.some((t) => /i zënë/.test(t)), JSON.stringify(res.toasts.slice(0, 2)));
    const stored = (fake.store.C1.stockDocs || []).map((d) => d.number).sort();
    ok('8. serveri ka të dyja dokumentet, pa dyfishim', JSON.stringify(stored) === JSON.stringify(['FH-2026-0002', 'FH-2026-0003', 'FH-2026-0006']), JSON.stringify(stored));
    ok('9. asnjë gabim JS', A.errors.length === 0, A.errors.slice(0, 2).join(' | '));

    // Pa konflikt: ruajtja shkon me një tentativë, pa rinumerim të panevojshëm
    const before = fake.patches.length;
    const n2 = await A.page.evaluate(async () => {
      const n = window.__biobesStockDocs.nextNumber('IN', '2026-09-21');
      state.stockDocs.push({ id: 'NEW2', kind: 'IN', number: n, date: '2026-09-21', lines: [] });
      save();
      await pushState(false);
      return { n, docNumbers: (window.__cloud || {}).docNumbers || 0, saved: (state.stockDocs.find((d) => d.id === 'NEW2') || {}).number };
    });
    await A.page.waitForTimeout(300);
    ok('10. pa konflikt: një tentativë e vetme, numri i pandryshuar', (fake.patches.length - before) === 1 && n2.saved === n2.n && n2.docNumbers === 1, JSON.stringify(n2) + ' tentativa=' + (fake.patches.length - before));

    console.log('\n=== REZULTATI: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  } catch (e) {
    console.log('GABIM: ' + e.message);
    fail++;
  } finally { if (browser) await browser.close().catch(() => {}); }
  process.exit(fail ? 1 : 0);
})();
