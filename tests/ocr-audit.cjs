/* Real OCR/PDF engines, served from npm copies of the CDN assets. No fake recognizer. */
const{open}=require('./helpers.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const assets=path.resolve(process.env.BIOBES_OCR_ASSETS||'.audit/node_modules');
for(const pkg of ['tesseract.js','tesseract.js-core','pdfjs-dist','@tesseract.js-data/eng'])assert.ok(fs.existsSync(path.join(assets,pkg)),`Missing ${pkg}: install test engines as described in tests/README.md`);
async function run(mobile){const{browser,context,page:p,errors}=await open(mobile);const requests=[];
try{
 await context.route(/https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|tessdata\.projectnaptha\.com)\//,async route=>{
   const url=route.request().url();requests.push(url);let file;
   if(url.includes('/tesseract.js@'))file=path.join(assets,'tesseract.js/dist',url.split('/').at(-1));
   else if(url.includes('/tesseract.js-core@'))file=path.join(assets,'tesseract.js-core',url.split('/').at(-1));
   else if(url.endsWith('/eng.traineddata.gz'))file=path.join(assets,'@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz');
   else if(url.includes('/pdf.js/3.11.174/'))file=path.join(assets,'pdfjs-dist/build',url.split('/').at(-1).replace('.min.js','.js'));
   if(!file||!fs.existsSync(file))throw Error('Unmapped OCR asset '+url+' → '+file);
   await route.fulfill({status:200,body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream',headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await p.evaluate(()=>loadOcrEngine());
 const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=320;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.font='52px Arial';ctx.fillStyle='black';ctx.fillText('GROSS: 102.0 KG',50,90);ctx.fillText('TARE: 2.0 KG',50,170);ctx.fillText('NET: 100.0 KG',50,250);return c.toDataURL()});
 await p.evaluate(()=>weighForm());await p.waitForTimeout(200);await p.locator('#wFile').setInputFiles({name:'scale.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});
 await p.waitForFunction(()=>pendingWeighOcr?.weights?.length,{},{timeout:90000});
 const scale=await p.evaluate(()=>pendingWeighOcr);assert.ok(scale.weights.includes(102),scale.raw);console.log('PASS real PNG OCR',scale.weights);
 const pdf=await p.evaluate(async()=>{const d=await PDFLib.PDFDocument.create();const page=d.addPage();page.drawText('COMMERCIAL INVOICE. Invoice No AUDIT-001. Supplier BioBes. Product Sage. NET WEIGHT 100 KG. GROSS WEIGHT 102 KG. Currency EUR. Date 2026-09-13.',{x:20,y:500,size:12,maxWidth:500});return [...await d.save()]});
 await p.evaluate(async bytes=>{const pages=await ocrPdfSet(new File([new Uint8Array(bytes)],'invoice.pdf',{type:'application/pdf'}),0,1);window.auditPdfPages=pages},pdf);
 assert.ok(await p.evaluate(()=>auditPdfPages[0].text.includes('AUDIT-001')));console.log('PASS real PDF text extraction');assert.deepEqual(errors,[]);
 const scanned=await p.evaluate(async src=>{const d=await PDFLib.PDFDocument.create(),img=await d.embedPng(src),page=d.addPage([1000,320]);page.drawImage(img,{x:0,y:0,width:1000,height:320});return [...await d.save()]},png);
 const scannedText=await p.evaluate(async bytes=>(await ocrPdfSet(new File([new Uint8Array(bytes)],'scanned.pdf',{type:'application/pdf'}),0,1))[0].text,scanned);assert.ok(scannedText.includes('102'),scannedText);console.log('PASS scanned PDF render + real OCR');
 await p.evaluate(()=>{closeModal();generateE2E();closeModal();go('exports')});
 await p.locator('#main').getByRole('button',{name:'Dokumentet',exact:true}).click();
 await p.locator('#documentSetFiles').setInputFiles({name:'audit-invoice.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)});
 await p.locator('#main').getByRole('button',{name:'Ngarko',exact:true}).click();
 await p.locator('#main').getByRole('button',{name:'Kontrollo',exact:true}).click();
 await p.waitForFunction(()=>documentSets().some(s=>s.files?.some(f=>f.name==='audit-invoice.pdf')&&s.status!=='Në përpunim'),{},{timeout:30000});
 const set=await p.evaluate(()=>documentSets().find(s=>s.files?.some(f=>f.name==='audit-invoice.pdf')));
 assert.equal(set.results.length,1);assert.ok(set.results[0].text.includes('AUDIT-001'));assert.ok(set.failCount>0,'Deliberately mismatched invoice must require correction');
 await p.locator('#main summary').filter({hasText:'Shiko gabimet'}).click();await p.locator('#main').getByRole('button',{name:'Shiko fushat',exact:true}).first().click();
 assert.ok((await p.locator('#modalBody').innerText()).includes('audit-invoice.pdf'));await p.evaluate(()=>closeModal());
 await p.locator('#main').getByRole('button',{name:'Arkiva',exact:true}).click();assert.ok((await p.locator('#main').innerText()).includes(set.id));
 await p.locator('#exportArchiveRows [data-row-actions]').first().click();await p.locator('#modal').getByRole('button',{name:'Hap setin',exact:true}).click();assert.ok((await p.locator('#modalBody').innerText()).includes('audit-invoice.pdf'));
 const dl=p.waitForEvent('download');await p.locator('#modal').getByRole('button',{name:'Shkarko',exact:true}).click();assert.deepEqual(fs.readFileSync(await(await dl).path()),Buffer.from(pdf));
 console.log('PASS export upload / real scan / mismatch / extraction / archive / download');assert.deepEqual(errors,[]);
 await p.evaluate(()=>closeModal());await p.locator('#main').getByRole('button',{name:'Dokumentet',exact:true}).click();
 await p.locator('#documentSetFiles').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});await p.locator('#main').getByRole('button',{name:'Kontrollo',exact:true}).click();
 await p.waitForFunction(()=>documentSets().some(s=>s.files?.some(f=>f.name==='broken.pdf')&&s.status==='Dështuar'));
 await p.waitForFunction(()=>!window.__biobesSetScanBusy);assert.ok((await p.locator('#exportBackgroundStatus').innerText()).includes('Kontrolli dështoi'));assert.deepEqual(errors,[]);console.log('PASS broken PDF is not falsely reported as successful');
 await p.evaluate(()=>{closeModal();supplierCard('TST-S001')});await p.locator('#modalFoot').getByRole('button',{name:/Printo/}).click();
 const printHtml=await p.locator('#biobesPrintFrame').evaluate(el=>el.contentDocument.documentElement.outerHTML);
 const printPage=await context.newPage();await printPage.setContent(printHtml);const printed=await printPage.pdf({path:'.audit/supplier-a4.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});await printPage.close();
 const paper=await p.evaluate(async bytes=>{const doc=await pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise,page=await doc.getPage(1),vp=page.getViewport({scale:1}),text=(await page.getTextContent()).items.map(i=>i.str).join(' '),canvas=document.createElement('canvas');canvas.width=vp.width;canvas.height=vp.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;return{pages:doc.numPages,width:vp.width,height:vp.height,text,png:canvas.toDataURL()}},[...printed]);
 assert.ok(Math.abs(paper.width-595.3)<2&&Math.abs(paper.height-841.9)<2);assert.equal(paper.pages,1);assert.match(paper.text,/Fatura gjithsej/i);assert.match(paper.text,/pagesa/i);fs.writeFileSync('.audit/supplier-a4.png',Buffer.from(paper.png.split(',')[1],'base64'));console.log('PASS supplier card rendered as one-page A4 PDF');assert.deepEqual(errors,[]);

 fs.writeFileSync(`.audit/ocr-${mobile?'mobile':'desktop'}.json`,JSON.stringify({status:'PASS',viewport:mobile?'mobile':'desktop',groups:6,weights:scale.weights,requests},null,2));
}finally{console.log('OCR requests',requests);console.log('OCR errors',errors);await browser.close()}
}
(async()=>{await run(false);await run(true)})().catch(e=>{console.error(e.stack);process.exitCode=1});
