const {chromium}=require('playwright');
const assert=require('node:assert/strict');
require('node:fs').mkdirSync('.audit',{recursive:true});
async function open(mobile=false){
 const browser=await chromium.launch({executablePath:process.env.BIOBES_BROWSER_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
 // No request made by tests may reach the production API.
 await context.route('https://**/*',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('dialog',d=>d.type()==='prompt'?d.accept('Arsye auditimi'):d.accept());
 await page.goto('http://127.0.0.1:8000');await page.waitForFunction(()=>typeof state!=='undefined'&&state?.users?.length);await page.waitForTimeout(900);
 assert.deepEqual(errors,[]);
 await page.evaluate(async()=>{
   const h=await hashPassword('Audit-Only-2026!');state.users=[{id:'AUDIT-ADMIN',username:'audit',name:'Audit lokal',role:'ROLE-ADMIN',active:true,passwordHash:h.hash,passwordSalt:h.salt,passwordIterations:h.iterations,mustChangePassword:false}];
   localStorage.setItem('biobesBackend',JSON.stringify({url:''}));serverBaseUrl=()=>'';save();
 });
 await page.locator('#loginName').fill('audit');await page.locator('#loginPass').fill('Audit-Only-2026!');await page.locator('#loginLock button').filter({hasText:'Hyr'}).click();await page.waitForFunction(()=>!document.getElementById('loginLock'));
 const close=async()=>{await page.evaluate(()=>closeModal());await page.waitForTimeout(200);assert.equal(await page.locator('#modalBody').innerHTML(),'');assert.equal(await page.locator('#modalFoot').innerHTML(),'');assert.equal(await page.locator('#pkLotOverlay').count(),0)};
 const choose=async(id,value)=>{
   await page.waitForTimeout(120);const field=page.locator('#'+id);
   const label=await field.evaluate((el,v)=>[...el.options].find(o=>o.value===v)?.textContent,value);assert.ok(label,`${id}: ${value}`);
   await field.locator('xpath=..').locator('input[type="search"]').first().fill(label.trim());
   await page.locator(`.global-live-option[data-value="${value}"],.live-option[data-value="${value}"]`).filter({visible:true}).first().click();assert.equal(await field.inputValue(),value);
 };
 return {browser,context,page,errors,close,choose};
}
module.exports={open};
