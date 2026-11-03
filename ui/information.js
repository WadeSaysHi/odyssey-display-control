const fieldLabels = { resolution: 'Current Input Resolution', refreshRate: 'Refresh Rate', pictureMode: 'Picture Mode', soundMode: 'Sound Mode', volume: 'Volume' };
let informationSignature = '', displaySignature = '', controlContext = null;
let volumeDraft = null, volumeDirty = false, volumeEnabled = false, lastVolume = null, lastWheel = 0, volumeReason = '';
const pictureDrafts = new Map();
function element(tag, className, content) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (content !== undefined) node.textContent = content; return node;
}
function ageText(block, fresh) {
  const last = block.at ? new Date(block.at).toLocaleTimeString() : 'never';
  return `${block.at && !fresh ? 'Stale · ' : block.status === 'unavailable' ? 'Unavailable · ' : ''}Updated ${last}`;
}
function paintWheel(direction = 0) {
  const wheel = $('volume-wheel'); wheel.setAttribute('aria-disabled', String(!volumeEnabled));
  if(volumeDraft===null)wheel.removeAttribute('aria-valuenow');else wheel.setAttribute('aria-valuenow',volumeDraft);
  Motion.wheel($('wheel-lines'),volumeDraft,!!volumeEnabled,n=>{if(!wheelDragging)changeVolume(n-volumeDraft);},controlContext);
  $('apply-volume').disabled = !volumeEnabled || !volumeDirty;
  $('volume-draft').textContent = !volumeEnabled ? volumeReason || 'Unavailable or stale · Refresh' : volumeDirty ? `Draft ${volumeDraft} · Monitor ${lastVolume}` : `Monitor value ${lastVolume}`;
}
function changeVolume(delta) {
  if (!volumeEnabled || volumeDraft === null) return;
  const next = Math.max(0, Math.min(100, volumeDraft + delta));
  if (next === volumeDraft) return;
  volumeDraft = next; volumeDirty = volumeDraft !== lastVolume; paintWheel(delta);
}
let wheelDragging = false;
function bindVolumeWheel() {
  const w = $('volume-wheel'); let y = null;
  w.addEventListener('wheel', event => {
    if (!volumeEnabled) return; event.preventDefault();
    if (Math.abs(event.deltaY) < 1 || Date.now() - lastWheel < 70) return;
    lastWheel = Date.now(); changeVolume(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  w.addEventListener('keydown', event => {
    if (!volumeEnabled || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); changeVolume(event.key === 'Home' ? -100 : event.key === 'End' ? 100 : event.key === 'ArrowUp' ? 1 : -1);
  });
  w.addEventListener('pointerdown', event => { if (!volumeEnabled || event.button !== 0) return; y = event.clientY; wheelDragging = false; });
  w.addEventListener('pointermove', event => {
    if (y === null) return;
    const delta = Math.trunc((y - event.clientY) / 12);
    if (delta) { wheelDragging = true; w.setPointerCapture(event.pointerId); changeVolume(delta); y = event.clientY; }
  });
  const stop = () => { y = null; setTimeout(() => { wheelDragging = false; }, 0); };
  document.addEventListener('pointerup', stop); w.addEventListener('pointercancel', stop); w.addEventListener('lostpointercapture', stop);
  $('apply-volume').onclick = () => {
    const submitted = volumeDraft;
    void act(() => window.monitor.setSetting('volume', submitted, state.current), false, result => { if (result.ok) { volumeDirty = false; volumeDraft = submitted; } });
  };
  $('mute').onclick = () => {
    const c = state.information.controls.find(c => c.key === 'mute');
    if (c?.enabled) void act(() => window.monitor.setSetting('mute', c.value === 'muteOn' ? 'muteOff' : 'muteOn', state.current));
  };
}
function readingRows(target, fields, info, current) {
  const values = info.monitor.input === current ? info.monitor.values : {};
  const rows = fields.filter(([key]) => values[key] != null).map(([key, label, note]) => {
    const row = element('div', 'row'); const description = element('div'); description.append(element('strong', '', label));
    if (note) description.append(element('p', '', note));
    row.append(description, element('span', info.monitorFresh ? 'reading-value' : 'reading-value stale', `${values[key]}${info.monitorFresh ? '' : ' · Stale'}`)); return row;
  });
  $(target).replaceChildren(...(rows.length ? rows : [element('p', 'empty-reading hint', 'No verified reading yet. Refresh monitor information.')]));
}
function renderInformation(state, busy) {
  const info = state.information; if (!info) return;
  const fresh = info.monitorFresh && Date.now() - info.monitor.at < 30000;
  const signature = JSON.stringify([info.fields, fresh]);
  if (signature !== informationSignature) {
    informationSignature = signature;
    $('signal-grid').replaceChildren(...Object.entries(fieldLabels).map(([key, label]) => {
      const field = info.fields[key], row = element('div', 'signal-item'); row.title = field.note;
      row.append(element('span', 'field-label', label), element('strong', '', field.value), element('span', `field-source ${field.status}`, `${field.source}${field.status === 'stale' ? ' · Stale' : ''}`));
      if (key === 'resolution' && field.source === 'This Computer') row.append(element('span', 'field-caveat', 'OS mode; monitor timing unverified')); return row;
    }));
  }
  $('monitor-query-status').textContent = `Monitor: ${ageText(info.monitor, fresh)}`;
  $('computer-query-status').textContent = `This Computer: ${ageText(info.computer, info.computerFresh)}`;
  $('information-error').textContent = [info.monitor.error, info.computer.error, info.monitor.at && !fresh ? 'Monitor readings are stale. Refresh before making changes.' : ''].filter(Boolean).join(' ');
  $('refresh-information').disabled = busy; $('refresh-information').textContent = busy ? 'Please wait…' : 'Refresh';
  if (controlContext !== `${state.deviceId}:${state.current}`) { controlContext = `${state.deviceId}:${state.current}`; volumeDirty = false; volumeDraft = null; pictureDrafts.clear(); $('picture-controls').replaceChildren(); }
  const volume = info.controls.find(c => c.key === 'volume');
  volumeReason = busy ? 'Please wait…' : volume?.disabledReason || '';
  lastVolume = volume?.value ?? null; volumeEnabled = !busy && fresh && volume?.enabled;
  if (!volumeDirty) volumeDraft = fresh ? lastVolume : volumeDraft;
  paintWheel();
  const mute = info.controls.find(c => c.key === 'mute');
  $('mute').disabled = busy || !fresh || !mute?.enabled;
  $('mute').setAttribute('aria-checked', String(mute?.value === 'muteOn')); $('mute').classList.toggle('on', mute?.value === 'muteOn');
  $('picture-status').textContent = fresh ? `Monitor: ${ageText(info.monitor, fresh)}` : 'Readings are unavailable or stale. Refresh before making changes.';
  $('refresh-picture').disabled = busy;
  for (const c of info.controls.filter(c => c.group === 'picture')) {
    let form = $(`form-${c.key}`);
    if (!form && c.value !== null && info.monitor.input === state.current) {
      form = element('form', 'setting-control row'); form.id = `form-${c.key}`;
      const description = element('div'), label = element('label', '', c.label); label.htmlFor = `setting-${c.key}`;
      description.append(label, element('p', '', `Monitor · API range ${c.min}–${c.max}`));
      const actions = element('div', 'setting-actions'), input = element('input'); input.type = 'range'; input.min = c.min; input.max = c.max; input.step = 1; input.id = `setting-${c.key}`;
      input.setAttribute('aria-label', c.label); const output = element('output'); output.htmlFor = input.id;
      const apply = element('button', 'secondary', 'Apply'); apply.type = 'submit';
      input.addEventListener('input', () => { pictureDrafts.set(c.key, Number(input.value)); output.textContent = input.value; });
      form.addEventListener('submit', e => { e.preventDefault(); const value = Number(input.value); void act(() => window.monitor.setSetting(c.key, value, state.current), false, result => { if (result.ok) pictureDrafts.delete(c.key); }); });
      actions.append(input, output, apply); form.append(description, actions); $('picture-controls').append(form);
    }
    if (!form) continue;
    const input = form.querySelector('input'); input.disabled = busy || !fresh || !c.enabled;
    if (!pictureDrafts.has(c.key)) input.value = c.value ?? c.min;
    form.querySelector('output').textContent = input.value;
    form.querySelector('button').disabled = input.disabled;
  }
  readingRows('picture-readings', [['pictureMode', 'Picture mode'], ['colorTone', 'Color tone'], ['color', 'Color level', 'Raw API value; scale uncalibrated'], ['tint', 'Tint', 'Raw API value; scale uncalibrated']], info, state.current);
  readingRows('sound-readings', [['soundMode', 'Sound mode', 'Read-only · Monitor'], ['speakerOutput', 'Sound output', 'Read-only · Monitor']], info, state.current);
  readingRows('device-readings', [['power', 'Power state', 'Monitor query; power control unverified']], info, state.current);
  const displayKey = JSON.stringify([state.deviceId, info.computer.displays, info.association, state.sources]);
  if (displayKey !== displaySignature && !document.querySelector('.association-row:focus-within')) {
    displaySignature = displayKey;
    $('computer-display').replaceChildren(...info.computer.displays.map(d => { const option = element('option', '', `${d.label}: ${d.width} × ${d.height}`); option.value = d.key; return option; }));
    $('computer-input').replaceChildren(...[{key:'',label:'Not associated'}, ...state.sources].map(s => { const o = element('option','',s.label || s.key); o.value=s.key; return o; }));
    $('computer-display').value = info.association?.displayKey || info.computer.displays[0]?.key || ''; $('computer-input').value = info.association?.input || '';
  }
  $('computer-output').textContent = info.computer.displays.map(d => `${d.label}: ${d.width} × ${d.height}, ${d.refreshRate ? Number(d.refreshRate.toFixed(3)) + ' Hz' : 'refresh rate unknown'} (This Computer; ${info.computerFresh ? 'OS output' : 'stale'})`).join(' · ') || 'This Computer display information is unavailable.';
  $('save-association').disabled = busy || state.status!=='online' || !state.paired || !info.computerFresh;
  $('computer-input').disabled = busy || state.status!=='online'; $('computer-display').disabled = busy || !info.computerFresh;
}
