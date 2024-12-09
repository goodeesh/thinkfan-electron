import { create } from 'zustand';
import { ThinkfanConfig, ThinkfanLevel } from '../../shared/types';
import { useSensorStore } from './';

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

  setConfigData: (config) => {
    set({ configData: config });
    useSensorStore.getState().initializeFromConfig(config);
  },
  setPendingChanges: (changes) => set({ pendingChanges: changes }),
  setEditingLevel: (index) => set({ editingLevel: index }),
  setError: (error) => set({ error }),

  fetchConfig: async () => {
    try {
      const data = await ipcRenderer.invoke('read-thinkfan-config');
      set({ configData: data, pendingChanges: data.levels, error: null });
      useSensorStore.getState().initializeFromConfig(data);
    } catch (error) {
      set({ error: 'Failed to fetch thinkfan config' });
      console.error('Failed to fetch thinkfan config:', error);
    }
  },

  updateConfig: async (changes) => {
    try {
      const updatedConfig = await ipcRenderer.invoke('update-thinkfan-config', changes);
      set({ 
        configData: updatedConfig, 
        pendingChanges: updatedConfig.levels,
        editingLevel: null,
        error: null 
      });
      useSensorStore.getState().initializeFromConfig(updatedConfig);
    } catch (error) {
      set({ error: 'Failed to update configuration' });
      console.error('Failed to update levels:', error);
    }
  }
})); 