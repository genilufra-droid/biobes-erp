const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

// Read index.html
const html = fs.readFileSync('/home/user/biobes-erp/index.html', 'utf8');

console.log('Testing BioBes ERP Print & Excel Consistency...');

// 1. Verify buttons in views.purchases
assert.ok(html.includes("🖨 Faturë DPT"), 'views.purchases must contain 🖨 Faturë DPT');
assert.ok(html.includes("🚚 FSH"), 'views.purchases must contain 🚚 FSH');
assert.ok(html.includes("📊 Excel"), 'views.purchases must contain 📊 Excel');

// 2. Verify buttons in views.sales
assert.ok(html.includes("exportDptSaleInvoiceXlsx"), 'views.sales must call exportDptSaleInvoiceXlsx');

// 3. Verify buttons in views.fiscalization
assert.ok(html.includes("quickPrintInvoice"), 'views.fiscalization must have quickPrintInvoice');

// 4. Verify purchaseCard has print/export buttons
assert.ok(html.includes("🖨 Faturë DPT (Printo/PDF)"), 'purchaseCard must have DPT print button');

// 5. Verify saleInvoiceCard has DPT buttons
assert.ok(html.includes("🖨 Faturë Tatimore DPT"), 'saleInvoiceCard must have DPT print button');

// 6. Verify printOnly universal engine
assert.ok(html.includes("BioBes ERP Universal Print Engine"), 'index.html must contain universal print engine');
assert.ok(html.includes("canvasToImages"), 'canvasToImages must be present');
assert.ok(html.includes("biobesPrintRoot"), 'biobesPrintRoot must be present');

// 7. Verify Excel generators
assert.ok(html.includes("window.exportUnifiedDptInvoiceXlsx"), 'exportUnifiedDptInvoiceXlsx must exist');
assert.ok(html.includes("window.exportDptSaleInvoiceXlsx"), 'exportDptSaleInvoiceXlsx must exist');
assert.ok(html.includes("window.exportPurchaseDocumentXlsx"), 'exportPurchaseDocumentXlsx must exist');
assert.ok(html.includes("window.exportGoodsTransportNoteXlsx"), 'exportGoodsTransportNoteXlsx must exist');

// 8. Verify userCan grants print permission
assert.ok(html.includes("if(action==='print')return true;"), 'userCan must unconditionally allow print');

// 9. Runtime verification of printUnifiedInvoice, printPurchase, printWtn and renderUnifiedQr
const fiscalMatch = html.match(/<script id="biobes-fiscalization-suite">([\s\S]*?)<\/script\s*>/i);
assert.ok(fiscalMatch, 'biobes-fiscalization-suite script tag must exist');

let printOnlyCalledWith = null;
const mockWindow = {
  location: { pathname: '/index.html', search: '', hash: '' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  document: {
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, querySelectorAll: () => [], querySelector: () => null, style: {}, classList: { add: () => {}, remove: () => {} } }),
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
    documentElement: { style: { setProperty: () => {} } },
    getElementById: (id) => ({ id, innerHTML: '', style: {}, title: '', querySelector: () => null, querySelectorAll: () => [], appendChild: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => []
  },
  console: console,
  setTimeout: (fn) => fn(),
  clearTimeout: () => {},
  setInterval: () => {},
  clearInterval: () => {},
  state: {
    fiscalConfig: {},
    purchaseInvoices: [
      { id: 'FB-2026-0010', supplier: 'sup1', product: 'prod1', billable: 100, price: 50, vat: 20, isFiscal: true }
    ],
    salesInvoices: [
      { id: 'FAT-2026-0001', customer: 'cust1', lines: [{ product: 'prod1', net: 100, price: 50, discount: 0 }], vat: 20, isFiscal: true }
    ],
    suppliers: [{ id: 'sup1', name: 'Furnitor Test', nipt: 'K12345678A' }],
    customers: [{ id: 'cust1', name: 'Klient Test', nipt: 'J12345678A' }],
    products: [{ id: 'prod1', name: 'Rigoni Test', unit: 'kg' }],
    shipments: [{ id: 'NIS-001', customer: 'cust1', product: 'prod1', qty: 100, isFiscalWtn: true }]
  },
  salesInvoices: () => mockWindow.state.salesInvoices,
  purchaseInvoices: () => mockWindow.state.purchaseInvoices,
  by: (tbl, id) => (mockWindow.state[tbl] || []).find(x => x.id === id) || null,
  head: () => '',
  tableCard: () => '',
  esc: s => s || '',
  fmt2: v => Number(v || 0).toFixed(2),
  n: (v, d) => Number(v || 0).toFixed(d || 0),
  modal: () => {},
  closeModal: () => {},
  toast: () => {},
  save: () => {},
  printOnly: (id, title) => { printOnlyCalledWith = { id, title }; },
  QRCode: function(el, opts) { this.el = el; this.opts = opts; },
  views: {}
};
mockWindow.QRCode.CorrectLevel = { M: 0 };
mockWindow.window = mockWindow;
mockWindow.self = mockWindow;
mockWindow.global = mockWindow;

const ctx = vm.createContext(mockWindow);
vm.runInContext(fiscalMatch[1], ctx);

// Test renderUnifiedQr existence
assert.strictEqual(typeof ctx.window.renderUnifiedQr, 'function', 'window.renderUnifiedQr must be a function');
ctx.window.renderUnifiedQr(mockWindow.state.purchaseInvoices[0], 'testQrBox');

// Test printPurchase
ctx.window.printPurchase('FB-2026-0010');

// Test printUnifiedInvoice for purchase
printOnlyCalledWith = null;
ctx.window.printUnifiedInvoice('FB-2026-0010');
assert.ok(printOnlyCalledWith, 'printUnifiedInvoice must call printOnly');
assert.strictEqual(printOnlyCalledWith.id, 'printUnifiedDpt_FB-2026-0010', 'printUnifiedInvoice must print correct element');

// Test printUnifiedInvoice for sales
printOnlyCalledWith = null;
ctx.window.printUnifiedInvoice('FAT-2026-0001');
assert.ok(printOnlyCalledWith, 'printUnifiedInvoice must call printOnly for sales invoice');
assert.strictEqual(printOnlyCalledWith.id, 'printUnifiedDpt_FAT-2026-0001', 'printUnifiedInvoice must print correct sale element');

// Test printWtn
printOnlyCalledWith = null;
ctx.window.printWtn('FB-2026-0010');
assert.ok(printOnlyCalledWith, 'printWtn must call printOnly');
assert.strictEqual(printOnlyCalledWith.id, 'printWtn_FB-2026-0010', 'printWtn must print correct WTN element');

console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY! ✓');
