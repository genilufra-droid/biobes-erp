/* tests/manual-audit.cjs — manuali i sistemit: kapituj, kërkim, të drejta, shënime, turn, print */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}

 await step('Paneli ka kartelën e manualit dhe koka butonin 📖; manuali hapet me kapituj',async()=>{
   await p.waitForTimeout(1400);
   assert.equal(await p.locator('#mbOffer').count(),1,"ftesa e turnit nuk u shfaq (banner jo-bllokues)");
   await ev(()=>mbOfferClose());await p.waitForTimeout(200);
   assert.ok(await p.locator('button:has-text("Hap manualin")').count()>=1,'kartela e manualit mungon në panel');
   assert.equal(await p.locator('#manualHelpBtn').count(),1,'butoni 📖 mungon në kokë');
   await p.locator('button:has-text("Hap manualin")').first().click();await p.waitForTimeout(400);
   const info=await ev(()=>({t:document.getElementById('modalTitle').textContent,
     n:document.querySelectorAll('#mbSide button').length,
     body:(document.getElementById('mbBody')||{}).innerText||''}));
   assert.match(info.t,/Manuali i sistemit/);
   assert.ok(info.n>=15,'kapitujt e dukshëm janë vetëm '+info.n);
   assert.match(info.body,/Fillimi i shpejtë/);
 });

 await step('Kërkimi filtron kapitujt dhe gjen "extract" te Banka',async()=>{
   await ev(()=>manualSearch('CSV'));await p.waitForTimeout(250);
   const side=await ev(()=>(document.getElementById('mbSide')||{}).innerText||'');
   const body=await ev(()=>(document.getElementById('mbBody')||{}).innerText||'');
   assert.match(side,/Banka/);assert.ok(!/Fjalor/i.test(side),'kërkimi duhet të ngushtojë listën');
   assert.match(body,/Extract-i CSV/);
   await ev(()=>openManual('fillimi'));await p.waitForTimeout(250);
 });

 await step('Admini shton shënim kompanie dhe shfaqet te kapitulli',async()=>{
   await ev(()=>openManual('fillimi'));await p.waitForTimeout(300);
   await ev(()=>{const d=document.querySelector('#mbBody details');d.open=true;document.getElementById('mbNote').value='Në BioBes peshimet i konfirmon magazina, jo fermeri.'});
   await ev(()=>manualSaveNote('fillimi'));await p.waitForTimeout(350);
   const body=await ev(()=>(document.getElementById('mbBody')||{}).innerText||'');
   assert.match(body,/Shënim i kompanisë/);assert.match(body,/magazina, jo fermeri/);
   assert.equal(await ev(()=>state.manualNotes.fillimi),'Në BioBes peshimet i konfirmon magazina, jo fermeri.');
 });

 await step('Turni interaktiv: ndriçon elementet, ecën përpara dhe shënon përfundimin',async()=>{
   await ev(()=>{try{closeModal()}catch(e){};manualTourStart()});await p.waitForTimeout(900);
   assert.equal(await p.locator('#mbTour .mb-spot').count(),1,'spotlight-i mungon');
   assert.match(await p.locator('#mbTour .mb-tip').innerText(),/Hapi 1 nga/);
   await ev(()=>manualTourNext());await p.waitForTimeout(800);
   assert.match(await p.locator('#mbTour .mb-tip').innerText(),/Hapi 2 nga/);
   await ev(()=>manualTourSkip());await p.waitForTimeout(300);
   assert.equal(await p.locator('#mbTour').count(),0,'turni nuk u mbyll me Kapërce');
   assert.equal(await ev(()=>!!(state.manualTourDone||{})[(activeUser()||{}).id]),false,'kapërcimi s\'duhet të shënojë përfundimin');
   await ev(()=>manualTourStart());await p.waitForTimeout(700);
   for(let i=0;i<9;i++){await ev(()=>manualTourNext());await p.waitForTimeout(450)}
   assert.equal(await p.locator('#mbTour').count(),0,'turni s\'përfundoi');
   assert.equal(await ev(()=>!!(state.manualTourDone||{})[(activeUser()||{}).id]),true,'përfundimi nuk u shënua');
 });

 await step('Printimi i manualit: iframe me @page A4 portrait dhe të gjithë kapitujt',async()=>{
   await ev(()=>manualPrint());await p.waitForTimeout(200);
   const fr=await ev(()=>{const f=document.getElementById('biobesPrintFrame');if(!f)return null;
     return {css:(f.contentDocument.querySelector('style')||{}).textContent||'',len:f.contentDocument.body.innerHTML.length,
       has:f.contentDocument.body.innerHTML.includes('Manuali i përdorimit')}});
   assert.ok(fr,'iframe-i i printimit mungon');
   assert.match(fr.css,/@page\{size:A4 portrait/);
   assert.equal(fr.has,true);assert.ok(fr.len>4000,'përmbajtja e printimit shumë e shkurtër: '+fr.len);
 });

 await step('Përdorues i kufizuar: sheh vetëm kapitujt e moduleve me të drejtë + shënimin, pa textarea',async()=>{
   await ev(async()=>{const h=await hashPassword('Prove-2026!');state.users.push({id:'U-MB',username:'mb-user',name:'Lexues',role:'ROLE-USER',active:true,
     passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false,rights:{v:2,modules:{dashboard:['view'],weighings:['view']}}});
     save();closeModal();logoutUser()});
   await p.waitForFunction(()=>!!document.getElementById('loginLock'));
   await p.locator('#loginName').fill('mb-user');await p.locator('#loginPass').fill('Prove-2026!');await p.locator('#loginPass').press('Enter');
   await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(700);
   await ev(()=>{try{closeModal()}catch(e){};go('dashboard')});await p.waitForTimeout(600);
   await ev(()=>{try{closeModal()}catch(e){};openManual()});await p.waitForTimeout(400);
   const side=await ev(()=>(document.getElementById('mbSide')||{}).innerText||'');
   assert.match(side,/Fillimi i shpejtë/);assert.match(side,/Blerje & Peshime/);
   assert.ok(!/Banka/.test(side),'kapitulli i bankës s\'duhet të shfaqet pa të drejtë');
   assert.ok(!/Raportet/.test(side));
   await ev(()=>openManual('fillimi'));await p.waitForTimeout(300);
   const body=await ev(()=>(document.getElementById('mbBody')||{}).innerText||'');
   assert.match(body,/magazina, jo fermeri/,'shënimi i adminit duhet të shfaqet');
   assert.equal(await p.locator('#mbNote').count(),0,'textarea e shënimit s\'duhet të jetë për user-in');
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
