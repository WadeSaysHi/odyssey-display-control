const { createHash } = require('node:crypto');
const { fail } = require('./transport.cjs');
const digest = id => 'input-' + createHash('sha256').update(id).digest('hex').slice(0, 24);
function kind(value) {
  if(typeof value!=='string')return null;
  const token=value.toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/(?:EARC|ARC)$/,'');
  let m=/^HDMI(\d*)$/.exec(token);if(m)return {type:'hdmi',number:m[1]?Number(m[1]):null};
  m=/^(?:DISPLAYPORT|DP|MINIDISPLAYPORT|MINIDP|MDP)(\d*)$/.exec(token);if(m)return {type:'displayport',number:m[1]?Number(m[1]):null};
  m=/^(?:USBC|TYPEC|USBTYPEC)(\d*)$/.exec(token);if(m)return {type:'usb-c',number:m[1]?Number(m[1]):null};
  return null;
}
function parseSources(answer) {
  if(![100,'100'].includes(answer?.statusCode)||!Array.isArray(answer.response)||answer.response.length>256)throw fail('PROTOCOL');
  const byId=new Map();
  for(const item of answer.response){
    const id=item?.sourceId;if(typeof id!=='string'||!id.trim()||id.length>1024||/[\x00-\x1f\x7f]/.test(id))continue;
    const suffix=id.split('@').pop();
    const layer=/source\.layer\.([^@/]+)@/i.exec(id)?.[1];
    if([suffix,layer].some(v=>typeof v==='string'&&/^(?:USBCAM|USBCAMERA|WEBCAM|CAMERA)\d*$/.test(v.toUpperCase().replace(/[^A-Z0-9]/g,''))))continue;
    const flag=item.currentSource;
    if(flag!=null&&!([true,false,1,0].includes(flag)||typeof flag==='string'&&/^(true|false|1|0)$/i.test(flag)))continue;
    const current=flag===true||flag===1||typeof flag==='string'&&/^(true|1)$/i.test(flag);
    if(byId.has(id)){byId.get(id).current ||= current;continue;}
    let port=kind(suffix);
    if(!port)port=kind(layer);
    const type=port?.type||'other',number=Number.isSafeInteger(port?.number)&&port.number>0?port.number:null;
    const key=type==='other'?digest(id):type==='hdmi'&&(number===1||number===null)?'hdmi':type+(number??'');
    const audioReturn=type==='hdmi'&&/(?:^|[\W_])EARC(?:$|[\W_])/i.test(suffix)?'earc':type==='hdmi'&&/(?:^|[\W_])ARC(?:$|[\W_])/i.test(suffix)?'arc':null;
    byId.set(id,{id,suffix,key,type,number,current,audioReturn,audioReturnSource:audioReturn?'reported':null});
  }
  const rows=[...byId.values()];
  if(rows.filter(s=>s.current).length>1)throw fail('PROTOCOL');
  const sorted=[...rows].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const collisions=new Set(rows.filter(row=>rows.filter(s=>s.key===row.key).length>1).map(row=>row.key));
  for(const row of rows){
    if(collisions.has(row.key))row.key=digest(row.id);
    const base=row.type==='hdmi'?'HDMI':row.type==='displayport'?'DisplayPort':row.type==='usb-c'?'USB-C':'Input';
    const familyCount=rows.filter(s=>s.type===row.type).length;
    row.label=base+(row.type==='other'?' '+(sorted.filter(s=>s.type==='other').indexOf(row)+1):row.number!==null&&(familyCount>1||row.number!==1)?' '+row.number:'');
  }
  // Aliases may collide (DP1 and DISPLAYPORT1). Keep both advertised targets distinct.
  const labels=new Map();for(const row of rows){const group=rows.filter(s=>s.label===row.label);if(group.length>1)labels.set(row.id,row.label+' · Input '+(sorted.filter(s=>s.label===row.label).indexOf(row)+1));}
  return rows.map(row=>({...row,label:labels.get(row.id)||row.label}));
}
function resolveInput(value,rows=[]) {
  if(typeof value!=='string')return null;
  const exact=rows.filter(s=>s.id===value||s.suffix===value);if(exact.length===1)return exact[0].key;
  const p=kind(value);if(!p)return null;
  const family=rows.filter(s=>s.type===p.type);
  const matches=family.filter(s=>s.number===p.number);
  if(matches.length===1)return matches[0].key;
  if(p.number===null&&family.length===1)return family[0].key;
  return null;
}
function decorate(rows,preferences={}) {return rows.map(row=>{const p=preferences?.[row.key];return {...row,label:typeof p?.label==='string'&&p.label.trim()&&p.label.length<=60&&!/[\x00-\x1f\x7f]/.test(p.label)?p.label:row.label,audioReturn:['arc','earc'].includes(p?.audioReturn)?p.audioReturn:row.audioReturn,audioReturnSource:['arc','earc'].includes(p?.audioReturn)?'configured':row.audioReturnSource};});}
module.exports={parseSources,resolveInput,decorate};
