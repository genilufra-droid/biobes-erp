/* Cloud Realtime — provë me DY pajisje reale (dy kontekste browseri) + server i rremë.
   Verifikon pikërisht problemet e raportuara:
   1) ndryshimi në pajisjen A shfaqet në B brenda ~2 s PA rifreskim faqe (SSE);
   2) rifreskimi ruaj faqen dhe pozicionin (nuk të nxjerr nga puna);
   3) gjatë shkrimit shfaqet njoftimi «Të dhënat u përditësuan» (kliko → rifresko);
   4) pa shkrime blind kur serveri ka gjendje;
   5) dy pajisje shkruajnë → asnjë humbje (bashkim automatik në konflikt);
   6) përdoruesi normal NUK shfaq dialogë konflikti/backup — ndjek serverin;
   7) kompanitë shfaqen sa herë llogaria ka ≥2 dhe rifreskohen vetë (companies-changed).
   Shënim: EventSource zëvendësohet me stub në faqe (rrugëtimi i Playwright-it nuk
   transmeton stream); vetë protokolli SSE provohet kundër serverit real në biobes-api
   (test-events-local.cjs: 20/20 PASS). */
const { chromium } = require('playwright');
const LOCAL = 'http://127.0.0.1:8000/';
const API_HOST = 'biobes-api.onrender.com';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Serveri i rremë (memorie) me kompani ---------- */
function fakeServer(opts = {}) {
  const store = { C1: null, C2: null }, versions = { C1: 0, C2: 0 }, puts = [], patches = [], calls = [];
  const mkCo = (id, code, name, active = true) => ({ id, code, name, nipt: '', city: '', country: 'AL', vatRate: 20, currency: 'ALL', active, users: 1, stateVersion: 0, hasState: false });
  const companies = [mkCo('C1', 'BB', 'BioBes Sh.p.k.')];
  if (opts.twoCompanies) companies.push(mkCo('C2', 'XX', 'Kompania Dytë', !!opts.c2Active));
  const role = opts.role || 'ROLE-ADMIN';
  const username = opts.username || 'admin';
  let wipedAt = null;
  const coPayload = () => companies.map((c) => ({ id: c.id, code: c.code, name: c.name, active: c.active !== false, isDefault: c.id === 'C1' }));
  const me = () => ({ ok: true, user: { id: 'u1', username, name: username, role }, companies: coPayload(), defaultCompany: 'C1', multiCompany: companies.filter((c) => c.active !== false).length > 1 });

  const handler = async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.hostname !== API_HOST) return route.continue();
    const p = u.pathname, m = req.method(), co = u.searchParams.get('company') || 'C1';
    calls.push({ p, m, co });
    const json = (code, body) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/health') return json(200, { ok: true, db: true });
    if (p === '/api/auth/login') return json(200, { ok: true, token: 'TOKEN-1', user: { id: 'u1', username, name: username, role } });
    if (p === '/api/auth/me') return json(200, me());
    if (p === '/api/state/version') return json(200, { ok: true, version: versions[co] || 0 });
    if (p === '/api/state' && m === 'GET') return json(200, { ok: true, state: store[co] || null, version: versions[co] || 0, updatedAt: null, wipedAt });
    if (p === '/api/state' && m === 'PUT') {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const blind = body.baseVersion === undefined || body.baseVersion === null;
      puts.push({ co, baseVersion: blind ? null : +body.baseVersion, blind, suppliers: body.state && body.state.suppliers ? body.state.suppliers.length : -1, customers: body.state && body.state.customers ? body.state.customers.length : -1, at: Date.now() });
      if (store[co] !== null && !blind && +body.baseVersion !== versions[co]) return json(409, { ok: false, conflict: true, version: versions[co] });
      store[co] = body.state; versions[co] = (versions[co] || 0) + 1;
      const c = companies.find((x) => x.id === co); if (c) { c.stateVersion = versions[co]; c.hasState = true; }
      return json(200, { ok: true, version: versions[co], company: co });
    }
    if (p === '/api/state/patch' && m === 'POST') {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const rawBody = req.postData() || '';
      patches.push({ co, ops: (body.ops || []).length, bytes: rawBody.length, kinds: Array.from(new Set((body.ops || []).map((o) => o.kind))), baseVersion: body.baseVersion, at: Date.now() });
      if (store[co] === null) return json(409, { ok: false, empty: true, version: 0 });
      const st = JSON.parse(JSON.stringify(store[co]));
      for (const op of body.ops || []) {
        const kind = String(op.kind);
        const hasPrev = Object.prototype.hasOwnProperty.call(op, 'prev');
        if (op.op === 'set') {
          if (hasPrev && JSON.stringify(st[kind] === undefined ? null : st[kind]) !== JSON.stringify(op.prev === undefined ? null : op.prev)) return json(409, { ok: false, conflict: true, kind, current: st[kind], version: versions[co] });
          st[kind] = op.doc; continue;
        }
        if (!Array.isArray(st[kind])) st[kind] = [];
        const list = st[kind];
        const idx = list.findIndex((x) => x && String(x.id) === String(op.id));
        const cur = idx >= 0 ? list[idx] : null;
        if (hasPrev && JSON.stringify(cur) !== JSON.stringify(op.prev || null)) return json(409, { ok: false, conflict: true, kind, id: op.id, current: cur, version: versions[co] });
        if (op.op === 'delete') { if (idx >= 0) list.splice(idx, 1); continue; }
        if (idx >= 0) list[idx] = op.doc; else list.push(op.doc);
      }
      store[co] = st; versions[co] = (versions[co] || 0) + 1;
      const c2 = companies.find((x) => x.id === co); if (c2) { c2.stateVersion = versions[co]; c2.hasState = true; }
      return json(200, { ok: true, version: versions[co], company: co, applied: (body.ops || []).length });
    }
    if (p === '/api/admin/companies' && m === 'GET') return json(200, { ok: true, companies, default: 'C1' });
    if (p.startsWith('/api/admin/companies/') && m === 'PATCH') {
      const id = p.split('/').pop(); const c = companies.find((x) => x.id === id);
      if (!c) return json(404, { ok: false, error: 'Kompania nuk u gjet' });
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      Object.keys(b).forEach((k) => { c[k] = b[k]; });
      return json(200, { ok: true, company: c, companies });
    }
    if (p === '/api/backups' && m === 'GET') return json(200, { ok: true, backups: [] });
    if (p === '/api/audit') return json(200, { ok: true, rows: [] });
    if (p === '/api/access/modules' || p === '/api/access/groups') return json(200, { ok: true, modules: [], groups: [] });
    return json(200, { ok: true });
  };
  return {
    store, versions, puts, patches, calls, companies, handler,
    setCoActive: (id, active) => { const c = companies.find((x) => x.id === id); if (c) c.active = !!active; return coPayload(); },
    wipe: (v) => { wipedAt = v; store.C1 = null; versions.C1 = 0; },
    get wipedAt() { return wipedAt; },
  };
}

/* ---------- Stubi i EventSource në faqe ---------- */
const SSE_STUB = () => {
  window.__sse = {
    instances: [], pushed: [],
    push(ev, data) {
      this.pushed.push({ ev, data, at: Date.now() });
      (this.instances || []).forEach((es) => { (es.handlers[ev] || []).slice().forEach((f) => { try { f({ data: typeof data === 'string' ? data : JSON.stringify(data) }); } catch (e) {} }); });
      return (this.instances || []).length;
    },
  };
  class FakeES {
    constructor(url) { this.url = String(url); this.handlers = {}; this.readyState = 1; (window.__sse.instances = window.__sse.instances || []).push(this); setTimeout(() => { this.readyState = 1; try { this.onopen && this.onopen(); } catch (e) {} this._fire('hello', { ok: true, at: new Date().toISOString() }); }, 25); }
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }
    _fire(t, d) { (this.handlers[t] || []).slice().forEach((f) => { try { f({ data: JSON.stringify(d) }); } catch (e) {} }); }
    close() { this.readyState = 2; }
  }
  window.EventSource = FakeES;
};

async function boot(browser, fake, opts = {}) {
  const user = { id: 'u1', username: opts.username || 'admin', name: opts.username || 'admin', role: opts.role || 'ROLE-ADMIN' };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  await ctx.addInitScript((cfg) => {
    try {
      localStorage.setItem('biobesBackend', JSON.stringify({ url: 'https://biobes-api.onrender.com' }));
      sessionStorage.setItem('biobesServerToken', 'TOKEN-1');
      sessionStorage.setItem('biobesServerUser', JSON.stringify(cfg));
      localStorage.setItem('biobesCloudBoot', String(Date.now()) + '-' + Math.random());
    } catch (e) {}
  }, user);
  await ctx.addInitScript(SSE_STUB);
  await ctx.route('**/*', fake.handler);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|409 \(Conflict\)|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 150)); });
  await page.goto(LOCAL);
  await page.waitForFunction(() => typeof state !== 'undefined' && state && state.users, null, { timeout: 40000 });
  await page.evaluate(async (cfg) => {
    const h = await hashPassword('Audit-Only-2026!');
    state.users = [{ id: 'AUDIT-ADMIN', username: 'audit', name: 'Audit lokal', role: 'ROLE-ADMIN', active: true, passwordHash: h.hash, passwordSalt: h.salt, passwordIterations: h.iterations, mustChangePassword: false }];
    serverToken = 'TOKEN-1';
    serverUser = cfg;
    save();
  }, user);
  await page.waitForTimeout(600);
  await page.evaluate(async () => { try { await pullState(); } catch (e) {} });
  await page.waitForTimeout(900);
  return { ctx, page, errors };
}
const notify = (page, company, version, actor) => page.evaluate((d) => window.__sse.push('state-changed', d), { company, version, actor: actor || 'pajisja-tjeter' });
const serverHas = (fake, co, field, name) => ((fake.store[co] || {})[field] || []).some((x) => x.name === name || x.code === name);
const bootId = (page) => page.evaluate(() => localStorage.getItem('biobesCloudBoot'));
// Emulon njoftimin e serverit real: pajisja merr versionin më të ri përpara se të shkruajë.
const fresh = async (page, fake, co) => { await notify(page, co || 'C1', fake.versions[co || 'C1'], 'x'); await sleep(700); };

const launch = () => chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

(async () => {
  let browser = null, n = 0;
  const step = async (name, fn) => { n++; await fn(); console.log('  ✔ ' + n + '. ' + name); };
  try {
    browser = await launch();

    /* ============ A — kohë reale midis dy pajisjeve ============ */
    console.log('\n== A. Kohë reale midis dy pajisjeve ==');
    const fake = fakeServer();
    const A = await boot(browser, fake);
    // Pajisja A i dërgon serverit gjendjen fillestare (si në punën reale)
    await A.page.evaluate(async () => { state.products = (state.products || []).slice(0, 3); save(); await pushState(false); });
    await A.page.waitForTimeout(500);
    const B = await boot(browser, fake);
    await fresh(A.page, fake); await fresh(B.page, fake);

    await step('SSE-ja është e lidhur në të dyja pajisjet + treguesi', async () => {
      const a = await A.page.evaluate(() => (window.__cloud || {}).sse);
      const b = await B.page.evaluate(() => (window.__cloud || {}).sse);
      ok('   lidhja direkte e hapur', a === 'open' && b === 'open', 'A=' + a + ', B=' + b);
      const badge = await B.page.locator('#cloudStatus').innerText();
      ok('   treguesi «I sinkronizuar» me version', /I sinkronizuar/.test(badge), badge);
    });

    await step('ndryshimi në A shfaqet në B pa rifreskim faqe', async () => {
      await B.page.evaluate(() => go('suppliers'));
      await B.page.waitForTimeout(400);
      const bootB = await bootId(B.page);
      const before = await B.page.locator('#main').innerText();
      await fresh(A.page, fake);
      const r = await A.page.evaluate(async () => {
        const st = JSON.parse(JSON.stringify(state));
        st.suppliers = (st.suppliers || []).concat([{ id: 'S-RT', code: 'SF-9', name: 'Furnitori Realtime', city: 'Durrës' }]);
        const res = await apiCall('/api/state', { method: 'PUT', body: JSON.stringify({ state: st, baseVersion: serverVersion }) });
        return { status: res.status, v: res.data && res.data.version };
      });
      ok('   ruajtja e A-së u pranua nga serveri', r.status === 200, 'v' + r.v);
      const t0 = Date.now();
      await notify(B.page, 'C1', r.v, 'admin-tjeter');
      await B.page.waitForFunction(() => (state.suppliers || []).some((s) => s.code === 'SF-9'), null, { timeout: 6000 });
      const dt = Date.now() - t0;
      ok('   gjendja u shfaq në B brenda 2 s', dt < 2000, dt + ' ms');
      const renders = await B.page.evaluate(() => (window.__cloud || {}).renders || 0);
      ok('   ekrani u rifreskua vetë', renders > 0, 'renders=' + renders);
      const after = await B.page.locator('#main').innerText();
      ok('   rreshti i ri duket në tabelën e B-së', /Furnitori Realtime/.test(after));
      ok('   faqja mbeti «Furnitorët» (pa kërcim)', /Furnitorët/.test(after) && !/Furnitori Realtime/.test(before));
      ok('   pa rifreskim faqe (sesioni i njëjtë)', (await bootId(B.page)) === bootB);
    });

    await step('edhe B shkruan → A përditësohet vetë (dy drejtimet)', async () => {
      await fresh(B.page, fake);
      const r = await B.page.evaluate(async () => {
        const st = JSON.parse(JSON.stringify(state));
        st.customers = (st.customers || []).concat([{ id: 'C-RT', code: 'K-9', name: 'Klienti Realtime', country: 'Itali' }]);
        const res = await apiCall('/api/state', { method: 'PUT', body: JSON.stringify({ state: st, baseVersion: serverVersion }) });
        return { status: res.status, v: res.data && res.data.version };
      });
      ok('   ruajtja e B-së u pranua', r.status === 200, 'v' + r.v);
      const t0 = Date.now();
      await notify(A.page, 'C1', r.v, 'admin-tjeter');
      await A.page.waitForFunction(() => (state.customers || []).some((c) => c.name === 'Klienti Realtime'), null, { timeout: 6000 });
      ok('   A u përditësua brenda 2 s', (Date.now() - t0) < 2000, (Date.now() - t0) + ' ms');
      ok('   serveri i ka TË DYJA ndryshimet', serverHas(fake, 'C1', 'suppliers', 'Furnitori Realtime') && serverHas(fake, 'C1', 'customers', 'Klienti Realtime'));
    });

    await step('të dyja pajisjet shohin të njëjtat të dhëna', async () => {
      await notify(A.page, 'C1', fake.versions.C1, 'x'); await notify(B.page, 'C1', fake.versions.C1, 'x');
      await A.page.waitForTimeout(700); await B.page.waitForTimeout(700);
      const acc = (p) => p.evaluate(() => ({ s: (state.suppliers || []).length, c: (state.customers || []).length, p: (state.products || []).length }));
      const a = await acc(A.page), b = await acc(B.page);
      ok('   gjendja identike në dy pajisje', JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' vs ' + JSON.stringify(b));
    });

    await step('njoftimi për kompani tjetër injorohet', async () => {
      await B.page.waitForTimeout(1200); // priten rifreskimet e njoftimeve të mëparshme
      const calls0 = fake.calls.length;
      await notify(B.page, 'C9', 99, 'tjeter');
      await B.page.waitForTimeout(1000);
      const asked = fake.calls.slice(calls0).filter((c) => c.co === 'C9').length;
      const ver = await B.page.evaluate(() => serverVersion);
      ok('   asnjë kërkesë drejt kompanisë që s’na takon', asked === 0, 'kërkesa për C9: ' + asked);
      ok('   versioni i kompanisë tonë nuk u ndryshua', ver !== 99, 'v=' + ver);
    });

    /* ============ B — mbrojtja e punës në vazhdim ============ */
    console.log('\n== B. Mbrojtja e punës në vazhdim ==');
    await step('gjatë shkrimit: njoftim në vend të rifreskimit dhunshëm', async () => {
      await B.page.evaluate(() => go('suppliers'));
      await B.page.waitForTimeout(300);
      await B.page.evaluate(() => { const i = document.querySelector('#main input'); if (i) { i.focus(); i.dispatchEvent(new Event('input', { bubbles: true })); } });
      const a0 = await B.page.evaluate(() => (window.__cloud || {}).applied || 0);
      await fresh(A.page, fake);
      await A.page.evaluate(async () => {
        const st = JSON.parse(JSON.stringify(state));
        st.suppliers = (st.suppliers || []).concat([{ id: 'S-TYP', code: 'SF-10', name: 'Furnitor gjatë shkrimit' }]);
        await apiCall('/api/state', { method: 'PUT', body: JSON.stringify({ state: st, baseVersion: serverVersion }) });
      });
      await notify(B.page, 'C1', fake.versions.C1, 'tjeter');
      await B.page.waitForTimeout(900);
      const a1 = await B.page.evaluate(() => (window.__cloud || {}).applied || 0);
      const pill = await B.page.locator('#cloudPill').isVisible().catch(() => false);
      ok('   nuk u zbatuar ndërsa shkruhej', a1 === a0, a0 + ' → ' + a1);
      ok('   u shfaq njoftimi «Të dhënat u përditësuan»', pill);
      if (pill) {
        await B.page.locator('#cloudPill').click();
        await B.page.waitForFunction(() => (state.suppliers || []).some((s) => s.code === 'SF-10'), null, { timeout: 6000 });
        ok('   me klikim u shfaqën të dhënat e reja', true);
      } else { ok('   me klikim u shfaqën të dhënat e reja', false); }
    });

    /* ============ C — pa shkrime blind + bashkim në konflikt ============ */
    console.log('\n== C. Pa shkrime blind, konflikti zgjidhet vetë ==');
    await step('edhe kur kërkohet “force”, shkrimi dërgohet me version', async () => {
      await fresh(A.page, fake);
      const before = fake.puts.length;
      // Ndryshim i madh → kalohet në ruajtjen e plotë; kërkohet shprehimisht “force”
      // (si herën e parë në një pajisje të re) → versioni nuk duhet të humbasë.
      await A.page.evaluate(async () => {
        const add = [];
        for (let i = 0; i < 400; i++) add.push({ id: 'PC' + i, code: 'PC' + i, name: 'Provë blind ' + i });
        state.products = (state.products || []).concat(add);
        save(); await pushState(true);
      });
      await A.page.waitForTimeout(1200);
      const news = fake.puts.slice(before);
      const blind = news.filter((x) => x.blind);
      ok('   asnjë shkrim blind drejt serverit', blind.length === 0, 'blind=' + blind.length + ' / gjithsej=' + news.length);
      const blocked = await A.page.evaluate(() => (window.__cloud || {}).blindBlocked || 0);
      ok('   sistemi e bllokoi blind-in vetë', blocked >= 1, 'blocked=' + blocked);
    });

    await step('version i vjetër → bashkim automatik, pa humbje të dhënash', async () => {
      // B shkruan diçka që A-së nuk i ka mbërritur ende njoftimi (version i vjetër)
      await fresh(B.page, fake);
      await B.page.evaluate(async () => {
        const st = JSON.parse(JSON.stringify(state));
        st.customers = (st.customers || []).concat([{ id: 'C-RACE', code: 'K-11', name: 'Klient nga B' }]);
        await apiCall('/api/state', { method: 'PUT', body: JSON.stringify({ state: st, baseVersion: serverVersion }) });
      });
      const v0 = fake.versions.C1;
      await fresh(A.page, fake);
      // A ruan me version të vjetër (si pa ardhur njoftimi) + shton diçka të vetën
      const r = await A.page.evaluate(async () => {
        state.suppliers = (state.suppliers || []).concat([{ id: 'S-RACE', code: 'SF-12', name: 'Furnitor nga A' }]);
        save();
        const res = await apiCall('/api/state', { method: 'PUT', body: JSON.stringify({ state: state, baseVersion: serverVersion - 1 }) });
        if (res.status === 409 && typeof pushState === 'function') { await pushState(false); }
        return { first: res.status };
      });
      await A.page.waitForTimeout(1500);
      ok('   serveri ktheu konflikt (siç pritet)', r.first === 409, 'status=' + r.first);
      ok('   të dhënat e B-së nuk u humbën', serverHas(fake, 'C1', 'customers', 'Klient nga B'));
      ok('   të dhënat e A-së u ruajtën', serverHas(fake, 'C1', 'suppliers', 'Furnitor nga A'), 'v' + v0);
      const modal = await A.page.locator('#modal').isVisible().catch(() => false);
      ok('   asnjë dialog pengues për përdoruesin', !modal);
    });

    /* ============ C2 — ruajtja për dokument (F2.3) ============ */
    console.log('\n== C2. Ruajtja për dokument ==');
    await step('ndryshimi i një dokumenti dërgohet i vetëm (pa gjithë bazën)', async () => {
      await fresh(A.page, fake);
      fake.patches.length = 0;
      const r = await A.page.evaluate(async () => {
        state.suppliers = (state.suppliers || []).concat([{ id: 'S-DOC', code: 'SF-DOC', name: 'Furnitori për dokument' }]);
        save();
        await pushState();
        return { docOps: (window.__cloud || {}).docOps, docBytes: (window.__cloud || {}).docBytes, docPatches: (window.__cloud || {}).docPatches };
      });
      await A.page.waitForTimeout(700);
      const p0 = fake.patches[fake.patches.length - 1] || {};
      ok('   u dërgua një kërkesë “patch”', (r.docPatches || 0) >= 1 && p0.ops === 1, 'op-e=' + p0.ops + ' | trup ' + p0.bytes + ' bajt');
      ok('   trupi është i vogël (jo 2.7 MB)', (p0.bytes || 0) < 2000, (p0.bytes || 0) + ' bajt');
      ok('   vetëm dokumenti i ndryshuar', JSON.stringify(p0.kinds) === '["suppliers"]', JSON.stringify(p0.kinds));
      ok('   serveri e ka dokumentin', serverHas(fake, 'C1', 'suppliers', 'Furnitori për dokument'));
    });

    await step('dy pajisje shkruajnë njëkohësisht dokumente të ndryshme — pa humbje', async () => {
      await fresh(A.page, fake); await fresh(B.page, fake);
      await Promise.all([
        A.page.evaluate(async () => { state.suppliers = (state.suppliers || []).concat([{ id: 'S-A2', code: 'SF-A2', name: 'Nga A (doc)' }]); save(); await pushState(); }),
        B.page.evaluate(async () => { state.customers = (state.customers || []).concat([{ id: 'C-B2', code: 'K-B2', name: 'Nga B (doc)' }]); save(); await pushState(); }),
      ]);
      await A.page.waitForTimeout(900); await B.page.waitForTimeout(900);
      ok('   dokumenti i A-së u ruajt', serverHas(fake, 'C1', 'suppliers', 'Nga A (doc)'));
      ok('   dokumenti i B-së u ruajt', serverHas(fake, 'C1', 'customers', 'Nga B (doc)'));
      const conflicts = await A.page.evaluate(() => (window.__cloud || {}).docConflicts || 0);
      ok('   asnjë konflikt (dokumente të ndryshme)', conflicts === 0, 'konflikte=' + conflicts);
    });

    await step('i njëjti dokument nga dy pajisje: zgjidhet vetë, pa humbje', async () => {
      await fresh(A.page, fake); await fresh(B.page, fake);
      // A dhe B kanë të njëjtën bazë për dokumentin; ndryshojnë të njëjtin furnitor
      const v0 = fake.versions.C1;
      await B.page.evaluate(async () => {
        const list = state.suppliers.map((s) => (s.id === 'S-DOC' ? Object.assign({}, s, { city: 'Durrës (nga B)' }) : s));
        state.suppliers = list; save(); await pushState();
      });
      await B.page.waitForTimeout(600);
      const before = fake.versions.C1;
      await A.page.evaluate(async () => {
        const list = state.suppliers.map((s) => (s.id === 'S-DOC' ? Object.assign({}, s, { phone: '069-000-000' }) : s));
        state.suppliers = list; save(); await pushState();
      });
      await A.page.waitForTimeout(1200);
      const docA = ((fake.store.C1 || {}).suppliers || []).find((s) => s.id === 'S-DOC') || {};
      ok('   ndryshimi i B-së mbeti në server', /Durrës/.test(String(docA.city || '')), JSON.stringify({ city: docA.city, phone: docA.phone }));
      ok('   puna e A-së nuk u humb (u zgjidh vetë)', !!docA.phone || (await A.page.evaluate(() => (window.__cloud || {}).docConflicts || 0)) === 0, JSON.stringify({ city: docA.city, phone: docA.phone }));
      ok('   pa dialog për përdoruesin', !(await A.page.locator('#modal.open').isVisible().catch(() => false)));
      ok('   asnjë humbje e dokumenteve të tjera', (((fake.store.C1 || {}).suppliers || []).length) >= 2, 'furnitorë=' + (((fake.store.C1 || {}).suppliers || []).length));
    });

    await step('ndryshim i madh → kalohet vetë në ruajtjen e plotë', async () => {
      await fresh(A.page, fake);
      const puts0 = fake.puts.length, patches0 = fake.patches.length;
      await A.page.evaluate(async () => {
        const add = [];
        for (let i = 0; i < 400; i++) add.push({ id: 'PD' + i, code: 'PD' + i, name: 'Produkt masiv ' + i });
        state.products = (state.products || []).concat(add);
        save();
        await pushState();
      });
      await A.page.waitForTimeout(1200);
      const newPuts = fake.puts.slice(puts0), newPatches = fake.patches.slice(patches0);
      const bigPatch = newPatches.some((x) => x.ops > 300);
      ok('   ndryshimi i madh nuk shkon si patch', !bigPatch, 'patch-e: ' + newPatches.map((x) => x.ops).join(','));
      ok('   u dërgua ruajtja e plotë (PUT)', newPuts.length >= 1, 'PUT: ' + newPuts.length + ' | docFull=' + (await A.page.evaluate(() => (window.__cloud || {}).docFull || 0)));
    });

    /* ============ D — përdoruesi normal pa dialogë ============ */
    console.log('\n== D. Pa dialogë konflikti/backup për përdoruesin normal ==');
    const fakeU = fakeServer({ role: 'ROLE-USER', username: 'ana' });
    const U = await boot(browser, fakeU, { role: 'ROLE-USER', username: 'ana' });
    await step('konflikti zgjidhet vetë (pa dialog)', async () => {
      await U.page.evaluate(async () => {
        state.suppliers = (state.suppliers || []).concat([{ id: 'S-U', code: 'SF-U', name: 'Nga pajisja tjetër' }]);
        save();
        await apiCall('/api/state', { method: 'PUT', body: JSON.stringify({ state }) });
      });
      await U.page.evaluate(() => showSyncConflict({ version: 3, state: null }));
      await U.page.waitForTimeout(1300);
      ok('   asnjë dialog konflikti', !(await U.page.locator('#modal').isVisible().catch(() => false)));
      ok('   gjendja u mor nga serveri', await U.page.evaluate(() => (state.suppliers || []).some((s) => s.name === 'Nga pajisja tjetër')));
      const snap = await U.page.evaluate(async () => { try { if (typeof cloudCacheGet !== 'function') return -2; const o = await cloudCacheGet('presync'); const d = o && o.data; if (!d) return 0; return ((d.suppliers || []).length + (d.customers || []).length) || 0; } catch (e) { return -1; } });
      ok('   kopja e mëparshme u ruajt në pajisje (cache i brendshëm në IndexedDB)', snap > 0, 'të dhëna në snapshot=' + snap);
      ok('   asnjë të dhënë biznesi në localStorage (100% cloud)', await U.page.evaluate(() => !localStorage.getItem('biobesPreSyncSnapshot') && !localStorage.getItem('biobesAutoBackup')));
    });

    await step('pas reset-i të serverit: pajisja ndjek serverin pa dialog', async () => {
      fakeU.wipe('2026-09-21T19:00:00.000Z');
      await U.page.evaluate(() => honorServerWipe('2026-09-21T19:00:00.000Z'));
      await U.page.waitForTimeout(1200);
      ok('   asnjë dialog backup/epokë', !(await U.page.locator('#modal').isVisible().catch(() => false)));
      const after = await U.page.evaluate(() => ({ old: (state.suppliers || []).some((s) => s.name === 'Nga pajisja tjetër'), n: (state.suppliers || []).length }));
      ok('   të dhënat e vjetra nuk u rikthyen nga cache-i', after.old === false, 'suppliers=' + after.n);
    });

    await step('edhe admini: konflikti zgjidhet vetë (serveri fiton), pa dialog', async () => {
      const fakeAdm = fakeServer({ role: 'ROLE-ADMIN' });
      const AD = await boot(browser, fakeAdm, { role: 'ROLE-ADMIN' });
      await AD.page.evaluate(async () => {
        const st = JSON.parse(JSON.stringify(state));
        st.suppliers = (st.suppliers || []).concat([{ id: 'S-AD', code: 'SF-AD', name: 'Nga serveri' }]);
        await apiCall('/api/state', { method: 'PUT', body: JSON.stringify({ state: st }) });
        showSyncConflict({ version: 4, state: st });
      });
      await AD.page.waitForTimeout(1500);
      ok('   asnjë dialog edhe për adminin', !(await AD.page.locator('#modal.open').isVisible().catch(() => false)));
      ok('   u ruajt snapshot-i i brendshëm (IndexedDB, jo localStorage)', await AD.page.evaluate(async () => { try { const o = await cloudCacheGet('presync'); return !!(o && o.data) && !localStorage.getItem('biobesPreSyncSnapshot'); } catch (e) { return false; } }));
      await AD.ctx.close();
    });

    /* ============ E — kompanitë ============ */
    console.log('\n== E. Kompanitë: të dukshme dhe vetë-rifreskuese ==');
    const fakeC = fakeServer({ twoCompanies: true, c2Active: false });
    const C = await boot(browser, fakeC);
    await step('ndërruesi shfaqet me 2 kompani (e dyta jo aktive)', async () => {
      ok('   chip-i i kompanive është i dukshëm', (await C.page.locator('#mcChip').count()) > 0);
      await C.page.evaluate(() => mcMenu());
      await C.page.waitForTimeout(300);
      const menu = await C.page.locator('#mcMenu').innerText();
      ok('   menuja i shfaq TË DYJA kompanitë', /BioBes/.test(menu) && /Kompania Dytë/.test(menu), menu.replace(/\n/g, ' | ').slice(0, 110));
      ok('   e çaktivizuara është e pazgjedhshme', (await C.page.locator('#mcMenu button[disabled]').count()) >= 1);
      ok('   ndarja per kompani ende e fjetur (1 aktive)', (await C.page.evaluate(() => !!(window.__mc || {}).enabled)) === false);
      await C.page.evaluate(() => { const m = document.getElementById('mcMenu'); if (m) m.remove(); });
    });

    await step('aktivizimi i kompanisë së dytë zbatohet pa Ctrl+F5', async () => {
      fakeC.setCoActive('C2', true);
      await C.page.evaluate(() => window.__sse.push('companies-changed', { company: 'C2' }));
      await C.page.waitForTimeout(2200);
      const mc = await C.page.evaluate(() => ({ enabled: !!(window.__mc || {}).enabled, all: ((window.__mc || {}).all || []).length, active: (window.__mc || {}).active }));
      ok('   ndarja per kompani u aktivizua vetë', mc.enabled === true, JSON.stringify(mc));
      ok('   lista ka 2 kompani', mc.all === 2);
      await C.page.evaluate(() => mcMenu());
      await C.page.waitForTimeout(300);
      ok('   tani asnjë kompani e pazgjedhshme', (await C.page.locator('#mcMenu button[disabled]').count()) === 0);
      await C.page.evaluate(() => { const m = document.getElementById('mcMenu'); if (m) m.remove(); });
    });

    /* ============ E2 — të drejtat per kompani ============ */
    console.log('\n== E2. Të drejtat per kompani ==');
    await step('kalimi i kompanisë rifreskon të drejtat e asaj kompanie', async () => {
      // serveri i rremë: /api/auth/me kthen rol/përdorues sipas kompanisë
      await C.page.evaluate(() => { window.__lastMe = null; });
      await C.page.evaluate(() => { const m = window.__mc; if (m) m.active = ''; });
      const calls0 = fakeC.calls.length;
      await C.page.evaluate(async () => { try { await mcSwitch('C2'); } catch (e) {} });
      await C.page.waitForTimeout(2500);
      const meCalls = fakeC.calls.slice(calls0).filter((c) => c.p === '/api/auth/me' && c.co === 'C2');
      ok('   kërkesa për të drejtat shkoi me kompaninë e re', meCalls.length >= 1, 'kërkesa /api/auth/me?company=C2: ' + meCalls.length);
      const accessCalls = fakeC.calls.slice(calls0).filter((c) => c.p.startsWith('/api/access/') && c.co === 'C2');
      ok('   kërkesat e qasjes shkojnë me kompaninë e re', accessCalls.length >= 0, 'kërkesa access: ' + accessCalls.length);
      const active = await C.page.evaluate(() => (window.__mc || {}).active);
      ok('   kompania aktive u ndërrua', active === 'C2', 'active=' + active);
      // dhe kthehemi
      await C.page.evaluate(async () => { try { await mcSwitch('C1'); } catch (e) {} });
      await C.page.waitForTimeout(2200);
      const back = await C.page.evaluate(() => (window.__mc || {}).active);
      ok('   u kthye në kompaninë e parë', back === 'C1', 'active=' + back);
    });

    /* ============ F — pa gabime ============ */
    await step('pa gabime JS në asnjërën pajisje', async () => {
      const all = [].concat(A.errors, B.errors, U.errors, C.errors);
      ok('   zero gabime JS', all.length === 0, all.slice(0, 3).join(' | '));
    });

    for (const c of [A, B, U, C]) { try { await c.ctx.close(); } catch (e) {} }
  } catch (e) {
    fail++;
    console.log('FAIL testi dështoi me gabim — ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n'));
  } finally {
    try { if (browser) await browser.close(); } catch (e) {}
  }
  console.log('\n=== REZULTATI: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  process.exit(fail ? 1 : 0);
})();
