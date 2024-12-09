import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { promisify } from 'util';
import { exec } from 'child_process';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { ThinkfanConfig, ThinkfanLevel } from './types/thinkfan';
const execAsync = promisify(exec);

const isDev = process.env.NODE_ENV === 'development'
let mainWindow: BrowserWindow | null = null

// Function to parse thinkfan config file
async function parseThinkfanConfig(content: string): Promise<ThinkfanConfig> {
  try {
    const config = parseYAML(content);
    
    // Add names to sensors based on their paths
    if (config.sensors) {
      config.sensors = await Promise.all(config.sensors.map(async (sensor: any, index: number) => {
        const path = sensor.hwmon || sensor.tpacpi || sensor.path;
        try {
          // Try to get sensor info from the system
          const zones = await getAllThermalZones();
          const matchingSensor = zones.find(zone => zone.path === path);
          return {
            ...sensor,
            name: matchingSensor ? 
              `${matchingSensor.sensorMatch?.name || 'Sensor'} (${matchingSensor.type})` : 
              `Temperature Sensor ${index + 1}`
          };
        } catch (error) {
          console.error('Error getting sensor info:', error);
          return {
            ...sensor,
            name: `Temperature Sensor ${index + 1}`
          };
        }
      }));
    }
    
    return config;
  } catch (error) {
    console.error('Error parsing thinkfan config:', error);
    throw error;
  }
}

// Register IPC handler before creating the window
ipcMain.handle('read-thinkfan-config', async () => {
  try {
    const { content, format } = await readThinkfanConfig();
    const parsedConfig = await parseThinkfanConfig(content);
    return { ...parsedConfig, format };
  } catch (error) {
    console.error('Error reading thinkfan config:', error);
    throw error;
  }
});

ipcMain.handle('update-thinkfan-level', async (_event, { index, level }: { 
  index: number, 
  level: { 
    level: number; 
    speed: number;
    low: number; 
    high: number; 
  } 
}) => {
  try {
    const { content, format } = await readThinkfanConfig();
    
    let newConfig;
    if (format === 'yaml') {
      const parsedConfig = await parseThinkfanConfig(content);
      const levels = [...parsedConfig.levels];
      levels[index] = {
        speed: level.level,
        lower_limit: [level.low],
        upper_limit: [level.high]
      } as ThinkfanLevel;
      
      newConfig = {
        sensors: parsedConfig.sensors.map(sensor => ({
          hwmon: sensor.hwmon || sensor.path || sensor.tpacpi
        })),
        fans: parsedConfig.fans.map(fan => ({
          tpacpi: fan.tpacpi || fan.path
        })),
        levels
      };
      newConfig = stringifyYAML(newConfig);
    } else {
      const lines = content.split('\n');
      let levelCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('(') && lines[i].endsWith(')')) {
          if (levelCount === index) {
            lines[i] = `(${level.level}, ${level.low}, ${level.high})`;
            break;
          }
          levelCount++;
        }
      }
      newConfig = lines.join('\n');
    }

    const configPath = format === 'yaml' ? '/etc/thinkfan.yaml' : '/etc/thinkfan.conf';
    const tempFile = '/tmp/thinkfan.tmp';
    await fs.writeFile(tempFile, newConfig, 'utf-8');
    await execAsync(`pkexec sh -c 'cat ${tempFile} > ${configPath} && systemctl restart thinkfan'`);
    await fs.unlink(tempFile);
    
    return await parseThinkfanConfig(newConfig);
  } catch (error) {
    console.error('Error updating thinkfan level:', error);
    throw error;
  }
});

ipcMain.handle('update-thinkfan-config', async (_event, levels: ThinkfanLevel[]) => {
  try {
    const { content, format } = await readThinkfanConfig();
    const parsedConfig = await parseThinkfanConfig(content);
    
    let newConfig;
    if (format === 'yaml') {
      // Create raw YAML string preserving all sensors
      newConfig = [
        'sensors:',
        ...parsedConfig.sensors.map(sensor => 
          `  - hwmon: ${sensor.hwmon || sensor.tpacpi}`
        ),
        '',
        'fans:',
        '  - tpacpi: /proc/acpi/ibm/fan',
        '',
        'levels:',
        ...levels.map(level => [
          '  - speed: ' + level.speed,
          ...(level.lower_limit ? [`    lower_limit: [${level.lower_limit.join(', ')}]`] : []),
          `    upper_limit: [${level.upper_limit.join(', ')}]`
        ]).flat()
      ].join('\n');
    }
    
    if (!newConfig) {
      throw new Error('Failed to generate config');
    }
    return await updateThinkfanConfig(newConfig, format);
  } catch (error) {
    console.error('Error updating thinkfan config:', error);
    throw error;
  }
});

// Modify get-available-sensors handler to include the actual path
ipcMain.handle('get-available-sensors', async () => {
  const zones = await getAllThermalZones();
  return zones.map(zone => ({
    adapter: zone.sensorMatch?.adapter || zone.type,
    name: zone.sensorMatch ? `${zone.sensorMatch.name} (${zone.type})` : zone.type,
    sensor: 'temp',
    path: zone.path,
    current: zone.temp,
    type: zone.type
  }));
});

// Modify the update-thinkfan-sensor handler
ipcMain.handle('update-thinkfan-sensor', async (_event, sensorPath: string) => {
  try {
    const { content, format } = await readThinkfanConfig();
    const parsedConfig = await parseThinkfanConfig(content);
    
    let newConfig;
    if (format === 'yaml') {
      // Create new YAML config with updated sensor
      newConfig = {
        sensors: [{ hwmon: sensorPath }],
        fans: parsedConfig.fans.map(fan => ({
          [fan.type || 'unknown']: fan.path
        })),
        levels: parsedConfig.levels
      };
      newConfig = stringifyYAML(newConfig);
    } else {
      // Legacy format handling
      const lines = content.split('\n');
      const hwmonIndex = lines.findIndex(line => line.trim().startsWith('hwmon'));
      const newLine = `hwmon ${sensorPath}`;
      
      if (hwmonIndex !== -1) {
        lines[hwmonIndex] = newLine;
      } else {
        let insertIndex = 0;
        while (insertIndex < lines.length && (lines[insertIndex].startsWith('#') || lines[insertIndex].trim() === '')) {
          insertIndex++;
        }
        lines.splice(insertIndex, 0, newLine);
      }
      newConfig = lines.join('\n');
    }

    return await updateThinkfanConfig(newConfig, format);
  } catch (error) {
    console.error('Error updating thinkfan sensor:', error);
    throw error;
  }
});

ipcMain.handle('get-sensor-reading', async (_event, sensorPath: string) => {
  try {
    const content = await fs.readFile(sensorPath, 'utf-8');
    return parseInt(content.trim()) / 1000; // Convert from millidegrees to degrees
  } catch (error) {
    console.error('Error reading sensor:', error);
    throw error;
  }
});

ipcMain.handle('add-thinkfan-sensor', async (_event, sensorPath: string) => {
  try {
    const { content, format } = await readThinkfanConfig();
    const parsedConfig = await parseThinkfanConfig(content);
    
    // Add new sensor to the config
    parsedConfig.sensors.push({ hwmon: sensorPath });
    
    // Update all levels to include a new temperature value for the new sensor
    parsedConfig.levels = parsedConfig.levels.map(level => ({
      ...level,
      lower_limit: level.lower_limit ? 
        [...level.lower_limit, level.lower_limit[0]] : 
        undefined,
      upper_limit: [...level.upper_limit, level.upper_limit[0]]
    }));

    let newConfig;
    if (format === 'yaml') {
      // Create raw YAML string with updated sensors and levels
      newConfig = [
        'sensors:',
        ...parsedConfig.sensors.map(sensor => 
          `  - hwmon: ${sensor.hwmon || sensor.tpacpi || sensor.path}`
        ),
        '',
        'fans:',
        '  - tpacpi: /proc/acpi/ibm/fan',
        '',
        'levels:',
        ...parsedConfig.levels.map(level => [
          '  - speed: ' + level.speed,
          ...(level.lower_limit ? [`    lower_limit: [${level.lower_limit.join(', ')}]`] : []),
          `    upper_limit: [${level.upper_limit.join(', ')}]`
        ]).flat()
      ].join('\n');
    }
    
    if (!newConfig) {
      throw new Error('Failed to generate config');
    }

    // Update the config file and restart thinkfan
    const updatedConfig = await updateThinkfanConfig(newConfig, format);
    return updatedConfig;
  } catch (error) {
    console.error('Error adding sensor to thinkfan config:', error);
    throw error;
  }
});

ipcMain.handle('remove-thinkfan-sensor', async (_event, sensorPath: string) => {
  try {
    const { content, format } = await readThinkfanConfig();
    const parsedConfig = await parseThinkfanConfig(content);
    
    if (parsedConfig.sensors.length <= 1) {
      throw new Error('At least one sensor needs to be selected');
    }
    
    // Find the index of the sensor to remove
    const sensorIndex = parsedConfig.sensors.findIndex(
      s => (s.hwmon || s.tpacpi || s.path) === sensorPath
    );
    
    if (sensorIndex === -1) {
      throw new Error('Sensor not found in config');
    }

    // Remove the sensor
    parsedConfig.sensors.splice(sensorIndex, 1);
    
    // Update all levels to remove the temperature values for this sensor
    parsedConfig.levels = parsedConfig.levels.map(level => ({
      ...level,
      lower_limit: level.lower_limit?.filter((_, i) => i !== sensorIndex),
      upper_limit: level.upper_limit.filter((_, i) => i !== sensorIndex)
    }));

    let newConfig;
    if (format === 'yaml') {
      newConfig = [
        'sensors:',
        ...parsedConfig.sensors.map(sensor => 
          `  - hwmon: ${sensor.hwmon || sensor.tpacpi || sensor.path}`
        ),
        '',
        'fans:',
        '  - tpacpi: /proc/acpi/ibm/fan',
        '',
        'levels:',
        ...parsedConfig.levels.map(level => [
          '  - speed: ' + level.speed,
          ...(level.lower_limit?.length ? [`    lower_limit: [${level.lower_limit.join(', ')}]`] : []),
          `    upper_limit: [${level.upper_limit.join(', ')}]`
        ]).flat()
      ].join('\n');
    }
    
    if (!newConfig) {
      throw new Error('Failed to generate config');
    }

    const updatedConfig = await updateThinkfanConfig(newConfig, format);
    return updatedConfig;
  } catch (error) {
    console.error('Error removing sensor from thinkfan config:', error);
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

async function readThinkfanConfig(): Promise<{ content: string; format: 'yaml' | 'conf' }> {
  try {
    // Try reading YAML config first
    try {
      const yamlContent = await fs.readFile('/etc/thinkfan.yaml', 'utf-8');
      return { content: yamlContent, format: 'yaml' };
    } catch (yamlError) {
      // Try reading traditional config
      try {
        const confContent = await fs.readFile('/etc/thinkfan.conf', 'utf-8');
        return { content: confContent, format: 'conf' };
      } catch (confError) {
        // Create default YAML config if neither exists
        const defaultConfig = {
          sensors: [
            { hwmon: '/sys/devices/virtual/thermal/thermal_zone0/hwmon1/temp1_input' }
          ],
          fans: [
            { tpacpi: '/proc/acpi/ibm/fan' }
          ],
          levels: [
            { speed: 0, upper_limit: [60] },
            { speed: 1, lower_limit: [60], upper_limit: [70] },
            { speed: 2, lower_limit: [70], upper_limit: [80] },
            { speed: 3, lower_limit: [80], upper_limit: [90] },
            { speed: 7, lower_limit: [90], upper_limit: [32767] }
          ]
        };
        const yamlContent = stringifyYAML(defaultConfig);
        const tempFile = '/tmp/thinkfan.yaml.tmp';
        await fs.writeFile(tempFile, yamlContent, 'utf-8');
        await execAsync(`pkexec sh -c 'mkdir -p /etc && cat ${tempFile} > /etc/thinkfan.yaml'`);
        await fs.unlink(tempFile);
        return { content: yamlContent, format: 'yaml' };
      }
    }
  } catch (error) {
    console.error('Error reading thinkfan config:', error);
    throw error;
  }
}

async function updateThinkfanConfig(newConfig: string, format: 'yaml' | 'conf') {
  const tempFile = `/tmp/thinkfan.${format}`;
  const configPath = format === 'yaml' ? '/etc/thinkfan.yaml' : '/etc/thinkfan.conf';
  
  try {
    console.log('Writing config to:', tempFile);
    await fs.writeFile(tempFile, newConfig, 'utf-8');
    
    // Verify written content
    const writtenContent = await fs.readFile(tempFile, 'utf-8');
    console.log('Written content:', writtenContent);
    
    // If we get here, try with pkexec
    try {
      await execAsync(`pkexec sh -c 'cat ${tempFile} > ${configPath} && systemctl restart thinkfan'`);
      console.log('Config updated and service restarted');
    } catch (error: any) {
      console.error('Failed to update config:', error);
      throw error;
    }
    
    return await parseThinkfanConfig(newConfig);
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch (e) {
      console.error('Failed to clean up temp file:', e);
    }
  }
}

type ThermalZoneInfo = {
  path: string;
  type: string;
  temp: number;
  sensorMatch?: {
    adapter: string;
    name: string;
    value: number;
  };
};

async function getAllThermalZones(): Promise<ThermalZoneInfo[]> {
  try {
    const { stdout: thermalPaths } = await execAsync('find /sys/devices/virtual/thermal/thermal_zone* -maxdepth 0 -type d');
    const zones: ThermalZoneInfo[] = [];
    const { stdout: sensorsOutput } = await execAsync('sensors -j');
    const sensorsData = JSON.parse(sensorsOutput);

    for (const zonePath of thermalPaths.trim().split('\n')) {
      try {
        // Read additional thermal zone information
        const [type, temp] = await Promise.all([
          fs.readFile(`${zonePath}/type`, 'utf-8'),
          fs.readFile(`${zonePath}/temp`, 'utf-8')
        ]);

        const currentTemp = parseInt(temp) / 1000;

        // Try to identify the true source
        let bestMatch: ThermalZoneInfo['sensorMatch'] = undefined;
        let bestDiff = Infinity;

        for (const [adapter, data] of Object.entries(sensorsData)) {
          for (const [sensorName, values] of Object.entries(data as object)) {
            if (typeof values === 'object' && values !== null) {
              for (const [key, value] of Object.entries(values)) {
                if (key.includes('temp') || key === 'Tctl' || key === 'edge' || key === 'Composite') {
                  const sensorTemp = typeof value === 'number' ? value : (value as { input: number }).input;
                  const diff = Math.abs(sensorTemp - currentTemp);
                  
                  // Match if temperatures are very close (within 0.5°C)
                  if (diff < 0.5 && diff < bestDiff) {
                    bestDiff = diff;
                    bestMatch = {
                      adapter,
                      name: sensorName,
                      value: sensorTemp
                    };
                  }
                }
              }
            }
          }
        }

        zones.push({
          path: `${zonePath}/temp`,
          type: type.trim(),
          temp: currentTemp,
          sensorMatch: bestMatch
        });

      } catch (e) {
        console.debug(`Error reading zone ${zonePath}:`, e);
      }
    }

    // Sort zones by priority (CPU first, then GPU, etc.)
    return zones.sort((a, b) => {
      const getTypePriority = (type: string, match?: { adapter: string }) => {
        if (match?.adapter.includes('k10temp')) return 100;
        if (type.includes('cpu') || match?.adapter.includes('coretemp')) return 90;
        if (type.includes('gpu') || match?.adapter.includes('amdgpu')) return 80;
        return 0;
      };
      return getTypePriority(b.type, b.sensorMatch) - getTypePriority(a.type, a.sensorMatch);
    });

  } catch (error) {
    console.error('Error getting thermal zones:', error);
    return [];
  }
}