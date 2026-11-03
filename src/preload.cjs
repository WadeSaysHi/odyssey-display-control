const { contextBridge, ipcRenderer } = require('electron');
let deviceId = null, revision = 0;
const send = (name, value = {}) => ipcRenderer.invoke(`monitor:${name}`, { ...value, deviceId });
contextBridge.exposeInMainWorld('monitor', Object.freeze({
  panel: value => ipcRenderer.invoke('monitor:panel',value),
  appearance: value => ipcRenderer.invoke('monitor:appearance', value),
  remoteKey: (key, keyboard = false) => send('remote', { key, keyboard }),
  onAppearance: callback => {
    const handler = (_event, value) => callback(value); ipcRenderer.on('monitor:appearance', handler);
    return () => ipcRenderer.removeListener('monitor:appearance', handler);
  },
  state: async () => { const before = revision; const state = await ipcRenderer.invoke('monitor:state'); if (before === revision) deviceId = state.deviceId; return state; },
  displays: value => ipcRenderer.invoke('monitor:displays', value),
  pair: (host, autoConfirm = true, controlProfile = 'read-only') => send('pair', { host, autoConfirm, controlProfile }),
  reconnect: host => send('reconnect', { host }),
  switch: key => send('switch', { key }),
  forget: () => send('forget'),
  refreshInformation: () => send('information'),
  setSetting: (key, value, input) => send('setting', { key, value, input }),
  associateComputer: (input, displayKey) => send('associate', { input, displayKey }),
  onState: callback => {
    const handler = (_event, state) => { revision++; deviceId = state.deviceId; callback(state); };
    ipcRenderer.on('monitor:state', handler);
    return () => ipcRenderer.removeListener('monitor:state', handler);
  },
}));
