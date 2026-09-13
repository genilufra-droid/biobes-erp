const {open}=require('./helpers.cjs'),assert=require('node:assert/strict'),fs=require('node:fs');
fs.mkdirSync('.audit',{recursive:true});
(async()=>{for(const mobile of [false,true]){
 const{browser,page:p,errors,close,choose}=await open(mobile);const results=[];
 const b=name=>p.locator('#modal').getByRole('button',{name,exact:true});
 async function step(name,fn){try{await close();await fn();await p.waitForTimeout(250);assert.deepEqual(errors,[]);results.push({name,status:'PASS'});console.log('PASS',mobile?'mobile':'desktop',name)}catch(e){results.push({name,status:'FAIL',error:e.stack,console:errors});console.error('FAIL',name,e.message);console.log(await p.locator('#modal').innerText());console.log('TOAST',await p.locator('#toast').innerText());throw e}}
 try{
 let sample,order,process,pack,shipment;
 await step('Create and edit product with photo through UI',async()=>{
   const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;return c.toDataURL()});
   await p.evaluate(()=>productFormV2());await p.locator('#pfCode').fill('AUDIT-P');await p.locator('#pfName').fill('Produkt prove');await p.locator('#pfPurchasePrice').fill('150');
   await p.locator('#pfPhoto').setInputFiles({name:'product.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});await b('Ruaj artikullin').click();await p.waitForTimeout(250);
   const product=await p.evaluate(()=>state.products.find(x=>x.code==='AUDIT-P'));assert.ok(product?.photoData?.startsWith('data:image/png'));assert.equal(product.purchasePrice,150);await close();
   await p.evaluate(id=>productFormV2(id),product.id);await p.locator('#pfName').fill('Produkt prove i ndryshuar');await b('Ruaj artikullin').click();await p.waitForTimeout(200);assert.equal(await p.evaluate(id=>by('products',id).name,product.id),'Produkt prove i ndryshuar');
 });
 await step('Create warehouse and rack; print isolated lot label',async()=>{
   await p.evaluate(()=>go('warehouse'));await p.locator('#main').getByRole('button',{name:'+ Magazinë',exact:true}).click();await p.locator('#sfCode').fill('AUDIT-WH');await p.locator('#sfName').fill('Magazina e testit');await b('Ruaj').click();const wh=await p.evaluate(()=>state.warehouses.at(-1));assert.equal(wh.code,'AUDIT-WH');
   await p.locator('#main').getByRole('button',{name:'+ Raft',exact:true}).click();await choose('sfWarehouse',wh.id);await p.locator('#sfCode').fill('AUDIT-R');await p.locator('#sfName').fill('Rafti i testit');await b('Ruaj').click();assert.equal(await p.evaluate(()=>state.racks.at(-1).warehouse),wh.id);
   await p.evaluate(()=>lotCard('L1'));await b('Printo etiketën').click();assert.equal(await p.locator('#biobesPrintFrame').count(),1);assert.ok(await p.locator('#biobesPrintFrame').evaluate(el=>el.contentDocument.body.innerText.includes('B1S01/1-105-26')));
 });

 await step('Create approved sample through UI',async()=>{
   await p.evaluate(()=>sampleForm());await choose('sCustomer','C1');await choose('sProduct','P105');await choose('sLot','L1');await choose('sStatus','E aprovuar');await p.locator('#sTrack').fill('UI-TRACK-001');await b('Ruaj').click();await p.waitForTimeout(250);
   sample=await p.evaluate(()=>state.samples.at(-1));assert.equal(sample.product,'P105');assert.equal(sample.customer,'C1');assert.equal(sample.status,'E aprovuar');assert.equal(sample.tracking,'UI-TRACK-001');
 });
 await step('Create order linked to sample and open operational card',async()=>{
   await p.evaluate(()=>orderForm());await choose('oCustomer','C1');await choose('oProduct','P105');await choose('oSample',sample.id);await p.locator('#oQty').fill('50');await b('Ruaj porosinë').click();await p.waitForTimeout(250);
   order=await p.evaluate(()=>state.orders.at(-1));assert.equal(order.items[0].product,'P105');assert.equal(+order.items[0].qty,50);await p.evaluate(id=>orderCard(id),order.id);assert.ok((await p.locator('#modalBody').innerText()).includes('50'));
 });
 await step('Create multi-lot process through UI; raw stock actually decreases',async()=>{
   await p.evaluate(()=>processForm());await choose('prOrder',order.id);await choose('prProduct','P105');await choose('prMachine','M1');await p.locator('#prInput').fill('60');await p.locator('#prOutput').fill('50');await choose('prAddLot','L1');await b('+ Shto lot').click();await b('Fillo procesin').click();await p.waitForTimeout(250);
   process=await p.evaluate(()=>state.processes.at(-1));assert.ok(process?.id);assert.equal(+process.input,60);assert.equal(+process.output,50);assert.equal(await p.evaluate(()=>lotAvail(by('lots','L1'))),1140);
 });
 await step('Package output via source picker; open label and edit form',async()=>{
   await p.evaluate(()=>packagingForm());await choose('pkOrder',order.id);await choose('pkProduct','P105');await p.locator('#pkBags').fill('5');await p.locator('#pkBagWeight').fill('10');await p.locator('#pkInternal').fill('UI-LOT-FIN');await b('+ Shto lot').click();await p.waitForTimeout(250);
   const outputLot=process.outputLot;assert.ok(outputLot);
   await p.locator('#pkLotOverlay [data-add-lot="'+outputLot+'"]').click();
   if(await p.locator('#pkLotClose').count())await p.locator('#pkLotClose').click();
   await b('Ruaj & krijo etiketën').click();await p.waitForTimeout(300);
   pack=await p.evaluate(()=>packs().at(-1));assert.ok(pack?.id);assert.equal(pack.net,50);assert.ok(pack.sourceLots.includes(outputLot));
   assert.ok((await p.locator('#modal').innerText()).includes('UI-LOT-FIN'));await close();
   await p.evaluate(id=>packagingEditForm(id),pack.id);await p.waitForTimeout(220);await p.locator('#peCustomer').fill('UI-CLIENT-LOT');await b('Ruaj ndryshimet').click();await p.waitForTimeout(220);assert.equal(await p.evaluate(id=>packs().find(x=>x.id===id).customerLot,pack.id),'UI-CLIENT-LOT');

 });
 await step('Create shipment through UI and advance to loaded',async()=>{
   await p.evaluate(()=>shipmentForm());await choose('shOrderAdd',order.id);await b('+ Shto porosi').click();await p.locator('#shPlate').fill('AA 123 UI');await p.locator('#shCarrier').fill('Audit Transport');await p.locator('#shGross').fill('52');
   assert.equal(await p.locator('#shNet').inputValue(),'50');await b('Krijo ngarkesën').click();await p.waitForTimeout(300);shipment=await p.evaluate(()=>state.shipments.at(-1));assert.ok(shipment?.id);assert.equal(shipment.status,'Planifikuar');
   await p.evaluate(id=>shipmentCard(id),shipment.id);for(const stage of ['Në ngarkim','Ngarkuar']){await b('Kalo në: '+stage+' →').click();await p.waitForTimeout(250);assert.equal(await p.evaluate(id=>by('shipments',id).status,shipment.id),stage)}
   const before=await p.evaluate(()=>state.shipments.length);await close();await p.evaluate(()=>shipmentForm());await b('Krijo ngarkesën').click();assert.equal(await p.evaluate(()=>state.shipments.length),before);

 });
 }finally{fs.writeFileSync(`.audit/operations-${mobile?'mobile':'desktop'}.json`,JSON.stringify(results,null,2));await browser.close()}
}})().catch(e=>{console.error(e.stack);process.exitCode=1});
