const { app, BrowserWindow, screen, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let win;
let moveInterval = null;
let currentMovementRoutine = null;
let routineIndex = 0;

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
      enableRemoteModule: true,
      webSecurity: false // Allow loading local resources
    },
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    x: width - 400,
    y: height - 600
  });
  
  // Set the window level to 'floating' to stay above full-screen apps
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  
  win.loadFile('index.html');
}

function moveWindowRandomly() {
  if (!win) return;
  
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  
  const [currentX, currentY] = win.getPosition();
  
  const newX = Math.max(0, Math.min(width - 350, Math.random() * (width - 350)));
  const newY = Math.max(0, Math.min(height - 550, Math.random() * (height - 550)));
  
  animateWindowPosition(currentX, currentY, newX, newY);
}

function executeMovementRoutine() {
  if (!win || !currentMovementRoutine || routineIndex >= currentMovementRoutine.length) {
    routineIndex = 0;
    if (!currentMovementRoutine) return;
  }
  
  const [currentX, currentY] = win.getPosition();
  const nextPosition = currentMovementRoutine[routineIndex];
  
  animateWindowPosition(currentX, currentY, nextPosition.x, nextPosition.y);
  
  routineIndex++;
}

let animationInProgress = false;
function animateWindowPosition(startX, startY, endX, endY) {
  if (animationInProgress) return;
  
  animationInProgress = true;
  const duration = 1500; 
  const framesPerSecond = 60;
  const totalFrames = Math.floor(duration / (1000 / framesPerSecond));
  let currentFrame = 0;
  
  const animationInterval = setInterval(() => {
    currentFrame++;
    
    if (currentFrame > totalFrames) {
      clearInterval(animationInterval);
      animationInProgress = false;
      return;
    }
    
    const progress = easeInOutQuad(currentFrame / totalFrames);
    
    const x = startX + (endX - startX) * progress;
    const y = startY + (endY - startY) * progress;
    
    win.setPosition(Math.round(x), Math.round(y));
  }, 1000 / framesPerSecond);
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function startAutonomousMovement(interval = 3000, routine = null) {
  stopAutonomousMovement();
  
  currentMovementRoutine = routine;
  routineIndex = 0;
  
  const movementFunction = routine ? executeMovementRoutine : moveWindowRandomly;
  
  moveInterval = setInterval(movementFunction, interval);
}

function stopAutonomousMovement() {
  if (moveInterval) {
    clearInterval(moveInterval);
    moveInterval = null;
  }
  currentMovementRoutine = null;
  routineIndex = 0;
}

const movementRoutines = {
  random: function() {
    return null; 
  },
  
  demo: function() {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;
    
    const winWidth = 350;
    const winHeight = 550;
    
    const centerX = Math.floor((width - winWidth) / 2);
    const centerY = Math.floor((height - winHeight) / 2);
    
    return [
      { x: centerX, y: centerY },
      
      { x: 0, y: 0 },
      { x: width - winWidth, y: 0 },
      { x: width - winWidth, y: height - winHeight },
      { x: 0, y: height - winHeight },
      
      { x: centerX, y: centerY },
      
      { x: centerX, y: 0 },
      { x: centerX + Math.floor(centerX * 0.7), y: centerY },
      { x: centerX + Math.floor(centerX * 0.5), y: centerY - Math.floor(centerY * 0.5) },
      { x: centerX, y: centerY - Math.floor(centerY * 0.7) },
      { x: centerX - Math.floor(centerX * 0.5), y: centerY - Math.floor(centerY * 0.5) },
      { x: centerX - Math.floor(centerX * 0.7), y: centerY },
      { x: centerX - Math.floor(centerX * 0.5), y: centerY + Math.floor(centerY * 0.5) },
      { x: centerX, y: centerY + Math.floor(centerY * 0.7) },
      { x: centerX + Math.floor(centerX * 0.5), y: centerY + Math.floor(centerY * 0.5) },
      
      { x: centerX, y: centerY }
    ];
  }
};

app.whenReady().then(() => {
  createWindow();
  
  // Add keyboard shortcut to open DevTools (Ctrl+Shift+I)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.openDevTools();
      event.preventDefault();
    }
  });
  
  // Handle desktop capture request
  ipcMain.handle('get-desktop-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      });
      return sources;
    } catch (error) {
      console.error('Error getting desktop sources:', error);
      return [];
    }
  });
  
  ipcMain.on('start-movement', (event, interval, routineName) => {
    let routine = null;
    
    if (routineName && movementRoutines[routineName]) {
      routine = movementRoutines[routineName]();
    }
    
    startAutonomousMovement(interval || 3000, routine);
  });
  
  ipcMain.on('stop-movement', () => {
    stopAutonomousMovement();
  });
  
  ipcMain.on('toggle-movement', (event, interval, routineName) => {
    if (moveInterval) {
      stopAutonomousMovement();
    } else {
      let routine = null;
      
      if (routineName && movementRoutines[routineName]) {
        routine = movementRoutines[routineName]();
      }
      
      startAutonomousMovement(interval || 3000, routine);
    }
  });

  // Handle executing agent.py with suggestion text
  ipcMain.on('execute-agent', (event, suggestionText) => {
    try {
      console.log(`Executing agent.py with task: ${suggestionText}`);
      
      // Create a temporary file to modify agent.py with the new task
      const agentProcess = spawn('python3', [
        path.join(__dirname, 'browser-use', 'agent.py'),
        suggestionText
      ]);
      
      // Log output from the Python script
      agentProcess.stdout.on('data', (data) => {
        console.log(`Agent output: ${data}`);
        event.sender.send('agent-output', data.toString());
      });
      
      agentProcess.stderr.on('data', (data) => {
        console.error(`Agent error: ${data}`);
        event.sender.send('agent-error', data.toString());
      });
      
      agentProcess.on('close', (code) => {
        console.log(`Agent process exited with code ${code}`);
        event.sender.send('agent-completed', code);
      });
    } catch (error) {
      console.error('Error executing agent.py:', error);
      event.sender.send('agent-error', error.toString());
    }
  });
});

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
