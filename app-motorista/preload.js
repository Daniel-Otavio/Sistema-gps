const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
    prepararMapaOffline: dados => ipcRenderer.invoke('preparar-mapa-offline', dados),
    sessaoSeguraSalvar: sessao => ipcRenderer.invoke('sessao-segura-salvar', sessao),
    sessaoSeguraCarregar: () => ipcRenderer.invoke('sessao-segura-carregar'),
    sessaoSeguraApagar: () => ipcRenderer.invoke('sessao-segura-apagar')
});