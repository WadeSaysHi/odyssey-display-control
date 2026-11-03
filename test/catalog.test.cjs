const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { Catalog } = require('../src/catalog.cjs');
const { Store } = require('../src/store.cjs');
const { Fleet } = require('../src/fleet.cjs');
const record = { host:'local', identity:'test-identity', mobilePin:'pin', ipPin:'pin', token:'private-test-token', remoteToken:'remote', association:{input:'usb-c',displayKey:'display'} };
async function fixture() {
 const folder = await fs.mkdtemp(path.join(os.tmpdir(),'odyssey-catalog-'));const key=randomBytes(32);
 const crypto = { isAsyncEncryptionAvailable:async()=>true, encryptStringAsync:async text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const b=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]);},decryptStringAsync:async bytes=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return {result:Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString()};} };
 return {folder,crypto,catalog:new Catalog(folder,crypto),clean:()=>fs.rm(folder,{recursive:true,force:true})};
}
test('catalog migrates all legacy credentials and association without changing original encrypted bytes',async()=>{
 const f=await fixture();try{const old=new Store(f.folder,f.crypto);await old.save(record);const bytes=await fs.readFile(old.file);const data=await f.catalog.load();assert.deepEqual(data.devices[0].record,{...record,controlProfile:'oled-g8-tested'});assert.deepEqual(await fs.readFile(old.file),bytes);assert.ok(!(await fs.readFile(f.catalog.file)).includes(Buffer.from(record.token)));const again=await new Catalog(f.folder,f.crypto).load();assert.deepEqual(again,data);}finally{await f.clean();}
});
test('catalog serializes independent device saves and rejects duplicate hardware',async()=>{
 const f=await fixture();try{await f.catalog.load();const a=f.catalog.data.selectedId;await f.catalog.commit(d=>{d.devices.push({id:'second',name:'Second',record:null});return d;});await Promise.all([f.catalog.store(a).save(record),f.catalog.store('second').save({...record,identity:'other',token:'other-token'})]);assert.equal(f.catalog.data.devices[0].record.token,record.token);assert.equal(f.catalog.data.devices[1].record.token,'other-token');await assert.rejects(f.catalog.store('second').save(record),{code:'DUPLICATE'});}finally{await f.clean();}
});
test('failed catalog encryption preserves previous saved connections; corrupt catalog never falls back to legacy',async()=>{
 const f=await fixture();try{await f.catalog.load();const before=await fs.readFile(f.catalog.file);f.crypto.encryptStringAsync=async()=>{throw Error('locked');};await assert.rejects(f.catalog.commit(d=>{d.devices[0].name='Lost';return d;}));assert.deepEqual(await fs.readFile(f.catalog.file),before);assert.equal(f.catalog.data.devices[0].name,'Display 1');await fs.writeFile(f.catalog.file,'corrupt');await assert.rejects(new Catalog(f.folder,f.crypto).load(),{code:'STORAGE'});}finally{await f.clean();}
});
test('fleet routes captured targets safely, isolates busy devices, and retains independent state',async()=>{
 const f=await fixture();const fleet=new Fleet(f.catalog);try{await fleet.init();const first=fleet.snapshot().deviceId;assert.equal((await fleet.manage({action:'add'})).ok,true);const second=fleet.snapshot().deviceId;fleet.controllers.get(first).state.busy=true;assert.equal((await fleet.invoke(first,'remoteKey','KEY_ENTER')).code,'TARGET');assert.equal(fleet.controllers.get(second).state.busy,false);assert.equal((await fleet.manage({action:'rename',id:second,name:'Second'})).ok,true);assert.equal((await fleet.manage({action:'select',id:first})).ok,true);assert.equal(fleet.snapshot().busy,true);await fleet.manage({action:'select',id:second});assert.equal(fleet.snapshot().deviceName,'Second');assert.ok(!JSON.stringify(fleet.snapshot()).includes('mobilePin'));assert.equal((await fleet.manage({action:'remove',id:first})).ok,false);}finally{fleet.close();await f.clean();}
});
test('two simulated monitors keep authentication, input state and queues independent when one is offline',async()=>{
 const f=await fixture();let fleet;const calls=[];
 try{
  await new Store(f.folder,f.crypto).save(record);await f.catalog.load();const first=f.catalog.data.selectedId;
  await f.catalog.commit(d=>{d.devices.push({id:'second',name:'Second',record:{...record,host:'second',identity:'second',token:'second-token'}});return d;});
  const io={probe:async host=>{if(host==='local')throw Object.assign(Error(),{code:'OFFLINE'});return {identity:'second',mobilePin:'pin'};},Mobile:class {async request(){return {statusCode:'100',response:[{sourceId:'source@HDMI2',currentSource:'True'}]};}close(){}},ipCall:async(host,pin,method,token)=>{calls.push({host,token});if(method==='getTVStates')return {inputSource:'HDMI2'};return {};}};
  fleet=new Fleet(f.catalog,io);await fleet.init();assert.equal(fleet.controllers.get(first).state.status,'offline');await fleet.manage({action:'select',id:'second'});assert.equal(fleet.snapshot().status,'online');assert.equal(fleet.snapshot().current,'hdmi2');assert.ok(calls.every(c=>c.host==='second'&&c.token==='second-token'));assert.ok(!JSON.stringify(fleet.snapshot()).includes('second-token'));
 }finally{fleet?.close();await f.clean();}
});
