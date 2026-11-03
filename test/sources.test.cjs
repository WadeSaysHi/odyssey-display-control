const{test}=require('node:test');const assert=require('node:assert/strict');const{parseSources,resolveInput,decorate}=require('../src/sources.cjs');const{Controller}=require('../src/controller.cjs');const{presentation,empty}=require('../src/information.cjs');
const answer=(ids,current=ids[0])=>({statusCode:'100',response:ids.map(id=>({sourceId:id,currentSource:id===current,title:'private-device-name'}))});
const ports=names=>names.map(n=>'source@'+n);
test('legacy handles remain stable while numbered ports and unknown source types are retained',()=>{
 const s=parseSources(answer(ports(['HDMI1','HDMI2_EARC','DP1','DISPLAYPORT2','USB_C','PROPRIETARY_VIDEO'])));
 assert.deepEqual(s.slice(0,5).map(x=>x.key),['hdmi','hdmi2','displayport1','displayport2','usb-c']);assert.equal(s[0].label,'HDMI 1');assert.equal(s[1].audioReturn,'earc');assert.equal(s.at(-1).label,'Input 1');assert.match(s.at(-1).key,/^input-/);
 assert.equal(parseSources(answer(ports(['HDMI1'])))[0].label,'HDMI');assert.ok(!JSON.stringify(s).includes('private-device-name'));
});
test('duplicate aliases are distinct, reorder-stable targets; duplicate IDs coalesce',()=>{
 const ids=ports(['DP1','DISPLAYPORT1','HDMI1','HDMI']);const a=parseSources(answer(ids,ids[0])),b=parseSources(answer([...ids].reverse(),ids[0]));assert.equal(new Set(a.map(x=>x.key)).size,4);for(const row of a)assert.equal(b.find(x=>x.id===row.id).key,row.key);
 const repeated=answer([ids[0],ids[0]],ids[0]);assert.equal(parseSources(repeated).length,1);
});
test('empty or camera-only inventories are valid; malformed and contradictory data fail with protocol errors',()=>{
 assert.equal(parseSources(answer(ports(Array.from({length:256},(_,i)=>'HDMI'+(i+1))))).length,256);
 assert.deepEqual(parseSources(answer([])),[]);assert.deepEqual(parseSources(answer(['camera@USBCAM'])),[]);
 assert.deepEqual(parseSources({statusCode:100,response:[null,{},42,{sourceId:'bad\u0000id'}, {sourceId:'valid',currentSource:{}}]}),[]);
 for(const r of [null,{}, {statusCode:100,response:null},answer(Array.from({length:257},(_,i)=>'port'+i)),{statusCode:100,response:[{sourceId:'a',currentSource:true},{sourceId:'b',currentSource:true}]}])assert.throws(()=>parseSources(r),{code:'PROTOCOL'});
});
test('independent input matching normalizes aliases without guessing ambiguous DP ports or eARC',()=>{
 const rows=parseSources(answer(ports(['HDMI1','HDMI2','DP1','DP2','USB_C'])));assert.equal(resolveInput('HDMI 2',rows),'hdmi2');assert.equal(resolveInput('DISPLAY PORT 2',rows),'displayport2');assert.equal(resolveInput('DISPLAY PORT',rows),null);assert.equal(resolveInput('USB-C',rows),'usb-c');assert.equal(rows[1].audioReturn,null);
 const custom=decorate(rows, {hdmi2:{label:'Console',audioReturn:'earc'}});assert.equal(custom[1].label,'Console');assert.equal(custom[1].audioReturnSource,'configured');assert.equal(rows[1].label,'HDMI 2');
});
function simulation(names,options={}){
 let ids=ports(names),actual=ids[0],writes=[];const record={host:'fixture',identity:'fixture',mobilePin:'pin',ipPin:'pin',token:'private-token',association:{input:'usb-c',displayKey:'fixture'}};
 const io={probe:async()=>({identity:'fixture',mobilePin:'pin'}),Mobile:class{async request(method,p){if(options.invalid) return null;if(method==='get.extsources')return answer(ids,actual);writes.push(p.requestId);if(!options.ignore)actual=p.requestId;if(options.removeAfterWrite)ids=ids.filter(id=>id!==p.requestId);if(options.lostAck)throw Object.assign(Error(),{code:'OFFLINE'});return {statusCode:100,response:{status:'ok'}};}close(){}},ipCall:async()=>({inputSource:options.conflict|| (options.ambiguous?'DISPLAY PORT':options.unmapped?'unmapped':actual?.split('@').pop())})};
 const c=new Controller({load:async()=>record,save:async r=>{Object.assign(record,r);},clear:async()=>{}},io,{sampleMs:1,verifyMs:80});c.record=record;c.state.paired=true;
 return {c,writes,record,replace:n=>{ids=ports(n);actual=ids[0];}};
}
test('simulated combinations switch each advertised target with exact opaque IDs and two-read verification',async()=>{
 const sets=[['HDMI1'],['DISPLAYPORT'],['USB_C'],['HDMI1','HDMI2_EARC','DP1','DP2'],['HDMI1','HDMI7','HDMI12','DP1','DP2','DP3','USB_C2'],['PROPRIETARY_A','PROPRIETARY_B'],Array.from({length:24},(_,i)=>'PORT_'+i)];
 for(const set of sets){const f=simulation(set);try{await f.c.refresh();const sources=f.c.state.sources;assert.equal(sources.length,set.length);assert.ok(!JSON.stringify(f.c.snapshot()).includes('source@'));assert.ok(!JSON.stringify(f.c.snapshot()).includes('private-token'));for(const row of sources){const r=await f.c.switchSource(row.key);assert.equal(r.ok,true);assert.equal(f.c.state.current,row.key);assert.ok(f.c.state.verification);}}finally{f.c.close();}}
});
test('unmapped or ambiguous independent tokens use explicit mobile scope; known conflicts never confirm',async()=>{
 for(const option of [{unmapped:true},{ambiguous:true}]){const f=simulation(['DP1','DP2'],option);assert.equal((await f.c.switchSource('displayport2')).ok,true);assert.equal(f.c.state.verification,'mobile');}
 const f=simulation(['HDMI1','CUSTOM'],{conflict:'HDMI1'});await f.c.refresh();const unknown=f.c.state.sources[1].key;assert.equal((await f.c.switchSource(unknown)).code,'VERIFY');assert.equal(f.writes.length,1);assert.equal(f.c.information.report.monitor.inputConflict,true);
});
test('removed targets, misleading acknowledgements, lost replies and inventory failures stay controlled',async()=>{
 const stale=simulation(['HDMI1','DP1']);await stale.c.refresh();stale.replace(['HDMI1']);assert.equal((await stale.c.switchSource('displayport1')).code,'PROTOCOL');assert.equal(stale.writes.length,0);
 for(const option of [{ignore:true},{removeAfterWrite:true}]){const f=simulation(['HDMI1','DP1'],option);assert.equal((await f.c.switchSource('displayport1')).code,'VERIFY');assert.equal(f.writes.length,1);}
 const lost=simulation(['HDMI1','DP1'],{lostAck:true});assert.equal((await lost.c.switchSource('displayport1')).ok,true);assert.equal(lost.writes.length,1);
 const bad=simulation(['HDMI1'],{invalid:true});await bad.c.poll();assert.equal(bad.c.state.status,'offline');bad.c.close();
 const empty=simulation([]);await empty.c.poll();assert.equal(empty.c.state.status,'online');assert.deepEqual(empty.c.state.sources,[]);empty.c.close();
});
test('local input preferences preserve credentials and association, rejecting stale or unsafe edits',async()=>{
 const f=simulation(['HDMI1','HDMI2']);await f.c.refresh();const before=structuredClone(f.record);assert.equal((await f.c.configureInput('hdmi2',{label:'Console',audioReturn:'earc'})).ok,true);assert.deepEqual(f.record,{...before,inputPreferences:{hdmi2:{label:'Console',audioReturn:'earc'}}});assert.equal(f.writes.length,0);assert.equal(f.c.state.sources[1].audioReturnSource,'configured');assert.equal((await f.c.configureInput('absent',{label:'a',audioReturn:''})).code,'INVALID_SETTING');assert.equal((await f.c.configureInput('hdmi2',{label:'bad\nlabel',audioReturn:''})).code,'INVALID_SETTING');
});
test('fresh associated OS timing does not depend on unrelated picture getters, but still requires selected input',()=>{
 const r=empty();r.computer={status:'fresh',at:Date.now(),displays:[{key:'fixture',width:1920,height:1080,refreshRate:60,provider:'OS'}]};const association={input:'custom',displayKey:'fixture'};
 assert.equal(presentation(r,'custom',true,association,Date.now(),true).fields.resolution.source,'This Computer');assert.equal(presentation(r,'other',true,association,Date.now(),true).fields.resolution.value,'Unknown');assert.equal(presentation(r,'custom',false,association,Date.now(),true).fields.resolution.value,'Unavailable');assert.equal(presentation(r,'custom',true,association,Date.now(),false).fields.resolution.value,'Unknown');
});
test('bounded malformed-response fuzzing never raises an unhandled type error',()=>{
 const candidates=[null,{},42,[],{sourceId:null},{sourceId:'source@HDMI2',currentSource:[]},{sourceId:'source@DP1',currentSource:{toString:'invalid'}},{sourceId:'opaque-A',currentSource:false},{sourceId:'camera@USBCAM',currentSource:true}];
 for(let seed=0;seed<512;seed++){const response=Array.from({length:seed%17},(_,i)=>candidates[(seed*7+i*3)%candidates.length]);try{const s=parseSources({statusCode:100,response});assert.equal(new Set(s.map(x=>x.key)).size,s.length);}catch(e){assert.equal(e.code,'PROTOCOL');}}
});
