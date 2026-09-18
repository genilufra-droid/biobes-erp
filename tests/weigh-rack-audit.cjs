/* Peshimi: thasë/ambalazh opsionale + rafti që në peshim + "Ndrysho raftin" në kartelën e lotit (blloku biobes-weigh-rack-v1). */
const {open}=require('./helpers.cjs');const assert=require('node:assert/strict');
let passed=0,failed=0;
async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e&&e.message||e).split('\n')[0])}}
(async()=>{const {browser,page:p,errors,close,choose}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 const b=name=>p.locator('#modal').getByRole('button',{name,exact:true});
 const setSel=(id,v)=>ev(([id,v])=>{let e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))},[id,v]);
 const setRow=(i,bags,gross,tare)=>ev(([i,bags,gross,tare])=>{let r=document.querySelectorAll('#weighRows tr')[i],x=r.querySelectorAll('input');x[0].value=bags;x[1].value=gross;x[2].value=tare;x.forEach(e=>e.dispatchEvent(new Event('input',{bubbles:true})))},[i,bags,gross,tare]);
 const openForm=async()=>{await ev(()=>{closeModal();weighForm()});await p.waitForTimeout(450)};
 const toastsOn=()=>ev(()=>{window.__t=[];if(!window.__tp){window.__tp=window.toast;window.toast=m=>{window.__t.push(m);return window.__tp(m)}}});

 await step('Formulari i peshimit ka fushën "Rafti (opsional)" pas magazinës; lista ndjek magazinën',async()=>{
   await openForm();
   const labels=await ev(()=>[...document.querySelectorAll('#modalBody .field label')].map(l=>l.textContent.trim().replace(/\s+/g,' ')));
   assert.ok(labels.some(l=>/^Rafti \(opsional\)/.test(l)),labels.join(' | '));
   assert.equal(labels.indexOf(labels.find(l=>/^Rafti/.test(l))),labels.indexOf('Magazina / pika e peshimit')+1);
   assert.match(await ev(()=>document.getElementById('wRack').options[0].textContent),/zgjidh më parë magazinën/);
   await setSel('wWarehouse','W1');await p.waitForTimeout(150);
   const o1=await ev(()=>[...document.getElementById('wRack').options].map(o=>o.textContent));assert.equal(o1.length,10);assert.match(o1[0],/automatik/);assert.match(o1[1],/R01 — Rafti i Sokolit/);
   await setSel('wWarehouse','W2');await p.waitForTimeout(150);
   const o2=await ev(()=>[...document.getElementById('wRack').options].map(o=>o.textContent));assert.equal(o2.length,1);assert.match(o2[0],/s’ka rafte/);
   const th=await ev(()=>[...document.querySelectorAll('#modalBody thead th')].map(t=>t.textContent.replace(/\s+/g,' ').trim()));assert.ok(th.includes('Nr. thasëve (ops.)')&&th.includes('Peshorja / ambalazhi (ops.)'),th.join('|'));
 });
 await step('Thasë BOSH + ambalazh BOSH, vetëm bruto 200 → peshimi dhe loti krijohen (neto 200, thasë 0)',async()=>{
   await openForm();await toastsOn();await setSel('wWarehouse','W1');await setSel('wSupplier','S1');await setSel('wProduct','P105');await setRow(0,'','200','');
   const before=await ev(()=>({w:state.weighings.length,l:state.lots.length}));
   await b('Konfirmo & krijo lot').click();await p.waitForTimeout(600);
   const r=await ev(bf=>{let w=state.weighings.at(-1),l=state.lots.at(-1);return{w:state.weighings.length-bf.w,l:state.lots.length-bf.l,bags:w.bags,gross:w.gross,tare:w.tare,net:w.net,status:w.status,rowBags:w.bagRows.map(x=>x.bags),lnet:l.net,lbags:l.bags,lrack:l.rack,toasts:window.__t}},before);
   assert.equal(r.w,1,JSON.stringify(r));assert.equal(r.l,1);assert.equal(r.bags,0);assert.deepEqual(r.rowBags,[0]);assert.equal(r.gross,200);assert.equal(r.tare,0);assert.equal(r.net,200);assert.equal(r.status,'Konfirmuar');assert.equal(r.lnet,200);assert.equal(r.lbags,0);assert.equal(r.lrack,'R1');
 });
 await step('Thasë bosh, bruto 300, ambalazh 3 → OK (neto 297); bruto bosh → refuzohet me mesazh të qartë',async()=>{
   await openForm();await toastsOn();await setSel('wWarehouse','W1');await setSel('wSupplier','S1');await setSel('wProduct','P105');await setRow(0,'','300','3');
   const n0=await ev(()=>state.weighings.length);await b('Konfirmo & krijo lot').click();await p.waitForTimeout(600);
   const r=await ev(n=>({created:state.weighings.length-n,net:state.weighings.at(-1).net,bags:state.weighings.at(-1).bags}),n0);assert.deepEqual(r,{created:1,net:297,bags:0});
   await openForm();await toastsOn();await setSel('wWarehouse','W1');await setSel('wSupplier','S1');await setSel('wProduct','P105');await setRow(0,'4','','1');
   const n1=await ev(()=>state.weighings.length);await b('Konfirmo & krijo lot').click();await p.waitForTimeout(500);
   const r2=await ev(n=>({created:state.weighings.length-n,toasts:window.__t}),n1);assert.equal(r2.created,0);assert.ok(r2.toasts.some(t=>/KG bruto > 0/.test(t)),JSON.stringify(r2.toasts));
   await ev(()=>closeModal());
 });
 await step('Rafti i zgjedhur (R05) kalon te peshimi dhe te loti; etiketa tregon MQ / R05',async()=>{
   await openForm();await setSel('wWarehouse','W1');await p.waitForTimeout(120);await setSel('wRack','R5');await setSel('wSupplier','S2');await setSel('wProduct','P105');await setRow(0,'6','150','1.5');
   await b('Konfirmo & krijo lot').click();await p.waitForTimeout(600);
   const r=await ev(()=>{let w=state.weighings.at(-1),l=state.lots.at(-1);return{wrack:w.rack,lrack:l.rack,lwh:l.warehouse,lid:l.id,ev:state.events.filter(e=>e.type==='Vendosje në raft').at(-1)?.text||''}});
   assert.equal(r.wrack,'R5');assert.equal(r.lrack,'R5');assert.equal(r.lwh,'W1');assert.match(r.ev,/R01 — Rafti i Sokolit → R05 — Rafti 5/);
   await ev(id=>lotCard(id),r.lid);await p.waitForTimeout(500);
   const txt=await p.locator('#printWarehouseLabel').innerText();assert.match(txt,/MQ \/ R05/);
   await close();
 });
 await step('Draft me raft R03 → "✓ Konfirmo & krijo lotin" nga kartela → loti del në R03',async()=>{
   await openForm();await setSel('wWarehouse','W1');await p.waitForTimeout(120);await setSel('wRack','R3');await setSel('wSupplier','S1');await setSel('wProduct','P105');await setRow(0,'','80','');
   await b('Ruaj draft').click();await p.waitForTimeout(500);
   const wid=await ev(()=>{let w=state.weighings.at(-1);return w.status==='Draft'&&w.rack==='R3'?w.id:null});assert.ok(wid,'drafti pa raft');
   await ev(id=>weightCard(id),wid);await p.waitForTimeout(400);await b('✓ Konfirmo & krijo lotin').click();await p.waitForTimeout(600);
   const r=await ev(id=>{let l=state.lots.find(x=>x.weighing===id);return l&&{rack:l.rack,net:l.net,bags:l.bags}},wid);assert.deepEqual(r,{rack:'R3',net:80,bags:0});
   await ev(()=>closeModal());
 });
 await step('Modifikimi i peshimit (Ndrysho): fusha e raftit vjen e para-zgjedhur, ndryshimi R03 → R07 zhvendos lotin',async()=>{
   const wid=await ev(()=>state.weighings.filter(w=>w.rack==='R3').at(-1).id);
   await ev(id=>editWeight(id),wid);await p.waitForTimeout(600);
   assert.equal(await ev(()=>document.getElementById('wRack')?.value),'R3');
   await setSel('wRack','R7');await b('Ruaj ndryshimet').click();await p.waitForTimeout(600);
   const r=await ev(id=>{let w=by('weighings',id),l=state.lots.find(x=>x.weighing===id);return{wrack:w.rack,lrack:l.rack}},wid);assert.deepEqual(r,{wrack:'R7',lrack:'R7'});
   await ev(()=>closeModal());
 });
 await step('Kartela e lotit: "Ndrysho raftin" → vetëm pozicioni ndryshon (sasitë, thasët, stoku të paprekura), ngjarje në historik',async()=>{
   await ev(()=>{go('lots');lotCard('L1')});await p.waitForTimeout(600);
   const names=await ev(()=>[...document.querySelectorAll('#modalFoot button')].map(x=>x.textContent.trim()));assert.ok(names.includes('Ndrysho raftin'),names.join('|'));assert.ok(names.includes('Transfero'));
   const snap=await ev(()=>{let l=by('lots','L1');return{net:l.net,avail:l.availableNet,bags:l.bags,gross:l.gross,moves:(typeof stockMoves==='function'?stockMoves().length:-1),lots:state.lots.length,rack:l.rack}});
   await b('Ndrysho raftin').click();await p.waitForTimeout(400);assert.match(await p.locator('#modalTitle').innerText(),/Ndrysho raftin — B1S01\/1-105-26/);
   await setSel('lrRack','R9');await p.locator('#lrNote').fill('sistemim pas pranimit');await b('Ruaj raftin').click();await p.waitForTimeout(600);
   const after=await ev(()=>{let l=by('lots','L1');return{net:l.net,avail:l.availableNet,bags:l.bags,gross:l.gross,moves:(typeof stockMoves==='function'?stockMoves().length:-1),lots:state.lots.length,rack:l.rack,ev:state.events.at(-1),title:document.getElementById('modalTitle').textContent}});
   assert.equal(after.rack,'R9');assert.equal(after.net,snap.net);assert.equal(after.avail,snap.avail);assert.equal(after.bags,snap.bags);assert.equal(after.gross,snap.gross);assert.equal(after.moves,snap.moves);assert.equal(after.lots,snap.lots);
   assert.equal(after.ev.type,'Vendosje në raft');assert.match(after.ev.text,/R09 — Rafti 9 \(sistemim pas pranimit\)/);assert.match(after.title,/Loti B1S01\/1-105-26/);
   assert.match(await p.locator('#modalBody').innerText(),/Rafti 9/);
   await close();
 });
 await step('Faqja Magazina: loti L1 shfaqet te rafti R09',async()=>{
   await ev(()=>go('warehouse'));await p.waitForTimeout(500);
   const cards=await ev(()=>[...document.getElementById('rackGrid').children].map(c=>c.textContent.replace(/\s+/g,' ')));
   const r9=cards.find(c=>/^R09 — Rafti 9/.test(c)),r1=cards.find(c=>/^R01 — Rafti i Sokolit/.test(c));
   assert.match(r9||'',/1 lote · 1,200 kg/,'R09: '+r9);/* R01 mban vetëm lotet e reja të këtij testi (200 + 297 kg), jo më L1 */assert.match(r1||'',/2 lote · 497 kg/,'R01: '+r1);
 });
 await step('ROLE-USER me Lotet:view por PA Magazina:edit → "Ndrysho raftin" dhe "Transfero" nuk shfaqen; me Magazina:edit shfaqen',async()=>{
   await ev(async()=>{const h=await hashPassword('Prove-2026!');state.users.push({id:'U-WR',username:'wr-user',name:'Magazinier',role:'ROLE-USER',active:true,passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false,rights:{v:2,modules:{lots:['view'],warehouse:['view'],dashboard:['view']}}});save();closeModal();logoutUser()});
   await p.waitForFunction(()=>!!document.getElementById('loginLock'));await p.locator('#loginName').fill('wr-user');await p.locator('#loginPass').fill('Prove-2026!');await p.locator('#loginPass').press('Enter');await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(400);
   await ev(()=>{go('lots');lotCard('L1')});await p.waitForTimeout(700);
   let names=await ev(()=>[...document.querySelectorAll('#modalFoot button')].map(x=>x.textContent.trim()));
   assert.ok(!names.includes('Ndrysho raftin'),names.join('|'));assert.ok(!names.includes('Transfero'),names.join('|'));
   await ev(()=>{closeModal();let u=state.users.find(x=>x.id==='U-WR');u.rights.modules.warehouse=['view','edit'];save()});
   await ev(()=>{go('lots');lotCard('L1')});await p.waitForTimeout(700);
   names=await ev(()=>[...document.querySelectorAll('#modalFoot button')].map(x=>x.textContent.trim()));
   assert.ok(names.includes('Ndrysho raftin'),names.join('|'));assert.ok(names.includes('Transfero'),names.join('|'));
   await ev(()=>closeModal());
 });
 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0)})().catch(e=>{console.error(e);process.exit(1)});
