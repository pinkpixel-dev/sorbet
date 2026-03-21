"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose a safe, typed API to the renderer via window.mosaic
electron_1.contextBridge.exposeInMainWorld('mosaic', {
    platform: process.platform,
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
    },
    // Persistent store
    store: {
        getLayout: () => electron_1.ipcRenderer.invoke('store:getLayout'),
        saveLayout: (layout) => electron_1.ipcRenderer.invoke('store:saveLayout', layout),
        getTheme: () => electron_1.ipcRenderer.invoke('store:getTheme'),
        saveTheme: (theme) => electron_1.ipcRenderer.invoke('store:saveTheme', theme),
    },
});
