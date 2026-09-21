/* tests/registry-export-audit.cjs — kudo ku ka kërkim live: butonat ⬇ Excel dhe 🖨 PDF
   eksportojnë VETËM rreshtat e dukshëm (të filtruar), me kolonat e tabelës. */
const {open}=require('./helpers.cjs'),fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict');
/* lexon një xlsx (zip i pastruar) vetëm me modulet e Node-s */
async function loadXlsx(buf){
 const out={},eocd=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
 if(eocd<0)throw new Error('jo xlsx');
 const n=buf.readUInt16LE(eocd+10),start=buf.readUInt32LE(eocd+16);
 let off=start;
 for(let i=0;i<n;i++){
  if(buf.readUInt32LE(off)!==0x02014b50)break;
  const method=buf.readUInt16LE(off+10),csize=buf.readUInt32LE(off+20),nameLen=buf.readUInt16LE(off+28),extraLen=buf.readUInt16LE(off+30),cmtLen=buf.readUInt16LE(off+32),local=buf.readUInt32LE(off+42),name=buf.slice(off+46,off+46+nameLen).toString('utf8');
  const lNameLen=buf.readUInt16LE(local+26),lExtra=buf.readUInt16LE(local+28),dataStart=local+30+lNameLen+lExtra;
  const raw=buf.slice(dataStart,dataStart+csize);
  out[name]=method===0?raw.toString('utf8'):zlib.inflateRawSync(raw).toString('utf8');
  off+=46+nameLen+extraLen+cmtLen;
 }
 return out;
}
/* Validim i strukturës XLSX sipas skemës së Excel-it — kap "we found a problem with some content". */
const XLS_ORDER=['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','autoFilter','sortState','mergeCells','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','extLst'];
const STY_ORDER=['numFmts','fonts','fills','borders','cellStyleXfs','cellXfs','cellStyles','dxfs','tableStyles'];
function xmlWellFormed(xml){
 const stack=[];let i=0;const voidOk=/^(\?|!)/;
 const re=/<\/?[A-Za-z_][^>]*?>/g;let m;
 while((m=re.exec(xml))){
  const tag=m[0];
  if(tag.startsWith('<?')||tag.startsWith('<!'))continue;
  const closing=tag.startsWith('</');
  const self=tag.endsWith('/>');
  const name=tag.replace(/^<\/?/,'').replace(/[\s/>].*$/,'');
  if(closing){const top=stack.pop();if(top!==name)throw new Error('XML i prishur: </'+name+'> në vend të </'+top+'>')}
  else if(!self)stack.push(name);
 }
 if(stack.length)throw new Error('XML i pambyllur: '+stack.join(','));
 return true;
}
function assertSchema(zip,part,order){
 const xml=zip[part];if(!xml)throw new Error('mungon '+part);
 xmlWellFormed(xml);
 const seq=[...xml.matchAll(/<([A-Za-z_][\w]*)[\s/>]/g)].map(m=>m[1]);
 const seen=seq.filter(n=>order.includes(n)).filter((v,i,a)=>a.indexOf(v)===i);
 const idx=seen.map(n=>order.indexOf(n));
 if(idx.some((v,i)=>i&&v<idx[i-1]))throw new Error(part+': rend i gabuar: '+seen.join(' < '));
 return true;
}
function assertWorkbookValid(zip){
 ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml'].forEach(n=>{if(!zip[n])throw new Error('mungon '+n);xmlWellFormed(zip[n])});
 assertSchema(zip,'xl/worksheets/sheet1.xml',XLS_ORDER);
 assertSchema(zip,'xl/styles.xml',STY_ORDER);
 const xfs=(zip['xl/styles.xml'].match(/<cellXfs count="(\d+)"/)||[])[1];
 const maxS=Math.max(...[...zip['xl/worksheets/sheet1.xml'].matchAll(/ s="(\d+)"/g)].map(m=>+m[1]));
 if(!(maxS<+xfs))throw new Error('stil i papërcaktuar: s='+maxS+' / cellXfs='+xfs);
 return true;
}
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
  // Excel-i (Office) e hap pa "found a problem": rendi i elementeve duhet të jetë i saktë
  assert.ok(buf.indexOf('<autoFilter')<buf.indexOf('<mergeCells'),'autoFilter para mergeCells (schema e Excel)');
  assert.ok(/<cellStyles count="1"><cellStyle name="Normal"/.test(buf),'cellStyle Normal (pajtueshmëri me Excel)');
  const tags=['sheetViews','sheetFormatPr','cols','sheetData','autoFilter','mergeCells','pageMargins','pageSetup'];
  const idx=tags.map(t=>buf.indexOf('<'+t));assert.ok(idx.every((v,i)=>v>0&&(i===0||v>idx[i-1])),'rendi i elementeve: '+tags.join(' < '));
  assert.ok(buf.includes('Eksporti u shkarkua')||buf.includes('Blerje'),'titulli i modulit në krye');
  assert.ok(/numFmt numFmtId="164"|#,##0\.00/.test(buf),'formati numerik për totalet');
  assertWorkbookValid(await loadXlsx(fs.readFileSync(await d.path())));
  assert.match(await ev(()=>document.getElementById('toast').textContent),/Eksporti Excel u shkarkua \(\d+ rreshta/);
  assert.match(await ev(()=>document.getElementById('toast').textContent),/TOTALI/);
 });

 await step('🖨 PDF: frame i printimit përmban vetëm rreshtat e filtruar (+ titullin dhe filtrin)',async()=>{
  await p.locator('.module-live-search button[data-mexp="pdf"]').click();
  await p.waitForTimeout(200);
  const r=await ev(()=>{const f=document.getElementById('biobesPrintFrame');if(!f)return null;const t=f.contentDocument.body.innerText;const el=f.contentDocument.getElementById('moduleExportSheet');let vis=false,rr=0;if(el){const cs=f.contentWindow.getComputedStyle(el);const sty=f.contentDocument.documentElement.innerHTML;vis=cs.position!=='fixed'&&!/left:\s*-10000/.test(sty)&&/@page\{size:A4 landscape/.test(sty)&&!!el.querySelector('thead th')&&!!el.querySelector('tfoot th');rr=el.querySelectorAll('tbody tr').length}return{has:!!el,txt:t,filtri:t.includes('filtri:'),titull:/Blerje/.test(t),tot:t.includes('TOTALI'),visible:vis,rows:rr}});
  assert.ok(r,'frame mungon');
  const q2=await ev(()=>state.suppliers[0].name.split(' ')[0]);
  const q3=await ev(()=>state.suppliers[1].name.split(' ')[0]);
  assert.equal(r.has,true);assert.equal(r.txt.includes(q2),true);assert.equal(r.txt.includes(q3),false,'rreshtat e jashtëm nuk duhet të jenë në PDF');
  assert.equal(r.filtri,true);assert.equal(r.titull,true);assert.equal(r.tot,true,'rreshti TOTALI në PDF');
  assert.ok(r.visible,'fleta e PDF-së është brenda faqes (jo e zhvendosur jashtë → pa faqe të bardhë)');
  assert.ok(r.rows>0,'rreshtat në PDF');
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

 await step('Shpenzimet: eksporti i modulit del me të njëjtin stil (kokë, meta, një TOTALI i vetëm)',async()=>{
  await p.evaluate(()=>go('expenses'));await p.waitForTimeout(900);
  const dl=p.waitForEvent('download',{timeout:8000});
  await p.evaluate(()=>{const b=[...document.querySelectorAll('#main button')].find(x=>/Excel/i.test(x.innerText));if(!b)throw new Error('pa buton Excel');b.click()});
  const d=await dl;const raw=fs.readFileSync(await d.path());
  const zip=await loadXlsx(raw);
  const sheet=zip['xl/worksheets/sheet1.xml'];
  const texts=[...sheet.matchAll(/<is><t>([\s\S]*?)<\/t><\/is>/g)].map(m=>m[1]);
  assert.ok(/BioBes ERP/.test(texts.join(' ')),'rreshti i informacionit');
  assert.equal(texts.filter(t=>t==='TOTALI').length,1,'një TOTALI i vetëm');
  assert.ok(/20744A/.test(zip['xl/styles.xml']),'koka e gjelbër');
  assert.ok(/numFmtId="164"/.test(zip['xl/styles.xml']),'formati numerik');
  assert.equal(await ev(()=>page),'expenses');
 });

 await step('Kartela e klientit (eksport tjetër): xlsx i vlefshëm me stil dhe TOTALI',async()=>{
  await p.evaluate(()=>{const c=(state.customers||[])[0];
   if(!(state.customerPayments||[]).some(x=>x.customer===c.id)){customerPayments().push({id:'CP-XLSX-1',date:'2026-09-10',customer:c.id,method:'Bankë',amount:5000,currency:'ALL',rate:1,status:'Konfirmuar'});save()}
   reportCustomerId=c.id});
  const dl=p.waitForEvent('download',{timeout:8000});
  await p.evaluate(()=>{const c=(state.customers||[])[0];exportCustomerLedgerXlsx(c.id)});
  const d=await dl;
  assert.match(d.suggestedFilename(),/Kartela-klientit-\d{4}-\d{2}-\d{2}\.xlsx$/,'emri: '+d.suggestedFilename());
  const zip=await loadXlsx(fs.readFileSync(await d.path()));
  const sheet=zip['xl/worksheets/sheet1.xml'];
  assert.ok(/TOTALI/.test(sheet),'TOTALI në kartelë');
  assert.ok(/20744A/.test(zip['xl/styles.xml']),'stil i njëjtë');
 });

 await step('Template-t e importit NUK ndryshojnë (formati i importit mbetet i paprekur)',async()=>{
  const dl=p.waitForEvent('download',{timeout:8000});
  await p.evaluate(()=>professionalImportTemplate('suppliers'));
  const d=await dl;const zip=await loadXlsx(fs.readFileSync(await d.path()));
  const sheet=zip['xl/worksheets/sheet1.xml'];
  assert.ok(!/TOTALI/.test(sheet),'pa rresht TOTALI në template');
  assert.ok(!/BioBes ERP   ·   Data/.test(sheet),'pa rresht informacioni të eksportit');
  assert.ok(zip['xl/worksheets/sheet2.xml'],'fleta UDHEZIME ekziston');
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
