/* tests/import-upsert-audit.cjs — importi: skip për identikë, update për ndryshime,
   totalet në fund të preview-it për krahasim me Excel-in, template me numra të saktë. */
const {open}=require('./helpers.cjs'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 async function feed(k,csv,name){
  await ev(k=>{const inp=document.getElementById('moduleImportFile')||document.body.appendChild(Object.assign(document.createElement('input'),{id:'moduleImportFile',type:'file',hidden:true}));inp.value='';inp.onchange=()=>{const f=inp.files&&inp.files[0];if(f)parseModuleImport(k,f)}},k);
  await p.locator('#moduleImportFile').setInputFiles({name:name||'import.csv',mimeType:'text/csv',buffer:Buffer.from('\ufeff'+csv)});
  await p.waitForFunction(()=>document.getElementById('modal')?.classList.contains('open')&&/Kontrolli i importit/.test(document.getElementById('modalTitle')?.innerText||''),{},{timeout:8000});
  return ev(()=>({plan:document.querySelector('#modalBody .card')?.innerText||'',body:document.getElementById('modalBody').innerText,rows:window.pendingModuleImport.data.length}));
 }
 async function confirm(){await p.locator('#modalFoot button').filter({hasText:'Konfirmo importin'}).click();await p.waitForTimeout(700)}
 async function closeAll(){await ev(()=>{try{closeModal()}catch(e){}});await p.waitForTimeout(250)}
 await p.waitForTimeout(1200);await closeAll();

 await step('Furnitorë: rresht identik → skip, i ndryshuar → përditësohet, i re → krijohet',async()=>{
  const s=await ev(()=>{const x=state.suppliers[0];return{id:x.id,code:x.code||x.id,name:x.name,nipt:x.nipt||'',phone:x.phone||''}});
  assert.ok(s.code&&s.name);
  const before=await ev(()=>state.suppliers.length);
  const csv='code,name,nipt,phone\n'
   +[s.code,s.name,s.nipt,s.phone].join(',')+'\n'
   +[s.code,s.name+' (i përditësuar)','L99999999X','0699999999'].join(',')+'\n'
   +'F-TEST-UP,Klient Test Upsert,L11111111A,0681111111\n';
  const r=await feed('suppliers',csv);
  assert.match(r.plan,/Plan importi/);
  assert.match(r.plan,/1 të reja/,'të reja: '+r.plan);
  assert.match(r.plan,/1 përditësime/,'përditësime: '+r.plan);
  assert.match(r.plan,/1 pa ndryshim/,'skip: '+r.plan);
  assert.match(r.body,/Përditësimet/);assert.match(r.body,/phone → 0699999999/);
  await confirm();
  const st=await ev(code=>{const a=state.suppliers.filter(x=>(x.code||x.id)===code);return{n:a.length,name:a[0]&&a[0].name,phone:a[0]&&a[0].phone,newOne:state.suppliers.filter(x=>(x.code||x.id)==='F-TEST-UP').length}},s.code);
  assert.equal(st.n,1,'pa dublime për të njëjtin kod');
  assert.equal(st.name,s.name+' (i përditësuar)');
  assert.equal(st.phone,'0699999999');
  assert.equal(st.newOne,1);
  assert.equal(await ev(()=>state.suppliers.length),before+1);
 });

 await step('Ripërsëritja e të njëjtit file: asnjë dublikat, gjithçka skip',async()=>{
  const s=await ev(()=>{const x=state.suppliers.find(x=>x.name==='Klient Test Upsert');return{code:x.code,name:x.name,nipt:x.nipt,phone:x.phone}});
  const before=await ev(()=>state.suppliers.length);
  const r=await feed('suppliers','code,name,nipt,phone\n'+[s.code,s.name,s.nipt,s.phone].join(',')+'\n');
  assert.match(r.plan,/0 të reja/);assert.match(r.plan,/0 përditësime/);assert.match(r.plan,/1 pa ndryshim/);
  await confirm();
  const t=await ev(()=>document.getElementById('toast')?.textContent||'');
  assert.equal(await ev(()=>state.suppliers.length),before,'asnjë regjistrim i ri');
 });

 await step('Pagesat: totalet në fund përputhen me Excel-in (1.234,56 + 0,44 = 1.235,00)',async()=>{
  const sup=await ev(()=>state.suppliers[0].code||state.suppliers[0].id);
  const r=await feed('payments','id,date,supplier,method,amount,currency,exchangeRate\nP-UP-1,2026-09-10,'+sup+',Cash,"1.234,56",ALL,1\nP-UP-2,2026-09-11,'+sup+',Bankë,"0,44",ALL,1\n');
  assert.match(r.body,/TOTALET në fund/);
  assert.ok(/1[.,]235[.,]00/.test(r.body),'totali 1.235,00: '+r.body.slice(r.body.indexOf('TOTALET'),r.body.indexOf('TOTALET')+300));
  await confirm();
  const am=await ev(()=>state.payments.filter(x=>/^P-UP-/.test(x.id)).map(x=>x.amount));
  assert.deepEqual(am,[1234.56,0.44]);
 });

 await step('Pagesat: riimport i njëjtë → 0 të reja, pa dublime',async()=>{
  const sup=await ev(()=>state.suppliers[0].code||state.suppliers[0].id);
  const before=await ev(()=>state.payments.length);
  const r=await feed('payments','id,date,supplier,method,amount,currency,exchangeRate\nP-UP-1,2026-09-10,'+sup+',Cash,"1.234,56",ALL,1\nP-UP-2,2026-09-11,'+sup+',Bankë,"0,44",ALL,1\n');
  assert.match(r.plan,/0 të reja/);assert.match(r.plan,/2 pa ndryshim/);
  await confirm();
  assert.equal(await ev(()=>state.payments.length),before);
 });

 await step('Pagesë e konfirmuar me shumë tjetër → konflikt, nuk mbishkruhet',async()=>{
  await ev(()=>{state.payments.push({id:'P-UP-LOCK',date:'2026-09-12',supplier:state.suppliers[0].id,method:'Cash',amount:100,currency:'ALL',exchangeRate:1,status:'Konfirmuar'});save();render()});
  const sup=await ev(()=>state.suppliers[0].code||state.suppliers[0].id);
  const r=await feed('payments','id,date,supplier,method,amount,currency,exchangeRate\nP-UP-LOCK,2026-09-12,'+sup+',Cash,999,ALL,1\n');
  assert.match(r.plan,/1 konflikte/);
  assert.match(r.body,/Konflikte/);
  await confirm();await closeAll();
  assert.equal(await ev(()=>by('payments','P-UP-LOCK').amount),100,'shuma e mbyllur nuk ndryshon');
  assert.equal(await ev(()=>state.payments.filter(x=>x.id==='P-UP-LOCK').length),1);
 });

 await step('Kontrolli Excel: skedari i krahasimit shkarkohet me TOTALI në fund',async()=>{
  await feed('payments','id,date,supplier,method,amount,currency,exchangeRate\nP-UP-Z,2026-09-15,'+(await ev(()=>state.suppliers[0].code||state.suppliers[0].id))+',Cash,"2.000,00",ALL,1\n');
  const dl=p.waitForEvent('download',{timeout:8000});
  await p.locator('#modalFoot button').filter({hasText:'Excel me totalet'}).click();
  const d=await dl;const buf=fs.readFileSync(await d.path()).toString('latin1');
  assert.match(d.suggestedFilename(),/IMPORT-kontroll-payments-/);
  assert.ok(buf.includes('<v>2000</v>')||buf.includes('<v>2000.0</v>'),'totali numerik në Excel');
  assert.match(await ev(()=>document.getElementById('toast').textContent),/u shkarkua/);
  await ev(()=>{try{commitModuleImport()}catch(e){}});await closeAll();
 });

 await step('Shablloni i shpenzimeve: numrat janë numra në Excel (jo tekst)',async()=>{
  const dl=p.waitForEvent('download',{timeout:8000});
  await ev(()=>professionalImportTemplate('expenses'));
  const d=await dl;const buf=fs.readFileSync(await d.path()).toString('latin1');
  assert.ok(buf.includes('<v>12000</v>'),'12000 si numër');
  assert.ok(!buf.includes('<is><t>12000</t></is>'),'12000 nuk është tekst');
  assert.ok(buf.includes('<v>20</v>'),'20 si numër');
 });

 await step('Shablloni i furnitorëve: numrat numerik (1, 20, 30)',async()=>{
  const dl=p.waitForEvent('download',{timeout:8000});
  await ev(()=>downloadImportTemplate('suppliers'));
  const d=await dl;const buf=fs.readFileSync(await d.path()).toString('latin1');
  ['<v>30</v>','<v>0</v>'].forEach(x=>assert.ok(buf.includes(x),x+' duhet numerik'));
  assert.ok(!/<is><t>30<\/t><\/is>/.test(buf),'30 si tekst');
  const dl2=p.waitForEvent('download',{timeout:8000});
  await ev(()=>downloadImportTemplate('customers'));
  const d2=await dl2;const buf2=fs.readFileSync(await d2.path()).toString('latin1');
  assert.ok(buf2.includes('<v>20</v>'),'TVSH 20 si numër te klientët');
  assert.ok(!/<is><t>20<\/t><\/is>/.test(buf2),'20 si tekst te klientët');
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors.filter(e=>!/Failed to load resource/.test(e)),[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
