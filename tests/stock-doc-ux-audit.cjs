/* ==========================================================================
   tests/stock-doc-ux-audit.cjs — Fletë hyrje / dalje v2 (biobes-stock-docs-v2)
   --------------------------------------------------------------------------
   1) Formulari është vetë dokumenti i letrës "FLETË - HYRJE/DALJE": kutia e
      kokës (Subjekti | titulli + Nr./Datë | Adresa nga vjen malli), kolonat
      Nr. / Emërtimi i mallit / Njësia / Sasia / Çmimi / Vlefta, 8 rreshta të
      numëruar (të pashkruarit me vija), SHUMA, SHITËSI / BLERËSI (dalje:
      DORËZOI / MORI NË DORËZIM); të dhënat ERP (loti, furnitori, thasët, kodi
      i lotit, rafti) si nën-rresht nën emërtim; rreshti tjetër hapet vetë;
      rafti për rresht ruhet dhe loti i ri e merr; ID-të e v1 të pandryshuara.
   2) Raportet tabelare të fletëve: tab "Raportet e fletëve" te Magazina dhe
      butoni "Fletët e magazinës" te Raportet; 8 pamje; filtra të kombinuar
      (lloji + magazina + produkti + furnitori + loti + rafti + arsyeja +
      statusi + përdoruesi + data + hapja); kërkim live me theksim pa humbur
      fokusin; renditje me klik; totale; Excel; print A4 landscape; Alpha e
      paprekur; ROLE-USER pa "print" nuk sheh Excel/Printo.
   Izolimi: helpers.cjs ndalon çdo kërkesë HTTPS → asnjë kontakt me API-n.
   Rezultatet: .audit/stock-doc-ux-{desktop,mobile}.json (jashtë Git).
   ========================================================================== */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
fs.mkdirSync('.audit',{recursive:true});

(async()=>{
 let totalPass=0,totalSteps=0;
 for(const mobile of [false,true]){
  const{browser,page:p,errors,close}=await open(mobile);
  const results=[];const tag=mobile?'mobile':'desktop';
  const b=name=>p.locator('#modal').getByRole('button',{name,exact:true});
  const ev=(fn,arg)=>p.evaluate(fn,arg);
  async function step(name,fn){totalSteps++;try{await fn();await p.waitForTimeout(150);assert.deepEqual(errors,[]);results.push({name,status:'PASS'});totalPass++;console.log('PASS',tag,name)}catch(e){results.push({name,status:'FAIL',error:String(e&&e.stack||e).slice(0,1200)});console.log('FAIL',tag,name,'\n   ',String(e&&e.message||e).slice(0,600));errors.length=0;try{await ev(()=>closeModal())}catch(_){}}}
  const pick=async(sel,value)=>{await ev(([s,v])=>{let el=typeof s==='string'?document.querySelector(s):s;el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,value]);await p.waitForTimeout(120)};
  const fillLine=async(i,l)=>{await ev(([i,l])=>{let tr=document.querySelectorAll('#sdLines tr.sd-line')[i];if(l.product){let ps=tr.querySelector('.sdl-product');ps.value=l.product;ps.dispatchEvent(new Event('change',{bubbles:true}))}},[i,l]);await p.waitForTimeout(120);
   await ev(([i,l])=>{let tr=document.querySelectorAll('#sdLines tr.sd-line')[i];if(l.lot){let ls=tr.querySelector('.sdl-lot');ls.value=l.lot;ls.dispatchEvent(new Event('change',{bubbles:true}))}if(l.supplier&&tr.querySelector('.sdl-supplier'))tr.querySelector('.sdl-supplier').value=l.supplier;if(l.lotCode!=null&&tr.querySelector('.sdl-lotcode'))tr.querySelector('.sdl-lotcode').value=l.lotCode;if(l.rack!=null&&tr.querySelector('.sdl-rack'))tr.querySelector('.sdl-rack').value=l.rack;if(l.qty!=null)tr.querySelector('.sdl-qty').value=String(l.qty);if(l.bags!=null)tr.querySelector('.sdl-bags').value=String(l.bags);if(l.cost!=null)tr.querySelector('.sdl-cost').value=String(l.cost);sdRecalc()},[i,l]);await p.waitForTimeout(80)};
  const toastLog=async()=>ev(()=>(window.__toastLog||[]).join(' | '));
  const rows=async()=>ev(()=>[...document.querySelectorAll('#sdReportTable tr[data-sdr]')].map(tr=>[...tr.cells].map(c=>c.innerText.trim())));
  const ids={};
  try{
   await step('Blloku v2 aktiv mbi v1: versioni, 8 pamje raportesh, Alpha e paprekur (alphaInventoryMovements/alphaInventoryRows), formulari v1 i zëvendësuar (sdf-sheet)',async()=>{
     await ev(()=>{window.__toastLog=[];const ot=window.toast;if(!ot.__wrapped){window.toast=function(m){__toastLog.push(String(m));return ot.apply(this,arguments)};window.toast.__wrapped=true}});
     const info=await ev(()=>({v1:window.__biobesStockDocs&&window.__biobesStockDocs.version,v2:window.__biobesStockDocsV2&&window.__biobesStockDocsV2.version,views:window.__biobesStockDocsV2.views,formRows:window.__biobesStockDocsV2.formRows,alpha:typeof alphaInventoryMovements==='function'&&typeof alphaInventoryRows==='function'&&typeof alphaReportsHome==='function',css:!!document.getElementById('biobes-stock-docs-v2-css')}));
     assert.equal(info.v1,'biobes-stock-docs-v1');assert.equal(info.v2,'biobes-stock-docs-v2');assert.deepEqual(info.views,['lines','docs','product','lot','supplier','reason','warehouse','daily']);assert.equal(info.formRows,8);assert.ok(info.alpha);assert.ok(info.css);
   });
   await step('Formulari "Fletë hyrje" = dokumenti i letrës: koka me 3 kuti (Subjekti / FLETË - HYRJE Nr. Datë / Adresa nga vjen malli), kolonat e letrës, 8 rreshta të numëruar me vija, SHUMA, SHITËSI / BLERËSI, fushat me vijë (pa kuti), pa "+ Rresht" të detyrueshëm',async()=>{
     await ev(()=>go('warehouse'));await p.waitForTimeout(300);
     await p.locator('#main').getByRole('button',{name:'+ Fletë hyrje',exact:true}).first().click();await p.waitForTimeout(400);
     assert.equal(await p.locator('#modalTitle').innerText(),'Fletë hyrje');
     const s=await ev(()=>{let sheet=document.getElementById('sdFormSheet'),head=sheet.querySelector('.sdf-head'),cells=[...head.children].map(x=>x.innerText.replace(/\s+/g,' ').trim());let ths=[...sheet.querySelectorAll('#sdLines thead th')].map(t=>t.textContent.trim());let nums=[...sheet.querySelectorAll('#sdLines tbody tr')].map(tr=>tr.cells[0].textContent.trim());let cs=getComputedStyle(document.querySelector('#sdLines .sdl-qty'));return{cells,h1:sheet.querySelector('.sdf-title h1').textContent,ths,nums,lines:sheet.querySelectorAll('tr.sd-line').length,blank:sheet.querySelectorAll('tr.sdf-blank').length,dash:!!sheet.querySelector('tr.sdf-blank .dash'),foot:sheet.querySelector('tfoot').innerText.replace(/\s+/g,' ').trim(),sign:[...sheet.querySelectorAll('.sdf-sign>div')].map(d=>d.innerText.trim()),font:getComputedStyle(sheet).fontFamily,border:cs.borderTopStyle+'/'+cs.borderBottomStyle,ids:['sdNumber','sdDate','sdWarehouse','sdRack','sdReason','sdPartyType','sdPartyId','sdPartyName','sdAddress','sdNote','sdSumQty','sdSumBags','sdSumValue'].every(id=>document.getElementById(id)),sub:[...document.querySelector('#sdLines tr.sd-line .sdf-detail').querySelectorAll(':scope>span')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent.trim()),hidden:[...document.querySelector('#sdLines tr.sd-line .sdf-detail').querySelectorAll(':scope>span.sdf-more')].map(x=>x.textContent.trim()),more:getComputedStyle(document.querySelector('#sdLines tr.sd-line .sdl-lotcode').closest('.sdf-more')).display,unit:document.querySelector('#sdLines tr.sd-line td.sdf-unit').textContent.trim()}});
     assert.equal(s.h1,'FLETË - HYRJE');assert.match(s.cells[0],/^Subjekti: BIOBES sh\.p\.k\. NIPT: /);assert.match(s.cells[0],/Magazina:/);assert.match(s.cells[1],/^FLETË - HYRJE Nr\. Datë/);assert.match(await ev(()=>$val('sdNumber')),/^FH-\d{4}-0001$/);assert.match(s.cells[2],/^Adresa nga vjen malli:/);
     assert.deepEqual(s.ths,['Nr.','Emërtimi i mallit','Njësia','Sasia','Çmimi','Vlefta','']);assert.deepEqual(s.nums,['1.','2.','3.','4.','5.','6.','7.','8.']);assert.equal(s.lines,1);assert.equal(s.blank,7);assert.ok(s.dash);
     assert.match(s.foot,/^SHUMA 0[,.]00 kg 0[,.]00 ALL$/);assert.deepEqual(s.sign,['SHITËSI','BLERËSI']);assert.match(s.font,/Times New Roman/);assert.equal(s.border,'none/dotted','fusha si vijë e shkruar me dorë, jo kuti');assert.ok(s.ids);
     assert.deepEqual(s.sub,['Loti','Furnitori','Thasë']);assert.deepEqual(s.hidden,['Kodi i lotit','Rafti']);assert.equal(s.more,'none','kodi i lotit / rafti janë të fshehur derisa hapen');assert.equal(s.unit,'kg');
     assert.equal(await b('+ Rresht').count(),1);
   });
   await step('Plotësimi si në letër: zgjedhja e mallit hap vetë rreshtin tjetër, "+ shkruaj rreshtin 2" e kthen vijën në rresht, SHUMA live (620,50 kg / 199.405,00 ALL), rafti për rresht nën emërtim, Ruaj & konfirmo → lotet e reja marrin raftin e rreshtit',async()=>{
     if(!(await ev(()=>!!document.getElementById('sdFormSheet')))){await ev(()=>stockDocForm('IN'));await p.waitForTimeout(400)}
     await pick('#sdPartyId','S2');await p.locator('#sdAddress').fill('Tregu i Fierit');
     await fillLine(0,{product:'P105',supplier:'S2',qty:'500',bags:'20',cost:'300'});
     assert.equal(await ev(()=>document.querySelectorAll('#sdLines tr.sdf-blank').length),7,'8 rreshta gjithsej mbeten (1 i shkruar + 7 vija)');
     await p.locator('#sdLines tr.sdf-blank .sdf-add-btn').first().click();await p.waitForTimeout(200);
     assert.equal(await ev(()=>document.querySelectorAll('#sdLines tr.sd-line').length),2);assert.equal(await ev(()=>document.querySelectorAll('#sdLines tr.sd-line')[1].cells[0].textContent.trim()),'2.');
     await ev(()=>sdToggleMore(document.querySelectorAll('#sdLines tr.sd-line')[1].querySelector('.sdf-toggle')));
     assert.equal(await ev(()=>getComputedStyle(document.querySelectorAll('#sdLines tr.sd-line')[1].querySelector('.sdl-lotcode').closest('.sdf-more')).display),'block');
     await fillLine(1,{product:'P101',supplier:'S1',lotCode:'FH-KOD-01',rack:'R3',qty:'120,5',bags:'5',cost:'410'});
     assert.match(await ev(()=>document.getElementById('sdSumQty').textContent),/^620[,.]50 kg$/);assert.match(await ev(()=>document.getElementById('sdSumValue').textContent),/199[,.]405[,.]00 ALL/);assert.equal(await ev(()=>document.getElementById('sdSumBags').textContent),'25 thasë');
     // rreshtat 3–8 mbeten vija (8 gjithsej si blloku)
     assert.equal(await ev(()=>document.querySelectorAll('#sdLines tbody tr').length),8);
     await b('Ruaj & konfirmo').click();await p.waitForTimeout(600);
     const r=await ev(()=>{let d=state.stockDocs.find(x=>x.number.startsWith('FH-'));let lots=d.lines.map(l=>state.lots.find(x=>x.id===l.lot));return{id:d.id,status:d.status,party:d.party.name,addr:d.address,lines:d.lines.map(l=>[l.lotCode,l.qty,l.bags,l.unitCost,l.value,l.rack||'']),lots:lots.map(l=>[l.code,l.rack,l.net,l.warehouse]),title:document.getElementById('modalTitle').textContent}});
     ids.fh=r.id;assert.equal(r.status,'Konfirmuar');assert.equal(r.addr,'Tregu i Fierit');assert.ok(r.party);
     assert.deepEqual(r.lines,[['B1S01/2-105-26',500,20,300,150000,''],['FH-KOD-01',120.5,5,410,49405,'R3']]);
     assert.deepEqual(r.lots,[['B1S01/2-105-26','R1',500,'W1'],['FH-KOD-01','R3',120.5,'W1']]);assert.match(r.title,/^Fletë hyrje FH-/);
     await close();
   });
   await step('Fletë dalje = "FLETË - DALJE": Adresa ku shkon malli, DORËZOI / MORI NË DORËZIM, loti zgjidhet nën emërtim dhe mbush mallin + çmimin (WAC), pala e lirë kur s\'është në regjistër; dëmtim 150 kg konfirmohet',async()=>{
     await ev(()=>go('warehouse'));await p.waitForTimeout(300);await ev(()=>stockDocForm('OUT'));await p.waitForTimeout(400);
     assert.equal(await p.locator('#modalTitle').innerText(),'Fletë dalje');
     const s=await ev(()=>({h1:document.querySelector('#sdFormSheet .sdf-title h1').textContent,addr:document.querySelector('#sdFormSheet .sdf-head>div:last-child .sdf-lbl').textContent,sign:[...document.querySelectorAll('.sdf-sign>div')].map(d=>d.innerText.trim()),reason:$val('sdReason'),sub:[...document.querySelector('#sdLines tr.sd-line .sdf-detail').querySelectorAll(':scope>span')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent.trim()),partyNameShown:getComputedStyle(document.getElementById('sdPartyName')).display}));
     assert.equal(s.h1,'FLETË - DALJE');assert.equal(s.addr,'Adresa ku shkon malli:');assert.deepEqual(s.sign,['DORËZOI','MORI NË DORËZIM']);assert.equal(s.reason,'damage');assert.deepEqual(s.sub,['Loti','Thasë']);assert.equal(s.partyNameShown,'block','pala "Tjetër" → emri i lirë i dukshëm');
     await fillLine(0,{lot:'L1',qty:'150',bags:'6'});
     const l=await ev(()=>({prod:document.querySelector('#sdLines .sdl-product').value,cost:document.querySelector('#sdLines .sdl-cost').value,val:document.querySelector('#sdLines .sdl-value').textContent}));
     assert.equal(l.prod,'P105');assert.ok(+l.cost>0,'çmimi mbushet nga loti/WAC');
     await p.locator('#sdPartyName').fill('Kazani i mbeturinave');await p.locator('#sdNote').fill('Thasë të lagur');
     await b('Ruaj & konfirmo').click();await p.waitForTimeout(600);
     const r=await ev(()=>{let d=state.stockDocs.find(x=>x.kind==='OUT');return{id:d.id,status:d.status,party:d.party,note:d.note,avail:lotAvail(by('lots','L1'))}});
     ids.fd=r.id;assert.equal(r.status,'Konfirmuar');assert.deepEqual(r.party,{type:'',id:'',name:'Kazani i mbeturinave'});assert.equal(r.note,'Thasë të lagur');assert.equal(r.avail,1050);
     await close();
   });
   await step('Ndrysho draft: fleta rihapet me rreshtat e shkruar + vijat deri në 8, kodi i lotit / rafti i hapur kur ka vlerë; heqja e rreshtit rinumëron dhe rikthen vijën; "Ruaj draft" ruan raftin',async()=>{
     await ev(()=>stockDocForm('IN'));await p.waitForTimeout(400);
     await fillLine(0,{product:'P103',supplier:'S3',rack:'R2',qty:'10',cost:'100'});await p.locator('#sdLines tr.sdf-blank .sdf-add-btn').first().click();await p.waitForTimeout(150);
     await fillLine(1,{product:'P104',supplier:'S3',qty:'20',cost:'50'});await b('Ruaj draft').click();await p.waitForTimeout(500);
     const d=await ev(()=>state.stockDocs.find(x=>x.status==='Draft'));ids.draft=d.id;assert.equal(d.lines[0].rack,'R2');assert.equal(d.lines.length,2);
     await b('✎ Ndrysho').click();await p.waitForTimeout(500);assert.match(await p.locator('#modalTitle').innerText(),/^Ndrysho Fletë hyrje — FH-/);
     const s=await ev(()=>({lines:document.querySelectorAll('#sdLines tr.sd-line').length,blank:document.querySelectorAll('#sdLines tr.sdf-blank').length,open0:document.querySelectorAll('#sdLines tr.sd-line')[0].classList.contains('sdf-open'),rack0:document.querySelectorAll('#sdLines tr.sd-line')[0].querySelector('.sdl-rack').value,nums:[...document.querySelectorAll('#sdLines tbody tr')].map(tr=>tr.cells[0].textContent.trim())}));
     assert.equal(s.lines,2);assert.equal(s.blank,6);assert.ok(s.open0,'rreshti me raft hapet i zgjeruar');assert.equal(s.rack0,'R2');assert.deepEqual(s.nums,['1.','2.','3.','4.','5.','6.','7.','8.']);
     await ev(()=>sdRemoveLine(document.querySelectorAll('#sdLines tr.sd-line')[0].querySelector('.sdf-rm')));await p.waitForTimeout(150);
     const s2=await ev(()=>({lines:document.querySelectorAll('#sdLines tr.sd-line').length,blank:document.querySelectorAll('#sdLines tr.sdf-blank').length,first:document.querySelector('#sdLines tr.sd-line .sdl-product').value,n1:document.querySelector('#sdLines tr.sd-line .sd-n').textContent,sum:document.getElementById('sdSumValue').textContent}));
     assert.equal(s2.lines,1);assert.equal(s2.blank,7);assert.equal(s2.first,'P104');assert.equal(s2.n1,'1.');assert.match(s2.sum,/^1[,.]000[,.]00 ALL$/);
     await b('Ruaj draft').click();await p.waitForTimeout(400);assert.equal(await ev(id=>state.stockDocs.find(x=>x.id===id).lines.length,ids.draft),1);
     await close();
   });
   await step('Gjendja fillestare e magazinës: e njëjta fletë e letrës, data e hapjes e fiksuar (readonly), vetëm arsyeja "opening", kodi i lotit / rafti të hapur që në fillim (një rresht = një lot)',async()=>{
     await ev(()=>stockDocForm('IN','',{opening:true}));await p.waitForTimeout(400);
     assert.equal(await p.locator('#modalTitle').innerText(),'Gjendja fillestare e magazinës');
     const s=await ev(()=>({ro:document.getElementById('sdDate').readOnly,reasons:[...document.getElementById('sdReason').options].map(o=>o.value),open:document.querySelector('#sdLines tr.sd-line').classList.contains('sdf-open'),h1:document.querySelector('#sdFormSheet .sdf-title h1').textContent,hint:document.querySelector('#modalBody').innerText.includes('Gjendja fillestare e magazinës më')}));
     assert.equal(s.ro,true);assert.deepEqual(s.reasons,['opening']);assert.ok(s.open);assert.equal(s.h1,'FLETË - HYRJE');assert.ok(s.hint);
     await close();
   });
   await step('Magazina → tab "Raportet e fletëve": tabela për çdo rresht artikulli (19 kolona: data, fleta, lloji, nr., malli, loti, furnitori, magazina, rafti, arsyeja, pala, thasë, hyrje kg, dalje kg, çmimi, vlefta, statusi, përdoruesi, përshkrimi), totalet, përmbledhja',async()=>{
     await ev(()=>{sdrReset();sdWhTab('reports')});await p.waitForTimeout(500);
     const s=await ev(()=>({tabs:[...document.querySelectorAll('#sdWhTabs button')].map(b=>[b.textContent.trim(),b.classList.contains('active')]),ths:[...document.querySelectorAll('#sdReportTable thead th')].map(t=>t.textContent.trim().replace(/ [▾▴]$/,'')),views:[...document.querySelectorAll('[data-sdrview]')].map(b=>b.textContent.trim()),filters:[...document.querySelectorAll('.sdr-filters .field label')].map(l=>l.textContent.trim()),sum:document.getElementById('sdrSummary').innerText.replace(/\s+/g,' '),foot:[...document.querySelectorAll('#sdReportTable tfoot td')].map(c=>c.textContent.trim()),old:!!document.getElementById('stockDocsTable')}));
     assert.deepEqual(s.tabs,[['📄 Fletët hyrje / dalje',false],['📋 Raportet e fletëve',true]]);assert.equal(s.old,false,'regjistri i vjetër zëvendësohet nga raporti në këtë tab');
     assert.deepEqual(s.ths,['Data','Fleta','Lloji','Nr.','Emërtimi i mallit','Loti','Furnitori','Magazina','Rafti','Arsyeja','Pala / adresa','Thasë','Hyrje kg','Dalje kg','Çmimi ALL/kg','Vlefta ALL','Statusi','Përdoruesi','Përshkrimi']);
     assert.deepEqual(s.views,['Rreshtat e fletëve','Sipas fletës','Sipas produktit','Sipas lotit','Sipas furnitorit','Sipas arsyes','Magazina / rafti','Ditore']);
     assert.deepEqual(s.filters,['Nga data','Deri','Lloji','Statusi','Magazina','Rafti','Produkti','Loti','Furnitori','Arsyeja','Përdoruesi','Gjendja fillestare']);
     assert.match(s.sum,/Fletë: 2 Rreshta: 3 Thasë: 31 Hyrje: 620[,.]50 kg · 199[,.]405[,.]00 ALL Dalje: 150[,.]00 kg · 45[,.]000[,.]00 ALL Neto: 470[,.]50 kg · 154[,.]405[,.]00 ALL/);
     assert.equal(s.foot[0],'Totali (3)');assert.equal(s.foot[11],'31');assert.match(s.foot[12],/^620[,.]50$/);assert.match(s.foot[13],/^150[,.]00$/);assert.match(s.foot[15],/^244[,.]405[,.]00$/);
     const rs=await rows();assert.equal(rs.length,3);assert.ok(rs.some(r=>r[1].startsWith('FH-')&&r[4]==='101 — Sherëbelë'&&r[5].startsWith('FH-KOD-01')&&r[8].startsWith('R03')));
     assert.ok(rs.some(r=>r[1].startsWith('FD-')&&r[9]==='Dëmtim'&&r[10]==='Kazani i mbeturinave'&&/^150[,.]00$/.test(r[13])));
   });
   await step('Filtra të kombinuar: lloji IN + produkti 105 → 1 rresht; + furnitori S1 → 0; loti FH-KOD-01 → 1; rafti R03 → 1; arsyeja OUT:damage → 1; statusi Draft → 1 (P104); përdoruesi; hapja; data (periudha "Sot" / muaji i kaluar)',async()=>{
     await ev(()=>{sdrSet('kind','IN');sdrSet('product','P105')});await p.waitForTimeout(150);let rs=await rows();assert.equal(rs.length,1);assert.equal(rs[0][4],'105 — Ferrë');assert.match(rs[0][12],/^500[,.]00$/);
     await ev(()=>sdrSet('supplier','S1'));await p.waitForTimeout(150);rs=await rows();assert.equal(rs.length,0);assert.ok((await p.locator('#sdReportTable').innerText()).includes('Nuk ka rreshta'));
     await ev(()=>{sdrReset();sdrSet('lot','FH-KOD-01')});await p.waitForTimeout(150);rs=await rows();assert.equal(rs.length,1);assert.equal(rs[0][4],'101 — Sherëbelë');
     await ev(()=>{sdrReset();sdrSet('rack','R3')});await p.waitForTimeout(150);rs=await rows();assert.equal(rs.length,1);assert.ok(rs[0][8].startsWith('R03'));
     await ev(()=>{sdrReset();sdrSet('reason','OUT:damage')});await p.waitForTimeout(150);rs=await rows();assert.equal(rs.length,1);assert.equal(rs[0][2],'Dalje');
     const reasonOpts=await ev(()=>{sdrSet('kind','OUT');return [...document.querySelector('[data-sdrf="reason"]').options].map(o=>o.value)});assert.deepEqual(reasonOpts,['','OUT:damage','OUT:loss','OUT:sample','OUT:consumption','OUT:localsale','OUT:correction'],'arsyet ndjekin llojin');
     await ev(()=>{sdrReset();sdrSet('status','Draft')});await p.waitForTimeout(150);rs=await rows();assert.equal(rs.length,1);assert.equal(rs[0][4],'104 — Luiza');assert.equal(rs[0][16],'Draft');
     await ev(()=>{sdrReset();sdrSet('status','')});await p.waitForTimeout(150);rs=await rows();assert.equal(rs.length,4,'pa filtër statusi: 3 të konfirmuar + 1 draft');
     const users=await ev(()=>[...document.querySelector('[data-sdrf="user"]').options].map(o=>o.value));assert.deepEqual(users,['','Audit lokal']);
     await ev(()=>sdrSet('user','Audit lokal'));await p.waitForTimeout(150);assert.equal((await rows()).length,4);
     await ev(()=>{sdrReset();sdrSet('opening','yes')});await p.waitForTimeout(150);assert.equal((await rows()).length,0);
     await ev(()=>{sdrReset();sdrPeriod('prev')});await p.waitForTimeout(150);assert.equal((await rows()).length,0);
     const per=await ev(()=>{sdrPeriod('today');return [document.getElementById('sdrFrom').value,document.getElementById('sdrTo').value]});assert.deepEqual(per,[per[0],per[0]]);assert.match(per[0],/^\d{4}-\d{2}-\d{2}$/);await p.waitForTimeout(150);assert.equal((await rows()).length,3);
     await ev(()=>sdrReset());await p.waitForTimeout(150);assert.equal((await rows()).length,3);
   });
   await step('Kërkimi live në tabelë: shkruan "Kazani" → 1 rresht me <mark>, përmbledhja + totalet rillogariten, fokusi mbetet te kutia; "Sherëbelë" (ë) → 1; fshirja rikthen 3; kërkimi mbi sasinë "120,5"',async()=>{
     await ev(()=>{sdrReset();sdrSet('view','lines')});await p.waitForTimeout(200);
     await p.locator('#sdrQ').click();await p.locator('#sdrQ').type('Kazani');await p.waitForTimeout(200);
     const s=await ev(()=>({n:document.querySelectorAll('#sdReportTable tr[data-sdr]').length,marks:[...document.querySelectorAll('#sdReportTable mark')].map(m=>m.textContent),focus:document.activeElement.id,sum:document.getElementById('sdrSummary').innerText.replace(/\s+/g,' '),foot:document.querySelector('#sdReportTable tfoot td').textContent}));
     assert.equal(s.n,1);assert.deepEqual(s.marks,['Kazani']);assert.equal(s.focus,'sdrQ');assert.match(s.sum,/Fletë: 1 Rreshta: 1 Thasë: 6/);assert.equal(s.foot,'Totali (1)');
     await p.locator('#sdrQ').fill('sherëbelë');await p.waitForTimeout(200);assert.equal((await rows()).length,1);
     await p.locator('#sdrQ').fill('120,5');await p.waitForTimeout(200);const r2=await rows();assert.equal(r2.length,1);assert.equal(r2[0][4],'101 — Sherëbelë');
     await p.locator('#sdrQ').fill('');await p.waitForTimeout(200);assert.equal((await rows()).length,3);
   });
   await step('Renditja me klik në kokë: "Vlefta ALL" zbritëse → 150.000 e para, klik i dytë → rritëse; "Emërtimi i mallit" alfabetike; shigjeta te koka e renditur',async()=>{
     await ev(()=>{sdrReset();sdrSet('view','lines')});await p.waitForTimeout(200);
     await ev(()=>sdrSort('value'));await p.waitForTimeout(150);let rs=await rows();assert.match(rs[0][15],/^150[,.]000[,.]00$/);assert.equal(await ev(()=>document.querySelector('#sdReportTable th.sorted').textContent.trim()),'Vlefta ALL');
     await ev(()=>sdrSort('value'));await p.waitForTimeout(150);rs=await rows();assert.match(rs[0][15],/^45[,.]000[,.]00$/);assert.ok(await ev(()=>document.querySelector('#sdReportTable th.sorted').classList.contains('asc')));
     await ev(()=>sdrSort('productName'));await p.waitForTimeout(150);rs=await rows();assert.deepEqual(rs.map(r=>r[4]),['101 — Sherëbelë','105 — Ferrë','105 — Ferrë']);
   });
   await step('Pamjet e grupuara: Sipas produktit (105 → hyrje 500 / dalje 150 / neto 350), Sipas lotit, Sipas furnitorit, Sipas arsyes, Magazina / rafti (R01, R03), Ditore, Sipas fletës (butonat Hap / 🖨) — totalet për secilën',async()=>{
     await ev(()=>{sdrReset();sdrSet('view','product')});await p.waitForTimeout(200);let rs=await rows();let ferre=rs.find(r=>r[0]==='105 — Ferrë');assert.ok(ferre);
     const th=await ev(()=>[...document.querySelectorAll('#sdReportTable thead th')].map(t=>t.textContent.trim().replace(/ [▾▴]$/,'')));assert.deepEqual(th,['Emërtimi i mallit','Fletë','Rreshta','Lote','Thasë','Hyrje kg','Dalje kg','Neto kg','Hyrje ALL','Dalje ALL','Neto ALL','Çmimi mes. ALL/kg','Nga','Deri']);
     assert.equal(ferre[1],'2');assert.equal(ferre[2],'2');assert.match(ferre[5],/^500[,.]00$/);assert.match(ferre[6],/^150[,.]00$/);assert.match(ferre[7],/^350[,.]00$/);assert.match(ferre[10],/^105[,.]000[,.]00$/);
     assert.equal((await ev(()=>document.querySelector('#sdReportTable tfoot').innerText)).includes('Totali (2)'),true);
     await ev(()=>sdrSet('view','lot'));await p.waitForTimeout(200);rs=await rows();assert.equal(rs.length,3);assert.ok(rs.some(r=>r[0].startsWith('FH-KOD-01 · 101')));
     await ev(()=>sdrSet('view','supplier'));await p.waitForTimeout(200);rs=await rows();assert.equal(rs.length,2);
     await ev(()=>sdrSet('view','reason'));await p.waitForTimeout(200);rs=await rows();assert.deepEqual(rs.map(r=>r[0]).sort(),['Dalje — Dëmtim','Hyrje — Blerje pa peshim']);
     await ev(()=>sdrSet('view','warehouse'));await p.waitForTimeout(200);rs=await rows();assert.deepEqual(rs.map(r=>r[0]).sort(),['MQ — Magazina Qendrore / R01 — Rafti i Sokolit','MQ — Magazina Qendrore / R03 — Rafti 3']);
     await ev(()=>sdrSet('view','daily'));await p.waitForTimeout(200);rs=await rows();assert.equal(rs.length,1);assert.match(rs[0][0],/^\d{2}\.\d{2}\.\d{4}$/);assert.match(rs[0][5],/^620[,.]50$/);
     await ev(()=>sdrSet('view','docs'));await p.waitForTimeout(200);rs=await rows();assert.equal(rs.length,2);let fh=rs.find(r=>r[1].startsWith('FH-'));assert.equal(fh[7],'2');assert.equal(fh[6],'105, 101');assert.match(fh[10],/^199[,.]405[,.]00$/);
     assert.equal(await p.locator('#sdReportTable button:has-text("Hap")').count(),2);
     await p.locator('#sdReportTable button:has-text("Hap")').first().click();await p.waitForTimeout(300);assert.match(await p.locator('#modalTitle').innerText(),/^Fletë (hyrje|dalje) F[HD]-/);await close();
     await ev(()=>sdrSet('view','lines'));await p.waitForTimeout(200);
   });
   await step('Excel i raportit (pamja aktuale, kolonat e tabelës, numrat si numra) dhe printimi A4 landscape me titull, periudhë dhe filtra; kolona "Fleta" me link te kartela',async()=>{
     await ev(()=>{window.__xlsx=[];const om=window.makeXlsx;if(!om.__w){window.makeXlsx=function(f,h,r){__xlsx.push({f,h,r});return om.apply(this,arguments)};window.makeXlsx.__w=true}});
     await ev(()=>{sdrReset();sdrSet('view','lines');sdrSet('kind','IN');exportStockDocReportXlsx()});await p.waitForTimeout(200);
     const x=await ev(()=>window.__xlsx[0]);assert.match(x.f,/^Raport-flete-lines-\d{4}-\d{2}-\d{2}\.xlsx$/);assert.deepEqual(x.h.slice(0,6),['Data','Fleta','Lloji','Nr.','Emërtimi i mallit','Loti']);assert.equal(x.r.length,2);assert.equal(typeof x.r[0][12],'number');assert.equal(x.r[0][12]+x.r[1][12],620.5);
     await ev(()=>{sdrSet('view','product');exportStockDocReportXlsx()});await p.waitForTimeout(200);const x2=await ev(()=>window.__xlsx[1]);assert.equal(x2.h[0],'Emërtimi i mallit');assert.equal(x2.r.length,2);
     await ev(()=>{sdrReset();sdrSet('view','lines')});await p.waitForTimeout(200);
     const pr=await ev(()=>new Promise(res=>{printStockDocReport();setTimeout(()=>{let f=document.getElementById('biobesPrintFrame'),d=f&&f.contentDocument;res({frame:!!f,title:d&&d.title,css:d&&d.querySelector('style').textContent,text:d&&d.body.innerText.replace(/\s+/g,' ').slice(0,400),rows:d&&d.querySelectorAll('#sdrPrintTable tr[data-sdr]').length,buttons:d&&d.querySelectorAll('button').length})},120)}));
     assert.ok(pr.frame);assert.match(pr.title,/^Raporti i fletëve — Rreshtat/);assert.ok(pr.css.includes('A4 landscape'));assert.ok(pr.text.includes('Raporti i fletëve të magazinës'));assert.ok(pr.text.includes('periudha: gjithë periudha'));assert.equal(pr.rows,3);assert.equal(pr.buttons,0);
     assert.equal(await ev(()=>document.querySelectorAll('#sdReportTable').length),1,'kopja për printim nuk dublon ID-në e tabelës');
     await p.waitForTimeout(500);
     await p.locator('#sdReportTable a.link').first().click();await p.waitForTimeout(300);assert.match(await p.locator('#modalTitle').innerText(),/^Fletë (hyrje|dalje) F[HD]-/);await close();
   });
   await step('Raportet → butoni "📋 Fletët e magazinës" (jashtë Alpha-s): hap të njëjtin raport tabelor brenda faqes Raportet, "← Raportet" kthen mbrapa; kalimi te modul tjetër e mbyll; Alpha home e paprekur',async()=>{
     await ev(()=>{sdrReset();sdrSet('view','lines');go('reports')});await p.waitForTimeout(400);
     const btn=p.locator('#main .reports-mode-tabs button:has-text("Fletët e magazinës")');assert.equal(await btn.count(),1);
     const before=await ev(()=>document.getElementById('main').innerText.includes('Raporte Alpha'));assert.ok(before);
     await btn.click();await p.waitForTimeout(500);
     const s=await ev(()=>({root:!!document.getElementById('sdReportsRoot'),sub:document.querySelector('#main .page-head p').textContent,rows:document.querySelectorAll('#sdReportTable tr[data-sdr]').length,back:!!document.querySelector('#main button[onclick="sdrCloseReports()"]'),page:page}));
     assert.ok(s.root);assert.match(s.sub,/Fletët e magazinës/);assert.equal(s.rows,3);assert.ok(s.back);assert.equal(s.page,'reports');
     await p.locator('#main button:has-text("← Raportet")').click();await p.waitForTimeout(400);
     assert.equal(await ev(()=>!!document.getElementById('sdReportsRoot')),false);assert.ok(await ev(()=>document.getElementById('main').innerText.includes('Raporte Alpha')));
     await ev(()=>sdrOpenReports());await p.waitForTimeout(300);assert.ok(await ev(()=>!!document.getElementById('sdReportsRoot')));
     await ev(()=>go('warehouse'));await p.waitForTimeout(300);await ev(()=>go('reports'));await p.waitForTimeout(300);assert.equal(await ev(()=>!!document.getElementById('sdReportsRoot')),false,'kalimi te modul tjetër e mbyll pamjen');
     const alpha=await ev(()=>{reportsMode='alpha';render();let t=document.getElementById('main').innerText;return{ok:t.includes('Raporte Alpha'),alphaFn:typeof alphaReportsHome==='function'}});assert.ok(alpha.ok&&alpha.alphaFn);
   });
   await step('ROLE-USER me Magazina view (pa print): sheh tab-in e raporteve dhe tabelën, por pa Excel / Printo; exportStockDocReportXlsx refuzohet me toast',async()=>{
     await ev(async()=>{const h=await hashPassword('Prove-2026!');state.users.push({id:'U-SDR',username:'sdr-user',name:'Magazinier',role:'ROLE-USER',active:true,passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false,rights:{v:2,modules:{warehouse:['view'],lots:['view'],dashboard:['view']}}});save();closeModal();logoutUser()});
     await p.waitForFunction(()=>!!document.getElementById('loginLock'));await p.locator('#loginName').fill('sdr-user');await p.locator('#loginPass').fill('Prove-2026!');await p.locator('#loginPass').press('Enter');await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(400);
     await ev(()=>{go('warehouse');sdWhTab('reports')});await p.waitForTimeout(500);
     const s=await ev(()=>({rows:document.querySelectorAll('#sdReportTable tr[data-sdr]').length,excel:[...document.querySelectorAll('#sdReportsRoot button')].filter(b=>/Excel|Printo/.test(b.textContent)&&b.offsetParent!==null).length}));
     assert.equal(s.rows,3);assert.equal(s.excel,0);
     await ev(()=>{__toastLog=[];exportStockDocReportXlsx();printStockDocReport()});const tl=await toastLog();assert.ok((tl.match(/Nuk keni të drejtë/g)||[]).length>=2,tl);
   });
  }finally{
   fs.writeFileSync('.audit/stock-doc-ux-'+tag+'.json',JSON.stringify({tag,results,errors},null,1));
   await browser.close();
  }
 }
 console.log(totalPass+'/'+totalSteps+' passed');process.exit(totalPass===totalSteps?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
