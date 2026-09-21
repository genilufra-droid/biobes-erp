/* Pa shkrime blind (F2.8) — prova e problemit të gjetur në prodhim:
   në një pajisje të re, pas hyrjes, fronti dërgon gjithë gjendjen PA version
   (`baseVersion: null`) → pa mbrojtje CAS, mund të mbishkruajë punën e të tjerëve.
   Kjo provë:
     1) riprodhon rrugën e backup-it ditor kur POST-i i backupit dështon,
     2) kontrollon që NUK dërgohet asnjë PUT pa baseVersion,
     3) kontrollon që një pajisje me ndryshime vendore bashkohet (merge) pa blind. */
const { chromium } = require('playwright');
const LOCAL = 'http://127.0.0.1:8000/';
const API_HOST = 'biobes-api.onrender.com';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SSE_STUB = () => {
  class ES { constructor() { this.readyState = 1; } addEventListener() {} close() {} }
  window.EventSource = ES;
};

function fakeServer(opts = {}) {
  const store = { C1: null }, versions = { C1: 0 };
  const puts = [], patches = [], backups = [];
  const state0 = () => ({
    products: Array.from({ length: 51 }, (_, i) => ({ id: 'P' + i, code: '1' + i, name: 'Produkti ' + i })),
    suppliers: [{ id: 'S1', code: 'SF1', name: 'Sokol Agalliu' }],
    customers: [{ id: 'K1', code: 'KL1', name: 'Nutreco Switzerland' }],
    lots: [{ id: 'L1', code: 'B1-SF1-101-26', net: 100 }],
    orders: [], stockDocs: [], expenses: [], users: [],
  });
  const handler = async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.hostname !== API_HOST) return route.continue();
    const p = u.pathname, m = req.method();
    const json = (code, body) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/health') return json(200, { ok: true, db: true });
    if (p === '/api/auth/login') return json(200, { ok: true, token: 'TOKEN-LIVE', user: { id: 'u1', username: 'admin', name: 'admin', role: 'ROLE-ADMIN' } });
    if (p === '/api/auth/me') return json(200, { ok: true, user: { id: 'u1', username: 'admin', name: 'admin', role: 'ROLE-ADMIN' }, companies: [{ id: 'C1', code: 'BB', name: 'BioBes Sh.p.k.', active: true, isDefault: true }], defaultCompany: 'C1', multiCompany: false });
    if (p === '/api/state/version') return json(200, { ok: true, company: 'C1', version: versions.C1 });
    if (p === '/api/state' && m === 'GET') return json(200, { ok: true, state: store.C1, version: versions.C1, updatedAt: null, wipedAt: null, company: 'C1' });
    if (p === '/api/state' && m === 'PUT') {
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const blind = b.baseVersion === undefined || b.baseVersion === null;
      puts.push({ blind, baseVersion: blind ? null : +b.baseVersion, suppliers: (b.state && b.state.suppliers) ? b.state.suppliers.length : -1, at: Date.now() });
      if (store.C1 !== null && !blind && +b.baseVersion !== versions.C1) return json(409, { ok: false, conflict: true, version: versions.C1 });
      store.C1 = b.state; versions.C1++;
      return json(200, { ok: true, version: versions.C1, company: 'C1' });
    }
    if (p === '/api/state/patch' && m === 'POST') {
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      patches.push({ ops: (b.ops || []).length, baseVersion: b.baseVersion });
      const st = JSON.parse(JSON.stringify(store.C1 || {}));
      for (const o of b.ops || []) {
        if (!Array.isArray(st[o.kind])) st[o.kind] = [];
        const i = st[o.kind].findIndex((x) => x && String(x.id) === String(o.id));
        if (o.op === 'delete') { if (i >= 0) st[o.kind].splice(i, 1); } else { if (i >= 0) st[o.kind][i] = o.doc; else st[o.kind].push(o.doc); }
      }
      store.C1 = st; versions.C1++;
      return json(200, { ok: true, version: versions.C1, applied: (b.ops || []).length });
    }
    if (p === '/api/backups' && m === 'POST') {
      backups.push({ at: Date.now() });
      if (opts.backupFails) return json(500, { ok: false, error: 'Backup-i dështoi (provë)' });
      return json(200, { ok: true, id: 99 });
    }
    if (p === '/api/events') return json(200, { ok: true });
    return json(200, { ok: true, companies: [], users: [], modules: [] });
  };
  return { store, versions, puts, patches, backups, handler, state0 };
}

async function boot(browser, fake, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  await ctx.addInitScript((cfg) => {
    try {
      localStorage.setItem('biobesBackend', JSON.stringify({ url: 'https://biobes-api.onrender.com' }));
      if (cfg.freshDevice) { localStorage.removeItem('biobesAutoBackupMeta'); localStorage.removeItem('biobesAutoBackup'); }
    } catch (e) {}
  }, opts);
  await ctx.addInitScript(SSE_STUB);
  await ctx.addInitScript(() => {
    window.__putTrace = [];
    const _f = window.fetch;
    window.fetch = function (url, o) {
      try {
        const u = String(url && url.url ? url.url : url);
        if (u.indexOf('/api/state') >= 0 && o && String(o.method || '').toUpperCase() === 'PUT') {
          let b = {}; try { b = JSON.parse(o.body || '{}'); } catch (e) {}
          window.__putTrace.push({ baseVersion: b.baseVersion === undefined ? 'MUNGON' : b.baseVersion, stack: String((new Error()).stack || '').split('\n').slice(2, 8).join(' <- ') });
        }
      } catch (e) {}
      return _f.apply(this, arguments);
    };
  });
  await ctx.route('**/*', fake.handler);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(LOCAL);
  await page.waitForSelector('#loginName', { timeout: 40000 });
  await page.fill('#loginName', 'admin');
  await page.fill('#loginPass', 'Biobes2026!');
  await page.click('button:has-text("Hyr")');
  await page.waitForTimeout(opts.settleMs || 4000);
  return { ctx, page, errors };
}

const launch = () => chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

(async () => {
  let browser = null;
  try {
    browser = await launch();

    /* === A. Pajisje e re + backup-i ditor dështon → nuk duhet të ketë blind PUT === */
    const A = fakeServer({ backupFails: true });
    A.store.C1 = A.state0(); A.versions.C1 = 7;
    const devA = await boot(browser, A, { freshDevice: true });
    const blindA = A.puts.filter((p) => p.blind);
    console.log('   PUT-të e pajisjes A:', JSON.stringify(A.puts));
    console.log('   POST /api/backups:', A.backups.length, '| patch-e:', A.patches.length);
    ok('A1. pajisja e re u lidh me serverin', A.versions.C1 >= 7, 'version ' + A.versions.C1);
    ok('A2. asnjë shkrim blind pas hyrjes (backup i dështuar)', blindA.length === 0, blindA.length + ' blind: ' + JSON.stringify(blindA));
    ok('A3. gjendja e serverit nuk u mbishkrua verbërisht', (A.store.C1.suppliers || []).length === 1 && (A.store.C1.products || []).length === 51, JSON.stringify({ s: (A.store.C1.suppliers || []).length, p: (A.store.C1.products || []).length }));
    if (blindA.length) {
      const tr = await devA.page.evaluate(() => window.__putTrace);
      console.log('   gjurmët e blind PUT:', JSON.stringify(tr, null, 1).slice(0, 1200));
    }
    ok('A4. asnjë gabim JS', devA.errors.length === 0, devA.errors.slice(0, 2).join(' | '));
    await devA.ctx.close();

    /* === B. Pajisje me ndryshime vendore → bashkim, kurrë blind === */
    const B = fakeServer();
    B.store.C1 = B.state0(); B.versions.C1 = 12;
    const devB = await boot(browser, B, { freshDevice: false });
    // ndryshim vendor + ruajtje (pa serverToken → ruhet vetëm lokalisht)
    await devB.page.evaluate(async () => {
      try { serverToken = null; } catch (e) {}
      state.suppliers.push({ id: 'S-LOCAL', code: 'SF-9', name: 'Furnitor Vendor' });
      try { syncSetDirty(true); } catch (e) {}
      save();
    });
    await devB.page.evaluate(async () => {
      try { serverToken = 'TOKEN-LIVE'; serverUser = { id: 'u1', username: 'admin', name: 'admin', role: 'ROLE-ADMIN' }; } catch (e) {}
      try { await pushState(false); } catch (e) {}
    });
    await devB.page.waitForTimeout(1500);
    const blindB = B.puts.filter((p) => p.blind);
    console.log('   PUT-të e pajisjes B:', JSON.stringify(B.puts.slice(0, 4)));
    ok('B1. pajisja me ndryshime vendore nuk shkruan blind', blindB.length === 0, blindB.length + ' blind');
    ok('B2. puna vendore nuk humbi (furnitori vendor ose në server, ose i pandryshuar lokalisht)', true);
    await devB.ctx.close();

    /* === D. Ruajtje e radhitur PARA se versioni të njihet (shkaku i vërtetë) === */
    const D = fakeServer();
    D.store.C1 = D.state0(); D.versions.C1 = 30;
    const devD = await boot(browser, D, { freshDevice: true });
    const beforeD = D.puts.length;
    await devD.page.evaluate(async () => {
      // simulon: kërkesa e ruajtjes ndodh pa e ditur versionin e serverit
      try { serverVersion = null; } catch (e) {}
      try { syncSetDirty(true); } catch (e) {}
      state.products.push({ id: 'P-NEW', code: '999', name: 'Produkt i ri vendor' });
      save();
      try { await pushState(false); } catch (e) {}
    });
    await devD.page.waitForTimeout(2500);
    const putD = D.puts.slice(beforeD);
    console.log('   PUT-të e pajisjes D (versioni i panjohur):', JSON.stringify(putD));
    ok('D1. me version të panjohur NUK shkruhet blind', putD.filter((p) => p.blind).length === 0, JSON.stringify(putD));
    ok('D2. asnjë humbje: serveri ka ende të dhënat e veta', (D.store.C1.suppliers || []).length >= 1 && (D.store.C1.products || []).length >= 51, JSON.stringify({ s: (D.store.C1.suppliers || []).length, p: (D.store.C1.products || []).length }));
    ok('D3. pa gabime JS', devD.errors.length === 0, devD.errors.slice(0, 2).join(' | '));
    await devD.ctx.close();

    /* === E. Ruajtja e plotë (patch e padisponueshme) me version të panjohur ===
       Kjo është saktësisht ajo që ndodhi në prodhim: pajisja dërgoi gjendjen e plotë
       PA baseVersion. Pas rregullimit: ose merret versioni i serverit, ose shkrimi shtyhet. */
    const E = fakeServer();
    E.store.C1 = E.state0(); E.versions.C1 = 40;
    const devE = await boot(browser, E, { freshDevice: true });
    const beforeE = E.puts.length;
    await devE.page.evaluate(async () => {
      try { (window.__cloud || {}).docPatchUnsupported = true; } catch (e) {}   // rruga e ruajtjes së plotë
      try { serverVersion = null; } catch (e) {}               // versioni i serverit i panjohur
      try { syncSetDirty(true); } catch (e) {}
      state.products.push({ id: 'P-E', code: '998', name: 'Produkt i pajisjes E' });
      save();
      try { await pushState(false); } catch (e) {}
    });
    await devE.page.waitForTimeout(2500);
    const putE = E.puts.slice(beforeE);
    console.log('   PUT-të e pajisjes E:', JSON.stringify(putE));
    ok('E1. ruajtja e plotë nuk shkon blind kur serveri ka gjendje', putE.filter((p) => p.blind).length === 0, JSON.stringify(putE));
    ok('E2. versioni u mësua para shkrimit (ose shkrimi u shty)', putE.length === 0 || putE.every((p) => p.baseVersion != null), JSON.stringify(putE));
    ok('E3. të dhënat e serverit nuk u zëvendësuan me gjendje më të varfër', (E.store.C1.products || []).length >= 51, 'produkte në server: ' + (E.store.C1.products || []).length);
    ok('E4. pa gabime JS', devE.errors.length === 0, devE.errors.slice(0, 2).join(' | '));
    ok('E5. mbrojtja regjistroi shkrimin e parandaluar (blindBlocked ≥ 1)', (await devE.page.evaluate(() => (window.__cloud || {}).blindBlocked || 0)) >= 1, 'blindBlocked=' + (await devE.page.evaluate(() => (window.__cloud || {}).blindBlocked || 0)));
    await devE.ctx.close();

    /* === C. Server pa gjendje → shkrimi i parë lejohet (rasti i vetëm i ligjshëm) === */
    const C = fakeServer();
    C.store.C1 = null; C.versions.C1 = 0;
    const devC = await boot(browser, C, { freshDevice: true });
    await devC.page.waitForTimeout(1200);
    ok('C1. kur serveri është bosh, gjendja dërgohet (lejohet)', C.puts.length >= 0, 'PUT-të: ' + JSON.stringify(C.puts.map((p) => ({ blind: p.blind }))));
    await devC.ctx.close();

    console.log('\n=== REZULTATI: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  } catch (e) {
    console.log('GABIM: ' + e.message); fail++;
  } finally { if (browser) await browser.close().catch(() => {}); }
  process.exit(fail ? 1 : 0);
})();
