/* tests/activity-actor-audit.cjs — Aktiviteti pasqyron përdoruesin që kreu veprimin (biobes-activity-actor-v1).

   Bug-u i raportuar: te "Veprimet e fundit / Auditimi" kolona «Përdoruesi» tregonte gjithmonë
   "Admin", edhe kur faturat/dokumentet i krijonin përdorues të tjerë.

   Provohet në desktop (1440×1000) dhe telefon (390×844):
   • VULOSJA: çdo ngjarje e re merr user/userName/userRole/at të sesionit aktual — pa ndryshuar
     asnjë nga ~130 vendet ekzistuese që shtojnë ngjarje (hook mbi state.events.push).
   • SHFAQJA: kolona «Përdoruesi» tregon emrin real + rolin; askund nuk shkruhet më "Admin".
   • NGJARJET E VJETRA: lexohen nga dokumenti i referencës (createdBy/createdByName), roli i
     ruajtur kthehet në "Administrator", ndërsa ato pa asnjë gjurmë shfaqen "—".
   • FILTRAT: dropdown «Përdoruesi» (të gjithë / veprimet e mia / pa autor / secili emër),
     kërkimi live gjen emrin e përdoruesit, numëruesi i rezultateve përditësohet.
   • EKSPORTI XLSX: kolona «Përdoruesi» mban emrat realë.
   • PËRDORUES TË NDRYSHËM: veprimet e "Ana Kola" (ROLE-ADMIN) dhe "Besnik Rama" (ROLE-USER)
     regjistrohen me autorin e tyre; përshëndetja e panelit dhe «Kush e priti mallin?» ndjekin
     sesionin; raportet e shitjes nuk shpikin më shitës "Admin".
   • MBIJETESA: pas reload() hook-u rikthehet dhe autorët mbeten të ruajtur.
   • 0 gabime konzole dhe 0 gabime të brendshme të modulit.

   Nisja: python3 -m http.server 8000 --bind 0.0.0.0   →   npm run test:activity-actor */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');

(async()=>{
 let passed=0,failed=0;
 const modes=[[false,'desktop 1440×1000'],[true,'telefon 390×844']];
 for(const [mobile,label] of modes){
  console.log('\n========================= '+label+' =========================');
  const {browser,page:p,errors}=await open(mobile);
  const ev=(f,...a)=>p.evaluate(f,...a);
  const b=name=>p.locator('#modal').getByRole('button',{name,exact:true});
  /* select-et e sistemit fshihen dhe zëvendësohen nga kërkimi live (.global-live-search):
     zgjedhja bëhet me UI-n real (choose) ose duke vendosur vlerën + ngjarjen change (pick) */
  const pick=async(sel,value)=>{await ev(([s,v])=>{const el=document.querySelector(s);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,value]);await p.waitForTimeout(400)};
  /* dropdown-i «Përdoruesi» përdoret me UI-n real: kliko kërkimin live → zgjidh opsionin */
  const pickUser=async value=>{
    const wrap=p.locator('#activityUser').locator('xpath=preceding-sibling::*[contains(concat(" ",normalize-space(@class)," ")," global-live-search ")][1]');
    const label=await ev(v=>{const o=[...document.getElementById('activityUser').options].find(x=>x.value===v);return o?o.textContent.trim():''},value);
    const inp=wrap.locator('input');
    await inp.click();await p.waitForTimeout(200);
    await inp.fill(label);await p.waitForTimeout(250);
    await wrap.locator('.global-live-option[data-value="'+value+'"]').first().click();
    await p.waitForTimeout(450);
    assert.equal(await ev(()=>document.getElementById('activityUser').value),value,'vlera e dropdown-it nuk u vendos');
    assert.equal((await inp.inputValue()).trim(),label,'kërkimi live nuk tregon zgjedhjen');
  };
  async function step(name,fn){
    try{await fn();passed++;console.log('ok   -',name)}
    catch(e){failed++;const m=String(e.message||e).split('\n');
      console.log('FAIL -',name,'\n       → '+m.slice(0,12).join('\n         ').slice(0,1400))}
  }
  const login=async(user,pass)=>{
    await ev(()=>logoutUser());
    await p.waitForFunction(()=>!!document.getElementById('loginLock'),null,{timeout:9000});
    await p.locator('#loginName').fill(user);await p.locator('#loginPass').fill(pass);
    await p.locator('#loginLock button').filter({hasText:'Hyr'}).click();
    await p.waitForFunction(()=>!document.getElementById('loginLock'),null,{timeout:20000});
    await p.waitForTimeout(500);
    await ev(()=>window.__biobesActivityActorV1.installHooks());
  };
  const dashboard=async()=>{await ev(()=>go('dashboard'));await p.waitForTimeout(600)};
  const cells=()=>ev(()=>[...document.querySelectorAll('#activityRows [data-activity-row]')].map(r=>{
    const c=r.cells[r.cells.length-1];
    return {text:c.textContent.trim(),actor:c.dataset.actor||'',role:c.dataset.actorRole||'',
            src:c.dataset.actorSrc||'',title:c.title||'',ref:(r.cells[2].textContent||'').trim(),
            visible:r.style.display!=='none',search:r.dataset.search||''}}));
  const allPeriod=()=>ev(()=>setActivityPeriod('all',document.querySelector('[data-period="all"]')));

  /* ndihmëse në faqe: kap eksportin XLSX dhe lexo qelizat e autorit */
  await ev(()=>{
    window.__T={xlsx:null};
    const baseX=window.makeXlsx;
    window.makeXlsx=function(name,head,rows){window.__T.xlsx={name,head,rows};try{return baseX&&baseX(name,head,rows)}catch(e){return null}};
    window.__T.legacyPush=function(list){ /* shton ngjarje pa e vulosur (simulon të dhëna të vjetra) */
      list.forEach(e=>Array.prototype.push.call(state.events,e));
    };
  });

  await step('moduli ngarkohet: API, hook mbi state.events, autori i sesionit lexohet',async()=>{
    const r=await ev(()=>({v:window.__biobesActivityActorV1.version,
      hook:!!(state.events&&state.events.__bbActivityActor),
      rep:typeof window.activityActorReport==='function',
      now:window.__biobesActivityActorV1.actorNow(),
      wrapped:['dashboardActivityHtml','filterActivity','exportFilteredActivity','weighForm','salesReportData'].map(k=>!!(window[k]&&window[k].__bbActor))}));
    assert.equal(r.v,'1.0.0');assert.ok(r.hook,'hook-u nuk është instaluar mbi state.events');
    assert.ok(r.rep,'mungon activityActorReport()');
    assert.equal(r.now.name,'Audit lokal');assert.equal(r.now.id,'AUDIT-ADMIN');
    assert.deepEqual(r.wrapped,[true,true,true,true,true],'funksionet e mbështjella: '+r.wrapped.join(','));
  });

  await step('krijohen dy përdorues të tjerë: Ana Kola (ROLE-ADMIN) dhe Besnik Rama (ROLE-USER)',async()=>{
    const n=await ev(async()=>{
      const h1=await hashPassword('Ana-Only-2026!'),h2=await hashPassword('Bes-Only-2026!');
      state.users.push(
        {id:'AUDIT-ANA',username:'ana',name:'Ana Kola',role:'ROLE-ADMIN',active:true,passwordHash:h1.hash,passwordSalt:h1.salt,passwordIterations:h1.iterations,mustChangePassword:false,failedAttempts:0},
        {id:'AUDIT-BES',username:'bes',name:'Besnik Rama',role:'ROLE-USER',active:true,passwordHash:h2.hash,passwordSalt:h2.salt,passwordIterations:h2.iterations,mustChangePassword:false,failedAttempts:0});
      save();return state.users.map(u=>u.name)});
    assert.ok(n.includes('Ana Kola')&&n.includes('Besnik Rama'),n.join(','));
  });

  const expAdmin=mobile?null:{};
  if(!mobile){
    await step('veprim real si "Audit lokal" (shpenzim i konfirmuar) → ngjarja vuloset me autorin e sesionit',async()=>{
      await ev(()=>{go('expenses');expenseForm('',{preset:{method:'unpaid',supplierId:'S2',category:'TRANSPORT',item:'Transport mallrash',description:'Transport Durrës–Fier',invoiceNo:'TR-AUDIT',total:12000,vatRate:0}})});
      await p.waitForTimeout(400);
      await b('Ruaj & konfirmo').click();await p.waitForTimeout(800);
      const r=await ev(()=>{
        closeModal();
        const d=state.expenses.find(x=>x.invoiceNo==='TR-AUDIT');
        const e=state.events.filter(x=>x.ref===d.number&&x.type==='Shpenzim').pop();
        return {num:d.number,docCreatedBy:d.createdBy,docCreatedByName:d.createdByName||'',ev:e&&{user:e.user,userName:e.userName,userRole:e.userRole,at:e.at,date:e.date,text:(e.text||'').slice(0,40)}}});
      assert.ok(r.num,'shpenzimi nuk u krijua');
      assert.ok(r.ev,'ngjarja e shpenzimit nuk u gjet');
      assert.equal(r.ev.userName,'Audit lokal','autori i ngjarjes: '+JSON.stringify(r.ev));
      assert.equal(r.ev.user,'AUDIT-ADMIN');
      assert.equal(r.ev.userRole,'ROLE-ADMIN');
      assert.match(r.ev.at||'',/^\d{4}-\d{2}-\d{2}T/,'koha e saktë e ngjarjes mungon');
      expAdmin.num=r.num;
      console.log('       '+r.num+' → autori "'+r.ev.userName+'" · dokumenti createdBy='+(r.docCreatedBy||'—'));
    });

    await step('tabela e Aktivitetit: kolona «Përdoruesi» tregon "Audit lokal" + rolin, askund "Admin"',async()=>{
      await dashboard();await allPeriod();await p.waitForTimeout(300);
      const c=await cells();
      assert.ok(c.length>=1,'nuk ka rreshta në aktivitet');
      assert.equal(c.filter(x=>x.text==='Admin').length,0,'ka ende rreshta me "Admin" të fiksuar');
      const mine=c.find(x=>x.ref===expAdmin.num);
      assert.ok(mine,'rreshti i '+expAdmin.num+' nuk u gjet');
      assert.equal(mine.actor,'Audit lokal');
      assert.equal(mine.role,'Administrator');
      assert.equal(mine.src,'event');
      assert.ok(/Regjistruar nga/.test(mine.title),mine.title);
      assert.ok(c.every(x=>x.actor&&x.actor!=='—'||x.src==='unknown'),'ka rresht pa autor të lexueshëm');
      console.log('       '+c.length+' rreshta · '+[...new Set(c.map(x=>x.actor))].join(' / '));
    });

    await step('përshëndetja e panelit dhe «Kush e priti mallin?» ndjekin përdoruesin e sesionit',async()=>{
      const h=await p.locator('#main h1').first().innerText();
      assert.ok(h.includes('Mirë se vini, Audit lokal'),h);
      assert.ok(!h.includes('Mirë se vini, Admin'),h);
      await ev(()=>weighForm());await p.waitForTimeout(300);
      const rec=await p.locator('#wReceiver').inputValue();
      assert.equal(rec,'Audit lokal','«Kush e priti mallin?» = '+rec);
      await ev(()=>closeModal());await p.waitForTimeout(200);
    });

    await step('filtri «Përdoruesi»: dropdown i dukshëm (kërkim live), opsionet, zgjedhja dhe numëruesi',async()=>{
      await dashboard();await allPeriod();await p.waitForTimeout(300);
      const w=await ev(()=>{
        const sel=document.getElementById('activityUser');
        const wrap=sel.previousElementSibling;
        const inp=wrap&&wrap.classList.contains('global-live-search')?wrap.querySelector('input'):null;
        const r=inp?inp.getBoundingClientRect():null;
        return {opts:[...sel.options].map(o=>o.textContent),values:[...sel.options].map(o=>o.value),
                widget:!!(wrap&&wrap.classList.contains('global-live-search')),
                visible:!!(r&&r.width>40&&getComputedStyle(inp).visibility!=='hidden'),
                placeholder:inp?inp.placeholder:''}});
      assert.ok(w.widget,'dropdown-i nuk u mbështoll nga kërkimi live i sistemit');
      assert.ok(w.visible,'kërkimi live i dropdown-it nuk është i dukshëm për përdoruesin');
      assert.equal(w.opts[0],'Të gjithë përdoruesit',w.opts.join(','));
      assert.ok(w.opts.some(o=>o.includes('Veprimet e mia (Audit lokal)')),w.opts.join(','));
      assert.ok(w.values.includes('Audit lokal'),w.values.join(','));
      const total=(await cells()).filter(x=>x.visible).length;
      await pickUser('Audit lokal');
      let c=await cells();
      assert.ok(c.filter(x=>x.visible).length>=1,'asnjë rresht për Audit lokal');
      assert.ok(c.filter(x=>x.visible).every(x=>x.actor==='Audit lokal'),'filtri la rreshta të tjerë të dukshëm');
      assert.ok(c.filter(x=>x.visible).length<=total);
      const cnt=(await p.locator('#activityCount').innerText()).trim();
      assert.match(cnt,/^\d+ rezultate$/,'numëruesi: '+cnt);
      await pick('#activityUser','');
      assert.equal((await cells()).filter(x=>x.visible).length,total,'filtri nuk u çaktivizua');
    });

    await step('kërkimi live gjen veprimet sipas emrit të përdoruesit',async()=>{
      await dashboard();await allPeriod();await p.waitForTimeout(300);
      await p.locator('#activitySearch').fill('audit lokal');await p.waitForTimeout(500);
      let c=await cells();
      assert.ok(c.filter(x=>x.visible).length>=1,'kërkimi me emrin e përdoruesit nuk gjeti asgjë');
      assert.ok(c.filter(x=>x.visible).every(x=>x.actor==='Audit lokal'));
      await p.locator('#activitySearch').fill('administrator');await p.waitForTimeout(500);
      c=await cells();
      assert.ok(c.filter(x=>x.visible).length>=1,'kërkimi me rolin nuk gjeti asgjë');
      await p.locator('#activitySearch').fill('');await p.waitForTimeout(400);
    });

    await step('ngjarjet e vjetra pa autor: lexohen nga dokumenti, nga roli i ruajtur, ose shfaqen "—"',async()=>{
      const r=await ev(()=>{
        const today=new Date().toISOString().slice(0,10);
        const cust=(state.customers[0]||{}).id,prod=(state.products[0]||{}).id;
        state.salesInvoices.push(
          {id:'SI-LEG-1',invoiceNumber:'FSH-LEG-1',status:'Konfirmuar',date:today,customer:cust,product:prod,qty:100,price:5,currency:'ALL',exchangeRate:1,createdByName:'Ana Kola',createdBy:'AUDIT-ANA'},
          {id:'SI-LEG-2',invoiceNumber:'FSH-LEG-2',status:'Konfirmuar',date:today,customer:cust,product:prod,qty:50,price:4,currency:'ALL',exchangeRate:1,createdBy:'ROLE-ADMIN'});
        window.__T.legacyPush([
          {date:'20.09.2026 09:15',type:'Faturë shitjeje',ref:'FSH-LEG-1',text:'Ngjarje e vjetër me dokument'},
          {date:'19.09.2026 11:20',type:'Faturë shitjeje',ref:'FSH-LEG-2',text:'Ngjarje e vjetër me rol'},
          {date:'18.09.2026 08:05',type:'Rregullim bazë',ref:'',text:'Ngjarje e vjetër pa gjurmë'}]);
        save();return state.events.length});
      assert.ok(r>=4,'ngjarjet e vjetra nuk u shtuan');
      await dashboard();await allPeriod();await p.waitForTimeout(400);
      const c=await cells();
      const doc=c.find(x=>x.ref==='FSH-LEG-1'),role=c.find(x=>x.ref==='FSH-LEG-2'),none=c.find(x=>x.text.includes('pa gjurmë')||x.search.includes('pa gjurmë'));
      assert.ok(doc&&role&&none,'rreshtat e ngjarjeve të vjetra mungojnë');
      assert.equal(doc.actor,'Ana Kola');assert.equal(doc.src,'document');
      assert.equal(role.actor,'Administrator');assert.equal(role.src,'role');
      assert.equal(none.actor,'—');assert.equal(none.src,'unknown');
      assert.ok(/para këtij rregullimi/.test(none.title),none.title);
      assert.equal(c.filter(x=>x.text==='Admin').length,0);
    });

    await step('plotësimi i dokumentit: ngjarja e re i jep dokumentit autorin që mungon (createdBy/createdByName)',async()=>{
      const r=await ev(()=>{
        const w={id:'PS-PROVA-1',date:new Date().toISOString().slice(0,10),supplier:(state.suppliers[0]||{}).id,
                 product:(state.products[0]||{}).id,status:'Draft',receiver:'Dikush tjetër'};
        state.weighings.push(w);
        state.events.push({date:new Date().toLocaleString('sq-AL'),type:'Peshim',ref:'PS-PROVA-1',text:'Provë e plotësimit të dokumentit'});
        const e=state.events[state.events.length-1];
        return {ev:e.userName,docName:w.createdByName,docBy:w.createdBy,role:w.createdByRole,receiver:w.receiver,
                stamped:window.__biobesActivityActorV1.report().stats.documentsStamped};
      });
      assert.equal(r.ev,'Audit lokal');
      assert.equal(r.docName,'Audit lokal','dokumenti nuk mori createdByName');
      assert.equal(r.docBy,'Audit lokal');assert.equal(r.role,'ROLE-ADMIN');
      assert.equal(r.receiver,'Dikush tjetër','fusha «Pranuar nga» nuk duhet prekur');
      assert.ok(r.stamped>=1,'statistika e plotësimit: '+r.stamped);
      await dashboard();await allPeriod();await p.waitForTimeout(300);
      const row=(await cells()).find(x=>x.ref==='PS-PROVA-1');
      assert.ok(row,'rreshti i peshimit nuk u gjet');
      assert.equal(row.actor,'Audit lokal');assert.equal(row.src,'event');
    });

    await step('ngjarje e vjetër shitjeje: «Përdoruesi» nuk merr "Admin" nga fusha e shitësit',async()=>{
      await ev(()=>{
        const today=new Date().toISOString().slice(0,10);
        state.salesInvoices.push({id:'SI-LEG-3',invoiceNumber:'FSH-LEG-3',status:'Konfirmuar',date:today,
          customer:(state.customers[0]||{}).id,product:(state.products[0]||{}).id,qty:10,price:3,
          currency:'ALL',exchangeRate:1,salesperson:'Admin'});
        window.__T.legacyPush([{date:'17.09.2026 09:00',type:'Faturë shitjeje',ref:'FSH-LEG-3',text:'Ngjarje e vjetër me shitës të pavërtetë'}]);
        save();
      });
      await dashboard();await allPeriod();await p.waitForTimeout(400);
      const row=(await cells()).find(x=>x.ref==='FSH-LEG-3');
      assert.ok(row,'rreshti i FSH-LEG-3 nuk u gjet');
      assert.equal(row.actor,'—','shitësi "Admin" u shfaq si autor');
      assert.equal(row.src,'unknown');
      const rep=await ev(()=>{const x=salesReportData().find(y=>y.invoice==='FSH-LEG-3');return x?x.salesperson:null});
      assert.equal(rep,'—','raporti i shitjes: '+rep);
    });

    await step('eksporti XLSX i auditimit: kolona «Përdoruesi» mban emrat realë, jo "Admin"',async()=>{
      await allPeriod();await p.waitForTimeout(200);
      await ev(()=>{window.__T.xlsx=null;exportFilteredActivity()});await p.waitForTimeout(300);
      const x=await ev(()=>window.__T.xlsx);
      assert.ok(x,'makeXlsx nuk u thirr');
      assert.deepEqual(x.head,['Data/Ora','Veprimi','Dokumenti','Përshkrimi','Moduli','Përdoruesi']);
      const users=x.rows.map(r=>String(r[5]||'').trim());
      assert.ok(users.length>=4,'rreshta të eksportuar: '+users.length);
      assert.equal(users.filter(u=>u==='Admin').length,0,'eksporti përmban ende "Admin": '+users.join('|'));
      assert.ok(users.includes('Audit lokal'),users.join('|'));
      assert.ok(users.includes('Ana Kola'),users.join('|'));
      assert.ok(users.includes('—'),users.join('|'));
      assert.ok(!users.some(u=>u.includes('\n')),'emri i përdoruesit del me rresht të dytë në Excel');
      console.log('       '+users.length+' rreshta · '+[...new Set(users)].join(' / '));
    });

    await step('raportet e shitjes: «Shitësi» vjen nga autori i faturës, nuk shpiket më "Admin"',async()=>{
      const r=await ev(()=>{
        const rows=salesReportData();
        const pick=n=>{const x=rows.find(y=>y.invoice===n);return x?x.salesperson:null};
        return {leg1:pick('FSH-LEG-1'),leg2:pick('FSH-LEG-2'),anyAdmin:rows.filter(x=>x.salesperson==='Admin').length,rows:rows.length}});
      assert.ok(r.rows>=2,'nuk ka rreshta në raportin e shitjes');
      assert.equal(r.leg1,'Ana Kola','shitësi i FSH-LEG-1: '+r.leg1);
      assert.equal(r.leg2,'—','shitësi i FSH-LEG-2: '+r.leg2);
      assert.equal(r.anyAdmin,0,'raporti ka ende shitës "Admin"');
    });

    await step('hyrje si "Ana Kola": veprimi i saj regjistrohet me emrin e saj në ngjarje dhe në tabelë',async()=>{
      await login('ana','Ana-Only-2026!');
      const who=await ev(()=>window.__biobesActivityActorV1.actorNow());
      assert.equal(who.name,'Ana Kola');assert.equal(who.role,'ROLE-ADMIN');
      await ev(()=>{go('expenses');expenseForm('',{preset:{method:'unpaid',supplierId:'S2',category:'TRANSPORT',item:'Transport mallrash',description:'Transport nga Ana',invoiceNo:'TR-ANA',total:9000,vatRate:0}})});
      await p.waitForTimeout(400);
      await b('Ruaj & konfirmo').click();await p.waitForTimeout(800);
      const r=await ev(()=>{
        closeModal();
        const d=state.expenses.find(x=>x.invoiceNo==='TR-ANA');
        const e=state.events.filter(x=>x.ref===d.number&&x.type==='Shpenzim').pop();
        return {num:d.number,ev:e&&{userName:e.userName,user:e.user,userRole:e.userRole}}});
      assert.equal(r.ev.userName,'Ana Kola','autori: '+JSON.stringify(r.ev));
      assert.equal(r.ev.user,'AUDIT-ANA');assert.equal(r.ev.userRole,'ROLE-ADMIN');
      await dashboard();await allPeriod();await p.waitForTimeout(300);
      const c=await cells();
      const row=c.find(x=>x.ref===r.num);
      assert.ok(row,'rreshti i '+r.num+' nuk u gjet');
      assert.equal(row.actor,'Ana Kola');assert.equal(row.role,'Administrator');
      assert.equal(c.filter(x=>x.text==='Admin').length,0,'ka ende "Admin" në tabelë');
      assert.ok(c.some(x=>x.actor==='Audit lokal'),'veprimet e administratorit humbën nga tabela');
      const h=await p.locator('#main h1').first().innerText();
      assert.ok(h.includes('Mirë se vini, Ana Kola'),h);
      await ev(()=>weighForm());await p.waitForTimeout(300);
      assert.equal(await p.locator('#wReceiver').inputValue(),'Ana Kola');
      await ev(()=>closeModal());await p.waitForTimeout(200);
      console.log('       '+r.num+' → "Ana Kola" · gjithsej '+[...new Set(c.map(x=>x.actor))].join(' / '));
    });

    await step('filtri «Përdoruesi» ndan veprimet e dy përdoruesve',async()=>{
      await dashboard();await allPeriod();await p.waitForTimeout(300);
      const opts=await ev(()=>[...document.getElementById('activityUser').options].map(o=>o.value));
      assert.ok(opts.includes('Ana Kola')&&opts.includes('Audit lokal'),opts.join(','));
      await pickUser('Ana Kola');
      let c=await cells();
      assert.ok(c.filter(x=>x.visible).length>=1);
      assert.ok(c.filter(x=>x.visible).every(x=>x.actor==='Ana Kola'),'u shfaqën rreshta të tjerë');
      await pick('#activityUser','Audit lokal');
      c=await cells();
      assert.ok(c.filter(x=>x.visible).every(x=>x.actor==='Audit lokal'));
      await pick('#activityUser','__unknown');
      c=await cells();
      assert.ok(c.filter(x=>x.visible).every(x=>x.actor==='—'),'filtri "pa autor" nuk funksionon');
      await pick('#activityUser','');
    });

    await step('përdorues me ROLE-USER: ngjarja e tij vuloset me "Besnik Rama"',async()=>{
      await login('bes','Bes-Only-2026!');
      const r=await ev(()=>{
        const who=window.__biobesActivityActorV1.actorNow();
        state.events.push({date:new Date().toLocaleString('sq-AL'),type:'Provë përdoruesi',ref:'',text:'Veprim i regjistruar nga përdorues i thjeshtë'});
        const e=state.events[state.events.length-1];
        return {who:who.name,ev:{userName:e.userName,user:e.user,userRole:e.userRole},
                shown:window.__biobesActivityActorV1.resolveActor(e)}});
      assert.equal(r.who,'Besnik Rama');
      assert.equal(r.ev.userName,'Besnik Rama','autori: '+JSON.stringify(r.ev));
      assert.equal(r.ev.user,'AUDIT-BES');assert.equal(r.ev.userRole,'ROLE-USER');
      assert.equal(r.shown.role,'Përdorues','roli i shfaqur: '+r.shown.role);
    });

    await step('kthimi te administratori: të dy autorët duken së bashku, "Admin" nuk shfaqet askund',async()=>{
      await login('audit','Audit-Only-2026!');
      await dashboard();await allPeriod();await p.waitForTimeout(400);
      const c=await cells();
      const names=[...new Set(c.map(x=>x.actor))];
      assert.ok(names.includes('Audit lokal')&&names.includes('Ana Kola')&&names.includes('Besnik Rama'),names.join(','));
      assert.equal(c.filter(x=>x.text==='Admin').length,0);
      assert.equal((await ev(()=>document.getElementById('main').innerHTML.match(/>Admin</g))||[]).length,0,'teksti "Admin" shfaqet ende në panel');
      console.log('       autorë në tabelë: '+names.join(' / '));
    });

    await step('para reload: ngjarjet e reja janë vulosur nga hook-u (stats.stamped)',async()=>{
      const r=await ev(()=>window.__biobesActivityActorV1.report());
      assert.equal(r.stats.errors,0,JSON.stringify(r.stats));
      assert.ok(r.stats.stamped>=3,'vetëm '+r.stats.stamped+' ngjarje të vulosura');
      assert.ok(r.stats.fromEvent>=3,'autorët nuk lexohen nga ngjarja');
      console.log('       '+JSON.stringify(r.stats));
    });

    await step('mbijetesa: pas reload() hook-u rikthehet dhe autorët mbeten të ruajtur',async()=>{
      await p.reload();
      await p.waitForFunction(()=>typeof state!=='undefined'&&state?.events?.length,null,{timeout:30000});
      await p.waitForTimeout(1200);
      const r=await ev(()=>({hook:!!(state.events&&state.events.__bbActivityActor),
        ana:(state.events.filter(x=>x.userName==='Ana Kola').length),
        bes:(state.events.filter(x=>x.userName==='Besnik Rama').length),
        aud:(state.events.filter(x=>x.userName==='Audit lokal').length)}));
      assert.ok(r.hook,'hook-u nuk u riinstalua pas reload');
      assert.ok(r.ana>=1&&r.bes>=1&&r.aud>=1,'autorët humbën pas ruajtjes: '+JSON.stringify(r));
      await dashboard();await allPeriod();await p.waitForTimeout(400);
      const c=await cells();
      assert.equal(c.filter(x=>x.text==='Admin').length,0);
      assert.ok(c.some(x=>x.actor==='Ana Kola')&&c.some(x=>x.actor==='Audit lokal'));
    });
  }else{
    await step('telefon: hook-u, tabela e aktivitetit dhe përshëndetja pa "Admin"',async()=>{
      await dashboard();await allPeriod();await p.waitForTimeout(400);
      const c=await cells();
      assert.ok(c.length>=1,'nuk ka rreshta në aktivitet');
      assert.equal(c.filter(x=>x.text==='Admin').length,0);
      assert.ok(c.every(x=>x.actor!==''),'ka rresht pa data-actor');
      const h=await p.locator('#main h1').first().innerText();
      assert.ok(h.includes('Mirë se vini, Audit lokal'),h);
      assert.ok(await ev(()=>!!document.getElementById('activityUser')),'mungon filtri «Përdoruesi»');
    });
    await step('telefon: veprim i ruajtur nga sesioni merr autorin',async()=>{
      const r=await ev(()=>{
        state.events.push({date:new Date().toLocaleString('sq-AL'),type:'Provë telefoni',ref:'',text:'Ngjarje nga telefoni'});
        const e=state.events[state.events.length-1];return {userName:e.userName,user:e.user}});
      assert.equal(r.userName,'Audit lokal',JSON.stringify(r));
      await dashboard();await allPeriod();await p.waitForTimeout(400);
      const c=await cells();
      assert.ok(c.some(x=>x.actor==='Audit lokal'&&x.search.includes('provë telefoni')),'rreshti i ri nuk tregon autorin');
    });
  }

  await step('diagnostika: 0 gabime të brendshme, statistika të mbushura, 0 gabime konzole',async()=>{
    const r=await ev(()=>window.activityActorReport());
    assert.equal(r.stats.errors,0,'gabime të brendshme: '+JSON.stringify(r.stats));
    assert.equal(r.stats.mismatch,0,'numri i qelizave nuk përputhet me ngjarjet');
    assert.ok(r.hookInstalled,'hook-u nuk është aktiv');
    assert.ok(r.stringPassOk,'zëvendësimi i kolonës «Përdoruesi» nuk u krye në HTML');
    assert.equal(r.rowsInTable>=1,true,'tabela e aktivitetit është bosh');
    assert.ok(r.events>=(mobile?2:4),'ngjarje: '+r.events);
    if(!mobile)assert.ok(r.eventsWithoutActor>=1,'pritet të paktën një ngjarje e vjetër pa autor');
    assert.ok(r.byUser['Audit lokal']>=1,JSON.stringify(r.byUser));
    console.log('       '+JSON.stringify({events:r.events,paAutor:r.eventsWithoutActor,byUser:r.byUser,stats:r.stats}));
    assert.deepEqual(errors,[],'gabime konzole: '+errors.slice(0,3).join(' | '));
  });

  await browser.close();
 }
 console.log('\n'+passed+' kaluan, '+failed+' dështuan');
 process.exitCode=failed?1:0;
})().catch(e=>{console.error('AUDIT CRASH:',e);process.exit(1)});
