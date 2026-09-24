const fs = require('fs');
const assert = require('assert');

console.log('Testing Fiscalization & Certificate Configuration UI...');

const html = fs.readFileSync('/home/user/biobes-erp/index.html', 'utf8');

// 1. Verify openFiscalSettingsModal function exists and is exposed
assert(html.includes('window.openFiscalSettingsModal'), 'openFiscalSettingsModal must be declared on window');
assert(html.includes('switchFiscalConfigTab'), 'switchFiscalConfigTab must be declared');
assert(html.includes('saveFiscalSettingsAction'), 'saveFiscalSettingsAction must be declared');
assert(html.includes('uploadFiscalCertificateAction'), 'uploadFiscalCertificateAction must be declared');
assert(html.includes('testElectronicSignatureAction'), 'testElectronicSignatureAction must be declared');
assert(html.includes('syncOfflineFiscalInvoices'), 'syncOfflineFiscalInvoices must be declared');

// 2. Verify modal tabs and fields
assert(html.includes('fcTin'), 'Input fcTin must exist');
assert(html.includes('fcBusinessUnit'), 'Input fcBusinessUnit must exist');
assert(html.includes('fcTcr'), 'Input fcTcr must exist');
assert(html.includes('fcOperator'), 'Input fcOperator must exist');
assert(html.includes('fcSoft'), 'Input fcSoft must exist');
assert(html.includes('fcEnv'), 'Select fcEnv must exist');
assert(html.includes('fcCertFileInput'), 'fcCertFileInput must exist');
assert(html.includes('fcCertPasswordInput'), 'fcCertPasswordInput must exist');

// 3. Verify views.settings integration
assert(html.includes('id="fiscalSettingsCard"'), 'fiscalSettingsCard must be present in views.settings');
assert(html.includes('⚡ Fiskalizimi Tatimor (DPT) & Certifikata AKSHI'), 'Fiscal title in settings must exist');

// 4. Verify views.fiscalization integration
assert(html.includes('openFiscalSettingsModal()'), 'views.fiscalization must have button calling openFiscalSettingsModal');
assert(html.includes("openFiscalSettingsModal('cert')"), 'Certificate button must call openFiscalSettingsModal("cert")');

// 5. Verify backend endpoint integration
assert(html.includes('/api/fiscalization/certificate'), 'Certificate upload must target /api/fiscalization/certificate');

console.log('ALL FISCAL CONFIGURATION & CERTIFICATE AUDITS PASSED! ✓');
