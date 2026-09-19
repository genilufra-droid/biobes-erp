/* Numërimi i dokumentave: numrin e vendos përdoruesi (blloku biobes-doc-numbering-v1).
   Mënyrat: automatik (si sot) / propozim (i ndryshueshëm) / me dorë (i detyrueshëm).
   Dokumentet: PS, FB, FS, PK, NG, PR, SM, PO, MP, MA, FH, FD, SHP. */
const {open}=require('./helpers.cjs');const assert=require('node:assert/strict');
let passed=0,failed=0;
async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',String((e&&e.message)||e).split('\n')[0])}}
(async()=>{const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 const set=(id,v)=>ev(([id,v])=>{const e=document.getElementById(id);if(!e)throw new Error('mungon fusha '+id);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}));return 1},[id,v]);
 const fire=(fn,...a)=>ev(([f,a])=>{setTimeout(()=>window[f](...a),0);return 1},[fn,a]);   /* nuk pret dialogun */
 const toasts=()=>ev(()=>window.__t||[]);
 const lastToast=async()=>(await toasts()).slice(-1)[0]||'';
 const openModal=async(js,wait)=>{await ev(()=>closeModal());await p.evaluate(src=>{window.eval(src)},js);await p.waitForTimeout(wait||650)};
 const fieldOf=async(id)=>ev(i=>{const e=document.getElementById(i);if(!e)return null;const f=e.closest('.field');
   return{value:e.value,readOnly:e.readOnly,placeholder:e.placeholder,first:!!f&&document.querySelector('#modalBody .form-grid .field')===f,
     hint:f&&f.querySelector('.hint[data-docnum]')?f.querySelector('.hint[data-docnum]').textContent:null}},id);
 const setMode=async(key,mode)=>{await ev(([k,m])=>docNumSetMode(k,m),[key,mode]);await p.waitForTimeout(350)};

 await step('Konfigurime → karta "Numërimi i dokumentave": 13 lloje, mënyrat e parazgjedhura = sjellja e sotme, numri i radhës si shembull',async()=>{
   await ev(()=>go('settings'));await p.waitForTimeout(600);
   const c=await ev(()=>{const card=document.getElementById('docNumCard');if(!card)return null;
     return{title:card.querySelector('h3').textContent,adminOnly:card.hasAttribute('data-admin-only'),
       rows:[...card.querySelectorAll('[data-dn]')].map(r=>({key:r.dataset.dn,doc:r.querySelector('b').textContent,
         pre:r.querySelector('input').value,mode:(r.querySelector('button.primary')||{}).textContent,
         next:(r.querySelector('span.hint:last-child b')||{}).textContent||''}))}});
   assert.ok(c,'karta mungon');assert.equal(c.title,'Numërimi i dokumentave');assert.ok(c.adminOnly);assert.equal(c.rows.length,13);
   const m=Object.fromEntries(c.rows.map(r=>[r.doc,r.mode]));
   assert.equal(m['Peshimi'],'Automatik');assert.equal(m['Faturë blerjeje'],'Automatik');assert.equal(m['Faturë shitjeje'],'Me dorë');
   assert.equal(m['Paketimi'],'Automatik');assert.equal(m['Mandat pagese (furnitor)'],'Propozim');assert.equal(m['Fletë hyrje'],'Propozim');
   assert.equal(m['Shpenzimet'],'Propozim');
   assert.match(c.rows[0].next,/^PS-\d{4}-\d{4}$/);assert.equal(c.rows[0].pre,'PS');assert.equal(c.rows[0].key,'PS');
   assert.match(await p.locator('#docNumCard').innerText(),/Formati është i lirë/);
   /* në mënyrën automatike asnjë fushë e re nuk shfaqet */
   await openModal('weighForm()',550);assert.equal(await ev(()=>!!document.getElementById('wNumber')),false);
   await ev(()=>closeModal());
 });

 await step('PS me dorë: fusha e parë bosh, pa numër refuzohet, me "125" → peshimi dhe loti marrin numrin 125',async()=>{
   await ev(()=>{window.__t=[];const b=toast;toast=m=>{window.__t.push(m);return b(m)}});
   await setMode('PS','manual');await openModal('weighForm()',600);
   const f=await fieldOf('wNumber');assert.ok(f);assert.equal(f.value,'');assert.equal(f.first,true);assert.equal(f.readOnly,false);
   assert.equal(f.placeholder,'p.sh. 125 ose A-17');assert.match(f.hint,/Numërim me dorë/);
   const fill=async num=>{await ev(()=>{const s=(id,v)=>{const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))};
     s('wWarehouse','W1');s('wSupplier','S1');s('wProduct','P105');
     const x=document.querySelectorAll('#weighRows tr')[0].querySelectorAll('input');x[1].value='60';x.forEach(e=>e.dispatchEvent(new Event('input',{bubbles:true})))});
     if(num!==null)await set('wNumber',num)};
   await fill(null);await fire('saveWeighRows',false);await p.waitForTimeout(600);
   assert.equal(await ev(()=>state.weighings.length),0);assert.match(await lastToast(),/Numri i dokumentit është i detyrueshëm — Peshimi/);
   await fill('125');await fire('saveWeighRows',true);await p.waitForTimeout(900);
   const r=await ev(()=>{const w=state.weighings.at(-1),l=state.lots.at(-1);return{id:w.id,net:w.net,status:w.status,lot:l.id,lotWeighing:l.weighing}});
   assert.equal(r.id,'125');assert.equal(r.net,60);assert.equal(r.status,'Konfirmuar');assert.equal(r.lotWeighing,'125');
   /* numri shfaqet në kartelë dhe në fletën e peshimit */
   await ev(()=>weightCard('125'));await p.waitForTimeout(500);
   assert.equal(await p.locator('#modalTitle').innerText(),'125');
   assert.match(await p.locator('#modalBody').innerText(),/Dokumenti:\s*125/);
   await ev(()=>closeModal());
 });

 await step('PS: numri i përsëritur refuzohet, shenjat e rrezikshme refuzohen, numri shumë i gjatë refuzohet',async()=>{
   await openModal('weighForm()',600);
   await ev(()=>{const s=(id,v)=>{const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))};s('wWarehouse','W1');s('wSupplier','S1');s('wProduct','P105');
     const x=document.querySelectorAll('#weighRows tr')[0].querySelectorAll('input');x[1].value='10';x.forEach(e=>e.dispatchEvent(new Event('input',{bubbles:true})))});
   const n0=await ev(()=>state.weighings.length);
   await set('wNumber','125');await fire('saveWeighRows',false);await p.waitForTimeout(600);
   assert.equal(await ev(()=>state.weighings.length),n0);assert.match(await lastToast(),/Numri "125" ekziston tashmë te Peshimi/);
   await set('wNumber','a\'b"c');await fire('saveWeighRows',false);await p.waitForTimeout(500);
   assert.match(await lastToast(),/nuk mund të përmbajë shenjat/);
   await set('wNumber','X'.repeat(41));await fire('saveWeighRows',false);await p.waitForTimeout(500);
   assert.match(await lastToast(),/shumë i gjatë/);
   assert.equal(await ev(()=>state.weighings.length),n0);
   await ev(()=>closeModal());
 });

 await step('PS propozim: fusha vjen e mbushur me numrin e radhës, mund të ndryshohet, po u la bosh merret propozimi',async()=>{
   await setMode('PS','propose');await openModal('weighForm()',600);
   const f=await fieldOf('wNumber');assert.match(f.value,/^PS-\d{4}-\d{4}$/);assert.equal(f.readOnly,false);assert.match(f.hint,/Sistemi propozon numrin e radhës/);
   const sug=f.value;
   await ev(()=>{const s=(id,v)=>{const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))};s('wWarehouse','W1');s('wSupplier','S2');s('wProduct','P105');
     const x=document.querySelectorAll('#weighRows tr')[0].querySelectorAll('input');x[1].value='20';x.forEach(e=>e.dispatchEvent(new Event('input',{bubbles:true})))});
   await set('wNumber','PESH-7');await fire('saveWeighRows',false);await p.waitForTimeout(700);
   assert.equal(await ev(()=>state.weighings.at(-1).id),'PESH-7');
   await openModal('weighForm()',600);
   await ev(()=>{const s=(id,v)=>{const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))};s('wWarehouse','W1');s('wSupplier','S1');s('wProduct','P105');
     const x=document.querySelectorAll('#weighRows tr')[0].querySelectorAll('input');x[1].value='20';x.forEach(e=>e.dispatchEvent(new Event('input',{bubbles:true})))});
   const sug2=await ev(()=>document.getElementById('wNumber').value);assert.match(sug2,/^PS-\d{4}-\d{4}$/);
   await set('wNumber','');await fire('saveWeighRows',false);await p.waitForTimeout(700);
   assert.equal(await ev(()=>state.weighings.at(-1).id),sug2,'po u la bosh merret numri i propozuar');
   assert.equal(await ev(()=>window.__biobesDocNumbering.suggest('PS')),sug2.replace(/(\d+)$/,m=>String(+m+1).padStart(4,'0')),'propozimi vazhdon nga numri i fundit');
   await ev(()=>closeModal());
 });

 await step('PS: në modifikim numri është i pandryshueshëm; në mënyrën automatike sjellja është e njëjtë si më parë',async()=>{
   const id=await ev(()=>state.weighings.at(-1).id);
   await ev(i=>editWeight(i),id);await p.waitForTimeout(900);
   const f=await fieldOf('wNumber');assert.equal(f.value,id);assert.equal(f.readOnly,true);assert.match(f.hint,/nuk ndryshohet pas krijimit/);
   await ev(()=>{const x=document.querySelectorAll('#weighRows tr')[0].querySelectorAll('input');x[1].value='25';x.forEach(e=>e.dispatchEvent(new Event('input',{bubbles:true})))});
   await p.locator('#modal').getByRole('button',{name:'Ruaj ndryshimet',exact:true}).click();await p.waitForTimeout(800);
   assert.equal(await ev(i=>by('weighings',i).id,id),id);
   await setMode('PS','auto');await openModal('weighForm()',600);
   assert.equal(await ev(()=>!!document.getElementById('wNumber')),false,'në mënyrën automatike fusha nuk shfaqet');
   await ev(()=>{const s=(id2,v)=>{const e=document.getElementById(id2);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))};s('wWarehouse','W1');s('wSupplier','S1');s('wProduct','P105');
     const x=document.querySelectorAll('#weighRows tr')[0].querySelectorAll('input');x[1].value='15';x.forEach(e=>e.dispatchEvent(new Event('input',{bubbles:true})))});
   await fire('saveWeighRows',false);await p.waitForTimeout(700);
   assert.match(await ev(()=>state.weighings.at(-1).id),/^PS-\d{4}-\d{4}$/);
   await ev(()=>closeModal());
 });

 await step('FB me dorë: pa numër refuzohet, me "FBL-99" fatura merr numrin e përdoruesit; përsëritja refuzohet',async()=>{
   await setMode('FB','manual');await openModal('purchaseInvoiceForm()',700);
   const f=await fieldOf('fifNumber');assert.equal(f.value,'');assert.equal(f.first,true);
   await ev(()=>{const s=(id,v)=>{const e=document.getElementById(id);if(e){e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))}};
     s('fifSupplier','S1');s('fifProduct','P105');s('fifQty','10');s('fifPrice','100');s('fifAmount','1000')});
   const n0=await ev(()=>purchaseInvoices().length);
   await fire('createPurchaseInvoiceFromForm');await p.waitForTimeout(700);
   assert.equal(await ev(()=>purchaseInvoices().length),n0);assert.match(await lastToast(),/Numri i dokumentit është i detyrueshëm — Faturë blerjeje/);
   await set('fifNumber','FBL-99');await fire('createPurchaseInvoiceFromForm');await p.waitForTimeout(900);
   const r=await ev(()=>{const f=purchaseInvoices().at(-1);return{id:f.id,supplier:f.supplier,total:f.total,status:f.status}});
   assert.deepEqual(r,{id:'FBL-99',supplier:'S1',total:1000,status:'Draft'});
   await openModal('purchaseInvoiceForm()',700);
   await ev(()=>{const s=(id,v)=>{const e=document.getElementById(id);if(e){e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))}};s('fifSupplier','S1');s('fifProduct','P105');s('fifQty','5');s('fifPrice','100');s('fifAmount','500')});
   await set('fifNumber','FBL-99');await fire('createPurchaseInvoiceFromForm');await p.waitForTimeout(700);
   assert.equal(await ev(()=>purchaseInvoices().length),n0+1);assert.match(await lastToast(),/ekziston tashmë te Faturë blerjeje/);
   await ev(()=>closeModal());
 });

 await step('FS: numri i përdoruesit ruhet te fatura (id mbetet i brendshëm), titulli dhe raportet shfaqin numrin; përsëritja kërkon autorizim admini',async()=>{
   await setMode('FS','manual');await openModal("saleInvoiceForm('')",850);
   const f=await fieldOf('sfiNumber');assert.equal(f.value,'');assert.match(f.hint,/Numërim me dorë/);
   const fill=async()=>{await ev(()=>{const r=document.querySelector('.sale-line');const s=(sel,v)=>{const e=r.querySelector(sel);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}};
     s('.sale-product','P105');s('.sl-net','100');s('.sl-gross','100');s('.sl-price','5');
     const c=document.getElementById('sfiCustomer');c.value='C1';c.dispatchEvent(new Event('change',{bubbles:true}))})};
   await fill();await fire('saveSaleInvoiceV2','',true);await p.waitForTimeout(800);
   assert.equal(await ev(()=>salesInvoices().length),0);assert.match(await lastToast(),/Numri i dokumentit është i detyrueshëm — Faturë shitjeje/);
   await set('sfiNumber','686/2026');await fire('saveSaleInvoiceV2','',true);await p.waitForTimeout(1000);
   const r=await ev(()=>{const f=salesInvoices().at(-1);return{num:f.invoiceNumber,total:f.total,status:f.status,idIsInternal:/^FS-\d{4}-\d{4}$/.test(f.id),title:document.getElementById('modalTitle').textContent}});
   assert.equal(r.num,'686/2026');assert.equal(r.total,500);assert.equal(r.status,'Konfirmuar');assert.ok(r.idIsInternal,r.idIsInternal);
   assert.equal(r.title,'Faturë shitjeje — 686/2026');
   /* përsëritja: dialog i adminit, password i gabuar refuzohet, i saktë autorizohet + ngjarje në ditar */
   await openModal("saleInvoiceForm('')",850);await fill();await set('sfiNumber','686/2026');
   await fire('saveSaleInvoiceV2','',false);await p.waitForTimeout(900);
   assert.equal(await ev(()=>!!document.getElementById('docNumAuth')),true,'dialogu i autorizimit nuk u hap');
   assert.match(await p.locator('#docNumAuth h3').innerText(),/Numri i dokumentit është përdorur tashmë/);
   assert.match(await p.locator('#docNumAuth').innerText(),/686\/2026/);
   const n0=await ev(()=>salesInvoices().length);
   await p.locator('#docNumReason').fill('dy fatura me të njëjtin numër serie');
   await p.locator('#docNumPass').fill('gabim');await p.locator('#docNumOk').click();await p.waitForTimeout(1500);
   assert.match(await p.locator('#docNumErr').innerText(),/Password|gabuar|nuk u arrit/i);
   assert.equal(await ev(()=>salesInvoices().length),n0,'pa autorizim nuk ruhet');
   await p.locator('#docNumPass').fill('Audit-Only-2026!');await p.locator('#docNumOk').click();await p.waitForTimeout(1800);
   const after=await ev(()=>({n:salesInvoices().length,nums:salesInvoices().map(f=>f.invoiceNumber),
     ev:state.events.filter(e=>e.type==='Numër dokumenti i përsëritur').at(-1),dialog:!!document.getElementById('docNumAuth')}));
   assert.equal(after.n,n0+1);assert.equal(after.nums.filter(x=>x==='686/2026').length,2);assert.equal(after.dialog,false);
   assert.match(after.ev.text,/Faturë shitjeje 686\/2026 — numër i përsëritur i autorizuar nga admini audit · arsyeja: dy fatura/);
   await ev(()=>closeModal());
 });

 await step('FH me dorë: pa numër refuzohet, me "HYR-1" fleta merr numrin; në mënyrën automatike fusha është e pandryshueshme',async()=>{
   const pick=async(sel,v)=>{await ev(([s,v])=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);await p.waitForTimeout(140)};
   const fillLine=async qty=>{await ev(()=>{const tr=document.querySelectorAll('#sdLines tr.sd-line')[0];const ps=tr.querySelector('.sdl-product');ps.value='P105';ps.dispatchEvent(new Event('change',{bubbles:true}))});await p.waitForTimeout(180);
     await ev(q=>{const tr=document.querySelectorAll('#sdLines tr.sd-line')[0];const sp=tr.querySelector('.sdl-supplier');sp.value='S1';sp.dispatchEvent(new Event('change',{bubbles:true}));
       tr.querySelector('.sdl-qty').value=String(q);tr.querySelector('.sdl-cost').value='100';sdRecalc()},qty);await p.waitForTimeout(120)};
   await setMode('FH','manual');await openModal("stockDocForm('IN')",800);
   assert.equal(await ev(()=>document.getElementById('sdNumber').value),'','në mënyrën me dorë propozimi pastrohet');
   await pick('#sdWarehouse','W1');await fillLine(10);
   await fire('saveStockDoc',false);await p.waitForTimeout(700);
   assert.equal(await ev(()=>window.__biobesStockDocs.docs().length),0);assert.match(await lastToast(),/Numri i dokumentit është i detyrueshëm — Fletë hyrje/);
   await set('sdNumber','HYR-1');await fire('saveStockDoc',false);await p.waitForTimeout(900);
   const d=await ev(()=>{const x=window.__biobesStockDocs.docs().at(-1);return{n:x.number,kind:x.kind,qty:x.lines[0].qty,status:x.status}});
   assert.deepEqual(d,{n:'HYR-1',kind:'IN',qty:10,status:'Draft'});
   /* automatik: fusha e mbushur dhe e pandryshueshme */
   await setMode('FH','auto');await openModal("stockDocForm('IN')",800);
   const a=await ev(()=>({v:document.getElementById('sdNumber').value,ro:document.getElementById('sdNumber').readOnly}));
   assert.match(a.v,/^FH-\d{4}-\d{4}$/);assert.equal(a.ro,true);
   await ev(()=>closeModal());
 });

 await step('SHP: numri i përdoruesit ruhet; përsëritja refuzohet (pa dialog, sepse kontrolli i brendshëm nuk anashkalohet)',async()=>{
   await setMode('SHP','manual');await openModal('expenseForm()',800);
   assert.equal(await ev(()=>document.getElementById('exNumber').value),'');
   const fillEx=async()=>{await ev(()=>{const s=(id,v)=>{const e=document.getElementById(id);if(e){e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}))}};
     s('exCategory','MIREMBAJTJE');s('exItem','Filtra');s('exAmount','5000');s('exDate','2026-09-18');s('exMethod','cash');s('exSupplier','S1')});await p.waitForTimeout(200)};
   await fillEx();await p.locator('#modal').getByRole('button',{name:'Ruaj draft',exact:true}).click();await p.waitForTimeout(700);
   assert.equal(await ev(()=>state.expenses.length),0);assert.match(await lastToast(),/Numri i dokumentit është i detyrueshëm — Shpenzimet/);
   await set('exNumber','SH-1');await p.locator('#modal').getByRole('button',{name:'Ruaj draft',exact:true}).click();await p.waitForTimeout(900);
   assert.equal(await ev(()=>state.expenses.at(-1).number),'SH-1');
   await openModal('expenseForm()',800);await fillEx();await set('exNumber','SH-1');
   await p.locator('#modal').getByRole('button',{name:'Ruaj draft',exact:true}).click();await p.waitForTimeout(900);
   assert.equal(await ev(()=>state.expenses.length),1);assert.equal(await ev(()=>!!document.getElementById('docNumAuth')),false);
   assert.match(await lastToast(),/ekziston/i);
   await ev(()=>closeModal());
 });

 await step('MP/MA me dorë: propozimi pastrohet dhe numri i shkruar bëhet numër dokumenti',async()=>{
   await setMode('MP','manual');await openModal('paymentForm()',650);
   assert.equal(await ev(()=>document.getElementById('pNo').value),'');
   await set('pSupplier','S1');await set('pAmount','500');await set('pDate','2026-09-18');await set('pNo','MP-A17');
   await fire('addPayment');await p.waitForTimeout(900);
   assert.equal(await ev(()=>state.payments.at(-1).id),'MP-A17');
   await setMode('MA','manual');await openModal('receiptForm()',650);
   assert.equal(await ev(()=>document.getElementById('rNo').value),'');
   await set('rCustomer','C1');await set('rAmount','300');await set('rDate','2026-09-18');await set('rNo','ARK-5');
   await fire('saveReceipt');await p.waitForTimeout(900);
   assert.equal(await ev(()=>customerPayments().at(-1).id),'ARK-5');
   /* MP automatik: propozim i pandryshueshëm */
   await setMode('MP','auto');await openModal('paymentForm()',650);
   const a=await ev(()=>({v:document.getElementById('pNo').value,ro:document.getElementById('pNo').readOnly}));
   assert.match(a.v,/^MP-\d{4}$/);assert.equal(a.ro,true);
   await ev(()=>closeModal());
 });

 await step('PO/SM me dorë: numri i përdoruesit bëhet çelës i dokumentit, ditari dhe mesazhi përdorin numrin e ri',async()=>{
   await setMode('PO','manual');await openModal('orderForm()',750);
   const f=await fieldOf('oNumber');assert.equal(f.value,'');assert.equal(f.first,true);
   await set('oCustomer','C1');
   await ev(()=>{const tr=document.querySelector('#newOrderItems tr');const pr=tr.querySelector('.oni-product');pr.value='P105';pr.dispatchEvent(new Event('change',{bubbles:true}));
     const q=tr.querySelector('.oni-qty');q.value='100';q.dispatchEvent(new Event('input',{bubbles:true}));q.dispatchEvent(new Event('change',{bubbles:true}))});
   await p.waitForTimeout(200);await set('oNumber','POR-17');await fire('addOrder');await p.waitForTimeout(1000);
   const o=await ev(()=>{const x=state.orders.at(-1);return{id:x.id,customer:x.customer,qty:x.items[0].qty,
     ev:state.events.filter(e=>String(e.ref)==='POR-17').at(-1),toast:document.getElementById('toast').textContent}});
   assert.equal(o.id,'POR-17');assert.equal(o.qty,100);assert.ok(o.ev,'ngjarja me numrin e ri');assert.match(o.ev.text,/POR-17/);
   assert.match(o.toast,/POR-17/,'mesazhi shfaq numrin e përdoruesit');
   await setMode('SM','manual');await openModal('sampleForm()',750);
   assert.equal(await ev(()=>document.getElementById('sNumber').value),'');
   await set('sCustomer','C1');await set('sProduct','P105');await set('sLot',await ev(()=>state.lots[0].id));await set('sNumber','MOST-3');
   await fire('addSample');await p.waitForTimeout(1000);
   const s=await ev(()=>{const x=state.samples.at(-1);return{id:x.id,ev:state.events.filter(e=>e.type==='Mostër e re').at(-1)}});
   assert.equal(s.id,'MOST-3');assert.equal(s.ev.ref,'MOST-3');assert.match(s.ev.text,/MOST-3/);
   await ev(()=>closeModal());
 });

 await step('PK/NG/PR: fusha e numrit shfaqet sipas mënyrës; ngarkesa dhe përpunimi marrin numrin e përdoruesit',async()=>{
   await setMode('PK','manual');await openModal('packagingForm()',800);
   const pk=await fieldOf('pkNumber');assert.ok(pk);assert.equal(pk.value,'');assert.equal(pk.first,true);
   await setMode('PK','propose');await openModal('packagingForm()',800);
   assert.match((await fieldOf('pkNumber')).value,/^PK-\d{4}-\d{4}$/);
   await setMode('PK','auto');await openModal('packagingForm()',800);
   assert.equal(await ev(()=>!!document.getElementById('pkNumber')),false);
   await ev(()=>closeModal());
   /* NG */
   await setMode('NG','manual');await openModal('shipmentForm()',950);
   assert.equal((await fieldOf('shNumber')).value,'');
   await set('shOrderAdd',await ev(()=>state.orders[0].id));await ev(()=>shipOrderAdd());await p.waitForTimeout(400);
   await set('shCustomer','C1');await set('shCarrier','Transport SHPK');await set('shPlate','AA 123 BB');
   await set('shGross','250');await set('shNet','240');await set('shBags','10');await set('shPallets','4');
   await set('shNumber','KON-2');await fire('addShipment');await p.waitForTimeout(1200);
   assert.equal(await ev(()=>state.shipments.at(-1).id),'KON-2');
   /* PR */
   await setMode('PR','manual');await openModal('processForm()',800);
   assert.equal((await fieldOf('prNumber')).value,'');
   await set('prOrder',await ev(()=>state.orders[0].id));await set('prProduct','P105');await set('prMachine','M1');await set('prInput','100');
   await set('prAddLot',await ev(()=>state.lots[0].id));await ev(()=>processSourceAdd());await p.waitForTimeout(400);
   await ev(()=>{const q=document.querySelector('[data-pr-qty]');q.value='100';q.dispatchEvent(new Event('input',{bubbles:true}));q.dispatchEvent(new Event('change',{bubbles:true}))});
   await set('prOutput','95');await set('prNumber','PROC-3');await fire('addProcess');await p.waitForTimeout(1300);
   assert.equal(await ev(()=>state.processes.at(-1).id),'PROC-3');
   await ev(()=>closeModal());
 });

 await step('Cilësimet ruhen në state.docNumbering, sinkronizohen dhe mbijetojnë pas rifreskimit të faqes',async()=>{
   await setMode('PS','manual');await setMode('FB','propose');
   await ev(()=>docNumSetPrefix('PS','PSH'));await p.waitForTimeout(300);
   const cfg=await ev(()=>({store:state.docNumbering,ps:window.__biobesDocNumbering.cfg('PS'),fb:window.__biobesDocNumbering.cfg('FB'),next:window.__biobesDocNumbering.suggest('PS')}));
   assert.equal(cfg.ps.mode,'manual');assert.equal(cfg.ps.prefix,'PSH');assert.equal(cfg.fb.mode,'propose');
   assert.match(cfg.next,/^PSH-\d{4}-\d{4}$/);
   assert.equal(cfg.store.PS.mode,'manual');assert.equal(cfg.store.PS.prefix,'PSH');
   await p.reload({waitUntil:'load'});await p.waitForFunction(()=>typeof state!=='undefined'&&state&&state.weighings);await p.waitForTimeout(1200);
   if(await ev(()=>!!document.getElementById('loginLock'))){
     await p.locator('#loginName').fill('audit');await p.locator('#loginPass').fill('Audit-Only-2026!');await p.locator('#loginPass').press('Enter');
     await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(700);}
   const after=await ev(()=>({ps:window.__biobesDocNumbering.cfg('PS'),fb:window.__biobesDocNumbering.cfg('FB')}));
   assert.equal(after.ps.mode,'manual');assert.equal(after.ps.prefix,'PSH');assert.equal(after.fb.mode,'propose');
   await openModal('weighForm()',800);
   assert.equal((await fieldOf('wNumber')).value,'','me dorë: fusha bosh edhe pas rifreskimit');
   await ev(()=>closeModal());
   await setMode('PS','auto');
 });

 await step('ROLE-USER: karta e numërimit nuk shfaqet dhe ndryshimi i mënyrës refuzohet',async()=>{
   await ev(async()=>{const h=await hashPassword('Prove-2026!');state.users.push({id:'U-DN',username:'dn-user',name:'Operator',role:'ROLE-USER',active:true,
     passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false,
     rights:{v:2,modules:{dashboard:['view'],weighings:['view','create','edit'],settings:['view']}}});save();closeModal();logoutUser()});
   await p.waitForFunction(()=>!!document.getElementById('loginLock'));
   await p.locator('#loginName').fill('dn-user');await p.locator('#loginPass').fill('Prove-2026!');await p.locator('#loginPass').press('Enter');
   await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(600);
   await ev(()=>go('settings'));await p.waitForTimeout(700);
   const visible=await ev(()=>{const c=document.getElementById('docNumCard');return c?getComputedStyle(c).display!=='none':false});
   assert.equal(visible,false,'karta e numërimit nuk duhet të shfaqet për përdoruesin e thjeshtë');
   const before=await ev(()=>JSON.stringify(state.docNumbering||{}));
   await ev(()=>{window.__t=[];const b=toast;toast=m=>{window.__t.push(m);return b(m)}});
   await ev(()=>docNumSetMode('PS','manual'));await p.waitForTimeout(500);
   assert.equal(await ev(()=>JSON.stringify(state.docNumbering||{})),before,'cilësimet nuk ndryshuan');
   assert.match(await lastToast(),/Vetëm administratori/);
   /* përdoruesi i thjeshtë nuk e sheh fushën e numrit nëse mënyra është automatike */
   await ev(()=>{closeModal();weighForm()});await p.waitForTimeout(800);
   assert.equal(await ev(()=>!!document.getElementById('wNumber')),false);
   await ev(()=>closeModal());
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
