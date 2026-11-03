const $ = id => document.getElementById(id);
const labels = { 'usb-c': 'USB-C', displayport: 'DisplayPort', hdmi: 'HDMI' };
let state, pending = false, receivedEvent = false;
const settings = $('settings');
function freshness() {
  if (state?.information) renderInformation(state, state.busy || pending);
  if (!state?.updatedAt) return;
  const seconds = Math.max(0, Math.floor((Date.now() - state.updatedAt) / 1000));
  $('freshness').textContent = seconds < 2 ? 'Just checked on the monitor' : `Last checked ${seconds}s ago`;
}
function render(next) {
  state = next;
  const busy = state.busy || pending;
  $('sidebar-status').textContent = state.status === 'online' ? '● Connected' : state.paired ? 'Disconnected' : 'Not paired';
  document.querySelectorAll('[data-key]').forEach(b => b.disabled = busy || state.status !== 'online' || !state.remoteAvailable);
  $('remote-note').textContent = state.remoteAvailable ? 'Uses this app’s authorized remote connection.' : 'Enable auto-confirm and pair again to authorize the remote connection.';
  $('connection-label').textContent = busy ? 'Working…' : state.status === 'online' ? 'Connected' : state.paired ? 'Reconnect' : 'Set up connection';
  $('dot').classList.toggle('online', state.status === 'online');
  $('current-label').textContent = state.status === 'online' ? 'Current input' : state.paired ? 'Monitor unavailable' : 'Your monitor, within reach';
  $('current').textContent = labels[state.current] || (state.status === 'online' ? 'No external input selected' : state.paired ? 'Check your monitor connection.' : 'Choose where you work or play.');
  $('screen-label').textContent = labels[state.current] || 'G8';
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
  if (pending || state?.busy) return;
  pending = true; render(state);
  try {
    const result = await action();
    complete(result);
    if (result.ok && closeOnSuccess) settings.close();
    if (!result.ok) { $('settings-message').textContent = result.message; $('message').textContent = result.message; }
  } catch {
    $('message').textContent = 'The app could not complete the request. Restart and reconnect.';
    $('settings-message').textContent = $('message').textContent;
  } finally { pending = false; render(state); }
}
function openConnection() {
  if (!settings.open) { $('host').value = state?.host || ''; $('auto-confirm').checked = state?.autoConfirm ?? true; settings.showModal(); }
}
$('connection').addEventListener('click', openConnection);
$('close').addEventListener('click', () => settings.close());
settings.addEventListener('cancel', event => { if (state?.busy || pending) event.preventDefault(); });
$('settings-form').addEventListener('submit', event => { event.preventDefault(); void act(() => window.monitor.pair($('host').value, $('auto-confirm').checked), true); });
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
  currentPage = page;
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
  $('always-scrollbars').checked = next.alwaysScrollbars;
  document.querySelectorAll('[data-theme]').forEach(b => { b.classList.toggle('selected', b.dataset.theme === next.theme); b.setAttribute('aria-pressed', String(b.dataset.theme === next.theme)); });
}
async function setAppearance(change) {
  try { renderAppearance(await window.monitor.appearance({ theme: appearance.theme, alwaysScrollbars: appearance.alwaysScrollbars, ...change })); $('appearance-message').textContent = ''; }
  catch { $('appearance-message').textContent = 'Appearance could not be saved. Try again.'; }
}
window.monitor.onAppearance(renderAppearance);
window.monitor.appearance().then(renderAppearance).catch(() => { $('appearance-message').textContent = 'Appearance preferences could not be loaded.'; });
document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => void setAppearance({ theme: b.dataset.theme }));
$('theme-toggle').onclick = () => void setAppearance({ theme: appearance.dark ? 'light' : 'dark' });
$('always-scrollbars').onchange = e => void setAppearance({ alwaysScrollbars: e.target.checked });
