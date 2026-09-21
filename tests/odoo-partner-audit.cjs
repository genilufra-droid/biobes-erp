/* tests/odoo-partner-audit.cjs — kartela e furnitorit dhe e klientit në stil Odoo
   (avatar, shënime, smart buttons, formular me etiketa të vogla) + import me tituj Odoo/anglisht. */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
const LABELS=['KODI','NIPT / VAT','EORI','PERSONI I KONTAKTIT','TELEFONI','EMAIL','WEBSITE','BANKA','IBAN','ADRESA','QYTETI','SHTETI','MONEDHA','AFATI I PAGESËS'];
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 async function closeAll(){await ev(()=>{try{closeModal()}catch(e){}});await p.waitForTimeout(250)}
 await p.waitForTimeout(1200);await closeAll();

 await step('Furnitori: sheet-i Odoo shfaqet (avatar, emër, shënime, smart buttons, fusha)',async()=>{
  const s=await ev(()=>{const x=state.suppliers[0];state.payments.push({id:'MP-OD1',date:'2026-09-02',supplier:x.id,method:'Cash',amount:500,currency:'ALL',exchangeRate:1,status:'Konfirmuar'});save();supplierCard(x.id);return{id:x.id,name:x.name,code:x.code||x.id}});
  await p.waitForTimeout(700);
  const r=await ev(()=>{const s=document.querySelector('#modalBody .od-sheet');if(!s)return null;return{
   avatar:s.querySelector('.od-avatar').innerText,name:s.querySelector('.od-name').innerText,
   badges:[...s.querySelectorAll('.od-badge')].map(x=>x.innerText.trim().toUpperCase()),
   smart:[...s.querySelectorAll('.od-smart button small')].map(x=>x.innerText.trim()),
   labels:[...s.querySelectorAll('.od-f label')].map(x=>x.innerText.trim()),
   hasTable:!!document.querySelector('#modalBody table')}});
  assert.ok(r,'sheet-i Odoo mungon te furnitori');
  const ini=s.name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  assert.equal(r.avatar,ini);
  assert.equal(r.name,s.name);
  assert.ok(r.badges.includes('FURNITOR'));assert.ok(r.badges.includes(s.code.toUpperCase()));assert.ok(r.badges.includes('AKTIV'));
  assert.deepEqual(r.smart,['Peshime','Fatura blerjeje','Pagesa','Gjendja (ALL)']);
  assert.deepEqual(r.labels,LABELS);
  assert.equal(r.hasTable,true,'përmbajtja e mëparshme (libri i palës) mbetet');
  await closeAll();
 });

 await step('Klienti: i njëjti sheet, i njëjti rend fushash (njësoj si furnitori)',async()=>{
  await ev(()=>customerCard(state.customers[0].id));await p.waitForTimeout(700);
  const r=await ev(()=>{const s=document.querySelector('#modalBody .od-sheet');if(!s)return null;return{
   badges:[...s.querySelectorAll('.od-badge')].map(x=>x.innerText.trim().toUpperCase()),
   smart:[...s.querySelectorAll('.od-smart button small')].map(x=>x.innerText.trim()),
   labels:[...s.querySelectorAll('.od-f label')].map(x=>x.innerText.trim())}});
  assert.ok(r,'sheet-i Odoo mungon te klienti');
  assert.ok(r.badges.includes('KLIENT'));
  assert.deepEqual(r.labels,LABELS,'rendi i fushave duhet të jetë i njëjti si te furnitori');
  assert.deepEqual(r.smart,['Fatura shitjeje','Arkëtime','Kthime','Gjendja e hapur']);
  await closeAll();
 });

 await step('Smart button: klikimi hap modulin dhe filtron me emrin e palës',async()=>{
  const nm=await ev(()=>{supplierCard(state.suppliers[0].id);return state.suppliers[0].name});
  await p.waitForTimeout(650);
  await p.locator('#modalBody .od-smart button').filter({hasText:'Pagesa'}).first().click();
  await p.waitForTimeout(750);
  assert.equal(await ev(()=>page),'payments');
  assert.equal(await ev(()=>document.querySelector('#main .module-live-search input')?.value),nm);
  assert.equal(await ev(()=>!!document.querySelector('#modal.open')),false,'kartela u mbyll');
 });

 await step('Import me tituj Odoo/anglisht (Name, Street, City, Country, Tax ID) njihet dhe ruhet',async()=>{
  await ev(()=>{const inp=document.getElementById('moduleImportFile')||document.body.appendChild(Object.assign(document.createElement('input'),{id:'moduleImportFile',type:'file',hidden:true}));inp.value='';inp.onchange=()=>{const f=inp.files&&inp.files[0];if(f)parseModuleImport('suppliers',f)}});
  const csv='Name,Phone,Email,Street,City,Country,Tax ID,Code\nAgro Odoo Shpk,0692222333,odoo@agro.al,"Rr. Dritan Hoxha 5",Tirana,Albania,L55555555B,ODOO-1\n';
  await p.locator('#moduleImportFile').setInputFiles({name:'odoo-partner.csv',mimeType:'text/csv',buffer:Buffer.from('\ufeff'+csv)});
  await p.waitForFunction(()=>document.getElementById('modal')?.classList.contains('open')&&/Kontrolli i importit/.test(document.getElementById('modalTitle')?.innerText||''),{},{timeout:8000});
  const plan=await ev(()=>document.querySelector('#modalBody .card').innerText);
  assert.match(plan,/1 të reja/);
  await p.locator('#modalFoot button').filter({hasText:'Konfirmo importin'}).click();
  await p.waitForTimeout(800);
  const s=await ev(()=>{const x=state.suppliers.find(y=>y.name==='Agro Odoo Shpk');return x?{code:x.code,phone:x.phone,email:x.email,address:x.address,city:x.city,country:x.country,nipt:x.nipt}:null});
  assert.ok(s,'furnitori i importuar me tituj Odoo mungon');
  assert.equal(s.code,'ODOO-1');assert.equal(s.phone,'0692222333');assert.equal(s.email,'odoo@agro.al');
  assert.equal(s.address,'Rr. Dritan Hoxha 5');assert.equal(s.city,'Tirana');assert.equal(s.country,'Albania');assert.equal(s.nipt,'L55555555B');
  await closeAll();
 });

 await step('Ripërsëritja e skedarit Odoo: skip, pa dublime',async()=>{
  const before=await ev(()=>state.suppliers.length);
  await ev(()=>{const inp=document.getElementById('moduleImportFile');inp.value='';inp.onchange=()=>{const f=inp.files&&inp.files[0];if(f)parseModuleImport('suppliers',f)}});
  const csv='Name,Phone,Email,Street,City,Country,Tax ID,Code\nAgro Odoo Shpk,0692222333,odoo@agro.al,"Rr. Dritan Hoxha 5",Tirana,Albania,L55555555B,ODOO-1\n';
  await p.locator('#moduleImportFile').setInputFiles({name:'odoo-partner.csv',mimeType:'text/csv',buffer:Buffer.from('\ufeff'+csv)});
  await p.waitForFunction(()=>/Kontrolli i importit/.test(document.getElementById('modalTitle')?.innerText||''),{},{timeout:8000});
  const plan=await ev(()=>document.querySelector('#modalBody .card').innerText);
  assert.match(plan,/0 të reja/);assert.match(plan,/1 pa ndryshim/);
  await p.locator('#modalFoot button').filter({hasText:'Konfirmo importin'}).click();
  await p.waitForTimeout(700);
  assert.equal(await ev(()=>state.suppliers.length),before);
  await closeAll();
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors.filter(e=>!/Failed to load resource/.test(e)),[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
