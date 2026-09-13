/* ==========================================================================
   tests/qr-deeplink-audit.cjs — 10 prova x desktop/telefon per QR + deep-link
   --------------------------------------------------------------------------
   Provon bllokun `biobes-qr-deeplink-v1`: gjuha e perbashket e etiketates QR
   dhe e nyjes se thelle, hapja e karteles nga nje skanim, butoni **Pastro**
   (heq search+hash, mbyll modalen, kthen filtrimin e raftit), dhe dy mbrojtjet:
   asnje mutate te state (pa save) dhe asnje prekje te dokumentit real
   PS-2026-002. Nuk behet asnje kerce nga API e prodhimit (helpers.cjs i pret
   te gjitha kerketat HTTPS).
   ========================================================================== */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
fs.mkdirSync('.audit',{recursive:true});
const PRODUCTION_WEIGHING_ID='PS-2026-002';

(async()=>{
 let totalPass=0,totalSteps=0;
 for(const mobile of [false,true]){
  const tag=mobile?'mobile':'desktop';
  const {browser,page:p,close}=await open(mobile);
  const results=[];
  async function step(name,fn){try{await close();await fn();results.push({name,status:'PASS'});totalPass++;console.log('PASS',tag,name)}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL',tag,name,'\n',e.message);await p.screenshot({path:`.audit/qr-${tag}-failure.png`,fullPage:true})}}
  const stateString=()=>p.evaluate(()=>JSON.stringify(state));
  const first=async(coll,field)=>p.evaluate(([c,f])=>{const x=(state[c]||[])[0];return x?String(x[f]):null},[coll,field]);
  try{

   await step('query string: all six kinds parse to {kind,id}',async()=>{
    const r=await p.evaluate(kinds=>kinds.map(k=>window.parseBiobesDeepLink('?'+k+'=X-1')),['lot','peshim','fb','furnitor','produkt','klient']);
    assert.equal(r.length,6);
    r.forEach((x,i,all)=>{assert.equal(x.kind,['lot','peshim','fb','furnitor','produkt','klient'][i]);assert.equal(x.id,'X-1');assert.equal(x.source,'query')});
   });

   await step('hash form #/peshim/ID and #/lot/CODE parse',async()=>{
    const a=await p.evaluate(()=>window.parseBiobesDeepLink('#/peshim/PS-9999'));
    const b=await p.evaluate(()=>window.parseBiobesDeepLink('#/lot/LT-2026-777'));
    assert.deepEqual({k:a.kind,i:a.id,s:a.source},{k:'peshim',i:'PS-9999',s:'path'});
    assert.equal(b.kind,'lot');assert.equal(b.id,'LT-2026-777');
   });

   await step('legacy /trace/lot/CODE from the printed label parses as lot',async()=>{
    const r=await p.evaluate(()=>{const base=localStorage.getItem('biobesTraceUrl')||'https://erp.biobes-al.com/trace/lot/';return{url:base+'LT-2026-001',l:window.parseBiobesDeepLink(base+'LT-2026-001')}});
    assert.match(r.url,/\/trace\/lot\/LT-2026-001$/);
    assert.equal(r.l.kind,'lot');assert.equal(r.l.id,'LT-2026-001');assert.equal(r.l.source,'trace-path');
   });

   await step('biobesQrPayload round-trips for lot and for weighing',async()=>{
    const code=await first('lots','code');assert.ok(code,'ka te pakten nje lot');
    const r=await p.evaluate(c=>{const lot=window.biobesQrPayload('lot',c);const w=window.biobesQrPayload('peshim','PS-1234');return{lot,w,pl:window.parseBiobesDeepLink(lot),pw:window.parseBiobesDeepLink(w)}},code);
    assert.equal(r.pl.kind,'lot');assert.equal(r.pl.id,code);
    assert.match(r.w,/[?&]peshim=PS-1234$/);assert.equal(r.pw.kind,'peshim');assert.equal(r.pw.id,'PS-1234');
    await p.evaluate(()=>{window.__t4=[(()=>{try{window.biobesQrPayload('lot','');return 'no-throw'}catch(e){return e.message}})(),(()=>{try{window.biobesQrPayload('panjohur','X');return 'no-throw'}catch(e){return e.message}})()]});
    const t4=await p.evaluate(()=>window.__t4);await p.evaluate(()=>{delete window.__t4});
    assert.match(t4[0],/pavlefshem/,'payload pa id: gabim i qarte');
    assert.match(t4[1],/pavlefshem/,'payload me kind te panjohur: gabim i qarte');
   });

   await step('unknown link and missing record fail soft (no throw, no state write)',async()=>{
    const before=await stateString();
    const r=await p.evaluate(()=>{const g=window.biobesOpenDeepLink({href:'?faraje=1',silent:true});const nf=window.biobesOpenDeepLink({href:'?lot=LT-PA-MUNGESES',silent:true});return{g,nf,state:JSON.stringify(state)}});
    assert.equal(r.g.ok,false);assert.equal(r.g.reason,'no-link');
    assert.equal(r.nf.ok,false);assert.equal(r.nf.reason,'not-found');
    assert.equal(r.state,before,'asnje mutate te state');
    assert.deepEqual(await p.evaluate(()=>window.biobesDeepLinkState()),{kind:'lot',id:'LT-PA-MUNGESES',source:'query'},'gjendja e nyjes ruhet edhe kur regjistrimi mungon');
   });

   await step('deep link opens the lot card and adds the link row (desktop+phone)',async()=>{
    const id=await first('lots','id');const code=await first('lots','code');
    const before=await stateString();
    const r=await p.evaluate(i=>window.biobesOpenDeepLink({href:'?lot='+i,navigate:false}),id);
    assert.equal(r.ok,true);assert.equal(r.via,'lotCard');
    await p.waitForSelector('#modalBody',{state:'visible'});
    assert.ok((await p.locator('#modalBody').innerText()).includes(code),'modali permban kodin '+code);
    await p.waitForSelector('#qrDeepLinkRow',{timeout:4000});
    assert.equal(await p.locator('#qrDeepLinkBar').count(),1);
    assert.equal(await stateString(),before,'lexuesemer: pa save, pa mutate');
   });

   await step('Pastro clears address, closes modal and reports cleared',async()=>{
    const r=await p.evaluate(()=>{const out=window.biobesClearDeepLink();return{out,search:location.search,hash:location.hash,open:!!document.querySelector('.modal-bg.open'),st:window.biobesDeepLinkState()}});
    assert.equal(r.out.ok,true);assert.equal(r.out.cleared,true);
    assert.equal(r.search,'');assert.equal(r.hash,'');
    assert.equal(r.open,false);assert.equal(r.st,null);
    assert.equal(await p.locator('#qrDeepLinkBar').count(),0);
   });

   await step('Pastro returns the Magazina rack filter to "Të gjitha magazinat"',async()=>{
    await p.evaluate(()=>go('warehouse'));await p.waitForSelector('#rackGrid .rack',{timeout:4000});
    const total=await p.locator('#rackGrid .rack').count();assert.ok(total>0,'ka rafte ne demo');
    const r=await p.evaluate(t=>{window.biobesOpenDeepLink({href:'?lot='+(state.lots[0].id),navigate:true});
     const sel=document.querySelector('select[onchange^="filterRacksV2"]');
     /* Magazina pa asnjë raft (rasti real MG) -> filtri duhet te fshehe gjithçka. */
     const withRacks=new Set(state.racks.map(x=>x.warehouse));
     const empty=(state.warehouses||[]).find(w=>!withRacks.has(w.id))||state.warehouses[1];
     sel.value=empty.id;filterRacksV2(sel.value);
     const hiddenDuring=[...document.querySelectorAll('#rackGrid .rack')].filter(e=>e.style.display==='none').length;
     window.biobesClearDeepLink();
     const hiddenAfter=[...document.querySelectorAll('#rackGrid .rack')].filter(e=>e.style.display==='none').length;
     const visibleAfter=[...document.querySelectorAll('#rackGrid .rack')].filter(e=>e.style.display!=='none').length;
     return{sel:sel.value,empty:empty.id,hiddenDuring,hiddenAfter,visibleAfter,total:document.querySelectorAll('#rackGrid .rack').length}},total);
    assert.ok(r.hiddenDuring===r.total,'filtrimi i ' + r.empty + ' fshehu te gjithe ' + r.total + ' raftet (fshehur: '+r.hiddenDuring+')');
    assert.equal(r.sel,'');assert.equal(r.hiddenAfter,0,'te gjithe rafet kthehen');
    assert.equal(r.visibleAfter,r.total,'pamja e plote rikthehet');
   });

   await step('hashchange while app is open re-opens the record (no reload)',async()=>{
    const code=await first('lots','code');
    await p.evaluate(()=>history.replaceState({},'','/'));
    await p.evaluate(c=>{location.hash='#/lot/'+encodeURIComponent(c)},code);
    await p.waitForFunction(()=>!!document.querySelector('.modal-bg.open'),null,{timeout:4000});
    assert.ok((await p.locator('#modalBody').innerText()).includes(code));
    assert.equal(await p.evaluate(()=>window.biobesDeepLinkState().kind),'lot');
    await p.evaluate(()=>window.biobesClearDeepLink());
   });

   await step('guard: PS-2026-002 never appears or is created by deep-link work',async()=>{
    const r=await p.evaluate(id=>({has:(state.weighings||[]).some(x=>x.id===id),n:(state.weighings||[]).length,keys:Object.keys(window).filter(k=>/^biobes(Qr|Open|Clear|Deep)/.test(k)).sort()}),PRODUCTION_WEIGHING_ID);
    assert.equal(r.has,false,'dokumenti real i prodhimit nuk duhet te ekzistoje ne profilin e testit');
    assert.ok(r.keys.includes('biobesQrPayload')&&r.keys.includes('biobesOpenDeepLink')&&r.keys.includes('biobesClearDeepLink')&&r.keys.includes('biobesDeepLinkState'));
    assert.equal(await p.evaluate(()=>window.__biobesQrDeepLink.version),'biobes-qr-deeplink-v1');
   });

   console.log('\n=== '+tag.toUpperCase()+': '+results.filter(r=>r.status==='PASS').length+'/'+results.length+' prova PASS ===');
   assert.deepEqual(results.filter(r=>r.status!=='PASS'),[]);
  }finally{
   fs.writeFileSync('.audit/qr-'+tag+'.json',JSON.stringify(results,null,2));
   await browser.close();
  }
 }
 console.log('\nTOTAL: '+totalPass+'/'+totalSteps+' prova të QR/deep-link (desktop + telefon)');
 if(totalPass!==20)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
