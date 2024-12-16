import * as fs from 'fs/promises';
import { ActiveSensor } from '../../types/thinkfan';

export class SensorService {
  private static instance: SensorService;

  private constructor() {}

  public static getInstance(): SensorService {
    if (!SensorService.instance) {
      SensorService.instance = new SensorService();
    }
    return SensorService.instance;
  }

  public async getAllThermalZones(): Promise<ActiveSensor[]> {
    try {
      const thermalZones: ActiveSensor[] = [];
      // Also check ACPI thermal zones
      try {
        const thermalDir = '/sys/class/thermal';
        const zones = await fs.readdir(thermalDir);
        
        for (const zone of zones) {
          if (zone.startsWith('thermal_zone')) {
            try {
              const dirs = await fs.readdir(`${thermalDir}/${zone}`);
              for (const dir of dirs) {
                const typePath = `${thermalDir}/${zone}/type`;
                if (dir.startsWith('hwmon')) {
                  try {
                    const basePath = `${thermalDir}/${zone}/${dir}`;
                    const files = await fs.readdir(basePath);
                    const type = (await fs.readFile(typePath, 'utf-8')).trim();
                    if (!type) {
                      console.warn(files)
                      console.warn(typePath)
                      console.warn(`Empty type value in ${typePath}`);
                      continue;
                    }
        
                    for (const file of files) {
                      if (file.endsWith('_input')) {
                        try {
                          const tempContent = await fs.readFile(`${basePath}/${file}`, 'utf-8');
                          const tempValue = parseInt(tempContent.trim());
                          
                          // Validate temperature value
                          if (isNaN(tempValue)) {
                            console.warn(`Invalid temperature value in ${basePath}/${file}`);
                            continue;
                          }
        
                          const temp = tempValue / 1000;
                          
                          // Additional temperature sanity check (typically between -50°C and 150°C)
                          if (temp < -50 || temp > 150) {
                            console.warn(`Suspicious temperature value: ${temp}°C in ${basePath}/${file}`);
                            continue;
                          }
        
                          thermalZones.push({
                            name: type,
                            path: `${basePath}/${file}`,
                            type: type,
                            currentTemp: temp,
                            sensorMatch: {
                              name: type,
                              adapter: type
                            }
                          });
                        } catch (error) {
                          console.error(`Error reading temperature from ${basePath}/${file}:`, error);
                        }
                      }
                    }
                  } catch (error) {
                    console.error(`Error processing hwmon directory ${dir}:`, error);
                  }
                }
              }
            } catch (error) {
              console.error('Error getting thermal zones:', error);
              throw error;
            }
          }
        }
      } catch (error) {
        console.error('Error getting thermal zones:', error);
        throw error;
      }
      return thermalZones;
    }
    catch (error) {
      console.error('Error getting thermal zones:', error);
      throw error;
    }
  }

  public async getSensorReading(sensorPath: string): Promise<number> {
    try {
      const content = await fs.readFile(sensorPath, 'utf-8');
      return parseInt(content.trim()) / 1000; // Convert from millidegrees to degrees
    } catch (error) {
      console.error('Error reading sensor:', error);
      throw error;
    }
  }
}