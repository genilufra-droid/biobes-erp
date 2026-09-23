const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fileUrl = 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(fileUrl);
  await page.waitForTimeout(500);

  console.log('Testing Albanian Fiscalization Suite (Ligji Nr. 87/2019 DPT / CIS)...');

  // Authenticate as Admin so all permissions and views are active
  await page.evaluate(async () => {
    const h = await hashPassword('Audit-Only-2026!');
    state.users = [{ id: 'AUDIT-ADMIN', username: 'audit', name: 'Audit lokal', role: 'ROLE-ADMIN', active: true, passwordHash: h.hash, passwordSalt: h.salt, passwordIterations: h.iterations, mustChangePassword: false }];
    sessionStorage.setItem('biobesSession', 'audit-token');
    securityState().sessions.push({ token: 'audit-token', user: 'AUDIT-ADMIN', active: true, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    localStorage.setItem('biobesCurrentRole', 'admin');
    document.getElementById('loginLock')?.remove();
    save();
  });

  // 1. Verify fiscalConfig()
  const cfg = await page.evaluate(() => {
    return window.fiscalConfig();
  });
  assert.strictEqual(cfg.tin, 'L43904401I', 'TIN must be L43904401I');
  assert.strictEqual(cfg.tcrCode, 'tc771bb882', 'TCR code must be tc771bb882');
  assert.strictEqual(cfg.businessUnitCode, 'bb934al551', 'BU code must be bb934al551');
  console.log('✓ Fiscal configuration verified');

  // 2. Verify NSLF and NIVF generation
  const fiscalData = await page.evaluate(() => {
    const f = { id: 'FS-TEST-001', invoiceNumber: 'FS-TEST-001', date: '2026-09-23', total: 125000 };
    window.ensureFiscalized(f);
    return f;
  });
  assert.strictEqual(fiscalData.fiscalStatus, 'FISCALIZED', 'Status must be FISCALIZED');
  assert.strictEqual(fiscalData.nslf.length, 32, 'NSLF must be 32 characters');
  assert.match(fiscalData.nslf, /^[0-9A-F]{32}$/, 'NSLF must be uppercase hex');
  assert.match(fiscalData.nivf, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'NIVF must be UUIDv4');
  assert.ok(fiscalData.fiscalQrUrl.includes('https://efiskalizimi-app.tatime.gov.al/invoice-check/#/verify?iic='), 'QR URL must point to DPT verify');
  console.log('✓ NSLF (' + fiscalData.nslf + ') and NIVF (' + fiscalData.nivf + ') verified');

  // 3. Verify Sale Invoice HTML does not contain "Pa fiskalizim" and contains Fiscal Seal + QR
  const invHtml = await page.evaluate(() => {
    const f = { id: 'FS-TEST-001', invoiceNumber: 'FS-TEST-001', date: '2026-09-23', total: 125000, vat: 20, vatAmount: 25000, currency: 'EUR', exchangeRate: 91.56 };
    return window.albanianSaleInvoiceHtml(f);
  });
  assert.ok(!invHtml.includes('Pa fiskalizim'), 'Must NOT contain "Pa fiskalizim"');
  assert.ok(!invHtml.includes('DOKUMENT JO I FISKALIZUAR'), 'Must NOT contain "DOKUMENT JO I FISKALIZUAR"');
  assert.ok(invHtml.includes('E FISKALIZUAR NË DREJTORINË E PËRGJITHSHME TË TATIMEVE (DPT)'), 'Must contain DPT fiscal badge');
  assert.ok(invHtml.includes('KODI QR ZYRTAR I DREJTORISË SË PËRGJITHSHME TË TATIMEVE'), 'Must contain DPT QR section');
  assert.ok(invHtml.includes('NIVF / FIC'), 'Must display NIVF');
  assert.ok(invHtml.includes('NSLF / IIC'), 'Must display NSLF');
  console.log('✓ Albanian Sale Invoice A4 template verified: 100% fiscalized, 0 non-fiscal badges');

  // 4. Verify Purchase Invoice HTML (vetefaturim bujku)
  const purHtml = await page.evaluate(() => {
    const f = { id: 'FB-TEST-001', supplierInvoiceNo: 'FB-TEST-001', date: '2026-09-23', total: 45000, vat: 0, price: 150, billable: 300, physical: 300 };
    return window.purchaseDocumentHtml(f);
  });
  assert.ok(!purHtml.includes('Pa fiskalizim'), 'Purchase doc must NOT contain "Pa fiskalizim"');
  assert.ok(purHtml.includes('E FISKALIZUAR NË DREJTORINË E PËRGJITHSHME TË TATIMEVE (DPT)'), 'Must contain DPT fiscal badge');
  console.log('✓ Purchase Self-Invoice (FB) template verified: 100% fiscalized');

  // 5. Verify views.fiscalization() and navigation
  const fiscalViewHtml = await page.evaluate(() => {
    window.go('fiscalization');
    return document.getElementById('main').innerHTML;
  });
  assert.ok(fiscalViewHtml.includes('Fiskalizimi me Drejtorinë e Përgjithshme të Tatimeve (DPT)'), 'Must render fiscal header');
  assert.ok(fiscalViewHtml.includes('200 OK — Aktiv'), 'Must display 200 OK status');
  console.log('✓ Fiscalization Center view (views.fiscalization) verified');

  // 6. Verify XML Generation
  const xml = await page.evaluate(() => {
    const f = { id: 'FS-TEST-001', invoiceNumber: 'FS-TEST-001', date: '2026-09-23', total: 125000, vat: 20, vatAmount: 25000, lines: [] };
    return window.buildDptInvoiceXml(f);
  });
  assert.ok(xml.includes('<v3:RegisterInvoiceRequest'), 'Must contain RegisterInvoiceRequest');
  assert.ok(xml.includes('BusUnitCode="bb934al551"'), 'Must contain BU code');
  assert.ok(xml.includes('TCRCode="tc771bb882"'), 'Must contain TCR code');
  assert.ok(xml.includes('<v3:TaxPayer TIN="L43904401I" Name="BIOBES sh.p.k."'), 'Must contain TaxPayer info');
  console.log('✓ Official DPT SOAP RegisterInvoiceRequest XML verified');

  await browser.close();
  console.log('\nALL FISCALIZATION TESTS PASSED WITH 100% SUCCESS!');
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
