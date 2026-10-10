import { app, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { createMainWindow, getMainWindow, toggleLens } from './windows'
import { registerIpc, applyShortcuts, shutdown } from './ipc'
import { initHistory, closeHistory } from './history'
import { terminateOcr } from './ocr'
import { unregisterShortcuts } from './shortcuts'
import { getSettings } from './store'

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    } else {
      createMainWindow()
    }
  })

  app.whenReady().then(async () => {
    await initHistory()
    registerIpc()
    applyShortcuts()

    const settings = getSettings()
    const win = createMainWindow()
    if (settings.startMinimized) win.hide()
    if (app.isPackaged && settings.startWithWindows) {
      try {
        app.setLoginItemSettings({ openAtLogin: true })
      } catch {
        /* not critical */
      }
    }

    setupTray()

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })

    app.on('before-quit', () => {
      shutdown()
      closeHistory()
      void terminateOcr()
      unregisterShortcuts()
    })
  })
}

function resolveTrayIcon(): Electron.NativeImage {
  const candidates = [
    app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(app.getAppPath(), 'resources', 'icon.png')
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return nativeImage.createFromPath(c)
  }
  return nativeImage.createEmpty()
}

function setupTray(): void {
  try {
    const tray = new Tray(resolveTrayIcon())
    tray.setToolTip('LinguaLens AI')
    const menu = Menu.buildFromTemplate([
      {
        label: 'Open LinguaLens AI',
        click: () => createMainWindow()
      },
      {
        label: 'Show / hide lens',
        click: () => toggleLens()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit()
      }
    ])
    tray.setContextMenu(menu)
    tray.on('click', () => createMainWindow())
  } catch {
    /* tray is best-effort */
  }
}
