import { create } from 'zustand';
import { AvailableSensor, SensorReading, ActiveSensor, ThinkfanConfig } from '../../shared/types';
import { useConfigStore } from './configStore';

const electron = window.require('electron');
const { ipcRenderer } = electron;

interface SensorState {
  validatedSensors: AvailableSensor[];
  activeSensors: ActiveSensor[];
  selectedSensor: string | null;
  sensorReadings: SensorReading[];
  setValidatedSensors: (sensors: AvailableSensor[]) => void;
  setActiveSensors: (sensors: ActiveSensor[]) => void;
  setSelectedSensor: (path: string | null) => void;
  setSensorReadings: (readings: SensorReading[]) => void;
  addSensor: (sensorPath: string) => Promise<void>;
  removeSensor: (sensorPath: string) => Promise<void>;
  fetchSensors: () => Promise<void>;
  updateSensorReadings: () => Promise<void>;
  initializeFromConfig: (config: ThinkfanConfig) => void;
}

export const useSensorStore = create<SensorState>((set, get) => ({
  validatedSensors: [],
  activeSensors: [],
  selectedSensor: null,
  sensorReadings: [],

  setValidatedSensors: (sensors) => set({ validatedSensors: sensors }),
  setActiveSensors: (sensors) => set({ activeSensors: sensors }),
  setSelectedSensor: (path) => set({ selectedSensor: path }),
  setSensorReadings: (readings) => set({ sensorReadings: readings }),

  initializeFromConfig: (config) => {
    if (config.sensors) {
      const activeSensors = config.sensors.map(sensor => ({
        path: sensor.hwmon || sensor.tpacpi || sensor.path || '',
        name: sensor.name || 'Temperature Sensor'
      }));
      set(state => ({
        activeSensors,
        selectedSensor: state.selectedSensor || (activeSensors[0]?.path ?? null)
      }));
    }
  },

  addSensor: async (sensorPath) => {
    try {
      const { activeSensors } = get();
      if (activeSensors.some(s => s.path === sensorPath)) {
        useConfigStore.getState().setError('This sensor is already selected');
        return;
      }

      const updatedConfig = await ipcRenderer.invoke('add-thinkfan-sensor', sensorPath);
      const temp = await ipcRenderer.invoke('get-sensor-reading', sensorPath);
      const newSensor = get().validatedSensors.find(s => s.path === sensorPath);

      if (newSensor) {
        set(state => ({
          activeSensors: [...state.activeSensors, {
            path: sensorPath,
            name: newSensor.name,
            currentTemp: temp
          }]
        }));
      }

      useConfigStore.getState().setConfigData(updatedConfig);
      useConfigStore.getState().setError(null);
    } catch (error) {
      useConfigStore.getState().setError('Failed to add sensor');
      console.error('Failed to add sensor:', error);
    }
  },

  removeSensor: async (sensorPath) => {
    try {
      const { activeSensors } = get();
      if (activeSensors.length <= 1) {
        useConfigStore.getState().setError('At least one sensor needs to be selected');
        return;
      }

      const updatedConfig = await ipcRenderer.invoke('remove-thinkfan-sensor', sensorPath);
      set(state => ({
        activeSensors: state.activeSensors.filter(s => s.path !== sensorPath)
      }));

      useConfigStore.getState().setConfigData(updatedConfig);
      useConfigStore.getState().setError(null);
    } catch (error) {
      useConfigStore.getState().setError('Failed to remove sensor');
      console.error('Failed to remove sensor:', error);
    }
  },

  fetchSensors: async () => {
    try {
      const sensors = await ipcRenderer.invoke('get-available-sensors');
      set({ validatedSensors: sensors });
      useConfigStore.getState().setError(null);
    } catch (error) {
      useConfigStore.getState().setError('Failed to fetch available sensors');
      console.error('Failed to fetch sensors:', error);
    }
  },

  updateSensorReadings: async () => {
    const { selectedSensor, activeSensors } = get();
    
    if (selectedSensor) {
      try {
        const reading = await ipcRenderer.invoke('get-sensor-reading', selectedSensor);
        set(state => ({
          sensorReadings: [...state.sensorReadings, { 
            timestamp: Date.now(), 
            value: reading 
          }].slice(-10)
        }));
      } catch (error) {
        console.error('Failed to read sensor:', error);
        set({ selectedSensor: null });
        useConfigStore.getState().setError('Sensor path changed or became unavailable');
      }
    }

    // Update all active sensor temperatures
    try {
      const updatedSensors = await Promise.all(
        activeSensors.map(async (sensor) => {
          try {
            const temp = await ipcRenderer.invoke('get-sensor-reading', sensor.path);
            return { ...sensor, currentTemp: temp };
          } catch (error) {
            console.error(`Error reading sensor ${sensor.path}:`, error);
            return sensor;
          }
        })
      );
      set({ activeSensors: updatedSensors });
    } catch (error) {
      console.error('Failed to update sensor temperatures:', error);
    }
  }
})); 