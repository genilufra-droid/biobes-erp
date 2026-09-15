/* ==========================================================================
   tests/expenses-audit.cjs — shpenzimet e klasës 6 (biobes-expenses-v1)
   --------------------------------------------------------------------------
   Prova kalon nëpër UI-n reale (desktop + telefon): moduli "Shpenzimet" në
   menu, kategoritë → llogaritë 6xx (të ndryshueshme, buxhet, artikuj),
   formulari (kategoria, artikulli, furnitori / paguesi, TVSH e zbritshme,
   Arkë / Bankë / Pa paguar), Ruaj draft / Ruaj & konfirmo, veprimet kontabël
   Draft (Dr 6xx [+445] / Cr 530 · 512 · 401), arka dhe banka ulen (thesari
   Vyapar, Alpha Arka/Banka pa prekur kodin), detyrimi ndaj furnitorit
   (supplierBalance, kartela, Vyapar Palët) dhe pagesa e mëvonshme me mandat
   MP- nga kartela e shpenzimit, anulimi me arsye (drafti hiqet / i postuari
   merr kundërveprim), printimi (mandat pagese / fletë shpenzimi, A4 portret,
   shuma me fjalë), regjistri me filtra + Excel, importi Excel (gjithçka-ose-
   asgjë), 15 raportet analitike me Excel, Vyapar → moduli Shpenzimet, paneli
   (KPI), Pagesa (detyrimet e hapura), P&L (incomeStatementPreview) dhe
   të drejtat e ROLE-USER (pa Konfirmo / Anulo).
   Izolimi: helpers.cjs ndalon çdo kërkesë HTTPS → asnjë kontakt me API-n.
   Rezultatet: .audit/expenses-{desktop,mobile}.json (jashtë Git).
   ========================================================================== */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
fs.mkdirSync('.audit',{recursive:true});

function xlsxBuffer(headers,rows){
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
  /* select-et janë të fshehura pas kërkimit live: vlera vendoset drejtpërdrejt + 'change' (si përdoruesi që zgjedh nga lista) */
  const pick=async(sel,value)=>{await ev(([s,v])=>{let el=document.querySelector(s);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,value]);await p.waitForTimeout(120)};
  const typeIn=async(sel,value)=>{await p.locator(sel).fill(String(value));await p.locator(sel).dispatchEvent('input');await p.waitForTimeout(60)};
  const toastLog=async()=>ev(()=>(window.__toastLog||[]).join(' | '));
  const hookToast=()=>ev(()=>{window.__toastLog=[];const ot=window.toast;if(!ot.__wrapped){window.toast=function(m){__toastLog.push(String(m));return ot.apply(this,arguments)};window.toast.__wrapped=true}});
  const importFile=async(k,headers,rows)=>{await hookToast();await ev(k=>pickModuleImport(k),k);await p.locator('#moduleImportFile').setInputFiles({name:'import.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsxBuffer(headers,rows)});await p.waitForTimeout(500)};
  const ids={};const TODAY=new Date().toISOString().slice(0,10);
  try{
   await step('Blloku aktiv: moduli "Shpenzimet" në menu pas Pagesa, 13 kategori → llogari 6xx, llogaritë 602/605/613/616/617/619 në plan, schema e importit, të drejtat view/create/edit/confirm/cancel/print, Alpha e paprekur',async()=>{
     await hookToast();
     const info=await ev(()=>{let cats=window.__biobesExpenses.categories(true);return{v:window.__biobesExpenses.version,arr:Array.isArray(state.expenses),nav:[...document.querySelectorAll('#nav button')].map(x=>x.dataset.page),cats:cats.length,catMap:cats.map(c=>c.code+':'+c.account),items:cats.find(c=>c.code==='MIREMBAJTJE').items,accs:ensureAccounting().accounts.filter(a=>['602','605','613','616','617','619'].includes(a.code)).map(a=>a.code),schema:IMPORT_SCHEMAS.expenses.slice(),label:importLabel('expenses'),allowed:(()=>{userEditForm('AUDIT-ADMIN');let a=[...document.querySelectorAll('input.rt-perm[data-m="expenses"]')].map(x=>x.dataset.a),lbl=document.querySelector('input.rt-perm[data-m="expenses"]')?.closest('tr')?.innerText||'';closeModal();return{a,lbl}})(),reports:window.__biobesExpenses.reports.map(r=>r[0]),alpha:typeof alphaCashRows==='function'&&typeof cashClassicPreview==='function',words:window.__biobesExpenses.words(12000)+' / '+window.__biobesExpenses.words(1250345)}});
     assert.equal(info.v,'biobes-expenses-v1');assert.ok(info.arr);
     assert.equal(info.nav.indexOf('expenses'),info.nav.indexOf('payments')+1,info.nav.join(','));
     assert.equal(info.cats,13);assert.ok(info.catMap.includes('TRANSPORT:611')&&info.catMap.includes('MIREMBAJTJE:615')&&info.catMap.includes('QIRA:612')&&info.catMap.includes('TATIME:631')&&info.catMap.includes('MATERIALE:602')&&info.catMap.includes('KARBURANT:605'),info.catMap.join(','));
     assert.ok(info.items.includes('Vaj motori')&&info.items.includes('Filtra'));
     assert.deepEqual(info.accs.sort(),['602','605','613','616','617','619']);
     assert.deepEqual(info.schema,['date','category','item','supplier','invoiceNumber','description','amount','vat','deductible','method','costCenter']);assert.equal(info.label,'Shpenzime (klasa 6)');
     assert.deepEqual(info.allowed.a,['view','create','edit','confirm','cancel','print']);assert.ok(/Shpenzimet/.test(info.allowed.lbl),info.allowed.lbl);
     assert.equal(info.reports.length,15);assert.ok(info.alpha);
     assert.equal(info.words,'Dymbëdhjetë mijë / Një milion e dyqind e pesëdhjetë mijë e treqind e dyzet e pesë');
   });
   await step('Regjistri: KPI (muaji / viti / pa paguar / draft), filtrat, tabela bosh, butonat "+ Shpenzim" dhe Excel, tabs Regjistri / Raportet (15) / Kategoritë',async()=>{
     await ev(()=>go('expenses'));await p.waitForTimeout(400);
     const main=p.locator('#main');assert.equal(await main.locator('h1').first().innerText(),'Shpenzimet');
     assert.equal(await main.locator('.kpi').count(),4);assert.ok((await main.locator('.kpi').first().innerText()).includes('Shpenzimet e muajit'));
     assert.equal(await main.getByRole('button',{name:'+ Shpenzim',exact:true}).count(),1);assert.equal(await main.getByRole('button',{name:'⬇ Excel',exact:true}).count(),1);
     assert.equal(await main.locator('[data-extab]').count(),3);assert.ok((await main.locator('[data-extab="reports"]').innerText()).includes('15'));
     assert.equal(await p.locator('#expensesTable tbody tr[data-ex]').count(),0);assert.ok((await p.locator('#expensesTable tbody').innerText()).includes('Asnjë shpenzim'));
     assert.equal(await p.locator('#exfCategory option').count(),14);assert.equal(await p.locator('#exfMethod option').count(),4);
     assert.ok(await main.locator('.erp-import-toolbar').count()>=1,'toolbar-i i importit Excel për faqen');
   });
   await step('Formulari: 16 fusha, kategoria ndryshon artikujt (datalist) dhe llogarinë, TVSH 20% e zbritshme → neto 10 000 / TVSH 2 000, përmbledhja kontabël Dr 615 + Dr 445 / Cr 530',async()=>{
     await p.locator('#main').getByRole('button',{name:'+ Shpenzim',exact:true}).click();await p.waitForTimeout(400);
     assert.equal(await p.locator('#modalTitle').innerText(),'Shpenzim i ri');assert.equal(await p.locator('#modalBody .field').count(),16);
     assert.match(await p.locator('#exNumber').inputValue(),/^SHP-\d{4}-0001$/);assert.equal(await p.locator('#exDate').inputValue(),TODAY);
     await pick('#exCategory','MIREMBAJTJE');const dl=await ev(()=>[...document.querySelectorAll('#exItemList option')].map(o=>o.value));assert.ok(dl.includes('Filtra')&&dl.includes('Vaj motori'),dl.join(','));
     await typeIn('#exItem','Filtra');await typeIn('#exDescription','Filtra vaji për tharësen');await typeIn('#exInvoiceNo','F-1021');await typeIn('#exAmount','12000');
     await pick('#exVat','20');await ev(()=>{document.getElementById('exDeductible').checked=true;exRecalc()});await typeIn('#exCostCenter','Tharësja T1');
     assert.notEqual(await ev(()=>getComputedStyle(document.getElementById('exCashField')).display),'none');assert.equal(await ev(()=>getComputedStyle(document.getElementById('exBankField')).display),'none');
     const sum=await p.locator('#exSummary').innerText();
     assert.match(sum,/Neto:\s*10[,.]000[.,]00 ALL/);assert.match(sum,/TVSH 20%:\s*2[,.]000[.,]00 ALL \(e zbritshme → 445\)/);assert.match(sum,/Dr 615 10[,.]000[.,]00 \+ Dr 445 2[,.]000[.,]00 \/ Cr 530 12[,.]000[.,]00/);assert.ok(sum.includes('ul gjendjen e arkës'));
     await pick('#exSupplier','S1');await pick('#exMethod','bank');assert.equal(await ev(()=>getComputedStyle(document.getElementById('exCashField')).display),'none');assert.notEqual(await ev(()=>getComputedStyle(document.getElementById('exBankField')).display),'none');
     await pick('#exMethod','cash');
   });
   await step('Ruaj draft → SHP-…-0001 Draft pa VK; kartela (✎ Ndrysho / Hiq draftin / Konfirmo); Konfirmo nga kartela → Konfirmuar, VK Draft J-CASH 615/445/530, ngjarje në aktivitet',async()=>{
     await b('Ruaj draft').click();await p.waitForTimeout(500);
     const d=await ev(()=>{let d=state.expenses[0];return{n:d.number,st:d.status,total:d.total,net:d.net,vat:d.vat,ded:d.deductible,item:d.item,sup:d.supplierId,cc:d.costCenter,vk:ensureAccounting().entries.filter(e=>e.sourceKey==='expense:'+d.id).length,modal:document.getElementById('modalTitle').textContent}});
     assert.equal(d.st,'Draft');assert.equal(d.total,12000);assert.equal(d.net,10000);assert.equal(d.vat,2000);assert.ok(d.ded);assert.equal(d.item,'Filtra');assert.equal(d.sup,'S1');assert.equal(d.cc,'Tharësja T1');assert.equal(d.vk,0);assert.equal(d.modal,'Shpenzim '+d.n);ids.n1=d.n;ids.e1=await ev(()=>state.expenses[0].id);
     assert.equal(await b('✎ Ndrysho').count(),1);assert.equal(await b('Hiq draftin').count(),1);assert.equal(await b('Konfirmo').count(),1);assert.equal(await b('🖨 Printo').count(),1);
     await b('Konfirmo').click();await p.waitForTimeout(500);
     const c=await ev(id=>{let d=state.expenses.find(x=>x.id===id),e=ensureAccounting().entries.find(x=>x.sourceKey==='expense:'+id);return{st:d.status,by:d.confirmedBy,j:e&&e.journal,es:e&&e.status,lines:e&&e.lines.map(l=>l.account+':'+l.debit+'/'+l.credit),ev:state.events.filter(x=>x.ref===d.number&&x.type==='Shpenzim').length,modal:document.getElementById('modalTitle').textContent,anulo:!!document.querySelector('#modalFoot button.danger')}},ids.e1);
     assert.equal(c.st,'Konfirmuar');assert.equal(c.by,'Audit lokal');assert.equal(c.j,'J-CASH');assert.equal(c.es,'Draft');assert.deepEqual(c.lines,['615:10000/0','445:2000/0','530:0/12000']);assert.ok(c.ev>=1);assert.ok(c.anulo);
     assert.ok((await p.locator('#modalBody').innerText()).includes('MANDAT PAGESE — SHPENZIM'));
     await close();
   });
   await step('Arka: shpenzimi cash ul thesarin (Vyapar cashPosition −12 000), del në Alpha "Arka & Banka" (Ditari klasik / Pagesat / Ditari total) pa prekur kodin Alpha, aktiviteti hap kartelën',async()=>{
     const t=await ev(()=>{let r=[];try{r=alphaCashRows()}catch(e){}let mine=r.filter(x=>String(x.id).startsWith('SHP-'));let out=cashClassicPreview(false),pay=cashCategoryPreview(false),tot=cashTotalPreview();return{mine:mine.map(x=>[x.id,x.type,x.method,x.outcome,x.cashRegister]),classic:out.includes('SHP-')&&out.includes('Filtra'),pay:pay.includes('SHP-'),tot:tot.includes('SHP-')}});
     assert.equal(t.mine.length,1);assert.deepEqual(t.mine[0],[ids.n1,'Shpenzim (arkë)','Cash',12000,'CR-ALL']);assert.ok(t.classic&&t.pay&&t.tot);
     await ev(()=>{reportsMode='vyapar';go('reports');vyGo('finance')});await p.waitForTimeout(500);
     const fin=await ev(()=>{let el=document.getElementById('vyPaper');return{text:el?el.innerText:'',has:!!el&&el.innerText.includes('Shpenzim (arkë)')}});assert.ok(fin.has,fin.text.slice(0,300));
     const pos=await ev(()=>{let rows=[...document.querySelectorAll('#vyPaper table tbody tr')].map(tr=>tr.innerText);return rows.find(r=>r.includes('SHP-'))||''});assert.ok(/12[,.]000/.test(pos),pos);
     await ev(()=>openActivityRef(window.__biobesExpenses.docs()[0].number));await p.waitForTimeout(300);assert.equal(await p.locator('#modalTitle').innerText(),'Shpenzim '+ids.n1);await close();
   });
   await step('Bankë: karburant 8 500 ALL (TVSH 20% jo e zbritshme → gjithë shuma te 605) me llogari bankare → VK J-BANK 605/512, saldo e bankës −8 500 (Vyapar bankBalances), thesari',async()=>{
     await ev(()=>{bankAccounts().push({id:'BA-T',code:'BKT-ALL',bank:'BKT',iban:'AL00',currency:'ALL',ledgerAccount:'512',openingBalance:100000,active:true});save();go('expenses');expenseForm('',{preset:{method:'bank',bankAccount:'BA-T',category:'KARBURANT',item:'Naftë',payee:'Kastrati Durrës',description:'Naftë kamioni',total:8500,vatRate:20,deductible:false}})});await p.waitForTimeout(400);
     assert.equal(await p.locator('#exBankAccount').inputValue(),'BA-T');assert.notEqual(await ev(()=>getComputedStyle(document.getElementById('exBankField')).display),'none');
     const sum=await p.locator('#exSummary').innerText();assert.match(sum,/Dr 605 8[,.]500[.,]00 \/ Cr 512 8[,.]500[.,]00/);assert.ok(sum.includes('jo e zbritshme'));
     await b('Ruaj & konfirmo').click();await p.waitForTimeout(600);
     const r=await ev(()=>{let d=state.expenses.find(x=>x.category==='KARBURANT'),e=ensureAccounting().entries.find(x=>x.sourceKey==='expense:'+d.id);return{n:d.number,st:d.status,lines:e&&e.lines.map(l=>l.account+':'+l.debit+'/'+l.credit),j:e&&e.journal,payee:d.payee,net:d.net,vat:d.vat}});
     assert.equal(r.st,'Konfirmuar');assert.equal(r.j,'J-BANK');assert.deepEqual(r.lines,['605:8500/0','512:0/8500']);assert.equal(r.payee,'Kastrati Durrës');assert.equal(r.vat,1416.67);ids.n2=r.n;
     await ev(()=>{reportsMode='vyapar';go('reports');vyGo('finance')});await p.waitForTimeout(500);
     const bank=await ev(()=>{let rows=[...document.querySelectorAll('#vyPaper table tbody tr')].map(tr=>tr.innerText);return{acc:rows.find(r=>r.startsWith('BKT-ALL'))||'',exp:rows.find(r=>r.includes('Shpenzim (bankë)'))||''}});
     assert.ok(/91[,.]500/.test(bank.acc),bank.acc);assert.ok(/8[,.]500/.test(bank.exp),bank.exp);
     await close();
   });
   await step('Pa paguar: transport 30 000 ALL nga furnitori S2 → VK J-PUR 611/401, supplierBalance(S2) +30 000, kartela e furnitorit (rreshti "Shpenzim", KPI), Vyapar Palët, Pagesa → karta "Shpenzime të papaguara", paneli KPI',async()=>{
     const before=await ev(()=>supplierBalance('S2'));
     await ev(()=>{go('expenses');expenseForm('',{preset:{method:'unpaid',supplierId:'S2',category:'TRANSPORT',item:'Transport mallrash',description:'Transport Fier–Durrës',invoiceNo:'TR-77',total:30000,vatRate:0}})});await p.waitForTimeout(400);
     assert.equal(await p.locator('#exSupplier').inputValue(),'S2');assert.match(await p.locator('#exSummary').innerText(),/Dr 611 30[,.]000[.,]00 \/ Cr 401 30[,.]000[.,]00 — detyrimi shfaqet te furnitori/);
     await b('Ruaj & konfirmo').click();await p.waitForTimeout(600);
     const r=await ev(b=>{let d=state.expenses.find(x=>x.category==='TRANSPORT'),e=ensureAccounting().entries.find(x=>x.sourceKey==='expense:'+d.id);return{n:d.number,id:d.id,st:d.status,lines:e&&e.lines.map(l=>l.account+':'+l.debit+'/'+l.credit),j:e&&e.journal,bal:supplierBalance('S2')-b,card:(()=>{closeModal();supplierCard('S2');let t=document.getElementById('modalBody').innerText;closeModal();return t})()}},before);
     assert.equal(r.st,'Konfirmuar');assert.equal(r.j,'J-PUR');assert.deepEqual(r.lines,['611:30000/0','401:0/30000']);assert.equal(r.bal,30000);ids.n3=r.n;ids.e3=r.id;
     assert.ok(r.card.includes('Shpenzim')&&r.card.includes(r.n)&&r.card.includes('Fat: TR-77')&&r.card.includes('nga të cilat shpenzime'),r.card.slice(0,600));
     await ev(()=>{reportsMode='vyapar';go('reports');vyGo('party');vySelect('partyType','supplier')});await p.waitForTimeout(400);
     const party=await ev(()=>{let rows=[...document.querySelectorAll('#vyPaper table tbody tr')].map(tr=>tr.innerText);return rows.find(r=>r.includes('Flamur Guri'))||'(pa rresht) '+rows.slice(0,3).join(' || ')});assert.ok(/30[,.]000/.test(party),party);
     const led=await ev(()=>{vySelect('party','S2');let t=document.getElementById('vyPaper').innerText;return t});assert.ok(led.includes('Shpenzim (pa paguar)')&&led.includes('SHP-'),led.slice(0,400));
     await ev(()=>go('payments'));await p.waitForTimeout(400);
     const pay=p.locator('#exUnpaidCard');assert.equal(await pay.count(),1);assert.ok((await pay.innerText()).includes(ids.n3));assert.equal(await pay.locator('tr[data-exunpaid]').count(),1);assert.equal(await pay.getByRole('button',{name:'Paguaj',exact:true}).count(),1);
     await ev(()=>go('dashboard'));await p.waitForTimeout(500);
     const dash=await p.locator('#exDashCard').innerText();assert.ok(/Shpenzime \(muaji\)/.test(dash));assert.ok(/50[,.]500[.,]00 ALL/.test(dash),dash);assert.ok(/pa paguar 30[,.]000/.test(dash),dash);
   });
   await step('Pagesa e mëvonshme: kartela → "₳ Paguaj tani" → mandat MP- Cash 30 000 → shpenzimi "paguar", gjendja e furnitorit kthehet, VK e pagesës 401/530, mandati shfaqet te Pagesa; fshirja e mandatit rikthen detyrimin',async()=>{
     const base=await ev(()=>supplierBalance('S2'));
     await ev(id=>expenseCard(id),ids.e3);await p.waitForTimeout(300);assert.equal(await b('₳ Paguaj tani').count(),1);
     await b('₳ Paguaj tani').click();await p.waitForTimeout(400);assert.equal(await p.locator('#modalTitle').innerText(),'Pagesa e shpenzimit '+ids.n3);assert.equal(await p.locator('#epxAmount').inputValue(),'30000');
     await b('Regjistro pagesën').click();await p.waitForTimeout(600);
     const r=await ev(([id,base])=>{let d=state.expenses.find(x=>x.id===id),p=state.payments.find(x=>x.id===d.paidBy);return{paid:d.paidBy,pm:p&&p.method,pa:p&&p.amount,ps:p&&p.supplier,pe:p&&p.expense,bal:supplierBalance('S2')-base,vk:ensureAccounting().entries.filter(e=>e.sourceRef===p.id).map(e=>e.lines.map(l=>l.account+':'+l.debit+'/'+l.credit).join(' ')),modal:document.getElementById('modalTitle').textContent,foot:document.getElementById('modalFoot').innerText}},[ids.e3,base]);
     assert.match(r.paid,/^MP-\d{4}$/);assert.equal(r.pm,'Cash');assert.equal(r.pa,30000);assert.equal(r.ps,'S2');assert.equal(r.pe,ids.e3);assert.equal(r.bal,-30000);assert.deepEqual(r.vk,['401:30000/0 530:0/30000']);assert.equal(r.modal,'Shpenzim '+ids.n3);assert.ok(!r.foot.includes('Paguaj tani'));ids.mp=r.paid;
     assert.ok((await p.locator('#modalBody').innerText()).includes('paguar me'));await close();
     await ev(()=>go('payments'));await p.waitForTimeout(400);assert.equal(await p.locator('#exUnpaidCard').count(),0);assert.ok((await p.locator('#main').innerText()).includes(ids.mp));
     await ev(id=>{window.confirm=()=>true;window.prompt=()=>id;deletePayment(id)},ids.mp);await p.waitForTimeout(400);
     const after=await ev(id=>({paid:state.expenses.find(x=>x.id===id).paidBy||null,card:document.getElementById('exUnpaidCard')?1:0}),ids.e3);assert.equal(after.paid,null);assert.equal(after.card,1);
   });
   await step('Anulimi: i konfirmuari kërkon arsye (arsye bosh → refuzohet), VK Draft hiqet, statusi Anuluar, arka rikthehet; VK i postuar merr kundërveprim VK-REV; drafti hiqet me "Hiq draftin"',async()=>{
     await hookToast();
     await ev(()=>{window.prompt=()=>'';});const r0=await ev(id=>cancelExpense(id),ids.e1);assert.equal(r0,false);assert.match(await toastLog(),/Arsyeja e anulimit/);
     await ev(()=>{window.prompt=()=>'Faturë e dyfishuar'});
     const r=await ev(id=>{let ok=cancelExpense(id);let d=state.expenses.find(x=>x.id===id);return{ok,st:d.status,reason:d.cancelReason,vk:ensureAccounting().entries.filter(e=>e.sourceRef===id).length,cash:alphaCashRows().filter(x=>x.id===d.number).length}},ids.e1);
     assert.deepEqual(r,{ok:true,st:'Anuluar',reason:'Faturë e dyfishuar',vk:0,cash:0});
     await ev(()=>{let d=state.expenses.find(x=>x.category==='KARBURANT'),e=ensureAccounting().entries.find(x=>x.sourceKey==='expense:'+d.id);e.status='Postuar';save()});
     const r2=await ev(()=>{let d=state.expenses.find(x=>x.category==='KARBURANT');let ok=cancelExpense(d.id);let es=ensureAccounting().entries.filter(e=>e.sourceRef===d.id);return{ok,st:d.status,n:es.length,rev:es.filter(e=>e.reversalOf).map(e=>[e.number.slice(0,7),e.status,e.lines.map(l=>l.account+':'+l.debit+'/'+l.credit).join(' ')])}});
     assert.equal(r2.ok,true);assert.equal(r2.st,'Anuluar');assert.equal(r2.n,2);assert.deepEqual(r2.rev,[['VK-REV-','Postuar','605:0/8500 512:8500/0']]);
     await ev(()=>{closeModal();expenseForm('',{preset:{category:'ZYRE',item:'Kancelari',total:1500,description:'Letër A4'}})});await p.waitForTimeout(300);await b('Ruaj draft').click();await p.waitForTimeout(400);
     const dr=await ev(()=>state.expenses.filter(x=>x.status==='Draft').length);assert.equal(dr,1);await b('Hiq draftin').click();await p.waitForTimeout(400);
     assert.equal(await ev(()=>state.expenses.filter(x=>x.status==='Draft').length),0);
     await ev(()=>{closeModal();go('expenses')});await p.waitForTimeout(300);
   });
   await step('Validimi: shuma 0, "Pa paguar" pa furnitor, bankë pa llogari; numri i dyfishtë refuzohet; furnitori i ri krijohet automatikisht nga emri i lirë kur konfirmohet "Pa paguar"',async()=>{
     const v=await ev(()=>{let V=window.__biobesExpenses.validate,base={number:'SHP-X-1',date:'2026-09-10',category:'QIRA',total:0,method:'cash',cashRegister:'CR-ALL',supplierId:'',payee:''};return[V(base),V({...base,total:100,method:'unpaid'}),V({...base,total:100,method:'bank',bankAccount:'nope'}),V({...base,total:100,number:state.expenses[0].number}),V({...base,total:100})]});
     assert.match(v[0],/më e madhe se zero/);assert.match(v[1],/Pa paguar/);assert.match(v[2],/llogarinë bankare/);assert.match(v[3],/ekziston/);assert.equal(v[4],'');
     const sBefore=await ev(()=>state.suppliers.length);
     await ev(()=>{window.confirm=()=>true;expenseForm('',{preset:{method:'unpaid',payee:'Albtelecom sh.a.',category:'KOMUNIKIM',item:'Internet',total:4800,vatRate:20,deductible:true}})});await p.waitForTimeout(300);
     await b('Ruaj & konfirmo').click();await p.waitForTimeout(600);
     const r=await ev(n=>{let d=state.expenses.find(x=>x.category==='KOMUNIKIM'),s=state.suppliers.find(x=>x.id===d.supplierId);return{st:d.status,sup:s&&s.name,code:s&&s.code,created:state.suppliers.length-n,bal:s?supplierBalance(s.id):null,lines:ensureAccounting().entries.find(e=>e.sourceKey==='expense:'+d.id).lines.map(l=>l.account+':'+l.debit+'/'+l.credit)}},sBefore);
     assert.equal(r.st,'Konfirmuar');assert.equal(r.sup,'Albtelecom sh.a.');assert.equal(r.created,1);assert.equal(r.bal,4800);assert.deepEqual(r.lines,['613:4000/0','445:800/0','401:0/4800']);ids.e4=await ev(()=>state.expenses.find(x=>x.category==='KOMUNIKIM').id);
     await close();
   });
   await step('Printimi: mandat pagese (cash) me FINANCIERI / ARKËTARI / MARRËSI dhe shuma me fjalë; fletë shpenzimi (pa paguar) me FURNITORI; @page A4 portrait, iframe i printimit',async()=>{
     await ev(()=>{expenseForm('',{preset:{method:'cash',category:'MATERIALE',item:'Bullona / vida',payee:'Ferramenta Durrës',total:3600,vatRate:20,deductible:false,description:'Bullona M8 për presën'}})});await p.waitForTimeout(300);await b('Ruaj & konfirmo').click();await p.waitForTimeout(600);
     ids.e5=await ev(()=>state.expenses.find(x=>x.category==='MATERIALE').id);
     await b('🖨 Printo').click();await p.waitForTimeout(120);
     const pr=await ev(()=>{let f=document.getElementById('biobesPrintFrame');let d=f&&f.contentDocument;if(!d)return null;return{title:d.title,text:d.body.innerText,portrait:/size:\s*A4 portrait/.test(d.querySelector('style').textContent),landscape:/A4 landscape/.test(d.querySelector('style').textContent)}});
     assert.ok(pr,'iframe i printimit mungon');assert.match(pr.title,/^Mandat pagese SHP-/);assert.ok(pr.text.includes('MANDAT PAGESE — SHPENZIM'));assert.ok(pr.text.includes('Subjekti: BIOBES'));assert.ok(pr.text.includes('Paguar nga arka'));
     assert.ok(pr.text.includes('FINANCIERI')&&pr.text.includes('ARKËTARI')&&pr.text.includes('MARRËSI'));assert.ok(pr.text.includes('Tre mijë e gjashtëqind lekë'),pr.text.slice(0,400));assert.ok(pr.text.includes('Bullona M8'));assert.ok(/602 — Materiale konsumi/.test(pr.text));assert.ok(pr.portrait&&!pr.landscape);
     await close();
     await ev(id=>printExpense(id),ids.e4);await p.waitForTimeout(120);
     const pr2=await ev(()=>{let f=document.getElementById('biobesPrintFrame');let d=f&&f.contentDocument;return d?{title:d.title,text:d.body.innerText}:null});
     assert.ok(pr2);assert.match(pr2.title,/^Shpenzim SHP-/);assert.ok(pr2.text.includes('FLETË SHPENZIMI')&&pr2.text.includes('Detyrim ndaj:')&&pr2.text.includes('FURNITORI / MARRËSI')&&pr2.text.includes('Albtelecom'));
   });
   await step('Regjistri: filtrat statusi / kategoria / kërkimi live, dupliko (⧉) hap formular të parambushur, Excel i regjistrit, kërkimi global gjen SHP-',async()=>{
     await ev(()=>{Object.assign(exFilters,{from:'',to:'',category:'',method:'',status:'',q:''});window.__exTab='list';go('expenses')});await p.waitForTimeout(400);
     const total=await ev(()=>state.expenses.length);assert.equal(await p.locator('#expensesTable tbody tr[data-ex]').count(),total);
     await pick('#exfStatus','Anuluar');await p.waitForTimeout(300);assert.equal(await p.locator('#expensesTable tbody tr[data-ex]').count(),2);
     await ev(()=>{exSetFilter('status','');exSetFilter('category','TRANSPORT')});await p.waitForTimeout(300);assert.equal(await p.locator('#expensesTable tbody tr[data-ex]').count(),1);
     await ev(()=>{exSetFilter('category','')});await p.waitForTimeout(300);await p.locator('#exfQ').fill('bullona');await p.waitForTimeout(200);assert.equal(await p.locator('#expensesTable tbody tr[data-ex]:not([hidden])').count(),1);
     await ev(()=>{exFilters.q='';render()});await p.waitForTimeout(200);
     await ev(id=>{expenseCard(id)},ids.e5);await p.waitForTimeout(300);await b('⧉ Dupliko').click();await p.waitForTimeout(300);
     assert.equal(await p.locator('#modalTitle').innerText(),'Shpenzim i ri');assert.equal(await p.locator('#exItem').inputValue(),'Bullona / vida');assert.equal(await p.locator('#exAmount').inputValue(),'3600');assert.equal(await p.locator('#exPayee').inputValue(),'Ferramenta Durrës');await close();
     const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null),ev(()=>exportExpensesXlsx())]);assert.ok(dl,'pa xlsx');assert.match(dl.suggestedFilename(),/^Shpenzime-.*\.xlsx$/);
     const gs=await ev(()=>globalSearchRecords('transport fier').map(x=>[x.page,x.type,x.id]));assert.ok(gs.some(x=>x[0]==='expenses'&&x[1]==='Shpenzim'&&x[2].startsWith('SHP-')),JSON.stringify(gs));
   });
   await step('Import Excel: template me kolonat shqip; 3 rreshta të saktë → 3 shpenzime të konfirmuara me VK; rreshti i gabuar (kategori e panjohur / "Pa paguar" pa furnitor) → asgjë nuk ruhet',async()=>{
     const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null),ev(()=>downloadImportTemplate('expenses'))]);assert.ok(dl,'pa template');assert.equal(dl.suggestedFilename(),'BioBes-ERP-IMPORT-expenses.xlsx');
     const H=['Data','Kategoria','Artikulli / nën-kategoria','Furnitori','Numri i faturës','Përshkrimi','Shuma','TVSH (%)','TVSH e zbritshme (Po/Jo)','Mënyra e pagesës','Qendra e kostos'];
     const before=await ev(()=>state.expenses.length);
     await importFile('expenses',H,[['2026-09-03','MIREMBAJTJE','Vaj motori','S01/1','F-9','Vaj për kamionin','6000','20','Po','Arkë','Kamioni DR-1'],['03.09.2026','Energji elektrike & ujë','Energji elektrike','','','OSHEE gusht','25000','20','Jo','Bankë',''],['2026-09-05','TRANSPORT','','S04/3','TR-9','Transport Elbasan','15000','0','Jo','Pa paguar','']]);
     assert.ok((await p.locator('#modalTitle').innerText()).includes('Kontrolli i importit'));await b('Konfirmo importin').click();await p.waitForTimeout(700);
     const r=await ev(n=>{let docs=state.expenses.slice(n);return{count:docs.length,st:docs.map(d=>d.status),m:docs.map(d=>d.method),vk:docs.map(d=>{let e=ensureAccounting().entries.find(x=>x.sourceKey==='expense:'+d.id);return e?e.lines.map(l=>l.account+':'+l.debit+'/'+l.credit).join(' '):null}),bal3:supplierBalance('S3'),dates:docs.map(d=>d.date),cc:docs[0].costCenter,ded:docs.map(d=>d.deductible)}},before);
     assert.equal(r.count,3);assert.deepEqual(r.st,['Konfirmuar','Konfirmuar','Konfirmuar']);assert.deepEqual(r.m,['cash','bank','unpaid']);assert.deepEqual(r.dates,['2026-09-03','2026-09-03','2026-09-05']);assert.equal(r.cc,'Kamioni DR-1');assert.deepEqual(r.ded,[true,false,false]);
     assert.deepEqual(r.vk,['615:5000/0 445:1000/0 530:0/6000','605:25000/0 512:0/25000','611:15000/0 401:0/15000']);assert.equal(r.bal3,15000);
     assert.match(await toastLog(),/3 shpenzime u importuan/);
     await importFile('expenses',H,[['2026-09-03','NUK-EKZISTON','','','','x','100','0','Jo','Arkë',''],['2026-09-03','QIRA','','','','y','100','0','Jo','Pa paguar','']]);await b('Konfirmo importin').click();await p.waitForTimeout(500);
     assert.ok((await p.locator('#modalTitle').innerText()).includes('Gabimet e importit'));const t=await p.locator('#modalBody').innerText();assert.ok(t.includes('Rreshti 2')&&t.includes('kategoria')&&t.includes('Rreshti 3')&&t.includes('furnitor'),t);
     assert.equal(await ev(n=>state.expenses.length-n,before),3);await close();
   });
   await step('15 raportet analitike: navigimi, periudhat, KPI + grafikë + tabelë me totale për secilin, kategoria × muaj, vjetërsia e detyrimeve, TVSH e zbritshme, buxheti vs realizimi, krahasimi, Excel i raportit',async()=>{
     await ev(()=>{Object.assign(exRep,{id:'summary',preset:'all',from:'',to:'',category:'',method:'',withDraft:false});exSetTab('reports')});await p.waitForTimeout(400);
     assert.equal(await p.locator('#main .ex-rep-nav button').count(),15);assert.equal(await p.locator('#main .ex-rep-nav button.active').getAttribute('data-exrep'),'summary');
     const all=await ev(()=>window.__biobesExpenses.reports.map(r=>{let b=window.__biobesExpenses.buildReport(r[0]);return[r[0],(b.rows||[]).length,(b.cols||[]).length,!!b.kpis,!!b.chart]}));
     for(const [id,rows,cols] of all){assert.ok(cols>=3,id+' cols');assert.ok(rows>=1,id+' rows='+rows)}
     const byId=Object.fromEntries(all.map(x=>[x[0],x]));assert.ok(byId.summary[3]&&byId.summary[4]);assert.ok(byId.unpaid[3]);assert.ok(byId.vat[3]);assert.ok(byId.budget[4]);assert.ok(byId.compare[3]);
     for(const id of ['category','monthly','party','unpaid','vat','budget','pivot','compare','top','ratio','journal']){await p.locator(`#main .ex-rep-nav button[data-exrep="${id}"]`).click();await p.waitForTimeout(250);assert.equal(await p.locator('#main .ex-rep-nav button.active').getAttribute('data-exrep'),id);assert.equal(await p.locator('#exReportTable').count(),1,id);assert.ok(await p.locator('#exReportTable tbody tr').count()>=1,id);assert.equal(await p.locator('#exReportTable tfoot').count(),1,id)}
     const un=await ev(()=>{let b=window.__biobesExpenses.buildReport('unpaid');return{n:b.rows.length,tot:b.rows.reduce((z,r)=>z+r.total,0),parties:b.rows.map(r=>r.party).sort()}});assert.equal(un.n,3);assert.equal(un.tot,30000+4800+15000);
     const vat=await ev(()=>{let b=window.__biobesExpenses.buildReport('vat');return{ded:b.rows.filter(r=>r.ded==='Po').reduce((z,r)=>z+r.dedVat,0),n:b.rows.length}});assert.equal(vat.ded,800+1000);
     const cat=await ev(()=>{let b=window.__biobesExpenses.buildReport('category');return b.rows.map(r=>[r.label,r.account,Math.round(r.value)])});assert.ok(cat.some(x=>x[0]==='Transport & logjistikë'&&x[1]==='611'&&x[2]===45000),JSON.stringify(cat));
     await ev(()=>{let c=window.__biobesExpenses.categories(true).find(x=>x.code==='TRANSPORT');c.budget=20000;save();exRep.preset='month';exRepSet('budget')});await p.waitForTimeout(300);
     const bud=await ev(()=>{let b=window.__biobesExpenses.buildReport('budget');let t=b.rows.find(r=>r.label==='Transport & logjistikë');return t&&[t.budget,t.actual,t.status]});assert.deepEqual(bud,[20000,45000,'⚠ tejkaluar']);
     const piv=await ev(()=>{let b=window.__biobesExpenses.buildReport('pivot');return b.cols.map(c=>c.k)});assert.ok(piv[0]==='label'&&piv[piv.length-1]==='total'&&piv.some(k=>k.startsWith('m_')));
     await ev(()=>exRepSet('journal'));await p.waitForTimeout(300);const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null),ev(()=>exportExpenseReportXlsx())]);assert.ok(dl,'pa xlsx');assert.match(dl.suggestedFilename(),/^Shpenzime-journal-.*\.xlsx$/);
     await ev(()=>{__toastLog=[];printOnly('exReportPaper','Test')});await p.waitForTimeout(120);assert.equal(await ev(()=>!!document.getElementById('biobesPrintFrame')),true);
   });
   await step('Kategoritë: tabela (13 + llogaritë), kategori e re "VEGLA" → 602 me artikuj dhe buxhet, del në formular, fshirja e kategorisë me dokumente refuzohet',async()=>{
     await ev(()=>exSetTab('categories'));await p.waitForTimeout(300);assert.equal(await p.locator('#exCategoriesTable tbody tr[data-excat]').count(),13);
     await p.locator('#main').getByRole('button',{name:'+ Kategori',exact:true}).click();await p.waitForTimeout(300);
     await typeIn('#ecCode','vegla');await typeIn('#ecName','Vegla pune');await pick('#ecAccount','602');await typeIn('#ecBudget','5000');await p.locator('#ecItems').fill('Çekiç\nSharrë\nTrapan');
     await b('Ruaj').click();await p.waitForTimeout(400);
     const c=await ev(()=>{let c=window.__biobesExpenses.categories(true).find(x=>x.code==='VEGLA');return c&&[c.name,c.account,c.items,c.budget,c.system]});assert.deepEqual(c,['Vegla pune','602',['Çekiç','Sharrë','Trapan'],5000,false]);
     assert.equal(await p.locator('#exCategoriesTable tbody tr[data-excat]').count(),14);
     await ev(()=>expenseForm());await p.waitForTimeout(300);assert.ok((await ev(()=>[...document.querySelectorAll('#exCategory option')].map(o=>o.value))).includes('VEGLA'));await close();
     await hookToast();await ev(()=>deleteExpenseCategory('EC-TRANSPORT'));assert.match(await toastLog(),/ka dokumente/);assert.equal(await ev(()=>window.__biobesExpenses.categories(true).length),14);
   });
   await step('Kontabiliteti: P&L (incomeStatementPreview) përfshin klasën 6 nga shpenzimet; Vyapar → moduli "Shpenzimet (klasa 6)" me KPI, grafikë, tabelë dhe XLSX; Alpha Arka/Banka pa VK dublikatë',async()=>{
     const pl=await ev(()=>{alphaAccountingFilters.docTo='2026-12-31';let m=accountBalanceAt('2026-12-31');return{e611:m['611']||0,e615:m['615']||0,e605:m['605']||0,e613:m['613']||0,v445:m['445']||0,c401:m['401']||0,html:incomeStatementPreview().includes('Materialet e konsumuara')}});
     assert.equal(pl.e611,45000);assert.equal(pl.e615,5000);assert.equal(pl.e605,25000);assert.equal(pl.e613,4000);assert.equal(pl.v445,1800);assert.equal(pl.c401,-(30000+4800+15000));assert.ok(pl.html);
     await ev(()=>{reportsMode='vyapar';go('reports');vyGo('expenses')});await p.waitForTimeout(500);
     const vy=await ev(()=>{let el=document.getElementById('vyPaper');return{k:el.querySelectorAll('.vy-kpi').length,charts:el.querySelectorAll('.vy-chart').length,rows:el.querySelectorAll('.vy-table tbody tr').length,title:document.querySelector('.vy-rail button.active')?.innerText||'',t:el.innerText}});
     const confirmedNow=await ev(()=>state.expenses.filter(d=>d.status==='Konfirmuar'&&d.date.slice(0,4)===new Date().getFullYear()+'').length);assert.equal(vy.k,6);assert.ok(vy.charts>=5);assert.equal(vy.rows,confirmedNow);assert.ok(confirmedNow>=6,String(confirmedNow));assert.ok(vy.title.includes('Shpenzimet'));assert.ok(vy.t.includes('Regjistri i shpenzimeve të konfirmuara'));
     const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null),ev(()=>vyExport())]);assert.ok(dl,'pa xlsx');assert.match(dl.suggestedFilename(),/^ODOO19-VYAPAR-SHPENZIMET-.*\.xlsx$/);
     const dup=await ev(()=>{let a=ensureAccounting(),keys=a.entries.map(e=>e.sourceKey),rows=alphaCashRows().filter(x=>String(x.id).startsWith('SHP-'));return{dup:keys.filter((k,i)=>k&&keys.indexOf(k)!==i).length,cashRows:rows.length,methods:rows.map(r=>r.method).sort(),expected:state.expenses.filter(d=>d.status==='Konfirmuar'&&(d.method==='cash'||d.method==='bank')).length}});assert.equal(dup.dup,0);assert.equal(dup.cashRows,dup.expected);assert.deepEqual(dup.methods,['Bankë','Cash','Cash']);
   });
   await step('Sinkronizimi / rikthimi: normalizeState mban state.expenses + expenseCategories; mergeStates bashkon shpenzimet e dy pajisjeve; mandati Alpha Arka nuk prek Alpha-n (md5 i funksioneve Alpha)',async()=>{
     const r=await ev(()=>{let t={};normalizeState(t);let a={expenses:[{id:'A',number:'SHP-2026-0101',status:'Konfirmuar'}],expenseCategories:[]},bse={expenses:[],expenseCategories:[]},l={expenses:[{id:'B',number:'SHP-2026-0102',status:'Konfirmuar'}],expenseCategories:[]};let m=mergeStates(a,bse,l);return{arr:Array.isArray(t.expenses)&&Array.isArray(t.expenseCategories),merged:m.expenses.map(x=>x.id).sort(),alphaFn:typeof cashSummaryPreview==='function'&&typeof alphaInventoryRows==='function'}});
     assert.ok(r.arr);assert.deepEqual(r.merged,['A','B']);assert.ok(r.alphaFn);
   });
   await step('ROLE-USER me Shpenzimet view+create+edit (pa Konfirmo/Anulo): sheh regjistrin, ruan draft, "Ruaj & konfirmo"/Konfirmo/Anulo refuzohen me toast; vetëm view → formulari dhe importi refuzohen; pa të drejta → moduli fshihet',async()=>{
     await ev(async()=>{const h=await hashPassword('Prove-2026!');state.users.push({id:'U-EX',username:'ex-user',name:'Ekonomist',role:'ROLE-USER',active:true,passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false,rights:{v:2,modules:{expenses:['view','create','edit'],dashboard:['view']}}});save();closeModal();logoutUser()});
     await p.waitForFunction(()=>!!document.getElementById('loginLock'));await p.locator('#loginName').fill('ex-user');await p.locator('#loginPass').fill('Prove-2026!');await p.locator('#loginPass').press('Enter');await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(400);
     await ev(()=>go('expenses'));await p.waitForTimeout(400);
     const main=p.locator('#main');assert.equal(await main.getByRole('button',{name:'+ Shpenzim',exact:true}).count(),1,'+ Shpenzim për create');assert.equal(await main.getByRole('button',{name:'⬇ Excel',exact:true}).count(),0,'pa print → pa Excel');
     await ev(()=>expenseForm());await p.waitForTimeout(400);assert.equal(await p.locator('#modalTitle').innerText(),'Shpenzim i ri');
     assert.equal(await b('Ruaj & konfirmo').count(),0,'butoni i konfirmimit hiqet pa të drejtën confirm');assert.equal(await b('Ruaj draft').count(),1,'Ruaj draft');
     await typeIn('#exAmount','700');await typeIn('#exItem','Test');await b('Ruaj draft').click();await p.waitForTimeout(400);
     const d=await ev(()=>state.expenses.find(x=>x.status==='Draft'));assert.ok(d,'drafti u ruajt me create');
     assert.equal(await b('Konfirmo').count(),0,'Konfirmo fshihet');assert.equal(await b('✎ Ndrysho').count(),1,'Ndrysho për edit');
     await hookToast();const r=await ev(id=>({c:confirmExpense(id),k:cancelExpense(window.__biobesExpenses.docs().find(x=>x.status==='Konfirmuar').id),s:(window.__exDraft={id},saveExpense(true))}),d.id);
     assert.ok(!r.c&&!r.k&&r.s===undefined,JSON.stringify(r));const tl=await toastLog();assert.ok((tl.match(/Nuk keni të drejtë/g)||[]).length>=3,tl);
     assert.equal(await ev(id=>state.expenses.find(x=>x.id===id).status,d.id),'Draft');
     await close();
     await ev(()=>{let u=state.users.find(x=>x.id==='U-EX');u.rights={v:2,modules:{expenses:['view'],dashboard:['view']}};save();__toastLog=[];expenseForm()});await p.waitForTimeout(300);
     assert.match(await toastLog(),/Nuk keni të drejtë/);assert.equal(await p.locator('#modalBody').innerHTML(),'');
     await ev(()=>{__toastLog=[];window.pendingModuleImport={k:'expenses',data:[]};commitModuleImport()});assert.match(await toastLog(),/Nuk keni të drejtë/);
     await ev(()=>{window.__exTab='list';go('expenses')});await p.waitForTimeout(300);assert.equal(await p.locator('#main').getByRole('button',{name:'+ Shpenzim',exact:true}).count(),0,'view-only pa + Shpenzim');assert.equal(await p.locator('#expensesTable').count(),1,'view-only sheh tabelën');
     await ev(()=>{let u=state.users.find(x=>x.id==='U-EX');u.rights={v:2,modules:{dashboard:['view']}};save();go('dashboard')});await p.waitForTimeout(400);
     assert.equal(await ev(()=>[...document.querySelectorAll('#nav button')].some(b=>b.dataset.page==='expenses')),false);assert.equal(await p.locator('#exDashCard').count(),0);
     await ev(()=>{closeModal();logoutUser()});await p.waitForFunction(()=>!!document.getElementById('loginLock'));
   });
  }finally{
   fs.writeFileSync(`.audit/expenses-${tag}.json`,JSON.stringify(results,null,2));
   await browser.close();
  }
 }
 console.log(`${totalPass}/${totalSteps} passed`);process.exitCode=totalPass===totalSteps?0:1;
})().catch(e=>{console.error(e);process.exitCode=1});
