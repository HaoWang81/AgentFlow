import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

import { initDatabase } from './database'
import { startApiServer } from './api'
import { agentScheduler } from './scheduler'

// Initialize Local SQLite Database
initDatabase()

let mainWindow: BrowserWindow | null = null
let apiServer: any = null

async function createWindow() {
  // Start the inner Express server
  if (!apiServer) {
    apiServer = await startApiServer()
    // Initialize scheduled agents after DB/API server is up
    await agentScheduler.init()
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    titleBarStyle: 'hiddenInset', // Mac-like native feel
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Check if we are running in Dev mode (Vite)
  if (process.env.VITE_DEV_SERVER_URL) {
    // Clear potentially corrupted dev service workers
    await mainWindow.webContents.session.clearStorageData({ storages: ['serviceworkers'] })
    
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // Production mode
    mainWindow.loadFile(path.join(import.meta.dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (apiServer && typeof apiServer.close === 'function') {
    apiServer.close()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
