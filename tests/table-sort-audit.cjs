/* tests/table-sort-audit.cjs — Renditja ↑/↓ (biobes-table-sort-v1) në çdo tabelë të moduleve.

   Provohet në desktop (1440×1000) dhe telefon (390×844):
   • MBULIMI: për çdo modul të sistemit, çdo tabelë liste me ≥2 rreshta bëhet e renditshme dhe
     cikli 3-gjendësh funksionon me klikim të vërtetë: rritës → zbritës → rendi origjinal.
   • SEMANTIKA: numrat shqip ("1 234,5 kg", "0.00", "(100)"), datat (ISO + 23.9.2026), teksti me
     numra natyrorë (2 < 10), qelizat bosh gjithmonë në fund, rreshtat TOTALI të ngulitur poshtë,
     kolona "Nr." që rinumërohet dhe kthehet saktë.
   • MBIJETESA: renditja mbahet pas render(), pas ndërrimit të modulit dhe pas kërkimit live.
   • PËRJASHTIMET: dokumentet për print (kartela, Alpha), formularët me input-e, kokat e bashkuara
     (colspan/rowspan) dhe tabelat me renditje të brendshme (.sdr-table).
   • 0 gabime konzole dhe 0 gabime të brendshme të modulit.

   Nisja: python3 -m http.server 8000 --bind 0.0.0.0   →   npm run test:table-sort */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');

/* ---------- ndihmëse të pavarura që ekzekutohen në faqe ---------- */
const HELPERS=`
window.__A={
  seq:0,
  norm:function(s){return String(s==null?'':s).replace(/[\\u00a0\\u202f\\u2007]/g,' ').replace(/\\s+/g,' ').trim()},
  isPinned:function(r){
    if(!r.cells.length)return true;
    if(r.cells.length===1&&r.cells[0].colSpan>1)return true;
    if(r.classList.contains('total-row')||r.classList.contains('alpha-total-row'))return true;
    return /^(totali|total|shuma|n\\u00ebntotali|gjithsej)$/i.test(window.__A.norm(r.cells[0].textContent));
  },
  dataRows:function(t){
    var tb=t.tBodies[0];if(!tb)return [];
    return [].slice.call(tb.rows).filter(function(r){return !window.__A.isPinned(r)});
  },
  dataCount:function(t){return window.__A.dataRows(t).length},
  heads:function(t){var h=t.tHead;if(!h||!h.rows.length)return [];
    return [].slice.call(h.rows[h.rows.length-1].cells).map(function(c){return window.__A.norm(c.textContent)})},
  headCells:function(t){var h=t.tHead;return h&&h.rows.length?[].slice.call(h.rows[h.rows.length-1].cells):[]},
  sortHeads:function(t){return window.__A.headCells(t).map(function(c,i){return c.classList.contains('bb-sort')?i:-1}).filter(function(i){return i>=0})},
  cell:function(r,i){
    var td=r.cells[i];if(!td)return '';
    var t=window.__A.norm(td.textContent||'');if(t)return t;
    var el=td.querySelector('input,select,textarea');if(!el)return '';
    if(el.tagName==='SELECT'){var o=el.options&&el.options[el.selectedIndex];return window.__A.norm(o?o.textContent:el.value)}
    return window.__A.norm(el.value);
  },
  col:function(t,i){return window.__A.dataRows(t).map(function(r){return window.__A.cell(r,i)})},
  sortText:function(arr,dir){var s=dir==='desc'?-1:1;
    return arr.slice().sort(function(a,b){return window.__biobesTableSortV1.compareText(a,b)*s})},
  tag:function(t){window.__A.dataRows(t).forEach(function(r){if(!r.__aid)r.__aid='A'+(++window.__A.seq)})},
  ids:function(t){return window.__A.dataRows(t).map(function(r){return r.__aid})},
  /* vlera e pavarur e një qelize: datë, numër (me parseLocal të aplikacionit) ose tekst */
  val:function(s){
    var t=window.__A.norm(s);if(!t)return null;
    var m=t.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})/);
    if(m)return {k:'date',v:Date.UTC(+m[1],+m[2]-1,+m[3])};
    m=t.match(/^(\\d{1,2})[.\\/-](\\d{1,2})[.\\/-](\\d{4})/);
    if(m)return {k:'date',v:Date.UTC(+m[3],+m[2]-1,+m[1])};
    var neg=t.charAt(0)==='('&&t.charAt(t.length-1)===')';
    var body=neg?t.slice(1,-1):t;
    var mm=body.match(/^([-+\\u2212])?\\s*(\\d[\\d .,]*)/);
    if(mm){
      var rest=body.slice(mm[0].length).replace(/\\s/g,'').replace(/[^a-zA-Z%\\u00eb\\u00e7]/g,'');
      if(rest.length<=8){
        var core=(mm[1]&&mm[1]!=='+'?'-':'')+mm[2].replace(/[^\\d.,]/g,'');
        var v=window.parseLocal(core);
        if(typeof v==='number'&&isFinite(v))return {k:'num',v:neg?-v:v};
      }
    }
    return {k:'text',v:t.toLowerCase().replace(/\\u00eb/g,'e').replace(/\\u00e7/g,'c')};
  },
  /* a është kolona e renditur saktë në drejtimin dir? Provohen të 3 mënyrat (datë/numër/tekst):
     mjafton njëra, por rendi duhet të jetë i qëndrueshëm dhe boshllëket të jenë në fund. */
  check:function(t,i,dir){
    var cells=window.__A.col(t,i),vals=cells.map(function(s){
      var v=window.__A.val(s);return {s:s,k:v?v.k:'empty',v:v?v.v:null}});
    var s=dir==='desc'?-1:1,modes=['date','num','text'],res=null;
    var nonEmpty=vals.filter(function(x){return x.s!==''}).length;
    modes.forEach(function(mode){
      if(res)return;
      var last=null,ok=true,tail=false,matched=0;
      for(var j=0;j<vals.length;j++){
        var x=vals[j],outside=(mode==='text')?(x.s===''):(x.k!==mode);
        if(outside){ if(last!==null)tail=true; continue }            /* qelizat jashtë llojit → fund */
        matched++;
        if(tail){ok=false;break}                                     /* u kthye pas boshllëkut */
        if(last!==null){
          var c=(mode==='text')?window.__biobesTableSortV1.compareText(last.raw,x.s):(last.v-x.v);
          if(c*s>0){ok=false;break}
        }
        last={v:x.v,raw:x.s};
      }
      /* mënyra duhet të zbatohet në shumicën e qelizave, përndryshe kalimi është trivial */
      if(ok&&matched>=Math.max(2,Math.ceil(nonEmpty*0.6)))res={ok:true,mode:mode};
    });
    if(!res)res={ok:false,mode:null};
    res.vals=cells;
    res.state=window.__biobesTableSortV1.state(t);
    res.aria=window.__A.headCells(t).map(function(c){return c.getAttribute('aria-sort')});
    res.cls=window.__A.headCells(t).map(function(c){return c.className});
    return res;
  }
};
`;

/* ---------- të dhënat e auditimit: nga disa regjistrime për çdo modul ---------- */
const SEED=`
(function(){
  var S=state.suppliers,C=state.customers,P=state.products,W=state.warehouses,R=state.racks,M=state.machines||[];
  var sup=function(i){return S[i%S.length].id},cus=function(i){return C[i%C.length].id},
      prd=function(i){return P[i%P.length].id},wh=function(i){return W[i%W.length].id},
      rk=function(i){return R.length?R[i%R.length].id:''};
  var arr=function(k){if(!Array.isArray(state[k]))state[k]=[];return state[k]};
  var docs=function(f,k){try{return (typeof f==='function')?f():arr(k)}catch(e){return arr(k)}};
  /* peshime: data që kalojnë vitin + neto që dallon renditjen numerike nga ajo tekstuale */
  [['2026-01-05',987,'Konfirmuar'],['2025-12-31',1234.5,'Konfirmuar'],['2026-09-23',12000,'Draft'],
   ['2026-03-11',45.25,'Konfirmuar'],['2026-07-02',3100,'Anuluar']].forEach(function(w,i){
    arr('weighings').push({id:'PS-2026-0'+(101+i),date:w[0],createdAt:w[0]+'T08:00:00',supplier:sup(i),product:prd(i),
      receiver:'Audit',bags:10+i,weights:[w[1]+50],tares:[50],gross:w[1]+50,tare:50,net:w[1],physical:w[1],
      discount:0,billable:w[1],price:100+i*7,status:w[2],attachment:'',warehouse:wh(i),rack:rk(i)});
  });
  /* lote */
  [['2026-01-06',900],['2026-02-14',2500.75],['2025-11-30',120],['2026-09-01',4400]].forEach(function(l,i){
    arr('lots').push({id:'LA'+i,code:'B1AUD-'+(101+i)+'-26',weighing:'PS-2026-0'+(101+i),supplier:sup(i),product:prd(i),
      warehouse:wh(i),rack:rk(i),gross:l[1]+40,tare:40,net:l[1],originalNet:l[1],availableNet:l[1],
      status:i%2?'N\\u00eb magazinim':'I rezervuar',date:l[0]});
  });
  /* mandate pageshëse */
  [['2026-01-09',1500,'ALL','Cash'],['2026-02-19',250.5,'EUR','Bank\\u00eb'],['2025-12-05',20000,'ALL','Ark\\u00eb'],
   ['2026-09-20',75000,'ALL','Bank\\u00eb']].forEach(function(m,i){
    arr('payments').push({id:'MP-2026-0'+(101+i),date:m[0],createdAt:m[0]+'T09:00:00',supplier:sup(i),invoice:'',method:m[3],
      amount:m[1],currency:m[2],rate:m[2]==='ALL'?1:97.4,exchangeRate:m[2]==='ALL'?1:97.4,status:'Konfirmuar',
      description:'Pages\\u00eb auditimi',note:'Pages\\u00eb auditimi',isPrepayment:i===3});
  });
  /* porosi */
  [['2026-01-12',1200,300],['2026-04-04',20250,0],['2025-10-21',75,75]].forEach(function(o,i){
    arr('orders').push({id:'PO-2026-0'+(101+i),date:o[0],customer:cus(i),status:i===2?'E p\\u00ebrfunduar':'N\\u00eb prodhim',
      items:[{product:prd(i),qty:o[1],done:o[2]}]});
  });
  /* mostra */
  [['2026-01-15','E aprovuar'],['2026-05-05','N\\u00eb pritje'],['2025-09-09','E refuzuar']].forEach(function(s,i){
    arr('samples').push({id:'SM-2026-0'+(101+i),date:s[0],customer:cus(i),product:prd(i),lot:'LA'+i,
      tracking:String(2957970000+i*13),status:s[1]});
  });
  /* ngarkesa */
  [['2026-01-20','AA 101 BB',1200],['2026-06-06','BB 202 CC',20250],['2025-12-28','CC 303 DD',75]].forEach(function(s,i){
    arr('shipments').push({id:'FSH-2026-0'+(101+i),date:s[0],loadingDate:s[0],order:'PO-2026-0'+(101+i),customer:cus(i),
      status:i===1?'Dor\\u00ebzuar':'Ngarkuar',plate:s[1],seal:'PL'+(1000+i),net:s[2],carrier:'Audit Lines'});
  });
  /* p\\u00ebrpunime */
  [['2026-02-02',1000,910],['2026-08-08',500,455]].forEach(function(p,i){
    arr('processes').push({id:'PR-2026-0'+(101+i),date:p[0],orders:['PO-2026-0'+(101+i)],product:prd(i),
      input:p[1],output:p[2],machine:M.length?M[i%M.length].id:'',status:i?'N\\u00eb pun\\u00eb':'P\\u00ebrfunduar'});
  });
  /* paketimi */
  docs(window.packs,'packagings');
  [['2026-02-03',40],['2026-08-09',900]].forEach(function(p,i){
    docs(window.packs,'packagings').push({id:'PK-2026-0'+(101+i),date:p[0],order:'PO-2026-0'+(101+i),product:prd(i),
      sourceLots:['LA'+i],net:p[1],qty:p[1],bags:20+i,internalLot:'B1AUD-'+(101+i)+'-26',clientLot:'LOT-KLI-'+(11+i),
      model:'Thes 25 kg'});
  });
  /* fatura blerjeje */
  [['2026-01-10',987,2],['2026-03-12',1234.5,3],['2025-12-06',12000,1.5]].forEach(function(f,i){
    docs(window.purchaseInvoices,'purchaseInvoices').push({id:'FB-2026-0'+(101+i),weighing:'PS-2026-0'+(101+i),
      supplierInvoiceNo:'FB-2026-0'+(101+i),date:f[0],invoiceDate:f[0],createdAt:f[0]+'T09:00:00',supplier:sup(i),product:prd(i),
      physical:f[1],billable:f[1],price:f[2],currency:i===1?'EUR':'ALL',exchangeRate:i===1?97.4:1,vat:20,
      subtotal:f[1]*f[2],vatAmount:f[1]*f[2]*0.2,total:f[1]*f[2]*1.2,status:i===2?'Draft':'Konfirmuar',documentType:'FB'});
  });
  /* fatura shitjeje */
  [['2026-01-22',200],['2026-07-07',20250]].forEach(function(f,i){
    docs(window.salesInvoices,'salesInvoices').push({id:'FSH-2026-0'+(201+i),invoiceNumber:'FSH-2026-0'+(201+i),
      date:f[0],createdAt:f[0]+'T12:00:00',customer:cus(i),order:'PO-2026-0'+(101+i),shipment:'FSH-2026-0'+(101+i),
      currency:'ALL',exchangeRate:1,vat:20,subtotal:f[1],vatAmount:f[1]*0.2,total:f[1]*1.2,status:'Konfirmuar',
      documentType:'FSH',lines:[{product:prd(i),net:f[1],price:5,discount:0}]});
  });
  /* ark\\u00ebtime */
  [['2026-01-25',120],['2026-08-11',24000]].forEach(function(r,i){
    docs(window.customerPayments,'customerPayments').push({id:'MA-2026-0'+(101+i),date:r[0],createdAt:r[0]+'T09:00:00',
      customer:cus(i),invoice:'FSH-2026-0'+(201+i),method:i?'Bank\\u00eb':'Cash',amount:r[1],currency:'ALL',rate:1,
      status:'Konfirmuar',description:'Ark\\u00ebtim auditimi'});
  });
  /* banka */
  docs(window.bankAccounts,'bankAccounts').push({id:'BA-AUD',code:'BANK-AUD',bank:'Banka e Auditimit',iban:'AL00AUDIT',
    currency:'ALL',ledgerAccount:'512',openingBalance:0,active:true});
  [['2026-01-30',10,'fee','out'],['2026-05-05',2500,'transfer','in'],['2025-11-11',900,'cash','out']].forEach(function(t,i){
    docs(window.bankTransactions,'bankTransactions').push({id:'BT-2026-0'+(101+i),date:t[0],valueDate:t[0],
      createdAt:t[0]+'T10:00:00',bankAccount:'BA-AUD',type:t[2],direction:t[3],amount:t[1],currency:'ALL',rate:1,fee:0,
      counterpart:'618',reference:'REF-'+(101+i),description:'Veprim bankar auditimi',status:i===2?'Draft':'Konfirmuar'});
  });
  /* shpenzime */
  [['2026-01-18',4500,'Transport'],['2026-06-06',12800,'Karburant'],['2025-10-10',750,'Materiale konsumi']].forEach(function(e,i){
    docs(window.ex&&window.ex.docs,'expenses').push({id:'EX-2026-0'+(101+i),number:'EX-2026-0'+(101+i),date:e[0],
      createdAt:e[0]+'T08:00:00',category:e[2],item:'',supplierId:sup(i),payee:'Pale auditimi',invoiceNo:'INV-'+(101+i),
      description:'Shpenzim auditimi',method:i===1?'bank':'cash',bankAccount:i===1?'BA-AUD':'',vatRate:20,
      deductible:i!==2,net:e[1],vat:e[1]*0.2,total:e[1]*1.2,status:i===2?'Draft':'Konfirmuar',createdBy:'ROLE-ADMIN'});
  });
  /* dokumente magazinash (flet\\u00eb hyrje / dalje) */
  [['2026-01-21','IN',320],['2026-08-02','OUT',140],['2025-12-12','IN',980.5]].forEach(function(d,i){
    docs(window.stockDocs,'stockDocs').push({id:'SD-2026-0'+(101+i),number:(d[1]==='IN'?'FH-2026-0':'FD-2026-0')+(101+i),
      kind:d[1],date:d[0],warehouse:wh(i),rack:rk(i),reason:i===1?'Shitje lokale':'Blerje pa peshim',
      party:{type:d[1]==='IN'?'supplier':'customer',id:d[1]==='IN'?sup(i):cus(i),name:'Pale auditimi'},
      address:'Adres\\u00eb auditimi',note:'Auditim',
      lines:[{id:'L1',product:prd(i),lot:'LA'+i,lotCode:'B1AUD-'+(101+i)+'-26',supplier:sup(i),qty:d[2],bags:10+i,
        unitCost:2.5,value:d[2]*2.5}],status:i===2?'Draft':'Konfirmuar',createdAt:d[0]+'T08:00:00'});
  });
  /* klient\\u00eb / furnitor\\u00eb shtes\\u00eb p\\u00ebr renditje tekstuale me numra natyror\\u00eb */
  arr('customers').push({id:'CA10',code:'K-010',name:'Alfa 9 shpk',country:'Albania',city:'Tiran\\u00eb',balance:0});
  arr('customers').push({id:'CA11',code:'K-002',name:'Beta 10 shpk',country:'Italy',city:'Bari',balance:1200});
  arr('suppliers').push({id:'SA10',code:'S09/2',name:'Zeta 100 bujq',region:'Fier',phone:'069 000 000',balance:-4500});
  arr('suppliers').push({id:'SA11',code:'S02/10',name:'Eta 20 bujq',region:'Berat',phone:'',balance:300});
  if(typeof save==='function')save();
  if(typeof render==='function')render();
})();
`;

const INTENTIONAL=['dokument/renditje-e-brendshme','dokument-print','formular','koke-e-bashkuar','onclick-ekzistues','data-no-sort'];

(async()=>{
 let passed=0,failed=0;
 const modes=[[false,'desktop 1440×1000'],[true,'telefon 390×844']];
 for(const [mobile,label] of modes){
  console.log('\n========================= '+label+' =========================');
  const {browser,page:p,errors}=await open(mobile);
  const ev=(f,...a)=>p.evaluate(f,...a);
  async function step(name,fn){
    try{await fn();passed++;console.log('ok   -',name)}
    catch(e){failed++;const m=String(e.message||e).split('\n');
      console.log('FAIL -',name,'\n       → '+m.slice(0,14).join('\n         ').slice(0,1400))}
  }
  await ev(HELPERS);
  const tables=async()=>ev(()=>[...document.querySelectorAll('#main table')].map((t,i)=>({
    i,rows:window.__A.dataCount(t),sortable:t.classList.contains('bb-sortable'),
    heads:window.__A.heads(t),sortHeads:window.__A.sortHeads(t),why:window.__biobesTableSortV1.isSortable(t)})));
  const th=(i,c)=>p.locator('#main table').nth(i).locator('thead th').nth(c);
  const TB='document.querySelectorAll("#main table")';

  await step('moduli ngarkohet: API + stil + 0 gabime',async()=>{
    const r=await ev(()=>({v:window.__biobesTableSortV1.version,rep:typeof window.tableSortReport==='function',
      css:[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(x=>/bb-sortable/.test(x.cssText))}catch(e){return false}})}));
    assert.equal(r.v,'1.1.0');assert.ok(r.rep,'mungon tableSortReport()');assert.ok(r.css,'mungon stili i kokave');
  });

  await step('të dhënat e auditimit mbillen në çdo modul',async()=>{
    await ev(SEED);
    await p.waitForTimeout(500);
    const c=await ev(()=>({weighings:state.weighings.length,lots:state.lots.length,payments:state.payments.length,
      orders:state.orders.length,samples:state.samples.length,shipments:state.shipments.length,processes:state.processes.length,
      packagings:(window.packs?packs():state.packagings).length,purchaseInvoices:purchaseInvoices().length,
      salesInvoices:salesInvoices().length,customerPayments:customerPayments().length,bankTransactions:bankTransactions().length,
      expenses:(window.ex&&ex.docs?ex.docs():state.expenses).length,stockDocs:(window.stockDocs?stockDocs():state.stockDocs).length}));
    Object.entries(c).forEach(([k,v])=>assert.ok(v>=2,'moduli '+k+' ka vetëm '+v+' regjistrime'));
  });

  /* ---------- MBULIMI: çdo modul, çdo tabelë liste ---------- */
  const pages=await ev(()=>(typeof modules!=='undefined'?modules:[]).map(m=>m[0]));
  const matrix=[];let verified=0,excluded=0;
  for(const pg of pages){
    await step('moduli "'+pg+'": tabelat renditen ↑ ↓ dhe kthehen në rendin origjinal',async()=>{
      await ev(x=>window.go(x),pg);
      await p.waitForTimeout(360);
      const list=await tables();
      const withRows=list.filter(t=>t.rows>=2);
      matrix.push({modul:pg,tabela:list.length,meRreshta:withRows.length,
        teRenditshme:withRows.filter(t=>t.sortable).length,
        teAnashkaluara:withRows.filter(t=>!t.sortable).map(t=>t.why||'?')});
      for(const t of withRows){
        if(!t.sortable){
          assert.ok(INTENTIONAL.includes(t.why),
            `tabela #${t.i} (${t.heads.slice(0,3).join('/')}) u anashkalua pa arsye të pritshme: ${t.why}`);
          excluded++;continue;
        }
        assert.ok(t.sortHeads.length>=2,`tabela #${t.i} ka vetëm ${t.sortHeads.length} koka të klikueshme`);
        t.heads.forEach((h,ix)=>{
          if(/^(veprime|veprimet)$/i.test(h))assert.ok(!t.sortHeads.includes(ix),'kolona "'+h+'" nuk duhet të renditet');
        });
        const c=t.sortHeads[0];
        await ev(ii=>{window.__A.tag(document.querySelectorAll('#main table')[ii])},t.i);
        const orig=await ev(ii=>window.__A.ids(document.querySelectorAll('#main table')[ii]),t.i);
        /* 1) klikim → rritës */
        await th(t.i,c).click();await p.waitForTimeout(190);
        let r=await ev(a=>window.__A.check(document.querySelectorAll('#main table')[a[0]],a[1],'asc'),[t.i,c]);
        assert.ok(r.ok,`"${pg}" kolona "${t.heads[c]}": rritës i gabuar → ${JSON.stringify(r.vals.slice(0,5))}`);
        assert.equal(r.aria[c],'ascending','aria-sort jo ascending');
        assert.ok(/bb-sort-asc/.test(r.cls[c]),'koka nuk u shënua si rritëse');
        const ascIds=await ev(ii=>window.__A.ids(document.querySelectorAll('#main table')[ii]),t.i);
        /* 2) klikim → zbritës */
        await th(t.i,c).click();await p.waitForTimeout(190);
        r=await ev(a=>window.__A.check(document.querySelectorAll('#main table')[a[0]],a[1],'desc'),[t.i,c]);
        assert.ok(r.ok,`"${pg}" kolona "${t.heads[c]}": zbritës i gabuar → ${JSON.stringify(r.vals.slice(0,5))}`);
        assert.equal(r.aria[c],'descending','aria-sort jo descending');
        assert.ok(!r.cls.some(x=>/bb-sort-asc/.test(x)),'shenja rritëse mbeti në kokë tjetër');
        const descIds=await ev(ii=>window.__A.ids(document.querySelectorAll('#main table')[ii]),t.i);
        assert.notDeepEqual(descIds,ascIds,'zbritësi është i njëjtë me rritësin');
        /* 3) klikim → rendi origjinal */
        await th(t.i,c).click();await p.waitForTimeout(190);
        const back=await ev(ii=>window.__A.ids(document.querySelectorAll('#main table')[ii]),t.i);
        assert.deepEqual(back,orig,`"${pg}" kolona "${t.heads[c]}": rendi origjinal nuk u kthye`);
        const marks=await ev(ii=>document.querySelectorAll('#main table')[ii].querySelectorAll('th.bb-sort-asc,th.bb-sort-desc').length,t.i);
        assert.equal(marks,0,'shenjat ↑↓ mbetën pas kthimit');
        const arias=await ev(ii=>window.__A.headCells(document.querySelectorAll('#main table')[ii]).map(c=>c.getAttribute('aria-sort')),t.i);
        assert.ok(arias.every(a=>a===null||a==='none'),'aria-sort nuk u pastrua: '+JSON.stringify(arias));
        verified++;
      }
      await ev(()=>window.__biobesTableSortV1.resetAll());
    });
  }
  console.log('\n--- Matrica e mbulimit ('+label+') ---');
  matrix.forEach(m=>console.log('   '+m.modul.padEnd(14)+' tabela:'+String(m.tabela).padStart(2)+
    '  me≥2 rreshta:'+String(m.meRreshta).padStart(2)+'  të renditshme:'+String(m.teRenditshme).padStart(2)+
    (m.teAnashkaluara.length?'   (të përjashtuara me qëllim: '+m.teAnashkaluara.join(',')+')':'')));
  console.log('   → tabela të provuara me klikim: '+verified+'   të përjashtuara me qëllim: '+excluded);

  await step('mbulimi: ≥10 tabela të vërteta modulesh u provuan me klikim',async()=>{
    assert.ok(verified>=10,'u provuan vetëm '+verified+' tabela');
  });

  /* ---------- SEMANTIKA E DETAJUAR ---------- */
  await ev(x=>window.go(x),'weighings');await p.waitForTimeout(380);
  await step('kolona "Pesha fizike" renditet NUMERIKisht (12 000 kg > 987 kg)',async()=>{
    const w=await tables();const t=w.find(x=>x.rows>=5);assert.ok(t,'nuk ka tabelë peshimesh');
    const ci=t.heads.findIndex(h=>/pesha fizike/i.test(h));assert.ok(ci>=0,'nuk gjendet kolona e peshës');
    await ev(()=>window.sortTableColumn('#main table','Pesha fizike','asc'));await p.waitForTimeout(200);
    const kg=await ev(a=>window.__A.col(document.querySelectorAll('#main table')[a[0]],a[1]),[t.i,ci]);
    const vals=await ev(a=>window.__A.col(document.querySelectorAll('#main table')[a[0]],a[1]).map(s=>window.__A.val(s)),[t.i,ci]);
    const ns=vals.filter(v=>v.k==='num').map(v=>v.v);
    assert.equal(ns.length,kg.length,'jo të gjitha vlerat janë numerike: '+JSON.stringify(kg));
    for(let i=1;i<ns.length;i++)assert.ok(ns[i-1]<=ns[i],`jo numerik: ${kg[i-1]} → ${kg[i]}`);
    assert.equal(await ev(()=>window.__biobesTableSortV1.state(document.querySelector('#main table')).kind),'num');
  });

  await step('kolona "Data" renditet kronologjikisht edhe kur kalon vitin (2025 < 2026)',async()=>{
    await ev(()=>window.sortTableColumn('#main table','Data','asc'));await p.waitForTimeout(200);
    const d=await ev(()=>window.__A.col(document.querySelector('#main table'),1));
    assert.deepEqual(d,[...d].sort(),'datat nuk janë rritëse: '+d.join(','));
    assert.equal(d[0].slice(0,4),'2025','viti 2025 duhet të jetë i pari');
    await ev(()=>window.sortTableColumn('#main table','Data','desc'));await p.waitForTimeout(200);
    const d2=await ev(()=>window.__A.col(document.querySelector('#main table'),1));
    assert.deepEqual(d2,[...d].reverse(),'zbritësi nuk është e kundërta');
    assert.equal(await ev(()=>window.__biobesTableSortV1.state(document.querySelector('#main table')).kind),'date');
  });

  await step('thirrjet nga kodi janë idempotente (dy herë "asc" nuk e kthen në zbritës)',async()=>{
    await ev(()=>window.sortTableColumn('#main table','Furnitori','asc'));await p.waitForTimeout(160);
    const a=await ev(()=>window.__A.col(document.querySelector('#main table'),2));
    await ev(()=>window.sortTableColumn('#main table','Furnitori','asc'));await p.waitForTimeout(160);
    assert.deepEqual(await ev(()=>window.__A.col(document.querySelector('#main table'),2)),a);
    const s=await ev(()=>window.__A.col(document.querySelector('#main table'),2));
    assert.deepEqual(s,await ev(a=>window.__A.sortText(a,'asc'),s),'emrat nuk janë në rendin shqip');
    await ev(()=>window.__biobesTableSortV1.resetAll());
  });

  await ev(x=>window.go(x),'products');await p.waitForTimeout(380);
  await step('Produktet (50+ rreshta): renditje natyrale e tekstit (2 < 10) dhe "Veprime" e paprekur',async()=>{
    const w=await tables();const t=w.find(x=>x.rows>10);assert.ok(t,'nuk ka tabelë produktesh');
    const ci=t.heads.indexOf('Kodi');assert.ok(ci>=0,'nuk gjendet kolona "Kodi"');
    await th(t.i,ci).click();await p.waitForTimeout(240);
    const a=await ev(ii=>window.__A.col(document.querySelectorAll('#main table')[ii],0),t.i);
    assert.deepEqual(a,await ev(x=>window.__A.sortText(x,'asc'),a),'kodet nuk janë në rend natyror');
    assert.ok(a.length>10,'rreshta të paktë: '+a.length);
    const vi=t.heads.indexOf('Veprime');
    if(vi>=0)assert.ok(!t.sortHeads.includes(vi),'kolona "Veprime" u bë e renditshme');
    await ev(()=>window.__biobesTableSortV1.resetAll());
  });

  await step('çmimet me presje dhjetore renditen si numra (kolona "Çmim shitje")',async()=>{
    await ev(()=>window.sortTableColumn('#main table','Çmim shitje','desc'));await p.waitForTimeout(220);
    const vals=await ev(()=>{const t=document.querySelector('#main table');
      return window.__A.col(t,window.__A.heads(t).indexOf('Çmim shitje')).map(s=>window.__A.val(s))});
    const ns=vals.filter(v=>v.k==='num').map(v=>v.v);
    assert.ok(ns.length>1,'nuk ka çmime numerike');
    for(let i=1;i<ns.length;i++)assert.ok(ns[i-1]>=ns[i],`zbritës i gabuar: ${ns[i-1]} → ${ns[i]}`);
    await ev(()=>window.__biobesTableSortV1.resetAll());
  });

  /* ---------- PËRJASHTIMET ---------- */
  await step('kartela e furnitorit (print, me gjendje progresive) NUK renditet',async()=>{
    const id=await ev(()=>state.suppliers[0].id);
    await ev(x=>window.supplierCard(x),id);await p.waitForTimeout(460);
    const r=await ev(()=>{const t=[...document.querySelectorAll('#modalBody table')];
      return {n:t.length,sortable:t.filter(x=>x.classList.contains('bb-sortable')).length,
              why:t.map(x=>window.__biobesTableSortV1.isSortable(x))}});
    assert.ok(r.n>0,'kartela nuk u hap');
    assert.equal(r.sortable,0,'kartela u bë e renditshme: '+r.why.join(','));
    await ev(()=>closeModal());await p.waitForTimeout(280);
  });

  await step('formulari i peshimit (input-e në rreshta) NUK renditet',async()=>{
    await ev(()=>window.weighForm());await p.waitForTimeout(460);
    const r=await ev(()=>{const t=document.getElementById('weighRows');if(!t)return{missing:true};
      const tb=t.closest('table');return {sortable:tb.classList.contains('bb-sortable'),why:window.__biobesTableSortV1.isSortable(tb)}});
    assert.ok(!r.missing,'formulari nuk u hap');
    assert.equal(r.sortable,false);assert.equal(r.why,'formular');
    await ev(()=>closeModal());await p.waitForTimeout(280);
  });

  await step('përjashtimet e synuara + lejimi i regjistrave Excel (opt-in/opt-out)',async()=>{
    const r=await ev(()=>{
      const mk=(html,wrap)=>{const d=document.createElement('div');if(wrap)d.className=wrap;d.innerHTML=html;
        document.body.appendChild(d);window.__biobesTableSortV1.enhance(d);const t=d.querySelector('table');
        const o={why:window.__biobesTableSortV1.isSortable(t),sortable:t.classList.contains('bb-sortable'),
                 heads:t.querySelectorAll('th.bb-sort').length};d.remove();return o};
      const head='<thead><tr><th>Data</th><th>Emri</th></tr></thead>';
      const body='<tbody><tr><td>2026-01-02</td><td>B</td></tr><tr><td>2026-01-01</td><td>A</td></tr></tbody>';
      const grid=cls=>'<table'+cls+'>'+head+'<tbody><tr><td><input value="2026-01-02"></td><td><input value="B"></td></tr>'+
                     '<tr><td><input value="2026-01-01"></td><td><input value="A"></td></tr></tbody></table>';
      return {
        sdr:mk('<table class="sdr-table">'+head+body+'</table>'),
        onclick:mk('<table>'+head.replace('<th>Data</th>','<th onclick="void 0">Data</th>')+body+'</table>').why,
        alpha:mk('<table class="alpha-card-table">'+head+body+'</table>','alpha-paper'),
        docSheet:mk('<table>'+head+body+'</table>','doc-sheet').why,
        printId:mk('<div id="printTest"><table>'+head+body+'</table></div>').why,
        form:mk('<table>'+head+'<tbody><tr><td><input value="1"></td><td>B</td></tr><tr><td><input value="2"></td><td>A</td></tr></tbody></table>').why,
        registry:mk(grid(' class="excel-registry"')),
        sales:mk(grid(' class="sales-excel"')),
        optin:mk(grid(' data-sortable="1"')),
        optout:mk('<table data-no-sort="1">'+head+body+'</table>').why,
        merged:mk('<table><thead><tr><th colspan="2">Grup</th></tr><tr><th>Data</th><th>Emri</th></tr></thead>'+body+'</table>').why,
        oneRow:mk('<table>'+head+'<tbody><tr><td>2026-01-01</td><td>A</td></tr></tbody></table>').why,
        empty:mk('<table>'+head+'<tbody><tr><td colspan="2" class="empty">Nuk ka regjistrime</td></tr></tbody></table>').why
      };
    });
    assert.equal(r.sdr.sortable,false,'.sdr-table u bë e renditshme');
    assert.equal(r.onclick,'onclick-ekzistues');
    assert.equal(r.alpha.sortable,false,'raporti Alpha u bë i renditshëm');
    assert.equal(r.docSheet,'dokument-print');
    assert.equal(r.printId,'dokument-print');
    assert.equal(r.form,'formular');
    assert.equal(r.registry.sortable,true,'regjistri i eksporteve duhet të renditet');
    assert.equal(r.registry.heads,2);
    assert.equal(r.sales.sortable,true,'regjistri i shitjeve duhet të renditet');
    assert.equal(r.optin.sortable,true,'data-sortable duhet ta lejojë');
    assert.equal(r.optout,'data-no-sort');
    assert.equal(r.merged,'koke-e-bashkuar');
    assert.equal(r.oneRow,'rreshta');
    assert.equal(r.empty,'rreshta');
  });

  await step('regjistri Excel i eksporteve: vlerat e input-eve lexohen dhe renditen',async()=>{
    const r=await ev(()=>{
      const d=document.createElement('div');
      d.innerHTML='<table class="excel-registry" id="bbReg"><thead><tr><th>Nr.</th><th>Data</th><th>Neto kg</th></tr></thead><tbody>'+
        '<tr><td>1</td><td><input value="2026-03-01"></td><td><input value="900"></td></tr>'+
        '<tr><td>2</td><td><input value="2026-01-15"></td><td><input value="1 250,5"></td></tr>'+
        '<tr><td>3</td><td><input value="2025-12-31"></td><td><input value="45"></td></tr></tbody></table>';
      document.body.appendChild(d);
      window.__biobesTableSortV1.enhance(d);
      const t=d.querySelector('#bbReg'),rows=()=>[...t.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.querySelector('input')?c.querySelector('input').value:c.textContent).join('|'));
      window.sortTableColumn('#bbReg','Data','asc');const byDate=rows();
      window.sortTableColumn('#bbReg','Neto kg','desc');const byNet=rows();
      const nr=byNet.map(x=>x.split('|')[0]);
      window.__biobesTableSortV1.restore(t);const back=rows();
      d.remove();return {byDate,byNet,nr,back};
    });
    assert.deepEqual(r.byDate,['1|2025-12-31|45','2|2026-01-15|1 250,5','3|2026-03-01|900'],'datat e input-eve nuk u renditën');
    assert.deepEqual(r.byNet,['1|2026-01-15|1 250,5','2|2026-03-01|900','3|2025-12-31|45'],'numrat e input-eve nuk u renditën');
    assert.deepEqual(r.nr,['1','2','3'],'kolona Nr. nuk u rinumërua');
    assert.deepEqual(r.back,['1|2026-03-01|900','2|2026-01-15|1 250,5','3|2025-12-31|45'],'rendi/numërimi origjinal nuk u kthye');
  });

  await step('rreshtat TOTALI qëndrojnë poshtë, boshllëket në fund, negativet me kllapa',async()=>{
    const r=await ev(()=>{
      const d=document.createElement('div');
      d.innerHTML='<table id="bbTest"><thead><tr><th>Nr.</th><th>Emri</th><th>Sasia</th></tr></thead><tbody>'+
        '<tr><td>1</td><td>Beta</td><td>10 kg</td></tr>'+
        '<tr><td>2</td><td></td><td>2 kg</td></tr>'+
        '<tr><td>3</td><td>Alfa</td><td>1 234,5 kg</td></tr>'+
        '<tr><td>4</td><td>Delta 9</td><td>(100 kg)</td></tr>'+
        '<tr class="total-row"><td>Totali</td><td></td><td>1 146,5 kg</td></tr></tbody></table>';
      document.body.appendChild(d);
      window.__biobesTableSortV1.enhance(d);
      const t=d.querySelector('#bbTest'),rows=()=>[...t.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim()).join('|'));
      window.sortTableColumn('#bbTest','Emri','asc');const byName=rows();
      window.sortTableColumn('#bbTest','Sasia','desc');const byQtyDesc=rows();
      window.sortTableColumn('#bbTest','Sasia','asc');const byQtyAsc=rows();
      window.__biobesTableSortV1.restore(t);const back=rows();
      d.remove();return {byName,byQtyDesc,byQtyAsc,back};
    });
    assert.deepEqual(r.byName,['1|Alfa|1 234,5 kg','2|Beta|10 kg','3|Delta 9|(100 kg)','4||2 kg','Totali||1 146,5 kg'],
      'boshllëku dhe TOTALI nuk qëndruan në fund');
    assert.deepEqual(r.byQtyDesc,['1|Alfa|1 234,5 kg','2|Beta|10 kg','3||2 kg','4|Delta 9|(100 kg)','Totali||1 146,5 kg'],
      'negativi me kllapa (100) nuk shkoi i fundit në zbritës');
    assert.deepEqual(r.byQtyAsc,['1|Delta 9|(100 kg)','2||2 kg','3|Beta|10 kg','4|Alfa|1 234,5 kg','Totali||1 146,5 kg'],
      'renditja rritëse numerike është e gabuar');
    assert.deepEqual(r.back,['1|Beta|10 kg','2||2 kg','3|Alfa|1 234,5 kg','4|Delta 9|(100 kg)','Totali||1 146,5 kg'],
      'rendi dhe numërimi origjinal nuk u kthyen');
  });

  await step('rendi i alfabetit shqip: ç/ë si shkronja të veçanta + digrafët (dh, gj, ll, nj, rr, sh, th, xh, zh)',async()=>{
    const names=['Çaj mali','Ciani','Dëllinjë','Dafinë','Dhjetë','Ëndërr','Engjëll','Gjysh','Gjethe','Llak','Lule',
      'Njesh','Nënë','Rrëshen','Rrjet','Shqiponjë','Sqep','Thellë','Tavë','Xham','Xhaketë','Zhurmë','Zjarr','Anason','Boronicë'];
    const pritet=['Anason','Boronicë','Ciani','Çaj mali','Dafinë','Dëllinjë','Dhjetë','Engjëll','Ëndërr','Gjethe','Gjysh',
      'Lule','Llak','Nënë','Njesh','Rrëshen','Rrjet','Sqep','Shqiponjë','Tavë','Thellë','Xhaketë','Xham','Zjarr','Zhurmë'];
    const r=await ev(n=>{
      const d=document.createElement('div');
      d.innerHTML='<table id="bbSq"><thead><tr><th>Emri</th><th>Kodi</th></tr></thead><tbody>'+
        n.map((x,i)=>'<tr><td>'+x+'</td><td>K'+i+'</td></tr>').join('')+'</tbody></table>';
      document.body.appendChild(d);window.__biobesTableSortV1.enhance(d);
      const t=d.querySelector('#bbSq'),col=()=>[...t.querySelectorAll('tbody tr')].map(r=>r.cells[0].textContent);
      window.sortTableColumn('#bbSq','Emri','asc');const asc=col();
      window.sortTableColumn('#bbSq','Emri','desc');const desc=col();
      d.remove();
      return {asc,desc,native:window.__biobesTableSortV1.nativeCollation};
    },names);
    assert.deepEqual(r.asc,pritet,'rendi shqip nuk u respektua (kollacion amtar: '+r.native+')');
    assert.deepEqual(r.desc,[...pritet].reverse(),'zbritësi nuk është e kundërta e rritësit');
    console.log('       kollacioni amtar shqip në këtë browser: '+r.native);
  });

  await step('renditja sipas kolonës "Nr." nuk e rinumëron atë',async()=>{
    const r=await ev(()=>{
      const d=document.createElement('div');
      d.innerHTML='<table id="bbNr"><thead><tr><th>Nr.</th><th>Emri</th></tr></thead><tbody>'+
        '<tr><td>1</td><td>Beta</td></tr><tr><td>2</td><td>Alfa</td></tr></tbody></table>';
      document.body.appendChild(d);window.__biobesTableSortV1.enhance(d);
      const t=d.querySelector('#bbNr');
      window.sortTableColumn('#bbNr','Nr.','desc');
      const out=[...t.querySelectorAll('tbody tr')].map(r=>[...r.cells].map(c=>c.textContent).join('|'));
      d.remove();return out;
    });
    assert.deepEqual(r,['2|Alfa','1|Beta'],'numërimi u prish kur u rendit vetë kolona Nr.');
  });

  /* ---------- MBIJETESA PAS RI-RENDERIMIT ---------- */
  await ev(x=>window.go(x),'weighings');await p.waitForTimeout(380);
  await step('renditja mbijeton pas render() dhe pas ndërrimit të modulit',async()=>{
    await ev(()=>window.sortTableColumn('#main table','Furnitori','asc'));await p.waitForTimeout(200);
    const a=await ev(()=>window.__A.col(document.querySelector('#main table'),2));
    await ev(()=>render());await p.waitForTimeout(460);
    assert.deepEqual(await ev(()=>window.__A.col(document.querySelector('#main table'),2)),a,'humbi pas render()');
    await ev(()=>window.go('lots'));await p.waitForTimeout(330);
    await ev(()=>window.go('weighings'));await p.waitForTimeout(460);
    assert.deepEqual(await ev(()=>window.__A.col(document.querySelector('#main table'),2)),a,'humbi pas ndërrimit të modulit');
    assert.ok(await ev(()=>window.tableSortReport().remembered.length>0),'gjendja nuk u ruajt në STORE');
  });

  await step('kërkimi live + renditja: rreshtat e dukshëm mbeten të renditur',async()=>{
    await ev(()=>window.go('products'));await p.waitForTimeout(380);
    await ev(()=>window.sortTableColumn('#main table','Artikulli','asc'));await p.waitForTimeout(220);
    const box=p.locator('#main .toolbar input').first();
    if(await box.count()){
      await box.fill('a');await p.waitForTimeout(360);
      const vis=await ev(()=>{const t=document.querySelector('#main table');const i=window.__A.heads(t).indexOf('Artikulli');
        return [...t.tBodies[0].rows].filter(r=>r.style.display!=='none'&&r.cells.length>1).map(r=>window.__A.cell(r,i))});
      assert.ok(vis.length>0,'filtri nuk la asnjë rresht');
      assert.deepEqual(vis,await ev(a=>window.__A.sortText(a,'asc'),vis),'rreshtat e dukshëm nuk janë të renditur');
      await box.fill('');await p.waitForTimeout(300);
    }
    await ev(()=>window.__biobesTableSortV1.resetAll());
  });

  await step('tastiera: Enter/Space mbi kokë e rendit tabelën (aria-sort ndryshon)',async()=>{
    await ev(()=>window.go('suppliers'));await p.waitForTimeout(380);
    const h=p.locator('#main table thead th').filter({hasText:'Emri'}).first();
    await h.focus();await p.keyboard.press('Enter');await p.waitForTimeout(240);
    assert.equal(await h.getAttribute('aria-sort'),'ascending');
    await p.keyboard.press('Space');await p.waitForTimeout(240);
    assert.equal(await h.getAttribute('aria-sort'),'descending');
    const s=await ev(()=>window.__A.col(document.querySelector('#main table'),1));
    assert.deepEqual(s,await ev(a=>window.__A.sortText(a,'desc'),s),'zbritësi nga tastiera është i gabuar');
    await p.keyboard.press('Enter');await p.waitForTimeout(240);
    assert.equal(await h.getAttribute('aria-sort'),'none','aktivizimi i tretë duhet të kthejë rendin origjinal');
    await ev(()=>window.__biobesTableSortV1.resetAll());
  });

  await step('modal-et: tabela e listës brenda modalit renditet dhe kthehet (modal + tableCard)',async()=>{
    await ev(()=>{
      window.modal('Provë renditjeje',window.tableCard(['Kodi','Data','Sasia'],[
        ['B-3','2026-03-01','900 kg'],['A-10','2026-01-15','1 250,5 kg'],['A-2','2025-12-31','45 kg']]),'');
    });
    await p.waitForTimeout(420);
    const info=await ev(()=>{const t=document.querySelector('#modalBody table');
      return {sortable:t.classList.contains('bb-sortable'),heads:window.__A.sortHeads(t).length,n:window.__A.dataCount(t)}});
    assert.equal(info.n,3);assert.equal(info.sortable,true,'tabela e modalit nuk u bë e renditshme');
    assert.equal(info.heads,3,'kokat e modalit nuk u bënë të klikueshme');
    const c=p.locator('#modalBody table thead th').filter({hasText:'Data'}).first();
    await c.click();await p.waitForTimeout(220);
    assert.deepEqual(await ev(()=>window.__A.col(document.querySelector('#modalBody table'),1)),
      ['2025-12-31','2026-01-15','2026-03-01'],'datat në modal nuk u renditën rritës');
    await c.click();await p.waitForTimeout(220);
    assert.deepEqual(await ev(()=>window.__A.col(document.querySelector('#modalBody table'),1)),
      ['2026-03-01','2026-01-15','2025-12-31'],'datat në modal nuk u renditën zbritës');
    await p.locator('#modalBody table thead th').filter({hasText:'Sasia'}).first().click();await p.waitForTimeout(220);
    assert.deepEqual(await ev(()=>window.__A.col(document.querySelector('#modalBody table'),2)),
      ['45 kg','900 kg','1 250,5 kg'],'sasitë në modal nuk u renditën numerikisht');
    await ev(()=>closeModal());await p.waitForTimeout(300);
  });

  await step('kartelat e dokumenteve (porosi/peshim) mbeten të paprekura — janë për print',async()=>{
    const id=await ev(()=>state.orders.length?state.orders[0].id:null);
    if(!id){console.log('       (nuk ka porosi — u anashkalua)');return}
    await ev(x=>window.orderCard(x),id);await p.waitForTimeout(500);
    const info=await ev(()=>{const t=[...document.querySelectorAll('#modalBody table')];
      return {n:t.length,sortable:t.filter(x=>x.classList.contains('bb-sortable')).length,
              withRows:t.filter(x=>window.__A.dataCount(x)>=2).length,
              why:t.map(x=>window.__biobesTableSortV1.isSortable(x))}});
    for(const w of info.why)assert.ok(w===''||INTENTIONAL.includes(w),'arsye e papritur në kartelë: '+w);
    if(info.sortable===0)console.log('       kartela e porosisë është dokument print-i → e përjashtuar me qëllim ('+info.why.join(',')+')');
    await ev(()=>closeModal());await p.waitForTimeout(300);
  });

  await step('diagnostika: 0 gabime të brendshme, statistika të mbushura, 0 gabime konzole',async()=>{
    const r=await ev(()=>window.tableSortReport());
    assert.equal(r.stats.errors,0,'gabime të brendshme: '+JSON.stringify(r.stats));
    assert.ok(r.stats.sorts>=15,'vetëm '+r.stats.sorts+' renditje');
    assert.ok(r.stats.restores>=5,'vetëm '+r.stats.restores+' kthime');
    assert.ok(r.stats.headers>=20,'vetëm '+r.stats.headers+' koka të klikueshme');
    assert.ok(r.stats.clicks>0,'asnjë klikim i regjistruar');
    assert.ok(r.stats.reapplied>0,'renditja nuk u ripërtëri pas ri-renderimit');
    console.log('       '+JSON.stringify(r.stats));
    assert.deepEqual(errors,[],'gabime konzole: '+errors.slice(0,2).join(' | '));
  });

  await browser.close();
 }
 console.log('\n'+passed+' kaluan, '+failed+' dështuan');
 process.exitCode=failed?1:0;
})().catch(e=>{console.error('AUDIT CRASH:',e);process.exit(1)});
