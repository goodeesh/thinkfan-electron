import { create } from 'zustand';
import { ThinkfanConfig, ThinkfanLevel } from '../../shared/types';
import { useSensorStore } from './sensorStore';

const electron = window.require('electron');
const { ipcRenderer } = electron;

interface ConfigState {
  configData: ThinkfanConfig;
  pendingChanges: ThinkfanLevel[];
  editingLevel: number | null;
  error: string | null;
  setConfigData: (config: ThinkfanConfig) => void;
  setPendingChanges: (changes: ThinkfanLevel[]) => void;
  setEditingLevel: (index: number | null) => void;
  setError: (error: string | null) => void;
  fetchConfig: () => Promise<void>;
  updateConfig: (changes: ThinkfanLevel[]) => Promise<void>;
  resetState: (config: ThinkfanConfig) => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  configData: {
    sensors: [],
    fans: [],
    levels: []
  },
  pendingChanges: [],
  editingLevel: null,
  error: null,

  resetState: (config) => {
    set({
      configData: config,
      pendingChanges: config.levels,
      editingLevel: null,
      error: null
    });
    useSensorStore.getState().initializeFromConfig(config);
  },

  setConfigData: (config) => {
    get().resetState(config);
  },

  setPendingChanges: (changes) => set({ pendingChanges: changes }),
  setEditingLevel: (index) => set({ editingLevel: index }),
  setError: (error) => set({ error }),

  fetchConfig: async () => {
    try {
      const data = await ipcRenderer.invoke('read-thinkfan-config');
      get().resetState(data);
    } catch (error) {
      set({ error: 'Failed to fetch thinkfan config' });
      console.error('Failed to fetch thinkfan config:', error);
    }
  },

  updateConfig: async (changes) => {
    try {
      const updatedConfig = await ipcRenderer.invoke('update-thinkfan-config', changes);
      get().resetState(updatedConfig);
    } catch (error) {
      set({ error: 'Failed to update configuration' });
      console.error('Failed to update levels:', error);
    }
  }
})); 