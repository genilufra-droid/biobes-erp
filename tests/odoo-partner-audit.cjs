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

 await step('Formulari "Furnitor i ri": fusha Odoo, grupe, etiketa majuskule, të njëjtat fusha si klienti',async()=>{
  await ev(()=>entityForm('supplier'));await p.waitForTimeout(500);
  const r=await ev(()=>{const b=document.getElementById('modalBody');return{
   cls:b.classList.contains('od-form'),banner:!!b.querySelector('.od-pav'),
   secs:[...b.querySelectorAll('.od-sec')].map(x=>x.innerText),
   labels:[...b.querySelectorAll('.field label')].map(x=>x.innerText),
   under:(()=>{const i=document.getElementById('fNipt');const cs=getComputedStyle(i);return{border:cs.borderBottomWidth,bt:cs.borderTopWidth,radius:cs.borderRadius}})(),
   ids:['fNipt','fEori','fContact','fEmail','fAddress','fCurrency','fTerms','fActive','fOpening'].map(x=>!!document.getElementById(x))}});
  assert.ok(r.cls,'klasa od-form');assert.ok(r.banner,'banner-i i avatarit');
  assert.deepEqual(r.secs,['TË DHËNAT E PALËS','ADRESA DHE KONTAKTI','FATURIMI DHE FINANCAT','GJENDJA FILLESTARE (HAPJA E BILANCIT)']);
  ['KODI','EMRI / KOMPANIA','NIPT / VAT','EORI','PERSONI I KONTAKTIT','TELEFONI','EMAIL','WEBSITE','ADRESA','QYTETI','QARKU / ZONA','SHTETI','MONEDHA E FATURIMIT','AFATI I PAGESËS (DITË)','STATUSI'].forEach(l=>assert.ok(r.labels.includes(l),'mungon '+l));
  assert.equal(r.under.border,'1px','fusha me vijë poshtë (si Odoo)');assert.equal(r.under.bt,'0px');assert.equal(r.under.radius,'0px');
  assert.ok(r.ids.every(Boolean),'fusha të reja në formular');
 });

 await step('Ruajtja e formularit të ri ruan TË GJITHA fushat (jo vetëm 7)',async()=>{
  const code='OD-'+Date.now().toString().slice(-5);
  await p.locator('#fCode').fill(code);await p.locator('#fName').fill('Odoo Furnitor Shpk');
  await p.locator('#fNipt').fill('L77777777C');await p.locator('#fEori').fill('AL999888777');
  await p.locator('#fContact').fill('Arben Kontakt');await p.locator('#fEmail').fill('arben@odoo.al');
  await p.locator('#fAddress').fill('Rr. Kavajës 77');await p.locator('#fCity').fill('Tirana');
  await p.locator('#fCountry').fill('Albania');await p.locator('#fPhone').fill('0691112223');
  await p.locator('#fCurrency').fill('EUR');await p.locator('#fTerms').fill('15');
  await p.locator('#modalFoot button').filter({hasText:'Ruaj'}).first().click();
  await p.waitForTimeout(700);
  const s=await ev(cd=>{const x=state.suppliers.find(y=>y.code===cd);return x?{nipt:x.nipt,eori:x.eori,contact:x.contact,email:x.email,address:x.address,city:x.city,country:x.country,phone:x.phone,currency:x.currency,paymentTerms:x.paymentTerms}:null},code);
  assert.ok(s,'furnitori nuk u ruajt');
  assert.deepEqual(s,{nipt:'L77777777C',eori:'AL999888777',contact:'Arben Kontakt',email:'arben@odoo.al',address:'Rr. Kavajës 77',city:'Tirana',country:'Albania',phone:'0691112223',currency:'EUR',paymentTerms:15});
  assert.equal(await ev(cd=>!!by('suppliers',state.suppliers.find(y=>y.code===cd).id),code),true,'regjistrimi u ruajt');
 });

 await step('Formulari "Klient i ri": i njëjti grup fushash, ruajtja ruan të gjitha',async()=>{
  const code='ODC-'+Date.now().toString().slice(-5);
  await ev(()=>customerForm());await p.waitForTimeout(500);
  const labs=await ev(()=>[...document.querySelectorAll('#modalBody .field label')].map(x=>x.innerText));
  ['KODI','EMRI / KOMPANIA','NIPT / VAT','EORI','PERSONI I KONTAKTIT','TELEFONI','EMAIL','WEBSITE','ADRESA','QYTETI','QARKU / ZONA','SHTETI','MONEDHA E FATURIMIT','AFATI I PAGESËS (DITË)','STATUSI'].forEach(l=>assert.ok(labs.includes(l),'klienti: mungon '+l));
  assert.equal(labs.filter(l=>!/GJENDJA FILLESTARE|KUPTIMI I GJENDJES|MONEDHA E GJENDJES|KURSI \(1/.test(l)).length,15,'klienti duhet të ketë të njëjtat 15 fusha');
  await p.locator('#cfCode').fill(code);await p.locator('#cfName').fill('Odoo Klient GmbH');
  await p.locator('#cfVat').fill('DE811234567');await p.locator('#cfContact').fill('Hans Müller');
  await p.locator('#cfPhone').fill('+4915112233445');await p.locator('#cfEmail').fill('hans@odoo.de');
  await p.locator('#cfWebsite').fill('https://odoo.de');await p.locator('#cfAddress').fill('Hauptstrasse 5');
  await p.locator('#cfCity').fill('München');await p.locator('#cfRegion').fill('Bavaria');
  await p.locator('#modalFoot button').filter({hasText:'Ruaj'}).first().click();
  await p.waitForTimeout(700);
  const c=await ev(cd=>{const x=(state.customers||[]).find(y=>y.code===cd);return x?{vat:x.vat,contact:x.contact,phone:x.phone,email:x.email,website:x.website,address:x.address,city:x.city,region:x.region}:null},code);
  assert.ok(c,'klienti nuk u ruajt');
  assert.deepEqual(c,{vat:'DE811234567',contact:'Hans Müller',phone:'+4915112233445',email:'hans@odoo.de',website:'https://odoo.de',address:'Hauptstrasse 5',city:'München',region:'Bavaria'});
 });

 await step('Ndrysho furnitorin: fushat e ruajtura shfaqen të plotësuara në formular',async()=>{
  const id=await ev(()=>state.suppliers.find(x=>x.code&&x.code.startsWith('OD-')).id);
  await ev(i=>supplierEditForm(i),id);await p.waitForTimeout(500);
  const v=await ev(()=>({city:$val('sefCity'),phone:$val('sefPhone'),website:$val('sefWebsite'),email:document.getElementById('sefEmail')?.value,address:document.getElementById('sefAddress')?.value,currency:document.getElementById('sefCurrency')?.value}));
  assert.equal(v.phone,'0691112223');assert.equal(v.email,'arben@odoo.al');assert.equal(v.address,'Rr. Kavajës 77');assert.equal(v.currency,'EUR');
  await p.locator('#sefPhone').fill('0699998887');
  await p.locator('#modalFoot button').filter({hasText:'Ruaj'}).first().click();
  await p.waitForTimeout(700);
  assert.equal(await ev(i=>by('suppliers',i).phone,id),'0699998887','telefoni i riplotësuar u ruajt');
  const keep=await ev(i=>({email:by('suppliers',i).email,city:by('suppliers',i).city}),id);
  assert.equal(keep.email,'arben@odoo.al');assert.equal(keep.city,'Tirana','fushat e tjera nuk u fshinë');
 });

 await step('KREATE + EDITIM: të pesta formularët kanë të njëjtat 15 fusha (furnitor = klient)',async()=>{
  const ids=await ev(()=>({s:state.suppliers[0].id,c:(state.customers||[])[0].id}));
  const CANON=['KODI','EMRI / KOMPANIA','NIPT / VAT','EORI','PERSONI I KONTAKTIT','TELEFONI','EMAIL','WEBSITE','ADRESA','QYTETI','QARKU / ZONA','SHTETI','MONEDHA E FATURIMIT','AFATI I PAGESËS (DITË)','STATUSI'];
  const dump=async(fn,arg)=>{
   await ev(()=>{try{closeModal()}catch(e){}});await p.waitForTimeout(120);
   await ev(fn,arg);await p.waitForTimeout(500);
   return ev(()=>{const b=document.getElementById('modalBody');
    return{od:b.classList.contains('od-form'),labels:[...b.querySelectorAll('.field label')].map(x=>x.innerText),
     secs:[...b.querySelectorAll('.od-sec')].length,order:[...b.querySelectorAll('.field input,.field select,.field textarea')].map(x=>x.id).filter(Boolean)}});
  };
  const paths=[['Furnitor i ri',()=>entityForm('supplier')],['Ndrysho furnitorin (e)',i=>editEntity('supplier',i),ids.s],
   ['Ndrysho furnitorin (sef)',i=>supplierEditForm(i),ids.s],['Klient i ri',()=>customerForm()],['Ndrysho klientin',i=>customerForm(i),ids.c]];
  const results=[];
  for(const [name,fn,arg] of paths){const r=await dump(fn,arg);results.push([name,r]);}
  results.forEach(([n,r])=>{
   assert.ok(r.od,n+': klasa od-form');assert.equal(r.secs,4,n+': 4 grupe');
   assert.deepEqual(r.labels.slice(0,15),CANON,n+': 15 fushat kanonike në të njëjtin rend');
   const SUF={nipt:'Nipt',eori:'Eori',contact:'Contact',email:'Email',website:'Website',address:'Address',city:'City',region:'Region',country:'Country',currency:'Currency',terms:'Terms',active:'Active',opening:'Opening'};
   Object.keys(SUF).forEach(k=>{
    const id=r.order.filter(x=>/^(f|e|sef|cf)(Nipt|Vat|Eori|Contact|Email|Website|Address|City|Region|Country|Currency|Terms|Active|Opening)$/.test(x)&&(k==='nipt'?/(Nipt|Vat)$/.test(x):x.endsWith(SUF[k])));
    assert.ok(id.length>0,n+': mungon fusha '+k);
   });
  });
  await ev(()=>{try{closeModal()}catch(e){}});
 });

 await step('Ruajtja në EDITIM ruan Website/Qyteti/Shteti (të dyja palët)',async()=>{
  const code='ODE-'+Date.now().toString().slice(-5);
  await ev(()=>customerForm());await p.waitForTimeout(500);
  await p.locator('#cfCode').fill(code);await p.locator('#cfName').fill('Klient Edit Test');
  await p.locator('#cfWebsite').fill('https://edit.example');await p.locator('#cfCity').fill('Durrës');await p.locator('#cfCountry').fill('Shqipëri');
  await p.locator('#modalFoot button').filter({hasText:'Ruaj'}).first().click();await p.waitForTimeout(700);
  const id=await ev(c=>{const x=(state.customers||[]).find(y=>y.code===c);return x?x.id:null},code);
  assert.ok(id,'klienti u krijua');
  await ev(i=>customerForm(i),id);await p.waitForTimeout(500);
  await p.locator('#cfCity').fill('Tiranë');await p.locator('#cfWebsite').fill('https://edit2.example');
  await p.locator('#modalFoot button').filter({hasText:'Ruaj'}).first().click();await p.waitForTimeout(700);
  const after=await ev(i=>{const x=by('customers',i);return{city:x.city,country:x.country,website:x.website}},id);
  assert.deepEqual(after,{city:'Tiranë',country:'Shqipëri',website:'https://edit2.example'});
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors.filter(e=>!/Failed to load resource/.test(e)),[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
