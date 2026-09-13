from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

old_guard = "if(qty>lotUnpacked(lot)+.001)return coreResult(false,'Paketimi tejkalon stokun e papaketuar të lotit '+lot.code+' (të lira '+fmt2(lotUnpacked(lot))+' kg)');"
new_guard = "if(qty>lotUnpacked(lot)+.001&&!(window.__pkStockOverrideLots&&+window.__pkStockOverrideLots[lot.id]>=qty-.001))return coreResult(false,'Paketimi tejkalon stokun e papaketuar të lotit '+lot.code+' (të lira '+fmt2(lotUnpacked(lot))+' kg)');"
if old_guard not in s:
    if new_guard not in s:
        raise SystemExit('corePackage stock guard not found')
else:
    s = s.replace(old_guard, new_guard, 1)

old_call = "const r = atomicTransaction('Paketim', ()=> corePackage(data));\n    if(!r || !r.ok) return toast((r&&r.error)||'Paketimi dështoi');"
new_call = """let r;
    try{
      if(adminOverride){
        window.__pkStockOverrideLots = {};
        adminOverride.overruns.forEach(x=> window.__pkStockOverrideLots[x.lot] = +x.qty);
      }
      r = atomicTransaction('Paketim', ()=> corePackage(data));
    } finally {
      try{ delete window.__pkStockOverrideLots; }catch(e){ window.__pkStockOverrideLots = null; }
    }
    if(!r || !r.ok) return toast((r&&r.error)||'Paketimi dështoi');"""
if old_call not in s:
    if "delete window.__pkStockOverrideLots" not in s:
        raise SystemExit('savePackaging corePackage call not found')
else:
    s = s.replace(old_call, new_call, 1)

# Ensure the permit is transient only and is never serialized in the audit object.
checks = [
    'window.__pkStockOverrideLots',
    'delete window.__pkStockOverrideLots',
    "data.user.role!=='ROLE-ADMIN'",
    "const reason=box.querySelector('#pkAdminReason').value.trim()",
    "pw.value=''",
]
missing = [x for x in checks if x not in s]
if missing:
    raise SystemExit('Missing core override markers: ' + repr(missing))

p.write_text(s, encoding='utf-8')
print('Core packaging admin override patch PASS')
