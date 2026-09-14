/* ==========================================================================
   tests/opening-balances-audit.cjs — gjendjet fillestare (opening balances)
   --------------------------------------------------------------------------
   Prova kalon nëpër UI-n reale (desktop + telefon): formularët e furnitorit
   dhe klientit (i ri / ndrysho), importi Excel me kolonat opsionale
   "Gjendja fillestare / Monedha e gjendjes / Kursi i gjendjes", template-i
   i vjetër pa këto kolona, kartelat/ditarët me rreshtin "Gjendje fillestare",
   tab-i Kontabiliteti → Gjendjet fillestare, veprimi "Bilanci i hapjes"
   (idempotent, rigjenerim, postim, bilanci verifikues "Fillestare"),
   raportet Alpha (kodi i paprekur, të dhënat rrjedhin) dhe të drejtat e
   ROLE-USER pa "Paraja dhe kontabiliteti".
   Izolimi: helpers.cjs ndalon çdo kërkesë HTTPS → asnjë kontakt me API-n.
   Rezultatet: .audit/opening-{desktop,mobile}.json (jashtë Git).
   ========================================================================== */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
fs.mkdirSync('.audit',{recursive:true});

function xlsxBuffer(headers,rows){
 // xlsx minimal STORED (pa kompresim) — i njëjti format që lexon readImportRows/unzipXlsx
 const enc=s=>Buffer.from(s,'utf8');
 const crcTable=(()=>{let t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
 const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=crcTable[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
 const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const col=i=>{let s='';i++;while(i>0){let m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
 const row=(r,i)=>`<row r="${i+1}">${r.map((v,j)=>`<c r="${col(j)}${i+1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`;
 const sheet=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${[headers,...rows].map(row).join('')}</sheetData></worksheet>`;
 const files=[
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Import" sheetId="1" r:id="rId1"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml',sheet]];
 let parts=[],central=[],offset=0;
 for(const [name,data] of files){const nb=enc(name),db=enc(data),crc=crc32(db);const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0,6);lh.writeUInt16LE(0,8);lh.writeUInt16LE(0,10);lh.writeUInt16LE(0,12);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(db.length,18);lh.writeUInt32LE(db.length,22);lh.writeUInt16LE(nb.length,26);lh.writeUInt16LE(0,28);
  const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(0,8);cd.writeUInt16LE(0,10);cd.writeUInt16LE(0,12);cd.writeUInt16LE(0,14);cd.writeUInt32LE(crc,16);cd.writeUInt32LE(db.length,20);cd.writeUInt32LE(db.length,24);cd.writeUInt16LE(nb.length,28);cd.writeUInt16LE(0,30);cd.writeUInt16LE(0,32);cd.writeUInt16LE(0,34);cd.writeUInt16LE(0,36);cd.writeUInt32LE(0,38);cd.writeUInt32LE(offset,42);
  parts.push(lh,nb,db);central.push(cd,nb);offset+=lh.length+nb.length+db.length}
 const cdBuf=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cdBuf.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
 return Buffer.concat([...parts,cdBuf,end]);
}

(async()=>{
 let totalPass=0,totalSteps=0;
 for(const mobile of [false,true]){
  const{browser,page:p,errors,close}=await open(mobile);
  const results=[];const tag=mobile?'mobile':'desktop';
  const b=name=>p.locator('#modal').getByRole('button',{name,exact:true});
  const ev=(fn,arg)=>p.evaluate(fn,arg);
  async function step(name,fn){totalSteps++;try{await fn();await p.waitForTimeout(150);assert.deepEqual(errors,[]);results.push({name,status:'PASS'});totalPass++;console.log('PASS',tag,name)}catch(e){results.push({name,status:'FAIL',error:String(e&&e.stack||e).slice(0,1200)});console.log('FAIL',tag,name,'\n   ',String(e&&e.message||e).slice(0,600));errors.length=0;try{await ev(()=>closeModal())}catch(_){}}}
  const hasAmount=(text,n)=>{const digits=String(n);const re=new RegExp(digits.replace(/\B(?=(\d{3})+(?!\d))/g,'[\\s.,\\u00a0\\u202f]?')+'(?:[.,]\\d+)?\\s*ALL');return re.test(text)};
  const importFile=async(k,headers,rows)=>{await ev(k=>{window.__toastLog=[];const ot=window.toast;if(!ot.__wrapped){window.toast=function(m){__toastLog.push(String(m));return ot.apply(this,arguments)};window.toast.__wrapped=true}pickModuleImport(k)},k);await p.locator('#moduleImportFile').setInputFiles({name:'import.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsxBuffer(headers,rows)});await p.waitForTimeout(500)};
  try{
   await step('Blloku aktiv, data e hapjes = sot kur s\'është ruajtur, tab-i i ri te Kontabiliteti',async()=>{
     const info=await ev(()=>({v:window.__biobesOpening&&window.__biobesOpening.version,d:obDate(),today:new Date().toISOString().slice(0,10),schemaS:IMPORT_SCHEMAS.suppliers.slice(),schemaC:IMPORT_SCHEMAS.customers.slice()}));
     assert.equal(info.v,'biobes-opening-balances-v1');assert.equal(info.d,info.today);
     assert.deepEqual(info.schemaS,['code','name','country','city','phone','openingBalance','openingCurrency','openingRate']);
     assert.deepEqual(info.schemaC,['code','name','country','vat','city','address','openingBalance','openingCurrency','openingRate']);
     await ev(()=>go('accounting'));await p.locator('#main .accounting-tabs button',{hasText:'Gjendjet fillestare'}).click();await p.waitForTimeout(200);
     assert.ok(await p.locator('#obDate').isVisible());assert.ok((await p.locator('#main').innerText()).includes('Data e hapjes së BIOBES ERP'));
   });
   await step('Ruaj datën e hapjes (go-live) 2026-03-01 — vlen kudo',async()=>{
     await p.locator('#obDate').fill('2026-03-01');await p.locator('#main button',{hasText:'Ruaj datën e hapjes'}).click();await p.waitForTimeout(250);
     assert.equal(await ev(()=>state.openingBalances.date),'2026-03-01');assert.equal(await ev(()=>obDate()),'2026-03-01');
     await ev(()=>{configData();state.exchangeRates=[{id:'R-OB',date:'2026-02-28',currency:'EUR',rate:100},{id:'R-OB2',date:'2026-06-01',currency:'EUR',rate:97}];save()});assert.equal(await ev(()=>saleRateDefault('EUR','2026-03-01')),100);
   });
   await step('Furnitor i ri me gjendje fillestare 150 000 ALL (detyrim) përmes formularit',async()=>{
     await ev(()=>go('suppliers'));await p.locator('#main').getByRole('button',{name:'+ Shto furnitor',exact:true}).click();
     assert.ok(await p.locator('#fOpening').isVisible());await p.locator('#fCode').fill('OB-S1');await p.locator('#fName').fill('Furnitor Hapje');await p.locator('#fOpening').fill('150000');
     await b('Ruaj').click();await p.waitForTimeout(250);
     const s=await ev(()=>state.suppliers.find(x=>x.code==='OB-S1'));assert.ok(s);assert.equal(s.openingBalance,150000);assert.equal(s.openingCurrency,'ALL');
     assert.equal(await ev(id=>supplierBalance(id),s.id),150000);
     const raw=await ev(id=>supplierBalance(id,true),s.id);assert.equal(raw.balance,150000);
   });
   await step('Ndrysho furnitorin nga kartela: parapagim 1 000 EUR × 100 → −100 000 ALL; të tjerat ruhen',async()=>{
     const s=await ev(()=>state.suppliers.find(x=>x.code==='OB-S1'));
     await ev(id=>supplierCard(id),s.id);await p.waitForTimeout(200);
     const cardText=await p.locator('#modalBody').innerText();assert.ok(cardText.includes('Gjendje fillestare'),'kartela pa rreshtin e hapjes');assert.ok(cardText.includes('2026-03-01'));
     await b('✎ Ndrysho').click();await p.waitForTimeout(200);assert.ok(await p.locator('#sefOpening').isVisible());
     assert.equal(await p.locator('#sefOpening').inputValue(),'150000');assert.equal(await p.locator('#sefOpeningSide').inputValue(),'debt');
     await p.locator('#sefPhone').fill('069000');await p.locator('#sefOpening').fill('1000');
     await ev(()=>{let el=document.getElementById('sefOpeningSide');el.value='advance';el.dispatchEvent(new Event('change',{bubbles:true}))});
     await ev(()=>{let el=document.getElementById('sefOpeningCur');el.value='EUR';el.dispatchEvent(new Event('change',{bubbles:true}))});
     assert.equal(await p.locator('#sefOpeningRate').inputValue(),'100');
     await b('Ruaj').click();await p.waitForTimeout(300);
     const s2=await ev(()=>state.suppliers.find(x=>x.code==='OB-S1'));assert.equal(s2.phone,'069000');assert.equal(s2.openingBalance,-100000);assert.equal(s2.openingAmount,-1000);assert.equal(s2.openingCurrency,'EUR');assert.equal(s2.openingRate,100);
     assert.equal(await ev(id=>supplierBalance(id),s2.id),-100000);
     const txt=await p.locator('#modalBody').innerText();assert.ok(txt.includes('Gjendje fillestare')&&txt.includes('EUR'),'kartela pas ndryshimit');
   });
   await step('Ndrysho furnitorin nga lista (editEntity) — fusha ekziston, kthimi në 0 pastron valutën',async()=>{
     const s=await ev(()=>state.suppliers.find(x=>x.code==='OB-S1'));
     await ev(id=>editEntity('supplier',id),s.id);await p.waitForTimeout(150);assert.ok(await p.locator('#eOpening').isVisible());
     assert.equal(await p.locator('#eOpeningSide').inputValue(),'advance');assert.equal(await p.locator('#eOpeningCur').inputValue(),'EUR');
     await p.locator('#eOpening').fill('0');await b('Ruaj ndryshimet').click();await p.waitForTimeout(250);
     const s2=await ev(()=>state.suppliers.find(x=>x.code==='OB-S1'));assert.equal(s2.openingBalance,0);assert.equal(s2.openingCurrency,undefined);
     await ev(id=>editEntity('supplier',id),s.id);await p.locator('#eOpening').fill('150000');await b('Ruaj ndryshimet').click();await p.waitForTimeout(250);
     assert.equal(await ev(()=>state.suppliers.find(x=>x.code==='OB-S1').openingBalance),150000);
   });
   await step('Klient i ri me gjendje 2 500 EUR (kërkesë) → 250 000 ALL; kartela & lista e klientëve e tregojnë',async()=>{
     await ev(()=>go('customers'));await p.locator('#main').getByRole('button',{name:'+ Shto klient',exact:true}).click();
     assert.ok(await p.locator('#cfOpening').isVisible());await p.locator('#cfCode').fill('OB-C1');await p.locator('#cfName').fill('Klient Hapje');await p.locator('#cfOpening').fill('2500');
     await ev(()=>{let el=document.getElementById('cfOpeningCur');el.value='EUR';el.dispatchEvent(new Event('change',{bubbles:true}))});
     assert.equal(await p.locator('#cfOpeningRate').inputValue(),'100');
     await b('Ruaj').click();await p.waitForTimeout(300);
     const c=await ev(()=>state.customers.find(x=>x.code==='OB-C1'));assert.ok(c);assert.equal(c.openingBalance,250000);assert.equal(c.openingAmount,2500);assert.equal(c.openingCurrency,'EUR');
     const listText=await p.locator('#main').innerText();assert.ok(listText.includes('Klient Hapje'));assert.ok(hasAmount(listText,250000),'lista: '+listText.slice(-400));
     await ev(id=>customerCard(id),c.id);await p.waitForTimeout(200);const txt=await p.locator('#modalBody').innerText();
     assert.ok(txt.includes('Gjendja fillestare')&&txt.includes('Gjendje fillestare')&&txt.includes('2026-03-01'),txt.slice(0,400));
     const tx=await ev(id=>customerTransactions(id),c.id);assert.equal(tx[0].type,'Gjendje fillestare');assert.equal(tx[0].debitALL,250000);assert.equal(tx[0].debit,2500);assert.equal(tx[0].currency,'EUR');
   });
   await step('Ndrysho klientin: gjendja ruhet kur ndryshohet vetëm qyteti; parapagim −50 000',async()=>{
     const c=await ev(()=>state.customers.find(x=>x.code==='OB-C1'));
     await ev(id=>customerForm(id),c.id);await p.waitForTimeout(150);assert.equal(await p.locator('#cfOpening').inputValue(),'2500');assert.equal(await p.locator('#cfOpeningCur').inputValue(),'EUR');
     await p.locator('#cfCity').fill('Tiranë');await b('Ruaj').click();await p.waitForTimeout(250);
     let c2=await ev(()=>state.customers.find(x=>x.code==='OB-C1'));assert.equal(c2.city,'Tiranë');assert.equal(c2.openingBalance,250000);
     await ev(id=>customerForm(id),c.id);await p.locator('#cfOpening').fill('50000');
     await ev(()=>{let el=document.getElementById('cfOpeningCur');el.value='ALL';el.dispatchEvent(new Event('change',{bubbles:true}))});
     await ev(()=>{let el=document.getElementById('cfOpeningSide');el.value='advance';el.dispatchEvent(new Event('change',{bubbles:true}))});
     await b('Ruaj').click();await p.waitForTimeout(250);c2=await ev(()=>state.customers.find(x=>x.code==='OB-C1'));assert.equal(c2.openingBalance,-50000);
     await ev(id=>customerForm(id),c.id);await p.locator('#cfOpening').fill('250000');await ev(()=>{let el=document.getElementById('cfOpeningSide');el.value='receivable';el.dispatchEvent(new Event('change',{bubbles:true}))});await b('Ruaj').click();await p.waitForTimeout(250);
     assert.equal(await ev(()=>state.customers.find(x=>x.code==='OB-C1').openingBalance),250000);
   });
   await step('Import Excel furnitorë me kolonat e reja (ALL, EUR me kurs, EUR pa kurs → kursi i datës, negativ, bosh)',async()=>{
     const before=await ev(()=>state.suppliers.length);
     await importFile('suppliers',['Kodi','Emërtimi','Shteti','Qyteti','Telefoni','Gjendja fillestare','Monedha e gjendjes','Kursi i gjendjes'],[
       ['IMP-S1','Import ALL','Albania','Fier','','120000,50','',''],
       ['IMP-S2','Import EUR kurs','Albania','Vlorë','','2000','EUR','98,5'],
       ['IMP-S3','Import EUR pa kurs','Albania','Berat','','300','eur',''],
       ['IMP-S4','Import parapagim','Albania','Lushnjë','','-45000','ALL',''],
       ['IMP-S5','Import zero','Albania','Korçë','','','','']]);
     assert.ok(/Kontrolli i importit/.test(await p.locator('#modalTitle').innerText()),'preview');
     await b('Konfirmo importin').click();await p.waitForTimeout(400);
     assert.equal(await ev(()=>state.suppliers.length),before+5);
     const got=await ev(()=>['IMP-S1','IMP-S2','IMP-S3','IMP-S4','IMP-S5'].map(c=>{let s=state.suppliers.find(x=>x.code===c);return [s.openingBalance,s.openingCurrency||null,s.openingRate||null,s.active,supplierBalance(s.id)]}));
     assert.deepEqual(got[0],[120000.5,'ALL',1,true,120000.5]);assert.deepEqual(got[1],[197000,'EUR',98.5,true,197000]);assert.deepEqual(got[2],[30000,'EUR',100,true,30000]);assert.deepEqual(got[3],[-45000,'ALL',1,true,-45000]);assert.deepEqual(got[4],[0,null,null,true,0]);
   });
   await step('Import Excel klientë me template-in E VJETËR (pa kolonat e reja) — pranohet, gjendja 0, klienti Aktiv',async()=>{
     const before=await ev(()=>state.customers.length);
     await importFile('customers',['Kodi','Emërtimi','Shteti','TVSH (%)','Qyteti','Adresa'],[['IMP-C0','Klient template i vjetër','Germany','DE1','Berlin','Str. 1']]);
     assert.ok(/Kontrolli i importit/.test(await p.locator('#modalTitle').innerText()),'preview: '+(await ev(()=>(window.__toastLog||[]).join(' | '))));
     assert.ok((await p.locator('#modalBody').innerText()).includes('Kolona opsionale që mungojnë'));
     await b('Konfirmo importin').click();await p.waitForTimeout(400);assert.equal(await ev(()=>state.customers.length),before+1);
     const c=await ev(()=>state.customers.find(x=>x.code==='IMP-C0'));assert.equal(c.openingBalance,0);assert.equal(c.active,true);
     await importFile('customers',['Kodi','Emërtimi','Shteti','TVSH (%)','Qyteti','Adresa','Gjendja fillestare','Monedha e gjendjes','Kursi i gjendjes'],[['IMP-C1','Klient import EUR','Italy','IT1','Bari','Via 2','1500','EUR','101'],['IMP-C2','Klient import parapagim','Greece','GR1','Athinë','Od. 3','-20000','','']]);
     await b('Konfirmo importin').click();await p.waitForTimeout(400);
     const got=await ev(()=>['IMP-C1','IMP-C2'].map(k=>{let c=state.customers.find(x=>x.code===k);return[c.openingBalance,c.openingCurrency||null,c.openingRate||null,c.active]}));
     assert.deepEqual(got,[[151500,'EUR',101,true],[-20000,'ALL',1,true]]);
     const missing=await ev(()=>{const wanted=IMPORT_SCHEMAS.customers.filter(h=>!['openingBalance','openingCurrency','openingRate'].includes(h));return wanted});assert.equal(missing.length,6);
   });
   await step('Template-i profesional Excel përmban kolonat e reja në shqip',async()=>{
     const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null),ev(()=>downloadImportTemplate('suppliers'))]);
     assert.ok(dl,'pa shkarkim');const path='.audit/tpl-suppliers.xlsx';await dl.saveAs(path);const buf=fs.readFileSync(path).toString('latin1');
     const sheet=Buffer.from(buf,'latin1').toString('utf8');
     for(const h of ['Gjendja fillestare','Monedha e gjendjes','Kursi i gjendjes','Kodi','Telefoni'])assert.ok(sheet.includes(h),'kolona '+h);
     await p.waitForTimeout(200);
   });
   await step('Kontabiliteti → Gjendjet fillestare: KPI, rreshta shtesë (311), gjenerimi i "Bilanci i hapjes" me balancim te 101',async()=>{
     await ev(()=>{bankAccounts().push({id:'BA-OB',code:'BKT-OB',bank:'BKT',iban:'AL1',currency:'EUR',ledgerAccount:'512',openingBalance:1000,openingDate:'2026-03-01',active:true});cashRegisters().forEach(c=>{c.openingBalance=0});cashRegisters().push({id:'CR-OB',code:'ARKA-OB',name:'Arka prove',ledgerAccount:'530',currency:'ALL',openingBalance:35000,openingDate:'2026-03-01',active:true});go('accounting');accountingTab='opening';render()});
     await p.waitForTimeout(250);
     await p.locator('#main button',{hasText:'+ Rresht'}).click();await p.waitForTimeout(250);
     const rowId=await ev(()=>state.openingBalances.lines[0].id);
     await ev(id=>{let row=document.querySelector('.ob-line[data-id="'+id+'"]');row.querySelector('.ob-acc').value='311';row.querySelector('.ob-deb').value='500000';row.querySelector('.ob-desc').value='Lëndë e parë në magazinë'},rowId);
     await p.locator('#main button',{hasText:'Ruaj rreshtat'}).click();await p.waitForTimeout(250);
     const l=await ev(()=>state.openingBalances.lines[0]);assert.equal(l.account,'311');assert.equal(l.debit,500000);
     const calc=await ev(()=>{let c=openingBalanceLines();return{lines:c.lines,diff:c.diff,warn:c.warn}});
     const by=(acc,side)=>calc.lines.filter(x=>x.account===acc).reduce((a,x)=>a+x[side],0);
     // furnitorë: OB-S1 150000 + IMP-S1 120000.5 + IMP-S2 197000 + IMP-S3 30000 = 497000.5 kredi; IMP-S4 45000 debi
     assert.equal(Math.round(by('401','credit')*100)/100,497000.5);assert.equal(by('401','debit'),45000);
     // klientë: OB-C1 250000 + IMP-C1 151500 = 401500 debi; IMP-C2 20000 kredi
     assert.equal(by('411','debit'),401500);assert.equal(by('411','credit'),20000);
     assert.equal(by('512','debit'),100000);assert.equal(by('530','debit'),35000);assert.equal(by('311','debit'),500000);
     const eq=calc.lines.find(x=>x.balancing);assert.ok(eq&&eq.account==='101');
     const d=calc.lines.reduce((a,x)=>a+x.debit,0),c=calc.lines.reduce((a,x)=>a+x.credit,0);assert.ok(Math.abs(d-c)<0.005,'i pabalancuar '+d+' '+c);
     await p.locator('#main button',{hasText:'Gjenero veprimin e hapjes'}).click();await p.waitForTimeout(300);
     const e=await ev(()=>state.accounting.entries.find(x=>x.sourceKey==='opening:balance'));assert.ok(e);assert.equal(e.status,'Draft');assert.equal(e.date,'2026-03-01');assert.equal(e.journal,'J-GEN');assert.ok(e.description.includes('Bilanci i hapjes'));
     assert.equal(await ev(()=>state.accounting.entries.filter(x=>x.sourceKey==='opening:balance').length),1);
     assert.ok((await p.locator('#main').innerText()).includes(e.number));
   });
   await step('Idempotencë: gjenerimi i dytë s\'krijon dublikatë; syncAccountingSources s\'e prek; Rigjenero pas ndryshimit',async()=>{
     const before=await ev(()=>state.accounting.entries.length);
     await ev(()=>generateOpeningEntry());await p.waitForTimeout(200);assert.equal(await ev(()=>state.accounting.entries.length),before);
     await ev(()=>syncAccountingSources());await p.waitForTimeout(200);
     assert.equal(await ev(()=>state.accounting.entries.filter(x=>x.sourceKey==='opening:balance').length),1);
     await ev(()=>{state.customers.find(x=>x.code==='IMP-C2').openingBalance=-30000;go('accounting');accountingTab='opening';render()});await p.waitForTimeout(250);
     await p.locator('#main button',{hasText:'Rigjenero'}).click();await p.waitForTimeout(300);
     const e=await ev(()=>state.accounting.entries.filter(x=>x.sourceKey==='opening:balance'));assert.equal(e.length,1);
     assert.equal(e[0].lines.filter(x=>x.account==='411').reduce((a,x)=>a+x.credit,0),30000);
     const t=await ev(()=>entryTotals(state.accounting.entries.find(x=>x.sourceKey==='opening:balance')));assert.ok(Math.abs(t.debit-t.credit)<0.005);
   });
   await step('Posto nga tab-i → bilanci verifikues Alpha tregon "Fillestare" për periudhën pas hapjes; Ditari e liston',async()=>{
     await p.locator('#main button',{hasText:'Posto'}).first().click();await p.waitForTimeout(300);
     const e=await ev(()=>state.accounting.entries.find(x=>x.sourceKey==='opening:balance'));assert.equal(e.status,'Postuar');
     const tb=await ev(()=>{alphaAccountingFilters.docFrom='2026-04-01';alphaAccountingFilters.docTo='2026-04-30';alphaAccountingFilters.postedOnly=true;let d=trialBalanceData();let f=c=>d.find(x=>x.code===c)||{};return{a401:f('401'),a411:f('411'),a512:f('512'),a530:f('530'),a311:f('311'),a101:f('101')}});
     assert.equal(Math.round(tb.a401.pc*100)/100,497000.5);assert.equal(tb.a401.pd,45000);assert.equal(tb.a411.pd,401500);assert.equal(tb.a411.pc,30000);assert.equal(tb.a512.pd,100000);assert.equal(tb.a530.pd,35000);assert.equal(tb.a311.pd,500000);assert.ok(tb.a101.pc>0);
     await ev(()=>{alphaAccountingFilters.postedOnly=false;accountingTab='entries';render()});await p.waitForTimeout(250);
     assert.ok((await p.locator('#main').innerText()).includes('Bilanci i hapjes'));
     await ev(()=>{accountingTab='opening';render()});await p.waitForTimeout(200);assert.ok((await p.locator('#main').innerText()).includes('Postuar'));
   });
   await step('Raportet Alpha (kod i paprekur) marrin gjendjet: situacioni i furnitorëve/klientëve, kartela klienti Alpha',async()=>{
     const r=await ev(()=>{salesReportFilters={from:'2026-03-02',to:'2026-12-31',q:''};let s=alphaSupplierSituationData().find(x=>x.code==='IMP-S2'),c=alphaCustomerSituationData().find(x=>x.code==='OB-C1');
       alphaCustomerFilters.customer=state.customers.find(x=>x.code==='OB-C1').id;alphaCustomerFilters.docFrom='2026-03-02';alphaCustomerFilters.docTo='2026-12-31';let op=alphaCustomerOpening();
       return{s:s&&{previous:s.previous,balance:s.balance},c:c&&{previous:c.previous,balance:c.balance},op:op.all}});
     assert.deepEqual(r.s,{previous:197000,balance:197000});assert.deepEqual(r.c,{previous:250000,balance:250000});assert.equal(r.op,250000);
     await ev(()=>{salesReportFilters={from:'',to:'',q:''}});
     const ledger=await ev(()=>{reportCustomerId=state.customers.find(x=>x.code==='OB-C1').id;let h=customerLedgerReport();return h});
     assert.ok(ledger.includes('Gjendja fillestare')&&ledger.includes('HAPJE'));
     const vy=await ev(()=>{try{let d=window.vyAnalyticsData&&window.vyAnalyticsData('parties');return d?'ok':'none'}catch(e){return 'err:'+e.message}});assert.ok(vy!=='err',vy);
   });
   await step('Kartela e furnitorit: XLSX i ditarit nis me rreshtin e hapjes; kthimi/pagesa llogariten mbi hapjen',async()=>{
     const s=await ev(()=>state.suppliers.find(x=>x.code==='IMP-S1'));
     await ev(id=>{state.payments.push({id:'MP-OB-1',supplier:id,date:'2026-03-05',amount:20000.5,currency:'ALL',method:'Cash',status:'Konfirmuar'})},s.id);
     assert.equal(await ev(id=>Math.round(supplierBalance(id)*100)/100,s.id),100000);
     const rows=await ev(id=>supplierCardHistory(id),s.id);assert.equal(rows[0].veprimi,'Gjendje fillestare');assert.equal(rows[0].debit,120000.5);assert.equal(rows[1].veprimi,'Pagesë');
     await ev(id=>supplierCard(id),s.id);await p.waitForTimeout(200);const txt=await p.locator('#modalBody').innerText();assert.ok(txt.includes('Gjendje fillestare')&&hasAmount(txt,100000),txt.slice(0,500));
     await ev(()=>closeModal());
     const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null),ev(id=>exportLedgerXlsx(id),s.id)]);assert.ok(dl,'pa xlsx');
     const path='.audit/kartela-ob.xlsx';await dl.saveAs(path);const xml=fs.readFileSync(path).toString('utf8');assert.ok(xml.includes('Gjendje fillestare'),'xlsx pa rreshtin e hapjes');
     const led=await ev(id=>ledgerHtmlV2(id),s.id);assert.ok(led.includes('Gjendje fillestare')&&led.indexOf('Gjendje fillestare')<led.indexOf('MP-OB-1'),'ledgerHtmlV2');
     await p.waitForTimeout(200);
   });
   await step('ROLE-USER pa "Paraja dhe kontabiliteti": tab-i i hapjes i padukshëm/refuzohet; fusha e gjendjes te furnitori punon me suppliers:edit',async()=>{
     await ev(async()=>{const h=await hashPassword('Prove-2026!');state.users.push({id:'U-OB',username:'ob-user',name:'Operator',role:'ROLE-USER',active:true,passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false,rights:{v:2,modules:{suppliers:['view','create','edit'],customers:['view','create','edit'],weighings:['view'],purchases:['view'],dashboard:['view']}}});save();closeModal();logoutUser()});
     await p.waitForFunction(()=>!!document.getElementById('loginLock'));await p.locator('#loginName').fill('ob-user');await p.locator('#loginPass').fill('Prove-2026!');await p.locator('#loginPass').press('Enter');await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(400);
     assert.equal(await ev(()=>userCan('accounting','view')),false);
     await ev(()=>{window.__toastLog=[];accountingTab='opening'});
     const r=await ev(()=>({g:generateOpeningEntry(true),s:saveOpeningSettings(),p:postOpeningEntry()}));assert.deepEqual(r,{g:false,s:false,p:false});
     assert.ok((await ev(()=>__toastLog.join(' | '))).includes('Nuk keni të drejtë'));
     await ev(()=>go('suppliers'));await p.waitForTimeout(250);
     const s=await ev(()=>state.suppliers.find(x=>x.code==='IMP-S5'));
     await ev(id=>supplierEditForm(id),s.id);await p.waitForTimeout(200);assert.ok(await p.locator('#sefOpening').isVisible());await p.locator('#sefOpening').fill('7000');await b('Ruaj').click();await p.waitForTimeout(250);
     assert.equal(await ev(()=>state.suppliers.find(x=>x.code==='IMP-S5').openingBalance),7000);
     await ev(()=>{closeModal();logoutUser()});await p.waitForFunction(()=>!!document.getElementById('loginLock'));
   });
  }finally{
   fs.writeFileSync(`.audit/opening-${tag}.json`,JSON.stringify(results,null,2));
   await browser.close();
  }
 }
 console.log(`${totalPass}/${totalSteps} passed`);process.exitCode=totalPass===totalSteps?0:1;
})().catch(e=>{console.error(e);process.exitCode=1});
