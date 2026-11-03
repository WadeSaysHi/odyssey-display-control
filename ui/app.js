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
  if (targetChanged) { stopKeyboard(); settings.close(); }
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
  const inputRows = state.sources.length ? state.sources : [{key:'usb-c',label:'USB-C'}, {key:'displayport',label:'DisplayPort'}, {key:'hdmi',label:'HDMI'}];
  const inputSignature = JSON.stringify(inputRows);
  if ($('input-list').dataset.signature !== inputSignature) {
    $('input-list').dataset.signature = inputSignature;
    $('input-list').replaceChildren(...inputRows.map(source => {
      const b = document.createElement('button'); b.className = 'source'; b.dataset.source = source.key;
      const icon = document.querySelector('.device-mark svg').cloneNode(true); b.append(icon);
      for (const [cls, text] of [['source-name',source.label || labels[source.key] || source.key],['source-detail','Monitor input'],['source-status','Connect to select']]) { const n = document.createElement('span'); n.className = cls; n.textContent = text; b.append(n); }
      b.onclick = () => void act(() => window.monitor.switch(source.key)); return b;
    }));
  }
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
function openConnection() {
  stopKeyboard();
  if (!settings.open) { $('display-name').value = state?.deviceName || ''; $('control-profile').value = state?.controlProfile || 'read-only'; $('host').value = state?.host || ''; $('auto-confirm').checked = state?.autoConfirm ?? true; settings.showModal(); }
}
$('connection').addEventListener('click', openConnection);
$('close').addEventListener('click', () => settings.close());
settings.addEventListener('cancel', event => { if (state?.busy || isPending()) event.preventDefault(); });
$('settings-form').addEventListener('submit', event => { event.preventDefault(); void act(() => window.monitor.pair($('host').value, $('auto-confirm').checked, $('control-profile').value), true); });
$('reconnect').addEventListener('click', () => void act(() => window.monitor.reconnect($('host').value), true));
$('forget').addEventListener('click', () => void act(() => window.monitor.forget()));
document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => void act(() => window.monitor.switch(button.dataset.source))));
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
  document.querySelectorAll('[data-page]').forEach(n => { n.classList.toggle('active', n.dataset.page === page); if (n.dataset.page === page) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current'); });
  $('page-name').textContent = page[0].toUpperCase() + page.slice(1); $('content').scrollTop = 0;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector(`[data-panel="${page}"]`).animate([{ opacity: .6 }, { opacity: 1 }], { duration: 180 });
}
document.querySelectorAll('[data-page]').forEach(b => b.onclick = () => navigate(b.dataset.page));
document.querySelectorAll('[data-key]').forEach(b => b.onclick = () => void act(() => window.monitor.remoteKey(b.dataset.key)));
let appearance = { theme: 'system', alwaysScrollbars: false };
function renderAppearance(next) {
  appearance = next; document.body.classList.toggle('night', next.dark); document.body.dataset.platform = next.platform;
  document.body.classList.toggle('always-scrollbars', next.alwaysScrollbars);
  $('keep-in-tray').checked = next.keepInTray;
  $('background-hint').textContent = next.platform === 'darwin' ? 'Closing hides the window. Reopen from the menu-bar icon; choose Quit to exit.' : 'Closing hides the window. Reopen from the tray icon; choose Quit to exit.';
  $('always-scrollbars').checked = next.alwaysScrollbars;
  document.querySelectorAll('[data-theme]').forEach(b => { b.classList.toggle('selected', b.dataset.theme === next.theme); b.setAttribute('aria-pressed', String(b.dataset.theme === next.theme)); });
}
async function setAppearance(change) {
  try { renderAppearance(await window.monitor.appearance({ theme: appearance.theme, alwaysScrollbars: appearance.alwaysScrollbars, keepInTray: appearance.keepInTray, ...change })); $('appearance-message').textContent = ''; }
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
  finally { managing = false; render(state); if (errorMessage) $('message').textContent = errorMessage; }
}
