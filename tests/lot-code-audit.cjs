/* tests/lot-code-audit.cjs — skema e kodit të lotit sipas dokumentit zyrtar BioBES */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 async function fillWeigh(sup,lc){
   await ev(()=>{try{closeModal()}catch(e){};weighForm()});await p.waitForTimeout(400);
   await ev(s=>{fillSearchSelect('wSupplier',s.sup);fillSearchSelect('wProduct',s.prod);fillSearchSelect('wWarehouse',s.wh);
     addWeighRow();const tr=document.querySelector('#weighRows tr');
     tr.querySelector('.wr-bags').value=10;tr.querySelector('.wr-gross').value=500;tr.querySelector('.wr-tare').value=50;calcWRows()},sup);
   await p.waitForTimeout(250);
   if(lc)await ev(l=>{if(l.period){const e=document.getElementById('lcPeriod');e.value=l.period;e.dispatchEvent(new Event('input'))}
     if(l.split){const e=document.getElementById('lcSplit');e.value=String(l.split);e.dispatchEvent(new Event('input'))}
     if(l.manual!==undefined){const m=document.getElementById('lcManual');m.checked=l.manual;m.dispatchEvent(new Event('change'))}
     if(l.code){document.getElementById('lcCode').value=l.code;document.getElementById('lcCode').dispatchEvent(new Event('input'))}},lc);
   await p.waitForTimeout(150);
 }
 const ids=await ev(()=>({prod:state.products[0].id,wh:state.warehouses[0].id}));

 await step('Regjistrat e zonave mbushen nga dokumenti (M/K/S/W/A + periudhat)',async()=>{
   await ev(()=>lotZonesEnsure());
   const z=await ev(()=>({n:state.lotZones.length,has:['M12','K07','K00','S05','W04','A07','A15'].filter(c=>state.lotZones.some(x=>x.code===c)).length,
     a07:(state.lotZones.find(x=>x.code==='A07')||{}).name,per:(state.lotPeriods||[]).map(x=>x.code).join(',')}));
   assert.ok(z.n>=55,'regjistri ka '+z.n+' zona');assert.equal(z.has,7);
   assert.equal(z.a07,'Ardjan Lulaj');assert.equal(z.per,'I,II,III');
 });

 await step('Te kartela e furnitorit caktohet zona + ndarja e blerësit',async()=>{
   await ev(()=>supplierCard('S1'));await p.waitForTimeout(350);
   assert.equal(await p.locator('#szZoneBtn').count(),1,'butoni i zonës mungon te kartela');
   await p.locator('#szZoneBtn').click();await p.waitForTimeout(350);
   await ev(()=>{document.getElementById('szZone').value='K07';document.getElementById('szBuyer').value='4'});
   await p.locator('#modal button:has-text("Ruaj")').click();await p.waitForTimeout(350);
   const s=await ev(()=>({z:state.suppliers.find(x=>x.id==='S1').lotZone,b:state.suppliers.find(x=>x.id==='S1').lotBuyer}));
   assert.equal(s.z,'K07');assert.equal(s.b,'4');
   await ev(()=>closeModal());
 });

 await step('Konfirmimi pa formular (peshim ekzistues) përdor zonën e furnitorit: B1K07-4-I/1',async()=>{
   await ev(i=>{state.weighings.push({id:'PS-LC-1',date:'2026-09-10',supplier:'S1',product:i.prod,weighingWarehouse:i.wh,receiver:'T',discount:0,bagRows:[{bags:10,gross:500,tare:50}],gross:500,tare:50,net:450,bags:10,status:'Draft'});save()},ids);
   await ev(()=>confirmExistingWeight('PS-LC-1'));await p.waitForTimeout(400);
   const lot=await ev(()=>{const l=state.lots.find(x=>x.weighing==='PS-LC-1');return l?{c:l.code,parts:l.lotParts||null}:null});
   assert.ok(lot,'loti nuk u krijua');assert.equal(lot.c,'B1K07-4-I/1');
   assert.equal(lot.parts.zone,'K07');assert.equal(lot.parts.buyer,'4');
 });

 await step('Formulari i peshimit tregon pjesët dhe preview-in B1K07-4-II/3',async()=>{
   await fillWeigh({sup:'S1',prod:ids.prod,wh:ids.wh},{period:'II',split:3});
   const v=await ev(()=>({zone:document.getElementById('lcZone').value,prev:document.getElementById('lcPreview').textContent}));
   assert.equal(v.zone,'K07','zona nuk u paraprzgjodh nga furnitori');
   assert.equal(v.prev,'B1K07-4-II/3');
 });

 await step('Ruajtja nga formulari krijon lotin me kodin e zgjedhur',async()=>{
   await ev(()=>saveWeighRows(true));await p.waitForTimeout(600);
   const c=await ev(()=>state.lots[state.lots.length-1].code);
   assert.equal(c,'B1K07-4-II/3');
 });

 await step('Kodi i duplikuar merr prapashtesë automatike (-2)',async()=>{
   await fillWeigh({sup:'S1',prod:ids.prod,wh:ids.wh},{period:'II',split:3});
   await ev(()=>saveWeighRows(true));await p.waitForTimeout(600);
   const c=await ev(()=>state.lots[state.lots.length-1].code);
   assert.equal(c,'B1K07-4-II/3-2');
 });

 await step('Mbledhja me dorë e kodit respektohet saktësisht',async()=>{
   await fillWeigh({sup:'S1',prod:ids.prod,wh:ids.wh},{manual:true,code:'B9W04-7-III/5'});
   await ev(()=>saveWeighRows(true));await p.waitForTimeout(600);
   const c=await ev(()=>state.lots[state.lots.length-1].code);
   assert.equal(c,'B9W04-7-III/5');
 });

 await step('Furnitori pa zonë mbetet te skema e vjetër (përputhshmëri prapa)',async()=>{
   await fillWeigh({sup:'S2',prod:ids.prod,wh:ids.wh},null);
   const prev=await ev(()=>document.getElementById('lcPreview').textContent);
   assert.match(prev,/skema e vjetër/);
   await ev(()=>saveWeighRows(true));await p.waitForTimeout(600);
   const c=await ev(()=>{const l=state.lots[state.lots.length-1];return l.code});
   const exp=await ev(i=>'B1'+state.suppliers.find(s=>s.id==='S2').code+'-'+state.products[0].code+'-26',ids);
   assert.equal(c,exp);
 });

 await step('Ekrani i menaxhimit: shtim, ndryshim dhe fshirje e bllokuar kur përdoret',async()=>{
   await ev(()=>lotZonesManager());await p.waitForTimeout(350);
   await ev(()=>{document.getElementById('lzKind').value='A';document.getElementById('lzCode').value='a16';document.getElementById('lzName').value='Fermer i ri, Lushnje'});
   await ev(()=>lotZoneAdd());await p.waitForTimeout(350);
   assert.ok(await ev(()=>state.lotZones.some(z=>z.code==='A16'&&z.name==='Fermer i ri, Lushnje')),'zona e re nuk u shtua');
   const id=await ev(()=>state.lotZones.find(z=>z.code==='A16').id);
   await ev(()=>{state.suppliers.find(s=>s.id==='S1').lotZone='A16';save()});
   await ev(i=>lotZoneDelete(i),id);await p.waitForTimeout(250);
   assert.ok(await ev(i=>state.lotZones.some(z=>z.id===i),id),'fshirja duhej bllokuar kur zona është te një furnitor');
   await ev(()=>{state.suppliers.find(s=>s.id==='S1').lotZone='K07';save()});
   await ev(i=>lotZoneDelete(i),id);await p.waitForTimeout(250);
   assert.ok(!(await ev(i=>state.lotZones.some(z=>z.id===i),id)),'zona e lirë duhej fshirë');
   await ev(()=>closeModal());
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
