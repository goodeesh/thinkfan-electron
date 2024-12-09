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
      const hwmonDir = '/sys/class/hwmon';
      const dirs = await fs.readdir(hwmonDir);

      for (const dir of dirs) {
        const basePath = `${hwmonDir}/${dir}`;
        try {
          const name = await fs.readFile(`${basePath}/name`, 'utf-8');
          const files = await fs.readdir(basePath);
          
          for (const file of files) {
            if (file.endsWith('_input') && file.includes('temp')) {
              const tempPath = `${basePath}/${file}`;
              const labelFile = file.replace('_input', '_label');
              
              let sensorName = '';
              try {
                sensorName = await fs.readFile(`${basePath}/${labelFile}`, 'utf-8');
              } catch {
                sensorName = file.replace('_input', '');
              }

              const temp = parseInt(await fs.readFile(tempPath, 'utf-8')) / 1000;
              
              thermalZones.push({
                name: sensorName.trim(),
                path: tempPath,
                type: name.trim(),
                currentTemp: temp,
                sensorMatch: {
                  name: sensorName.trim(),
                  adapter: name.trim()
                }
              });
            }
          }
        } catch (error) {
          console.error(`Error processing ${dir}:`, error);
        }
      }

      // Also check ACPI thermal zones
      try {
        const thermalDir = '/sys/class/thermal';
        const zones = await fs.readdir(thermalDir);
        
        for (const zone of zones) {
          if (zone.startsWith('thermal_zone')) {
            const basePath = `${thermalDir}/${zone}`;
            try {
              const type = await fs.readFile(`${basePath}/type`, 'utf-8');
              const temp = parseInt(await fs.readFile(`${basePath}/temp`, 'utf-8')) / 1000;
              
              thermalZones.push({
                name: type.trim(),
                path: `${basePath}/temp`,
                type: type.trim(),
                currentTemp: temp,
                sensorMatch: {
                  name: type.trim(),
                  adapter: type.trim()
                }
              });
            } catch (error) {
              console.error(`Error processing thermal zone ${zone}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Error processing thermal zones:', error);
      }

      return thermalZones;
    } catch (error) {
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