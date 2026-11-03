const FAMILIES = ['Odyssey G3','Odyssey G4','Odyssey G5','Odyssey G6','Odyssey G7','Odyssey G8','Odyssey G9','Odyssey OLED G6','Odyssey OLED G8','Odyssey OLED G9'];
function profile(device) {
 const tested=device?.record?.controlProfile==='oled-g8-tested', p=device?.presentation||{};
 return { family:p.family|| (tested?'Odyssey OLED G8':device?.name||'Display'), ratio:p.ratio|| (tested?'21:9':'unknown'), speakers:p.speakers??(tested?'yes':'unknown') };
}
function validate(p) {return p&&['',...FAMILIES].includes(p.family)&&['unknown','16:9','21:9','32:9'].includes(p.ratio)&&['unknown','yes','no'].includes(p.speakers);}
module.exports={profile,validate,FAMILIES};
