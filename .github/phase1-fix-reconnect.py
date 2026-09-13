from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="""        if(await healthCheck()){
          let r={ok:false,offline:true};
          try{r=await nativePullState()}catch(e){}
          if((r&&r.ok)||serverOnline){
            wakeCooldownUntil=0;
            try{nativeUpdateSyncUI()}catch(e){}
            try{toast('Lidhja me serverin u rikthye')}catch(e){}
            return true;
          }
        }
"""
new="""        if(await healthCheck()){
          let r={ok:false,offline:true};
          try{
            if(syncIsDirty())r=await nativePushState();
            else r=await nativePullState();
          }catch(e){}
          if(r&&r.conflict){
            serverOnline=true;
            try{nativeUpdateSyncUI()}catch(e){}
            return false;
          }
          if(r&&r.ok&&!r.offline){
            wakeCooldownUntil=0;
            try{nativeUpdateSyncUI()}catch(e){}
            try{toast('Lidhja me serverin u rikthye')}catch(e){}
            return true;
          }
        }
"""
if old not in s:
    raise SystemExit('target block not found; refusing unsafe patch')
s=s.replace(old,new,1)
if s.count('if(syncIsDirty())r=await nativePushState();')!=1:
    raise SystemExit('patch invariant failed')
p.write_text(s,encoding='utf-8')
print('reconnect ordering patched')
