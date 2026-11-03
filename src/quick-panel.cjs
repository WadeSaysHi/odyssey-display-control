const path=require('node:path');
function position(anchor,area,width,height){width=Math.min(width,area.width);height=Math.min(height,area.height);const x=Math.max(area.x,Math.min(Math.round(anchor.x+anchor.width/2-width/2),area.x+area.width-width));const below=anchor.y+anchor.height+5;const y=below+height<=area.y+area.height?below:anchor.y-height-5;return {x,y:Math.max(area.y,Math.min(y,area.y+area.height-height)),width,height};}
function create(owner){
 const {BrowserWindow,screen}=owner.e;
 const panel=new BrowserWindow({width:370,height:440,show:false,frame:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#f5f5f7',webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 panel.webContents.setWindowOpenHandler(()=>({action:'deny'}));panel.webContents.on('will-navigate',e=>e.preventDefault());
 panel.on('blur',()=>{panel.hide();owner.opened=false;});panel.on('hide',()=>{owner.opened=false;});
 panel.loadFile(path.join(__dirname,'../ui/quick.html'));
 owner.panel=panel;
 owner.resizePanel=height=>{const b=owner.tray.getBounds();panel.setBounds(position(b,screen.getDisplayMatching(b).workArea,370,height));};
 return ()=>{if(panel.isVisible()){panel.hide();return;}const bounds=owner.tray.getBounds();const area=screen.getDisplayMatching(bounds).workArea;panel.setBounds(position(bounds,area,370,panel.getBounds().height));owner.opened=true;panel.show();panel.focus();panel.webContents.send('monitor:state',owner.controller.snapshot());};
}
module.exports={create,position};
