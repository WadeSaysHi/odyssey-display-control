// Persistent tracks preserve position and velocity across input and telemetry updates.
const Motion=(()=>{
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const wheels=new WeakMap();
 function wheel(track,value,enabled,onPick,context){
  let w=wheels.get(track);
  if(!w){w={position:0,target:0,velocity:0,frame:0,time:0,context:null,buttons:[]};wheels.set(track,w);track.replaceChildren(...Array.from({length:101},(_,n)=>{const b=document.createElement('button');b.textContent=n;b.tabIndex=-1;b.dataset.value=n;b.onclick=()=>w.pick(n);w.buttons.push(b);return b;}));}
  w.pick=onPick;w.buttons.forEach((b,n)=>{b.disabled=!enabled;b.classList.toggle('chosen',n===value);b.classList.toggle('away',value!==null&&Math.abs(n-value)>=2);});
  track.hidden=value===null;if(value===null){cancelAnimationFrame(w.frame);w.frame=0;return;}
  const row=track.id==='values'?34:42;const draw=()=>{track.style.transform=`translate3d(0,${(2-w.position)*row}px,0)`;};
  if(w.context!==context||reduced()){cancelAnimationFrame(w.frame);w.frame=0;w.context=context;w.position=w.target=value;w.velocity=0;draw();return;}
  w.target=value;if(w.frame)return;w.time=performance.now();
  const tick=now=>{const dt=Math.min((now-w.time)/1000,.032);w.time=now;const omega=22;const x=w.position-w.target;const decay=Math.exp(-omega*dt);const c=w.velocity+omega*x;w.position=w.target+(x+c*dt)*decay;w.velocity=(w.velocity-omega*c*dt)*decay;draw();if(reduced()||Math.abs(w.position-w.target)<.002&&Math.abs(w.velocity)<.02){w.position=w.target;w.velocity=0;draw();w.frame=0;}else w.frame=requestAnimationFrame(tick);};
  if(Math.abs(w.position-value)>.001)w.frame=requestAnimationFrame(tick);
 }
 function navigation(button){const nav=button.closest('nav');let tile=nav.querySelector('.nav-selection');if(!tile){tile=document.createElement('div');tile.className='nav-selection';tile.setAttribute('aria-hidden','true');nav.prepend(tile);}tile.style.height=button.offsetHeight+'px';tile.style.transform=`translateY(${button.offsetTop}px)`;}
 return {wheel,navigation,reduced};
})();
