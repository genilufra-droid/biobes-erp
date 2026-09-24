const fs = require('fs');
const assert = require('assert');

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

console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY! ✓');
