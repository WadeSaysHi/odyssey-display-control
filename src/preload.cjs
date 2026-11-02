const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('monitor', Object.freeze({
  state: () => ipcRenderer.invoke('monitor:state'),
  pair: (host, autoConfirm = true) => ipcRenderer.invoke('monitor:pair', { host, autoConfirm }),
  reconnect: host => ipcRenderer.invoke('monitor:reconnect', host),
  switch: key => ipcRenderer.invoke('monitor:switch', key),
  forget: () => ipcRenderer.invoke('monitor:forget'),
  onState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('monitor:state', handler);
    return () => ipcRenderer.removeListener('monitor:state', handler);
  },
}));
