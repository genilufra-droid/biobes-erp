const{open}=require('./helpers.cjs'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const{browser,context,page:p,errors,close}=await open();const results=[];const pass=name=>{results.push({name,status:'PASS'});console.log('PASS',name)};
 try{
 await p.evaluate(()=>performDailyBackup(true));const original=await p.evaluate(()=>state.products[0].name);
 await p.evaluate(()=>{state.products[0].name='AUDIT MODIFIED';restoreAutoBackup()});assert.equal(await p.evaluate(()=>state.products[0].name),original);pass('Daily backup and restore');
 await p.evaluate(async()=>{const h1=await hashPassword('Admin-Prove-1!');state.users.push({id:'AUDIT-ADMIN2',username:'admin',name:'Admin provë',role:'ROLE-ADMIN',active:true,passwordHash:h1.hash,passwordSalt:h1.salt,passwordIterations:h1.iterations,mustChangePassword:false,failedAttempts:0});const h2=await hashPassword('Operator-1!');state.users.push({id:'AUDIT-USER',username:'operator',name:'Operator provë',role:'ROLE-USER',active:true,passwordHash:h2.hash,passwordSalt:h2.salt,passwordIterations:h2.iterations,mustChangePassword:false,failedAttempts:0});save()});
 assert.equal(await p.evaluate(()=>verifyAdminPassword('gabim')),false);assert.equal(await p.evaluate(()=>verifyAdminPassword('Admin-Prove-1!')),true);pass('verifyAdminPassword: wrong=false, correct=true (PBKDF2 awaited, salt+iterations)');
 await p.evaluate(()=>requestFactoryReset());assert.equal(await p.locator('#frConfirm').count(),1,'adminit të kyçur nuk i kërkohet passwordi');
 await p.locator('#frConfirm').fill('gabim');await p.locator('#modalFoot button.danger').click();await p.waitForTimeout(200);assert.ok((await p.locator('#toast').innerText()).includes('PASTRO'));assert.ok(await p.evaluate(()=>state.products.length>0));
 await p.locator('#frConfirm').fill('PASTRO');await p.locator('#modalFoot button.danger').click();await p.waitForTimeout(300);
 assert.equal(await p.evaluate(()=>state.products.length),0);assert.equal(await p.evaluate(()=>state.weighings.length),0);assert.equal(await p.evaluate(()=>state.lots.length),0);assert.equal(await p.evaluate(()=>state.users.length),3);assert.equal(await p.locator('#loginLock').count(),0,'admini mbetet i kyçur');assert.ok((await p.locator('#toast').innerText()).includes('u pastruan'));assert.equal(await p.evaluate(()=>verifyAdminPassword('Admin-Prove-1!')),true,'passwordet e ruajtura');pass('Pastro (admin): wrong word refused, PASTRO wipes business data and preserves users+passwords+session');
 await p.evaluate(()=>logoutUser());await p.waitForFunction(()=>!!document.getElementById('loginLock'));
 await p.locator('#loginName').fill('operator');await p.locator('#loginPass').fill('Operator-1!');await p.locator('#loginLock button').filter({hasText:'Hyr'}).click();await p.waitForFunction(()=>!document.getElementById('loginLock'));
 await p.evaluate(()=>requestFactoryReset());assert.equal(await p.locator('#frPass').count(),1,'jo-adminit i kërkohet passwordi');
 await p.locator('#frPass').fill('gabim');await p.evaluate(()=>confirmFactoryReset());await p.waitForTimeout(200);assert.ok((await p.locator('#toast').innerText()).includes('gabuar'));assert.equal(await p.evaluate(()=>state.users.length),3);
 await p.locator('#frPass').fill('Admin-Prove-1!');await p.evaluate(()=>confirmFactoryReset());await p.waitForTimeout(300);
 assert.equal(await p.evaluate(()=>state.users.length),3);assert.equal(await p.locator('#loginLock').count(),1);pass('Pastro (non-admin): password required, wrong refused, correct wipes and preserves users');
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
