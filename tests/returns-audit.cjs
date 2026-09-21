/* Kthimet (klient & furnitor) — provë reale me klikime, pa shkruar në kutinë e kërkimit.
   Regresioni që mbulohet: kutia e kërkimit e një select-i bosh mbushej me tekstin e opsionit
   bosh ("Zgjidh faturën...") dhe ky tekst përdorej si filtër → lista dukej vetëm me atë rresht,
   fatura nuk mund të zgjidhej dhe ruajtja dilte gjithmonë me "Zgjidhni faturën...". */
const {open}=require('./helpers.cjs');
const assert=require('node:assert/strict');
(async()=>{
  const {browser,page,errors,close}=await open(false);
  const ev=(f,...a)=>page.evaluate(f,...a);
  let n=0;
  const step=async(name,fn)=>{n++;await fn();console.log('  ✔ '+n+'. '+name)};
  // zgjedh vetëm me klikime: hap kutinë, shiko listën, kliko rreshtin që përmban `match`
  const pick=async(id,match)=>{
    const box=page.locator('#'+id).locator('xpath=preceding-sibling::div[contains(@class,"global-live-search")][1]/input');
    assert.equal(await box.count(),1,id+': kutia e kërkimit mungon');
    await box.click();await page.waitForTimeout(300);
    const vis=page.locator('.global-live-option:visible');
    const texts=await vis.allInnerTexts();
    const i=texts.findIndex(t=>t.includes(match));
    assert.ok(i>=0,id+': opsioni "'+match+'" nuk shfaqet pa shkruar — lista: '+JSON.stringify(texts.slice(0,6)));
    await vis.nth(i).click();await page.waitForTimeout(350);
    return page.evaluate(s=>document.getElementById(s).value,id);
  };
  const boxValue=async id=>ev(s=>{const el=document.getElementById(s);const w=el.previousElementSibling;return w&&w.classList.contains('global-live-search')?w.querySelector('input').value:'(pa wrapper)'},id);

  try{
    await page.waitForTimeout(900);await close();
    const seed=await ev(()=>{
      const c=state.customers[0],pr=state.products[0],sup=state.suppliers[0];
      const lot=(state.lots||[])[0];lot.product=pr.id;lot.net=50;lot.availableNet=50;lot.packedNet=0;lot.status='Aktiv';
      salesInvoices().push({id:'RET-AUD-SALE',invoiceNumber:'FSH-AUD-1',date:'2026-09-15',customer:c.id,currency:'ALL',exchangeRate:1,vat:20,status:'Konfirmuar',documentType:'FSH',lines:[{product:pr.id,net:100,price:120}]});
      purchaseInvoices().push({id:'RET-AUD-PUR',supplierInvoiceNo:'FUR-AUD-1',date:'2026-09-10',supplier:sup.id,product:pr.id,currency:'ALL',exchangeRate:1,vat:20,status:'Konfirmuar',price:90,total:9000});
      save();
      return {cust:c.code,sup:sup.code,lot:lot.id,net0:lot.net,prod:pr.id};
    });

    await step('Modali i kthimit nga klienti: select-et bosh nuk mbushin kutinë me tekstin "Zgjidh faturën..."',async()=>{
      await ev(()=>customerReturnForm());await page.waitForTimeout(700);
      assert.equal(await boxValue('crCustomer'),'');
      assert.equal(await boxValue('crInvoice'),'');
    });
    await step('Klienti zgjedh faturën pa shkruar asnjë shkronjë (lista shfaqet e plotë)',async()=>{
      assert.equal(await pick('crCustomer',seed.cust),await ev(()=>state.customers[0].id));
      assert.equal(await pick('crInvoice','FSH-AUD-1'),'RET-AUD-SALE');
      assert.equal(await ev(()=>document.querySelectorAll('#crLines tr').length),1);
      assert.equal(await ev(()=>document.querySelector('#crLines .ret-qty').value),'');
    });
    await step('Konfirmo kthimin e klientit: ruhet, rritet stoku dhe shfaqet njoftimi',async()=>{
      await page.locator('#crLines .ret-qty').fill('20');
      await page.locator('#crReason').fill('Kthim auditimi');
      await page.locator('#modalFoot button').filter({hasText:'Konfirmo kthimin'}).click();
      await page.waitForTimeout(1200);
      assert.equal(await ev(()=>document.getElementById('toast').innerText),'Kthimi u konfirmua');
      const r=await ev(()=>(state.customerReturns||[]).at(-1));
      assert.equal(r.status,'Konfirmuar');assert.equal(r.invoice,'RET-AUD-SALE');
      assert.equal(r.lines[0].qty,20);assert.equal(r.lines[0].lot,seed.lot);
      assert.equal(await ev(id=>lotAvail(by('lots',id)),seed.lot),seed.net0+20);
    });
    await step('Mbyllja e modalit pastron ekranin dhe nuk lë gabime',async()=>{
      assert.equal(await page.locator('#modalBody').innerHTML(),'');
    });
    await step('Modali i kthimit te furnitori: kutitë e kërkimit janë të pastra',async()=>{
      await ev(()=>supplierReturnForm());await page.waitForTimeout(700);
      assert.equal(await boxValue('srSupplier'),'');
      assert.equal(await boxValue('srInvoice'),'');
    });
    await step('Furnitori zgjedh faturën pa shkruar asnjë shkronjë',async()=>{
      assert.equal(await pick('srSupplier',seed.sup),await ev(()=>state.suppliers[0].id));
      assert.equal(await pick('srInvoice','FUR-AUD-1'),'RET-AUD-PUR');
      assert.equal(await ev(()=>document.querySelectorAll('#srLines tr').length),1);
    });
    await step('Konfirmo kthimin te furnitori: ruhet, zbret stoku i lotit',async()=>{
      await page.locator('#srLines .ret-qty').fill('15');
      await page.locator('#srReason').fill('Kthim auditimi furnitor');
      await page.locator('#modalFoot button').filter({hasText:'Konfirmo kthimin'}).click();
      await page.waitForTimeout(1200);
      assert.equal(await ev(()=>document.getElementById('toast').innerText),'Kthimi te furnitori u konfirmua');
      const r=await ev(()=>(state.supplierReturns||[]).at(-1));
      assert.equal(r.status,'Konfirmuar');assert.equal(r.invoice,'RET-AUD-PUR');assert.equal(r.lines[0].qty,15);
      assert.equal(await ev(id=>lotAvail(by('lots',id)),seed.lot),seed.net0+20-15);
    });
    await step('Pa faturë të zgjedhur, njoftimi tregon saktësisht çka mungon (jo më mesazh i përbashkët)',async()=>{
      await ev(()=>customerReturnForm());await page.waitForTimeout(600);
      await page.locator('#crReason').fill('Arsye pa faturë');
      await page.locator('#modalFoot button').filter({hasText:'Konfirmo kthimin'}).click();
      await page.waitForTimeout(500);
      assert.equal(await ev(()=>document.getElementById('toast').innerText),'Zgjidhni klientin dhe faturën origjinale');
      assert.equal(await ev(()=>document.querySelectorAll('#crLines tr').length),0);
      assert.equal((await ev(()=>(state.customerReturns||[]).length)),1);
    });
    await step('Fatura e zgjedhur pa arsye → njoftim për arsyen; pa sasi → njoftim për sasinë',async()=>{
      await ev(()=>closeModal());await ev(()=>customerReturnForm());await page.waitForTimeout(600);
      assert.equal(await ev(()=>$val('crReason')),'');
      await pick('crCustomer',seed.cust);await pick('crInvoice','FSH-AUD-1');
      await page.locator('#modalFoot button').filter({hasText:'Konfirmo kthimin'}).click();
      await page.waitForTimeout(400);
      assert.equal(await ev(()=>document.getElementById('toast').innerText),'Shkruani arsyen e kthimit');
      await page.locator('#crReason').fill('Arsye ok');
      await page.locator('#modalFoot button').filter({hasText:'Konfirmo kthimin'}).click();
      await page.waitForTimeout(400);
      assert.equal(await ev(()=>document.getElementById('toast').innerText),'Vendosni sasinë e kthimit për të paktën një produkt');
      assert.equal(await ev(()=>(state.customerReturns||[]).length),1);
    });
    await step('Drafti ruhet pa konfirmim dhe nuk prek stokun',async()=>{
      const before=await ev(id=>lotAvail(by('lots',id)),seed.lot);
      await page.locator('#crLines .ret-qty').fill('5');
      await page.locator('#modalFoot button').filter({hasText:'Ruaj Draft'}).click();
      await page.waitForTimeout(900);
      assert.equal(await ev(()=>document.getElementById('toast').innerText),'Drafti u ruajt');
      assert.equal(await ev(()=>(state.customerReturns||[]).at(-1).status),'Draft');
      assert.equal(await ev(id=>lotAvail(by('lots',id)),seed.lot),before);
    });
    await step('Sasia mbi të shiturën bllokohet me njoftim të qartë',async()=>{
      await ev(()=>customerReturnForm());await page.waitForTimeout(600);
      await pick('crCustomer',seed.cust);await pick('crInvoice','FSH-AUD-1');
      await page.locator('#crLines .ret-qty').fill('500');
      await page.locator('#crReason').fill('Mbi sasinë');
      await page.locator('#modalFoot button').filter({hasText:'Konfirmo kthimin'}).click();
      await page.waitForTimeout(500);
      assert.equal(await ev(()=>document.getElementById('toast').innerText),'Sasia e kthimit tejkalon sasinë e shitur');
    });
    await step('Klienti pa fatura të konfirmuara shfaq njoftim të qartë',async()=>{
      const code=await ev(()=>{const c={id:'RET-NOFAT-1',code:'K-999',name:'Klient pa fatura',type:'customer',currency:'ALL'};state.customers.push(c);save();return c.code});
      await ev(()=>closeModal());await ev(()=>customerReturnForm());await page.waitForTimeout(600);
      await pick('crCustomer',code);await page.waitForTimeout(400);
      assert.equal(await ev(()=>document.getElementById('toast').innerText),'Ky klient nuk ka fatura të konfirmuara për kthim');
      assert.equal(await ev(()=>{const s=document.getElementById('crInvoice');return s.options.length}),1);
    });
    await step('Pa gabime JS në gjithë provën',async()=>{assert.deepEqual(errors,[])});
    console.log('\nKthimet (klient & furnitor): '+n+'/'+n+' hapa OK\n');
  }catch(e){console.error('\n✗ Dështoi në hapin '+(n+1)+': '+e.message);if(errors.length)console.error('Gabime JS:',errors.slice(0,3));await browser.close();process.exit(1)}
  await browser.close();
})();
