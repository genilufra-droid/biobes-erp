/* tests/import-nipt-audit.cjs — importi i palëve si Odoo: NIPT/EORI/adresa/banka/IBAN etj.
   Riprodhon skedarin real të përdoruesit (xlsx me qeliza bosh vetë-mbyllëse) dhe verifikon:
   - gjendja fillestare shkon te openingBalance (jo te city),
   - kolona me vlera NIPT lidhet te nipt/vat edhe kur koka thotë "Shteti",
   - fushat e reja (adresa, banka, IBAN, email…) importohen,
   - produktet vazhdojnë të lexojnë "TVSH (%)". */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 await p.waitForTimeout(1200);
 await ev(()=>{try{closeModal()}catch(e){}});
 // ndërtues xlsx brenda faqes (inlineStr / numra / qeliza bosh vetë-mbyllëse si Excel)
 await ev(()=>{
  const X=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  window.__cell=(ref,v)=>v===''?`<c r="${ref}" s="1"/>`:(typeof v==='number'?`<c r="${ref}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t>${X(v)}</t></is></c>`);
  window.__col=i=>String.fromCharCode(65+i);
  window.__mkXlsx=rows=>{
   const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>window.__cell(window.__col(ci)+(ri+1),v)).join('')}</row>`).join('')}</sheetData></worksheet>`;
   const files=[
    {name:'[Content_Types].xml',data:`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.worksheet+xml"/></Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',data:`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="IMPORT" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`},
    {name:'xl/worksheets/sheet1.xml',data:sheet}];
   const blob=new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   return new File([blob],'furnitore.xlsx',{type:blob.type});
  };
 });

 await step('Skedari real i përdoruesit: NIPT→nipt, gjendja→openingBalance (jo city), monedha→openingCurrency',async()=>{
  await ev(async()=>{const f=window.__mkXlsx([
   ['Kodi','Emërtimi','Shteti','Qyteti','Telefoni','Gjendja fillestare','Monedha e gjendjes','Kursi i gjendjes'],
   ['1','ADEM ALI STANA','L93708131V','','',130220,'ALL',''],
   ['6','ALBAN BEDULI','M33828933P','','',-121430,'ALL',''],
   ['4','AFRIM STRANA','M54011032J','','',675740,'ALL','']
  ]);await parseModuleImport('suppliers',f)});
  await p.waitForTimeout(300);
  const r=await ev(()=>{const q=window.pendingModuleImport;return{k:q&&q.k,d:q?q.data.slice(0,3).map(x=>x.data):null,preview:(document.getElementById('modalBody')||{}).innerText||''}});
  assert.equal(r.k,'suppliers');
  const a=r.d[0],b=r.d[1];
  assert.equal(a.nipt,'L93708131V','NIPT nuk u lidh: '+JSON.stringify(a));
  assert.equal(a.country,'','country duhet bosh (vlerat ishin NIPT)');
  assert.equal(a.city,'','city duhet bosh');
  assert.equal(a.phone,'');
  assert.equal(a.openingBalance,'130220','gjendja shkoi gabim: '+a.openingBalance);
  assert.equal(a.openingCurrency,'ALL');
  assert.equal(b.openingBalance,'-121430','negativja me kllapa: '+b.openingBalance);
  assert.match(r.preview,/NIPT|nipt/,'preview s’ka kolonën NIPT');
 });

 await step('Konfirmimi: furnitori ruhet me nipt + openingBalance numër',async()=>{
  await ev(()=>commitModuleImport());await p.waitForTimeout(300);
  const s=await ev(()=>{const x=state.suppliers.find(y=>y.code==='1');return x?{nipt:x.nipt,ob:x.openingBalance,name:x.name,country:x.country||'',cur:x.openingCurrency}:null});
  assert.ok(s,'furnitori nuk u importua');
  assert.equal(s.nipt,'L93708131V');
  assert.equal(s.ob,130220);
  assert.equal(s.country,'');
  assert.equal(s.cur,'ALL');
 });

 await step('Template i pasur (si Odoo): të gjitha fushat lidhen dhe importohen',async()=>{
  await ev(async()=>{const f=window.__mkXlsx([
   ['Kodi','Emri','NIPT','EORI','Kontakti','Adresa','Qarku / Zona','Qyteti','Shteti','Tel','E-mail','Website','Banka','IBAN','Monedha','Afati i pagesës'],
   ['F-900','Furnitor Test Shpk','L12345678A','AL123456789','Arben B.','Rr. e Durrësit 12','Tiranë','Tiranë','Shqipëri','0691234567','info@shembull.al','https://shembull.al','Banka A','AL47212110090000000235698741','ALL','30']
  ]);await parseModuleImport('suppliers',f)});
  await p.waitForTimeout(250);
  const d=await ev(()=>window.pendingModuleImport.data[0].data);
  assert.equal(d.nipt,'L12345678A');assert.equal(d.eori,'AL123456789');assert.equal(d.contact,'Arben B.');
  assert.equal(d.address,'Rr. e Durrësit 12');assert.equal(d.region,'Tiranë');assert.equal(d.city,'Tiranë');
  assert.equal(d.country,'Shqipëri');assert.equal(d.phone,'0691234567');assert.equal(d.email,'info@shembull.al');
  assert.equal(d.website,'https://shembull.al');assert.equal(d.bank,'Banka A');
  assert.equal(d.iban,'AL47212110090000000235698741');assert.equal(d.currency,'ALL');assert.equal(d.paymentTerms,'30');
  await ev(()=>commitModuleImport());await p.waitForTimeout(250);
  const s=await ev(()=>{const x=state.suppliers.find(y=>y.code==='F-900');return x&&{n:x.nipt,b:x.bank,i:x.iban,r:x.region}});
  assert.equal(s.i,'AL47212110090000000235698741');assert.equal(s.b,'Banka A');
 });

 await step('Klientët: NIPT te vat (sniff nga "Shteti"), adresa + IBAN lidhen',async()=>{
  await ev(async()=>{const f=window.__mkXlsx([
   ['Kodi','Emërtimi','Shteti','Adresa','IBAN','Telefoni','Gjendja fillestare','Monedha e gjendjes'],
   ['K-77','Klient Test Sha','L84806531N','Rr. e Kavajës 8','AL212110090000000123456789','0695551234',250000,'ALL']
  ]);await parseModuleImport('customers',f)});
  await p.waitForTimeout(250);
  const d=await ev(()=>window.pendingModuleImport.data[0].data);
  assert.equal(d.vat,'L84806531N','vat/NIPT: '+JSON.stringify(d));
  assert.equal(d.country,'');
  assert.equal(d.address,'Rr. e Kavajës 8');
  assert.equal(d.iban,'AL212110090000000123456789');
  assert.equal(d.phone,'0695551234');
  assert.equal(d.openingBalance,'250000');
  await ev(()=>commitModuleImport());await p.waitForTimeout(250);
  const c=await ev(()=>{const x=state.customers.find(y=>y.code==='K-77');return x&&{v:x.vat,ob:x.openingBalance,i:x.iban}});
  assert.equal(c.v,'L84806531N');assert.equal(c.ob,250000);assert.equal(c.i,'AL212110090000000123456789');
 });

 await step('Regresion: produktet lexojnë "TVSH (%)"; furnitorët me kokë eksplicite "NIPT"',async()=>{
  await ev(async()=>{const csv=new File(['Kodi,Emërtimi,Njësia,Çmimi i blerjes,Çmimi i shitjes,Kategoria,TVSH (%)\nP-REG,Artikull regresion,kg,100,150,Gjethe,20'],'prod.csv',{type:'text/csv'});await parseModuleImport('products',csv)});
  await p.waitForTimeout(200);
  const d=await ev(()=>window.pendingModuleImport.data[0].data);
  assert.equal(d.purchasePrice,'100');assert.equal(d.salePrice,'150');assert.equal(d.name,'Artikull regresion');
  await ev(async()=>{const csv2=new File(['Kodi,Emërtimi,NIPT,Telefoni\nF-901,Furnitor CSV,L54611576F,069111222'],'sup.csv',{type:'text/csv'});await parseModuleImport('suppliers',csv2)});
  await p.waitForTimeout(200);
  const d2=await ev(()=>window.pendingModuleImport.data[0].data);
  assert.equal(d2.nipt,'L54611576F','nipt nga koka eksplicite');
  assert.equal(d2.phone,'069111222');
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
