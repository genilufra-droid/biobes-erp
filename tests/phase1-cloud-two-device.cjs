const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const assert = require('node:assert/strict');
const { PGlite } = require(path.join(process.cwd(),'api/backend/node_modules/@electric-sql/pglite'));
const { PGLiteSocketServer } = require(path.join(process.cwd(),'api/backend/node_modules/@electric-sql/pglite-socket'));

const DB_PORT = 5436, API_PORT = 3210, WEB_PORT = 8010;
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const ADMIN = 'admin', PASS = 'admin12345';
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function waitHttp(url, timeout=30000){
  const end=Date.now()+timeout;
  while(Date.now()<end){try{const r=await fetch(url);if(r.ok)return true}catch(e){} await sleep(300)}
  throw new Error('Timeout waiting for '+url);
}

(async()=>{
  const db = new PGlite();
  const dbSrv = new PGLiteSocketServer({db,port:DB_PORT,host:'127.0.0.1',maxConnections:12});
  await dbSrv.start();
  const api = spawn(process.execPath,['server.js'],{cwd:path.join(process.cwd(),'api/backend'),env:{...process.env,PORT:String(API_PORT),DATABASE_URL:`postgres://biobes:biobes@127.0.0.1:${DB_PORT}/biobes`,ADMIN_USERNAME:ADMIN,ADMIN_PASSWORD:PASS,SESSION_TTL_HOURS:'24',PGSSLMODE:'disable',CORS_ORIGIN:'*'},stdio:['ignore','pipe','pipe']});
  let apiLog=''; api.stdout.on('data',d=>apiLog+=d); api.stderr.on('data',d=>apiLog+=d);
  const web = spawn('python3',['-m','http.server',String(WEB_PORT),'--bind','127.0.0.1'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
  await waitHttp(API+'/api/health'); await waitHttp(WEB+'/index.html');

  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  async function device(label){
    const context=await browser.newContext();
    await context.addInitScript(({api})=>localStorage.setItem('biobesBackend',JSON.stringify({url:api})),{api:API});
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.goto(WEB+'/index.html');
    await page.waitForSelector('#loginLock',{timeout:15000});
    await page.locator('#loginName').fill(ADMIN); await page.locator('#loginPass').fill(PASS);
    await page.locator('#loginLock button').filter({hasText:'Hyr'}).click();
    await page.waitForFunction(()=>!document.getElementById('loginLock') && !!serverToken,{timeout:20000});
    await page.waitForFunction(()=>serverVersion!==null && serverVersion!==undefined,{timeout:15000});
    console.log('PASS',label,'login cloud v'+await page.evaluate(()=>serverVersion));
    return {context,page,errors,label};
  }
  async function serverState(dev){
    const token=await dev.page.evaluate(()=>serverToken);
    const r=await fetch(API+'/api/state',{headers:{Authorization:'Bearer '+token}}); assert.equal(r.status,200); return r.json();
  }
  async function addCustomer(dev,id,name){
    await dev.page.evaluate(({id,name})=>{state.customers=Array.isArray(state.customers)?state.customers:[]; if(!state.customers.some(x=>x.id===id))state.customers.push({id,code:id,name,balance:0}); save();},{id,name});
  }
  async function waitSynced(dev){
    await dev.page.waitForFunction(()=>typeof syncIsDirty==='function' && !syncIsDirty() && serverOnline===true,{timeout:20000});
  }
  const A=await device('A'), B=await device('B');

  await addCustomer(A,'TWO-A','Nga pajisja A'); await waitSynced(A);
  let s=await serverState(A); assert.ok(s.state.customers.some(x=>x.id==='TWO-A')); console.log('PASS A -> server');
  await B.page.evaluate(()=>pollServerVersion());
  await B.page.waitForFunction(()=>state.customers?.some(x=>x.id==='TWO-A'),{timeout:15000}); console.log('PASS server -> B');

  await A.context.setOffline(true); await addCustomer(A,'OFF-A','Offline A');
  await A.page.waitForFunction(()=>syncIsDirty()===true,{timeout:5000}); await sleep(1200);
  assert.ok(await A.page.evaluate(()=>state.customers.some(x=>x.id==='OFF-A'))); console.log('PASS offline local retained');
  await A.context.setOffline(false); await A.page.evaluate(()=>{window.dispatchEvent(new Event('online')); return pollServerVersion()}); await waitSynced(A);
  s=await serverState(A); assert.ok(s.state.customers.some(x=>x.id==='OFF-A')); console.log('PASS reconnect uploaded');

  await A.page.evaluate(()=>pullState()); await B.page.evaluate(()=>pullState());
  const va=await A.page.evaluate(()=>serverVersion), vb=await B.page.evaluate(()=>serverVersion); assert.equal(va,vb); console.log('PASS same base version',va);

  await addCustomer(A,'CAS-A','CAS winner A'); await waitSynced(A);
  await addCustomer(B,'CAS-B','CAS stale B');
  await B.page.waitForFunction(()=>document.getElementById('modal') && /konflikt/i.test(document.getElementById('modal').innerText),{timeout:20000});
  assert.ok(await B.page.evaluate(()=>state.customers.some(x=>x.id==='CAS-B')),'B local mutation disappeared on 409');
  s=await serverState(A);
  assert.ok(s.state.customers.some(x=>x.id==='CAS-A'),'server lost winner A');
  assert.ok(!s.state.customers.some(x=>x.id==='CAS-B'),'stale B silently overwrote server');
  const conflictUI=await B.page.locator('#modal').innerText();
  console.log('PASS 409 blocks stale overwrite');
  console.log('CONFLICT_UI_BEGIN\n'+conflictUI.slice(0,1800)+'\nCONFLICT_UI_END');

  const retry=await B.page.evaluate(()=>pushState(true));
  await sleep(800);
  const after=(await serverState(A)).state;
  if(after.customers?.some(x=>x.id==='CAS-B') && !after.customers?.some(x=>x.id==='CAS-A')){
    throw new Error('DATA LOSS: conflict recovery uploaded stale local snapshot and erased CAS-A');
  }
  console.log('PASS recovery did not erase accepted remote mutation',JSON.stringify(retry));

  assert.deepEqual(A.errors,[]); assert.deepEqual(B.errors,[]);
  console.log('ALL PHASE1 CLOUD TESTS PASS');
  await A.context.close(); await B.context.close(); await browser.close(); api.kill('SIGTERM'); web.kill('SIGTERM'); await dbSrv.stop();
})().catch(e=>{console.error('PHASE1 CLOUD TEST FAIL:',e.stack);process.exit(1)});
