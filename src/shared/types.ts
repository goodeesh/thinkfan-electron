export interface ThinkfanSensor {
  hwmon?: string;
  tpacpi?: string;
  path?: string;
  name?: string;
}

export interface ThinkfanFan {
  tpacpi?: string;
  hwmon?: string;
  path?: string;
  type?: string;
}

export interface ThinkfanLevel {
  speed: number;
  lower_limit?: number[];
  upper_limit: number[];
}

export interface ThinkfanConfig {
  sensors: ThinkfanSensor[];
  fans: ThinkfanFan[];
  levels: ThinkfanLevel[];
  format?: 'yaml' | 'legacy';
}

export interface AvailableSensor {
  adapter: string;
  name: string;
  sensor: string;
  path: string;
  current: number;
  type?: string;
}

export interface SensorReading {
  timestamp: number;
  value: number;
}

export interface ActiveSensor {
  path: string;
  name: string;
  currentTemp?: number;
  sensorMatch?: {
    name: string;
    adapter: string;
  };
  type?: string;
} 