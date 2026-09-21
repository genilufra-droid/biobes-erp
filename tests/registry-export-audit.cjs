/* tests/registry-export-audit.cjs — kudo ku ka kërkim live: butonat ⬇ Excel dhe 🖨 PDF
   eksportojnë VETËM rreshtat e dukshëm (të filtruar), me kolonat e tabelës. */
const {open}=require('./helpers.cjs'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 await p.waitForTimeout(1200);
 await ev(()=>{try{closeModal()}catch(e){}});

 await step('Seed: dy peshime dhe një pagesë për provat e eksportit',async()=>{
  const info=await ev(()=>{const s=state.suppliers[0],s2=state.suppliers[1],pr=state.products[0];
   state.weighings.push({id:'PS-2026-9001',date:'2026-09-13',supplier:s.id,product:pr.id,gross:400,tare:40,net:359.4,bags:8,status:'Konfirmuar',createdAt:new Date().toISOString()});
   state.weighings.push({id:'PS-2026-9002',date:'2026-09-18',supplier:s2.id,product:pr.id,gross:200,tare:20,net:113,bags:4,status:'Konfirmuar',createdAt:new Date().toISOString()});
   state.payments.push({id:'MP-9001',date:'2026-09-14',supplier:s.id,method:'Cash',amount:1000,currency:'ALL',exchangeRate:1,note:'test eksport',status:'Konfirmuar',createdAt:new Date().toISOString()});
   save();return{n1:s.name.split(' ')[0],n2:s2.name.split(' ')[0]}});
  assert.ok(info.n1&&info.n2);
  await ev(()=>window.__expNames=undefined);
  await p.waitForTimeout(200);
 });

 await step('Blerje & Peshime: kutia e kërkimit ka butonat ⬇ Excel dhe 🖨 PDF',async()=>{
  await ev(()=>go('purchases'));await p.waitForTimeout(600);
  const box=p.locator('.module-live-search');
  assert.equal(await box.count(),1,'kuti kërkimi mungon');
  assert.ok(await box.locator('button[data-mexp="xlsx"]').isVisible());
  assert.ok(await box.locator('button[data-mexp="pdf"]').isVisible());
  assert.ok(await box.locator('button[data-mclear]').isVisible());
 });

 await step('Filtri "Sokol": collect kthen vetëm rreshtat e dukshëm, me kolonat e tabelës',async()=>{
  const q=await ev(()=>state.suppliers[0].name.split(' ')[0]);
  await p.locator('.module-live-search input').fill(q);await p.waitForTimeout(300);
  assert.match(await p.locator('.module-live-search .search-count').innerText(),/^\d+ \/ \d+ rezultate$/);
  const c=await ev(()=>{const c=window.moduleExportCollect();return{h:c.headers,r:c.rows}});
  assert.ok(c.h.length>=6,'koka: '+JSON.stringify(c.h));
  assert.match(c.h[0],/Fature|Dokumenti/);
  assert.equal(c.r.length,1,'rreshta të filtruar: '+c.r.length);
  c.r.forEach(r=>assert.ok(r.join(' ').includes(q),'rreshti s’përmban filtrin'));
  await p.locator('.module-live-search button[data-mclear]').click();await p.waitForTimeout(250);
  const full=await ev(()=>window.moduleExportCollect().rows.length);
  assert.equal(full,2,'të papiltruar: '+full);
  await p.locator('.module-live-search input').fill(q);await p.waitForTimeout(250);
 });

 await step('⬇ Excel: 100% si në sistem — të njëjtat kolona dhe TEKSTI i njëjtë i qelizave',async()=>{
  const onScreen=await ev(()=>{const t=document.querySelector('#main .table-wrap table');
   return {heads:[...t.querySelectorAll('thead th')].map(x=>x.innerText.trim()),
    rows:[...t.tBodies].flatMap(tb=>[...tb.rows]).filter(r=>!r.querySelector('.empty')&&r.style.display!=='none').map(r=>[...r.cells].map(td=>{const c=td.cloneNode(true);c.querySelectorAll('button,.btn').forEach(b=>b.remove());return c.innerText.replace(/\s+/g,' ').trim()}))}});
  const dl=p.waitForEvent('download',{timeout:6000});
  await p.locator('.module-live-search button[data-mexp="xlsx"]').click();
  const d=await dl;
  assert.match(d.suggestedFilename(),/^BioBes-purchases-\d{4}-\d{2}-\d{2}\.xlsx$/,'emër: '+d.suggestedFilename());
  const buf=fs.readFileSync(await d.path()).toString('utf8');
  const xmlEsc=v=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  onScreen.heads.forEach(h=>assert.ok(buf.includes(xmlEsc(h)),'kolona mungon në Excel: '+h));
  onScreen.rows.forEach(r=>r.forEach(v=>{if(v)assert.ok(buf.includes(xmlEsc(v)),'qeliza jo identike: '+v)}));
  assert.ok(buf.includes('TOTALI'),'rreshti TOTALI');
  assert.ok(buf.includes('Eksporti u shkarkua')||buf.includes('Blerje'),'titulli i modulit në krye');
  assert.ok(/numFmt numFmtId="164"|#,##0\.00/.test(buf),'formati numerik për totalet');
  assert.match(await ev(()=>document.getElementById('toast').textContent),/Eksporti Excel u shkarkua \(\d+ rreshta/);
  assert.match(await ev(()=>document.getElementById('toast').textContent),/TOTALI/);
 });

 await step('🖨 PDF: frame i printimit përmban vetëm rreshtat e filtruar (+ titullin dhe filtrin)',async()=>{
  await p.locator('.module-live-search button[data-mexp="pdf"]').click();
  await p.waitForTimeout(200);
  const r=await ev(()=>{const f=document.getElementById('biobesPrintFrame');if(!f)return null;const t=f.contentDocument.body.innerText;return{has:!!f.contentDocument.getElementById('moduleExportSheet'),txt:t,filtri:t.includes('filtri:'),titull:/Blerje/.test(t),tot:t.includes('TOTALI')}});
  assert.ok(r,'frame mungon');
  const q2=await ev(()=>state.suppliers[0].name.split(' ')[0]);
  const q3=await ev(()=>state.suppliers[1].name.split(' ')[0]);
  assert.equal(r.has,true);assert.equal(r.txt.includes(q2),true);assert.equal(r.txt.includes(q3),false,'rreshtat e jashtëm nuk duhet të jenë në PDF');
  assert.equal(r.filtri,true);assert.equal(r.titull,true);assert.equal(r.tot,true,'rreshti TOTALI në PDF');
  await p.waitForTimeout(2200);
  assert.equal(await ev(()=>!!document.getElementById('moduleExportSheet')),false,'fleta duhet pastruar');
 });

 await step('Pastro: kthen të gjithë rreshtat dhe numëruesin',async()=>{
  await p.locator('.module-live-search button[data-mclear]').click();await p.waitForTimeout(300);
  assert.match(await p.locator('.module-live-search .search-count').innerText(),/\d+ regjistrime/);
  const c=await ev(()=>window.moduleExportCollect().rows.length);
  assert.equal(c,2,'të gjithë rreshtat: '+c);
 });

 await step('Modul tjetër (Pagesat): butonat ekzistojnë dhe eksporti PDF funksionon',async()=>{
  await ev(()=>go('payments'));await p.waitForTimeout(600);
  assert.equal(await p.locator('.module-live-search button[data-mexp="xlsx"]').count(),1);
  await p.locator('.module-live-search button[data-mexp="pdf"]').click();
  await p.waitForTimeout(250);
  const has=await ev(()=>{const f=document.getElementById('biobesPrintFrame');return !!(f&&f.contentDocument.getElementById('moduleExportSheet'))});
  assert.equal(has,true);
 });

 await step('Shpenzimet: ka Excel vendas → kutia s’shton duplikatë, vetëm 🖨 PDF',async()=>{
  await ev(()=>go('expenses'));await p.waitForTimeout(600);
  assert.equal(await p.locator('.module-live-search button[data-mexp="xlsx"]').count(),0,'pa duplikatë Excel');
  assert.equal(await p.locator('.module-live-search button[data-mexp="pdf"]').count(),1);
  assert.equal(await p.getByRole('button',{name:'⬇ Excel',exact:true}).count(),1,'vetëm Excel-i vendas');
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
