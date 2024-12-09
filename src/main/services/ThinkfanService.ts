import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { ThinkfanConfig, ThinkfanLevel } from '../../shared/types';

const execAsync = promisify(exec);

export class ThinkfanService {
  private static instance: ThinkfanService;
  private configPath: string;
  private legacyPath: string;

  private constructor() {
    this.configPath = '/etc/thinkfan.yaml';
    this.legacyPath = '/etc/thinkfan.conf';
  }

  public static getInstance(): ThinkfanService {
    if (!ThinkfanService.instance) {
      ThinkfanService.instance = new ThinkfanService();
    }
    return ThinkfanService.instance;
  }

  public async readConfig(): Promise<{ content: string; format: 'yaml' | 'legacy' }> {
    try {
      try {
        const content = await fs.readFile(this.configPath, 'utf-8');
        return { content, format: 'yaml' };
      } catch {
        const content = await fs.readFile(this.legacyPath, 'utf-8');
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

  private adjustLevelArrays(levels: ThinkfanLevel[], sensorCount: number): ThinkfanLevel[] {
    return levels.map(level => ({
      ...level,
      lower_limit: level.lower_limit?.slice(0, sensorCount) || Array(sensorCount).fill(0),
      upper_limit: level.upper_limit.slice(0, sensorCount)
    }));
  }

  public async updateConfig(newConfig: string, format: 'yaml' | 'legacy'): Promise<ThinkfanConfig> {
    const configPath = format === 'yaml' ? this.configPath : this.legacyPath;
    const tempFile = '/tmp/thinkfan.yaml';
    
    try {
      // Parse and validate the config before writing
      const parsedConfig = await this.parseConfig(newConfig);
      const sensorCount = parsedConfig.sensors.length;
      
      // Adjust level arrays to match sensor count
      parsedConfig.levels = this.adjustLevelArrays(parsedConfig.levels, sensorCount);
      
      // Convert back to YAML
      const adjustedConfig = stringifyYAML(parsedConfig);
      
      await fs.writeFile(tempFile, adjustedConfig, 'utf-8');
      await execAsync(`pkexec sh -c 'cat ${tempFile} > ${configPath} && systemctl restart thinkfan'`);
      await fs.unlink(tempFile);
      
      return parsedConfig;
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
      const sensorCount = parsedConfig.sensors.length;
      const levels = [...parsedConfig.levels];
      
      // Create arrays of the correct length
      const lowerLimit = Array(sensorCount).fill(level.low);
      const upperLimit = Array(sensorCount).fill(level.high);
      
      levels[index] = {
        speed: level.level,
        lower_limit: lowerLimit,
        upper_limit: upperLimit
      } as ThinkfanLevel;
      
      const configObj = {
        sensors: parsedConfig.sensors,
        fans: parsedConfig.fans,
        levels: this.adjustLevelArrays(levels, sensorCount)
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