from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="async function honorServerWipe(wipedAt){if(!wipedAt)return false;if(!localHasBusinessData())"
new="async function honorServerWipe(wipedAt){if(!wipedAt)return false;if(wipeAckGet()===wipedAt)return false;if(!localHasBusinessData())"
if old not in s: raise SystemExit('honorServerWipe target not found')
s=s.replace(old,new,1)
old2='serverVersion=+r.data.version;syncBaseSnapshot=syncClone(sentState);syncConflictLocal=null;wipeAckSet(null);serverOnline=true;'
new2='serverVersion=+r.data.version;syncBaseSnapshot=syncClone(sentState);syncConflictLocal=null;serverOnline=true;'
if old2 not in s: raise SystemExit('wipeAckSet(null) target not found')
s=s.replace(old2,new2,1)
if 'wipeAckGet()===wipedAt' not in s: raise SystemExit('ack guard missing')
p.write_text(s,encoding='utf-8')
print('persistent wipe acknowledgement patched')
