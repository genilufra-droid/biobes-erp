/* Multi-company (Modeli B) — provë me server të rremë në memorie.
   Provohet: (a) me serverin e sotëm (një kompani) pjesa e re mbetet e fjetur dhe sjellja
   nuk ndryshon; (b) kur serveri shpall dy kompani, të dhënat ndahen plotësisht
   (ruajtje lokale per kompani, `company` në API, numërim i pavarur, ndërrues në krye). */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const LOCAL='http://127.0.0.1:8000/';
const API_HOST='biobes-api.onrender.com'; // CSP-ja e app-it lejon vetëm këtë host; kërkesat ndërpriten nga rruga e testit

function fakeServer(opts){
  const store={C1:null,C2:null},versions={C1:0,C2:0},calls=[];
  const me=()=>opts.multi
    ?{ok:true,user:{id:'u1',username:'admin',name:'Admin',role:'ROLE-ADMIN'},multiCompany:true,defaultCompany:'C1',
      companies:[{id:'C1',code:'BB',name:'BioBes Sh.p.k.',isDefault:true},{id:'C2',code:'XX',name:'Kompania Dytë'}]}
    :{ok:true,user:{id:'u1',username:'admin',name:'Admin',role:'ROLE-ADMIN'}};
  const handler=async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname!==API_HOST)return route.continue();
    const p=u.pathname,m=req.method(),co=u.searchParams.get('company')||'C1';
    calls.push({p,m,co:u.searchParams.get('company')});
    const json=(code,body)=>route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(body)});
    if(p==='/api/health')return json(200,{ok:true,db:true});
    if(p==='/api/auth/login')return json(200,{ok:true,token:'TOKEN-1',user:{id:'u1',username:'admin',name:'Admin',role:'ROLE-ADMIN'}});
    if(p==='/api/auth/me')return json(200,me());
    if(p==='/api/state/version')return json(200,{ok:true,version:versions[co]||0});
    if(p==='/api/state'&&m==='GET')return json(200,{ok:true,state:store[co]||null,version:versions[co]||0,updatedAt:null,wipedAt:null});
    if(p==='/api/state'&&m==='PUT'){
      let body={};try{body=JSON.parse(req.postData()||'{}')}catch(e){}
      if(store[co]!==null&&body.baseVersion!=null&&+body.baseVersion!==versions[co])return json(409,{ok:false,conflict:true,version:versions[co]});
      store[co]=body.state;versions[co]=(versions[co]||0)+1;
      return json(200,{ok:true,version:versions[co]});
    }
    return json(200,{ok:true});
  };
  return {store,versions,calls,handler};
}

async function boot(browser,fake){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
  const errors=[];
  await ctx.addInitScript(()=>{
    try{
      localStorage.setItem('biobesBackend',JSON.stringify({url:'https://biobes-api.onrender.com'}));
      sessionStorage.setItem('biobesServerToken','TOKEN-1');
      sessionStorage.setItem('biobesServerUser',JSON.stringify({id:'u1',username:'admin',name:'Admin',role:'ROLE-ADMIN'}));
    }catch(e){/* kornizat pa qasje në memorie */}
  });
  await ctx.route('**/*',fake.handler);
  const page=await ctx.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,160))});
  await page.goto(LOCAL);await page.waitForFunction(()=>typeof state!=='undefined'&&state&&state.users,{timeout:30000});
  // llogari lokale admin (pa ekran kyçjeje)
  await page.evaluate(async()=>{
    const h=await hashPassword('Audit-Only-2026!');
    state.users=[{id:'AUDIT-ADMIN',username:'audit',name:'Audit lokal',role:'ROLE-ADMIN',active:true,passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false}];
    serverToken='TOKEN-1';serverUser={id:'u1',username:'admin',name:'Admin',role:'ROLE-ADMIN'};
    save();
  });
  await page.waitForTimeout(1800);
  return {ctx,page,errors};
}
const addInvoice=(page,id,invNo)=>page.evaluate(([i,n])=>{
  const pr=state.products[0]||{id:'P1',name:'Produkt'};
  state.products=[pr];
  salesInvoices().push({id:i,invoiceNumber:n,date:'2026-09-21',customer:'',currency:'ALL',exchangeRate:1,vat:20,status:'Konfirmuar',documentType:'FSH',lines:[{product:pr.id,net:100,price:120}]});
  save();render();return state.salesInvoices.length;
},[id,invNo]);
const invoiceNumbers=page=>page.evaluate(()=>salesInvoices().map(x=>x.invoiceNumber||x.id));

const launch=()=>chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});

(async()=>{
  let browser=null;
  let n=0;const step=async(name,fn)=>{n++;await fn();console.log('  ✔ '+n+'. '+name)};
  try{
    /* ---------- A) serveri i sotëm: pjesa e re mbetet e fjetur ---------- */
    console.log('\nA) Me serverin e sotëm (një kompani) — pa ndryshim sjelljeje');
    let fake=fakeServer({multi:false});browser=await launch();let env=await boot(browser,fake);
    await step('Ndërruesi i kompanisë nuk shfaqet (dormant)',async()=>{
      assert.equal(await env.page.locator('#mcChip').count(),0);
      assert.equal(await env.page.evaluate(()=>window.__mc.enabled),false);
    });
    await step('Kërkesat API nuk mbartin parametrin company',async()=>{
      const withCo=fake.calls.filter(c=>c.co);
      assert.equal(withCo.length,0,'u dërgua company: '+JSON.stringify(withCo.slice(0,3)));
    });
    await step('Ruajtja lokale mbetet çelësi i vjetër "state"',async()=>{
      const keys=await env.page.evaluate(()=>new Promise(res=>{
        const r=indexedDB.open('BioBesERP',1);
        r.onsuccess=()=>{const db=r.result,tx=db.transaction('app','readonly').objectStore('app').getAllKeys();tx.onsuccess=()=>res(tx.result)};
      }));
      assert.ok(keys.includes('state'),'çelësat: '+JSON.stringify(keys));
      assert.equal(keys.includes('state:C1'),false);
    });
    await step('Pa gabime JS në regjimin normal',async()=>{assert.deepEqual(env.errors,[])});
    await env.ctx.close();await browser.close();

    /* ---------- B) dy kompani: ndarje e plotë ---------- */
    console.log('\nB) Kur serveri shpall dy kompani — ndarje e plotë');
    fake=fakeServer({multi:true});browser=await launch();env=await boot(browser,fake);
    const page=env.page;
    await step('Ndërruesi shfaqet me kompaninë aktive dhe listën e plotë',async()=>{
      await page.waitForSelector('#mcChip .mc-btn',{timeout:15000});
      assert.match(await page.locator('#mcChip .mc-btn').innerText(),/BB — BioBes Sh\.p\.k\./);
      await page.locator('#mcChip .mc-btn').click();await page.waitForTimeout(300);
      const items=await page.locator('#mcMenu .mc-item').allInnerTexts();
      assert.equal(items.length,2);
      assert.match(items.join('|'),/Kompania Dytë/);
      await page.keyboard.press('Escape');await page.evaluate(()=>mcMenu());await page.waitForTimeout(200);
    });
    await step('Kompania C1 kalon në server me gjendje të pastër (jo të dhëna demo)',async()=>{
      assert.ok(fake.store.C1,'serveri nuk mori gjendje për C1');
      assert.equal((fake.store.C1.salesInvoices||[]).length,0);
      assert.equal((fake.store.C1.customers||[]).length,0);
      assert.equal(fake.versions.C1>=1,true);
    });
    await step('Fatura e parë në C1 → FSH-C1-1 (dërgohet vetëm te C1)',async()=>{
      await addInvoice(page,'S-C1-1','FSH-C1-1');
      await page.waitForTimeout(1600);
      assert.equal((fake.store.C1.salesInvoices||[]).length,1);
      assert.equal(fake.store.C2,(null),'C2 nuk duhet të ketë gjendje ende');
      assert.deepEqual(await invoiceNumbers(page),['FSH-C1-1']);
    });
    await step('Ndërrimi në kompaninë C2 me klikim → pamje bosh, pa të dhënat e C1',async()=>{
      await page.locator('#mcChip .mc-btn').click();await page.waitForTimeout(250);
      await page.locator('#mcMenu .mc-item',{hasText:'Kompania Dytë'}).click();
      await page.waitForTimeout(2000);
      assert.match(await page.locator('#mcChip .mc-btn').innerText(),/XX — Kompania Dytë/);
      assert.equal(await page.evaluate(()=>state.salesInvoices.length),0,'C2 shfaqi fatura të C1');
      assert.equal(await page.evaluate(()=>localStorage.getItem('biobesActiveCompany')),'C2');
      assert.ok(fake.store.C2!==null,'C2 nuk u krijua në server');
      assert.equal((fake.store.C2.salesInvoices||[]).length,0);
    });
    await step('Fatura e parë në C2 → FSH-C2-1 (numërim i pavarur, pa përplasje)',async()=>{
      await addInvoice(page,'S-C2-1','FSH-C2-1');
      await page.waitForTimeout(1600);
      assert.deepEqual(await invoiceNumbers(page),['FSH-C2-1']);
      assert.equal((fake.store.C2.salesInvoices||[]).length,1);
      assert.equal((fake.store.C1.salesInvoices||[]).length,1,'C1 u prek nga puna në C2');
      assert.equal(fake.store.C1.salesInvoices[0].invoiceNumber,'FSH-C1-1');
    });
    await step('Të dyja kompanitë ruhen veçmas në pajisje (state:C1, state:C2)',async()=>{
      const keys=await page.evaluate(()=>new Promise(res=>{
        const r=indexedDB.open('BioBesERP',1);
        r.onsuccess=()=>{const tx=r.result.transaction('app','readonly').objectStore('app').getAllKeys();tx.onsuccess=()=>res(tx.result)};
      }));
      assert.ok(keys.includes('state:C1'),'çelësat: '+JSON.stringify(keys));
      assert.ok(keys.includes('state:C2'),'çelësat: '+JSON.stringify(keys));
    });
    await step('Kthimi në C1 → të dhënat e C1 janë aty, të C2 jo',async()=>{
      await page.locator('#mcChip .mc-btn').click();await page.waitForTimeout(250);
      await page.locator('#mcMenu .mc-item',{hasText:'BioBes'}).click();
      await page.waitForTimeout(1800);
      assert.deepEqual(await invoiceNumbers(page),['FSH-C1-1']);
      assert.match(await page.locator('#mcChip .mc-btn').innerText(),/BB — BioBes/);
      assert.equal(await page.evaluate(()=>localStorage.getItem('biobesActiveCompany')),'C1');
    });
    await step('Moduli i shitjeve shfaq vetëm faturat e kompanisë aktive',async()=>{
      await page.evaluate(()=>go('sales'));await page.waitForTimeout(700);
      const txt=await page.locator('#main').innerText();
      assert.match(txt,/FSH-C1-1/);assert.equal(/FSH-C2-1/.test(txt),false);
    });
    await step('Pa gabime JS në gjithë rrjedhën multi-company',async()=>{assert.deepEqual(env.errors,[])});
    console.log('\nMulti-company: '+n+'/'+n+' hapa OK\n');
    await env.ctx.close();await browser.close();
  }catch(e){
    console.error('\n✗ Dështoi në hapin '+(n+1)+': '+e.message);
    try{if(env&&env.errors.length)console.error('Gabime JS:',env.errors.slice(0,3))}catch(_e){}
    try{if(browser)await browser.close()}catch(_e){}
    process.exit(1);
  }
})();
