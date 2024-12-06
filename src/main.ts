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

ipcMain.handle('update-thinkfan-config', async (_event, levels) => {
  try {
    const configContent = await fs.readFile('/etc/thinkfan.conf', 'utf-8');
    const lines = configContent.split('\n');
    let levelIndex = 0;
    
    const newLines = lines.map(line => {
      if (line.startsWith('(') && line.endsWith(')')) {
        const level = levels[levelIndex];
        levelIndex++;
        return `(${level.level}, ${level.low}, ${level.high})`;
      }
      return line;
    });

    const newConfig = newLines.join('\n');
    const tempFile = '/tmp/thinkfan.conf.tmp';
    await fs.writeFile(tempFile, newConfig, 'utf-8');
    
    await execAsync(`pkexec sh -c 'cat ${tempFile} > /etc/thinkfan.conf && systemctl restart thinkfan'`);
    await fs.unlink(tempFile);
    
    return await parseThinkfanConfig(newConfig);
  } catch (error) {
    console.error('Error updating thinkfan config:', error);
    throw error;
  }
});

async function getSensorPaths() {
  try {
    // Try multiple locations for temperature sensors
    const commands = [
      'find /sys/class/hwmon -type f -name "temp*_input"',
      'find /sys/devices/platform -type f -name "temp*_input"',
      'find /sys/devices/virtual/thermal -type f -name "temp*_input"'
    ];

    const results = await Promise.all(commands.map(cmd => execAsync(cmd).catch(() => ({ stdout: '' }))));
    const allPaths = results
      .map(result => result.stdout.trim())
      .filter(Boolean)
      .join('\n')
      .split('\n')
      .filter(Boolean);

    return allPaths;
  } catch (error) {
    console.error('Error finding sensor paths:', error);
    throw error;
  }
}

// Modify get-available-sensors handler to include the actual path
ipcMain.handle('get-available-sensors', async () => {
  try {
    const [sensorsOutput, sensorPaths] = await Promise.all([
      execAsync('sensors -j'),
      getSensorPaths()
    ]);
    
    const sensorsData = JSON.parse(sensorsOutput.stdout);
    const availableSensors = [];
    
    for (const [adapter, data] of Object.entries(sensorsData)) {
      for (const [sensorName, values] of Object.entries(data as object)) {
        if (typeof values === 'object' && values !== null) {
          for (const [key, value] of Object.entries(values)) {
            if (key.includes('temp') || key.includes('Tctl') || key === 'CPU' || key === 'edge') {
              if (value !== null && (typeof value === 'number' || (typeof value === 'object' && 'input' in value))) {
                // Find matching path from sensorPaths
                const matchingPath = sensorPaths.find(path => {
                  const normalizedPath = path.toLowerCase();
                  const normalizedAdapter = adapter.toLowerCase().replace(/[-_]/g, '');
                  const normalizedSensor = sensorName.toLowerCase().replace(/[-_]/g, '');
                  return normalizedPath.includes(normalizedAdapter) || 
                         normalizedPath.includes(normalizedSensor) ||
                         normalizedPath.includes('thermal');
                });
                
                availableSensors.push({
                  adapter,
                  name: sensorName,
                  sensor: key,
                  path: matchingPath || '',
                  current: typeof value === 'number' ? value : (value as { input: number }).input
                });
              }
            }
          }
        }
      }
    }
    
    return availableSensors;
  } catch (error) {
    console.error('Error reading sensors:', error);
    throw error;
  }
});

// Add this function before the update-thinkfan-sensor handler
async function findActualSensorPath(sensorPath: string): Promise<string> {
  try {
    // First try the direct path
    try {
      await fs.access(sensorPath);
      return sensorPath;
    } catch {
      // If direct path fails, try alternative paths
      const alternatives = [
        sensorPath,
        `/sys/devices/platform/${sensorPath}`,
        `/sys/devices/virtual/thermal/${sensorPath}`,
        `/sys/class/hwmon/${sensorPath}`
      ];

      for (const path of alternatives) {
        try {
          await fs.access(path);
          return path;
        } catch {
          continue;
        }
      }
    }
    throw new Error('Sensor path not found');
  } catch (error) {
    console.error('Error finding sensor path:', error);
    throw error;
  }
}

// Modify the update-thinkfan-sensor handler
ipcMain.handle('update-thinkfan-sensor', async (_event, sensorPattern: string) => {
  try {
    const actualPath = await findActualSensorPath(sensorPattern);
    if (!actualPath) {
      throw new Error('Sensor path not found');
    }

    const configContent = await fs.readFile('/etc/thinkfan.conf', 'utf-8');
    const lines = configContent.split('\n');
    
    const hwmonIndex = lines.findIndex(line => line.trim().startsWith('hwmon'));
    const newLine = `hwmon ${actualPath}`;
    
    if (hwmonIndex !== -1) {
      lines[hwmonIndex] = newLine;
    } else {
      // Add after any comments at the start
      let insertIndex = 0;
      while (insertIndex < lines.length && (lines[insertIndex].startsWith('#') || lines[insertIndex].trim() === '')) {
        insertIndex++;
      }
      lines.splice(insertIndex, 0, newLine);
    }

    const newConfig = lines.join('\n');
    const tempFile = '/tmp/thinkfan.conf.tmp';
    await fs.writeFile(tempFile, newConfig, 'utf-8');
    
    await execAsync(`pkexec sh -c 'cat ${tempFile} > /etc/thinkfan.conf && systemctl restart thinkfan'`);
    await fs.unlink(tempFile);
    
    return await parseThinkfanConfig(newConfig);
  } catch (error) {
    console.error('Error updating thinkfan sensor:', error);
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