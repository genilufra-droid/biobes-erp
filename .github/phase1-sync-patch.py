from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

if 'syncPushInFlight=false' not in text:
    start = text.find('async function pushState(force){')
    end = text.find('\nfunction startSyncPoll(){', start)
    if start < 0 or end < 0:
        raise SystemExit('sync markers not found; refusing to modify')

    new = """let syncPushInFlight=false,syncPushQueued=false,syncChangeSeq=0;
async function syncFetchServerVersion(){let r=await apiCall('/api/state/version');if(!r||!r.ok||r.data.version==null)throw new Error('version');serverVersion=+r.data.version;return serverVersion}
async function pushState(force){if(!serverBaseUrl()||!serverToken)return{ok:false};if(syncPushInFlight){syncPushQueued=true;syncSetDirty(true);updateSyncUI();return{ok:false,queued:true}}syncPushInFlight=true;let sentSeq=syncChangeSeq;try{let base=serverVersion;if(force||base===null||base===undefined||!Number.isFinite(+base))base=await syncFetchServerVersion();base=+base;let r=await apiCall('/api/state',{method:'PUT',body:JSON.stringify({state:state,baseVersion:base,wipeAck:wipeAckGet()})});if(r.status===401){serverToken=null;serverUser=null;try{sessionStorage.removeItem('biobesServerToken');sessionStorage.removeItem('biobesServerUser')}catch(e){}serverOnline=false;syncSetDirty(true);updateSyncUI();serverRelogin();return{ok:false,auth:true}}if(r.status===409){if(r.data&&r.data.wiped){await honorServerWipe(r.data.wipedAt);return{ok:false,wiped:true}}let g=null;try{g=await apiCall('/api/state')}catch(e){}if(g&&g.ok)serverVersion=+g.data.version;syncSetDirty(true);serverOnline=true;updateSyncUI();showSyncConflict(g&&g.ok?g.data:null);return{ok:false,conflict:true}}if(r.status===400||r.status===428){syncSetDirty(true);serverOnline=true;updateSyncUI();toast('Ruajtja u refuzua: '+((r.data&&r.data.error)||'të dhëna të pavlefshme'));return{ok:false,rejected:true}}if(!r.ok)throw new Error('net');serverVersion=+r.data.version;wipeAckSet(null);serverOnline=true;if(syncChangeSeq===sentSeq)syncSetDirty(false);else{syncSetDirty(true);syncPushQueued=true}updateSyncUI();return{ok:true,version:serverVersion}}catch(e){serverOnline=false;syncSetDirty(true);updateSyncUI();return{ok:false,offline:true}}finally{syncPushInFlight=false;if(syncPushQueued&&serverBaseUrl()&&serverToken){syncPushQueued=false;if(syncTimer)clearTimeout(syncTimer);syncTimer=setTimeout(()=>{pushState()},250)}}}
function queuePush(){if(skipPush)return;syncChangeSeq++;syncSetDirty(true);updateSyncUI();if(serverBaseUrl()&&!serverToken)return;if(!serverBaseUrl()||!serverToken)return;if(syncPushInFlight){syncPushQueued=true;return}if(syncTimer)clearTimeout(syncTimer);syncTimer=setTimeout(()=>{pushState()},800)}
let syncPollTimer=null,syncPolling=false;
async function pollServerVersion(){if(syncPolling||!serverBaseUrl()||!serverToken)return;syncPolling=true;try{if(syncIsDirty()){await pushState();return}let r=await apiCall('/api/state/version');if(!r||!r.ok||r.data.version==null)return;let v=+r.data.version;if(serverVersion==null||v>+serverVersion)await pullState()}catch(e){}finally{syncPolling=false}}
"""
    text = text[:start] + new + text[end:]

old_ui = "function updateSyncUI(){try{let el=document.getElementById('syncStatus');if(el)el.textContent=''}catch(e){}}"
if old_ui in text:
    new_ui = "function updateSyncUI(){try{let el=document.getElementById('syncStatus');if(!el)return;let t='';if(!serverBaseUrl())t='Lokal';else if(!serverToken)t='Pa sesion cloud';else if(syncPushInFlight)t='Po sinkronizohet…';else if(!serverOnline&&syncIsDirty())t='Offline • ndryshime në pritje';else if(!serverOnline)t='Offline';else if(syncIsDirty())t='Në pritje për sinkronizim';else t='Sinkronizuar';el.textContent=t;if(serverVersion!=null)el.title='Version serveri: '+serverVersion}catch(e){}}"
    text = text.replace(old_ui, new_ui, 1)

for forbidden in ['baseVersion:force?null:serverVersion']:
    if forbidden in text:
        raise SystemExit('unsafe sync marker remains: ' + forbidden)
for required in ['baseVersion:base', 'syncPushInFlight', 'syncPushQueued', 'Offline • ndryshime në pritje']:
    if required not in text:
        raise SystemExit('required marker missing: ' + required)

path.write_text(text, encoding='utf-8')
print('phase1 sync patch OK')
