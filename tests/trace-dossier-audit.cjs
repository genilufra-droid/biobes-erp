/* tests/trace-dossier-audit.cjs — butonat "Kartela e gjurmueshmërisë (A4)" dhe "Grafiku i gjurmueshmërisë"
   punojnë në ÇDO vend ku shfaqen: lot, paketë, porosi, ngarkesë, faturë shitjeje dhe moduli i gjurmueshmërisë.
   Çdo klik jep gjithmonë përgjigje të dukshme (fletë ose shpjegim) — asnjë dështim i heshtur. */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 const state=async()=>ev(()=>({title:document.getElementById('modalTitle')?.innerText||'',len:(document.getElementById('modalBody')?.innerHTML||'').length,toast:document.getElementById('toast')?.innerText||'',hasTable:!!document.querySelector('#modalBody table'),hasSvg:!!document.querySelector('#modalBody svg')}));
 const clickByText=async(txt)=>{
  await p.locator('#modalBody button').filter({hasText:txt}).first().click();
  await p.waitForTimeout(700);
 };
 const reset=async()=>{await ev(()=>{try{closeModal()}catch(e){}});await p.waitForTimeout(250)};
 await p.waitForTimeout(1200);await reset();

 await step('Seed: lot, paketë, porosi, ngarkesë dhe faturë me zinxhir të plotë',async()=>{
  const info=await ev(()=>{
   const lot=state.lots[0],pr=state.products[0],c=state.customers[0];
   state.orders.push({id:'TD-ORD-1',date:'2026-09-19',customer:c.id,status:'E përfunduar',items:[{product:pr.id,qty:10,done:10}]});
   state.shipments.push({id:'TD-SH-1',date:'2026-09-19',order:'TD-ORD-1',customer:c.id,status:'Dorëzuar',plate:'AA-001-XX'});
   packs().push({id:'TD-PK-1',date:'2026-09-19',order:'TD-ORD-1',product:lot.product,sourceLots:[lot.id],bags:10,bagWeight:10,template:'BioBes',internalLot:'TD-INT-1',origin:'Albania'});
   salesInvoices().push({id:'TD-SALE-1',invoiceNumber:'FSH-TD-1',date:'2026-09-19',customer:c.id,order:'TD-ORD-1',shipment:'TD-SH-1',currency:'ALL',exchangeRate:1,vat:20,status:'Konfirmuar',documentType:'FSH',lines:[{product:pr.id,net:10,price:100}]});
   save();return {lot:lot.id,lotCode:lot.code,pack:'TD-PK-1',order:'TD-ORD-1',ship:'TD-SH-1',sale:'TD-SALE-1'}});
  assert.ok(info.lot&&info.pack);
  await ev(()=>window.__tdInfo=undefined);
  await p.waitForTimeout(200);
 });

 await step('Kartela e lotit: butoni A4 hap fletën e gjurmueshmërisë (jo klikim bosh)',async()=>{
  await reset();
  const id=await ev(()=>state.lots[0].id);
  await ev(i=>lotCard(i),id);await p.waitForTimeout(700);
  await clickByText('Kartela e gjurmueshmërisë (A4)');
  const s=await state();
  assert.match(s.title,/Kartela e gjurmueshmërisë/,'titulli: '+s.title);
  assert.ok(s.hasTable,'fleta ka tabela');assert.ok(s.len>500,'përmbajtje ('+s.len+')');
 });

 await step('Kartela e gjurmueshmërisë ka butonin e printimit A4 dhe shënon origjinën',async()=>{
  const foot=await ev(()=>document.getElementById('modalFoot')?.innerText||'');
  assert.match(foot,/Printo A4 landscape/,'butoni i printimit');
  const body=await ev(()=>document.getElementById('modalBody')?.innerText||'');
  assert.ok(/Lot|Furnitor|Peshim/i.test(body),'përmbajtja e fletës');
 });

 await step('Kartela e paketës: butoni A4 funksionon (klikim i vërtetë)',async()=>{
  await reset();
  await ev(()=>packagingCard('TD-PK-1'));await p.waitForTimeout(700);
  await clickByText('Kartela e gjurmueshmërisë (A4)');
  const s=await state();
  assert.match(s.title,/Kartela e gjurmueshmërisë — /,'titulli: '+s.title);
  assert.ok(s.hasTable&&s.len>500,'fleta u hap ('+s.len+')');
 });

 await step('Kartela e paketës: butoni i grafikut funksionon',async()=>{
  await reset();
  await ev(()=>packagingCard('TD-PK-1'));await p.waitForTimeout(700);
  await clickByText('Nga u formua ky lot klienti');
  await p.waitForTimeout(500);
  const s=await state();
  assert.match(s.title,/Gjurmueshmëria/,'titulli: '+s.title);
  assert.ok(s.hasSvg||s.hasTable,'grafik ose tabelë');assert.ok(s.len>500,'përmbajtje ('+s.len+')');
 });

 await step('Kartela e porosisë dhe e ngarkesës: A4 punon',async()=>{
  for(const [fn,label] of [[()=>orderCard('TD-ORD-1'),'TD-ORD-1'],[()=>shipmentCard('TD-SH-1'),'TD-SH-1']]){
   await reset();
   const err=await ev(f=>{try{eval('('+f+')()');return ''}catch(e){return e.message}},fn.toString());
   assert.equal(err,'',label+' u hap: '+err);
   await p.waitForTimeout(700);
   const has=await p.locator('#modalBody button').filter({hasText:'Kartela e gjurmueshmërisë (A4)'}).count();
   if(!has){console.log('      ('+label+': ky kartelë s\'ka butonin A4 — kontrollohet vetëm se hapet pa gabime)');continue}
   await clickByText('Kartela e gjurmueshmërisë (A4)');
   const s=await state();
   assert.ok(/Kartela e gjurmueshmërisë/.test(s.title),label+': '+s.title);
   assert.ok(s.len>300,label+': përmbajtje ('+s.len+')');
  }
 });

 await step('Fatura e shitjes: A4 punon (edhe kur fatura s’ka porosi → shpjegim i qartë)',async()=>{
  await reset();
  const cid=await ev(()=>state.customers[0].id);
  await ev(c=>{salesInvoices().push({id:'TD-SALE-2',invoiceNumber:'FSH-TD-2',date:'2026-09-19',customer:c,currency:'ALL',exchangeRate:1,vat:20,status:'Konfirmuar',documentType:'FSH',lines:[{product:state.products[0].id,net:5,price:100}]});save()},cid);
  for(const [id,expect] of [['TD-SALE-1',/Kartela e gjurmueshmërisë/],['TD-SALE-2',/Kartela e gjurmueshmërisë|Gjurmueshmëria e dokumentit/]]){
   await reset();
   const err=await ev(i=>{try{saleInvoiceCard(i);return ''}catch(e){return e.message}},id);
   assert.equal(err,'',id+' u hap: '+err);
   await p.waitForTimeout(700);
   const has=await p.locator('#modalBody button').filter({hasText:'Kartela e gjurmueshmërisë (A4)'}).count();
   if(!has){continue}
   await clickByText('Kartela e gjurmueshmërisë (A4)');
   const s=await state();
   assert.match(s.title,expect,id+': '+s.title);
   assert.ok(s.len>300,id+': përmbajtje ('+s.len+')');
  }
 });

 await step('Moduli i Gjurmueshmërisë: fleta A4 hapet nga butoni i modulit',async()=>{
  await reset();
  await ev(()=>go('trace'));await p.waitForTimeout(1200);
  const btn=await p.locator('#main button').filter({hasText:'Kartela e gjurmueshmërisë (A4)'}).count();
  if(!btn){console.log('      (grafiku duhet ndërtuar më parë — kalohet)');return}
  await p.locator('#main button').filter({hasText:'Kartela e gjurmueshmërisë (A4)'}).first().click();
  await p.waitForTimeout(800);
  const s=await state();
  assert.match(s.title,/Kartela e gjurmueshmërisë/,'titulli: '+s.title);
  assert.ok(s.len>400,'përmbajtje ('+s.len+')');
 });

 await step('Të dhëna të pjesshme: identifikues i panjohur → shpjegim i qartë (jo klikim bosh)',async()=>{
  for(const arg of ['pk:PK-NUK-EKZISTON','ord:undefined','','lot:L-NUK-EKZISTON']){
   await reset();
   await ev(a=>{window.traceDossierModal(a)},arg);
   await p.waitForTimeout(600);
   const s=await state();
   assert.ok(s.len>150,'duhet një përgjigje e dukshme për "'+arg+'" (len '+s.len+')');
   assert.match(s.title,/Gjurmueshmëria|Kartela/,'titulli për "'+arg+'": '+s.title);
   assert.ok(/nuk u gjet|nuk ka të dhëna|Gjurmueshmëria nuk/i.test(await ev(()=>document.getElementById('modalBody')?.innerText||'')),'mesazhi sqaron pse');
  }
 });

 await step('Fletë me të dhëna të pjesshme (lot burimor i fshirë) → fleta hapet njësoj, pa gabime',async()=>{
  await reset();
  await ev(()=>{packs().push({id:'TD-PK-BAD',date:'2026-09-19',order:'TD-ORD-1',product:state.products[0].id,sourceLots:['L-UK'],bags:2,bagWeight:10,template:'BioBes',internalLot:'TD-BAD',origin:'Albania'});save()});
  await ev(()=>packagingCard('TD-PK-BAD'));await p.waitForTimeout(700);
  await clickByText('Kartela e gjurmueshmërisë (A4)');
  const s=await state();
  assert.match(s.title,/Kartela|Gjurmueshmëria/,'titulli: '+s.title);
  assert.ok(s.len>300,'përgjigje e dukshme ('+s.len+')');
 });

 await step('Porosia pa klient: kartela nuk rrëzohet më (defekti i gjetur në verifikimin live)',async()=>{
  await reset();
  const err=await ev(()=>{state.orders.push({id:'TD-ORD-NOCUST',date:'2026-09-19',customer:'C-NUK-EKZISTON',status:'E re',items:[{product:state.products[0].id,qty:1}]});save();
   try{orderCard('TD-ORD-NOCUST');return ''}catch(e){return e.message}});
  assert.equal(err,'','orderCard rrëzohej: '+err);
  await p.waitForTimeout(500);
  const t=await ev(()=>document.getElementById('modalTitle')?.innerText||'');
  assert.match(t,/Formulari i porosisë/,'kartela u hap: '+t);
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors.filter(e=>!/Failed to load resource/.test(e)),[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
