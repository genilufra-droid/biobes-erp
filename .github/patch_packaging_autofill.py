from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="""        const c = packSourceContainer(prefix);
        const oldMap = packSourceOldMap(prefix);
        // Sasinë e shkruan përdoruesi — rreshti shtohet BOSH, asnjë para-mbushje/ndarje automatike.
        const tbody = document.querySelector(`[data-pack-rows=\"${prefix}\"]`);
        if(tbody){
          tbody.insertAdjacentHTML('beforeend', packSourceRowHtml(prefix, lotId, '', oldMap));
          try{ const ni=tbody.lastElementChild.querySelector('[data-pack-qty]'); if(ni) setTimeout(()=>{ try{ ni.focus(); }catch(e){} }, 50); }catch(e){}
          const lot = by('lots', lotId);"""
new="""        const c = packSourceContainer(prefix);
        const oldMap = packSourceOldMap(prefix);
        // Auto-sugjerim: minimumi mes stokut të lirë dhe KG që mbeten për paketim.
        // Pas shtimit fusha mbetet plotësisht editable; packSourceSum nuk e mbishkruan vlerën.
        const totalNeeded = ($num(prefix+'Bags',0))*($num(prefix+'BagWeight',0));
        const alreadyTaken = packSourceRows(prefix).reduce((a,r)=>a+(parseFloat(r.querySelector('[data-pack-qty]')?.value)||0),0);
        const remaining = Math.max(0, Math.round((totalNeeded-alreadyTaken)*1000)/1000);
        const lotForAuto = by('lots', lotId);
        const freeForAuto = lotForAuto && lotForAuto.id ? pkFree(lotForAuto, oldMap) : 0;
        const autoQty = Math.round(Math.min(freeForAuto, remaining>0?remaining:freeForAuto)*1000)/1000;
        const tbody = document.querySelector(`[data-pack-rows=\"${prefix}\"]`);
        if(tbody){
          tbody.insertAdjacentHTML('beforeend', packSourceRowHtml(prefix, lotId, autoQty, oldMap));
          try{ const ni=tbody.lastElementChild.querySelector('[data-pack-qty]'); if(ni) setTimeout(()=>{ try{ ni.focus(); ni.select(); }catch(e){} }, 50); }catch(e){}
          const lot = by('lots', lotId);"""
if old not in s:
    raise SystemExit('Expected current-main lot insertion block not found')
s=s.replace(old,new,1)
checks=[
 "const autoQty = Math.round(Math.min(freeForAuto, remaining>0?remaining:freeForAuto)*1000)/1000;",
 "packSourceRowHtml(prefix, lotId, autoQty, oldMap)",
 "oninput=\"packSourceSum('${prefix}')\"",
 "PACK_OVER_STOCK",
 "verifyAdminPassword(pass)",
 "reason.length<5",
 "data.overStock&&data.overStock.authorizedBy&&data.overStock.reason"
]
missing=[x for x in checks if x not in s]
if missing: raise SystemExit('Missing packaging invariants: '+repr(missing))
p.write_text(s,encoding='utf-8')
print('Packaging autofill patch PASS')
