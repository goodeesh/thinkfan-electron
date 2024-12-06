import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { promisify } from 'util';
import { exec } from 'child_process';
const execAsync = promisify(exec);

const isDev = process.env.NODE_ENV === 'development'
let mainWindow: BrowserWindow | null = null

// Function to parse thinkfan config file
async function parseThinkfanConfig(content: string) {
  const lines = content.split('\n').map(line => line.trim())
  const sensors: Array<{ type: string; path: string; name: string }> = []
  const fans: Array<{ type: string; path: string; name: string }> = []
  const levels: Array<{ level: number; low: number; high: number }> = []

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line === '') continue

    if (line.startsWith('hwmon')) {
      const [type, path] = line.split(/\s+/).filter(Boolean)
      sensors.push({
        type,
        path,
        name: 'CPU Temperature'
      })
    } else if (line.startsWith('tp_fan')) {
      const [type, path] = line.split(/\s+/).filter(Boolean)
      fans.push({
        type,
        path,
        name: 'ThinkPad Fan'
      })
    } else if (line.startsWith('(') && line.endsWith(')')) {
      // Parse fan levels in format (level, low, high)
      const values = line.replace(/[()]/g, '').split(',').map(v => parseInt(v.trim()))
      if (values.length === 3) {
        levels.push({
          level: values[0],
          low: values[1],
          high: values[2]
        })
      }
    }
  }

  return { sensors, fans, levels }
}

// Register IPC handler before creating the window
ipcMain.handle('read-thinkfan-config', async () => {
  try {
    const configContent = await fs.readFile('/etc/thinkfan.conf', 'utf-8')
    const parsedConfig = await parseThinkfanConfig(configContent)
    console.log('Parsed config:', parsedConfig) // Add this for debugging
    return parsedConfig
  } catch (error) {
    console.error('Error reading thinkfan config:', error)
    throw error
  }
});

ipcMain.handle('update-thinkfan-level', async (_event, { index, level }: { index: number, level: { level: number, low: number, high: number } }) => {
  try {
    // Read current config
    const configContent = await fs.readFile('/etc/thinkfan.conf', 'utf-8');
    const lines = configContent.split('\n');
    
    // Find and update the level line
    let levelCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('(') && line.endsWith(')')) {
        if (levelCount === index) {
          lines[i] = `(${level.level}, ${level.low}, ${level.high})`;
          break;
        }
        levelCount++;
      }
    }

    const newConfig = lines.join('\n');
    const tempFile = '/tmp/thinkfan.conf.tmp';
    await fs.writeFile(tempFile, newConfig, 'utf-8');
    
    await execAsync(`pkexec sh -c 'cat ${tempFile} > /etc/thinkfan.conf && systemctl restart thinkfan'`);
    await fs.unlink(tempFile);
    
    return await parseThinkfanConfig(newConfig);
  } catch (error) {
    console.error('Error updating thinkfan level:', error);
    throw error;
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})