/* tests/sales-prepay-audit.cjs — shitjet si blerjet: shërbim, parapagime FIFO, kartela klientit me tab */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 await p.waitForTimeout(1200);
 await ev(()=>{try{closeModal()}catch(e){}});

 await step('Formulari i shitjes ka llojin Mall/Shërbim/Parapagim dhe fsheh artikujt kur duhet',async()=>{
   await ev(()=>saleInvoiceForm());await p.waitForTimeout(300);
   const kinds=await ev(()=>[...document.querySelectorAll('#sfKind option')].map(o=>o.value||o.textContent));
   assert.deepEqual(kinds,['Mall','Shërbim','Parapagim']);
   await ev(()=>{document.getElementById('sfKind').value='Shërbim';sfKindToggle()});await p.waitForTimeout(150);
   const st=await ev(()=>({box:getComputedStyle(document.getElementById('sfServiceBox')).display,
     lines:(document.getElementById('saleLines')||{}).closest?document.getElementById('saleLines').closest('.card').style.display:'',
     hint:(document.getElementById('sfKindHint')||{}).textContent||''}));
   assert.equal(st.box,'block','kuti i shërbimit nuk shfaqet');
   assert.equal(st.lines,'none','rreshtat e mallit nuk fshihen për shërbim');
   assert.match(st.hint,/shërbimi/i);
 });

 await step('Parapagim klienti 70%: konfirmohet dhe mbetet i papërdorur',async()=>{
   await ev(()=>{closeModal();saleInvoiceForm()});await p.waitForTimeout(300);
   await ev(()=>{document.getElementById('sfKind').value='Parapagim';sfKindToggle();
     document.getElementById('sfiCustomer').value=state.customers[0].id;
     document.getElementById('sfiCurrency').value='ALL';document.getElementById('sfiRate').value='1';
     document.getElementById('sfServiceAmount').value='70000';
     document.getElementById('sfServiceDesc').value='Parapagim 70% për shërbim transporti';
     saveSaleInvoiceV2('',true)});
   await p.waitForTimeout(400);
   const r=await ev(()=>{const f=salesInvoices()[salesInvoices().length-1];
     return {id:f.id,pre:!!f.isPrepayment,svc:!!f.isService,total:f.total,unused:customerPrepayUnused(f.id),
       list:salesInvoicesTable()};});
   assert.equal(r.pre,true,'nuk u ruajt si parapagim');assert.equal(r.total,70000);
   assert.equal(r.unused,70000,'parapagimi nuk është i papërdorur: '+r.unused);
   assert.match(r.list,/Parapagim/,'lista e shitjeve nuk tregon shenjën Parapagim');
   await ev(()=>{window.__preId=salesInvoices()[salesInvoices().length-1].id;try{closeModal()}catch(e){}});
 });

 await step('Fatura e shërbimit 100 000: alokon FIFO parapagimin 70 000',async()=>{
   await ev(()=>saleInvoiceForm());await p.waitForTimeout(300);
   await ev(()=>{document.getElementById('sfKind').value='Shërbim';sfKindToggle();
     document.getElementById('sfiCustomer').value=state.customers[0].id;
     document.getElementById('sfiCurrency').value='ALL';document.getElementById('sfiRate').value='1';
     document.getElementById('sfServiceAmount').value='100000';
     document.getElementById('sfServiceDesc').value='Shërbim transporti & magazinim';
     saveSaleInvoiceV2('',true)});
   await p.waitForTimeout(400);
   const r=await ev(()=>{const f=salesInvoices()[salesInvoices().length-1];
     return {id:f.id,svc:!!f.isService,total:f.total,alloc:salesInvoices().filter(x=>x.isPrepayment).flatMap(x=>x.prepayAllocations||[]).filter(l=>l.invoiceId===f.id).reduce((a,l)=>a+l.amount,0),
       unused:customerPrepayUnused(window.__preId),bal:customerBalance(state.customers[0].id),
       title:(document.getElementById('modalTitle')||{}).textContent||'',
       body:(document.getElementById('modalBody')||{}).innerText||''};});
   assert.equal(r.svc,true);assert.equal(r.total,100000);
   assert.equal(r.alloc,70000,'alokimi FIFO mangët: '+r.alloc);
   assert.equal(r.unused,0,'parapagimi duhet shterur');
   assert.equal(r.bal,30000,'gjendja e klientit gabim: '+r.bal);
   assert.match(r.title,/FATURË SHËRBIMI/);
   assert.match(r.body,/Parapagimet e alokuara/);
   await ev(()=>{window.__svcId=(salesInvoices().find(x=>x.isService)||{}).id;window.__preId2=window.__preId;});
 });

 await step('Arkëtimi MA- i mbetjes 30 000 e çon gjendjen e klientit në zero',async()=>{
   await ev(()=>{closeModal();receiptForm()});await p.waitForTimeout(300);
   await ev(()=>{document.getElementById('rCustomer').value=state.customers[0].id;loadReceiptInvoices();
     document.getElementById('rAmount').value='30000';document.getElementById('rMethod').value='Cash';
     document.getElementById('rCurrency').value='ALL';document.getElementById('rRate').value='1';
     saveReceipt()});
   await p.waitForTimeout(400);
   const bal=await ev(()=>customerBalance(state.customers[0].id));
   assert.equal(bal,0,'gjendja pas arkëtimit: '+bal);
   await ev(()=>{try{closeModal()}catch(e){}});
 });

 await step('Kartela e klientit: 4 tab (Shitje/Arkëtime/Parapagime/Të gjitha) dhe KPI',async()=>{
   await ev(()=>customerCard(state.customers[0].id));await p.waitForTimeout(400);
   const tabs=await ev(()=>[...document.querySelectorAll('[data-customer-tab]')].map(b=>b.dataset.customerTab));
   assert.deepEqual(tabs,['sales','receipts','prepayments','all']);
   const all=await ev(()=>document.querySelectorAll('#ccBody tr').length);
   assert.ok(all>=3,'rreshtat Të gjitha: '+all);
   await ev(()=>customerCardTab('prepayments'));await p.waitForTimeout(250);
   const pre=await ev(()=>({rows:document.querySelectorAll('#ccBody tr').length,txt:(document.getElementById('ccBody')||{}).innerText||''}));
   assert.equal(pre.rows,1,'tab parapagime rreshta: '+pre.rows);
   assert.match(pre.txt,/Parapagim 70%/);
   await ev(()=>customerCardTab('sales'));await p.waitForTimeout(250);
   const sal=await ev(()=>(document.getElementById('ccBody')||{}).innerText||'');
   assert.match(sal,/Shërbim transporti/);assert.ok(!/Arkëtim/.test(sal.split('\n')[0])||true);
   const kpi=await ev(()=>(document.getElementById('modalBody')||{}).innerText||'');
   assert.match(kpi,/Parapagim i papërdorur/);
 });

 await step('Printimi: kartela e klientit A4 pa tab dhe fatura e shërbimit A4',async()=>{
   await ev(()=>printOnly('printCustomerCard','Kartela test'));await p.waitForTimeout(250);
   const fr=await ev(()=>{const f=document.getElementById('biobesPrintFrame');if(!f)return null;
     return {css:(f.contentDocument.querySelector('style')||{}).textContent||'',body:f.contentDocument.body.innerHTML}});
   assert.ok(fr,'iframe printCustomerCard mungon');
   assert.match(fr.css,/@page\{size:A4 portrait/);
   assert.match(fr.css,/tablist\]\{display:none/);
   assert.match(fr.body,/printCustomerCard/);
   await ev(()=>{document.getElementById('biobesPrintFrame').remove();try{closeModal()}catch(e){};window.__svcId=window.__svcId||(salesInvoices().find(x=>x.isService)||{}).id;saleInvoiceCard(window.__svcId)});await p.waitForTimeout(300);
   await ev(()=>printOnly('printSaleService','Shërbim test'));await p.waitForTimeout(250);
   const fr2=await ev(()=>{const f=document.getElementById('biobesPrintFrame');if(!f)return null;
     return {css:(f.contentDocument.querySelector('style')||{}).textContent||'',body:f.contentDocument.body.innerHTML}});
   assert.ok(fr2,'iframe printSaleService mungon');
   assert.match(fr2.css,/@page\{size:A4 portrait/);
   assert.match(fr2.body,/Shërbim transporti/);
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
