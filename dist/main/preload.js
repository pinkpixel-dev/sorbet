"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose a safe, typed API to the renderer via window.sorbet
electron_1.contextBridge.exposeInMainWorld('sorbet', {
    platform: process.platform,
    clipboard: {
        readText: async () => electron_1.clipboard.readText(),
        writeText: async (text) => {
            electron_1.clipboard.writeText(text);
        },
    },
    // PTY operations
    pty: {
        create: (sessionId, cols, rows) => electron_1.ipcRenderer.invoke('pty:create', sessionId, cols, rows),
        write: (sessionId, data) => electron_1.ipcRenderer.send('pty:write', sessionId, data),
        resize: (sessionId, cols, rows) => electron_1.ipcRenderer.send('pty:resize', sessionId, cols, rows),
        kill: (sessionId) => electron_1.ipcRenderer.invoke('pty:kill', sessionId),
        onData: (sessionId, callback) => {
            const channel = `pty:data:${sessionId}`;
            const handler = (_event, data) => callback(data);
            electron_1.ipcRenderer.on(channel, handler);
            // Return cleanup function
            return () => electron_1.ipcRenderer.removeListener(channel, handler);
        },
        onExit: (sessionId, callback) => {
            const channel = `pty:exit:${sessionId}`;
            const handler = (_event, info) => callback(info);
            electron_1.ipcRenderer.on(channel, handler);
            return () => electron_1.ipcRenderer.removeListener(channel, handler);
        },
        onMetadata: (sessionId, callback) => {
            const channel = `pty:metadata:${sessionId}`;
            const handler = (_event, metadata) => callback(metadata);
            electron_1.ipcRenderer.on(channel, handler);
            return () => electron_1.ipcRenderer.removeListener(channel, handler);
        },
    },
    // Persistent store
    store: {
        getLayout: () => electron_1.ipcRenderer.invoke('store:getLayout'),
        saveLayout: (layout) => electron_1.ipcRenderer.invoke('store:saveLayout', layout),
        getTheme: () => electron_1.ipcRenderer.invoke('store:getTheme'),
        saveTheme: (theme) => electron_1.ipcRenderer.invoke('store:saveTheme', theme),
        getWorkspaces: () => electron_1.ipcRenderer.invoke('store:getWorkspaces'),
        getWorkspaceTemplates: () => electron_1.ipcRenderer.invoke('store:getWorkspaceTemplates'),
        createWorkspace: (name, snapshot, makeCurrent = true) => electron_1.ipcRenderer.invoke('store:createWorkspace', name, snapshot, makeCurrent),
        createWorkspaceFromTemplate: (templateId, name) => electron_1.ipcRenderer.invoke('store:createWorkspaceFromTemplate', templateId, name),
        updateWorkspace: (id, updates) => electron_1.ipcRenderer.invoke('store:updateWorkspace', id, updates),
        updateWorkspaceSnapshot: (id, snapshot) => electron_1.ipcRenderer.invoke('store:updateWorkspaceSnapshot', id, snapshot),
        deleteWorkspace: (id) => electron_1.ipcRenderer.invoke('store:deleteWorkspace', id),
        setCurrentWorkspace: (id) => electron_1.ipcRenderer.invoke('store:setCurrentWorkspace', id),
        getPreferences: () => electron_1.ipcRenderer.invoke('config:getPreferences'),
        getCustomThemes: () => electron_1.ipcRenderer.invoke('config:getCustomThemes'),
        onConfigChanged: (callback) => {
            const channel = 'config:changed';
            const handler = () => callback();
            electron_1.ipcRenderer.on(channel, handler);
            return () => electron_1.ipcRenderer.removeListener(channel, handler);
        },
    },
});
