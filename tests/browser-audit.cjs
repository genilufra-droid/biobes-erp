/* Real Chromium audit. All external requests are intercepted; NEVER writes to production.
   Start python3 -m http.server 8000 --bind 0.0.0.0 before running.
   Optional BIOBES_BROWSER_EXECUTABLE for a system Chromium installation. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.BIOBES_TEST_URL||'http://127.0.0.1:8000';
if(!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(base))throw Error('Audit is restricted to a local test server');
fs.mkdirSync('.audit',{recursive:true});
const results=[];
async function run(mobile){
 const browser=await chromium.launch({headless:true,executablePath:process.env.BIOBES_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
 p.setDefaultTimeout(5000);const errors=[];
 p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 p.on('dialog',d=>d.type()==='prompt'?d.accept('Arsye auditimi'):d.accept());
 // Fulfill health checks, but no network request ever leaves the isolated browser.
 await p.route('https://**/*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
 const evaluate=(fn,arg)=>p.evaluate(fn,arg);
 const close=async()=>{await evaluate(()=>closeModal());await p.waitForTimeout(180);assert.equal(await p.locator('#modalBody').innerHTML(),'');assert.equal(await p.locator('#modalFoot').innerHTML(),'');assert.equal(await evaluate(()=>modalNavStack.length),0)};
 const button=(name,root='#modal')=>p.locator(root).getByRole('button',{name,exact:true});
 async function choose(id,value){
   await p.waitForTimeout(110);
   const field=p.locator('#'+id);
   const label=await field.evaluate((el,v)=>[...el.options].find(o=>o.value===v)?.textContent,value);assert.ok(label,`${id}: option ${value}`);
   const input=field.locator('xpath=..').locator('input[type="search"]').first();
   await input.fill(label.trim());
   await p.locator(`.global-live-option[data-value="${value}"],.live-option[data-value="${value}"]`).filter({visible:true}).first().click();
   assert.equal(await field.inputValue(),value);
 }
 async function step(name,fn){let start=errors.length;try{await close();await fn();await p.waitForTimeout(220);assert.deepEqual(errors.slice(start),[]);results.push({viewport:mobile?'mobile':'desktop',name,status:'PASS'});console.log('PASS',mobile?'mobile':'desktop',name)}catch(e){results.push({viewport:mobile?'mobile':'desktop',name,status:'FAIL',error:e.stack,console:errors.slice(start)});console.error('FAIL',name,e.message);await p.screenshot({path:'.audit/'+(mobile?'mobile':'desktop')+'-failure.png',fullPage:true});throw e}}
 try{
 await p.goto(base);await p.waitForFunction(()=>typeof state!=='undefined'&&state?.users?.length);await p.waitForTimeout(900);assert.deepEqual(errors,[]);
 await evaluate(async()=>{
   const h=await hashPassword('Audit-Only-2026!');
   state.users=[{id:'AUDIT-ADMIN',username:'audit',name:'Audit lokal',role:'ROLE-ADMIN',active:true,passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false}];
   localStorage.setItem('biobesBackend',JSON.stringify({url:''}));serverBaseUrl=()=>'';save();
 });
 await p.locator('#loginName').fill('audit');await p.locator('#loginPass').fill('Audit-Only-2026!');await button('Hyr','#loginLock').click();await p.waitForFunction(()=>!document.getElementById('loginLock'));
 await step('All 23 modules via navigation; real headings and columns',async()=>{
   const modules=await evaluate(()=>modules.map(x=>x[0]));
   if(mobile){
     for(const id of ['dashboard','weighings','warehouse','orders','shipments','purchases']){
       await p.locator(`.mobile-nav button[onclick="go('${id}')"]`).click();assert.equal(await evaluate(()=>page),id);
     }
     await p.locator('.mobile-nav button[onclick="userMenu()"] ').click();assert.ok(await p.locator('#modal').isVisible());await close();
     // Remaining pages are reached through the dashboard tiles on narrow screens.
     for(const id of modules.filter(id=>id!=='settings'&&id!=='dashboard')){
       await p.locator(`.mobile-nav button[onclick="go('dashboard')"]`).click();
       await p.locator(`#main [onclick="go('${id}')"]`).first().click();assert.equal(await evaluate(()=>page),id);assert.ok((await p.locator('#main h1').innerText()).length);
     }
   }else{
     for(const id of modules){await p.locator(`#nav button[data-page="${id}"]`).click();assert.equal(await evaluate(()=>page),id);assert.ok((await p.locator('#main h1').innerText()).length)}
   }
   await evaluate(()=>go('purchases'));assert.deepEqual(await p.locator('#main th').allTextContents(),['Fature','Data','Furnitori','Produkt','Peshimi','Neto','Cmimi','Totali','Monedha','Status','Veprime']);
 });
 let weighing,invoice,lot;
 await step('Weighing form → draft → confirmation → one lot and one linked FB',async()=>{
   await evaluate(()=>go('weighings'));await button('+ Peshim i ri','#main').click();
   await choose('wWarehouse','W1');await choose('wSupplier','S1');await choose('wProduct','P105');
   await p.locator('.wr-bags').first().fill('10');await p.locator('.wr-gross').first().fill('102');await p.locator('.wr-tare').first().fill('2');
   await button('Ruaj draft').click();weighing=await evaluate(()=>state.weighings.at(-1).id);
   const row=p.locator('#main tr').filter({has:p.getByRole('button',{name:weighing,exact:true})});await row.getByRole('button',{name:'Hap',exact:true}).click();
   await p.locator('#modalFoot button').filter({hasText:'Konfirmo'}).click();
   let data=await evaluate(id=>({w:by('weighings',id),lots:state.lots.filter(l=>l.weighing===id),invoices:purchaseInvoices().filter(f=>f.weighing===id)}),weighing);
   assert.equal(data.w.status,'Konfirmuar');assert.equal(data.lots.length,1);assert.equal(data.lots[0].net,100);assert.equal(data.invoices.length,1);assert.equal(data.invoices[0].status,'Draft');
   lot=data.lots[0].id;invoice=data.invoices[0].id;
   await evaluate(id=>deletePurchase(id),invoice);assert.equal(await evaluate(id=>by('purchaseInvoices',id)?.status,invoice),'Draft');assert.equal(await evaluate(id=>by('weighings',id).status,weighing),'Konfirmuar');
   await evaluate(()=>{syncPurchaseDrafts();syncPurchaseDrafts()});assert.equal(await evaluate(id=>purchaseInvoices().filter(f=>f.weighing===id).length,weighing),1);
   await evaluate(()=>go('lots'));assert.ok((await p.locator('#main').innerText()).includes('100 kg'));
   await evaluate(()=>go('purchases'));await p.locator(`#main a[onclick="weightCard('${weighing}')"]`).click();assert.ok((await p.locator('#modalTitle').innerText()).includes(weighing));
 });
 await step('Weighing action menu, edit, duplicate, cancellation and deletion',async()=>{
   await evaluate(()=>go('weighings'));await p.locator(`#main [onclick="weightActions('${weighing}')"]`).click();
   for(const name of ['Hap','Printo','Modifiko','Dubliko','Anulo','Fshi'])assert.ok((await p.locator('#modal').innerText()).includes(name));
   await p.locator('#modal .app').filter({has:p.locator('b',{hasText:'Dubliko'})}).click();await p.waitForTimeout(250);await button('Ruaj draft').click();
   const copy=await evaluate(()=>state.weighings.at(-1).id);assert.notEqual(copy,weighing);assert.equal(await evaluate(id=>by('weighings',id).status,copy),'Draft');
   await evaluate(id=>weightActions(id),copy);await p.locator('#modal .app').filter({has:p.locator('b',{hasText:'Modifiko'})}).click();await p.waitForTimeout(250);assert.ok(await p.locator('#wDate').count());await close();
   await evaluate(id=>weightActions(id),copy);await p.locator('#modal .app').filter({has:p.locator('b',{hasText:'Anulo'})}).click();await p.waitForTimeout(200);assert.equal(await evaluate(id=>by('weighings',id).status,copy),'Anuluar');
   await evaluate(id=>weightActions(id),copy);await p.locator('#modal .app').filter({has:p.locator('b',{hasText:'Fshi'})}).click();await p.waitForTimeout(200);assert.equal(await evaluate(id=>state.weighings.some(w=>w.id===id),copy),false);
 });
 await step('Payment advance checkbox, stored flag, mandate, balance and row menu',async()=>{
   await evaluate(()=>go('payments'));await button('+ Pagesë e re','#main').click();await p.locator('#paymentPrepayment').check();assert.equal(await p.locator('#modalTitle').innerText(),'MANDAT PARAPAGIMI');
   await p.locator('#pAmount').fill('15000');await button('Ruaj & printo').click();await p.waitForTimeout(230);
   assert.equal(await evaluate(()=>state.payments.at(-1).isPrepayment),true);assert.ok((await p.locator('#printMandate').innerText()).includes('MANDAT PARAPAGIMI'));
   assert.equal(await evaluate(()=>supplierPrepaymentRemaining('S1')),15000);assert.equal(await evaluate(()=>supplierBalance('S1')),-15000);
   await close();await evaluate(()=>go('payments'));await p.locator('#main button').filter({hasText:'⋮'}).first().click();assert.ok((await p.locator('#modal').innerText()).includes('Ndrysho'));
 });
 await step('Confirm FB; supplier four KPIs, four tabs and advance allocation',async()=>{
   await evaluate(id=>purchaseCard(id),invoice);await p.locator('#fiPrice').fill('100');await button('Konfirmo faturën').click();
   assert.equal(await evaluate(id=>by('purchaseInvoices',id).status,invoice),'Konfirmuar');assert.equal(await evaluate(()=>supplierBalance('S1')),-5000);assert.equal(await evaluate(()=>supplierPrepaymentRemaining('S1')),5000);
   await evaluate(id=>{allocatePrepaymentsAgainstInvoice(id);allocatePrepaymentsAgainstInvoice(id)},invoice);assert.equal(await evaluate(()=>supplierPrepaymentRemaining('S1')),5000);
   await evaluate(()=>supplierCard('S1'));assert.equal(await p.locator('#printSupplierCard .kpi').count(),4);
   for(const tab of ['Blerje','Pagesa','Parapagime','Detaje']){await p.locator('#printSupplierCard').getByRole('tab',{name:tab,exact:true}).click();assert.ok(await p.locator('#printSupplierCard').getByRole('tab',{name:tab,selected:true}).count())}
   assert.ok((await p.locator('#printSupplierCard').innerText()).includes(invoice));await p.screenshot({path:'.audit/'+(mobile?'mobile':'desktop')+'-supplier.png',fullPage:true});
 });
 await step('Manual purchase and invoice advance both confirm from their cards',async()=>{
   for(const pre of [false,true]){
     await evaluate(()=>purchaseInvoiceForm('S2'));if(pre){await p.locator('#fifPrepay').check();await p.locator('#fifAmount').fill('2000')}
     else{await p.locator('#fifQty').fill('10');await p.locator('#fifPrice').fill('100')}
     await button('Ruaj faturën').click();await p.waitForTimeout(240);let id=await evaluate(()=>purchaseInvoices().at(-1).id);
     await button('Konfirmo faturën').click();assert.equal(await evaluate(id=>by('purchaseInvoices',id).status,id),'Konfirmuar');assert.equal(await evaluate(id=>by('purchaseInvoices',id).total,id),pre?2000:1000);
   }
   assert.equal(await evaluate(()=>supplierBalance('S2')),-1000);assert.equal(await evaluate(()=>supplierPrepaymentRemaining('S2')),1000);
 });
 await step('Supplier return button and confirmed return update stock and ledger',async()=>{
   await evaluate(()=>go('purchases'));await button('↩ Kthim furnitori','#main').click();await button('+ Kthim i ri').click();await choose('srSupplier','S1');await choose('srInvoice',invoice);
   await p.locator('#srReason').fill('Test kthimi');await p.locator('#srLines .ret-qty').fill('10');await button('Konfirmo kthimin').click();
   assert.equal(await evaluate(id=>lotAvail(by('lots',id)),lot),90);assert.equal(await evaluate(()=>supplierBalance('S1')),-6000);assert.equal(await evaluate(()=>supplierPrepaymentRemaining('S1')),6000);
 });
 await step('Partial lot transfer and physical inventory keep available stock consistent',async()=>{
   await evaluate(id=>openLotTransfer(id),lot);await p.waitForTimeout(230);await choose('trRack','R2');await p.locator('#trQty').fill('20');await p.locator('#trBags').fill('2');
   await p.locator('#modalFoot button').filter({hasText:'Transfer'}).click();
   const target=await evaluate(id=>state.lots.find(l=>l.parentLot===id),lot);assert.ok(target);assert.equal(target.net,20);assert.equal(target.availableNet,20);assert.equal(await evaluate(id=>lotAvail(by('lots',id)),lot),70);
   await evaluate(()=>inventoryForm('R2'));await p.waitForTimeout(230);await p.locator('.inv-physical').fill('18');await button('Konfirmo inventarin').click();
   assert.equal(await evaluate(id=>by('lots',id).net,target.id),18);assert.equal(await evaluate(id=>lotAvail(by('lots',id)),target.id),18);
   assert.equal(await evaluate(()=>stockMoves().filter(m=>m.source==='inventoryTransfer').reduce((sum,m)=>sum+m.qty,0)),0);
 });
 await step('Linked weighing cannot be edited, cancelled or deleted',async()=>{
   const before=await evaluate(id=>JSON.stringify({w:by('weighings',id),lot:state.lots.find(l=>l.weighing===id),f:purchaseInvoices().find(f=>f.weighing===id)}),weighing);
   for(const action of ['Modifiko','Anulo','Fshi']){
     await evaluate(id=>weightActions(id),weighing);await p.locator('#modal .app').filter({has:p.locator('b',{hasText:action})}).click();await p.waitForTimeout(220);
     assert.equal(await evaluate(id=>JSON.stringify({w:by('weighings',id),lot:state.lots.find(l=>l.weighing===id),f:purchaseInvoices().find(f=>f.weighing===id)}),weighing),before,action);await close();
   }
   const guards=await evaluate(()=>{
     const backup=structuredClone(state),results=[];
     try{
       state.weighings.push({id:'NEG-W',status:'Konfirmuar'});state.lots.push({id:'NEG-L',weighing:'NEG-W'});
       const fixtures=[['samples',{id:'NEG-S',lot:'NEG-L'}],['lots',{id:'NEG-CHILD',parentLot:'NEG-L'}],['processes',{id:'NEG-P',sources:[{lot:'NEG-L',qty:1}]}],['packagings',{id:'NEG-PK',sourceLots:['NEG-L']}],['stockMovements',{id:'NEG-MV',lot:'NEG-L',source:'shipment',status:'Konfirmuar'}],['inventoryTransfers',{id:'NEG-T',lot:'NEG-L'}]];
       for(const[key,record]of fixtures){if(!state[key])state[key]=[];state[key].push(record);results.push([key,weighingHasDownstream('NEG-W')]);state[key].pop()}
       return results;
     }finally{state=backup;save()}
   });assert.deepEqual(guards.filter(([,blocked])=>!blocked),[]);
 });
 await step('Cards and existing forms open and leave no modal residue',async()=>{
   for(const expression of ["productCard('P105')","lotCard('L1')","sampleCard('SM-2026-0001')","sampleForm()","orderCard('PO-2026-0070')","orderForm()","processForm()","packagingForm()","shipmentForm()","productFormV2()","usersSecurityCenter()","backupCenter()","importCenter()"]){
     await close();await p.evaluate(expression);await p.waitForTimeout(220);assert.equal(await p.locator('#modal').evaluate(el=>el.classList.contains('open')),true,expression);assert.ok((await p.locator('#modalBody').innerHTML()).length,expression);
   }
   await close();await evaluate(()=>purchaseInvoiceForm('S1'));await p.locator('#fifNo').fill('Unsubmitted value');await evaluate(()=>supplierCard('S1'));await button('← Prapa').click();assert.equal(await p.locator('#fifNo').inputValue(),'Unsubmitted value');
 });
 await step('Settings tabs, recovery and distinct Pastro / Erase gates',async()=>{
   await evaluate(()=>go('settings'));
   for(const tab of ['Administrator','Përdoruesit','Mbrojtje/Rikuperim','Testet','Pastrimi i të dhënave']){
     await p.locator('#main').getByRole('tab',{name:tab,exact:true}).click();assert.ok((await p.locator('#settings-panel').innerText()).length);
   }
   await button('Pastro — ruaj llogaritë','#main').click();assert.ok((await p.locator('#modalBody').innerText()).includes('Mbeten vetëm llogaritë'));await close();
   await button('Erase — fshi edhe llogaritë','#main').click();assert.ok((await p.locator('#modalBody').innerText()).includes('përdoruesit dhe adminët'));await close();
   await p.locator('#main').getByRole('tab',{name:'Përdoruesit',exact:true}).click();await p.locator('#main [onclick="quickResetAdminPassword()"] ').click();assert.equal(await p.locator('#rapOld').count(),1);await close();
   await p.locator('#main').getByRole('tab',{name:'Mbrojtje/Rikuperim',exact:true}).click();assert.ok((await p.locator('#main').innerText()).includes('crash'));await p.screenshot({path:'.audit/'+(mobile?'mobile':'desktop')+'-settings.png',fullPage:true});
 });
 await step('Backup download, invalid restore refusal and valid JSON roundtrip',async()=>{
   const dl=p.waitForEvent('download');await p.locator('.top [title="Backup"]').click();const download=await dl;assert.match(download.suggestedFilename(),/\.json$/);const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(data.schemaVersion,3);assert.ok(data.weighings.some(w=>w.id===weighing));
   let before=await evaluate(()=>JSON.stringify(state));await p.locator('#importFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":99}')});await p.waitForTimeout(220);assert.equal(await evaluate(()=>JSON.stringify(state)),before);
   await p.locator('#importFile').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.waitForTimeout(250);assert.equal(await evaluate(()=>state.weighings.length),data.weighings.length);assert.ok((await p.locator('#toast').innerText()).includes('rikthye'));
   await evaluate(()=>backupCenter());await p.locator('#secureRestoreFile').setInputFiles({name:'invalid.bbak',mimeType:'application/octet-stream',buffer:Buffer.from('not JSON')});await evaluate(()=>secureRestore());assert.ok((await p.locator('#toast').innerText()).includes('refuzua'));
 });
 await step('Print uses a single isolated document',async()=>{
   await evaluate(id=>weightCard(id),weighing);await button('Printo / PDF').click();assert.equal(await p.locator('#biobesPrintFrame').count(),1);assert.ok(await p.locator('#biobesPrintFrame').evaluate(el=>el.contentDocument.body.innerText.includes('FLETË-PESHIMI')));await p.waitForTimeout(500);
   await close();await evaluate(id=>printPurchase(id),invoice);await button('Printo / PDF').click();assert.equal(await p.locator('#biobesPrintFrame').count(),1);
 });
 await step('Built-in financial and E2E suites; exports and tracing with documents',async()=>{
   await evaluate(()=>runDeepFinancialTest());const deep=await evaluate(()=>deepFinancialResults);assert.ok(deep.length>50);assert.deepEqual(deep.filter(r=>r.status!=='PASS'),[]);
   await close();await evaluate(()=>generateE2E());await evaluate(()=>runE2EChecks());let e2e=await evaluate(()=>e2eQaResults);assert.equal(e2e.length,152);assert.deepEqual(e2e.filter(r=>r.status!=='PASS'),[]);
   await close();await evaluate(()=>go('exports'));const exportDownload=p.waitForEvent('download');await button('XLSX','#main').click();const exported=await exportDownload;assert.match(exported.suggestedFilename(),/\.xlsx$/);assert.equal(fs.readFileSync(await exported.path()).subarray(0,2).toString(),'PK');await p.locator('#main button').filter({hasText:'Dokumentet'}).first().click();assert.ok((await p.locator('#main').innerText()).includes('Dokument'));
   await evaluate(()=>go('trace'));let trace=p.locator('#main input').first();await trace.fill(weighing);await button('Gjurmo','#main').click();assert.ok((await p.locator('#main').innerText()).length>100);
 });
 await step('Reports switch Alpha / Odoo and open a result',async()=>{
   await evaluate(()=>go('reports'));await p.locator('#main button').filter({hasText:'Raporte Alpha'}).click();assert.equal(await evaluate(()=>reportsMode),'alpha');
   await p.locator('#main [onclick="openAlphaGroup(\'purchase\')"]').click();
   await p.locator('#main .alpha-report-tile').first().click();await p.locator('#main [onclick="showAlphaPurchaseSummary()"]').first().click();assert.ok(await p.locator('#alphaPurchasePaper').isVisible());assert.ok((await p.locator('#alphaPurchasePaper').innerText()).includes('blerjeve'));
   await evaluate(()=>go('reports'));await p.locator('#main button').filter({hasText:'Raporte Odoo'}).click();assert.equal(await evaluate(()=>reportsMode),'odoo');assert.ok((await p.locator('#main').innerText()).includes('Shitje'));
 });

 await step('Boundary regressions: advance currency/reversal, zero-price FB, existing lot confirmation',async()=>{
   const outcome=await evaluate(()=>{
     const original=state,checks=[];try{
       state=clone(original);state.purchaseInvoices=[];state.payments=[];state.supplierReturns=[];
       state.suppliers.find(s=>s.id==='S3').openingBalance=0;
       state.payments.push({id:'ADV-EUR',supplier:'S3',amount:100,currency:'EUR',exchangeRate:100,isPrepayment:true,status:'Konfirmuar'});
       checks.push(supplierPrepaymentRemaining('S3')===10000);
       let f={id:'CHECK-FB',supplier:'S3',invoiceDate:'2026-09-12',date:'2026-09-12',currency:'ALL',exchangeRate:1,billable:50,price:100,vat:0,status:'Draft'};
       checks.push(coreCreatePurchase(f,true).ok);checks.push(supplierPrepaymentRemaining('S3')===5000);
       allocatePrepaymentsAgainstInvoice(f.id);allocatePrepaymentsAgainstInvoice(f.id);
       checks.push(state.payments[0].allocatedTo===5000);
       by('purchaseInvoices',f.id).status='Anuluar';checks.push(supplierPrepaymentRemaining('S3')===10000);
       state.payments[0].status='Anuluar';checks.push(supplierPrepaymentRemaining('S3')===0);
       checks.push(!coreCreatePurchase({...f,id:'ZERO-FB',status:'Draft',price:0},true).ok);
       let w={id:'CHECK-WEIGHT',supplier:'S3',product:'P105',weighingWarehouse:'W1',date:'2026-09-12',gross:101,tare:1,net:100,status:'Draft'};
       state.weighings.push(w);state.lots.push({id:'CHECK-LOT',weighing:w.id,product:'P105',supplier:'S3',warehouse:'W1',net:100});
       confirmExistingWeight(w.id);checks.push(w.status==='Konfirmuar');checks.push(state.lots.filter(l=>l.weighing===w.id).length===1);
       return checks;
     }finally{state=original;save();closeModal();render()}
   });
   assert.ok(outcome.length>=9);assert.ok(outcome.every(Boolean),JSON.stringify(outcome));
 });
 assert.deepEqual(errors,[]);await close();
 }finally{await browser.close()}
}
(async()=>{try{await run(false);await run(true)}catch(e){process.exitCode=1;console.error(e.stack)}finally{fs.writeFileSync('.audit/results.json',JSON.stringify(results,null,2));console.log(`${results.filter(r=>r.status==='PASS').length}/${results.length} passed`)}})();
