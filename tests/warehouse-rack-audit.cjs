/* ==========================================================================
   tests/warehouse-rack-audit.cjs — 12 prova të magazinës/raftit
   --------------------------------------------------------------------------
   Skenari i riprodhuar nga terreni: peshim i konfirmuar në MG (Magazina Gur),
   8 thasë / 216 kg neto, magazinë pa asnjë raft në state.racks -> loti merrte
   rack:'' dhe faqja Magazina shfaqte filtrin + butonat, por #rackGrid bosh.

   Prova kalon nëpër UI-n reale (desktop 1440x1000 dhe telefon 390x844 me touch).
   NUK krijohet dhe NUK preket dokumenti real i prodhimit PS-2026-002: çdo
   peshim prove merr ID-në e vet të gjeneruar dhe ekziston një guard që dështon
   nëse ID-ja reale shfaqet ndonjëherë në profilin e testit.

   Izolimi: helpers.cjs kalon një profil të përkohshëm Chromium dhe intercepton
   çdo kërkesë HTTPS -> asnjë kontakt me API-n ose të dhënat e prodhimit.
   Rezultatet: .audit/warehouse-{desktop,mobile}.json (jashtë Git).
   ========================================================================== */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
fs.mkdirSync('.audit',{recursive:true});

/* Dokumenti real i përdoruesit — nuk duhet të ekzistojë kurrë në profilin e testit. */
const PRODUCTION_WEIGHING_ID='PS-2026-002';

(async()=>{
 let totalPass=0,totalSteps=0;
 for(const mobile of [false,true]){
  const{browser,page:p,errors,close,choose}=await open(mobile);
  const results=[];const tag=mobile?'mobile':'desktop';
  const b=name=>p.locator('#modal').getByRole('button',{name,exact:true});

  async function step(name,fn){
   try{
    await close();await fn();await p.waitForTimeout(220);
    /* Guard i prodhimit: asnjë provë nuk guxon të prekë/krijojë ID-në reale. */
    const leaked=await p.evaluate(id=>(state.weighings||[]).some(w=>w&&w.id===id),PRODUCTION_WEIGHING_ID);
    assert.equal(leaked,false,'NDALUAR: ID-ja reale '+PRODUCTION_WEIGHING_ID+' u prek në profilin e testit');
    assert.deepEqual(errors,[]);
    results.push({name,status:'PASS'});totalPass++;totalSteps++;
    console.log('PASS',tag,name);
   }catch(e){
    results.push({name,status:'FAIL',error:e.stack,console:errors});totalSteps++;
    console.error('FAIL',tag,name,'\n',e.message);
    try{console.log('TOAST',await p.locator('#toast').innerText())}catch(_){}
    throw e;
   }
  }
  /* Numëruesit e regjistrave të biznesit — baza e çdo prove anti-dublikatë. */
  const counters=()=>p.evaluate(()=>({
   lots:(state.lots||[]).length,
   racks:(state.racks||[]).length,
   moves:(typeof stockMoves==='function'?stockMoves().length:-1),
   invoices:(typeof purchaseInvoices==='function'?purchaseInvoices().length:-1),
   weighings:(state.weighings||[]).length
  }));
  /* Raftet që përdoruesi i sheh vërtet: edhe sipas dataset-warehouse, edhe sipas
     dukshmërisë reale në DOM (filtri i fsheh me style.display). */
  const visibleRacks=async wh=>p.evaluate(id=>{
   const cards=[].slice.call(document.querySelectorAll('#rackGrid .rack'));
   const shown=cards.filter(e=>e.style.display!=='none'&&e.getClientRects().length>0);
   const vis=id?shown.filter(e=>e.dataset.warehouse===id):shown;
   return {total:cards.length,shown:shown.length,visible:vis.length,
           texts:vis.map(e=>e.innerText.replace(/\s*\n+\s*/g,' | '))};
  },wh||'');
  /* Filtri i faqes Magazina nëpër UI-n reale: çdo <select> globalizohet në një
     kërkim live (input + .global-live-option) dhe <select>-i nativ fshehet me
     display:none, ndaj nuk përdoret selectOption(). Zgjedhja e opsionit vendos
     vlerën dhe shpërndan 'change' -> onchange="filterRacksV2(this.value)". */
  const filterWarehouse=async wh=>{
   const want=wh||'';
   const wrap=p.locator('#main .toolbar .global-live-search').first();
   await wrap.waitFor({state:'visible'});
   const inp=wrap.locator('input[type="search"]').first();
   await inp.click();await p.waitForTimeout(150);
   const label=await p.evaluate(id=>{
    const s=document.querySelector('#main .toolbar select');
    const o=[].slice.call(s.options).find(x=>x.value===id);return o?o.textContent.trim():'';
   },want);
   await inp.fill(label);await p.waitForTimeout(200);
   const opt=wrap.locator('.global-live-option[data-value="'+want+'"]').first();
   if(await opt.count())await opt.click();else await inp.press('Enter');
   await p.waitForTimeout(250);
   assert.equal(await p.evaluate(()=>document.querySelector('#main .toolbar select').value),want,
    'filtri i magazinës duhet të ketë vlerën '+ (want||'(të gjitha)'));
  };

  try{
   let weighId,lotId,rackId;
   const seedCounters=await counters();

   /* 1 — Parakushti: MG (W2) nuk ka asnjë raft; grid-i i filtruar është bosh. */
   await step('MG (W2) nuk ka rafte në seed dhe grid-i i filtruar është bosh',async()=>{
    const w=await p.evaluate(()=>({
     mg:(state.warehouses||[]).find(x=>x.id==='W2'),
     racksW2:(state.racks||[]).filter(r=>r.warehouse==='W2').length,
     racksTotal:(state.racks||[]).length
    }));
    assert.equal(w.mg&&w.mg.code,'MG');assert.equal(w.mg&&w.mg.name,'Magazina Gur');
    assert.equal(w.racksW2,0,'pritej që MG të mos kishte rafte në gjendjen fillestare');
    await p.evaluate(()=>go('warehouse'));await p.waitForTimeout(300);
    assert.equal(await p.locator('#rackGrid').count(),1,'#rackGrid duhet të ekzistojë');
    await filterWarehouse('W2');
    const g=await visibleRacks('W2');
    assert.equal(g.visible,0,'filtri MG nuk duhet të shfaqë asnjë raft përpara provës');
    /* Filtri dhe butonat ekzistojnë — pikërisht simptoma e raportuar. */
    assert.equal(await p.locator('#main').getByRole('button',{name:'+ Raft',exact:true}).count(),1);
    assert.equal(await p.locator('#main').getByRole('button',{name:'↔ Transfero lot',exact:true}).count(),1);
   });

   /* 2 — Peshim i ri 8 thasë / 216 kg neto në MG -> lot me raft të vlefshëm. */
   await step('Peshim i ri 8 thasë / 216 kg neto në MG krijon lot me raft të vlefshëm',async()=>{
    await p.evaluate(()=>weighForm());await p.waitForTimeout(350);
    await choose('wWarehouse','W2');await choose('wSupplier','S3');await choose('wProduct','P105');
    /* 2 rreshta x (4 thasë, 120 bruto, 12 ambalazh) => 8 thasë, 240 bruto, 24 ambalazh, 216 neto */
    await p.evaluate(()=>{
     document.getElementById('weighRows').innerHTML='';
     addWeighRow({bags:4,gross:120,tare:12});addWeighRow({bags:4,gross:120,tare:12});calcWRows();
    });
    await p.waitForTimeout(200);
    const totals=(await p.locator('.totals').innerText()).replace(/\s*\n+\s*/g,' ');
    assert.match(totals,/8/);assert.match(totals,/240/);assert.match(totals,/216/);
    await b('Konfirmo & krijo lot').click();await p.waitForTimeout(500);
    const r=await p.evaluate(()=>{
     const w=state.weighings.at(-1),l=state.lots.at(-1);
     return {wid:w.id,bags:w.bags,gross:w.gross,tare:w.tare,net:w.net,status:w.status,wh:w.weighingWarehouse,
             lid:l.id,code:l.code,lnet:l.net,lbags:l.bags,lwh:l.warehouse,rack:l.rack,
             rackObj:(state.racks||[]).find(x=>x.id===l.rack)||null};
    });
    assert.notEqual(r.wid,PRODUCTION_WEIGHING_ID);
    assert.equal(r.bags,8);assert.equal(r.gross,240);assert.equal(r.tare,24);assert.equal(r.net,216);
    assert.equal(r.status,'Konfirmuar');assert.equal(r.wh,'W2');
    assert.ok(r.rack,'lot.rack nuk duhet të jetë bosh');
    assert.ok(r.rackObj,'rafti duhet të ekzistojë në state.racks');
    assert.equal(r.rackObj.warehouse,'W2','rafti duhet t\'i përkasë MG');
    assert.equal(r.rackObj.name,'Rafti kryesor');
    assert.equal(r.lnet,216);assert.equal(r.lbags,8);assert.equal(r.lwh,'W2');
    weighId=r.wid;lotId=r.lid;rackId=r.rack;
   });

   /* 3 — Faqja Magazina shfaq raftin "R1 — Rafti kryesor" me 216 kg. */
   await step('Faqja Magazina shfaq raftin R1 — Rafti kryesor me lotin 216 kg',async()=>{
    await p.evaluate(()=>go('warehouse'));await p.waitForTimeout(350);
    await filterWarehouse('W2');
    const g=await visibleRacks('W2');
    assert.equal(g.visible,1,'MG duhet të shfaqë saktësisht një raft');
    assert.match(g.texts[0],/R1 — Rafti kryesor/);
    assert.match(g.texts[0],/Magazina Gur/);
    assert.match(g.texts[0],/1 lote/);
    assert.match(g.texts[0],/216/);
    assert.equal(await p.locator('#rackEmptyNote').isVisible(),false);
   });

   /* 4 — Kartela e raftit: 8 thasë, 240 bruto, 24 ambalazh, 216 neto. */
   await step('Kartela e raftit tregon lotin me 8 thasë dhe 216 kg neto',async()=>{
    await p.evaluate(id=>rackCard(id),rackId);await p.waitForTimeout(350);
    const t=await p.locator('#modal').innerText();
    assert.match(t,/R1 — Rafti kryesor/);
    assert.match(t,/Magazina Gur/);
    assert.match(t,/216/);
    assert.match(t,/240/);
    const rows=await p.evaluate(id=>(state.lots||[]).filter(l=>l.rack===id).map(l=>({id:l.id,code:l.code,net:l.net,bags:l.bags})),rackId);
    assert.equal(rows.length,1);assert.equal(rows[0].id,lotId);
    assert.equal(rows[0].net,216);assert.equal(rows[0].bags,8);
   });

   /* 5 — Draft-fatura e blerjes krijohet saktë, një herë. */
   await step('Draft-fatura e blerjes krijohet një herë me physical 216 kg',async()=>{
    await close();
    const f=await p.evaluate(id=>({
     all:purchaseInvoices().filter(x=>x.weighing===id).map(x=>({id:x.id,status:x.status,physical:x.physical,supplier:x.supplier,product:x.product})),
     total:purchaseInvoices().length
    }),weighId);
    assert.equal(f.all.length,1,'duhet të ekzistojë saktësisht një FB për këtë peshim');
    assert.equal(f.all[0].status,'Draft');
    assert.equal(f.all[0].physical,216);
    assert.equal(f.all[0].supplier,'S3');assert.equal(f.all[0].product,'P105');
    assert.equal(f.total,seedCounters.invoices+1);
   });

   /* 6 — Loti ekzistues pa raft lidhet, pa ndryshuar sasitë/ID-të. */
   await step('Loti ekzistues pa raft lidhet pa ndryshuar sasitë ose ID-të',async()=>{
    const before=await counters();
    const fixture=await p.evaluate(()=>{
     state.lots.push({id:'AUDIT-NORACK-1',code:'AUDIT-NORACK-1',supplier:'S3',product:'P105',
      warehouse:'W2',rack:'',net:55.5,gross:60,tare:4.5,bags:2,originalNet:55.5,availableNet:55.5,
      status:'Në magazinim',date:'2026-09-10'});
     save();return JSON.parse(JSON.stringify(state.lots.at(-1)));
    });
    const rep=await p.evaluate(()=>repairWarehouseLotRacks({noSave:true,noEvent:true}));
    assert.equal(rep.changed,true);
    assert.equal(rep.repaired.length,1);
    assert.equal(rep.repaired[0].lot,'AUDIT-NORACK-1');
    assert.equal(rep.repaired[0].rack,rackId,'duhet të ripërdorë raftin ekzistues të MG, jo të krijojë një të ri');
    assert.equal(rep.racksCreated.length,0,'asnjë raft i ri nuk duhet të krijohet');
    assert.equal(rep.guards.clean,true,'regjistrat e biznesit nuk duhet të lëvizin');
    const afterLot=await p.evaluate(()=>JSON.parse(JSON.stringify(state.lots.find(l=>l.id==='AUDIT-NORACK-1'))));
    /* Vetëm rack ndryshon. */
    assert.equal(afterLot.id,fixture.id);assert.equal(afterLot.code,fixture.code);
    assert.equal(afterLot.net,55.5);assert.equal(afterLot.gross,60);assert.equal(afterLot.tare,4.5);
    assert.equal(afterLot.bags,2);assert.equal(afterLot.availableNet,55.5);assert.equal(afterLot.originalNet,55.5);
    assert.equal(afterLot.warehouse,'W2');assert.equal(afterLot.status,'Në magazinim');
    assert.equal(afterLot.rack,rackId);
    const after=await counters();
    assert.deepEqual({lots:after.lots,moves:after.moves,invoices:after.invoices,weighings:after.weighings},
                     {lots:before.lots+1,moves:before.moves,invoices:before.invoices,weighings:before.weighings},
                     'asnjë lot, lëvizje ose faturë e re përveç fixture-it');
    assert.equal(after.racks,before.racks,'numri i rafteve nuk duhet të rritet');
   });

   /* 7 — Rakordimi është idempotent (pa dublikime në ekzekutimin e dytë). */
   await step('repairWarehouseLotRacks është idempotent dhe nuk dublon asgjë',async()=>{
    const before=await counters();
    const r1=await p.evaluate(()=>repairWarehouseLotRacks({noSave:true,noEvent:true}));
    const r2=await p.evaluate(()=>repairWarehouseLotRacks({noSave:true,noEvent:true}));
    assert.equal(r1.changed,false,'ekzekutimi i dytë nuk duhet të gjejë lote pa raft');
    assert.equal(r2.changed,false);
    assert.deepEqual(r1.repaired,[]);assert.deepEqual(r2.repaired,[]);
    assert.deepEqual(r1.racksCreated,[]);assert.deepEqual(r2.racksCreated,[]);
    const after=await counters();
    assert.deepEqual(after,before,'asnjë ndryshim në lote, rafte, lëvizje, fatura ose peshime');
    /* Hapja e përsëritur e faqes Magazina nuk shton të dhëna. */
    await p.evaluate(()=>go('warehouse'));await p.waitForTimeout(300);
    await p.evaluate(()=>go('warehouse'));await p.waitForTimeout(300);
    assert.deepEqual(await counters(),before);
   });

   /* 8 — Reload: gjendja ruhet dhe lotët mbeten të lidhur me raftin. */
   await step('Pas reload gjendja ruhet dhe lotët mbeten të lidhur me raftin',async()=>{
    await p.evaluate(()=>save());await p.waitForTimeout(600);
    await p.reload({waitUntil:'load'});
    await p.waitForFunction(()=>typeof state!=='undefined'&&state?.users?.length);
    await p.waitForTimeout(1200);
    /* Rakordimi nuk duhet të jetë i nevojshëm: të dhënat janë ruajtur të lidhura. */
    const st=await p.evaluate(()=>({
     lot:state.lots.find(l=>l.id==='AUDIT-NORACK-1'),
     main:state.lots.find(l=>l.weighing&&l.rack&&state.weighings.some(w=>w.id===l.weighing&&w.net===216)),
     racks:(state.racks||[]).filter(r=>r.warehouse==='W2').map(r=>({id:r.id,code:r.code,name:r.name})),
     rep:repairWarehouseLotRacks({noSave:true,noEvent:true})
    }));
    assert.ok(st.lot,'loti fixture duhet të jetë ruajtur');
    assert.equal(st.lot.rack,rackId);assert.equal(st.lot.net,55.5);
    assert.ok(st.main,'loti 216 kg duhet të jetë ruajtur');
    assert.equal(st.main.net,216);assert.equal(st.main.bags,8);
    assert.equal(st.racks.length,1,'MG duhet të ketë saktësisht një raft, jo dublikatë');
    assert.equal(st.racks[0].code,'R1');assert.equal(st.racks[0].name,'Rafti kryesor');
    assert.equal(st.rep.changed,false,'pas reload nuk ka më lote pa raft');
   });

   /* 9 — Konfirmimi i përsëritur nuk dublon stokun ose faturën. */
   await step('Konfirmimi i përsëritur i të njëjtit peshim nuk dublon stokun ose faturën',async()=>{
    const before=await counters();
    const movesBefore=await p.evaluate(id=>stockMoves().filter(m=>m.key==='WEIGH:'+id).length,weighId);
    assert.equal(movesBefore,1,'duhet të ekzistojë saktësisht një lëvizje hyrëse');
    /* Konfirmim i përsëritur nëpër core. */
    const again=await p.evaluate(id=>{
     const r=coreConfirmWeighing(id,{id:'SHOULD-NOT-EXIST',code:'X',supplier:'S3',product:'P105',warehouse:'W2',rack:'',unitCost:0});
     return {ok:r.ok,error:r.error,lotId:r.record&&r.record.id};
    },weighId);
    assert.equal(again.ok,true);
    assert.equal(again.lotId,lotId,'duhet të kthejë lotin ekzistues, jo një të ri');
    /* Konfirmim i përsëritur nëpër UI-n e peshimit. */
    const toastText=await p.evaluate(id=>{confirmExistingWeight(id);
     return (document.getElementById('toast')||{}).innerText||''},weighId);
    assert.match(toastText,/konfirmuar më parë/i);
    /* Sinkronizim i përsëritur i draft-faturave. */
    await p.evaluate(()=>{syncPurchaseDrafts();syncPurchaseDrafts();syncPurchaseDrafts()});
    await p.waitForTimeout(250);
    const after=await counters();
    assert.deepEqual(after,before,'asnjë dublikatë në lote, rafte, lëvizje, fatura ose peshime');
    assert.equal(await p.evaluate(id=>stockMoves().filter(m=>m.key==='WEIGH:'+id).length,weighId),1);
    assert.equal(await p.evaluate(id=>purchaseInvoices().filter(f=>f.weighing===id).length,weighId),1);
    assert.equal(await p.evaluate(id=>state.lots.filter(l=>l.weighing===id).length,weighId),1);
    assert.equal(await p.evaluate(id=>by('lots',id).net,lotId),216,'sasia nuk duhet të dyfishohet');
   });

   /* 10 — ensureWarehouseRack ripërdor raftin ekzistues dhe nuk dublon. */
   await step('ensureWarehouseRack ripërdor raftin ekzistues dhe nuk dublon',async()=>{
    const before=await counters();
    const r=await p.evaluate(()=>{
     const a=ensureWarehouseRack('W2'),b=ensureWarehouseRack('W2'),c=ensureWarehouseRack('W2');
     /* Magazina tjetër pa rafte (MB) merr raftin e vet kryesor. */
     const d=ensureWarehouseRack('W3'),e=ensureWarehouseRack('W3');
     /* Idr për një raft të caktuar duhet të nderohet. */
     const f=ensureWarehouseRack('W2',{preferRackId:d.rack.id});
     return {a:{id:a.rack.id,created:a.created},b:{id:b.rack.id,created:b.created},c:{id:c.rack.id,created:c.created},
             d:{id:d.rack.id,code:d.rack.code,name:d.rack.name,created:d.created},
             e:{id:e.rack.id,created:e.created},f:{id:f.rack.id,created:f.created},
             w2:(state.racks||[]).filter(x=>x.warehouse==='W2').length,
             w3:(state.racks||[]).filter(x=>x.warehouse==='W3').length};
    });
    assert.equal(r.a.created,false);assert.equal(r.b.created,false);assert.equal(r.c.created,false);
    assert.equal(r.a.id,rackId);assert.equal(r.b.id,rackId);assert.equal(r.c.id,rackId);
    /* MG ishte magazina e parë pa rafte, ndaj kodi i lirë ishte "R1" (shih provën 3).
       MB është e dyta, dhe meqë by('racks',x) kërkon edhe sipas code, kodet duhet të
       jenë unikë në të gjithë regjistrin -> MB merr kodin tjetër të lirë, jo një
       dublikatë të "R1". Emri mbetet gjithmonë "Rafti kryesor". */
    assert.equal(r.d.created,true);assert.equal(r.d.name,'Rafti kryesor');
    assert.notEqual(r.d.code,'R1','kodi i MB nuk duhet të përplaset me atë të MG');
    assert.equal(r.e.created,false);assert.equal(r.e.id,r.d.id);
    assert.equal(r.f.id,r.d.id,'preferRackId duhet të nderohet');assert.equal(r.f.created,false);
    assert.equal(r.w2,1,'MG: një raft, pa dublikatë');
    assert.equal(r.w3,1,'MB: një raft, pa dublikatë');
    /* Invarianti kyç: asnjë code ose id i përsëritur në state.racks. */
    const uniq=await p.evaluate(()=>{
     const l=state.racks||[];
     return {n:l.length,ids:new Set(l.map(x=>x.id)).size,codes:new Set(l.map(x=>String(x.code).toLowerCase())).size};
    });
    assert.equal(uniq.ids,uniq.n,'ID-të e rafteve duhet të jenë unike');
    assert.equal(uniq.codes,uniq.n,'Kodet e rafteve duhet të jenë unike (by() kërkon edhe sipas code)');
    const after=await counters();
    assert.equal(after.racks,before.racks+1,'vetëm rafti i MB është i ri');
    assert.deepEqual({lots:after.lots,moves:after.moves,invoices:after.invoices},
                     {lots:before.lots,moves:before.moves,invoices:before.invoices},
                     'ensureWarehouseRack nuk duhet të prekë lote, lëvizje ose fatura');
    /* Pastro raftin e provës që të mos ndotë provat e mëvonshme. */
    await p.evaluate(()=>{state.racks=state.racks.filter(x=>x.warehouse!=='W3');save()});
   });

   /* 11 — Magazina e pavlefshme refuzohet me mesazh shpjegues. */
   await step('coreConfirmWeighing refuzon magazinën që nuk ekziston me mesazh',async()=>{
    const before=await counters();
    const r=await p.evaluate(()=>{
     state.weighings.push({id:'AUDIT-BADWH',date:'2026-09-13',supplier:'S3',product:'P105',
      weighingWarehouse:'W-NUK-EKZISTON',gross:100,tare:10,net:90,bags:3,status:'Draft',
      bagRows:[{bags:3,gross:100,tare:10}]});
     return coreConfirmWeighing('AUDIT-BADWH',{id:'AUDIT-BADWH-LOT',code:'X',supplier:'S3',
      product:'P105',warehouse:'W-NUK-EKZISTON',rack:'',unitCost:0});
    });
    assert.equal(r.ok,false);
    assert.match(r.error,/nuk ekziston/i);
    const after=await counters();
    assert.equal(after.lots,before.lots,'asnjë lot nuk duhet të krijohet për një magazinë të pavlefshme');
    assert.equal(after.moves,before.moves,'asnjë lëvizje stoku');
    /* atomicTransaction duhet ta kthejë mbrapsht edhe raftin e krijuar. */
    const tx=await p.evaluate(()=>{
     const racksBefore=state.racks.length;
     const r=atomicTransaction('Provë',()=>{
      ensureWarehouseRack('W2');
      return coreConfirmWeighing('AUDIT-BADWH',{id:'X2',code:'X2',supplier:'S3',product:'P105',
       warehouse:'W-NUK-EKZISTON',rack:'',unitCost:0});
     });
     return {ok:r.ok,error:r.error,racksDelta:state.racks.length-racksBefore};
    });
    assert.equal(tx.ok,false);assert.equal(tx.racksDelta,0,'rollback nuk duhet të lërë rafte jetimë');
    await p.evaluate(()=>{state.weighings=state.weighings.filter(w=>w.id!=='AUDIT-BADWH');save()});
   });

   /* 12 — Mesazhi shpjegues: grid bosh dhe magazinë e filtruar pa rafte. */
   await step('Mesazhi shpjegues kur nuk ka rafte dhe kur filtri nuk gjen asnjë',async()=>{
    const snapshot=await p.evaluate(()=>({lots:JSON.parse(JSON.stringify(state.lots)),racks:JSON.parse(JSON.stringify(state.racks))}));
    try{
     /* Rasti A: asnjë raft dhe asnjë lot -> grid-i bosh me mesazh shpjegues. */
     await p.evaluate(()=>{state.lots=[];state.racks=[];save();go('warehouse')});
     await p.waitForTimeout(350);
     assert.equal(await p.locator('#rackGrid .rack').count(),0);
     assert.ok(await p.locator('#rackGridEmpty').isVisible(),'mesazhi shpjegues duhet të shfaqet');
     const empty=await p.locator('#rackGridEmpty').innerText();
     assert.match(empty,/Asnjë raft/i);
     assert.match(empty,/R1 — Rafti kryesor/);
     /* Rasti B: një raft vetëm për MQ, lot vetëm në MQ -> filtri MB jep shënimin. */
     await p.evaluate(()=>{
      state.racks=[{id:'R1',warehouse:'W1',code:'R1',name:'Rafti kryesor'}];
      state.lots=[{id:'AUDIT-L1',code:'AUDIT-L1',supplier:'S3',product:'P105',warehouse:'W1',
       rack:'R1',net:10,gross:12,tare:2,bags:1,status:'Në magazinim',date:'2026-09-13'}];
      save();go('warehouse');
     });
     await p.waitForTimeout(350);
     await filterWarehouse('W1');
     assert.equal((await visibleRacks('W1')).visible,1);
     assert.equal(await p.locator('#rackEmptyNote').isVisible(),false);
     await filterWarehouse('W3');
     assert.equal((await visibleRacks('W3')).visible,0);
     assert.ok(await p.locator('#rackEmptyNote').isVisible(),'shënimi i filtrit duhet të shfaqet');
     assert.match(await p.locator('#rackEmptyNote').innerText(),/nuk ka rafte/i);
     await filterWarehouse('');
     assert.equal(await p.locator('#rackEmptyNote').isVisible(),false);
    }finally{
     await p.evaluate(s=>{state.lots=s.lots;state.racks=s.racks;save();go('warehouse')},snapshot);
     await p.waitForTimeout(300);
    }
    /* Gjendja e mëparshme rikthehet dhe faqja vazhdon të jetë e saktë. */
    await filterWarehouse('W2');
    const g=await visibleRacks('W2');
    assert.equal(g.visible,1);assert.match(g.texts[0],/R1 — Rafti kryesor/);
   });

   console.log('\n=== '+tag.toUpperCase()+': '+results.filter(r=>r.status==='PASS').length+'/'+results.length+' prova të magazinës PASS ===');
  }finally{
   fs.writeFileSync('.audit/warehouse-'+tag+'.json',JSON.stringify(results,null,2));
   await browser.close();
  }
 }
 console.log('\nTOTAL: '+totalPass+'/'+totalSteps+' prova të magazinës (desktop + telefon)');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
