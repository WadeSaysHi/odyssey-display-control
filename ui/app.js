const $ = id => document.getElementById(id);
const labels = { 'usb-c': 'USB-C', displayport: 'DisplayPort', hdmi: 'HDMI' };
let state, pending = false, receivedEvent = false;
const settings = $('settings');
function freshness() {
  if (!state?.updatedAt) return;
  const seconds = Math.max(0, Math.floor((Date.now() - state.updatedAt) / 1000));
  $('freshness').textContent = seconds < 2 ? 'Just checked on the monitor' : `Last checked ${seconds}s ago`;
}
function render(next) {
  state = next;
  const busy = state.busy || pending;
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
}
async function act(action, closeOnSuccess = false) {
  if (pending || state?.busy) return;
  pending = true; render(state);
  try {
    const result = await action();
    if (result.ok && closeOnSuccess) settings.close();
    if (!result.ok) { $('settings-message').textContent = result.message; $('message').textContent = result.message; }
  } catch {
    $('message').textContent = 'The app could not complete the request. Restart and reconnect.';
    $('settings-message').textContent = $('message').textContent;
  } finally { pending = false; render(state); }
}
$('connection').addEventListener('click', () => {
  if (!settings.open) { $('host').value = state?.host || ''; $('auto-confirm').checked = state?.autoConfirm ?? true; settings.showModal(); }
});
$('close').addEventListener('click', () => settings.close());
settings.addEventListener('cancel', event => { if (state?.busy || pending) event.preventDefault(); });
$('settings-form').addEventListener('submit', event => { event.preventDefault(); void act(() => window.monitor.pair($('host').value, $('auto-confirm').checked), true); });
$('reconnect').addEventListener('click', () => void act(() => window.monitor.reconnect($('host').value), true));
$('forget').addEventListener('click', () => void act(() => window.monitor.forget()));
document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => void act(() => window.monitor.switch(button.dataset.source))));
window.monitor.onState(next => { receivedEvent = true; render(next); });
window.monitor.state().then(initial => { if (!receivedEvent) render(initial); });
setInterval(freshness, 1000);
