const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

let win;

console.l
function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  
  win = new BrowserWindow({
    width: 350,
    height: 550,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable: false,
    x: width - 400,
    y: height - 650
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
