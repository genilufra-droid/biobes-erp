// BioBes ERP — Render Free cold-start helper.
// UI-only resilience layer: keeps local work available while the API wakes,
// retries automatically, and restores normal sync when the server responds.
(function(){
  if(window.__biobesRenderWakePatch)return;
  window.__biobesRenderWakePatch=true;

  const baseUpdateSyncUI=updateSyncUI;
  const basePullState=pullState;
  const baseServerLogin=serverLogin;
  let waking=false;
  let exhaustedUntil=0;

  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

  function setStatus(text){
    try{
      const el=document.getElementById('syncStatus');
      if(el)el.textContent=text;
    }catch(e){}
  }

  async function pingServer(timeoutMs=12000){
    const base=serverBaseUrl();
    if(!base)return false;
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),timeoutMs);
    try{
      const r=await fetch(base+'/api/health',{cache:'no-store',signal:ctl.signal});
      if(!r.ok)return false;
      let j={};
      try{j=await r.json()}catch(e){}
      return j&&j.ok===true&&j.db!==false;
    }catch(e){
      return false;
    }finally{
      clearTimeout(timer);
    }
  }

  function canWake(){
    try{return !!serverBaseUrl()&&!!serverToken&&!serverOnline}catch(e){return false}
  }

  async function wakeAndSync(){
    if(waking||!canWake()||Date.now()<exhaustedUntil)return false;
    waking=true;
    const waits=[2500,4000,6000,8000,10000,10000,10000];
    try{
      for(let i=0;i<waits.length;i++){
        setStatus('🟡 Duke u lidhur me serverin…'+(i?(' tentativa '+(i+1)) : ''));
        if(await pingServer()){
          try{
            const r=await basePullState();
            if((r&&r.ok)||serverOnline){
              exhaustedUntil=0;
              try{baseUpdateSyncUI()}catch(e){}
              try{toast('Lidhja me serverin u rikthye')}catch(e){}
              return true;
            }
          }catch(e){}
        }
        await sleep(waits[i]);
      }
      exhaustedUntil=Date.now()+30000;
      try{baseUpdateSyncUI()}catch(e){}
      return false;
    }finally{
      waking=false;
    }
  }

  updateSyncUI=function(){
    try{
      if(canWake()&&Date.now()>=exhaustedUntil){
        setStatus('🟡 Duke u lidhur me serverin…');
        if(!waking)setTimeout(()=>wakeAndSync(),0);
        return;
      }
    }catch(e){}
    return baseUpdateSyncUI();
  };

  pullState=async function(){
    const r=await basePullState();
    if(r&&r.offline)wakeAndSync();
    return r;
  };

  serverLogin=async function(name,pass){
    let r=await baseServerLogin(name,pass);
    if(!r||!r.offline)return r;
    const msg=document.getElementById('loginError');
    if(msg)msg.textContent='Serveri po zgjohet — prisni pak…';
    const waits=[2500,4000,6000,8000,10000,10000];
    for(let i=0;i<waits.length;i++){
      if(await pingServer()){
        r=await baseServerLogin(name,pass);
        if(!r||!r.offline)return r;
      }
      if(msg)msg.textContent='Serveri po zgjohet — tentativa '+(i+2)+'…';
      await sleep(waits[i]);
    }
    if(msg)msg.textContent='Serveri nuk u arrit ende. Provoni përsëri pas pak.';
    return r;
  };

  window.addEventListener('online',()=>{
    exhaustedUntil=0;
    if(canWake())wakeAndSync();
  });

  setInterval(()=>{
    if(canWake()&&!waking&&Date.now()>=exhaustedUntil)wakeAndSync();
  },30000);
})();
