// BioBes ERP — Render Free cold-start recovery v3.
(function(){
  if(window.__biobesColdStartV3)return;
  window.__biobesColdStartV3=true;
  document.title='BioBes ERP';

  window.__loginRetryDelays=[0,2500,5000,8000,12000,15000];
  window.__loginRetryTimeout=12000;

  const nativeUpdateSyncUI=updateSyncUI;
  const nativePullState=pullState;
  const nativePushState=pushState;
  const nativeAfterLocalLogin=afterLocalLogin;
  let wakeBusy=false;
  let wakeCooldownUntil=0;

  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

  function setSyncStatus(text){
    try{
      const el=document.getElementById('syncStatus');
      if(el)el.textContent=text;
    }catch(e){}
  }

  async function healthCheck(timeoutMs=12000){
    const base=serverBaseUrl();
    if(!base)return false;
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),timeoutMs);
    try{
      const r=await fetch(base+'/api/health',{cache:'no-store',signal:ctl.signal});
      if(!r.ok)return false;
      let j={};
      try{j=await r.json()}catch(e){}
      return !!(j&&j.ok===true&&j.db!==false);
    }catch(e){
      return false;
    }finally{
      clearTimeout(timer);
    }
  }

  function canWake(){
    try{return !!serverBaseUrl()&&!!serverToken&&!serverOnline}catch(e){return false}
  }

  async function wakeServerAndSync(){
    if(wakeBusy||!canWake()||Date.now()<wakeCooldownUntil)return false;
    wakeBusy=true;
    const waits=[0,2500,5000,8000,12000,15000,15000];
    try{
      for(let i=0;i<waits.length;i++){
        if(waits[i])await sleep(waits[i]);
        if(!canWake())return false;
        setSyncStatus('🟡 Duke u lidhur me serverin…'+(i?(' tentativa '+(i+1)+'/'+waits.length):''));
        if(await healthCheck()){
          let r={ok:false,offline:true};
          try{r=await nativePullState()}catch(e){}
          if((r&&r.ok)||serverOnline){
            wakeCooldownUntil=0;
            try{nativeUpdateSyncUI()}catch(e){}
            try{toast('Lidhja me serverin u rikthye')}catch(e){}
            return true;
          }
        }
      }
      wakeCooldownUntil=Date.now()+30000;
      try{nativeUpdateSyncUI()}catch(e){}
      return false;
    }finally{
      wakeBusy=false;
    }
  }

  updateSyncUI=function(){
    try{
      if(canWake()&&Date.now()>=wakeCooldownUntil){
        setSyncStatus('🟡 Duke u lidhur me serverin…');
        if(!wakeBusy)setTimeout(()=>wakeServerAndSync(),0);
        return;
      }
    }catch(e){}
    return nativeUpdateSyncUI();
  };

  pullState=async function(){
    if(canWake())setSyncStatus('🟡 Duke u lidhur me serverin…');
    const r=await nativePullState();
    if(r&&r.offline&&canWake()&&!wakeBusy)setTimeout(()=>wakeServerAndSync(),0);
    return r;
  };

  pushState=async function(force){
    const r=await nativePushState(force);
    if(canWake()&&!wakeBusy)setTimeout(()=>wakeServerAndSync(),0);
    return r;
  };

  afterLocalLogin=function(){
    try{normalizeState()}catch(e){}
    serverOnline=false;
    if(serverBaseUrl()){
      syncSetDirty(true);
      setSyncStatus('🟡 Serveri po zgjohet — puna po ruhet lokalisht');
      try{toast('Serveri po zgjohet — ndryshimet ruhen lokalisht derisa të rilidhet')}catch(e){}
      if(serverToken&&!wakeBusy)setTimeout(()=>wakeServerAndSync(),0);
      return;
    }
    return nativeAfterLocalLogin();
  };

  window.addEventListener('online',()=>{
    wakeCooldownUntil=0;
    if(canWake()&&!wakeBusy)wakeServerAndSync();
  });

  setInterval(()=>{
    if(canWake()&&!wakeBusy&&Date.now()>=wakeCooldownUntil)wakeServerAndSync();
  },30000);
})();
