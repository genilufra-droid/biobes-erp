/* tests/weigh-group-audit.cjs — peshimi i grupuar: shumë furnitorë/artikuj në një fletë */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}

 await step('Faqja e peshimeve ka butonin "Peshim i grupuar" dhe formulari hapet me rreshta',async()=>{
   await ev(()=>{lotZonesEnsure();const s=state.suppliers.find(x=>x.id==='S1');s.lotZone='K07';s.lotBuyer='4';save();go('weighings')});
   await p.waitForTimeout(500);
   await p.locator('button:has-text("Peshim i grupuar")').first().click();await p.waitForTimeout(500);
   assert.match(await p.locator('#modalTitle').innerText(),/Peshim i grupuar/);
   assert.equal(await p.locator('#wgBody tr.wg-row').count(),3);
 });

 await step('Tre rreshta (2 furnitorë, 3 artikuj) ruhen si 3 PS- të një seance, të konfirmuara me lote e draft-FB',async()=>{
   const before=await ev(()=>({w:state.weighings.length,l:state.lots.length,f:purchaseInvoices().length}));
   await ev(()=>{const rows=[...document.querySelectorAll('#wgBody tr.wg-row')];
     const set=(tr,sup,prod,b,g,t)=>{tr.querySelectorAll('select')[0].value=sup;tr.querySelectorAll('select')[1].value=prod;
       tr.querySelector('.wg-bags').value=b;tr.querySelector('.wg-gross').value=g;tr.querySelector('.wg-tare').value=t};
     set(rows[0],'S1',state.products[0].id,10,500,50);
     set(rows[1],'S1',state.products[1].id,5,200,20);
     set(rows[2],'S2',state.products[0].id,8,400,40);
     wgCalc()});
   const tot=await ev(()=>document.getElementById('wgTotal').innerText);
   assert.match(tot,/23/);assert.match(tot,/990/);
   await p.locator('#modal button:has-text("Ruaj + konfirmo")').click();await p.waitForTimeout(900);
   const after=await ev(b=>{const ws=state.weighings.slice(b.w);return {n:ws.length,ids:ws.map(w=>w.id),gr:[...new Set(ws.map(w=>w.groupId))],
     st:[...new Set(ws.map(w=>w.status))],lots:state.lots.slice(b.l).map(l=>l.code),fb:purchaseInvoices().slice(b.f).map(f=>f.status),
     sup:[...new Set(ws.map(w=>w.supplier))]}} ,before);
   assert.equal(after.n,3);assert.equal(after.gr.length,1);assert.match(after.gr[0],/^GR-\d{4}-0001$/);
   assert.deepEqual(after.st,['Konfirmuar']);
   assert.equal(after.lots.length,3);assert.match(after.lots[0],/^B1K07-4-/,'loti i S1 duhet të ndjekë zonën e tij');
   assert.equal(after.fb.length,3);assert.deepEqual(after.fb,['Draft','Draft','Draft']);
   assert.equal(after.sup.length,2);
   global.__gr=after.gr[0];global.__wid=after.ids[0];
 });

 await step('Pas ruajtjes hapet përmbledhja e seancës me të tre dokumentet',async()=>{
   assert.match(await p.locator('#modalTitle').innerText(),/Seanca e peshimit GR-/);
   const t=await p.locator('#modalBody').innerText();
   assert.match(t,/S01\/1/);assert.match(t,/S01\/2/);
   assert.equal((t.match(/PS-\d{4}-\d+/g)||[]).length>=3,true);
 });

 await step('Fletë grupi A4 landscape: nëntotale sipas furnitorit + total + nënshkrime',async()=>{
   const gr=global.__gr;
   await ev(g=>weighGroupPrint(g),gr);await p.waitForTimeout(250);
   const fr=await ev(()=>{const f=document.getElementById('biobesPrintFrame');if(!f)return null;
     const d=f.contentDocument;return {css:(d.querySelector('style')||{}).textContent||'',body:d.body.innerHTML,
       txt:d.body.innerText}});
   assert.ok(fr,'iframe-i i printimit mungon');
   assert.match(fr.css,/@page\{size:A4 landscape/);
   assert.equal((fr.txt.match(/Nëntotali/g)||[]).length,2,'duhet dy nëntotale (dy furnitorë)');
   assert.match(fr.txt,/GJITHSEJ/);assert.match(fr.txt,/Sokol Agalliu/);assert.match(fr.txt,/Nënshkrimi i peshuesit/);
   assert.match(fr.body,new RegExp(global.__gr));
 });

 await step('Kartela e peshimit tregon seancën dhe butonat e grupit',async()=>{
   await ev(()=>{try{closeModal()}catch(e){}});await p.waitForTimeout(200);
   await ev(id=>weightCard(id),global.__wid);await p.waitForTimeout(400);
   assert.equal(await p.locator('#wgChip').count(),1,'shenja e seancës mungon te kartela');
   assert.match(await p.locator('#wgChip').innerText(),/GR-\d{4}-0001/);
   await p.locator('#wgChip button:has-text("Hap grupin")').click();await p.waitForTimeout(400);
   assert.match(await p.locator('#modalTitle').innerText(),/Seanca e peshimit/);
   await ev(()=>closeModal());
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
