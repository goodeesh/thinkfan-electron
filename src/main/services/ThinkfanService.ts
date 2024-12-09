import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { ThinkfanConfig, ThinkfanLevel } from '../../types/thinkfan';

const execAsync = promisify(exec);

export class ThinkfanService {
  private static instance: ThinkfanService;
  private configPath: string;

  private constructor() {
    this.configPath = '/etc/thinkfan.yaml';
  }

  public static getInstance(): ThinkfanService {
    if (!ThinkfanService.instance) {
      ThinkfanService.instance = new ThinkfanService();
    }
    return ThinkfanService.instance;
  }

  public async readConfig(): Promise<{ content: string; format: 'yaml' | 'legacy' }> {
    try {
      const yamlPath = '/etc/thinkfan.yaml';
      const legacyPath = '/etc/thinkfan.conf';
      
      try {
        const content = await fs.readFile(yamlPath, 'utf-8');
        return { content, format: 'yaml' };
      } catch {
        const content = await fs.readFile(legacyPath, 'utf-8');
        return { content, format: 'legacy' };
      }
    } catch (error) {
      console.error('Error reading thinkfan config:', error);
      throw error;
    }
  }

  public async parseConfig(content: string): Promise<ThinkfanConfig> {
    try {
      const config = parseYAML(content);
      return config;
    } catch (error) {
      console.error('Error parsing thinkfan config:', error);
      throw error;
    }
  }

  public async updateConfig(newConfig: string, format: 'yaml' | 'legacy'): Promise<ThinkfanConfig> {
    const configPath = format === 'yaml' ? '/etc/thinkfan.yaml' : '/etc/thinkfan.conf';
    const tempFile = '/tmp/thinkfan.tmp';
    
    try {
      await fs.writeFile(tempFile, newConfig, 'utf-8');
      await execAsync(`pkexec sh -c 'cat ${tempFile} > ${configPath} && systemctl restart thinkfan'`);
      await fs.unlink(tempFile);
      
      return await this.parseConfig(newConfig);
    } catch (error) {
      console.error('Error updating thinkfan config:', error);
      throw error;
    }
  }

  public async updateLevel(index: number, level: { 
    level: number; 
    speed: number;
    low: number; 
    high: number; 
  }): Promise<ThinkfanConfig> {
    const { content, format } = await this.readConfig();
    let newConfig: string;

    if (format === 'yaml') {
      const parsedConfig = await this.parseConfig(content);
      const levels = [...parsedConfig.levels];
      levels[index] = {
        speed: level.level,
        lower_limit: [level.low],
        upper_limit: [level.high]
      } as ThinkfanLevel;
      
      const configObj = {
        sensors: parsedConfig.sensors.map(sensor => ({
          hwmon: sensor.hwmon || sensor.path || sensor.tpacpi
        })),
        fans: parsedConfig.fans.map(fan => ({
          tpacpi: fan.tpacpi || fan.path
        })),
        levels
      };
      newConfig = stringifyYAML(configObj);
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

    return this.updateConfig(newConfig, format);
  }
} 