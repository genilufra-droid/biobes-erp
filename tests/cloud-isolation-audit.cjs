/* Cloud Isolation — prova e KËRKESAVE FIKSE të sistemit 100% cloud multi-company:
   1) company_id në ÇDO kërkesë (header X-Company-Id + ?company=) dhe në lidhjen
      realtime SSE; lidhja rihapet me kompaninë e re sapo ndërron kompania;
   2) izolim 100% C1 ≠ C2: eventet, shenja e punës së paruajtur (dirty), baza e
      bashkimit dhe op-et e patch-it nuk kalojnë kurrë nga një kompani në tjetrën;
   3) browseri është vetëm CACHE: asnjë të dhënë biznesi në localStorage;
   4) serveri është burimi i së vërtetës: me pastrim të plotë të browserit
      (IndexedDB + localStorage) asgjë nuk humbet — gjithçka rikthehet nga serveri;
   5) shkrime konkurrente të së njëjtës pajisje renditen (mutex) dhe nuk humbin.
   Nuk preken formatet/modelet/UI — provohet vetëm sjellja cloud.
   Asnjë kërkesë nuk shkon te API-ja e prodhimit: gjithçka interceptohet këtu. */
const { chromium } = require('playwright');
const LOCAL = 'http://127.0.0.1:8000/';
const API_HOST = 'biobes-api.onrender.com';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + '   ' + n + (extra ? ' — ' + extra : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Stubi SSE: regjistron URL-të (për të provuar company=) ---------- */
const SSE_STUB = () => {
  window.__sse = {
    instances: [], pushed: [],
    push(ev, data) {
      this.pushed.push({ ev, data, at: Date.now() });
      (this.instances || []).forEach((es) => {
        if (es.closed) return;
        (es.handlers[ev] || []).slice().forEach((f) => { try { f({ data: typeof data === 'string' ? data : JSON.stringify(data) }); } catch (e) {} });
      });
      return (this.instances || []).filter((x) => !x.closed).length;
    },
    lastUrl() { const l = (this.instances || []).filter((x) => !x.closed); return l.length ? l[l.length - 1].url : ''; },
  };
  class FakeES {
    constructor(url) {
      this.url = String(url); this.handlers = {}; this.readyState = 1; this.closed = false;
      (window.__sse.instances = window.__sse.instances || []).push(this);
      setTimeout(() => { try { this.onopen && this.onopen(); } catch (e) {} this._fire('hello', { ok: true }); }, 25);
    }
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }
    _fire(t, d) { (this.handlers[t] || []).slice().forEach((f) => { try { f({ data: JSON.stringify(d) }); } catch (e) {} }); }
    close() { this.readyState = 2; this.closed = true; }
  }
  window.EventSource = FakeES;
};

/* ---------- Server i rremë multi-company që regjistron headerët ---------- */
function fakeServer() {
  const store = { C1: null, C2: null }, versions = { C1: 0, C2: 0 };
  const calls = [], patches = [];
  let failFor = '';                       // kompania që simulon dështim shkrimi (offline)
  const user = { id: 'u1', username: 'admin', name: 'Admin', role: 'ROLE-ADMIN' };
  const companies = [
    { id: 'C1', code: 'BB', name: 'BioBes Sh.p.k.', active: true, isDefault: true },
    { id: 'C2', code: 'XX', name: 'Kompania Dytë', active: true },
  ];
  const handler = async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.hostname !== API_HOST) return route.continue();
    const p = u.pathname, m = req.method();
    let hdr = ''; try { hdr = String(req.headers()['x-company-id'] || ''); } catch (e) {}
    const qco = u.searchParams.get('company') || '';
    const co = qco || hdr || 'C1';
    calls.push({ p, m, qco, hdr, co, at: Date.now() });
    const json = (code, body) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/health') return json(200, { ok: true, db: true, companies: 2 });
    if (p === '/api/auth/login') return json(200, { ok: true, token: 'TOKEN-1', user });
    if (p === '/api/auth/me') return json(200, { ok: true, user, companies, defaultCompany: 'C1', multiCompany: true });
    if (p === '/api/state/version') return json(200, { ok: true, version: versions[co] || 0, company: co });
    if (p === '/api/state' && m === 'GET') return json(200, { ok: true, state: store[co] || null, version: versions[co] || 0, updatedAt: null, wipedAt: null, company: co });
    if (p === '/api/state' && m === 'PUT') {
      if (failFor && co === failFor) return json(500, { ok: false, error: 'simulim: shkrimi dështoi' });
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      store[co] = b.state; versions[co] = (versions[co] || 0) + 1;
      return json(200, { ok: true, version: versions[co], company: co });
    }
    if (p === '/api/state/patch' && m === 'POST') {
      if (failFor && co === failFor) return json(500, { ok: false, error: 'simulim: shkrimi dështoi' });
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const ops = b.ops || [];
      if (store[co] === null) return json(409, { ok: false, empty: true, version: 0 });
      const st = JSON.parse(JSON.stringify(store[co]));
      for (const o of ops) {
        const kind = String(o.kind);
        if (o.op === 'set') { st[kind] = o.doc; continue; }
        if (!Array.isArray(st[kind])) st[kind] = [];
        const list = st[kind], i = list.findIndex((x) => x && String(x.id) === String(o.id));
        if (o.op === 'delete') { if (i >= 0) list.splice(i, 1); continue; }
        if (i >= 0) list[i] = o.doc; else list.push(o.doc);
      }
      store[co] = st; versions[co] = (versions[co] || 0) + 1;
      patches.push({ co, ops: ops.map((o) => ({ kind: o.kind, op: o.op, id: o.id })), at: Date.now() });
      return json(200, { ok: true, version: versions[co], company: co, applied: ops.length });
    }
    if (p === '/api/backups') return json(200, { ok: true, backups: [], id: 1 });
    if (p === '/api/events') return json(200, { ok: true });
    if (p.startsWith('/api/access/')) return json(200, { ok: true, modules: [], groups: [] });
    return json(200, { ok: true, companies: [], users: [], company: co });
  };
  return {
    store, versions, calls, patches, handler, user,
    set failFor(v) { failFor = v || ''; }, get failFor() { return failFor; },
    seed(co, st) { store[co] = st; versions[co] = (versions[co] || 0) + 1; },
  };
}

async function boot(browser, fake) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem('biobesBackend', JSON.stringify({ url: 'https://biobes-api.onrender.com' }));
      sessionStorage.setItem('biobesServerToken', 'TOKEN-1');
      sessionStorage.setItem('biobesServerUser', JSON.stringify(u));
      localStorage.setItem('biobesCloudBoot', String(Date.now()) + '-' + Math.random());
    } catch (e) {}
  }, fake.user);
  await ctx.addInitScript(SSE_STUB);
  await ctx.route('**/*', fake.handler);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|409|500|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 150)); });
  await page.goto(LOCAL);
  await page.waitForFunction(() => typeof state !== 'undefined' && state && state.users, null, { timeout: 40000 });
  await page.evaluate(async (u) => {
    const h = await hashPassword('Audit-Only-2026!');
    state.users = [{ id: 'AUDIT-ADMIN', username: 'audit', name: 'Audit lokal', role: 'ROLE-ADMIN', active: true, passwordHash: h.hash, passwordSalt: h.salt, passwordIterations: h.iterations, mustChangePassword: false }];
    serverToken = 'TOKEN-1'; serverUser = u; save();
  }, fake.user);
  await page.waitForTimeout(500);
  await page.evaluate(async () => { try { await pullState(); } catch (e) {} });
  await page.waitForTimeout(600);
  await page.evaluate(async () => { try { await mcBootstrap(true); } catch (e) {} });
  await page.waitForTimeout(1400);
  return { ctx, page, errors };
}

const launch = () => chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const stateCalls = (fake, from) => fake.calls.slice(from).filter((c) => c.p.indexOf('/api/state') === 0);

(async () => {
  let browser = null;
  try {
    browser = await launch();
    const fake = fakeServer();
    /* Gjendja fillestare e serverit: C1 me një faturë + furnitor, C2 me një klient */
    fake.seed('C1', { products: [{ id: 'P1', code: '101', name: 'Sherëbelë' }], suppliers: [{ id: 'S-C1', code: 'SF1', name: 'Furnitori i C1' }], customers: [{ id: 'K-C1', code: 'KL1', name: 'Klienti i C1' }], salesInvoices: [{ id: 'I-C1', invoiceNumber: 'FSH-C1-1', date: '2026-09-21', total: 100 }], stockDocs: [], weighings: [], lots: [] });
    fake.seed('C2', { products: [{ id: 'P2', code: '202', name: 'Boronicë' }], suppliers: [], customers: [{ id: 'K-C2', code: 'KL2', name: 'Klienti i C2' }], salesInvoices: [{ id: 'I-C2', invoiceNumber: 'FSH-C2-1', date: '2026-09-21', total: 200 }], stockDocs: [], weighings: [], lots: [] });

    const A = await boot(browser, fake);
    const page = A.page;

    console.log('\n== A. company_id në çdo kërkesë (realtime) ==');
    const c0 = fake.calls.length;
    await page.evaluate(async () => { try { state.customers = (state.customers || []).concat([{ id: 'K-X', code: 'KLX', name: 'Klient shtesë' }]); save(); await pushState(false); } catch (e) {} });
    await page.waitForTimeout(1200);

    const scoped = stateCalls(fake, c0);
    ok('A1. çdo kërkesë /api/state* mbart ?company= të kompanisë aktive', scoped.length > 0 && scoped.every((c) => c.qco === 'C1'), scoped.map((c) => c.m + ' ' + c.p + '?company=' + (c.qco || '∅')).join(' | ').slice(0, 150));
    ok('A2. çdo kërkesë mbart edhe header-in X-Company-Id', scoped.every((c) => c.hdr === 'C1'), 'headerë: ' + JSON.stringify(Array.from(new Set(scoped.map((c) => c.hdr)))));
    ok('A3. kompania aktive raportohet nga moduli i izolimit', (await page.evaluate(() => (window.cloudIsolationReport ? window.cloudIsolationReport().company : ''))) === 'C1');

    const sseUrl1 = await page.evaluate(() => window.__sse.lastUrl());
    ok('A4. lidhja realtime SSE mbart kompaninë', /\/api\/events\?/.test(sseUrl1) && /company=C1/.test(sseUrl1), sseUrl1.replace(/token=[^&]*/, 'token=…').slice(0, 120));

    console.log('\n== B. Ndërrimi i kompanisë: SSE e re + izolim ==');
    await page.evaluate(async () => { try { await mcSwitch('C2'); } catch (e) {} });
    await page.waitForTimeout(1800);
    const sseUrl2 = await page.evaluate(() => window.__sse.lastUrl());
    ok('B1. SSE-ja rihapet me kompaninë e re', /company=C2/.test(sseUrl2), sseUrl2.replace(/token=[^&]*/, 'token=…').slice(0, 120));
    ok('B2. lidhja e kompanisë së vjetër mbyllet', await page.evaluate(() => (window.__sse.instances || []).filter((x) => !x.closed && /company=C1/.test(x.url)).length === 0));
    ok('B3. gjendja e C2 nuk përmban të dhënat e C1', await page.evaluate(() => !(state.suppliers || []).some((s) => s.id === 'S-C1') && !(state.salesInvoices || []).some((i) => i.invoiceNumber === 'FSH-C1-1')));

    /* Event i kompanisë tjetër → duhet shpërfillur */
    const cEv = fake.calls.length;
    const rendersBefore = await page.evaluate(() => (window.__cloud || {}).renders || 0);
    await page.evaluate(() => window.__sse.push('state-changed', { company: 'C1', version: 999, actor: 'dikush-tjetër' }));
    await page.waitForTimeout(1200);
    const pulledForC1 = stateCalls(fake, cEv).filter((c) => c.co === 'C1' && c.m === 'GET');
    ok('B4. event-i i C1 nuk tërheq/nuk prek gjendjen e C2', pulledForC1.length === 0, 'tërheqje për C1: ' + pulledForC1.length);

    console.log('\n== C. Punë e paruajtur: nuk humbet dhe nuk ngatërrohet ndër kompani ==');
    fake.failFor = 'C1';
    await page.evaluate(async () => { try { await mcSwitch('C1'); } catch (e) {} });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { try { state.customers = (state.customers || []).concat([{ id: 'K-C1-VON', code: 'KL-VON', name: 'Klient i shtuar offline' }]); save(); } catch (e) {} });
    await page.waitForTimeout(2000);
    ok('C1. shkrimi i dështuar e lë punën të shënuar (dirty) për C1', await page.evaluate(() => localStorage.getItem('biobesDirty:C1') === '1' && syncIsDirty() === true));

    await page.evaluate(async () => { try { await mcSwitch('C2'); } catch (e) {} });
    await page.waitForTimeout(1500);
    ok('C2. në C2 nuk trashëgohet shenja e C1 (izolim i dirty)', await page.evaluate(() => syncIsDirty() === false && localStorage.getItem('biobesDirty:C1') === '1'));
    ok('C3. në C2 nuk shfaqet klienti i C1', await page.evaluate(() => !(state.customers || []).some((c) => c.id === 'K-C1-VON')));

    fake.failFor = '';
    await page.evaluate(async () => { try { await mcSwitch('C1'); } catch (e) {} });
    await page.waitForTimeout(2500);
    const c1Has = ((fake.store.C1 || {}).customers || []).some((c) => c.id === 'K-C1-VON');
    const c2Has = ((fake.store.C2 || {}).customers || []).some((c) => c.id === 'K-C1-VON');
    ok('C4. puna e C1 mbërrin në server sapo lidhja kthehet (asgjë nuk humbet)', c1Has === true, 'C1: ' + c1Has);
    ok('C5. puna e C1 NUK rrjedh në C2', c2Has === false, 'C2: ' + c2Has);

    const leak = fake.patches.filter((p) => p.co === 'C2').some((p) => p.ops.some((o) => /C1|VON/.test(String(o.id || ''))));
    ok('C6. asnjë op patch-i i C2 nuk përmban dokumente të C1', leak === false);

    console.log('\n== D. Browseri është vetëm cache — asnjë biznes në localStorage ==');
    const lsKeys = await page.evaluate(() => { const out = []; for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); return out; });
    ok('D1. localStorage nuk mban kopje të gjendjes/backup-it', !lsKeys.includes('biobesAutoBackup') && !lsKeys.includes('biobesPreSyncSnapshot'), 'çelësat: ' + lsKeys.filter((k) => /AutoBackup|PreSync/.test(k)).join(',') + (lsKeys.filter((k) => /AutoBackup|PreSync/.test(k)).length ? '' : '(asnjë)'));
    await page.evaluate(() => { try { localStorage.setItem('biobesPreSyncSnapshot', JSON.stringify({ at: new Date().toISOString(), data: { suppliers: [{ id: 'LEG', name: 'Legat' }] } })); localStorage.setItem('biobesAutoBackup', JSON.stringify({ format: 'BIOBES-AUTO-1', data: { products: [], suppliers: [] } })); } catch (e) {} });
    await page.evaluate(async () => { try { await cloudMigrateLegacy(); } catch (e) {} });
    await page.waitForTimeout(600);
    const migrated = await page.evaluate(() => ({ pre: localStorage.getItem('biobesPreSyncSnapshot'), ab: localStorage.getItem('biobesAutoBackup'), iso: (window.__iso || {}).lsBusinessRemoved || 0 }));
    ok('D2. çelësat e vjetër të biznesit migrohen në cache dhe hiqen nga localStorage', migrated.pre === null && migrated.ab === null, 'heqje: ' + migrated.iso);

    console.log('\n== E. Serveri para cache-it: ndërrimi tërheq gjithmonë nga serveri ==');
    fake.store.C2.suppliers = [{ id: 'S-C2-RI', code: 'SF-RI', name: 'Furnitor i ri në server' }];
    fake.versions.C2 = (fake.versions.C2 || 0) + 1;
    await page.evaluate(async () => { try { await mcSwitch('C2'); } catch (e) {} });
    await page.waitForTimeout(1800);
    ok('E1. ndryshimi i serverit shfaqet menjëherë në ndërrim kompanie (pa Ctrl+F5)', await page.evaluate(() => (state.suppliers || []).some((s) => s.id === 'S-C2-RI')));

    console.log('\n== F. Pastrim i plotë i browserit → asgjë nuk humbet ==');
    await page.evaluate(async () => {
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      await new Promise((res) => { try { const r = indexedDB.deleteDatabase('BioBesERP'); r.onsuccess = res; r.onerror = res; r.onblocked = res; setTimeout(res, 1500); } catch (e) { res(); } });
    });
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && state && state.users, null, { timeout: 40000 });
    await page.evaluate(async (u) => { serverToken = 'TOKEN-1'; serverUser = u; try { await pullState(); } catch (e) {} try { await mcBootstrap(true); } catch (e) {} }, fake.user);
    await page.waitForTimeout(2500);
    const restored = await page.evaluate(() => ({ inv: (state.salesInvoices || []).map((i) => i.invoiceNumber), sup: (state.suppliers || []).map((s) => s.id), co: (window.__mc || {}).active }));
    ok('F1. pas pastrimit të browserit gjendja rikthehet plotësisht nga serveri (kompania e parazgjedhur)', restored.co === 'C1' && restored.sup.includes('S-C1') && restored.inv.includes('FSH-C1-1'), JSON.stringify(restored));
    await page.evaluate(async () => { try { await mcSwitch('C2'); } catch (e) {} });
    await page.waitForTimeout(1800);
    const restored2 = await page.evaluate(() => ({ inv: (state.salesInvoices || []).map((i) => i.invoiceNumber), sup: (state.suppliers || []).map((s) => s.id), co: (window.__mc || {}).active }));
    ok('F2. edhe kompania tjetër rikthehet e plotë nga serveri (C1 ≠ C2)', restored2.co === 'C2' && restored2.sup.includes('S-C2-RI') && restored2.inv.includes('FSH-C2-1'), JSON.stringify(restored2));

    console.log('\n== G. Shkrime konkurrente nga e njëjta pajisje (20 përdorues) ==');
    const activeCo = await page.evaluate(() => (window.cloudIsolationReport ? window.cloudIsolationReport().company : '')) || 'C2';
    await page.evaluate(async () => {
      try {
        state.suppliers = (state.suppliers || []).concat([{ id: 'S-CONC', code: 'SF-CONC', name: 'Furnitor konkurrent' }]);
        save();
        await Promise.all([pushState(false), pushState(false), pushState(false)]);
      } catch (e) {}
    });
    await page.waitForTimeout(1800);
    const conc = (((fake.store[activeCo] || {}).suppliers) || []).filter((s) => s.id === 'S-CONC').length;
    ok('G1. të tria thirrjet e njëkohshme përfundojnë dhe dokumenti nuk dyfishohet (' + activeCo + ')', conc === 1, 'kopje në server: ' + conc);
    ok('G2. shkrimet u renditën (mutex) dhe nuk u anuluan', conc === 1 && (await page.evaluate(() => typeof (window.__iso || {}).pushesCoalesced === 'number')));
    ok('G3. pa gabime JS në gjithë rrjedhën', A.errors.length === 0, A.errors.slice(0, 3).join(' | '));

    await A.ctx.close();
  } catch (e) {
    fail++;
    console.log('FAIL   e papritur: ' + (e && e.message ? e.message : e));
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
  console.log('\n=== REZULTATI: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  process.exit(fail ? 1 : 0);
})();
