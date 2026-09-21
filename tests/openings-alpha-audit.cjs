/* tests/openings-alpha-audit.cjs — importi i gjendjeve fillestare (furnitor, klient, bankë, arkë,
   magazinë) REFLEKTOHET në raportet Alpha/Odoo: situacionet, arkën, magazinën dhe bilancin e hapjes. */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 async function imp(k,csv){
  await ev(k=>{const inp=document.getElementById('moduleImportFile')||document.body.appendChild(Object.assign(document.createElement('input'),{id:'moduleImportFile',type:'file',hidden:true}));inp.value='';inp.onchange=()=>{const f=inp.files&&inp.files[0];if(f)parseModuleImport(k,f)}},k);
  await p.locator('#moduleImportFile').setInputFiles({name:'hapje.csv',mimeType:'text/csv',buffer:Buffer.from('\ufeff'+csv)});
  await p.waitForFunction(()=>/Kontrolli i importit/.test(document.getElementById('modalTitle')?.innerText||''),{},{timeout:8000});
  await p.locator('#modalFoot button').filter({hasText:'Konfirmo importin'}).click();
  await p.waitForTimeout(800);await ev(()=>{try{closeModal()}catch(e){}});await p.waitForTimeout(200);
 }
 async function closeAll(){await ev(()=>{try{closeModal()}catch(e){}});await p.waitForTimeout(250)}
 await p.waitForTimeout(1200);await closeAll();
 await ev(()=>{state.__alphaIds={sup:state.suppliers[0].id,cust:state.customers[0].id,supCode:state.suppliers[0].code||state.suppliers[0].id,custCode:state.customers[0].code||state.customers[0].id,wh:state.warehouses[0].code,pr:state.products[0].code};save()});

 await step('Importi i hapjeve: furnitor 150 000, klient 80 000, bankë 25 000, arkë 12 500, magazinë 1 000 kg × 250',async()=>{
  const S=await ev(()=>state.__alphaIds);
  await imp('suppliers','code,name,openingBalance,openingCurrency\n'+S.supCode+',Furnitor Hapje Alpha,150000,ALL\n');
  await imp('customers','code,name,openingBalance,openingCurrency\n'+S.custCode+',Klient Hapje Alpha,80000,ALL\n');
  await imp('bankAccounts','code,bank,iban,currency,ledgerAccount,openingBalance,active\nBK-ALPHA,Banka Alpha,AL0001,ALL,512,25000,Po\n');
  await imp('cashRegisters','code,name,currency,ledgerAccount,openingBalance,active\nARK-ALPHA,Arka Alpha,ALL,530,12500,Po\n');
  await imp('stockOpening','warehouse,rack,product,supplier,lotCode,qty,bags,unitCost,organic,note\n'+[S.wh,'',S.pr,S.supCode,'LOT-ALPHA-1','1000','20','250','Po','hapje alpha'].join(',')+'\n');
  const ok=await ev(()=>{
   const sup=state.suppliers.find(x=>/Furnitor Hapje Alpha/.test(x.name||'')),cus=state.customers.find(x=>/Klient Hapje Alpha/.test(x.name||''));
   const bank=bankAccounts().find(x=>x.code==='BK-ALPHA'),cash=cashRegisters().find(x=>x.code==='ARK-ALPHA'),lot=state.lots.find(l=>l.code==='LOT-ALPHA-1');
   return{sup:sup&&sup.openingBalance,cus:cus&&cus.openingBalance,bank:bank&&bank.openingBalance,cash:cash&&cash.openingBalance,lot:lot&&{net:lot.net,uc:lot.unitCost}}});
  assert.equal(ok.sup,150000);assert.equal(ok.cus,80000);assert.equal(ok.bank,25000);
  assert.equal(ok.cash,12500,'arka tani importohet me gjendje fillestare');
  assert.deepEqual(ok.lot,{net:1000,uc:250});
 });

 await step('Alpha — Situacioni i klientit: gjendja fillestare shfaqet te "Detyrimi i mëparshëm"',async()=>{
  const r=await ev(()=>{reportsMode='analytics';salesReportTab='situation';page='reports';render();
   const rows=()=>alphaCustomerSituationData().filter(x=>/Klient Hapje Alpha/.test(x.name||''));
   salesReportFilters={from:'2030-01-01',to:'2030-12-31',q:''};
   const row=rows()[0];
   salesReportFilters={from:'2026-03-02',to:'2026-12-31',q:''};
   const row2=rows()[0];
   salesReportFilters={from:'',to:'',q:''};
   return{prev:row&&row.previous,rows:rows().length,debit:row2&&row2.debit,bal:row2&&row2.balance}});
  assert.equal(r.rows,1,'pa dublime në situacionin e klientit');
  assert.equal(r.prev,80000,'gjendja fillestare e klientit te "Detyrimi i mëparshëm" (periudhë pas hapjes)');
  assert.equal(r.debit,80000,'gjendja fillestare llogaritet si veprim i datës së hapjes brenda periudhës');
  assert.equal(r.bal,80000,'gjendja nuk dyfishohet');
  const html=await ev(()=>customerSituationReport());
  assert.ok(html.includes('Klient Hapje Alpha'),'klienti shfaqet në raportin e situacionit');
  assert.ok(/80,000\.00|80\.000,00|80000/.test(html),'gjendja fillestare në tabelën e raportit');
  await p.waitForTimeout(300);
  const txt=await ev(()=>document.getElementById('main').innerText);
  assert.ok(txt.length>50,'faqja e raporteve renderohet');
 });

 await step('Alpha — Situacioni i furnitorit: gjendja fillestare në "Detyrimi i mëparshëm"',async()=>{
  const row=await ev(()=>alphaSupplierSituationData().filter(x=>/Furnitor Hapje Alpha/.test(x.name||''))[0]);
  assert.equal(row.previous,150000);
  const html=await ev(()=>supplierSituationReport());
  assert.ok(/150,000\.00|150\.000,00|150000/.test(html),'shuma shfaqet në raportin e furnitorit');
 });

 await step('Alpha — Gjendja e përmbledhur e arkës: gjendja e mëparshme e arkës/bankës',async()=>{
  const r=await ev(()=>{openAlphaCashReport('cashSummary');alphaCashFilters.bankAccount='';
   alphaCashFilters.cashRegister=(cashRegisters().find(x=>x.code==='ARK-ALPHA')||{}).id||'';
   const cash=cashPriorBalance();alphaCashFilters.cashRegister='';
   alphaCashFilters.bankAccount=(bankAccounts().find(x=>x.code==='BK-ALPHA')||{}).id||'';
   const bank=cashPriorBalance();alphaCashFilters.bankAccount='';
   return{cash,bank}});
  assert.equal(r.cash,12500,'prior i arkës në Alpha');
  assert.equal(r.bank,25000,'prior i bankës në Alpha');
  const html=await ev(()=>{alphaCashShow=true;return cashSummaryPreview()});
  assert.ok(html.includes('ARK-ALPHA'),'arka me gjendje fillestare shfaqet në përmbledhje');
  assert.ok(/12[.,]500[.,]00/.test(html),'gjendja e mëparshme e arkës në raport');
  const bankHtml=await ev(()=>cashSummaryPreview());
  assert.ok(/25[.,]000[.,]00/.test(bankHtml),'gjendja e mëparshme e bankës në raport');
 });

 await step('Alpha — Regjistri i magazinës: lote e hapjes me kostot e importit',async()=>{
  const r=await ev(()=>{openAlphaInventorySummary();alphaInventoryFilters.docFrom='1900-01-01';alphaInventoryFilters.docTo='2099-12-31';
   const rows=alphaInventoryRows().filter(x=>/LOT-ALPHA-1/.test(x.description||''));
   return{rows:rows.map(x=>({type:x.type,no:x.no,value:x.value,unit:x.unit})),cost:historicalProductCost(state.products.find(x=>(x.code||'')===state.__alphaIds.pr).id,'2099-12-31')}});
  assert.ok(r.rows.length>=1,'lote e hapjes në regjistrin e magazinës');
  assert.match(r.rows.map(x=>x.type).join('|'),/Gjendje Fillestare|Hyrje/);
  assert.equal(r.rows[0].value,1000,'sasia e loteve të hapjes');
  assert.equal(r.cost,250,'kostoja e loteve të hapjes përdoret në raportet e magazinës');
 });

 await step('Bilanci i hapjes (Alpha/odoo accounting): 401, 411, 512, 530 dhe 311 nga importi',async()=>{
  const L=await ev(()=>window.openingBalanceLines().lines.map(l=>({a:String(l.account),d:l.debit,c:l.credit})));
  const get=(a,D)=>{const row=L.find(x=>x.a===a&&(D?x.d>0:x.c>0));return row?(D?row.d:row.c):0};
  assert.equal(get('401',false),150000,'furnitorët në 401');
  assert.equal(get('411',true),80000,'klientët në 411');
  assert.equal(get('512',true),25000,'banka në 512');
  assert.equal(get('530',true),12500,'arka në 530');
  assert.equal(get('311',true),250000,'magazina në 311 (1000 kg × 250)');
 });

 await step('Alpha — Inventari (Raporte Odoo): lote e hapjes në gjendje',async()=>{
  const r=await ev(()=>{reportsMode='odoo';odooReportModule='inventory';page='reports';render();
   return inventoryReportData().filter(x=>x.lot==='LOT-ALPHA-1').map(x=>({lot:x.lot,qty:x.qty,wh:x.warehouse}))});
  assert.equal(r.length,1,'lote e hapjes në raportin e inventarit');
  assert.equal(r[0].qty,1000);
 });

 await step('Ripërsëritja e importeve të hapjes: pa dublime në raporte',async()=>{
  const S=await ev(()=>state.__alphaIds);
  await imp('suppliers','code,name,openingBalance,openingCurrency\n'+S.supCode+',Furnitor Hapje Alpha,150000,ALL\n');
  await imp('customers','code,name,openingBalance,openingCurrency\n'+S.custCode+',Klient Hapje Alpha,80000,ALL\n');
  const r=await ev(()=>{salesReportFilters={from:'2030-01-01',to:'2030-12-31',q:''};return{
   custRows:alphaCustomerSituationData().filter(x=>/Klient Hapje Alpha/.test(x.name||'')).length,
   custPrev:alphaCustomerSituationData().filter(x=>/Klient Hapje Alpha/.test(x.name||''))[0].previous,
   supRows:alphaSupplierSituationData().filter(x=>/Furnitor Hapje Alpha/.test(x.name||'')).length,
   supPrev:alphaSupplierSituationData().filter(x=>/Furnitor Hapje Alpha/.test(x.name||''))[0].previous}});
  await ev(()=>{salesReportFilters={from:'',to:'',q:''}});
  assert.equal(r.custRows,1);assert.equal(r.supRows,1,'pa dublime te furnitorët');
  assert.equal(r.custPrev,80000,'pa dyfishim të shumës');
  assert.equal(r.supPrev,150000,'pa dyfishim të shumës');
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors.filter(e=>!/Failed to load resource/.test(e)),[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
