/* Etiketa e lotit të magazinës (kartela e lotit → «Printo etiketën» / «Printo në A4»):
   1 faqe e vetme në çdo printer (80×60 mm etiketash OSE A4/Letter zyre), etiketa e plotë brenda faqes,
   asnjë @page tjetër i aplikacionit (A4 landscape i Alpha-s, margin:5mm) brenda iframe-it, QR 300 px. */
const {open}=require('./helpers.cjs');const assert=require('node:assert/strict');const fs=require('node:fs');
let passed=0,failed=0;
async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e&&e.message||e).split('\n')[0])}}
(async()=>{const {browser,page:p,context,errors,close}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function capture(btnText){return await ev(t=>new Promise(res=>{go('lots');lotCard('L1');setTimeout(()=>{let b=[...document.querySelectorAll('#modalBody button')].find(b=>b.textContent.trim()===t);if(!b)return res(null);b.click();setTimeout(()=>{let f=document.getElementById('biobesPrintFrame'),d=f&&f.contentDocument;if(!d)return res(null);let css=[...d.querySelectorAll('style')].map(s=>s.textContent).join('\n');res({title:d.title,html:d.documentElement.outerHTML,pages:css.match(/@page[^{]*\{[^}]*\}/g)||[],qr:(d.querySelector('#warehouseQr img')||{}).naturalWidth||0,text:d.body.innerText})},150)},600)}),btnText)}
 async function measure(html,pdfOpts){const pg=await context.newPage();try{await pg.setContent(html,{waitUntil:'load'});await pg.waitForTimeout(150);const buf=await pg.pdf(Object.assign({printBackground:true},pdfOpts));const pages=(buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;await pg.emulateMedia({media:'print'});const m=await pg.evaluate(()=>{let el=document.getElementById('printWarehouseLabel'),r=el.getBoundingClientRect(),mm=v=>v/96*25.4;let cells=[...el.querySelectorAll('td')];return{w:mm(r.width),h:mm(r.height),inner:el.scrollHeight>el.clientHeight+1,cell:cells.some(td=>td.scrollWidth>td.clientWidth+1),small:el.querySelector('small').getBoundingClientRect().bottom<=r.bottom+0.5,qrBottom:el.querySelector('#warehouseQr').getBoundingClientRect().bottom<=r.bottom+0.5,bodyOverflow:getComputedStyle(document.body).overflow,h2:getComputedStyle(el.querySelector('h2')).fontSize}});return Object.assign({pages},m)}finally{await pg.close()}}
 let lab=null,a4=null;
 await step('Kartela e lotit ka «Printo etiketën» dhe «Printo në A4»; etiketa në ekran: kokë + tabelë + QR',async()=>{
   await ev(()=>{go('lots');lotCard('L1')});await p.waitForTimeout(700);
   const names=await ev(()=>[...document.querySelectorAll('#modalBody button')].map(b=>b.textContent.trim()));
   assert.ok(names.includes('Printo etiketën'));assert.ok(names.includes('Printo në A4'));
   const st=await ev(()=>{let el=document.getElementById('printWarehouseLabel');return{head:!!el.querySelector('.wl-head h2'),code:el.querySelector('.wl-code').textContent,rows:el.querySelectorAll('table tr').length,qr:(el.querySelector('.wl-side #warehouseQr img')||{}).naturalWidth||0,small:el.querySelector('.wl-side small').textContent,w:el.getBoundingClientRect().width}});
   assert.ok(st.head);assert.equal(st.code,'B1S01/1-105-26');assert.equal(st.rows,6);assert.equal(st.qr,300);assert.match(st.small,/Skano QR/);assert.ok(st.w>250&&st.w<=310,'gjerësia '+st.w);
   await close();
 });
 await step('«Printo etiketën»: iframe me VETËM @page 80mm 60mm (asnjë A4/landscape/margin:5mm nga stilet e aplikacionit)',async()=>{
   lab=await capture('Printo etiketën');assert.ok(lab,'iframe mungon');assert.match(lab.title,/Etiketa e magazinës B1S01\/1-105-26/);
   assert.deepEqual(lab.pages,['@page{size:80mm 60mm;margin:0}']);assert.equal(lab.qr,300);
   for(const t of ['BioBes — ETIKETË MAGAZINE','B1S01/1-105-26','Kodi produktit','105','Ferrë','S01/1','1,200 kg','MQ / R01','2026-09-03','Skano QR për gjurmueshmërinë e lotit'])assert.ok(lab.text.includes(t),'mungon: '+t);
   fs.writeFileSync('.audit/label-print-frame.html',lab.html);
 });
 await step('Printer etiketash 80×60: 1 faqe, etiketa 72×52 mm brenda, pa tejkalim, QR + fundi brenda kornizës',async()=>{
   const m=await measure(lab.html,{preferCSSPageSize:true});
   assert.equal(m.pages,1);assert.ok(Math.abs(m.w-72)<0.6&&Math.abs(m.h-52)<0.6,JSON.stringify(m));assert.equal(m.inner,false);assert.equal(m.cell,false);assert.equal(m.small,true);assert.equal(m.qrBottom,true);assert.equal(m.bodyOverflow,'hidden');
 });
 await step('Printer zyre që injoron formatin e etiketës (A4 dhe Letter të detyruara): përsëri 1 faqe, e njëjta etiketë e plotë',async()=>{
   for(const o of [{format:'A4'},{format:'Letter'},{format:'A4',landscape:false}]){const m=await measure(lab.html,o);assert.equal(m.pages,1,JSON.stringify(o)+' → '+m.pages+' faqe');assert.ok(Math.abs(m.w-72)<0.6&&Math.abs(m.h-52)<0.6,JSON.stringify(m));assert.equal(m.inner,false);assert.equal(m.small,true)}
 });
 await step('«Printo në A4»: @page A4 portrait, 1 faqe, etiketa 72×52 mm lart-majtas',async()=>{
   a4=await capture('Printo në A4');assert.ok(a4,'iframe mungon');assert.deepEqual(a4.pages,['@page{size:A4 portrait;margin:0}']);
   const m=await measure(a4.html,{preferCSSPageSize:true});assert.equal(m.pages,1);assert.ok(Math.abs(m.w-72)<0.6&&Math.abs(m.h-52)<0.6,JSON.stringify(m));assert.equal(m.inner,false);
   const pos=await (async()=>{const pg=await context.newPage();try{await pg.setContent(a4.html,{waitUntil:'load'});await pg.emulateMedia({media:'print'});await pg.setViewportSize({width:794,height:1123});return await pg.evaluate(()=>{let r=document.getElementById('printWarehouseLabel').getBoundingClientRect();return{x:r.left/96*25.4,y:r.top/96*25.4}})}finally{await pg.close()}})();
   assert.ok(pos.x>=10&&pos.x<=16&&pos.y>=10&&pos.y<=16,JSON.stringify(pos));
   const m2=await measure(a4.html,{format:'Letter'});assert.equal(m2.pages,1);
 });
 await step('Etiketa tjetër QR (Raportet → Gjurmueshmëria, 84×50) përdor të njëjtin kanal: 1 faqe edhe në A4',async()=>{
   const r=await ev(()=>new Promise(res=>{vyEnter();setTimeout(()=>{vyGo('trace');setTimeout(()=>{let b=[...document.querySelectorAll('button')].find(b=>/Printo etiketën/.test(b.textContent)&&b.closest('.vy-qr'));if(!b)return res(null);b.click();setTimeout(()=>{let f=document.getElementById('biobesPrintFrame'),d=f&&f.contentDocument;res(d?{html:d.documentElement.outerHTML,pages:d.querySelector('style').textContent.match(/@page[^{]*\{[^}]*\}/g)||[]}:null)},150)},600)},600)}));
   assert.ok(r,'butoni/iframe mungon');assert.deepEqual(r.pages,['@page{size:84mm 50mm;margin:0}']);
   for(const o of [{preferCSSPageSize:true},{format:'A4'}]){const pg=await context.newPage();try{await pg.setContent(r.html,{waitUntil:'load'});const buf=await pg.pdf(Object.assign({printBackground:true},o));assert.equal((buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length,1)}finally{await pg.close()}}
   await ev(()=>{try{vyLeave('alpha')}catch(e){}});
 });
 await step('Pa gabime JS në konsolë',async()=>{assert.deepEqual(errors,[])});
 await browser.close();console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0)})().catch(e=>{console.error(e);process.exit(1)});
