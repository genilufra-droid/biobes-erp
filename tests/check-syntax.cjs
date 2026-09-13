const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const file=process.argv[2]||'index.html',html=fs.readFileSync(file,'utf8'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'biobes-syntax-'));
let count=0,failed=0;
try{
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    if(/\bsrc=/.test(match[1])||(/\btype=/.test(match[1])&&!/module|javascript/.test(match[1])))continue;
    const script=path.join(dir,`${++count}.js`);fs.writeFileSync(script,match[2]);
    const result=spawnSync(process.execPath,['--check',script],{encoding:'utf8'});
    if(result.status!==0){failed++;console.error(`Script ${count} ${match[1]}: ${result.stderr}`)}
  }
  console.log(`${file}: ${count} scripts, ${failed} syntax errors`);process.exitCode=failed?1:0;
}finally{fs.rmSync(dir,{recursive:true,force:true})}
