from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')

def one(old,new,label):
    global s
    if old not in s:
        raise SystemExit(label+' target not found; refusing unsafe patch')
    s=s.replace(old,new,1)

# Reconnect must push dirty local work before any pull.
if 'if(syncIsDirty())r=await nativePushState();' not in s:
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
    one(old,new,'reconnect ordering')

# A 409 is a hard synchronization barrier. No queued retry/pull may proceed until resolved.
one('let syncPushInFlight=false,syncPushQueued=false,syncChangeSeq=0;',
    'let syncPushInFlight=false,syncPushQueued=false,syncChangeSeq=0,syncConflictPending=false;',
    'sync conflict state')
one("async function pushState(force){if(!serverBaseUrl()||!serverToken)return{ok:false};if(syncPushInFlight)",
    "async function pushState(force){if(!serverBaseUrl()||!serverToken)return{ok:false};if(syncConflictPending&&!force){syncSetDirty(true);updateSyncUI();return{ok:false,conflict:true,pending:true}}if(syncPushInFlight)",
    'push conflict guard')
one("if(r.status===409){if(r.data&&r.data.wiped)",
    "if(r.status===409){syncConflictPending=true;syncPushQueued=false;if(r.data&&r.data.wiped)",
    '409 barrier')
one("if(syncPushQueued&&serverBaseUrl()&&serverToken){syncPushQueued=false;",
    "if(syncPushQueued&&!syncConflictPending&&serverBaseUrl()&&serverToken){syncPushQueued=false;",
    'queued retry barrier')
one("function queuePush(){if(skipPush)return;syncChangeSeq++;syncSetDirty(true);updateSyncUI();if(serverBaseUrl()&&!serverToken)return;",
    "function queuePush(){if(skipPush)return;syncChangeSeq++;syncSetDirty(true);updateSyncUI();if(syncConflictPending)return;if(serverBaseUrl()&&!serverToken)return;",
    'queue conflict guard')
one("async function pollServerVersion(){if(syncPolling||!serverBaseUrl()||!serverToken)return;",
    "async function pollServerVersion(){if(syncPolling||syncConflictPending||!serverBaseUrl()||!serverToken)return;",
    'poll conflict guard')
one("function showSyncConflict(sd){serverOnline=true;updateSyncUI();window._pendingServer=sd||null;",
    "function showSyncConflict(sd){syncConflictPending=true;syncPushQueued=false;serverOnline=true;updateSyncUI();window._pendingServer=sd||null;",
    'show conflict barrier')
one("serverVersion=sd.version;syncSetDirty(false);serverOnline=true;window._pendingServer=null;",
    "serverVersion=sd.version;syncConflictPending=false;syncPushQueued=false;syncSetDirty(false);serverOnline=true;window._pendingServer=null;",
    'take server release')
one("async function syncKeepMine(){window._pendingServer=null;try{closeModal()}catch(e){}await pushState(true);",
    "async function syncKeepMine(){syncConflictPending=false;syncPushQueued=false;window._pendingServer=null;try{closeModal()}catch(e){}await pushState(true);",
    'keep mine release')

required=[
 'syncConflictPending=false',
 'if(syncConflictPending&&!force)',
 'syncConflictPending=true;syncPushQueued=false',
 'syncPushQueued&&!syncConflictPending',
 'if(syncIsDirty())r=await nativePushState();'
]
for marker in required:
    if marker not in s: raise SystemExit('missing invariant: '+marker)
p.write_text(s,encoding='utf-8')
print('reconnect conflict barrier patched')
