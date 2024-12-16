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

  ipcMain.handle('add-thinkfan-sensor', async (_event, sensorPath: string) => {
    try {
      const thinkfanService = ThinkfanService.getInstance();
      const { content, format } = await thinkfanService.readConfig();
      const parsedConfig = await thinkfanService.parseConfig(content);
      
      // Validate if sensor already exists
      if (parsedConfig.sensors.some(sensor => 
        sensor.hwmon === sensorPath || 
        sensor.tpacpi === sensorPath || 
        sensor.path === sensorPath
      )) {
        throw new Error('Sensor already exists in configuration');
      }

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
          ...parsedConfig.fans.map(fan => 
            `  - ${fan.type || 'tpacpi'}: ${fan.path || '/proc/acpi/ibm/fan'}`
          ),
          '',
          'levels:',
          ...parsedConfig.levels.map(level => [
            '  - speed: ' + level.speed,
            ...(level.lower_limit ? [`    lower_limit: [${level.lower_limit.join(', ')}]`] : []),
            `    upper_limit: [${level.upper_limit.join(', ')}]`
          ]).flat()
        ].join('\n');
      } else {
        // Handle legacy format
        const lines = content.split('\n');
        const sensorLines = lines.filter(line => 
          line.trim().startsWith('hwmon') || 
          line.trim().startsWith('tp_thermal') ||
          line.trim().startsWith('chip')
        );
        
        newConfig = [
          ...sensorLines,
          `hwmon ${sensorPath}`,
          ...lines.filter(line => !sensorLines.includes(line))
        ].join('\n');
      }
      
      // Update the config file and return the updated configuration
      return await thinkfanService.updateConfig(newConfig, format);
    } catch (error) {
      console.error('Error adding sensor to thinkfan config:', error);
      throw error;
    }
  });

  ipcMain.handle('remove-thinkfan-sensor', async (_event, sensorPath: string) => {
    try {
      const thinkfanService = ThinkfanService.getInstance();
      const { content, format } = await thinkfanService.readConfig();
      const parsedConfig = await thinkfanService.parseConfig(content);
      
      // Validate if sensor exists and is not the last one
      if (parsedConfig.sensors.length <= 1) {
        throw new Error('Cannot remove the last sensor');
      }

      const sensorIndex = parsedConfig.sensors.findIndex(sensor => 
        sensor.hwmon === sensorPath || 
        sensor.tpacpi === sensorPath || 
        sensor.path === sensorPath
      );

      if (sensorIndex === -1) {
        throw new Error('Sensor not found in configuration');
      }

      // Remove sensor from config
      parsedConfig.sensors.splice(sensorIndex, 1);
      
      // Update all levels to remove temperature values for the removed sensor
      parsedConfig.levels = parsedConfig.levels.map(level => ({
        ...level,
        lower_limit: level.lower_limit ? 
          level.lower_limit.filter((_, index) => index !== sensorIndex) : 
          undefined,
        upper_limit: level.upper_limit.filter((_, index) => index !== sensorIndex)
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
          ...parsedConfig.fans.map(fan => 
            `  - ${fan.type || 'tpacpi'}: ${fan.path || '/proc/acpi/ibm/fan'}`
          ),
          '',
          'levels:',
          ...parsedConfig.levels.map(level => [
            '  - speed: ' + level.speed,
            ...(level.lower_limit ? [`    lower_limit: [${level.lower_limit.join(', ')}]`] : []),
            `    upper_limit: [${level.upper_limit.join(', ')}]`
          ]).flat()
        ].join('\n');
      } else {
        // Handle legacy format
        const lines = content.split('\n');
        const sensorLines = lines.filter(line => 
          line.trim().startsWith('hwmon') || 
          line.trim().startsWith('tp_thermal') ||
          line.trim().startsWith('chip')
        );
        
        newConfig = [
          ...sensorLines.filter(line => !line.includes(sensorPath)),
          ...lines.filter(line => !sensorLines.includes(line))
        ].join('\n');
      }
      
      // Update the config file and return the updated configuration
      return await thinkfanService.updateConfig(newConfig, format);
    } catch (error) {
      console.error('Error removing sensor from thinkfan config:', error);
      throw error;
    }
  });

  
} 