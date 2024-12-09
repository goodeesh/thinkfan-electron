import { ipcMain } from 'electron';
import { ThinkfanService } from '../../services/ThinkfanService';
import { ThinkfanLevel, ThinkfanSensor, ThinkfanFan } from '../../../shared/types';

export function setupConfigHandlers() {
  const thinkfanService = ThinkfanService.getInstance();

  ipcMain.handle('read-thinkfan-config', async () => {
    try {
      const { content, format } = await thinkfanService.readConfig();
      const parsedConfig = await thinkfanService.parseConfig(content);
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
      return await thinkfanService.updateLevel(index, level);
    } catch (error) {
      console.error('Error updating thinkfan level:', error);
      throw error;
    }
  });

  ipcMain.handle('update-thinkfan-config', async (_event, levels: ThinkfanLevel[]) => {
    try {
      const { content, format } = await thinkfanService.readConfig();
      const parsedConfig = await thinkfanService.parseConfig(content);
      
      const newConfig = [
        'sensors:',
        ...parsedConfig.sensors.map((sensor: ThinkfanSensor) => {
          const sensorConfig = [];
          if (sensor.hwmon) sensorConfig.push(`hwmon: ${sensor.hwmon}`);
          if (sensor.tpacpi) sensorConfig.push(`tpacpi: ${sensor.tpacpi}`);
          if (sensor.name) sensorConfig.push(`name: ${sensor.name}`);
          return `  - ${sensorConfig.join('\n    ')}`;
        }),
        '',
        'fans:',
        ...parsedConfig.fans.map((fan: ThinkfanFan) => {
          const fanConfig = [];
          if (fan.tpacpi) fanConfig.push(`tpacpi: ${fan.tpacpi}`);
          if (fan.hwmon) fanConfig.push(`hwmon: ${fan.hwmon}`);
          if (fan.type) fanConfig.push(`type: ${fan.type}`);
          return `  - ${fanConfig.join('\n    ')}`;
        }),
        '',
        'levels:',
        ...levels.map(level => [
          '  - speed: ' + level.speed,
          ...(level.lower_limit ? [`    lower_limit: [${level.lower_limit.join(', ')}]`] : []),
          `    upper_limit: [${level.upper_limit.join(', ')}]`
        ]).flat()
      ].join('\n');

      return await thinkfanService.updateConfig(newConfig, format);
    } catch (error) {
      console.error('Error updating thinkfan config:', error);
      throw error;
    }
  });
} 