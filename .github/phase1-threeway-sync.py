from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')

def one(old,new,label):
    global s
    if old not in s:
        raise SystemExit(label+' target not found; refusing unsafe patch')
    s=s.replace(old,new,1)

# Add an in-memory accepted-server baseline and a deterministic three-way merge.
old='let syncPushInFlight=false,syncPushQueued=false,syncChangeSeq=0,syncConflictPending=false;'
new="""let syncPushInFlight=false,syncPushQueued=false,syncChangeSeq=0,syncConflictPending=false,syncBaseSnapshot=null,syncConflictLocal=null;
function syncClone(v){try{return JSON.parse(JSON.stringify(v))}catch(e){return v}}
function syncEq(a,b){try{return JSON.stringify(a)===JSON.stringify(b)}catch(e){return a===b}}
function syncMergeArray(base,local,remote,path,conflicts){
  base=Array.isArray(base)?base:[];local=Array.isArray(local)?local:[];remote=Array.isArray(remote)?remote:[];
  const keyed=a=>a.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&x.id!==undefined&&x.id!==null);
  if(!(keyed(base)&&keyed(local)&&keyed(remote))){
    const lc=!syncEq(local,base),rc=!syncEq(remote,base);
    if(lc&&rc&&!syncEq(local,remote)){conflicts.push(path);return syncClone(local)}
    return syncClone(lc?local:remote);
  }
  const bm=new Map(base.map(x=>[String(x.id),x])),lm=new Map(local.map(x=>[String(x.id),x])),rm=new Map(remote.map(x=>[String(x.id),x]));
  const ids=new Set([...bm.keys(),...lm.keys(),...rm.keys()]),chosen=new Map();
  for(const id of ids){
    const b=bm.get(id),l=lm.get(id),r=rm.get(id),lc=!syncEq(l,b),rc=!syncEq(r,b);
    if(lc&&rc&&!syncEq(l,r)){conflicts.push(path+'['+id+']');continue}
    const v=lc?l:r;
    if(v!==undefined)chosen.set(id,syncClone(v));
  }
  const out=[],seen=new Set();
  for(const x of remote){const id=String(x.id);if(chosen.has(id)&&!seen.has(id)){out.push(chosen.get(id));seen.add(id)}}
  for(const x of local){const id=String(x.id);if(chosen.has(id)&&!seen.has(id)){out.push(chosen.get(id));seen.add(id)}}
  for(const [id,x] of chosen){if(!seen.has(id))out.push(x)}
  return out;
}
function syncThreeWayMerge(base,local,remote){
  base=(base&&typeof base==='object')?base:{};local=(local&&typeof local==='object')?local:{};remote=(remote&&typeof remote==='object')?remote:{};
  const out={},conflicts=[],keys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  for(const k of keys){
    const b=base[k],l=local[k],r=remote[k];
    if(Array.isArray(b)||Array.isArray(l)||Array.isArray(r)){out[k]=syncMergeArray(b,l,r,k,conflicts);continue}
    const lc=!syncEq(l,b),rc=!syncEq(r,b);
    if(lc&&rc&&!syncEq(l,r)){conflicts.push(k);out[k]=syncClone(l)}else out[k]=syncClone(lc?l:r);
  }
  return{ok:conflicts.length===0,state:out,conflicts};
}"""
one(old,new,'merge helpers')

# Successful server pulls establish the baseline used for future local diffs.
one("skipPush=true;try{state=r.data.state;normalizeState();save()}finally{skipPush=false}syncSetDirty(false);serverOnline=true;updateSyncUI();return{ok:true}",
    "skipPush=true;try{state=r.data.state;normalizeState();save()}finally{skipPush=false}syncBaseSnapshot=syncClone(r.data.state);syncConflictLocal=null;syncSetDirty(false);serverOnline=true;updateSyncUI();return{ok:true}",
    'pull baseline')

# Capture the exact snapshot sent. Never let a concurrent pull mutate the payload being reconciled.
one("syncPushInFlight=true;let sentSeq=syncChangeSeq;try{let base=serverVersion;",
    "syncPushInFlight=true;let sentSeq=syncChangeSeq,sentState=syncClone(state);try{let base=serverVersion;",
    'sent snapshot')
one("body:JSON.stringify({state:state,baseVersion:base,wipeAck:wipeAckGet()})",
    "body:JSON.stringify({state:sentState,baseVersion:base,wipeAck:wipeAckGet()})",
    'send immutable snapshot')

old409="""if(r.status===409){syncConflictPending=true;syncPushQueued=false;if(r.data&&r.data.wiped){await honorServerWipe(r.data.wipedAt);return{ok:false,wiped:true}}let g=null;try{g=await apiCall('/api/state')}catch(e){}if(g&&g.ok)serverVersion=+g.data.version;syncSetDirty(true);serverOnline=true;updateSyncUI();showSyncConflict(g&&g.ok?g.data:null);return{ok:false,conflict:true}}"""
new409="""if(r.status===409){syncConflictPending=true;syncPushQueued=false;if(r.data&&r.data.wiped){await honorServerWipe(r.data.wipedAt);return{ok:false,wiped:true}}let g=null;try{g=await apiCall('/api/state')}catch(e){}if(g&&g.ok&&g.data&&g.data.state){serverVersion=+g.data.version;let m=syncThreeWayMerge(syncBaseSnapshot||{},sentState,g.data.state);if(m.ok){skipPush=true;try{state=m.state;normalizeState();save()}finally{skipPush=false}syncConflictLocal=null;syncConflictPending=false;syncPushQueued=true;syncSetDirty(true);serverOnline=true;updateSyncUI();return{ok:false,merged:true,pending:true}}syncConflictLocal=syncClone(sentState);skipPush=true;try{state=syncClone(sentState);normalizeState();save()}finally{skipPush=false}syncSetDirty(true);serverOnline=true;updateSyncUI();showSyncConflict(g.data);return{ok:false,conflict:true,fields:m.conflicts}}if(g&&g.ok)serverVersion=+g.data.version;syncConflictLocal=syncClone(sentState);syncSetDirty(true);serverOnline=true;updateSyncUI();showSyncConflict(g&&g.ok?g.data:null);return{ok:false,conflict:true}}"""
one(old409,new409,'409 three-way merge')

# Accepted writes advance only to the exact snapshot the server accepted.
one("serverVersion=+r.data.version;wipeAckSet(null);serverOnline=true;if(syncChangeSeq===sentSeq)",
    "serverVersion=+r.data.version;syncBaseSnapshot=syncClone(sentState);syncConflictLocal=null;wipeAckSet(null);serverOnline=true;if(syncChangeSeq===sentSeq)",
    'push baseline')

# Taking server updates baseline. Keeping local no longer performs a blind force-write; it rebases via three-way merge first.
one("serverVersion=sd.version;syncConflictPending=false;syncPushQueued=false;syncSetDirty(false);",
    "serverVersion=sd.version;syncBaseSnapshot=syncClone(sd.state);syncConflictLocal=null;syncConflictPending=false;syncPushQueued=false;syncSetDirty(false);",
    'take server baseline')
old_keep="async function syncKeepMine(){syncConflictPending=false;syncPushQueued=false;window._pendingServer=null;try{closeModal()}catch(e){}await pushState(true);render();if(!syncIsDirty())toast('Kopja juaj u ruajt')}"
new_keep="async function syncKeepMine(){let sd=window._pendingServer,local=syncConflictLocal||syncClone(state);if(!sd||!sd.state){try{let g=await apiCall('/api/state');if(g&&g.ok)sd=g.data}catch(e){}}if(!sd||!sd.state){toast('Nuk u arrit kopja e serverit');return}let m=syncThreeWayMerge(syncBaseSnapshot||{},local,sd.state);if(!m.ok){toast('Ka konflikt në të njëjtin rekord — zgjidh kopjen e serverit ose bëj backup');return}skipPush=true;try{state=m.state;normalizeState();save()}finally{skipPush=false}serverVersion=+sd.version;syncConflictPending=false;syncPushQueued=false;syncConflictLocal=null;window._pendingServer=null;syncSetDirty(true);try{closeModal()}catch(e){}await pushState(false);render();if(!syncIsDirty())toast('Ndryshimet u bashkuan dhe u ruajtën')}"
one(old_keep,new_keep,'safe keep mine')

required=['syncThreeWayMerge','sentState=syncClone(state)','state:sentState','merged:true','syncBaseSnapshot=syncClone(sentState)','Ndryshimet u bashkuan dhe u ruajtën']
for marker in required:
    if marker not in s: raise SystemExit('missing invariant '+marker)
p.write_text(s,encoding='utf-8')
print('safe three-way sync patch applied')
