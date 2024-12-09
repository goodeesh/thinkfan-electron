interface ThinkfanLevel {
  speed: number;
  lower_limit?: number[];
  upper_limit: number[];
}

export interface ThinkfanConfig {
  sensors: {
    hwmon?: string;
    tpacpi?: string;
    path?: string;
    name?: string;
  }[];
  fans: {
    tpacpi?: string;
    hwmon?: string;
    name?: string;
    path?: string;
    type?: string;
  }[];
  levels: ThinkfanLevel[];
}

export type { ThinkfanLevel }; 