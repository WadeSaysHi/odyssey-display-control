const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const{EventEmitter}=require('node:events');
test('MobileBFF uses the announced envelope version without sending trial writes',async()=>{
 for(const announced of ['0.1','0.2',undefined,'invalid','999.999']){
  const sent=[];class Socket extends EventEmitter{static OPEN=1;constructor(){super();this.readyState=1;queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({event:'/sec/tv/appdata/mobilebff',data:JSON.stringify({version:announced,id:'notify.service.status',response:{status:'ready'}})}))));}send(raw,cb){const m=JSON.parse(JSON.parse(raw).params.data);sent.push(m);cb?.();queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({event:'/sec/tv/appdata/mobilebff',data:{id:m.id,seqId:m.seqId,statusCode:100,response:[]}}))));}terminate(){this.readyState=3;}}
  const sandbox={module:{exports:{}},require:n=>n==='ws'?Socket:require(n),Buffer,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(require.resolve('../src/transport.cjs'),'utf8'),sandbox);
  const c=new sandbox.module.exports.Mobile('fixture','pin');try{await c.request('get.extsources');assert.equal(sent.length,1);assert.equal(sent[0].id,'get.extsources');assert.equal(sent[0].version,['0.1','0.2'].includes(announced)?announced:'0.1');}finally{c.close();}
 }
});
