const http=require('http'),fs=require('fs'),path=require('path');
const root=process.cwd(), port=+(process.env.WEB_PORT||8010), apiPort=+(process.env.API_PORT||3210);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){
    const p=http.request({hostname:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
    p.on('error',e=>{res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:e.message}))});
    req.pipe(p);return;
  }
  let u=req.url.split('?')[0]; if(u==='/'||u==='')u='/index.html';
  const f=path.normalize(path.join(root,u)); if(!f.startsWith(root)){res.writeHead(403);return res.end('forbidden')}
  fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end('not found')}res.writeHead(200,{'content-type':mime[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(b)});
});
server.listen(port,'127.0.0.1',()=>console.log('proxy live',port,'->',apiPort));
