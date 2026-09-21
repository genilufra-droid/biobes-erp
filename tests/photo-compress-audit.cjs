/* tests/photo-compress-audit.cjs — kompresim automatik i fotove: ≤1600px, JPEG ~70%
   në readAsData / readFileDataPromise; PDF/GIF/SVG dhe skedarët e vegjël mbeten siç janë.
   E2E: foto e madhe (>8MB) ruhet te artikulli pa u refuzuar, si JPEG i zvogëluar. */
const {open}=require('./helpers.cjs'),assert=require('node:assert/strict');
(async()=>{
 let passed=0,failed=0;
 const {browser,page:p,errors}=await open(false);
 const ev=(f,...a)=>p.evaluate(f,...a);
 async function step(name,fn){try{await fn();passed++;console.log('ok   -',name)}catch(e){failed++;console.log('FAIL -',name,'\n      ',(e.message||e).split('\n')[0])}}
 await p.waitForTimeout(1200);
 await ev(()=>{try{closeModal()}catch(e){}});
 // gjenerator foto zhurme brenda faqes
 await ev(()=>{window._mkNoisePng=async(w,h,name)=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d');const im=ctx.createImageData(w,h),d=im.data;for(let i=0;i<d.length;i+=4){d[i]=(Math.random()*255)|0;d[i+1]=(Math.random()*255)|0;d[i+2]=(Math.random()*255)|0;d[i+3]=255}ctx.putImageData(im,0,0);const blob=await new Promise(r=>cv.toBlob(r,'image/png'));return new File([blob],name||'foto.png',{type:'image/png'})};
  window._mkSolidPng=async(w,h)=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d');ctx.fillStyle='#3a7d44';ctx.fillRect(0,0,w,h);const blob=await new Promise(r=>cv.toBlob(r,'image/png'));return new File([blob],'e vogël.png',{type:'image/png'})};
  window._dims=du=>new Promise(r=>{const i=new Image();i.onload=()=>r({w:i.naturalWidth,h:i.naturalHeight});i.onerror=()=>r(null);i.src=du});
  window._bytes=du=>Math.round((du.length-du.indexOf(',')-1)*3/4);});

 await step('compressImageFile: PNG 1800x1200 → JPEG ≤1600px, më i vogël se origjinali',async()=>{
  const r=await ev(async()=>{const f=await window._mkNoisePng(1800,1200);const c=await compressImageFile(f);return{c:{width:c.width,height:c.height,head:c.dataUrl.slice(0,23),origSize:c.origSize,newSize:c.newSize}}});
  assert.equal(r.c.width,1600);assert.equal(r.c.height,1067);
  assert.equal(r.c.head,'data:image/jpeg;base64,');
  assert.ok(r.c.newSize<r.c.origSize*0.5,'kompresimi duhet të jetë ndjeshëm: '+r.c.newSize+' vs '+r.c.origSize);
 });

 await step('readAsData: foto e madhe kthehet si JPEG; tekst dhe GIF mbeten të paprekur',async()=>{
  const r=await ev(async()=>{
   const out={};
   const f=await window._mkNoisePng(1700,1000);
   out.img=await new Promise(res=>readAsData(f,res));
   const t=new File(['pershendetje'],'shenim.txt',{type:'text/plain'});
   out.txt=await new Promise(res=>readAsData(t,res));
   const g=new File([new Uint8Array([71,73,70,56,57,97,1,0,1,0])],'anim.gif',{type:'image/gif'});
   out.gif=await new Promise(res=>readAsData(g,res));
   return{imgHead:out.img.slice(0,23),imgBytes:window._bytes(out.img),origBytes:f.size,txtHead:out.txt.slice(0,22),gifHead:out.gif.slice(0,22)};
  });
  assert.equal(r.imgHead,'data:image/jpeg;base64,');
  assert.ok(r.imgBytes<r.origBytes*0.9,'readAsData nuk e zvogëloi: '+r.imgBytes+' vs '+r.origBytes);
  assert.equal(r.txtHead,'data:text/plain;base64');
  assert.equal(r.gifHead,'data:image/gif;base64,');
 });

 await step('readFileDataPromise: foto → JPEG e kompresuar',async()=>{
  const r=await ev(async()=>{const f=await window._mkNoisePng(1650,900);const du=await readFileDataPromise(f);return{head:du.slice(0,23),bytes:window._bytes(du),orig:f.size,d:await window._dims(du)}});
  assert.equal(r.head,'data:image/jpeg;base64,');
  assert.ok(r.bytes<r.orig*0.9);
  assert.ok(r.d.w<=1600&&r.d.h<=1600,'përmasat pas kompresimit: '+JSON.stringify(r.d));
 });

 await step('Foto e vogël PNG: nuk kompresohet (mbetet origjinali, skipped++)',async()=>{
  const r=await ev(async()=>{const s0=window._photoCompressStats.skipped;const f=await window._mkSolidPng(120,80);const du=await new Promise(res=>readAsData(f,res));return{head:du.slice(0,22),skipped:window._photoCompressStats.skipped-s0}});
  assert.equal(r.head,'data:image/png;base64,');
  assert.equal(r.skipped,1);
 });

 await step('E2E artikull: foto 2500x1800 (>8MB) pranohet dhe ruhet si JPEG ≤1600px',async()=>{
  await ev(()=>productFormV2(''));await p.waitForTimeout(400);
  await p.locator('#pfCode').fill('TESTPC1');await p.locator('#pfName').fill('Foto test kompresimi');
  const orig=await ev(async()=>{const f=await window._mkNoisePng(2500,1800,'foto e madhe.png');const dt=new DataTransfer();dt.items.add(f);document.getElementById('pfPhoto').files=dt.files;return f.size});
  assert.ok(orig>8*1024*1024,'fotoja e testit duhet >8MB, ishte '+orig);
  await p.locator('#saveProductV2').click();
  await p.waitForFunction(()=>{const x=(state.products||[]).find(q=>q.code==='TESTPC1');return x&&x.photoData},null,{timeout:20000});
  const r=await ev(async()=>{const x=state.products.find(q=>q.code==='TESTPC1');return{head:x.photoData.slice(0,23),bytes:window._bytes(x.photoData),d:await window._dims(x.photoData),name:x.name}});
  assert.equal(r.name,'Foto test kompresimi');
  assert.equal(r.head,'data:image/jpeg;base64,','photoData duhet JPEG');
  assert.ok(r.d.w<=1600&&r.d.h<=1600,'përmasat: '+JSON.stringify(r.d));
  assert.ok(r.bytes<orig*0.25,'ruajtja duhet shumë më e vogël: '+r.bytes+' vs '+orig);
 });

 await step('Statistikat: compressed≥3, newBytes < origBytes; pa gabime JS',async()=>{
  const s=await ev(()=>window._photoCompressStats);
  assert.ok(s.compressed>=3,'compressed='+s.compressed);
  assert.ok(s.newBytes<s.origBytes,'bytes: '+s.newBytes+' vs '+s.origBytes);
  console.log('      stats:',JSON.stringify(s));
  assert.deepEqual(errors,[]);
 });

 await browser.close();
 console.log(`\n${passed} passed, ${failed} failed`);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
