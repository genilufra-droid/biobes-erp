/* Extract-i bankar CSV → veprime bankare (blloku biobes-bank-csv-v1).
   Kontrollon: parserin me strukturën e extract-it, kontrollet e shumave, deduplikimin,
   çiftimin me dokumentet, ruajtjen Draft/Konfirmuar + VK, monedhat dhe të drejtat. */
const {open}=require('./helpers.cjs');const assert=require('node:assert/strict');
const fs=require('node:fs');
let passed=0,failed=0;
async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',String((e&&e.message)||e).split('\n').slice(0,5).join('\n       '))}}

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

/* Extract REAL nga Posta Banka (LEK), i rindërtuar nga PDF-ja 3-fletëshe e pronarit:
   renditje zbritëse (më e reja lart), saldi rrjedhës = balanca pas rreshtit, footer Previous/Current
   NUK ndjek rregullën Previous + Σ = Current → kontrolli duhet të kalojë me zinxhirin e saldove. */
const REAL_ROWS=[
 [1,'16.01.2026','60185125000 ANA SHTYLLA FERMER (0001360346)','P260116ACY3OP14 LIKUJDIM TOTAL BLERJEVE NE 2025 BI ME AROMATIKE DHE MJEKESORE.60185125000','','P260116ACY3O','Payment','16.01.2026','-530900',-25170204.46],
 [2,'16.01.2026','60185134322 ZDRAVA 07 SHPK (0000785821)','P260116ADSHOP14 LIKUJDIM TOTAL FAT NR 4445/2026 DATE 16.1.2026 DOLLAP CANTASH METALIKE., KONSTRUKSION METALIK','','P260116ADSHOP','Payment','16.01.2026','-106000',-24639304.46],
 [3,'15.01.2026','60185040352 EMANUEL CELA( FERMER) (0001416259)','P260115AC5WOP14 LIKUJDIM TOTAL BLERJE NE 2024 DHE TE PJESSHEM NE 2025 BIME AROMATIKE DHE MJEKESORE','','P260115AC5WOP','Payment','15.01.2026','-2500000',-24533304.46],
 [4,'15.01.2026','60185116033 TOMOR NAZIM MALAJ(FERMER) (0001353719)','P260115AJVYOP14 LIKUJDIM IPJESSHEM PER BLERJE BIMES H AROMATIKE DHE MJEKESORE.60185116033','','P260115AJVYOP1','Payment','15.01.2026','-500000',-22033304.46],
 [5,'15.01.2026','60185064633 ILIR SHTYLLA (FERMER) (0001349421)','P260115AFTKOP14 LIKUIM TOTAL FAT BLERJE BIMESH ARO MATIKE DHE MJEKESORE.60185064633','','P260115AFTKOP','Payment','15.01.2026','-1715650',-21533304.46],
 [6,'15.01.2026','60185104275 EMILY-TRAVEL SHPK (0020275036)','P260115AIG5OP14 BLERJE 40000 EURO ME KURS 96.3 ..60185104275','','P260115AIG5OP1','Payment','15.01.2026','3852000',-19817654.46],
 [7,'15.01.2026','60185040414 FIRE PROTECTION SHPK (0051048490)','P260115ADCHOP14 LIKUJDIM TOTAL FATURES NR 641/2025 DATE 23/7/2025.','9A9F2FC2-4905-4231-96D2-68CAF212FD77','P260115ADCHOP','Payment','15.01.2026','-12000',-23669654.46],
 [8,'15.01.2026','AL84902117974551230205192744 K-AKS SH.P.K','P260115AHVBOP08 LIKUJDIM TOTAL FAT NR 8/2026 DATE 8.1.2026.','D4EB96A4-2434-4D3B-86B9-2455F94152ED','P260115AHVBOP','XBEN','15.01.2026','-156250',-23657654.46],
 [9,'14.01.2026','40239868623 DREJTORIA PERGJITHSHME TATIMEVE (0101100016)','P260114AGGVOP14 L43904401I26000026-A TATIMI MBI TE ARDHURAT E KORPORATES60184981382','','P260114AGGVOP','TAX','14.01.2026','-237410',-23501404.46],
 [10,'14.01.2026','40239868582 DREJTORIA PERGJITHSHME TATIMEVE (0101100016)','P260114AGEPOP14 L43904401I1900002512 KONTRIBUTET E SIGURIMEVE SHOQERORE DHE SHENDETESORE60184981382','','P260114AGEPOP','TAX','14.01.2026','-517825',-23263994.46],
 [11,'13.01.2026','60184950755 XHULIANO AGOLLI FERMER (0002087351)','P260113AI9ROP14 LIKUJDIM I PJESHSEM PER BLERJE BIME SH AROMATIKE DHE MJEKESORE.60184950755','','P260113AI9ROP1','Payment','13.01.2026','-300000',-22746169.46],
 [12,'13.01.2026','60184895988 VALENTINA KOCI (FERMER) (0001375071)','P260113ABPNOP14 LIKUJDIMI PJESSHEM PER BLERJE BIMES H AROMATIKE DHE MJEKESORE.60184895988','','P260113ABPNOP','Payment','13.01.2026','-300000',-22446169.46],
 [13,'13.01.2026','60184903060 METAL-KONSTRUKSION VATA SHPK (0001679627)','P260113ABXUOP14 LIKUJDIM TOTAL FATURES NR 4/2026 DATE 8.1.2026.','29E2DEE5-7128-41BF-AFC6-1E09F6EC7EE3','P260113ABXUOP','Payment','13.01.2026','-16800',-22146169.46],
 [14,'13.01.2026','60184921724 A-BI-ESSE SHPK (0101400854)','P260113AE0TOP14 PARADHENIE FATURES NR 1172/2026 DATE 13.1.2026.','D5E53B1B-E97F-4D82-BA4C-7FC3F5B80ED5','P260113AE0TOP','Payment','13.01.2026','-96510.26',-22129369.46],
 [15,'13.01.2026','40239811727 DEGA THESARIT VLORE (0605030797)','P260113ACEAOP14 1016022KOMISARIATI I POLICISE 71154 10GJOBA TE POLICISE RRUG2601082400 AB360JY 0','','P260113ACEAOP','CARPENALT','13.01.2026','-1000',-22032859.2],
 [16,'14.01.2026','AL97214221060220763307020115 D.S.M.E','P260113AJEIOP08 LIKUJDIM TOTAL FATURES NR 1173/2026 DATE 13.1.2026 SHERBIM KONSULENCE MUAJI DHETOR','','P260113AJEIOP0','XBEN','14.01.2026','-30000',-22031859.2],
 [17,'12.01.2026','60184829227 ARDIAN LULAJ (FERMER) (0001627543)','P260112AL9GOP14 LIKUJDIM PER BLERJE BIMES SH AROMATIKE DHE MJEKESORE 60184829227','','P260112AL9GOP','Payment','12.01.2026','-400000',-22001859.2],
 [18,'12.01.2026','60184840675 SAIMIR KAZANXHIU (FERMER) (0001397971)','P260112AOIAOP14 LIKUJDIM PER BLERJE BIMES H AROMATIKE DHE MJEKESORE 60184840675','','P260112AOIAOP','Payment','12.01.2026','-200000',-21601859.2]
];
const CSV_REAL='Account,Account Name:,Period\nAL78202220060000000021158942,EMANUEL CELAJ FERMER,"11.01.2026-""18.01.2026""\n\n'
 +'No,Value Date,Reference Numbe Beneficiary/Ordering name and account number,Description,,Reference,Transacti,Processing Date,Amount,Amount Total\n'
 +REAL_ROWS.map(r=>`${r[0]},${r[1]},"${r[2]}","${r[3]}",${r[4]},${r[5]},${r[6]},${r[7]},"${r[8]} ALL",${r[9]}`).join('\n')
 +'\nPrevious Balance,Current Balance:,Debit sum:,Credit sum:\n-24639304.46,-25170204.46,,\n';

/* Rreshta si në extract-in e gushtit 2026: kolona C (përfituesi) bosh — te disa
   përfituesi gjendet në krye të përshkrimit (IBAN + emër), te të tjerët mungon krejt. */
const CSV_MISSING=HEAD+
 '1,20.08.2026,,"AL972142210602202817738020113 KOCI T AND L SHPK",,P260820ACVAOP08,XBEN,20.08.2026,"-170000 ALL",-27145239.61\n'+
 '2,20.08.2026,,"mb financ BIOBES 1004215",,P260820MBFIN1,XBEN,20.08.2026,"-85 ALL",-26975239.61\n'+
 '3,19.08.2026,"60196215483 AFRIM STRANA FERMER (0002127523)","P260819ABIEOP14 LIKUJDIM I PJESSHEM PER BLERJE BIMESH 60196071997",,P260819ABIEOP1,Payment,19.08.2026,"-30000 ALL",-26975154.61\n'+
 FOOT(-26975239.61,-27145239.61,0,-200085);

/* Përhapja automatike: blerje furnitori / arkëtim klienti / taksë / e panjohur */
const CSV_POST=HEAD+
 '1,05.02.2026,"60185125000 SOKOL AGALLIU FERMER (0001360346)","P260205POST01 LIKUJDIM TOTAL BLERJEVE SHKURT 60185125000",,P260205POST01,Payment,05.02.2026,"-120000 ALL",-9922000\n'+
 '2,05.02.2026,"40239868582 NUTRECO SWITZERLAND GMBH (000999001)","P260205POST02 ARKETIM FATURE SHITJEJE 40239868582",,P260205POST02,Payment,05.02.2026,"250000 ALL",-9802000\n'+
 '3,06.02.2026,"40239868623 DREJTORIA PERGJITHSHME TATIMEVE (0101100016)","P260206POST03 TATIMI MBI TE ARDHURAT",,P260206POST03,TAX,06.02.2026,"-45000 ALL",-10052000\n'+
 '4,06.02.2026,"99999999999 PANJOHUR SHPK (0000000002)","P260206POST04 DALJE E PANJOHUR",,P260206POST04,Payment,06.02.2026,"-7000 ALL",-10007000\n'+
 FOOT(-9802000,-9922000,250000,-172000);
const CSV_POST2=HEAD+
 '1,07.02.2026,"60185134322 FLAMUR GURI FERMER (0000785821)","P260207POST05 LIKUJDIM PJESSHEM 60185134322",,P260207POST05,Payment,07.02.2026,"-80000 ALL",-5080000\n'+
 FOOT(-5000000,-5080000,0,-80000);
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
 fs.writeFileSync('.audit/bank-real.csv',CSV_REAL);
 fs.writeFileSync('.audit/bank-post.csv',CSV_POST);fs.writeFileSync('.audit/bank-post2.csv',CSV_POST2);
 fs.writeFileSync('.audit/bank-missing.csv',CSV_MISSING);
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
   await ev(()=>{bankCsvPlan(2,'cat','TATIME');bankCsvPlan(3,'cat','TATIME')});
   await p.waitForTimeout(300);
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

 await step('Extract REAL i Postës Banka (18 veprime, renditje zbritëse): kontrollet kalojnë PA override; 17 të reja + 1 dublikat i kapërcyer',async()=>{
   await ev(()=>bankCsvWizard());await p.waitForTimeout(600);
   await p.setInputFiles('#bcFile','.audit/bank-real.csv');await p.waitForTimeout(1100);
   const st=await ev(()=>{const W=window.__biobesBankCsv.state();return{n:W.rows.length,checks:W.parsed.checks,meta:W.parsed.meta,
     types:W.rows.map(r=>r.type),ib8:W.rows[7].row.counterpart.iban,nm8:W.rows[7].row.counterpart.name}});
   assert.equal(st.n,18);
   assert.equal(st.checks.chainOk,true,'zinxhiri i saldove: secili = pasuesi + shuma e vet');
   assert.equal(st.checks.balanceOk,true,'footer Previous/Current pranohet me renditjen zbritëse');
   assert.equal(st.checks.debitOk,null);assert.equal(st.checks.creditOk,null);
   assert.equal(st.checks.sum,-3768345.26);
   assert.match(st.meta.period,/11\.01\.2026/);
   assert.equal(st.ib8,'AL84902117974551230205192744','IBAN në krye të kundërpalës lexohet si IBAN');
   assert.equal(st.nm8,'K-AKS SH.P.K');
   assert.equal(st.types[8],'tax');assert.equal(st.types[9],'tax');assert.equal(st.types[14],'fee');assert.equal(st.types[5],'otherIn');
   assert.equal(await p.locator('#bcSave').isDisabled(),false,'ruajtja NUK bllokohet për extract-in real');
   assert.equal(await p.locator('#bcOverride').count(),0,'nuk kërkohet pranim mospërputhjeje');
   /* rreshti 1 i extract-it real ështe i njëjti veprim si rreshti 1 i bank-all.csv (referencë+datë+shumë) → kapërcehet */
   const dups=await ev(()=>window.__biobesBankCsv.state().rows.filter(r=>r.dup).length);
   assert.equal(dups,1,'deduplikim mes skedarëve: rreshti i parë njihet si i hedhur');
   await ev(()=>{const W=window.__biobesBankCsv.state();W.rows.forEach((r,i)=>{if(r.plan&&r.plan.kind==='expense'&&!r.plan.cat)bankCsvPlan(i,'cat','TATIME')})});
   await p.waitForTimeout(300);
   await p.locator('#bcSave').click();await p.waitForTimeout(1000);
   const n=await ev(()=>bankTransactions().filter(x=>(x.source||'').includes('bank-real')).length);
   assert.equal(n,17,'18 veprime - 1 dublikat = 17 Draft të reja');
 });
 await step('Përfituesi mungon (kolona C bosh): gjendet në përshkrim ose shënohet "⚠ Përfituesi mungon" dhe plotësohet me dorë',async()=>{
   await ev(()=>{try{closeModal()}catch(e){}});
   await ev(()=>bankCsvWizard());await p.waitForTimeout(500);
   await p.setInputFiles('#bcFile','.audit/bank-missing.csv');await p.waitForTimeout(900);
   const st=await ev(()=>{const W=window.__biobesBankCsv.state();return W.rows.map(r=>({miss:r.row.partyMissing,rec:r.row.recovered,nm:r.row.counterpart.name,ib:r.row.counterpart.iban}))});
   assert.deepEqual(st[0],{miss:false,rec:true,nm:'KOCI T AND L SHPK',ib:'AL972142210602202817738020113'},'përfituesi u gjet në krye të përshkrimit');
   assert.deepEqual(st[1],{miss:true,rec:false,nm:'',ib:''},'rreshti pa përfitues njihet si i tillë');
   assert.equal(st[2].miss,false);assert.equal(st[2].rec,false);assert.equal(st[2].nm,'AFRIM STRANA FERMER');
   const rev=await p.locator('#bcReview').innerText();
   assert.match(rev,/1 pa përfitues/);assert.match(rev,/1 përfitues të gjetur në përshkrim/);
   assert.equal(await p.locator('#bcReview').getByText('⚠ Përfituesi mungon').count(),1);
   assert.match(rev,/\(nga përshkrimi\)/);
   /* plotësimi me dorë i përfituesit të munguar */
   await p.locator('#bcReview input[placeholder="Shkruaj përfituesin"]').fill('BIOBES financim i brendshëm');
   await p.locator('#bcReview input[placeholder="Shkruaj përfituesin"]').dispatchEvent('change');
   await p.waitForTimeout(300);
   assert.doesNotMatch(await p.locator('#bcReview').innerText(),/1 pa përfitues/);
   await p.locator('#bcSave').click();await p.waitForTimeout(900);
   const t=await ev(()=>bankTransactions().filter(x=>(x.source||'').includes('bank-missing')).map(x=>({cp:x.bankCounterpart,miss:x.partyMissing,rec:x.partyRecovered})));
   assert.deepEqual(t,[{cp:'KOCI T AND L SHPK',miss:false,rec:true},
     {cp:'BIOBES financim i brendshëm',miss:false,rec:false},
     {cp:'AFRIM STRANA FERMER',miss:false,rec:false}]);
 });
 await step('Printimi nga wizard-i: fleta A4 landscape me 18 rreshta, kreu dhe fundi i bankës',async()=>{
   await ev(()=>{window.__printCalls=[];const o=window.printOnly;window.printOnly=function(id,t){window.__printCalls.push([id,t]);return o.apply(this,arguments)}});
   await ev(()=>bankCsvWizard());await p.waitForTimeout(500);
   await p.setInputFiles('#bcFile','.audit/bank-real.csv');await p.waitForTimeout(1000);
   await p.locator('#bcReview').getByRole('button',{name:/Printo A4 landscape/}).click();
   await p.waitForTimeout(400);
   assert.deepEqual(await ev(()=>window.__printCalls.at(-1)),['bankStmtSheet','Extract bankar AL78202220060000000021158942']);
   const sheet=await ev(()=>{const h=document.getElementById('bankStmtHost');const s=h&&h.querySelector('#bankStmtSheet');
     return s?{rows:s.querySelectorAll('#bankStmtTable tbody tr').length,css:window.__biobesBankCsv.css(),foot:s.querySelector('.bsfoot').textContent,head:s.querySelector('.bshead').textContent}:null});
   assert.ok(sheet);assert.equal(sheet.rows,18);
   assert.match(sheet.css,/size:A4 landscape/);
   assert.match(sheet.head,/AL78202220060000000021158942/);assert.match(sheet.head,/EMANUEL CELAJ FERMER/);
   const foot=sheet.foot.replace(/,/g,'');
   assert.match(foot,/-25170204\.46/);assert.match(foot,/-24639304\.46/);
   assert.match(foot,/Debit sum: 3852000\.00/);assert.match(foot,/Credit sum: -7620345\.26/);
   await ev(()=>closeModal());
 });

 await step('Printimi nga Banka për periudhë: rreshtat e ruajtur, saldi rrjedhës dhe fundi Previous/Current të saktë',async()=>{
   await ev(()=>{try{closeModal()}catch(e){}});await ev(()=>go('banking'));await p.waitForTimeout(700);
   assert.equal(await p.locator('#bankStmtPrintBtn').count(),1);
   await p.locator('#bankStmtPrintBtn').click();await p.waitForTimeout(500);
   await p.locator('#bspFrom').fill('2026-01-12');await p.locator('#bspTo').fill('2026-01-16');
   await p.locator('#modalFoot').getByRole('button',{name:/Printo A4 landscape/}).click();
   await p.waitForTimeout(400);
   const sheet=await ev(()=>{const h=document.getElementById('bankStmtHost');const s=h&&h.querySelector('#bankStmtSheet');if(!s)return null;
     const acc=bankAccounts().find(a=>a.id==='BA1');const all=bankTransactions().filter(x=>x.bankAccount===acc.id);
     const per=all.filter(x=>x.valueDate>='2026-01-12'&&x.valueDate<='2026-01-16');
     let b=+acc.openingBalance||0;all.forEach(x=>{if(x.valueDate<'2026-01-12')b+=(x.direction==='in'?x.amount:-x.amount)});
     let run=b;per.slice().sort((a,c)=>a.valueDate<c.valueDate?-1:a.valueDate>c.valueDate?1:0).forEach(x=>run+=(x.direction==='in'?x.amount:-x.amount));
     return{rows:s.querySelectorAll('#bankStmtTable tbody tr').length,foot:s.querySelector('.bsfoot').textContent,
       firstDate:s.querySelector('#bankStmtTable tbody tr td:nth-child(2)').textContent,n:per.length,cur:run};});
   assert.ok(sheet);assert.equal(sheet.rows,sheet.n);assert.equal(sheet.rows,22);
   assert.equal(sheet.firstDate,'16.01.2026','më e reja lart si extract-i i bankës');
   const cur=parseFloat(sheet.foot.match(/Current Balance: ([^A-Z]+)/)[1].replace(/[^\d.-]/g,''));
   assert.ok(Math.abs(cur-sheet.cur)<0.01,'Current Balance = saldo pas periudhës ('+sheet.cur+')');
   const prev=parseFloat(sheet.foot.match(/Previous Balance: ([^A-Z]+)/)[1].replace(/[^\d.-]/g,''));
   assert.ok(Math.abs(prev-0)<0.01,'Previous Balance = saldo para periudhës (0, hapja e llogarisë)');
 });
 await step('Përhapja automatike me konfirmim: MP- + kartela, MA- + kartela, shpenzim me kategori, e panjohura vetëm bankë; VK për secilin',async()=>{
   await ev(()=>{try{closeModal()}catch(e){}});
   const before=await ev(()=>({bal1:supplierBalance('S1'),n:bankTransactions().length,p:state.payments.length,m:customerPayments().length,e:(window.__biobesExpenses.docs()||[]).length}));
   await ev(()=>bankCsvWizard());await p.waitForTimeout(500);
   await p.setInputFiles('#bcFile','.audit/bank-post.csv');await p.waitForTimeout(1000);
   const plans=await ev(()=>window.__biobesBankCsv.state().rows.map(r=>({k:r.plan.kind,party:r.plan.party||null,cat:r.plan.cat||null})));
   assert.deepEqual(plans[0],{k:'payment',party:'S1',cat:null});
   assert.deepEqual(plans[1],{k:'receipt',party:'C1',cat:null});
   assert.deepEqual(plans[2],{k:'expense',party:null,cat:null});
   assert.deepEqual(plans[3],{k:'bank',party:null,cat:null});
   /* pa kategori shpenzimi ruajtja bllokohet me mesazh të qartë */
   await p.locator('#bcConfirm').click();await p.waitForTimeout(600);
   assert.match(await ev(()=>document.getElementById('toast').textContent),/Zgjidhni kategorinë e shpenzimit/);
   assert.equal(await ev(()=>bankTransactions().length),before.n,'asgjë nuk u ruajt pa kategori');
   /* zgjedhja e kategorisë në tabelën e rishikimit */
   await ev(()=>bankCsvPlan(2,'cat','TATIME'));
   await p.waitForTimeout(400);
   assert.equal(await ev(()=>window.__biobesBankCsv.state().rows[2].plan.cat),'TATIME');
   await p.locator('#bcConfirm').click();await p.waitForTimeout(1200);
   const after=await ev(b=>({
     pays:state.payments.slice(b.p).map(x=>({id:x.id,sup:x.supplier,amt:x.amount,st:x.status,method:x.method,inv:x.invoice})),
     recs:customerPayments().slice(b.m).map(x=>({id:x.id,cus:x.customer,amt:x.amount,st:x.status})),
     exps:window.__biobesExpenses.docs().slice(b.e).map(x=>({id:x.id,num:x.number,cat:x.category,tot:x.total,st:x.status,method:x.method,bank:x.bankAccount})),
     txs:bankTransactions().slice(b.n).map(x=>({plan:x.postedPlan,doc:x.postedDoc,st:x.status})),
     bal1:supplierBalance('S1'),
     vks:ensureAccounting().entries.map(e=>e.sourceKey),
     evs:state.events.map(e=>e.type)}),before);
   assert.equal(after.pays.length,1);assert.equal(after.pays[0].sup,'S1');assert.equal(after.pays[0].amt,120000);assert.equal(after.pays[0].st,'Konfirmuar');assert.equal(after.pays[0].method,'Bankë');
   assert.equal(after.recs.length,1);assert.equal(after.recs[0].cus,'C1');assert.equal(after.recs[0].amt,250000);assert.equal(after.recs[0].st,'Konfirmuar');
   assert.equal(after.exps.length,1);assert.equal(after.exps[0].cat,'TATIME');assert.equal(after.exps[0].tot,45000);assert.equal(after.exps[0].st,'Konfirmuar');assert.equal(after.exps[0].method,'bank');
   assert.deepEqual(after.txs.map(t=>t.plan),['payment','receipt','expense','bank']);
   assert.ok(after.txs[0].doc&&after.txs[0].doc===after.pays[0].id,'veprimi bankar mban dokumentin e krijuar');
   assert.ok(after.txs[1].doc===after.recs[0].id);assert.ok(after.txs[2].doc);assert.equal(after.txs[3].doc,undefined);
   assert.ok(Math.abs(after.bal1-(before.bal1-120000))<0.01,'kartela e furnitorit u përditësua nga mandati i konfirmuar');
   const mp=after.pays[0].id,ma=after.recs[0].id,sh=after.exps[0].id;
   assert.ok(after.vks.some(k=>k&&k.includes(mp)),'VK për pagesën');
   assert.ok(after.vks.some(k=>k&&k.includes(ma)),'VK për arkëtimin');
   assert.ok(after.vks.some(k=>k==='expense:'+sh),'VK për shpenzimin');
   assert.ok(after.evs.includes('Mandat pagesë')&&after.evs.includes('Mandat arkëtim'));
 });

 await step('Përhapja si Draft: dokumenti krijohet Draft, kartela dhe VK presin konfirmimin',async()=>{
   const before=await ev(()=>({bal2:supplierBalance('S2'),p:state.payments.length,n:bankTransactions().length}));
   await ev(()=>bankCsvWizard());await p.waitForTimeout(500);
   await p.setInputFiles('#bcFile','.audit/bank-post2.csv');await p.waitForTimeout(900);
   await p.locator('#bcSave').click();await p.waitForTimeout(900);
   const after=await ev(b=>({pays:state.payments.slice(b.p),bal2:supplierBalance('S2'),
     vks:ensureAccounting().entries.map(e=>e.sourceKey)}),before);
   assert.equal(after.pays.length,1);assert.equal(after.pays[0].status,'Draft');assert.equal(after.pays[0].supplier,'S2');
   assert.ok(Math.abs(after.bal2-before.bal2)<0.01,'drafti nuk e prek kartelën');
   assert.ok(!after.vks.some(k=>k&&k.includes(after.pays[0].id)),'drafti nuk krijon VK');
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
   assert.equal(await p.locator('#bankStmtPrintBtn').count(),0,'butoni i printimit nuk shfaqet pa të drejtën print');
   await ev(()=>{window.__t=[];const bb=toast;toast=m=>{window.__t.push(m);return bb(m)}});
   await ev(()=>bankCsvWizard());await p.waitForTimeout(400);
   assert.match(await ev(()=>window.__t.at(-1)),/Nuk keni të drejtë/);
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
