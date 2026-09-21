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
  const mkCo=(id,code,name)=>({id,code,name,nipt:'',city:'',country:'AL',vatRate:20,currency:'ALL',active:true,users:0,stateVersion:0,hasState:false});
  let companies=[mkCo('C1','BB','BioBes Sh.p.k.')];
  if(opts.multi){companies.push(mkCo('C2','XX','Kompania Dytë'));store.C2=null;versions.C2=0;}
  const users=[{id:'u1',username:'admin',name:'Admin',role:'ROLE-ADMIN'},{id:'u2',username:'magazineri',name:'Magazineri',role:'ROLE-USER'}];
  const membership={u1:['C1'],u2:['C1']};
  let nextCo=2;
  // Si backend-i real: /api/auth/me kthen të gjitha kompanitë e anëtarësisë, edhe të çaktivizuara
  // (me flamurin `active`); filtrimi i të çaktivizuara bëhet në klient.
  const coPayload=()=>companies.map(c=>({id:c.id,code:c.code,name:c.name,active:c.active!==false,isDefault:c.id==='C1'}));
  const me=()=>({ok:true,user:{id:'u1',username:'admin',name:'Admin',role:'ROLE-ADMIN'},
    companies:coPayload(),defaultCompany:'C1',multiCompany:companies.filter(c=>c.active!==false).length>1});
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
      const c=companies.find(x=>x.id===co);if(c){c.stateVersion=versions[co];c.hasState=true}
      return json(200,{ok:true,version:versions[co]});
    }
    if(p==='/api/admin/companies'&&m==='GET'){
      const withU=companies.map(c=>Object.assign({},c,{
        users:Object.keys(membership).filter(u=>(membership[u]||[]).includes(c.id)).length,
        stateVersion:versions[c.id]||0,hasState:store[c.id]!=null}));
      return json(200,{ok:true,companies:withU,default:'C1'});
    }
    if(p==='/api/admin/companies'&&m==='POST'){
      let b={};try{b=JSON.parse(req.postData()||'{}')}catch(e){}
      if(String(b.name||'').length<2)return json(400,{ok:false,error:'Emri i kompanisë min 2 karaktere'});
      const id='C'+(++nextCo);
      const c={id,code:String(b.code||'').toUpperCase(),name:b.name,nipt:b.nipt||'',city:b.city||'',address:b.address||'',country:b.country||'AL',vatRate:b.vatRate==null?20:b.vatRate,currency:b.currency||'ALL',active:true,users:0,stateVersion:0,hasState:false};
      companies.push(c);store[id]=null;versions[id]=0;membership.u1=(membership.u1||[]).concat([id]);
      return json(200,{ok:true,company:c,companies});
    }
    if(p.startsWith('/api/admin/companies/')&&m==='PATCH'){
      const id=p.split('/').pop();const c=companies.find(x=>x.id===id);
      if(!c)return json(404,{ok:false,error:'Kompania nuk u gjet'});
      let b={};try{b=JSON.parse(req.postData()||'{}')}catch(e){}
      Object.keys(b).forEach(k=>{if(k==='vatRate')c.vatRate=b[k];else c[k]=b[k]});
      return json(200,{ok:true,company:c,companies});
    }
    if(p==='/api/admin/users'&&m==='GET')return json(200,{ok:true,users:users.map(u=>({id:u.id,username:u.username,name:u.name,role:u.role}))});
    if(p.match(/^\/api\/admin\/users\/[^/]+\/companies$/)&&m==='GET'){
      const uid=p.split('/')[4];
      return json(200,{ok:true,membership:(membership[uid]||[]).map(id=>({id,isDefault:id==='C1'}))});
    }
    if(p.match(/^\/api\/admin\/users\/[^/]+\/companies$/)&&m==='PUT'){
      const uid=p.split('/')[4];
      let b={};try{b=JSON.parse(req.postData()||'{}')}catch(e){}
      const ids=(b.companies||[]).map(x=>typeof x==='string'?x:x.id);
      if(!ids.length)return json(400,{ok:false,error:'Zgjidhni të paktën një kompani'});
      membership[uid]=ids;
      return json(200,{ok:true,membership:ids.map(id=>({id,isDefault:false}))});
    }
    return json(200,{ok:true});
  };
  return {store,versions,calls,handler,companies,membership,users,get membershipMap(){return membership}};
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
  // 401/409: përgjigje të pritura nga serveri i rremë (sesion + konflikt versioni që aplikacioni e zgjidh vetë me merge);
  // nuk janë gabime JS — këtu ndiqen vetëm gabimet e vërteta të faqes.
  page.on('console',m=>{if(m.type()==='error'&&!/401|409 \(Conflict\)|Failed to load resource/.test(m.text()))errors.push('console: '+m.text().slice(0,160))});
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
    await step('Pranimi i wipe-it izolohet per kompani (pa përzierje mes C1 dhe C2)',async()=>{
      // Në C1 (aktive): shenja ruhet në çelësin e C1, jo në çelësin e vjetër të përbashkët.
      await page.evaluate(()=>wipeAckSet('2026-09-21T10:00:00Z'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('biobesWipeAck:C1')),'2026-09-21T10:00:00Z');
      assert.equal(await page.evaluate(()=>localStorage.getItem('biobesWipeAck')),null);
      assert.equal(await page.evaluate(()=>wipeAckGet()),'2026-09-21T10:00:00Z');
      // Kalo në C2: nuk e shikon shenjën e C1 dhe nuk e fshin atë.
      await page.locator('#mcChip .mc-btn').click();await page.waitForTimeout(250);
      await page.locator('#mcMenu .mc-item',{hasText:'Kompania Dytë'}).click();
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(()=>window.__mc.active),'C2');
      assert.equal(await page.evaluate(()=>wipeAckGet()),null,'C2 s’duhet të shohë shenjën e C1');
      assert.equal(await page.evaluate(()=>localStorage.getItem('biobesWipeAck:C1')),'2026-09-21T10:00:00Z','shenja e C1 u fshi gabimisht');
      await page.evaluate(()=>wipeAckSet('2026-09-21T11:00:00Z'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('biobesWipeAck:C2')),'2026-09-21T11:00:00Z');
      // Kthehu në C1: shenja e C2 mbetet e paprekur, shenja e C1 lexohet përsëri.
      await page.locator('#mcChip .mc-btn').click();await page.waitForTimeout(250);
      await page.locator('#mcMenu .mc-item',{hasText:'BioBes'}).click();
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(()=>window.__mc.active),'C1');
      assert.equal(await page.evaluate(()=>localStorage.getItem('biobesWipeAck:C2')),'2026-09-21T11:00:00Z','shenja e C2 u prek nga C1');
      // (Klienti e zerojon shenjën vetëm kur serveri i kompanisë aktive s’ka shenjë wipe-i — sjellje e saktë.)
      assert.equal(await page.evaluate(()=>wipeAckGet()),null);
    });
    /* ---------- C) Moduli «Kompanitë» (Konfigurime) ---------- */
    console.log('\nC) Moduli «Kompanitë» — shtimi dhe administrimi pa prekur serverin me dorë');
    await step('Karta «Kompanitë» shfaqet te Konfigurime me listën e kompanive',async()=>{
      await page.evaluate(()=>go('settings'));await page.waitForTimeout(1200);
      await page.waitForSelector('#mcCompaniesBox table',{timeout:15000});
      const rows=await page.locator('#mcCompaniesBox tbody tr').allInnerTexts();
      assert.equal(rows.length,2,JSON.stringify(rows));
      assert.match(rows.join('|'),/BioBes/);assert.match(rows.join('|'),/Kompania Dytë/);
      assert.match(await page.locator('#mcCompaniesBox tbody tr').first().innerText(),/Aktive tani/,'kompania aktive duhet të shënohet');
    });
    await step('Shtohet kompania e tretë nga formulari (me emër, kod, monedhë)',async()=>{
      await page.locator('button[onclick="companyForm()"]').first().click();
      await page.waitForTimeout(600);
      await page.locator('#coCode').fill('TR');
      await page.locator('#coName').fill('Tregu i Ri Sh.p.k.');
      await page.locator('#coNipt').fill('L33333333B');
      await page.locator('#coCity').fill('Durrës');
      await page.locator('#coCurrency').fill('EUR');
      await page.locator('#modalFoot button',{hasText:'Ruaj'}).click();
      await page.waitForTimeout(1800);
      const rows=await page.locator('#mcCompaniesBox tbody tr').allInnerTexts();
      assert.equal(rows.length,3,JSON.stringify(rows));
      assert.match(rows.join('|'),/Tregu i Ri Sh\.p\.k\./);
      assert.match(rows.join('|'),/EUR/);
    });
    await step('Kompania e re shfaqet menjëherë në ndërruesin e krye',async()=>{
      await page.waitForTimeout(800);
      await page.locator('#mcChip .mc-btn').click();await page.waitForTimeout(300);
      const items=await page.locator('#mcMenu .mc-item').allInnerTexts();
      assert.equal(items.length,3,JSON.stringify(items));
      assert.match(items.join('|'),/TR — Tregu i Ri/);
      await page.keyboard.press('Escape');await page.evaluate(()=>mcMenu());await page.waitForTimeout(200);
    });
    await step('Kalohet në kompaninë e re dhe fatura numërohet veçmas (FSH-TR-1)',async()=>{
      await page.locator('#mcChip .mc-btn').click();await page.waitForTimeout(250);
      await page.locator('#mcMenu .mc-item',{hasText:'Tregu i Ri'}).click();
      await page.waitForTimeout(2000);
      assert.match(await page.locator('#mcChip .mc-btn').innerText(),/TR — Tregu i Ri/);
      assert.equal(await page.evaluate(()=>state.salesInvoices.length),0,'kompania e re duhet të nisë bosh');
      await addInvoice(page,'S-TR-1','FSH-TR-1');await page.waitForTimeout(1600);
      assert.deepEqual(await invoiceNumbers(page),['FSH-TR-1']);
      assert.equal((fake.store.C3.salesInvoices||[]).length,1,'fatura duhet të shkojë në C3');
      assert.equal((fake.store.C1.salesInvoices||[]).length,1,'C1 u prek gabimisht');
      assert.equal((fake.store.C2.salesInvoices||[]).length,1,'C2 u prek gabimisht');
    });
    await step('Çaktivizimi i kompanisë e nxjerr nga ndërruesi dhe nuk humb të dhënat',async()=>{
      await page.evaluate(()=>go('settings'));await page.waitForTimeout(1200);
      await page.waitForSelector('#mcCompaniesBox table',{timeout:15000});
      page.once('dialog',d=>d.accept());
      await page.locator('#mcCompaniesBox tbody tr',{hasText:'Tregu i Ri'}).locator('button',{hasText:'Çaktivizo'}).click();
      await page.waitForTimeout(2200);
      assert.equal(fake.companies.find(c=>c.id==='C3').active,false);
      const rows=await page.locator('#mcCompaniesBox tbody tr').allInnerTexts();
      assert.match(rows.join('|'),/Jo aktive/);
      const list=await page.evaluate(()=>window.__mc.companies.map(c=>c.id));
      assert.equal(list.includes('C3'),false,'kompania jo aktive s’duhet të jetë në ndërrues: '+JSON.stringify(list));
      assert.equal((fake.store.C3.salesInvoices||[]).length,1,'të dhënat e kompanisë së çaktivizuar u fshinë!');
      assert.equal(await page.evaluate(()=>window.__mc.active!=='C3'),true,'kompania aktive duhet të ketë kaluar në një kompani aktive');
    });
    await step('Anëtarësia: magazineri shtohet në kompaninë e dytë dhe hiqet nga e para',async()=>{
      // Hap kartën e përdoruesve për kompaninë e dytë (C2)
      await page.locator('#mcCompaniesBox tbody tr',{hasText:'Kompania Dytë'}).locator('button',{hasText:'Përdoruesit'}).click();
      await page.waitForTimeout(2200);
      assert.equal(await page.locator('#modalBody tbody tr').count(),2);
      assert.equal(await page.locator('#modalBody tr',{hasText:'admin'}).locator('.co-mem').isDisabled(),true,'admini s’duhet të hiqet nga kompania');
      const u2c2=page.locator('#modalBody tr',{hasText:'magazineri'}).locator('.co-mem');
      assert.equal(await u2c2.isChecked(),false,'magazineri nuk është fillimisht në C2');
      await u2c2.check();
      await page.locator('#modalFoot button',{hasText:'Ruaj anëtarësinë'}).click();
      await page.waitForTimeout(2200);
      assert.deepEqual(fake.membership.u2,['C1','C2'],'magazineri duhet të shfaqet anëtar i C1 dhe C2');
      // Tani hiqet nga C1 (lejohet, sepse i mbetet C2)
      await page.evaluate(()=>go('settings'));await page.waitForTimeout(1200);
      await page.waitForSelector('#mcCompaniesBox table',{timeout:15000});
      await page.locator('#mcCompaniesBox tbody tr',{hasText:'BioBes'}).locator('button',{hasText:'Përdoruesit'}).click();
      await page.waitForTimeout(2200);
      const u2c1=page.locator('#modalBody tr',{hasText:'magazineri'}).locator('.co-mem');
      assert.equal(await u2c1.isChecked(),true);
      await u2c1.uncheck();
      await page.locator('#modalFoot button',{hasText:'Ruaj anëtarësinë'}).click();
      await page.waitForTimeout(2200);
      assert.deepEqual(fake.membership.u2,['C2'],'magazineri duhet të mbetet vetëm në C2');
      assert.equal(fake.membership.u1.includes('C1'),true,'admini mbetet në C1');
      // Prova e mbrojtjes: heqja e kompanisë së vetme nuk pranohet
      fake.membership.u2=['C2'];
      await page.evaluate(()=>go('settings'));await page.waitForTimeout(1200);
      await page.waitForSelector('#mcCompaniesBox table',{timeout:15000});
      await page.locator('#mcCompaniesBox tbody tr',{hasText:'Kompania Dytë'}).locator('button',{hasText:'Përdoruesit'}).click();
      await page.waitForTimeout(2200);
      await page.locator('#modalBody tr',{hasText:'magazineri'}).locator('.co-mem').uncheck();
      await page.locator('#modalFoot button',{hasText:'Ruaj anëtarësinë'}).click();
      await page.waitForTimeout(2200);
      assert.deepEqual(fake.membership.u2,['C2'],'kompania e vetme e një përdoruesi nuk duhet të hiqet');
      assert.match(await page.locator('#toast').innerText(),/të paktën një kompani/);
    });
    await step('Pa gabime JS në gjithë rrjedhën multi-company',async()=>{assert.deepEqual(env.errors,[])});
    console.log('\nMulti-company: '+n+'/'+n+' hapa OK\n');
    await env.ctx.close();await browser.close();
  }catch(e){
    console.error('\n✗ Dështoi në hapin '+n+': '+e.message);
    try{if(env&&env.errors.length)console.error('Gabime JS:',env.errors.slice(0,3))}catch(_e){}
    try{if(browser)await browser.close()}catch(_e){}
    process.exit(1);
  }
})();
