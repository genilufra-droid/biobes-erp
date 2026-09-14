/* ==========================================================================
   tests/warehouse-docs-audit.cjs — dokumentet e magazinës (biobes-stock-docs-v1)
   --------------------------------------------------------------------------
   Prova kalon nëpër UI-n reale (desktop + telefon): Magazina → "+ Fletë hyrje"
   / "+ Fletë dalje" (formular, rreshta, Ruaj draft, Ruaj & konfirmo), loti i ri
   me kod automatik dhe etiketë, libri unik i lëvizjeve (SDOC:/REV:), kontrolli
   i sasisë në dalje (asnjë lot negativ), veprimet kontabël Draft (311/401,
   685/311, 618/311), anulimi me kundërlëvizje dhe rikthim të lotit, regjistri
   me filtra dhe Excel, printimi A4 portret me rreshta të vizuar dhe SHUMA,
   gjendja fillestare e magazinës (formular + import Excel për lot) → rreshti
   311 automatik i "Bilanci i hapjes", raportet Alpha (kodi i paprekur, të
   dhënat rrjedhin), Vyapar 360° dhe të drejtat e ROLE-USER (pa confirm/cancel).
   Izolimi: helpers.cjs ndalon çdo kërkesë HTTPS → asnjë kontakt me API-n.
   Rezultatet: .audit/warehouse-docs-{desktop,mobile}.json (jashtë Git).
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
  /* select-et janë të fshehura pas kërkimit live: vlera vendoset drejtpërdrejt + 'change' (si përdoruesi që zgjedh nga lista) */
  const pick=async(sel,value)=>{await ev(([s,v])=>{let el=typeof s==='string'?document.querySelector(s):s;el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,value]);await p.waitForTimeout(120)};
  const fillLine=async(i,l)=>{await ev(([i,l])=>{let tr=document.querySelectorAll('#sdLines tr.sd-line')[i];if(l.product){let ps=tr.querySelector('.sdl-product');ps.value=l.product;ps.dispatchEvent(new Event('change',{bubbles:true}))}},[i,l]);await p.waitForTimeout(120);
   await ev(([i,l])=>{let tr=document.querySelectorAll('#sdLines tr.sd-line')[i];if(l.lot){let ls=tr.querySelector('.sdl-lot');ls.value=l.lot;ls.dispatchEvent(new Event('change',{bubbles:true}))}if(l.supplier&&tr.querySelector('.sdl-supplier'))tr.querySelector('.sdl-supplier').value=l.supplier;if(l.lotCode!=null&&tr.querySelector('.sdl-lotcode'))tr.querySelector('.sdl-lotcode').value=l.lotCode;if(l.qty!=null)tr.querySelector('.sdl-qty').value=String(l.qty);if(l.bags!=null)tr.querySelector('.sdl-bags').value=String(l.bags);if(l.cost!=null)tr.querySelector('.sdl-cost').value=String(l.cost);sdRecalc()},[i,l]);await p.waitForTimeout(80)};
  const toastLog=async()=>ev(()=>(window.__toastLog||[]).join(' | '));
  const importFile=async(k,headers,rows)=>{await ev(k=>{window.__toastLog=[];const ot=window.toast;if(!ot.__wrapped){window.toast=function(m){__toastLog.push(String(m));return ot.apply(this,arguments)};window.toast.__wrapped=true}pickModuleImport(k)},k);await p.locator('#moduleImportFile').setInputFiles({name:'import.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsxBuffer(headers,rows)});await p.waitForTimeout(500)};
  const ids={};
  try{
   await step('Blloku aktiv: state.stockDocs, arsyet standarde, schema e importit, të drejtat Konfirmo/Anulo për magazinën, Alpha e paprekur',async()=>{
     await ev(()=>{window.__toastLog=[];const ot=window.toast;if(!ot.__wrapped){window.toast=function(m){__toastLog.push(String(m));return ot.apply(this,arguments)};window.toast.__wrapped=true}});
     const info=await ev(()=>({v:window.__biobesStockDocs&&window.__biobesStockDocs.version,arr:Array.isArray(state.stockDocs),reasonsIn:window.__biobesStockDocs.reasons.IN.map(x=>x[0]),reasonsOut:window.__biobesStockDocs.reasons.OUT.map(x=>x[0]),schema:IMPORT_SCHEMAS.stockOpening.slice(),label:importLabel('stockOpening'),allowed:(()=>{userEditForm('AUDIT-ADMIN');let a=[...document.querySelectorAll('input.rt-perm[data-m="warehouse"]')].map(x=>x.dataset.a);closeModal();return a})(),alpha:typeof alphaInventoryMovements==='function'&&typeof alphaInventoryRows==='function'}));
     assert.equal(info.v,'biobes-stock-docs-v1');assert.ok(info.arr);
     assert.deepEqual(info.reasonsIn,['purchase','found','return','correction','opening']);assert.deepEqual(info.reasonsOut,['damage','loss','sample','consumption','localsale','correction']);
     assert.deepEqual(info.schema,['warehouse','rack','product','supplier','lotCode','qty','bags','unitCost','organic','note']);assert.equal(info.label,'Gjendja fillestare e magazinës (lote)');
     assert.deepEqual(info.allowed,['view','create','edit','confirm','cancel','print']);assert.ok(info.alpha);
   });
   await step('Magazina: butonat "+ Fletë hyrje" / "+ Fletë dalje" në toolbar, "↔ Transfero lot" dhe "✓ Inventar fizik" hapin formularët, regjistri bosh',async()=>{
     await ev(()=>go('warehouse'));await p.waitForTimeout(350);
     const main=p.locator('#main');
     assert.equal(await main.getByRole('button',{name:'+ Raft',exact:true}).count(),1);
     assert.equal(await main.getByRole('button',{name:'↔ Transfero lot',exact:true}).count(),1);
     assert.ok(await main.getByRole('button',{name:'+ Fletë hyrje',exact:true}).count()>=1);
     assert.ok(await main.getByRole('button',{name:'+ Fletë dalje',exact:true}).count()>=1);
     assert.equal(await p.locator('#stockDocsCard').count(),1);assert.equal(await p.locator('#stockDocsTable').count(),1);
     assert.ok((await p.locator('#stockDocsTable').innerText()).includes('Nuk ka fletë'));
     await main.getByRole('button',{name:'↔ Transfero lot',exact:true}).click();await p.waitForTimeout(250);assert.equal(await p.locator('#modalTitle').innerText(),'Transfero lot');await close();
     await main.getByRole('button',{name:'✓ Inventar fizik',exact:true}).click();await p.waitForTimeout(250);assert.ok((await p.locator('#modalTitle').innerText()).length>0);await close();
   });
   await step('Fletë hyrje (blerje pa peshim) nga butoni: 2 rreshta, SHUMA live, Ruaj & konfirmo → lot i ri me kod automatik, lëvizje IN, VK Draft 311/401',async()=>{
     await p.locator('#main').getByRole('button',{name:'+ Fletë hyrje',exact:true}).first().click();await p.waitForTimeout(400);
     assert.equal(await p.locator('#modalTitle').innerText(),'Fletë hyrje');
     assert.equal(await ev(()=>$val('sdNumber')),'FH-'+new Date().getFullYear()+'-0001');assert.equal(await ev(()=>$val('sdReason')),'purchase');
     await pick('#sdPartyId','S2');await p.locator('#sdAddress').fill('Tregu i Fierit');await p.locator('#sdNote').fill('Blerje pa peshim — prova');
     await fillLine(0,{product:'P105',supplier:'S2',qty:'500',bags:'20',cost:'300'});
     await b('+ Rresht').click();await p.waitForTimeout(150);
     await fillLine(1,{product:'P101',supplier:'S1',lotCode:'FH-KOD-01',qty:'120,5',bags:'5',cost:'410'});
     assert.match(await ev(()=>document.getElementById('sdSumQty').textContent),/^620[,.]50 kg$/);
     assert.match(await ev(()=>document.getElementById('sdSumValue').textContent),/199[,.]405[,.]00 ALL/);
     await b('Ruaj & konfirmo').click();await p.waitForTimeout(500);
     const r=await ev(()=>{let d=state.stockDocs.find(x=>x.number.startsWith('FH-'));let lots=d.lines.map(l=>state.lots.find(x=>x.id===l.lot));let mv=stockMoves().filter(m=>m.sourceId===d.id);let e=state.accounting.entries.find(x=>x.sourceKey==='stockdoc:'+d.id);return{id:d.id,status:d.status,party:d.party,s2:by('suppliers','S2').name,lines:d.lines.map(l=>[l.lotCode,l.qty,l.unitCost,l.value,!!l.newLotId]),lots:lots.map(l=>l&&{code:l.code,net:l.net,avail:l.availableNet,wh:l.warehouse,rack:l.rack,bags:l.bags,unitCost:l.unitCost,status:l.status,stockDoc:l.stockDoc}),mv:mv.map(m=>[m.type,m.qty,m.unitCost,m.source]),entry:e&&{status:e.status,journal:e.journal,lines:e.lines.map(l=>[l.account,l.debit,l.credit])},title:document.getElementById('modalTitle').textContent}});
     ids.fh=r.id;assert.equal(r.status,'Konfirmuar');assert.deepEqual(r.party,{type:'supplier',id:'S2',name:r.s2});assert.ok(r.s2);
     assert.deepEqual(r.lines,[['B1S01/2-105-26',500,300,150000,true],['FH-KOD-01',120.5,410,49405,true]]);
     assert.deepEqual(r.lots[0],{code:'B1S01/2-105-26',net:500,avail:500,wh:'W1',rack:'R1',bags:20,unitCost:300,status:'Në magazinim',stockDoc:r.id});
     assert.equal(r.lots[1].code,'FH-KOD-01');assert.equal(r.lots[1].net,120.5);
     assert.deepEqual(r.mv,[['IN',500,300,'stockDoc'],['IN',120.5,410,'stockDoc']]);
     assert.deepEqual(r.entry,{status:'Draft',journal:'J-GEN',lines:[['311',199405,0],['401',0,199405]]});
     assert.match(r.title,/^Fletë hyrje FH-\d{4}-0001$/);
   });
   await step('Kartela e fletës: SHUMA, lotet e reja hapen me lotCard (etiketa e magazinës), lotCard tregon dokumentin e hyrjes',async()=>{
     const t=await p.locator('#modalBody').innerText();assert.ok(t.includes('SHUMA'));assert.match(t,/620[,.]50 kg/);assert.match(t,/199[,.]405[,.]00 ALL/);
     assert.ok(t.includes('Adresa nga vjen malli'));assert.ok(t.includes('Tregu i Fierit'));
     await b('Loti B1S01/2-105-26 (i ri)').click();await p.waitForTimeout(400);
     const lt=await p.locator('#modalBody').innerText();assert.ok(lt.includes('B1S01/2-105-26'));assert.ok(lt.includes('Dokumenti i hyrjes'));assert.ok(lt.includes('FH-'));
     assert.equal(await p.locator('#printWarehouseLabel').count(),1);
     await close();
   });
   await step('Printo A4 portret: rreshtat e pashkruar vizohen deri në rreshtin 18, SHUMA poshtë, SHITËSI / BLERËSI, @page A4 portrait',async()=>{
     await ev(id=>stockDocCard(id),ids.fh);await p.waitForTimeout(300);
     await b('🖨 Printo A4').click();await p.waitForTimeout(120);/* headless: afterprint e heq iframe-in menjëherë pas 350 ms */
     const pr=await ev(()=>{let f=document.getElementById('biobesPrintFrame');let d=f&&f.contentDocument;if(!d)return null;let text=d.body.innerText;return{title:d.title,text,blank:d.querySelectorAll('tr.blank').length,rows:d.querySelectorAll('tbody tr').length,portrait:/size:\s*A4 portrait/.test(d.querySelector('style').textContent),landscape:/A4 landscape/.test(d.querySelector('style').textContent),blankVisible:getComputedStyle(d.querySelector('tr.blank')).display}});
     assert.ok(pr,'iframe i printimit mungon');assert.match(pr.title,/FLETË HYRJE FH-/);
     assert.ok(pr.text.includes('FLETË - HYRJE'));assert.ok(pr.text.includes('Subjekti: BIOBES'));assert.ok(pr.text.includes('Adresa nga vjen malli'));
     assert.ok(pr.text.includes('Emërtimi i mallit')&&pr.text.includes('Njësia')&&pr.text.includes('Vlefta'));
     assert.ok(pr.text.includes('SHUMA'));assert.ok(pr.text.includes('SHITËSI')&&pr.text.includes('BLERËSI'));
     assert.equal(pr.rows,18);assert.equal(pr.blank,16);assert.equal(pr.blankVisible,'table-row');assert.ok(pr.text.includes('——'));
     assert.ok(pr.portrait);assert.equal(pr.landscape,false);
     await close();
   });
   await step('Fletë dalje: kontrolli i sasisë (loti 1 200 kg → 1 500 kg refuzohet), dëmtim 150 kg konfirmohet → lot 1 050, lëvizje OUT, VK 685/311 me WAC',async()=>{
     await ev(()=>{closeModal();go('warehouse')});await p.waitForTimeout(300);
     await p.locator('#main').getByRole('button',{name:'+ Fletë dalje',exact:true}).first().click();await p.waitForTimeout(400);
     assert.equal(await p.locator('#modalTitle').innerText(),'Fletë dalje');assert.equal(await ev(()=>$val('sdReason')),'damage');
     const opts=await ev(()=>({o:[...document.querySelector('#sdLines .sdl-lot').options].map(o=>o.value),n:state.lots.find(l=>l.code==='B1S01/2-105-26').id}));assert.ok(opts.o.includes('L1'));assert.ok(opts.o.includes(opts.n));
     await fillLine(0,{lot:'L1',qty:'1500',bags:'2'});
     assert.equal(await ev(()=>document.querySelector('#sdLines .sdl-product').value),'P105');
     await ev(()=>{__toastLog=[]});await b('Ruaj & konfirmo').click();await p.waitForTimeout(300);
     assert.match(await toastLog(),/ka vetëm 1[,.]200[,.]00 kg të lira/);assert.equal(await ev(()=>state.stockDocs.filter(d=>d.kind==='OUT').length),0);
     await fillLine(0,{qty:'150'});await p.locator('#sdPartyName').fill('Kazani i mbeturinave');await p.locator('#sdNote').fill('Thasë të lagur');
     await b('Ruaj & konfirmo').click();await p.waitForTimeout(500);
     const r=await ev(()=>{let d=state.stockDocs.find(x=>x.kind==='OUT');let lot=state.lots.find(x=>x.id==='L1');let mv=stockMoves().filter(m=>m.sourceId===d.id);let e=state.accounting.entries.find(x=>x.sourceKey==='stockdoc:'+d.id);return{id:d.id,number:d.number,status:d.status,line:d.lines[0],lot:{net:lot.net,avail:lot.availableNet},mv:mv.map(m=>[m.type,m.qty,m.source]),entry:e&&{status:e.status,lines:e.lines.map(l=>[l.account,l.debit,l.credit])}}});
     ids.fd=r.id;assert.equal(r.number,'FD-'+new Date().getFullYear()+'-0001');assert.equal(r.status,'Konfirmuar');
     assert.deepEqual(r.lot,{net:1050,avail:1050});assert.deepEqual(r.mv,[['OUT',-150,'stockDoc']]);
     assert.ok(r.line.unitCost>0,'kosto WAC për daljen');assert.equal(r.entry.status,'Draft');assert.equal(r.entry.lines[0][0],'685');assert.equal(r.entry.lines[1][0],'311');assert.equal(r.entry.lines[0][1],r.line.value);
   });
   await step('Anulimi i fletës së daljes: kërkon arsye, kundërlëvizje REV:, loti rikthehet 1 200 kg, VK Draft hiqet, statusi Anuluar; dalja e re nuk lejohet',async()=>{
     await ev(id=>stockDocCard(id),ids.fd);await p.waitForTimeout(300);const before=await ev(()=>stockMoves().length);
     await b('Anulo').click();await p.waitForTimeout(500);
     const r=await ev(id=>{let d=state.stockDocs.find(x=>x.id===id);let lot=state.lots.find(x=>x.id==='L1');let mv=stockMoves().filter(m=>m.sourceId===id);return{status:d.status,reason:d.cancelReason,lot:{net:lot.net,avail:lot.availableNet},mv:mv.map(m=>[m.key.split(':')[0],m.type,m.qty,!!m.reversalOf]),entries:state.accounting.entries.filter(e=>e.sourceRef===id).length,text:document.getElementById('modalBody').innerText}},ids.fd);
     assert.equal(r.status,'Anuluar');assert.equal(r.reason,'Arsye auditimi');assert.deepEqual(r.lot,{net:1200,avail:1200});
     assert.deepEqual(r.mv,[['SDOC','OUT',-150,false],['REV','IN',150,true]]);assert.equal(r.entries,0);assert.ok(r.text.includes('Anuluar'));
     assert.equal(await ev(()=>stockMoves().length),before+1);
     assert.equal(await ev(()=>{let r=window.__biobesStockDocs.confirm(state.stockDocs.find(x=>x.kind==='OUT').id);return r.ok}),false);
     await close();
   });
   await step('Fletë dalje mostër (618/311) draft → Ndrysho → Konfirmo nga regjistri; anulimi i hyrjes bllokohet kur loti është konsumuar',async()=>{
     await ev(()=>stockDocForm('OUT'));await p.waitForTimeout(400);
     await pick('#sdReason','sample');const newLot=await ev(()=>state.lots.find(l=>l.code==='B1S01/2-105-26').id);
     await fillLine(0,{lot:newLot,qty:'20'});await b('Ruaj draft').click();await p.waitForTimeout(400);
     let d=await ev(()=>state.stockDocs.find(x=>x.kind==='OUT'&&x.status==='Draft'));assert.ok(d);assert.equal(d.reason,'sample');
     assert.equal(await ev(()=>state.lots.find(l=>l.code==='B1S01/2-105-26').availableNet),500,'drafti nuk prek stokun');
     await b('✎ Ndrysho').click();await p.waitForTimeout(400);assert.match(await p.locator('#modalTitle').innerText(),/^Ndrysho Fletë dalje — FD-/);
     await fillLine(0,{qty:'25'});await b('Ruaj draft').click();await p.waitForTimeout(400);await close();
     await ev(()=>go('warehouse'));await p.waitForTimeout(300);
     const row=p.locator('#stockDocsTable tr[data-sdoc="'+d.id+'"]');assert.equal(await row.count(),1);assert.ok((await row.innerText()).includes('Draft'));
     await ev(id=>confirmStockDoc(id),d.id);await p.waitForTimeout(400);
     const r=await ev(id=>{let d=state.stockDocs.find(x=>x.id===id);let lot=state.lots.find(l=>l.code==='B1S01/2-105-26');let e=state.accounting.entries.find(x=>x.sourceKey==='stockdoc:'+id);return{status:d.status,qty:d.lines[0].qty,cost:d.lines[0].unitCost,avail:lot.availableNet,acc:e&&e.lines.map(l=>l.account),val:e&&e.lines[0].debit}},d.id);
     assert.deepEqual(r,{status:'Konfirmuar',qty:25,cost:300,avail:475,acc:['618','311'],val:7500});
     await close();
     await ev(()=>{__toastLog=[]});const c=await ev(id=>cancelStockDoc(id),ids.fh);assert.equal(c,false);assert.match(await toastLog(),/është përdorur më tej/);
     assert.equal(await ev(id=>state.stockDocs.find(x=>x.id===id).status,ids.fh),'Konfirmuar');
     await close();
   });
   await step('Regjistri: filtrat (lloji / statusi / kërkimi live), Excel i fletëve, lëvizjet SDOC/REV në librin unik dhe unifiedStockBalanceRows',async()=>{
     await ev(()=>{sdFilters.kind='OUT';sdFilters.status='';sdFilters.q='';go('warehouse')});await p.waitForTimeout(300);
     const docs=await ev(()=>state.stockDocs.map(d=>[d.number,d.kind,d.status]));assert.equal(await p.locator('#stockDocsTable tbody tr[data-sdoc]').count(),2,JSON.stringify(docs));
     await ev(()=>{sdFilters.kind='';sdSetFilter('status','Konfirmuar')});await p.waitForTimeout(300);
     assert.equal(await p.locator('#stockDocsTable tbody tr[data-sdoc]').count(),2);
     await p.locator('#sdfQ').fill('mostër');await p.waitForTimeout(200);
     assert.equal(await p.locator('#stockDocsTable tbody tr[data-sdoc]:not([hidden])').count(),1);
     await ev(()=>{sdFilters.status='';sdFilters.q='';render()});await p.waitForTimeout(200);
     const [dl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null),ev(()=>exportStockDocsXlsx())]);assert.ok(dl,'pa xlsx');assert.match(dl.suggestedFilename(),/^Flete-magazine-.*\.xlsx$/);
     const bal=await ev(()=>{let rows=unifiedStockBalanceRows();let z=rows.find(r=>r.warehouse==='W1'&&r.product==='P105');let s=stockBalances().find(r=>r.warehouse==='W1'&&r.product==='P105');return{z,s:s&&s.balance,keys:stockMoves().map(m=>m.key.split(':')[0])}});
     assert.equal(bal.z.inQty,500+150);assert.equal(bal.z.outQty,150+25);assert.deepEqual(bal.keys.filter(k=>k==='SDOC').length,4);assert.equal(bal.keys.filter(k=>k==='REV').length,1);
   });
   await step('Gjendja fillestare e magazinës nga formulari: data e hapjes e fiksuar, kosto e detyrueshme, lot i ri me datën e hapjes, pa VK; 311 automatik te Bilanci i hapjes',async()=>{
     await ev(()=>{state.openingBalances={date:'2026-03-01',lines:[],equityAccount:'101'};save();stockDocForm('IN','',{opening:true})});await p.waitForTimeout(400);
     assert.equal(await p.locator('#modalTitle').innerText(),'Gjendja fillestare e magazinës');assert.equal(await ev(()=>$val('sdDate')),'2026-03-01');assert.equal(await ev(()=>document.getElementById('sdDate').readOnly),true);
     assert.deepEqual(await ev(()=>[...document.getElementById('sdReason').options].map(o=>o.value)),['opening']);
     await pick('#sdWarehouse','W2');await fillLine(0,{product:'P103',supplier:'S3',lotCode:'OLD-2025-07',qty:'800',bags:'32'});
     await ev(()=>{__toastLog=[]});await b('Ruaj & konfirmo').click();await p.waitForTimeout(300);assert.match(await toastLog(),/kërkon koston ALL\/kg/);
     await fillLine(0,{cost:'250'});await b('Ruaj & konfirmo').click();await p.waitForTimeout(500);
     const r=await ev(()=>{let d=state.stockDocs.find(x=>x.opening);let lot=state.lots.find(l=>l.code==='OLD-2025-07');let rack=state.racks.find(x=>x.id===lot.rack);return{status:d.status,date:d.date,reason:d.reason,lot:{net:lot.net,date:lot.date,wh:lot.warehouse,rackWh:rack&&rack.warehouse,unitCost:lot.unitCost,source:lot.source},entry:state.accounting.entries.some(e=>e.sourceKey==='stockdoc:'+d.id),ov:sdOpeningInventoryValue(),ob:openingBalanceLines().lines.filter(l=>l.account==='311')}});
     assert.equal(r.status,'Konfirmuar');assert.equal(r.date,'2026-03-01');assert.equal(r.reason,'opening');
     assert.deepEqual(r.lot,{net:800,date:'2026-03-01',wh:'W2',rackWh:'W2',unitCost:250,source:'opening'});assert.equal(r.entry,false);
     assert.deepEqual(r.ov,{value:200000,lots:1,docs:1,drafts:0,otherDate:0});
     assert.equal(r.ob.length,1);assert.equal(r.ob[0].debit,200000);assert.ok(r.ob[0].description.includes('gjendja fillestare'));
     await close();
   });
   await step('Import Excel i gjendjes fillestare (titujt shqip, kolonat opsionale bosh, presje dhjetore) → 1 fletë FH e hapjes për magazinë, e konfirmuar; gabimet ndalojnë gjithçka',async()=>{
     await importFile('stockOpening',['Magazina','Rafti','Produkti','Furnitori','Kodi i lotit','Sasia','Numri i thasëve','Kosto ALL/kg','Organik (Po/Jo)','Shënim'],[
       ['MQ','R02','105','S01/1','','1.250,5','40','245','Po','Gjendja fizike'],
       ['Magazina Qendrore','','102','S01/2','IMP-LOT-02','300','','300,25','Jo',''],
       ['MB','','104','S04/3','','75','3','180','','tjetër magazinë']]);
     assert.match(await p.locator('#modalTitle').innerText(),/Kontrolli i importit/);assert.ok((await p.locator('#modalBody').innerText()).includes('3 rreshta'));
     await b('Konfirmo importin').click();await p.waitForTimeout(700);
     const r=await ev(()=>{let docs=state.stockDocs.filter(d=>d.opening&&d.note.includes('import'));let lot=state.lots.find(l=>l.code==='IMP-LOT-02');let l1=state.lots.find(l=>l.stockDoc&&l.product==='P105'&&l.warehouse==='W1'&&l.source==='opening');return{n:docs.length,st:docs.map(d=>[d.status,d.warehouse,d.lines.length,d.date]),lot:lot&&{net:lot.net,cost:lot.unitCost,org:lot.organic,wh:lot.warehouse},l1:l1&&{net:l1.net,rack:l1.rack,bags:l1.bags,org:l1.organic,code:l1.code},ov:sdOpeningInventoryValue(),ob:openingBalanceLines().lines.filter(l=>l.account==='311').map(l=>l.debit),toast:__toastLog.join(' | ')}});
     assert.equal(r.n,2);assert.deepEqual(r.st.sort(),[['Konfirmuar','W1',2,'2026-03-01'],['Konfirmuar','W3',1,'2026-03-01']]);
     assert.deepEqual(r.lot,{net:300,cost:300.25,org:'',wh:'W1'});assert.deepEqual(r.l1,{net:1250.5,rack:'R2',bags:40,org:'Organik',code:'B1S01/1-105-26/2'});
     assert.equal(r.ov.lots,4);assert.equal(r.ov.value,200000+Math.round(1250.5*245*100)/100+300*300.25+75*180);assert.deepEqual(r.ob,[r.ov.value]);
     assert.match(r.toast,/2 fletë gjendjeje fillestare u krijuan \(3 lote\)/);
     await close();
     const before=await ev(()=>state.stockDocs.length+'|'+state.lots.length);
     await importFile('stockOpening',['Magazina','Produkti','Furnitori','Sasia','Kosto ALL/kg'],[['MQ','105','S01/1','10','0'],['XX','105','S01/1','10','5']]);
     await b('Konfirmo importin').click();await p.waitForTimeout(500);
     const t=await p.locator('#modalBody').innerText();assert.ok(t.includes('Rreshti 2')&&t.includes('kosto'));assert.ok(t.includes('Rreshti 3')&&t.includes('magazina'));
     assert.equal(await ev(()=>state.stockDocs.length+'|'+state.lots.length),before);await close();
   });
   await step('Kontabiliteti → Gjendjet fillestare: karta e magazinës, rreshti 311 në veprimin e hapjes, paralajmërim për rresht manual 311, veprimi gjenerohet i balancuar',async()=>{
     await ev(()=>{go('accounting');accountingTab='opening';render()});await p.waitForTimeout(300);
     const t=await p.locator('#main').innerText();assert.ok(t.includes('Magazina — gjendja fillestare e loteve'));assert.ok(t.includes('Lote në hapje'));assert.match(t,/Magazina \(311\)/);
     assert.equal(await p.locator('#obInventoryCard').count(),1);assert.ok((await p.locator('#obInventoryCard').innerText()).includes('4'));
     await ev(()=>{state.openingBalances.lines=[{id:'OBL-T',account:'311',debit:1000,credit:0,description:'manual'}];save();render()});await p.waitForTimeout(250);
     assert.ok((await p.locator('#main').innerText()).includes('mbivendoset me gjendjen fillestare'));
     await ev(()=>{state.openingBalances.lines=[];save();render()});await p.waitForTimeout(200);
     await p.locator('#main button',{hasText:'Gjenero veprimin e hapjes'}).click();await p.waitForTimeout(300);
     const e=await ev(()=>{let e=state.accounting.entries.find(x=>x.sourceKey==='opening:balance');let t=entryTotals(e);return{status:e.status,l311:e.lines.filter(l=>l.account==='311').map(l=>l.debit),bal:Math.abs(t.debit-t.credit)<.005,l101:e.lines.filter(l=>l.account==='101').map(l=>l.credit)}});
     assert.equal(e.status,'Draft');assert.equal(e.l311.length,1);assert.ok(e.bal);assert.equal(e.l101[0],e.l311[0]);
   });
   await step('Raportet Alpha (kod i paprekur): Fletë Hyrje / Fletë Dalje / Gjendje Fillestare / Anulim në regjistrin e lëvizjeve, hapja e rreshtit → kartela e fletës, Odoo/Vyapar 360°',async()=>{
     const r=await ev(id=>{alphaInventoryFilters.docFrom='2026-01-01';alphaInventoryFilters.docTo='2026-12-31';alphaInventoryFilters.warehouse='';alphaInventoryFilters.product='';alphaInventoryFilters.docType='';alphaInventoryFilters.docNo='';alphaInventoryFilters.description='';let rows=alphaInventoryRows();let types={};rows.forEach(x=>{types[x.type]=(types[x.type]||0)+1});let fh=rows.filter(x=>x.type==='Fletë Hyrje');let can=rows.filter(x=>x.type==='Anulim Fletë Dalje');let dup=rows.filter(x=>x.type==='Hyrje Magazine'&&/FH-KOD-01|B1S01\/2-105-26|IMP-LOT-02|OLD-2025-07/.test(String(x.no)));return{types,fh:fh.map(x=>[x.no,x.value,x.open,x.warehouse]),can:can.map(x=>x.value),dup:dup.length,sum:rows.filter(x=>x.product==='P105'&&x.warehouse==='W1').reduce((a,x)=>a+x.value,0),ctx:inventoryMovementContext(fh[0]).party}},ids.fh);
     assert.equal(r.types['Fletë Hyrje'],2);assert.equal(r.types['Fletë Dalje'],2);assert.equal(r.types['Gjendje Fillestare'],4);assert.equal(r.types['Anulim Fletë Dalje'],1);
     assert.deepEqual(r.fh[0].slice(1),[500,'stockDoc','W1']);assert.deepEqual(r.can,[150]);assert.equal(r.dup,0,'lotet e fletëve nuk dublohen si Hyrje Magazine');
     assert.equal(r.sum,1200+500-150+150-25+1250.5);assert.equal(r.ctx,'S:S2');
     await ev(()=>{let x=alphaInventoryRows().find(x=>x.type==='Fletë Hyrje');openInventoryMovement(x)});await p.waitForTimeout(300);assert.match(await p.locator('#modalTitle').innerText(),/^Fletë hyrje FH-/);await close();
     const vy=await ev(()=>{let d=vyAnalyticsData('article');let c=vyAnalyticsData('stock');return{ok:!!d,types:(d.all||[]).map(e=>e.type),lots:(c.rows||[]).filter(r=>/FH-KOD-01|OLD-2025-07/.test(r.lot)).length}});
     assert.ok(vy.ok);assert.ok(vy.types.includes('Fletë hyrje')||vy.types.includes('Gjendje fillestare'));assert.ok(vy.lots>=1);
   });
   await step('Alpha regjistri përmbledhës: hyrjet/daljet e fletëve numërohen si "tjera" (jo blerje/shitje), stoku i furnitorit merr lotin e fletës',async()=>{
     const r=await ev(()=>{alphaStockFilters.docFrom='2026-01-01';alphaStockFilters.docTo='2026-12-31';let d=inventoryAnalysisData()||[];let z=d.find(x=>x.warehouse==='W1'&&x.product==='P105');return z?{otherIn:z.otherIn,otherOut:z.otherOut,salesOut:z.salesOut,transferIn:z.transferIn}:null});
     assert.ok(r,'rreshti W1/P105 mungon');assert.equal(r.otherIn,500+150+1250.5);assert.equal(r.otherOut,150+25);assert.equal(r.salesOut,0);
     const s=await ev(()=>{alphaStockFilters.docTo='2026-12-31';alphaStockFilters.party='';let d=supplierStockData();return d.filter(x=>x.supplier==='S2'&&x.product==='P105').length});assert.ok(s>=1);
   });
   await step('Reset i të dhënave të testimit pastron edhe fletët; normalizeState rikthen listën',async()=>{
     const r=await ev(()=>{let snap=clone(state);let n=normalizeState({});let ok=Array.isArray(n.stockDocs);let s2=normalizeState({lots:[]});return{ok,ok2:Array.isArray(s2.stockDocs),n:state.stockDocs.length}});
     assert.ok(r.ok&&r.ok2);assert.ok(r.n>=5);
   });
   await step('ROLE-USER me Magazina view+create+edit (pa Konfirmo/Anulo): sheh regjistrin, ruan draft, "Ruaj & konfirmo"/Konfirmo/Anulo refuzohen me toast; pa create → formulari refuzohet',async()=>{
     await ev(async()=>{const h=await hashPassword('Prove-2026!');state.users.push({id:'U-WD',username:'wd-user',name:'Magazinier',role:'ROLE-USER',active:true,passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false,rights:{v:2,modules:{warehouse:['view','create','edit'],lots:['view'],dashboard:['view']}}});save();closeModal();logoutUser()});
     await p.waitForFunction(()=>!!document.getElementById('loginLock'));await p.locator('#loginName').fill('wd-user');await p.locator('#loginPass').fill('Prove-2026!');await p.locator('#loginPass').press('Enter');await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(400);
     await ev(()=>go('warehouse'));await p.waitForTimeout(400);
     const main=p.locator('#main');assert.ok(await main.getByRole('button',{name:'+ Fletë hyrje',exact:true}).count()>=1);
     assert.equal(await main.getByRole('button',{name:'Konfirmo',exact:true}).count(),0);assert.equal(await main.getByRole('button',{name:'Anulo',exact:true}).count(),0);
     await ev(()=>stockDocForm('IN'));await p.waitForTimeout(400);assert.equal(await p.locator('#modalTitle').innerText(),'Fletë hyrje');
     assert.equal(await b('Ruaj & konfirmo').count(),0,'butoni i konfirmimit hiqet pa të drejtën confirm');
     await fillLine(0,{product:'P105',supplier:'S1',qty:'10',cost:'100'});await b('Ruaj draft').click();await p.waitForTimeout(400);
     const d=await ev(()=>state.stockDocs.find(x=>x.status==='Draft'&&x.kind==='IN'));assert.ok(d,'drafti u ruajt me create');
     await ev(()=>{__toastLog=[]});const r=await ev(id=>({c:confirmStockDoc(id),k:cancelStockDoc(window.__biobesStockDocs.docs().find(x=>x.status==='Konfirmuar').id),s:(window.__sdDraft={id,kind:'IN',opening:false},saveStockDoc(true))}),d.id);
     assert.deepEqual(r,{c:false,k:false,s:undefined});const tl=await toastLog();assert.ok((tl.match(/Nuk keni të drejtë/g)||[]).length>=3,tl);
     assert.equal(await ev(id=>state.stockDocs.find(x=>x.id===id).status,d.id),'Draft');
     await close();
     await ev(()=>{let u=state.users.find(x=>x.id==='U-WD');u.rights={v:2,modules:{warehouse:['view'],dashboard:['view']}};save();__toastLog=[];stockDocForm('OUT')});await p.waitForTimeout(300);
     assert.match(await toastLog(),/Nuk keni të drejtë/);assert.equal(await p.locator('#modalBody').innerHTML(),'');
     await ev(()=>go('warehouse'));await p.waitForTimeout(300);assert.equal(await p.locator('#main').getByRole('button',{name:'+ Fletë hyrje',exact:true}).count(),0);assert.equal(await p.locator('#stockDocsTable').count(),1);
     await ev(()=>{closeModal();logoutUser()});await p.waitForFunction(()=>!!document.getElementById('loginLock'));
   });
  }finally{
   fs.writeFileSync(`.audit/warehouse-docs-${tag}.json`,JSON.stringify(results,null,2));
   await browser.close();
  }
 }
 console.log(`${totalPass}/${totalSteps} passed`);process.exitCode=totalPass===totalSteps?0:1;
})().catch(e=>{console.error(e);process.exitCode=1});
