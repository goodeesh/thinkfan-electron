import { ipcMain } from 'electron';
import { SensorService } from '../../services/SensorService';
import { ThinkfanService } from '../../services/ThinkfanService';
import { ThinkfanFan, ThinkfanLevel } from '../../../types/thinkfan';

export function setupSensorHandlers() {
  const sensorService = SensorService.getInstance();
  const thinkfanService = ThinkfanService.getInstance();

  ipcMain.handle('get-available-sensors', async () => {
    const zones = await sensorService.getAllThermalZones();
    return zones.map(zone => ({
      adapter: zone.sensorMatch?.adapter || zone.type,
      name: zone.sensorMatch ? `${zone.sensorMatch.name} (${zone.type})` : zone.type,
      sensor: 'temp',
      path: zone.path,
      current: zone.currentTemp,
      type: zone.type
    }));
  });

  ipcMain.handle('get-sensor-reading', async (_event, sensorPath: string) => {
    return await sensorService.getSensorReading(sensorPath);
  });

  ipcMain.handle('update-thinkfan-sensor', async (_event, sensorPath: string) => {
    try {
      const { content, format } = await thinkfanService.readConfig();
      const parsedConfig = await thinkfanService.parseConfig(content);
      
      const newConfig = format === 'yaml' ? 
        [
          'sensors:',
          `  - hwmon: ${sensorPath}`,
          '',
          'fans:',
          ...parsedConfig.fans.map((fan: ThinkfanFan) => 
            `  - ${fan.type || 'tpacpi'}: ${fan.path || '/proc/acpi/ibm/fan'}`
          ),
          '',
          'levels:',
          ...parsedConfig.levels.map((level: ThinkfanLevel) => [
            '  - speed: ' + level.speed,
            ...(level.lower_limit ? [`    lower_limit: [${level.lower_limit.join(', ')}]`] : []),
            `    upper_limit: [${level.upper_limit.join(', ')}]`
          ]).flat()
        ].join('\n') :
        content.split('\n')
          .map(line => line.trim().startsWith('hwmon') ? `hwmon ${sensorPath}` : line)
          .join('\n');

      return await thinkfanService.updateConfig(newConfig, format);
    } catch (error) {
      console.error('Error updating thinkfan sensor:', error);
      throw error;
    }
  });
} 