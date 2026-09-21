/* tests/trace-graph-audit.cjs — kg të editueshme te procesi + grafiku i gjurmueshmërisë para/mbrapa */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 await p.waitForTimeout(1200);
 await ev(()=>{try{closeModal()}catch(e){}});

 await step('Skenari bazë: lote, porosi, produkt',async()=>{
   await ev(()=>{
     const prd=state.products[0].id;window.__TG_PRD=prd;
     if(!by('lots','TG-LA').id)state.lots.push({id:'TG-LA',code:'TG-A-105',supplier:state.suppliers[0].id,product:prd,gross:900,tare:0,net:900,originalNet:900,availableNet:900,unpackedNet:900,packedNet:0,warehouse:'W1',rack:'R1',status:'Në magazinim',date:'2026-09-10'});
     if(!by('lots','TG-LB').id)state.lots.push({id:'TG-LB',code:'TG-B-105',supplier:state.suppliers[0].id,product:prd,gross:600,tare:0,net:600,originalNet:600,availableNet:600,unpackedNet:600,packedNet:0,warehouse:'W1',rack:'R1',status:'Në magazinim',date:'2026-09-10'});
     if(!by('orders','PO-TG-001').id)state.orders.push({id:'PO-TG-001',date:'2026-09-10',customer:state.customers[0].id,status:'Në prodhim',items:[{product:prd,qty:3000,done:0}]});
     save();
   });
 });

 await step('Formulari i procesit: kg plotësohet auto dhe është i editueshëm',async()=>{
   await ev(()=>{processForm();const prd=window.__TG_PRD;document.getElementById('prProduct').value=prd;processSourceRefresh();
     document.getElementById('prInput').value='1000';processRedistribute();
     document.getElementById('prAddLot').value='TG-LA';processSourceAdd();
     document.getElementById('prAddLot').value='TG-LB';processSourceAdd();});
   await p.waitForTimeout(250);
   const st=await ev(()=>{const rows=[...document.querySelectorAll('[data-pr-source-row]')];return{
     n:rows.length,readonly:rows.map(r=>r.querySelector('[data-pr-qty]').readOnly),vals:rows.map(r=>r.querySelector('[data-pr-qty]').value),
     label:document.querySelector('[data-pr-sources]').closest('.field').querySelector('label small').textContent,
     reb:!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Rishpërndaj njëlloj')),
     hint:document.getElementById('prSourceSum').textContent}});
   assert.equal(st.n,2);assert.deepEqual(st.readonly,[false,false],'kg duhet të jenë të editueshme');
   assert.deepEqual(st.vals,['500','500'],'shpërndarja auto njëlloj');
   assert.match(st.label,/mund ta ndryshoni/);assert.ok(st.reb,'butoni Rishpërndaj njëlloj');
   assert.match(st.hint,/e balancuar/);
 });

 await step('Editimi i kg: diferenca shfaqet e kuqe, balancimi i gjelbër, rebalance rikthen',async()=>{
   await ev(()=>{const r=[...document.querySelectorAll('[data-pr-source-row]')];const i0=r[0].querySelector('[data-pr-qty]');i0.value='700';processQtyEdited(i0)});
   await p.waitForTimeout(120);
   let hint=await ev(()=>document.getElementById('prSourceSum').textContent);
   assert.match(hint,/diferenca/);assert.match(hint,/200/);
   await ev(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Rishpërndaj njëlloj'));b.click()});
   await p.waitForTimeout(120);
   let vals=await ev(()=>[...document.querySelectorAll('[data-pr-source-row]')].map(r=>r.querySelector('[data-pr-qty]').value));
   assert.deepEqual(vals,['500','500']);
   await ev(()=>{const r=[...document.querySelectorAll('[data-pr-source-row]')];const i0=r[0].querySelector('[data-pr-qty]'),i1=r[1].querySelector('[data-pr-qty]');i0.value='700';processQtyEdited(i0);i1.value='300';processQtyEdited(i1)});
   await p.waitForTimeout(120);
   hint=await ev(()=>document.getElementById('prSourceSum').textContent);
   assert.match(hint,/e balancuar/);
 });

 await step('Ruajtja: sourceQty me kg reale për lot dhe loti dalës me 2 burime',async()=>{
   await ev(()=>{document.getElementById('prOrder').value='PO-TG-001';document.getElementById('prOutput').value='950';addProcess()});
   await p.waitForTimeout(350);
   const r=await ev(()=>{const pr=[...state.processes].reverse().find(x=>(x.lots||[]).includes('TG-LA'));const out=state.lots.find(l=>l.process===pr.id);
     return{src:pr.sourceQty,lots:pr.lots,input:pr.input,output:pr.output,outId:out?.id,outSrc:out?.sourceLots,availA:availableLotQuantity('TG-LA'),availB:availableLotQuantity('TG-LB')}});
   assert.deepEqual(r.src,[{lot:'TG-LA',qty:700},{lot:'TG-LB',qty:300}]);
   assert.equal(r.input,1000);assert.equal(r.output,950);
   assert.deepEqual(r.outSrc,['TG-LA','TG-LB']);
   assert.equal(r.availA,200,'stoku i lotit A duhet të zbresë me 700, jo me gjithë hyrjen');
   assert.equal(r.availB,300);
 });

 await step('Zinxhiri: proces i dytë (përzierje), paketim me lot klienti, faturë e ngarkesë',async()=>{
   const out1=await ev(()=>{
     const prd=window.__TG_PRD,out1=state.lots.find(l=>(l.sourceLots||[]).includes('TG-LA')&&l.process);
     if(!by('lots','TG-LC').id)state.lots.push({id:'TG-LC',code:'TG-C-105',supplier:state.suppliers[0].id,product:prd,gross:400,tare:0,net:400,originalNet:400,availableNet:400,unpackedNet:400,packedNet:0,warehouse:'W1',rack:'R1',status:'Në magazinim',date:'2026-09-11'});
     const r=coreProcess({id:'PR-TG-2',date:'2026-09-12',orders:['PO-TG-001'],product:prd,sources:[{lot:out1.id,qty:900},{lot:'TG-LC',qty:400}],machine:state.machines[1].id,input:1300,output:1250,steps:'Prerje → Sitje → Paketim',clean:'Po',outputLot:'TG-LOUT2',outputLotCode:'B2-TG-FIN',warehouse:'W1',rack:'R1'});
     if(!r.ok)throw new Error('coreProcess dështoi: '+r.error);
     if(!packs().some(x=>x.id==='PK-TG-1'))packs().push({id:'PK-TG-1',order:'PO-TG-001',customer:state.customers[0].id,product:prd,sourceLots:['TG-LOUT2'],sourceLotQtys:{'TG-LOUT2':1000},internalLot:'B2-TG-FIN-K',customerLot:'CUST-LOT-TG',template:'Etiketë klienti',bags:40,bagWeight:25,net:1000,origin:'Albania',part:'Gjethe',organic:'Konvencional',originType:'Kultivuar',cropYear:2026,bestBefore:2029,date:'2026-09-13'});
     const S=typeof salesInvoices==='function'?salesInvoices():state.salesInvoices;
     if(!S.some(f=>f.id==='EXP-TG-1'))S.push({id:'EXP-TG-1',status:'Konfirmuar',order:'PO-TG-001',customer:state.customers[0].id,currency:'EUR',total:12000,exchangeRate:98,date:'2026-09-14',lines:[{product:prd,net:1000,price:12}]});
     if(!by('shipments','NG-TG-1').id)state.shipments.push({id:'NG-TG-1',date:'2026-09-15',orders:['PO-TG-001'],order:'PO-TG-001',customer:state.customers[0].id,status:'Planifikuar',net:1000,seal:'SL-TG'});
     if(!by('samples','SM-TG-1').id)state.samples.push({id:'SM-TG-1',date:'2026-09-11',customer:state.customers[0].id,product:prd,lot:'TG-LA',tracking:'TG-TRACK-1',status:'E aprovuar'});
     let oTg=by('orders','PO-TG-001');if(oTg.id)oTg.sample='SM-TG-1';
     save();return out1.id;
   });
   assert.ok(out1);
 });

 await step('Grafiku i plotë: nyjet para e mbrapa + kg e edituar te shigjeta',async()=>{
   await ev(()=>lotTraceModal('lot:TG-LOUT2'));await p.waitForTimeout(350);
   const g=await ev(()=>({svg:!!document.querySelector('#tgSvgWrap svg'),n:document.querySelectorAll('#tgSvgWrap [data-tg-node]').length,
     txt:document.getElementById('tgSvgWrap').textContent,sum:document.getElementById('tgSummary').textContent}));
   assert.ok(g.svg);assert.ok(g.n>=9,'nyje shumë pak: '+g.n);
   for(const s of ['TG-A-105','TG-B-105','TG-C-105','B2-TG-FIN-K','Nutreco','700 kg','300 kg'])assert.ok(g.txt.includes(s),'mungon '+s);
   assert.match(g.sum,/procese\/makineri: \b[2-9]/);
 });

 await step('Drejtimi mbrapa fsheh klientin; para fsheh furnitorin',async()=>{
   await ev(()=>{document.getElementById('tgDir').value='back';lotTraceModalRender()});await p.waitForTimeout(200);
   let t=await ev(()=>document.getElementById('tgSvgWrap').textContent);
   assert.ok(t.includes('TG-A-105'),'origjina mungon në mbrapa');assert.ok(!t.includes('Nutreco'),'klienti s’duhet në mbrapa');
   await ev(()=>{document.getElementById('tgDir').value='fwd';lotTraceModalRender()});await p.waitForTimeout(200);
   t=await ev(()=>document.getElementById('tgSvgWrap').textContent);
   assert.ok(t.includes('Nutreco')&&t.includes('CUST-LOT-TG'),'destinacioni mungon');assert.ok(!t.includes('TG-A-105'),'origjina s’duhet në para');
   await ev(()=>{document.getElementById('tgDir').value='full';lotTraceModalRender()});await p.waitForTimeout(150);
 });

 await step('Klikimi i nyjes hap dokumentin (loti burimor)',async()=>{
   await ev(()=>{const el=document.querySelector('#tgSvgWrap [data-tg-node="lot:TG-LA"]');el.dispatchEvent(new MouseEvent('click',{bubbles:true}))});
   await p.waitForTimeout(350);
   const title=await ev(()=>document.getElementById('modalTitle').textContent);
   assert.match(title,/TG-A-105/);
 });

 await step('Kartela e paketimit ofron grafikun "nga u formua loti i klientit"',async()=>{
   await ev(()=>{closeModal();packagingCard('PK-TG-1')});await p.waitForTimeout(300);
   const has=await ev(()=>[...document.querySelectorAll('#modalBody button')].some(b=>b.textContent.includes('Nga u formua ky lot klienti')));
   assert.ok(has);
   await ev(()=>lotTraceModal('pk:PK-TG-1'));await p.waitForTimeout(300);
   const t=await ev(()=>document.getElementById('tgSvgWrap').textContent);
   assert.ok(t.includes('TG-A-105')&&t.includes('CUST-LOT-TG'),'grafiku nga paketimi lidh burimin me lotin e klientit');
 });

 await step('Kartela e lotit dhe e procesit e kanë butonin e grafikut',async()=>{
   await ev(()=>{closeModal();lotCard('TG-LA')});await p.waitForTimeout(300);
   assert.ok(await ev(()=>[...document.querySelectorAll('#modalBody button')].some(b=>b.textContent.includes('Hap grafikun e gjurmueshmërisë'))));
   await ev(()=>{closeModal();processCard('PR-TG-2')});await p.waitForTimeout(300);
   assert.ok(await ev(()=>[...document.querySelectorAll('#modalBody button')].some(b=>b.textContent.includes('Grafiku i gjurmueshmërisë së procesit'))));
   await ev(()=>closeModal());
 });

 await step('Kartela e gjurmueshmërisë: nga shitja te fermeri, rafti, makineritë, mostra dhe ngarkesa',async()=>{
   await ev(()=>{try{closeModal()}catch(e){};traceDossierModal('ord:PO-TG-001')});await p.waitForTimeout(400);
   const d=await ev(()=>{const el=document.getElementById('printTraceDossier');return{txt:el?el.textContent:'',svg:!!el&&!!el.querySelector('svg'),tables:el?el.querySelectorAll('table').length:0}});
   assert.ok(d.svg,'grafiku mungon në kartelë');
   assert.ok(d.tables>=4,'tabelat: '+d.tables);
   for(const s of ['KARTELA E GJURMUESHMËRISË','TG-A-105','S01/1','Magazina Qendrore','Rafti i Sokolit','MK-01','MK-02','SM-TG-1','TG-TRACK-1','CUST-LOT-TG','NG-TG-1','SL-TG','Nutreco'])assert.ok(d.txt.includes(s),'mungon '+s);
 });

 await step('Printimi A4 landscape: frame-i merr @page landscape dhe gjithë përmbajtjen',async()=>{
   await ev(()=>{window.__cap=null;const orig=HTMLElement.prototype.remove;HTMLElement.prototype.remove=function(){if(this&&this.id==='biobesPrintFrame'){try{window.__cap=this.contentDocument.documentElement.innerHTML}catch(e){}}return orig.apply(this,arguments)};printOnly('printTraceDossier','Kartela e gjurmueshmërisë')});
   await p.waitForTimeout(600);
   const f=await ev(()=>{const fr=document.getElementById('biobesPrintFrame');const h=(fr&&fr.contentDocument)?fr.contentDocument.documentElement.innerHTML:(window.__cap||'');return{land:h.includes('@page{size:A4 landscape'),title:h.includes('KARTELA E GJURMUESHMËRISË'),tables:(h.match(/<table/g)||[]).length,svg:h.includes('<svg')}});
   assert.ok(f.title,'frame i printimit nuk u kap');
   assert.equal(f.land,true,'@page landscape mungon');
   assert.ok(f.tables>=4,'tabelat në print: '+f.tables);assert.ok(f.svg,'grafiku në print mungon');
 });

 await step('Butonat hyrës te fatura e shitjes dhe te ngarkesa',async()=>{
   await ev(()=>{closeModal();saleInvoiceCard('EXP-TG-1')});await p.waitForTimeout(300);
   let b=await ev(()=>({t:[...document.querySelectorAll('#modalBody button')].some(x=>x.textContent.includes('Kartela e gjurmueshmërisë (A4)')),h:[...document.querySelectorAll('#modalBody *')].some(x=>x.textContent.includes('Kjo shitje nga erdhi'))}));
   assert.ok(b.t,'butoni i kartelës te fatura');assert.ok(b.h,'pyetja "Kjo shitje nga erdhi?"');
   await ev(()=>{closeModal();shipmentCard('NG-TG-1')});await p.waitForTimeout(300);
   assert.ok(await ev(()=>[...document.querySelectorAll('#modalBody button')].some(x=>x.textContent.includes('Kartela e gjurmueshmërisë (A4)'))));
   await ev(()=>closeModal());
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[],errors.join('\n'))});

 await browser.close();
 console.log(`\ntrace-graph: ${passed} passed, ${failed} failed`);
 process.exit(failed?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(1)});
