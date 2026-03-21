import { contextBridge, ipcRenderer } from 'electron'

// Expose a safe, typed API to the renderer via window.mosaic
contextBridge.exposeInMainWorld('mosaic', {
  platform: process.platform,

  // PTY operations
  pty: {
    create: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:create', sessionId, cols, rows),

    write: (sessionId: string, data: string) =>
      ipcRenderer.send('pty:write', sessionId, data),

    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', sessionId, cols, rows),

    kill: (sessionId: string) =>
      ipcRenderer.invoke('pty:kill', sessionId),

    onData: (sessionId: string, callback: (data: string) => void) => {
      const channel = `pty:data:${sessionId}`
      const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
      ipcRenderer.on(channel, handler)
      // Return cleanup function
      return () => ipcRenderer.removeListener(channel, handler)
    },

    onExit: (sessionId: string, callback: (info: { exitCode: number; signal: number }) => void) => {
      const channel = `pty:exit:${sessionId}`
      const handler = (_event: Electron.IpcRendererEvent, info: { exitCode: number; signal: number }) => callback(info)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  },

  // Persistent store
  store: {
    getLayout: () => ipcRenderer.invoke('store:getLayout'),
    saveLayout: (layout: unknown) => ipcRenderer.invoke('store:saveLayout', layout),
    getTheme: () => ipcRenderer.invoke('store:getTheme'),
    saveTheme: (theme: string) => ipcRenderer.invoke('store:saveTheme', theme),
  },
})
