from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="let r=await apiCall('/api/state/version');if(!r||!r.ok||r.data.version==null)return;let v=+r.data.version;if(serverVersion==null||v>+serverVersion)await pullState()"
new="let r=await apiCall('/api/state/version');if(!r||!r.ok||r.data.version==null)return;if(r.data.wipedAt&&wipeAckGet()!==r.data.wipedAt){await pullState();return}let v=+r.data.version;if(serverVersion==null||v>+serverVersion)await pullState()"
if old not in s: raise SystemExit('pollServerVersion target not found')
s=s.replace(old,new,1)
if "r.data.wipedAt&&wipeAckGet()!==r.data.wipedAt" not in s: raise SystemExit('wipe poll guard missing')
p.write_text(s,encoding='utf-8')
print('frontend wipe epoch polling patched')
