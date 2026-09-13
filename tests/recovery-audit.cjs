const{open}=require('./helpers.cjs'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const{browser,context,page:p,errors,close}=await open();const results=[];const pass=name=>{results.push({name,status:'PASS'});console.log('PASS',name)};
 try{
 await p.evaluate(()=>performDailyBackup(true));const original=await p.evaluate(()=>state.products[0].name);
 await p.evaluate(()=>{state.products[0].name='AUDIT MODIFIED';restoreAutoBackup()});assert.equal(await p.evaluate(()=>state.products[0].name),original);pass('Daily backup and restore');
 await p.evaluate(()=>requestFactoryReset());await p.locator('#frPass').fill('wrong');await p.locator('#modalFoot button.danger').click();await p.waitForTimeout(200);assert.ok((await p.locator('#toast').innerText()).includes('gabuar'));assert.ok(await p.evaluate(()=>state.products.length>0));
 await p.locator('#frPass').fill('Audit-Only-2026!');await p.locator('#modalFoot button.danger').click();await p.waitForTimeout(300);
 assert.equal(await p.evaluate(()=>state.products.length),0);assert.equal(await p.evaluate(()=>state.users.length),1);assert.equal(await p.locator('#loginLock').count(),1);pass('Pastro refuses wrong password, wipes business data and preserves users');
 await p.locator('#loginName').fill('audit');await p.locator('#loginPass').fill('Audit-Only-2026!');await p.locator('#loginLock button').filter({hasText:'Hyr'}).click();await p.waitForFunction(()=>!document.getElementById('loginLock'));
 await p.evaluate(()=>blankSlateWipe());await p.locator('#bswPass').fill('Audit-Only-2026!');const download=p.waitForEvent('download');await p.locator('#modalFoot button.danger').click();const backup=await download;assert.match(backup.suggestedFilename(),/\.json$/);await p.waitForTimeout(350);
 assert.equal(await p.evaluate(()=>state.users.length),0);assert.equal(await p.evaluate(()=>state.products.length),0);assert.equal(await p.locator('#loginLock').count(),1);pass('Erase creates a backup and removes users as well');
 assert.deepEqual(errors,[]);
 // Exercise the original guard against two failed boots. During pre-release testing
 // the rollback target is served from the candidate, WITHOUT replacing known-good.
 const html=fs.readFileSync('index.html','utf8'),guard=html.match(/<script id="__biobesBootGuard">([\s\S]*?)<\/script>/)[1];
 await context.route('**/audit-failed-boot.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body><script>'+guard+'</script><p>Simulated incomplete boot</p></body>'}));
 if(process.env.BIOBES_USE_REAL_KNOWN_GOOD!=='1')await context.route('**/index.known-good.html?bootguard=rollback',r=>r.fulfill({contentType:'text/html',body:html}));
 await p.evaluate(()=>{localStorage.setItem('__biobesBootCrashes','0');sessionStorage.removeItem('__biobesBootRolled');localStorage.setItem('auditRecoveryMarker','retained')});
 await p.goto('http://127.0.0.1:8000/audit-failed-boot.html');assert.equal(await p.evaluate(()=>localStorage.getItem('__biobesBootCrashes')),'1');
 await p.reload();assert.equal(await p.evaluate(()=>localStorage.getItem('__biobesBootCrashes')),'2');
 await p.reload();await p.waitForURL('**/index.known-good.html?bootguard=rollback');await p.waitForTimeout(1800);
 assert.equal(await p.evaluate(()=>localStorage.getItem('auditRecoveryMarker')),'retained');assert.equal(await p.evaluate(()=>localStorage.getItem('__biobesBootCrashes')),'0');assert.deepEqual(errors,[]);pass('Boot-Guard rolls back after two failed boots and preserves storage');
 }finally{fs.writeFileSync('.audit/recovery-results.json',JSON.stringify(results,null,2));await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
