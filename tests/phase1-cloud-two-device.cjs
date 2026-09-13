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
  const web = spawn(process.execPath,['tests/phase1-proxy-server.cjs'],{cwd:process.cwd(),env:{...process.env,WEB_PORT:String(WEB_PORT),API_PORT:String(API_PORT)},stdio:['ignore','pipe','pipe']});
  await waitHttp(API+'/api/health'); await waitHttp(WEB+'/api/health'); await waitHttp(WEB+'/index.html');

  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  async function device(label){
    const context=await browser.newContext();
    await context.addInitScript(({url})=>localStorage.setItem('biobesBackend',JSON.stringify({url})),{url:WEB});
    const page=await context.newPage();
    const errors=[], net=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    page.on('request',req=>{
      if(req.method()==='PUT' && req.url().includes('/api/state')){
        let body={}; try{body=JSON.parse(req.postData()||'{}')}catch(e){}
        net.push({kind:'REQ',method:'PUT',baseVersion:body.baseVersion,hasOffA:!!body.state?.customers?.some(x=>x.id==='OFF-A'),customerIds:(body.state?.customers||[]).map(x=>x.id).slice(-20)});
      }
    });
    page.on('response',async res=>{
      if(res.request().method()==='PUT' && res.url().includes('/api/state')){
        let data={}; try{data=await res.json()}catch(e){}
        net.push({kind:'RES',status:res.status(),version:data.version,code:data.code,error:data.error});
      }
    });
    await page.goto(WEB+'/index.html');
    await page.waitForSelector('#loginLock',{timeout:15000});
    const before=await page.evaluate(async()=>{let h='';try{h=await fetch(serverBaseUrl()+'/api/health').then(r=>r.status+':'+r.ok)}catch(e){h='ERR:'+e.message}return{base:serverBaseUrl(),cfg:localStorage.getItem('biobesBackend'),health:h,token:!!serverToken}});
    console.log('DIAG',label,'before-login',JSON.stringify(before));
    await page.locator('#loginName').fill(ADMIN); await page.locator('#loginPass').fill(PASS);
    await page.locator('#loginLock button').filter({hasText:'Hyr'}).click();
    await page.waitForTimeout(5000);
    if(await page.locator('#loginLock').count()){
      const after=await page.evaluate(()=>({base:serverBaseUrl(),err:document.getElementById('loginError')?.innerText||'',token:!!serverToken,user:serverUser||null}));
      console.log('DIAG',label,'login-failed',JSON.stringify(after));
      console.log('API_LOG_TAIL',apiLog.split('\n').slice(-25).join('\n'));
      throw new Error('Cloud login failed for '+label+': '+JSON.stringify(after));
    }
    await page.waitForFunction(()=>!!serverToken,{timeout:5000});
    await page.waitForFunction(()=>serverVersion!==null && serverVersion!==undefined,{timeout:15000});
    console.log('PASS',label,'login cloud v'+await page.evaluate(()=>serverVersion));
    return {context,page,errors,net,label};
  }
  async function serverState(dev){
    const token=await dev.page.evaluate(()=>serverToken);
    const r=await fetch(API+'/api/state',{headers:{Authorization:'Bearer '+token}}); assert.equal(r.status,200); return r.json();
  }
  async function diag(dev,name){
    const d=await dev.page.evaluate(()=>({dirty:syncIsDirty(),serverOnline,serverVersion,syncPushInFlight:typeof syncPushInFlight==='undefined'?null:syncPushInFlight,syncPushQueued:typeof syncPushQueued==='undefined'?null:syncPushQueued,syncChangeSeq:typeof syncChangeSeq==='undefined'?null:syncChangeSeq,hasOffA:!!state.customers?.some(x=>x.id==='OFF-A'),status:document.getElementById('syncStatus')?.textContent||''}));
    console.log('DIAG',dev.label,name,JSON.stringify(d),'NET',JSON.stringify(dev.net.slice(-12)));
    return d;
  }
  async function addCustomer(dev,id,name){
    await dev.page.evaluate(({id,name})=>{state.customers=Array.isArray(state.customers)?state.customers:[]; if(!state.customers.some(x=>x.id===id))state.customers.push({id,code:id,name,balance:0}); save();},{id,name});
  }
  async function editCustomer(dev,id,name){
    await dev.page.evaluate(({id,name})=>{const x=(state.customers||[]).find(x=>x.id===id); if(!x)throw new Error('missing '+id); x.name=name; save();},{id,name});
  }
  async function waitSynced(dev){
    await dev.page.waitForFunction(()=>typeof syncIsDirty==='function' && !syncIsDirty() && serverOnline===true,{timeout:25000});
  }
  const A=await device('A'), B=await device('B');
  await addCustomer(A,'TWO-A','Nga pajisja A'); await waitSynced(A);
  let s=await serverState(A); assert.ok(s.state.customers.some(x=>x.id==='TWO-A')); console.log('PASS A -> server');
  await B.page.evaluate(()=>pollServerVersion());
  await B.page.waitForFunction(()=>state.customers?.some(x=>x.id==='TWO-A'),{timeout:15000}); console.log('PASS server -> B');

  await A.context.setOffline(true); await addCustomer(A,'OFF-A','Offline A');
  await A.page.waitForFunction(()=>syncIsDirty()===true,{timeout:5000}); await sleep(1200);
  assert.ok(await A.page.evaluate(()=>state.customers.some(x=>x.id==='OFF-A'))); console.log('PASS offline local retained');
  await diag(A,'before-reconnect'); A.net.length=0;
  await A.context.setOffline(false);
  await A.page.evaluate(()=>{window.dispatchEvent(new Event('online')); return pollServerVersion()});
  await waitSynced(A); await sleep(500); await diag(A,'after-reconnect');
  s=await serverState(A);
  assert.ok(s.state.customers.some(x=>x.id==='OFF-A')); console.log('PASS reconnect uploaded');

  await A.page.evaluate(()=>pullState()); await B.page.evaluate(()=>pullState());
  const va=await A.page.evaluate(()=>serverVersion), vb=await B.page.evaluate(()=>serverVersion); assert.equal(va,vb); console.log('PASS same base version',va);

  // Distinct records: stale client gets 409, auto-merges, retries, and preserves both records.
  B.net.length=0;
  await addCustomer(A,'CAS-A','CAS winner A'); await waitSynced(A);
  await addCustomer(B,'CAS-B','CAS stale B'); await waitSynced(B);
  s=await serverState(A);
  assert.ok(B.net.some(x=>x.kind==='RES'&&x.status===409),'expected B to observe a 409 before safe retry');
  assert.ok(s.state.customers.some(x=>x.id==='CAS-A'),'server lost accepted A record');
  assert.ok(s.state.customers.some(x=>x.id==='CAS-B'),'server lost safely merged B record');
  assert.ok(await B.page.evaluate(()=>state.customers.some(x=>x.id==='CAS-A')&&state.customers.some(x=>x.id==='CAS-B')),'B did not retain merged records');
  console.log('PASS distinct-record 409 auto-merge preserves A+B');

  // Same record: freeze B offline on the base version so conflict is deterministic.
  await addCustomer(A,'SAME','Base'); await waitSynced(A);
  await B.page.evaluate(()=>pullState());
  assert.equal(await B.page.evaluate(()=>state.customers.find(x=>x.id==='SAME')?.name),'Base');
  await B.context.setOffline(true);
  await editCustomer(A,'SAME','Edit A'); await waitSynced(A);
  B.net.length=0;
  await editCustomer(B,'SAME','Edit B');
  await B.page.waitForFunction(()=>syncIsDirty()===true,{timeout:5000});
  assert.equal(await B.page.evaluate(()=>state.customers.find(x=>x.id==='SAME')?.name),'Edit B');
  await B.context.setOffline(false);
  await B.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await B.page.waitForFunction(()=>document.getElementById('modal') && /Ndryshime më të reja|konflikt/i.test(document.getElementById('modal').innerText),{timeout:20000});
  assert.ok(B.net.some(x=>x.kind==='RES'&&x.status===409),'same-record edit did not hit CAS conflict');
  assert.equal(await B.page.evaluate(()=>state.customers.find(x=>x.id==='SAME')?.name),'Edit B','local same-record edit disappeared');
  s=await serverState(A);
  assert.equal(s.state.customers.find(x=>x.id==='SAME')?.name,'Edit A','stale B overwrote accepted A edit');
  console.log('PASS same-record conflict blocks silent overwrite');
  await B.page.evaluate(()=>syncTakeServer());
  await B.page.waitForFunction(()=>state.customers.find(x=>x.id==='SAME')?.name==='Edit A' && !syncIsDirty(),{timeout:10000});
  console.log('PASS explicit server-copy conflict resolution');

  // Single-flight queue: delay the first PUT, mutate again while it is in flight, and verify ordering + final persistence.
  await A.page.evaluate(()=>pullState());
  A.net.length=0; let delayed=false;
  await A.page.route('**/api/state',async route=>{
    if(route.request().method()==='PUT'&&!delayed){delayed=true;await sleep(1400)}
    await route.continue();
  });
  await addCustomer(A,'QUEUE-1','Queue first');
  await sleep(950);
  await addCustomer(A,'QUEUE-2','Queue second');
  await waitSynced(A); await A.page.unroute('**/api/state'); await sleep(250);
  const flow=A.net.filter(x=>x.kind==='REQ'||x.kind==='RES');
  const reqIdx=flow.map((x,i)=>x.kind==='REQ'?i:-1).filter(i=>i>=0);
  const firstRes=flow.findIndex(x=>x.kind==='RES');
  assert.ok(reqIdx.length>=2,'expected queued second PUT');
  assert.ok(reqIdx[1]>firstRes,'parallel PUT detected before first response');
  const firstReq=flow[reqIdx[0]], secondReq=flow[reqIdx[1]];
  assert.ok(firstReq.customerIds.includes('QUEUE-1')&&!firstReq.customerIds.includes('QUEUE-2'),'first snapshot was not isolated');
  assert.ok(secondReq.customerIds.includes('QUEUE-1')&&secondReq.customerIds.includes('QUEUE-2'),'queued snapshot missed second mutation');
  s=await serverState(A);
  assert.ok(s.state.customers.some(x=>x.id==='QUEUE-1')&&s.state.customers.some(x=>x.id==='QUEUE-2'),'queued mutations not persisted');
  console.log('PASS single-flight queue preserves second save');

  assert.deepEqual(A.errors,[]); assert.deepEqual(B.errors,[]);
  console.log('ALL PHASE1 CLOUD TESTS PASS');
  await A.context.close(); await B.context.close(); await browser.close(); api.kill('SIGTERM'); web.kill('SIGTERM'); await dbSrv.stop();
})().catch(e=>{console.error('PHASE1 CLOUD TEST FAIL:',e.stack);process.exit(1)});
