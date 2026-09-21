/* tests/server-backups-audit.cjs — backup-et me datë në server (Postgres): karta ADMIN te Konfigurime,
   lista, krijimi, shkarkimi, rikthimi, fshirja + performDailyBackup → POST /api/backups.
   API-ja simulohet me page.route (asnjë kërkesë nuk prek serverin real). */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 await p.waitForTimeout(1200);
 await ev(()=>{try{closeModal()}catch(e){}});

 // Backend i rremë + regjistrues i thirrjeve (page.route ka përparësi ndaj context.route të helpers)
 const calls=[];
 const backups=[
  {id:1,taken_at:'2026-09-20T06:00:00.000Z',label:'Backup ditor 2026-09-20',taken_by:'admin',state_version:5,size_bytes:20480},
  {id:2,taken_at:'2026-09-21T06:00:00.000Z',label:'Backup ditor 2026-09-21',taken_by:'admin',state_version:7,size_bytes:30720}
 ];
 await p.route('https://sb-test.onrender.com/api/backups**',async route=>{
  const req=route.request(),url=new URL(req.url()),m=req.method(),body=req.postData()?JSON.parse(req.postData()):null;
  calls.push({m,path:url.pathname+url.search,body});
  const j=(o,st)=>route.fulfill({status:st||200,contentType:'application/json',body:JSON.stringify(o)});
  const idm=url.pathname.match(/^\/api\/backups\/(\d+)(\/restore)?$/);
  if(m==='GET'&&!idm)return j({ok:true,backups,keep:14});
  if(m==='POST'&&!idm)return j({ok:true,id:3,takenAt:new Date().toISOString()});
  if(idm&&idm[2]==='/restore'&&m==='POST')return j({ok:true,version:9});
  if(idm&&m==='GET')return j({ok:true,backup:{id:+idm[1],takenAt:'2026-09-20T06:00:00.000Z',label:'Backup ditor 2026-09-20',takenBy:'admin',stateVersion:5,sizeBytes:20480,state:{schemaVersion:1,company:{name:'TestCo'},products:[],suppliers:[]}}});
  if(idm&&m==='DELETE')return j({ok:true});
  return j({ok:false,error:'Endpoint i panjohur'},404);
 });
 await ev(()=>{serverBaseUrl=()=>'https://sb-test.onrender.com';serverToken='tok-sb';serverUser={id:'AUDIT-ADMIN',username:'audit',role:'admin'}});
 const toastText=()=>ev(()=>document.getElementById('toast').textContent);
 const lastCall=(m,re)=>calls.filter(c=>c.m===m&&re.test(c.path)).pop();

 await step('Konfigurime: karta ADMIN "Backup-et në server" shfaqet me listën nga serveri',async()=>{
  await ev(()=>go('settings'));await p.waitForTimeout(500);
  const card=p.locator('#srvBackupsBox');
  await assert.ok(await card.count(),'kuti mungon');
  assert.ok(await p.locator('h3:has-text("Backup-et në server (Postgres)")').isVisible(),'karta nuk shfaqet');
  const rows=p.locator('#srvBackupsBox tbody tr');
  assert.equal(await rows.count(),2,'pritën 2 rreshta');
  const t1=await rows.nth(0).innerText();
  assert.match(t1,/Backup ditor 2026-09-20/);assert.match(t1,/20(\.|,)00 KB/);assert.match(t1,/admin/);
  const t2=await rows.nth(1).innerText();
  assert.match(t2,/Backup ditor 2026-09-21/);
  assert.match(await p.locator('#srvBackupsBox').innerText(),/14 backup-et e fundit/);
  assert.ok(lastCall('GET',/^\/api\/backups$/),'GET /api/backups nuk u thirr');
  // kolonat: 7 qeliza për rresht (data + versioni të ndara mirë)
  assert.equal(await rows.nth(0).locator('td').count(),7,'strukturë e gabuar kolonash');
 });

 await step('"Bëj backup tani në server": POST me etiketë Manual + toast + rifreskim liste',async()=>{
  calls.length=0;
  await p.locator('button:has-text("Bëj backup tani në server")').click();await p.waitForTimeout(500);
  const c=lastCall('POST',/^\/api\/backups$/);
  assert.ok(c,'POST /api/backups nuk u thirr');
  assert.match(String(c.body&&c.body.label),/^Manual \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,'etiketë e gabuar: '+JSON.stringify(c.body));
  assert.match(await toastText(),/Backup-i u ruajt në server \(#3\)/);
  assert.ok(lastCall('GET',/^\/api\/backups$/),'lista nuk u rifreskua pas krijimit');
 });

 await step('"Shkarko" merr backup-in me id dhe nis shkarkimin JSON',async()=>{
  calls.length=0;
  const dl=p.waitForEvent('download',{timeout:5000}).catch(()=>null);
  await p.locator('#srvBackupsBox tbody tr').nth(0).locator('button:has-text("Shkarko")').click();
  const d=await dl;await p.waitForTimeout(300);
  const c=lastCall('GET',/^\/api\/backups\/1$/);
  assert.ok(c,'GET /api/backups/1 nuk u thirr');
  assert.match(await toastText(),/Shkarkimi i backup-it filloi/);
  if(d)assert.match(d.suggestedFilename(),/^BioBes-server-backup-2026-09-20-id1\.json$/,'emër i gabuar skedari: '+d.suggestedFilename());
 });

 await step('"Rikthe" me konfirmim: POST /api/backups/1/restore + toast me versionin',async()=>{
  calls.length=0;
  await p.locator('#srvBackupsBox tbody tr').nth(0).locator('button:has-text("Rikthe")').click();await p.waitForTimeout(500);
  const c=lastCall('POST',/^\/api\/backups\/1\/restore$/);
  assert.ok(c,'POST restore nuk u thirr (dialogu nuk u pranua?)');
  assert.match(await toastText(),/U rikthua në server \(version 9\)/);
 });

 await step('"Fshi" me konfirmim: DELETE /api/backups/2 + toast',async()=>{
  calls.length=0;
  await p.locator('#srvBackupsBox tbody tr').nth(1).locator('button:has-text("Fshi")').click();await p.waitForTimeout(500);
  assert.ok(lastCall('DELETE',/^\/api\/backups\/2$/),'DELETE nuk u thirr');
  assert.match(await toastText(),/Backup-i u fshi nga serveri/);
 });

 await step('performDailyBackup(true) dërgon POST /api/backups me etiketën "Backup ditor <datë>"',async()=>{
  calls.length=0;
  await ev(async()=>{await performDailyBackup(true)});await p.waitForTimeout(400);
  const c=lastCall('POST',/^\/api\/backups$/);
  assert.ok(c,'POST /api/backups nuk u thirr nga performDailyBackup');
  assert.match(String(c.body&&c.body.label),/^Backup ditor \d{4}-\d{2}-\d{2}$/,'etiketë e gabuar: '+JSON.stringify(c.body));
  assert.match(await toastText(),/Backup u krye/);
  assert.ok(!calls.some(x=>x.m==='PUT'&&/app_state/.test(x.path)),'nuk duhet pushState kur serveri pranon backup-in');
 });

 await step('Pa server të lidhur: karta jep mesazh udhëzues, jo gabim',async()=>{
  await ev(()=>{serverToken=null});
  await ev(()=>loadServerBackupsList());await p.waitForTimeout(200);
  assert.match(await p.locator('#srvBackupsBox').innerText(),/S'ka server të lidhur/);
  await ev(()=>{serverToken='tok-sb';loadServerBackupsList()});await p.waitForTimeout(300);
  assert.equal(await p.locator('#srvBackupsBox tbody tr').count(),2,'lista nuk u rikthye pas rilidhjes');
 });

 await step('Pa gabime JS',async()=>{assert.deepEqual(errors,[])});
 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
