import { clipboard, contextBridge, ipcRenderer } from 'electron'

// Expose a safe, typed API to the renderer via window.sorbet
contextBridge.exposeInMainWorld('sorbet', {
  platform: process.platform,
  clipboard: {
    readText: async () => clipboard.readText(),
    writeText: async (text: string) => {
      clipboard.writeText(text)
    },
  },

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

    onMetadata: (sessionId: string, callback: (metadata: { shellName?: string; cwd?: string }) => void) => {
      const channel = `pty:metadata:${sessionId}`
      const handler = (_event: Electron.IpcRendererEvent, metadata: { shellName?: string; cwd?: string }) => callback(metadata)
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
    getWorkspaces: () => ipcRenderer.invoke('store:getWorkspaces'),
    getWorkspaceTemplates: () => ipcRenderer.invoke('store:getWorkspaceTemplates'),
    createWorkspace: (name: string, snapshot: unknown, makeCurrent = true) =>
      ipcRenderer.invoke('store:createWorkspace', name, snapshot, makeCurrent),
    createWorkspaceFromTemplate: (templateId: string, name?: string) =>
      ipcRenderer.invoke('store:createWorkspaceFromTemplate', templateId, name),
    updateWorkspace: (id: string, updates: unknown) =>
      ipcRenderer.invoke('store:updateWorkspace', id, updates),
    updateWorkspaceSnapshot: (id: string, snapshot: unknown) =>
      ipcRenderer.invoke('store:updateWorkspaceSnapshot', id, snapshot),
    deleteWorkspace: (id: string) => ipcRenderer.invoke('store:deleteWorkspace', id),
    setCurrentWorkspace: (id: string) => ipcRenderer.invoke('store:setCurrentWorkspace', id),
    getPreferences: () => ipcRenderer.invoke('config:getPreferences'),
    getCustomThemes: () => ipcRenderer.invoke('config:getCustomThemes'),
    onConfigChanged: (callback: () => void) => {
      const channel = 'config:changed'
      const handler = () => callback()
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  },
})
