const $ = id => document.getElementById(id);
const labels = { 'usb-c': 'USB-C', displayport: 'DisplayPort', hdmi: 'HDMI' };
let state, receivedEvent = false, managing = false;
const pendingTargets = new Set();
const isPending = () => pendingTargets.has(state?.deviceId);
const settings = $('settings');
function freshness() {
  if (state?.information) renderInformation(state, state.busy || isPending());
  if (!state?.updatedAt) return;
  const seconds = Math.max(0, Math.floor((Date.now() - state.updatedAt) / 1000));
  $('freshness').textContent = seconds < 2 ? 'Just checked on the monitor' : `Last checked ${seconds}s ago`;
}
function render(next) {
  const targetChanged = state?.deviceId !== next.deviceId;
  state = next;
  if (targetChanged) { stopKeyboard(); if (settings.open) {fillConnection();renderInputPreferences();} }
  const displayModel=state.displayProfile || {family:state.controlProfile==='oled-g8-tested'?'Odyssey OLED G8':state.deviceName,ratio:state.controlProfile==='oled-g8-tested'?'21:9':'unknown',speakers:'yes'};
  $('device-title').textContent = displayModel.family || state.deviceName || 'Display';
  const ratio={'16:9':16/9,'21:9':21/9,'32:9':32/9}[displayModel.ratio]||16/9;
  document.querySelector('.monitor-art').style.setProperty('--panel-ratio',ratio);
  document.querySelector('.inspector').classList.toggle('no-speakers',displayModel.speakers!=='yes');
  $('save-controls').disabled=state.busy||isPending()||!state.paired;
  $('sound-notice').textContent=displayModel.speakers==='no'?'This display has no built-in speakers. You can hide this panel in Appearance.':displayModel.speakers==='unknown'?'Built-in speaker availability is unknown. Confirm it in Connection. You can hide this panel in Appearance.':state.controlProfile==='read-only'?'Controls are read-only. In Connection choose the tested G8 profile and Save controls.':'';
  $('device-title').title = state.deviceName || 'Display';
  const devices = state.devices || [];
  const signature = JSON.stringify(devices.map(d => [d.id, d.name, d.status]));
  if ($('display-target').dataset.signature !== signature) {
    $('display-target').dataset.signature = signature;
    $('display-target').replaceChildren(...devices.map(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = `${d.name}${d.status === 'offline' ? ' · Offline' : ''}`; return o; }));
  }
  $('display-target').value = state.deviceId || '';
  $('display-target').disabled = managing; $('add-display').disabled = managing;
  if (state.status !== 'online' || !state.remoteAvailable) stopKeyboard();
  $('keyboard-control').disabled = state.status !== 'online' || !state.remoteAvailable;
  const profile = state.controlProfile === 'oled-g8-tested';
  $('capability-status').textContent = `${state.deviceName || 'Display'}: ${state.sources.length} detected inputs. ${profile ? 'Odyssey OLED G8 control profile; verified writes require fresh monitor read-back.' : 'Untested display: settings are read-only. Input selection is confirmed after each action; remote effects need observation.'} Other Odyssey hardware compatibility is unverified.`;
  const inputRows = state.sources;
  const inputSignature = JSON.stringify(inputRows);
  if ($('input-list').dataset.signature !== inputSignature) {
    $('input-list').dataset.signature = inputSignature;
    $('input-list').replaceChildren(...inputRows.map(source => {
      const b = document.createElement('button'); b.className = 'source'; b.dataset.source = source.key;
      const icon = document.querySelector('.device-mark svg').cloneNode(true); b.append(icon);
      for (const [cls, text] of [['source-name',source.label || labels[source.key] || source.key],['source-detail',source.audioReturn?`${source.audioReturn==='earc'?'eARC':'ARC'} · ${source.audioReturnSource==='configured'?'Local label':'Reported'}`:'Monitor input'],['source-status','Connect to select']]) { const n = document.createElement('span'); n.className = cls; n.textContent = text; b.append(n); }
      b.onclick = () => void act(() => window.monitor.switch(source.key)); return b;
    }));
  }
  if(!inputRows.length){const empty=document.createElement('p');empty.className='input-empty';empty.textContent=state.status==='online'?'No video inputs reported. Refresh or check Connection.':state.paired?'Connect the display to read its inputs.':'Pair a display to discover its inputs.';$('input-list').replaceChildren(empty);}
  layoutInputs();
  const inputLabel = state.sources.find(s => s.key === state.current)?.label || labels[state.current];
  const busy = state.busy || isPending();
  $('sidebar-status').textContent = state.status === 'online' ? '● Connected' : state.paired ? 'Disconnected' : 'Not paired';
  document.querySelectorAll('[data-key]').forEach(b => b.disabled = busy || state.status !== 'online' || !state.remoteAvailable);
  $('remote-note').textContent = state.remoteAvailable ? 'Uses this app’s authorized remote connection.' : 'Enable auto-confirm and pair again to authorize the remote connection.';
  $('connection-label').textContent = busy ? 'Working…' : state.status === 'online' ? 'Connected' : state.paired ? 'Reconnect' : 'Set up connection';
  $('dot').classList.toggle('online', state.status === 'online');
  $('current-label').textContent = state.status === 'online' ? 'Current input' : state.paired ? 'Monitor unavailable' : 'Your monitor, within reach';
  $('current').textContent = inputLabel || (state.status === 'online' ? 'No external input selected' : state.paired ? 'Check your monitor connection.' : 'Choose where you work or play.');
  $('screen-label').textContent = inputLabel || 'Display';
  if (!state.updatedAt) $('freshness').textContent = state.paired ? 'Current input is unknown while disconnected' : 'Pair once. Switch from your desktop.';
  freshness();
  document.querySelectorAll('[data-source]').forEach(button => {
    const key = button.dataset.source;
    const active = key === state.current;
    const available = state.sources.some(x => x.key === key);
    button.disabled = busy || state.status !== 'online' || !available;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('.source-status').textContent = active ? '✓ Current input' : state.status === 'online' ? available ? 'Switch input' : 'Not reported' : 'Connect to select';
  });
  $('message').textContent = state.message;
  $('settings-message').textContent = state.message;
  document.body.classList.toggle('verified', Boolean(state.verification));
  $('verification').textContent = state.verification === 'dual' ? 'Confirmed by both local state APIs' : state.verification === 'mobile' ? 'Confirmed by two fresh monitor reads' : 'Every switch is checked on the monitor';
  $('forget').hidden = !state.paired;
  $('reconnect').hidden = !state.paired;
  for (const id of ['pair', 'reconnect', 'forget', 'host', 'close', 'auto-confirm']) $(id).disabled = busy;
  $('pair').textContent = busy ? 'Please wait…' : state.paired ? 'Pair again' : 'Pair monitor';
  renderInformation(state, busy);
}
async function act(action, closeOnSuccess = false, complete = () => {}) {
  if (isPending() || state?.busy) return;
  const target = state.deviceId; let errorMessage = ''; pendingTargets.add(target); render(state);
  try {
    const result = await action();
    if (target !== state.deviceId) return;
    complete(result);
    if (result.ok && closeOnSuccess) settings.close();
    if (!result.ok) errorMessage = result.message;
  } catch {
    if (target !== state.deviceId) return;
    errorMessage = 'The app could not complete the request. Restart and reconnect.';
  } finally { pendingTargets.delete(target); render(state); if (target === state.deviceId && errorMessage) { $('message').textContent = errorMessage; $('settings-message').textContent = errorMessage; } }
}
function fillConnection() {
  const profile=state?.displayProfile;
  $('display-family').value=profile?.family || ''; $('display-ratio').value=profile?.ratio||'unknown'; $('display-speakers').value=profile?.speakers||'unknown';
  $('display-name').value = state?.deviceName || ''; $('control-profile').value = state?.controlProfile || 'read-only';
  $('host').value = state?.host || ''; $('auto-confirm').checked = state?.autoConfirm ?? true;
}
function openConnection() {
  stopKeyboard();
  if (!settings.open) { fillConnection(); renderInputPreferences(); settings.showModal();selectNavigation('connection'); }
}
$('connection').addEventListener('click', openConnection);
$('close').addEventListener('click', () => settings.close());
settings.addEventListener('cancel', event => { if (state?.busy || isPending()) event.preventDefault(); });
$('settings-form').addEventListener('submit', event => { event.preventDefault(); void act(() => window.monitor.pair($('host').value, $('auto-confirm').checked, $('control-profile').value), true); });
$('reconnect').addEventListener('click', () => void act(() => window.monitor.reconnect($('host').value), true));
$('forget').addEventListener('click', () => void act(() => window.monitor.forget()));
$('refresh-picture').addEventListener('click', () => void act(() => window.monitor.refreshInformation()));
$('refresh-information').addEventListener('click', () => void act(() => window.monitor.refreshInformation()));
$('save-association').addEventListener('click', () => void act(() => window.monitor.associateComputer($('computer-input').value, $('computer-display').value)));
window.monitor.onState(next => { receivedEvent = true; render(next); });
window.monitor.state().then(initial => { if (!receivedEvent) render(initial); });
setInterval(freshness, 1000);
bindVolumeWheel();
let currentPage = 'monitor';
function navigate(page) {
  if (page === 'connection') { openConnection(); return; }
  stopKeyboard(); currentPage = page;
  document.querySelectorAll('[data-panel]').forEach(n => n.hidden = n.dataset.panel !== page);
  selectNavigation(page);
  $('page-name').textContent = page[0].toUpperCase() + page.slice(1); $('content').scrollTop = 0;
  const panel=document.querySelector(`[data-panel="${page}"]`);panel.getAnimations().forEach(a=>a.cancel());if(!Motion.reduced())panel.animate([{opacity:.65,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
}
document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => navigate(b.dataset.page));
document.querySelectorAll('[data-key]').forEach(b => b.onclick = () => void act(() => window.monitor.remoteKey(b.dataset.key)));
let appearance = { theme: 'system', alwaysScrollbars: false };
function renderAppearance(next) {
  appearance = next; document.body.classList.toggle('hide-sound',next.hideSound===true); $('hide-sound').checked=next.hideSound===true; document.body.classList.toggle('night', next.dark); document.body.dataset.platform = next.platform;
  document.body.classList.toggle('always-scrollbars', next.alwaysScrollbars);
  $('keep-in-tray').checked = next.keepInTray;
  $('background-hint').textContent = next.platform === 'darwin' ? 'Closing hides the window. Reopen from the menu-bar icon; choose Quit to exit.' : 'Closing hides the window. Reopen from the tray icon; choose Quit to exit.';
  $('always-scrollbars').checked = next.alwaysScrollbars;
  document.querySelectorAll('[data-theme]').forEach(b => { b.classList.toggle('selected', b.dataset.theme === next.theme); b.setAttribute('aria-pressed', String(b.dataset.theme === next.theme)); });
}
async function setAppearance(change) {
  try { renderAppearance(await window.monitor.appearance({ theme: appearance.theme, alwaysScrollbars: appearance.alwaysScrollbars, keepInTray: appearance.keepInTray, hideSound: appearance.hideSound??false, ...change })); $('appearance-message').textContent = ''; }
  catch { $('appearance-message').textContent = 'Appearance could not be saved. Try again.'; }
}
window.monitor.onAppearance(renderAppearance);
window.monitor.appearance().then(renderAppearance).catch(() => { $('appearance-message').textContent = 'Appearance preferences could not be loaded.'; });
document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => void setAppearance({ theme: b.dataset.theme }));
$('theme-toggle').onclick = () => void setAppearance({ theme: appearance.dark ? 'light' : 'dark' });
$('always-scrollbars').onchange = e => void setAppearance({ alwaysScrollbars: e.target.checked });

$('keep-in-tray').onchange = e => void setAppearance({ keepInTray: e.target.checked });

function stopKeyboard() {
  const b = $('keyboard-control'); if (!b) return;
  b.setAttribute('aria-pressed', 'false');
  $('keyboard-status').textContent = 'Keyboard control is off. Enable it here to route single arrow presses, Enter and Backspace; Escape stops locally.';
}
$('keyboard-control').onclick = () => {
  if ($('keyboard-control').getAttribute('aria-pressed') === 'true') { stopKeyboard(); return; }
  if (currentPage !== 'remote' || state.status !== 'online' || !state.remoteAvailable || settings.open) return;
  $('keyboard-control').setAttribute('aria-pressed', 'true');
  $('keyboard-status').textContent = `Controlling ${state.deviceName || 'selected display'} · Arrows, Enter and Backspace · Escape to stop`;
  $('content').focus();
};
window.addEventListener('blur', stopKeyboard);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopKeyboard(); });
document.addEventListener('keydown', event => {
  if ($('keyboard-control').getAttribute('aria-pressed') !== 'true') return;
  if (event.key === 'Escape') { event.preventDefault(); stopKeyboard(); return; }
  if (currentPage !== 'remote' || settings.open || !document.hasFocus() || state.status !== 'online' || !state.remoteAvailable) { stopKeyboard(); return; }
  if (event.target.closest('input,select,textarea,button,[contenteditable="true"],[role="spinbutton"],[role="scrollbar"]') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const key = { ArrowUp:'KEY_UP', ArrowDown:'KEY_DOWN', ArrowLeft:'KEY_LEFT', ArrowRight:'KEY_RIGHT', Enter:'KEY_ENTER', Backspace:'KEY_RETURN' }[event.key];
  if (!key) return; event.preventDefault(); if (event.repeat || isPending() || state.busy) return;
  void act(() => window.monitor.remoteKey(key, true));
});
$('display-target').onchange = () => void changeDisplay({ action:'select', id:$('display-target').value });
$('add-display').onclick = () => void changeDisplay({ action:'add' }, true);
$('rename-display').onclick = () => void act(() => window.monitor.displays({ action:'rename', id:state.deviceId, name:$('display-name').value }));
$('remove-display').onclick = () => void act(() => window.monitor.displays({ action:'remove', id:state.deviceId }), true);

async function changeDisplay(value, open = false) {
  if (managing) return; let errorMessage = ''; stopKeyboard(); managing = true; render(state);
  try { const result = await window.monitor.displays(value); if (result.ok && open) openConnection(); else if (!result.ok) errorMessage = result.message; }
  catch { errorMessage = 'Display selection could not be saved. Try again.'; }
  finally { managing = false; render(state); if (errorMessage) { $('message').textContent = errorMessage; $('settings-message').textContent = errorMessage; } }
}

$('hide-sound').onchange=e=>void setAppearance({hideSound:e.target.checked});
$('save-display-profile').onclick=()=>void act(()=>window.monitor.displays({action:'configure',id:state.deviceId,presentation:{family:$('display-family').value,ratio:$('display-ratio').value,speakers:$('display-speakers').value}}));

$('save-controls').onclick=()=>void act(()=>window.monitor.setControlProfile($('control-profile').value));

function selectNavigation(page){document.querySelectorAll('[data-page]').forEach(b=>{const active=b.dataset.page===page;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});const b=document.querySelector(`[data-page="${page}"]`);if(b)Motion.navigation(b);}
settings.addEventListener('close',()=>selectNavigation(currentPage));
requestAnimationFrame(()=>{selectNavigation(currentPage);requestAnimationFrame(()=>document.body.classList.add('motion-ready'));});

function layoutInputs(){const n=state?.sources.length||1,w=$('input-list').clientWidth;const columns=n<=3?n:w>=660?Math.ceil(n/Math.ceil(n/4)):2;$('input-list').style.setProperty('--input-columns',columns);}
new ResizeObserver(layoutInputs).observe($('input-list'));
function renderInputPreferences(){
 $('input-preferences').replaceChildren(...(state?.sources||[]).map(source=>{
 const form=document.createElement('div');form.className='input-preference';
 const label=document.createElement('label');label.textContent=source.label;const name=document.createElement('input');name.maxLength=60;name.placeholder='Local input label';name.setAttribute('aria-label',`Label for ${source.label}`);name.value=source.label;
 const badge=document.createElement('select');badge.setAttribute('aria-label',`Audio return label for ${source.label}`);for(const [value,text] of [['','No local badge'],['arc','ARC'],['earc','eARC']]){const o=document.createElement('option');o.value=value;o.textContent=text;badge.append(o);}badge.value=source.audioReturnSource==='configured'?source.audioReturn:'';
 const save=document.createElement('button');save.type='button';save.textContent='Save label';save.setAttribute('aria-label',`Save label for ${source.label}`);const target=state.deviceId;save.onclick=()=>{if(target!==state.deviceId)return;void act(()=>window.monitor.configureInput(source.key,{label:name.value,audioReturn:badge.value}));};
 label.append(name);form.append(label,badge,save);return form;
 }));if(!state?.sources.length)$('input-preferences').textContent='Connect the display to edit its reported inputs.';
}
