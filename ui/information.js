const fieldLabels = { resolution: 'Current Input Resolution', refreshRate: 'Refresh Rate', vrr: 'VRR Status', hdr: 'HDR Status', pictureMode: 'Picture Mode', soundMode: 'Sound Mode', volume: 'Volume' };
let informationSignature = '', controlSignature = '', displaySignature = '';
function element(tag, className, content) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (content !== undefined) node.textContent = content; return node;
}
function ageText(block, fresh) {
  const last = block.at ? new Date(block.at).toLocaleTimeString() : 'never';
  const stale = block.at && (!fresh || Date.now() - block.at >= 30000);
  return `${stale ? 'Stale · ' : block.status === 'unavailable' ? 'Unavailable · ' : ''}Updated ${last}`;
}
function renderInformation(state, busy) {
  const info = state.information; if (!info) return;
  const signature = JSON.stringify(info.fields);
  if (signature !== informationSignature) {
    informationSignature = signature;
    const fields = Object.entries(fieldLabels).map(([key, label]) => {
      const field = info.fields[key];
      const row = element('div', 'signal-item'); row.title = field.note;
      row.append(element('span', 'field-label', label), element('strong', '', field.value),
        element('span', `field-source ${field.status}`, `${field.source}${field.status === 'stale' ? ' · Stale' : ''}`));
      if (key === 'resolution' && field.source === 'This Computer') row.append(element('span', 'field-caveat', 'OS mode; monitor timing unverified'));
      return row;
    });
    $('signal-grid').replaceChildren(...fields);
  }
  $('monitor-query-status').textContent = `Monitor: ${ageText(info.monitor, info.monitorFresh)}`;
  $('computer-query-status').textContent = `This Computer: ${ageText(info.computer, info.computerFresh)}`;
  $('information-error').textContent = [info.monitor.error, info.computer.error].filter(Boolean).join(' ');
  $('refresh-information').disabled = busy;
  $('refresh-information').textContent = busy ? 'Please wait…' : 'Refresh';
  const controlsKey = JSON.stringify([info.controls, busy, info.monitorFresh]);
  if (controlsKey !== controlSignature && !document.querySelector('.control-grid:focus-within')) {
    controlSignature = controlsKey;
    const groups = { sound: [], picture: [] };
    for (const control of info.controls) {
      const form = element('form', 'setting-control');
      const label = element('label', '', control.label); const input = document.createElement(control.choices ? 'select' : 'input');
      input.id = `setting-${control.key}`; input.setAttribute('aria-label', control.label); label.htmlFor = input.id;
      if (control.choices) for (const value of control.choices) { const option = element('option', '', value === 'muteOn' ? 'Muted' : 'Unmuted'); option.value = value; input.append(option); }
      else { input.type = 'number'; input.min = control.min; input.max = control.max; input.step = 1; }
      input.value = control.value ?? ''; input.disabled = busy || !control.enabled;
      const apply = element('button', 'secondary', 'Apply'); apply.type = 'submit'; apply.disabled = busy || !control.enabled;
      const hint = element('span', 'control-status', control.enabled ? `${control.choices ? 'Read-back required' : `API range ${control.min}–${control.max}`} · Monitor` : 'Unavailable or stale');
      form.append(label, input, apply, hint);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!form.reportValidity()) return;
        const value = control.choices ? input.value : input.value === '' ? NaN : Number(input.value);
        void act(() => window.monitor.setSetting(control.key, value));
      }); groups[control.group].push(form);
    }
    $('sound-controls').replaceChildren(...groups.sound); $('picture-controls').replaceChildren(...groups.picture);
  }
  for (const control of info.controls) {
    const input = $(`setting-${control.key}`); if (!input) continue;
    input.disabled = busy || !control.enabled || Date.now() - info.monitor.at >= 30000;
    input.closest('form').querySelector('button').disabled = input.disabled;
  }
  $('brightness-raw').textContent = info.monitor.input === state.current && info.monitor.values.brightnessRaw != null ? `${info.monitor.values.brightnessRaw}${info.monitorFresh ? '' : ' · Stale'}` : 'Unknown';
  const displayKey = JSON.stringify(info.computer.displays);
  if (displayKey !== displaySignature) {
    displaySignature = displayKey;
    $('computer-display').replaceChildren(...info.computer.displays.map(d => { const option = element('option', '', `${d.label}: ${d.width} × ${d.height}`); option.value = d.key; return option; }));
    $('computer-display').value = info.association?.displayKey || info.computer.displays[0]?.key || '';
    $('computer-input').value = info.association?.input || '';
  }
  $('computer-output').textContent = info.computer.displays.map(d => `${d.label}: ${d.width} × ${d.height}, ${d.refreshRate ? Number(d.refreshRate.toFixed(3)) + ' Hz' : 'refresh rate unknown'} (This Computer; ${info.computerFresh ? 'OS output' : 'stale'})`).join(' · ') || 'This Computer display information is unavailable.';
  $('save-association').disabled = busy || !state.paired || !info.computerFresh;
  $('computer-input').disabled = busy; $('computer-display').disabled = busy;
}
