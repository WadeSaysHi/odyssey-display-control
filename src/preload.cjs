const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('monitor', Object.freeze({
  appearance: value => ipcRenderer.invoke('monitor:appearance', value),
  remoteKey: key => ipcRenderer.invoke('monitor:remote', key),
  onAppearance: callback => {
    const handler = (_event, value) => callback(value); ipcRenderer.on('monitor:appearance', handler);
    return () => ipcRenderer.removeListener('monitor:appearance', handler);
  },
  state: () => ipcRenderer.invoke('monitor:state'),
  pair: (host, autoConfirm = true) => ipcRenderer.invoke('monitor:pair', { host, autoConfirm }),
  reconnect: host => ipcRenderer.invoke('monitor:reconnect', host),
  switch: key => ipcRenderer.invoke('monitor:switch', key),
  forget: () => ipcRenderer.invoke('monitor:forget'),
  refreshInformation: () => ipcRenderer.invoke('monitor:information'),
  setSetting: (key, value, input) => ipcRenderer.invoke('monitor:setting', { key, value, input }),
  associateComputer: (input, displayKey) => ipcRenderer.invoke('monitor:associate', { input, displayKey }),
  onState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('monitor:state', handler);
    return () => ipcRenderer.removeListener('monitor:state', handler);
  },
}));
