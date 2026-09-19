/* Extract-i bankar CSV → veprime bankare (blloku biobes-bank-csv-v1).
   Kontrollon: parserin me strukturën e extract-it, kontrollet e shumave, deduplikimin,
   çiftimin me dokumentet, ruajtjen Draft/Konfirmuar + VK, monedhat dhe të drejtat. */
const {open}=require('./helpers.cjs');const assert=require('node:assert/strict');
const fs=require('node:fs');
let passed=0,failed=0;
async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',String((e&&e.message)||e).split('\n')[0])}}

const HEAD=`Account,Account Name:,Period
AL8920212100600000000211989,EMANUEL CELAJ FERMER,11 01 2026

No,Value Date,Reference Numbe Beneficiary/Ordering name and account number,Description,,Reference,Transacti,Processing Date,Amount,Amount Total
`;
const FOOT=(prev,cur,deb,cred)=>`\nPrevious Balance,Current Balance:,Debit sum:,Credit sum:\n${prev},${cur},${deb},${cred}\n`;
const row=(n,date,party,desc,extra,ref,tx,pdate,amt,run)=>`${n},${date},"${party}","${desc}",${extra},${ref},${tx},${pdate},"${amt} ALL",${run}\n`;
const rowEur=(n,date,party,desc,ref,tx,pdate,amt,run)=>`${n},${date},"${party}","${desc}",,${ref},${tx},${pdate},"${amt}",${run}\n`;

/* ALL: 5 veprime — pagesë e çiftuar (MP), arkëtim i çiftuar (MA), taksë, komision, dalje tjetër */
const ALL_ROWS=
 row(1,'16.01.2026','60185125000 SOKOL AGALLIU FERMER (0001360346)','P260116ACY3OP14 LIKUIDIM TOTAL BLERJEVE NE 2025 BI ME AROMATIKE 60185125000','','P260116ACY3O','Payment','16.01.2026','-530900',-25170204.46)+
 row(2,'15.01.2026','40239868582 NUTRECO SWITZERLAND GMBH (000999001)','P260115ACY4OR14 ARKETIM FATURE SHITJEJE 40239868582','','P260115ACY4O','Payment','15.01.2026','156250',-24639304.46)+
 row(3,'14.01.2026','40239868582 DREJTORIA PERGJITHSHME TATIMEVE (0101100016)','P260114AGEPOR14 LEJ390440119100005512 KONTRIBUTET E SIGURIMEVE SHOQERORE','','P260114AGEPO','TAX','14.01.2026','-517825',-24795554.46)+
 row(4,'13.01.2026','BANKA POSTALE SHPK (0051048490)','P260113KOM01 KOMISION MUAJOR I MBANJES SE LLOGARISE','','P260113KOM01','CARD FEE','13.01.2026','-1200',-24277729.46)+
 row(5,'12.01.2026','60184840675 PERSON I PANJOHUR FERMER (0001397971)','P260112AOIAOP14 LIKUIDIM PER BLERJE BIMES H AROMATIKE 60184840675','','P260112AOIAO','Payment','12.01.2026','-400000',-24276529.46);
const ALL_SUM=-1293675, ALL_PREV=-23876529.46, ALL_CUR=-25170204.46;
const CSV_ALL=HEAD+ALL_ROWS+FOOT(ALL_PREV,ALL_CUR,156250,-1449925);
/* i prishur: shuma e rreshtit 3 ndryshon → bilanci nuk mbyllet */
const CSV_BAD=HEAD+ALL_ROWS.replace('"-517825 ALL"','"-517820 ALL"')+FOOT(ALL_PREV,ALL_CUR,156250,-1449925);
/* EUR: 2 veprime për llogarinë në euro */
const CSV_EUR=HEAD.replace('AL8920212100600000000211989,EMANUEL CELAJ FERMER','AL8920212100600000000211990,EMANUEL CELAJ FERMER EUR')+
 rowEur(1,'16.01.2026','60185125000 SOKOL AGALLIU FERMER (0001360346)','P260116EUR01 PAGESE NE EUR','P260116EUR01','Payment','16.01.2026','-1,250.50',-2549.50)+
 rowEur(2,'15.01.2026','40239868582 NUTRECO SWITZERLAND GMBH (000999001)','P260115EUR02 ARKETIM NE EUR','P260115EUR02','Payment','15.01.2026','800.00',-1749.50)+
 FOOT(-1299.00,-1749.50,800,-1250.50);
/* file 2: një pagesë e re e çiftuar + një hyrje e paçiftuar */
const CSV_TWO=HEAD+
 row(1,'20.01.2026','60185134322 FLAMUR GURI FERMER (0000785821)','P260120BBY1OP14 LIKUIDIM FAT NR 4445','','P260120BBY1O','Payment','20.01.2026','-75000',-25245204.46)+
 row(2,'20.01.2026','99999999999 PERSON TJETÉR (0000000001)','P260120XX01 HYRJE E PANJOHUR','','P260120XX01','Payment','20.01.2026','9000',-25236204.46)+
 FOOT(-25170204.46,-25236204.46,9000,-75000);

(async()=>{
 fs.mkdirSync('.audit',{recursive:true});
 fs.writeFileSync('.audit/bank-all.csv',CSV_ALL);fs.writeFileSync('.audit/bank-bad.csv',CSV_BAD);
 fs.writeFileSync('.audit/bank-eur.csv',CSV_EUR);fs.writeFileSync('.audit/bank-two.csv',CSV_TWO);
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 const b=name=>p.locator('#modal').getByRole('button',{name,exact:true});
 const rowsInfo=()=>ev(()=>{const W=window.__biobesBankCsv.state();return W?W.rows.map(r=>({include:r.include,dup:r.dup,type:r.type,match:r.match&&r.match.id,why:r.matchWhy,amt:r.row.amount,cp:r.row.counterpart.name})):null});

 await step('Banka ka butonin "⬆ Extract bankar (CSV)" dhe wizard-i hapet me llogaritë aktive',async()=>{
   await ev(()=>{state.bankAccounts=[{id:'BA1',code:'B-ALL',bank:'Posta Banka',iban:'AL8920212100600000000211989',currency:'ALL',ledgerAccount:'1020',openingBalance:0,active:true},
     {id:'BA2',code:'B-EUR',bank:'Posta Banka',iban:'AL8920212100600000000211990',currency:'EUR',ledgerAccount:'1021',openingBalance:0,active:true}];
     state.payments.push({id:'MP-2026-0001',date:'2026-01-16',supplier:'S1',method:'bank',amount:530900,currency:'ALL',exchangeRate:1,note:'',status:'Konfirmuar'});
     state.payments.push({id:'MP-2026-0002',date:'2026-01-20',supplier:'S2',method:'bank',amount:75000,currency:'ALL',exchangeRate:1,note:'',status:'Konfirmuar'});
     state.customerPayments=[];state.customerPayments.push({id:'MA-2026-0001',date:'2026-01-15',customer:'C1',invoice:'',method:'bank',amount:156250,currency:'ALL',rate:1,description:'',status:'Konfirmuar'});
     save();go('banking')});
   await p.waitForTimeout(700);
   assert.equal(await p.locator('#bankCsvOpenBtn').count(),1);
   await p.locator('#bankCsvOpenBtn').click();await p.waitForTimeout(600);
   assert.match(await p.locator('#modalTitle').innerText(),/Extract bankar \(CSV\)/);
   assert.ok(await ev(()=>window.__biobesBankCsv.state().accountId==='BA1'));
 });

 await step('Parseri lexon 5 veprime, mbyll bilancin (Previous + Σ = Current, Debit/Credit) dhe gjen kundërpalët',async()=>{
   await p.setInputFiles('#bcFile','.audit/bank-all.csv');await p.waitForTimeout(900);
   const r=await rowsInfo();assert.equal(r.length,5);
   const chk=await ev(()=>{const P=window.__biobesBankCsv.state().parsed;return{checks:P.checks,meta:P.meta}});
   assert.equal(chk.checks.balanceOk,true);assert.equal(chk.checks.debitOk,true);assert.equal(chk.checks.creditOk,true);
   assert.equal(chk.checks.sum,-1293675);
   assert.match(chk.meta.account,/AL89202121006/);assert.match(chk.meta.accountName,/EMANUEL CELAJ/);
   assert.deepEqual(r.map(x=>x.amt),[-530900,156250,-517825,-1200,-400000]);
   assert.equal(r[0].cp,'SOKOL AGALLIU FERMER');
   const ib=await ev(()=>window.__biobesBankCsv.state().rows.map(x=>x.row.counterpart.iban));
   assert.deepEqual(ib.slice(0,2),['0001360346','000999001']);
   assert.deepEqual(r.map(x=>x.type),['supplierPayment','customerReceipt','tax','fee','otherOut']);
 });

 await step('Çiftimi i propozuar: MP-2026-0001 dhe MA-2026-0001 me shpjegim (shuma + data + emri); të tjerët "Pa lidhje"',async()=>{
   const r=await rowsInfo();
   assert.equal(r[0].match,'MP-2026-0001');assert.match(r[0].why,/shuma e njëjtë/);assert.match(r[0].why,/emri i subjektit/);
   assert.equal(r[1].match,'MA-2026-0001');
   assert.equal(r[2].match,null);assert.equal(r[3].match,null);assert.equal(r[4].match,null);
   const label=await ev(()=>{const sel=document.querySelectorAll('#bcReview tbody tr')[0].querySelectorAll('select')[1];return sel.selectedOptions[0].textContent});
   assert.match(label,/MP-2026-0001 — Sokol Agalliu/);
 });

 await step('Ruaj si Draft: 5 veprime bankare me importKey, palën e lidhur dhe llojet e sakta; fatura e extract-it shtohet në përshkrim',async()=>{
   await p.locator('#bcSave').click();await p.waitForTimeout(900);
   const t=await ev(()=>bankTransactions().map(x=>({id:x.id,type:x.type,party:x.party,partyType:x.partyType,status:x.status,cur:x.currency,ref:x.reference,amt:x.amount,key:x.importKey,src:x.source,cp:x.bankCounterpart})));
   assert.equal(t.length,5);
   assert.equal(t[0].type,'supplierPayment');assert.equal(t[0].party,'S1');assert.equal(t[0].partyType,'supplier');assert.equal(t[0].status,'Draft');
   assert.equal(t[0].ref,'P260116ACY3O');assert.equal(t[0].amt,530900);assert.equal(t[0].cur,'ALL');assert.ok(t[0].key);assert.match(t[0].src,/bank-all\.csv/);
   assert.equal(t[0].cp,'SOKOL AGALLIU FERMER');
   assert.equal(t[1].party,'C1');assert.equal(t[1].partyType,'customer');
   assert.equal(t[2].type,'tax');assert.equal(t[3].type,'fee');assert.equal(t[4].type,'otherOut');assert.equal(t[4].party,'');
   assert.ok(t.every(x=>/^VB-\d{4}-\d{5}$/.test(x.id)));
 });

 await step('Ri-importi i të njëjtit skedar: të 5 kapërcehen si dublikate dhe ruajtja është e çaktivizuar',async()=>{
   await ev(()=>bankCsvWizard());await p.waitForTimeout(600);
   await p.setInputFiles('#bcFile','.audit/bank-all.csv');await p.waitForTimeout(900);
   const r=await rowsInfo();assert.equal(r.length,5);assert.ok(r.every(x=>x.dup));assert.ok(r.every(x=>!x.include));
   assert.equal(await p.locator('#bcSave').isDisabled(),true);
   assert.match(await p.locator('#bcReview').innerText(),/5 dublikate të kapërcyera/);
   await ev(()=>closeModal());
 });

 await step('Skedar me bilanc të prishur: kontrolli ✗, ruajtja bllokohet deri sa admini të pranojë mospërputhjen',async()=>{
   await ev(()=>bankCsvWizard());await p.waitForTimeout(600);
   await p.setInputFiles('#bcFile','.audit/bank-bad.csv');await p.waitForTimeout(900);
   const chk=await ev(()=>window.__biobesBankCsv.state().parsed.checks);
   assert.equal(chk.balanceOk,false);assert.equal(chk.creditOk,false);assert.equal(chk.debitOk,true,'shumat debit nuk ndryshuan');
   assert.equal(await p.locator('#bcSave').isDisabled(),true);
   assert.match(await p.locator('#bcReview').innerText(),/Bilanci/);
   await p.locator('#bcOverride').check();await p.waitForTimeout(300);
   assert.equal(await p.locator('#bcSave').isDisabled(),false,'me pranimin e adminit ruajtja zhbllokohet');
   await p.locator('#bcOverride').uncheck();await p.waitForTimeout(300);
   assert.equal(await p.locator('#bcSave').isDisabled(),true);
   await ev(()=>closeModal());
 });

 await step('Ruaj + konfirmo të çiftuarat: veprimi i çiftuar merr statusin Konfirmuar dhe VK Draft në J-BANK; i paçiftuari mbetet Draft',async()=>{
   await ev(()=>bankCsvWizard());await p.waitForTimeout(600);
   await p.setInputFiles('#bcFile','.audit/bank-two.csv');await p.waitForTimeout(900);
   const r=await rowsInfo();assert.equal(r[0].match,'MP-2026-0002');assert.equal(r[1].match,null);assert.equal(r[1].type,'otherIn');
   await p.locator('#bcConfirm').click();await p.waitForTimeout(1000);
   const t=await ev(()=>bankTransactions().filter(x=>(x.source||'').includes('bank-two')).map(x=>({type:x.type,status:x.status,party:x.party,amt:x.amount})));
   assert.deepEqual(t,[{type:'supplierPayment',status:'Konfirmuar',party:'S2',amt:75000},{type:'otherIn',status:'Draft',party:'',amt:9000}]);
   const vk=await ev(id=>ensureAccounting().entries.filter(e=>e.sourceKey==='bank:'+id).map(e=>({j:e.journal,st:e.status,n:e.lines.length})),await ev(()=>bankTransactions().filter(x=>(x.source||'').includes('bank-two'))[0].id));
   assert.equal(vk.length,1);assert.equal(vk[0].j,'J-BANK');assert.equal(vk[0].st,'Draft');assert.equal(vk[0].n,2);
   const evn=await ev(()=>state.events.filter(e=>e.type==='Import extract bankar').at(-1));
   assert.match(evn.text,/bank-two\.csv: 2 veprime bankare \(1 të konfirmuara me VK\)/);
 });

 await step('Llogaria në EUR: veprimet ruhen me monedhën EUR dhe kursin e vendosur në wizard',async()=>{
   await ev(()=>bankCsvWizard());await p.waitForTimeout(600);
   await ev(()=>{const s=document.getElementById('bcAccount');s.value='BA2';s.dispatchEvent(new Event('change',{bubbles:true}))});
   await p.waitForTimeout(300);
   await p.setInputFiles('#bcFile','.audit/bank-eur.csv');await p.waitForTimeout(900);
   const chk=await ev(()=>window.__biobesBankCsv.state().parsed.checks);
   assert.equal(chk.balanceOk,true,'bilanci në EUR mbyllet (presje dhjetore dhe pikë mijëshe)');
   const r=await rowsInfo();assert.deepEqual(r.map(x=>x.amt),[-1250.5,800]);
   assert.ok(await p.locator('#bcRate').count(),1,'fusha e kursit shfaqet për monedhat jo-ALL');
   await p.locator('#bcRate').fill('100');
   await ev(()=>{const e=document.getElementById('bcRate');e.dispatchEvent(new Event('change',{bubbles:true}))});
   await p.locator('#bcSave').click();await p.waitForTimeout(900);
   const t=await ev(()=>bankTransactions().filter(x=>x.currency==='EUR').map(x=>({amt:x.amount,rate:x.rate,cur:x.currency,type:x.type})));
   assert.equal(t.length,2);assert.ok(t.every(x=>x.rate===100));assert.deepEqual(t.map(x=>x.amt),[1250.5,800]);
 });

 await step('ROLE-USER pa të drejtën edit në Banka: butoni fshehet dhe wizard-i refuzohet',async()=>{
   await ev(async()=>{const h=await hashPassword('Prove-2026!');state.users.push({id:'U-BC',username:'bc-user',name:'Bankier',role:'ROLE-USER',active:true,
     passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false,rights:{v:2,modules:{banking:['view'],dashboard:['view']}}});
     save();closeModal();logoutUser()});
   await p.waitForFunction(()=>!!document.getElementById('loginLock'));
   await p.locator('#loginName').fill('bc-user');await p.locator('#loginPass').fill('Prove-2026!');await p.locator('#loginPass').press('Enter');
   await p.waitForFunction(()=>!document.getElementById('loginLock'));await p.waitForTimeout(600);
   await ev(()=>go('banking'));await p.waitForTimeout(700);
   assert.equal(await p.locator('#bankCsvOpenBtn').count(),0,'butoni i importit nuk shfaqet pa të drejtën edit');
   await ev(()=>{window.__t=[];const bb=toast;toast=m=>{window.__t.push(m);return bb(m)}});
   await ev(()=>bankCsvWizard());await p.waitForTimeout(400);
   assert.match(await ev(()=>window.__t.at(-1)),/Nuk keni të drejtë/);
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
