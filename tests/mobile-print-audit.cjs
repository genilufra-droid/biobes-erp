/* tests/mobile-print-audit.cjs — print-i i kartelës së gjurmueshmërisë në telefon:
   iframe me përmasa reale (Android/desktop, përmbajtja nuk layoutohet më 0px)
   dhe rruga iOS (window.print mbi #biobesPrintRoot, iframe hiqet). */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');

async function frameSnapshot(p){
 return p.evaluate(async()=>{
  printOnly('printTraceDossier','Kartela e gjurmueshmërisë');
  const f=document.getElementById('biobesPrintFrame');
  const cs=getComputedStyle(f),d=f.contentDocument,el=d.getElementById('printTraceDossier');
  const svg=el.querySelector('svg');
  return{frameW:cs.width,frameH:cs.height,left:cs.left,contentW:Math.round(el.getBoundingClientRect().width),
    tables:el.querySelectorAll('table').length,svgW:svg?Math.round(svg.getBoundingClientRect().width):0,
    title:d.title,hasKartela:el.textContent.includes('KARTELA E GJURMUESHMËRISË')};
 });
}

(async()=>{
 let passed=0,failed=0;
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}

 // ---- Desktop ----
 {
  const {browser,page:p,errors}=await open(false);
  const ev=(f,...a)=>p.evaluate(f,...a);
  await p.waitForTimeout(1200);
  await ev(()=>{try{closeModal()}catch(e){};traceDossierModal('lot:L1')});await p.waitForTimeout(400);
  await step('Desktop: iframe 1200x900 jashtë ekranit, përmbajtja e kartelës me gjerësi reale',async()=>{
   const r=await frameSnapshot(p);
   assert.equal(r.frameW,'1200px');assert.equal(r.frameH,'900px');assert.equal(r.left,'-10000px');
   assert.ok(r.contentW>500,'contentW='+r.contentW);
   assert.ok(r.svgW>100,'svgW='+r.svgW);
   assert.equal(r.tables,4);assert.equal(r.hasKartela,true);
   assert.equal(r.title,'Kartela e gjurmueshmërisë');
  });
  await step('Desktop: pa gabime JS',async()=>{assert.deepEqual(errors,[])});
  await browser.close();
 }

 // ---- Mobile (Android-like) ----
 {
  const {browser,page:p,errors}=await open(true);
  const ev=(f,...a)=>p.evaluate(f,...a);
  await p.waitForTimeout(1400);
  await ev(()=>{try{closeModal()}catch(e){};traceDossierModal('lot:L1')});await p.waitForTimeout(500);
  await step('Mobil: butoni "Printo A4 landscape" ekziston dhe iframe merr përmasa reale',async()=>{
   assert.ok(await p.locator('button:has-text("Printo A4 landscape")').isVisible(),'butoni i printit nuk shfaqet');
   const r=await frameSnapshot(p);
   assert.equal(r.frameW,'1200px');assert.ok(r.contentW>500,'contentW='+r.contentW);
   assert.ok(r.svgW>100,'svgW='+r.svgW);assert.equal(r.hasKartela,true);
  });
  await step('Mobil: pa gabime JS',async()=>{assert.deepEqual(errors,[])});
  await browser.close();
 }

 // ---- iOS (UA override) ----
 {
  const {browser,page:p,errors}=await open(false);
  const ev=(f,...a)=>p.evaluate(f,...a);
  await p.waitForTimeout(1200);
  await ev(()=>{try{closeModal()}catch(e){};traceDossierModal('lot:L1')});await p.waitForTimeout(400);
  await step('iOS: window.print mbi #biobesPrintRoot; iframe hiqet; klasa aktive',async()=>{
   await ev(()=>{
    Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',configurable:true});
    Object.defineProperty(navigator,'platform',{value:'iPhone',configurable:true});
    Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true});
    window.__printCalls=0;window.print=()=>{window.__printCalls++};
   });
   await p.locator('button:has-text("Printo A4 landscape")').click();
   await p.waitForTimeout(400);
   const r=await ev(()=>{const root=document.getElementById('biobesPrintRoot');return{
     root:!!root,calls:window.__printCalls,cls:document.body.classList.contains('biobes-print-active'),
     frame:!!document.getElementById('biobesPrintFrame'),
     kartela:root?root.textContent.includes('KARTELA E GJURMUESHMËRISË'):false,
     tables:root?root.querySelectorAll('table').length:0,svg:root?!(!root.querySelector('svg')):false,
     style:root?!(!root.querySelector('style')):false}});
   assert.equal(r.root,true,'#biobesPrintRoot nuk u krijua');
   assert.equal(r.frame,false,'iframe duhet hequr në iOS');
   assert.equal(r.calls,1,'window.print duhet thirrur një herë, ishte '+r.calls);
   assert.equal(r.cls,true,'body.biobes-print-active mungon');
   assert.equal(r.kartela,true);assert.equal(r.tables,4);assert.equal(r.svg,true);assert.equal(r.style,true);
   // pas pastrimit (afterprint ose timer 2.5s), gjendja kthehet normale
   await p.waitForTimeout(2800);
   const c=await ev(()=>({cls:document.body.classList.contains('biobes-print-active'),root:!!document.getElementById('biobesPrintRoot')}));
   assert.equal(c.cls,false);assert.equal(c.root,false);
  });
  await step('iOS: pa gabime JS',async()=>{assert.deepEqual(errors,[])});
  await browser.close();
 }

 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
