import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './components/elements/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/elements/tabs';
import { Settings, Thermometer, Fan } from 'lucide-react';
import { ThinkfanConfig, ThinkfanLevel, AvailableSensor, SensorReading, ActiveSensor } from '../types/thinkfan';
import { SensorPanel } from './components/panels/SensorPanel';
import { FanPanel } from './components/panels/FanPanel';
import { LevelPanel } from './components/panels/LevelPanel';

const electron = window.require('electron');
const { ipcRenderer } = electron;

export function App() {
  // State
  const [configData, setConfigData] = useState<ThinkfanConfig>({
    sensors: [],
    fans: [],
    levels: []
  });
  const [pendingChanges, setPendingChanges] = useState<ThinkfanLevel[]>([]);
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validatedSensors, setValidatedSensors] = useState<AvailableSensor[]>([]);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [activeSensors, setActiveSensors] = useState<ActiveSensor[]>([]);

  // Handlers
  const handleLevelEdit = (index: number) => {
    setEditingLevel(index);
  };

  const handleTemperatureBoundaryChange = (index: number, isHigh: boolean, sensorIndex: number, value: number) => {
    const newLevels = [...pendingChanges];
    
    if (value < 0) {
      setError('Temperature values must be positive');
      return;
    }

    if (isHigh) {
      const currentLimits = [...(newLevels[index].upper_limit || [])];
      currentLimits[sensorIndex] = value;
      
      if (newLevels[index].lower_limit && value < newLevels[index].lower_limit[sensorIndex]) {
        setError('Upper limit cannot be lower than lower limit');
        return;
      }
      
      newLevels[index] = { ...newLevels[index], upper_limit: currentLimits };

      if (index < newLevels.length - 1) {
        const nextLowerLimits = [...(newLevels[index + 1].lower_limit || [])];
        nextLowerLimits[sensorIndex] = value;
        newLevels[index + 1] = { ...newLevels[index + 1], lower_limit: nextLowerLimits };
      }
    } else {
      const currentLimits = [...(newLevels[index].lower_limit || [])];
      currentLimits[sensorIndex] = value;
      
      if (value > newLevels[index].upper_limit[sensorIndex]) {
        setError('Lower limit cannot be higher than upper limit');
        return;
      }
      
      newLevels[index] = { ...newLevels[index], lower_limit: currentLimits };

      if (index > 0) {
        const prevUpperLimits = [...(newLevels[index - 1].upper_limit || [])];
        prevUpperLimits[sensorIndex] = value;
        newLevels[index - 1] = { ...newLevels[index - 1], upper_limit: prevUpperLimits };
      }
    }
    
    setError(null);
    setPendingChanges(newLevels);
  };

  const handleApplyChanges = async () => {
    try {
      setError(null);
      const updatedConfig = await ipcRenderer.invoke('update-thinkfan-config', pendingChanges);
      setConfigData(updatedConfig);
      setEditingLevel(null);
    } catch (error) {
      console.error('Failed to update levels:', error);
      setError('Failed to update configuration. Make sure you have the necessary permissions.');
    }
  };

  const handleLevelCancel = () => {
    setPendingChanges(configData.levels);
    setEditingLevel(null);
  };

  const handleLevelChange = (index: number, field: keyof ThinkfanLevel, value: number) => {
    const newLevels = [...pendingChanges];
    if (field === 'speed') {
      newLevels[index] = { ...newLevels[index], speed: value };
    }
    setPendingChanges(newLevels);
  };

  const handleSensorSelect = async (sensorPath: string) => {
    const isAlreadySelected = activeSensors.some(s => s.path === sensorPath);
    if (isAlreadySelected) {
      setError('This sensor is already selected');
      return;
    }

    try {
      setError(null);
      const newSensor = validatedSensors.find(s => s.path === sensorPath);
      if (newSensor) {
        const temp = await ipcRenderer.invoke('get-sensor-reading', sensorPath);
        setActiveSensors(prev => [...prev, {
          path: sensorPath,
          name: newSensor.name,
          currentTemp: temp
        }]);
      }
      const updatedConfig = await ipcRenderer.invoke('add-thinkfan-sensor', sensorPath);
      setConfigData(updatedConfig);
    } catch (error) {
      console.error('Failed to update sensor:', error);
      setError('Failed to update sensor configuration. Make sure you have the necessary permissions.');
    }
  };

  const handleSensorRemove = async (sensorPath: string) => {
    try {
      setError(null);
      if (activeSensors.length <= 1) {
        setError('At least one sensor needs to be selected');
        return;
      }
      const updatedConfig = await ipcRenderer.invoke('remove-thinkfan-sensor', sensorPath);
      setConfigData(updatedConfig);
      setActiveSensors(prev => prev.filter(s => s.path !== sensorPath));
    } catch (error) {
      console.error('Failed to remove sensor:', error);
      setError('Failed to remove sensor from configuration. Make sure you have the necessary permissions.');
    }
  };

  // Effects
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await ipcRenderer.invoke('read-thinkfan-config');
        setConfigData(data);
        if (data.sensors && data.sensors[0]?.path) {
          setSelectedSensor(data.sensors[0].path);
        }
        if (data.sensors) {
          const sensors = data.sensors.map((sensor: any) => ({
            path: sensor.hwmon || sensor.tpacpi,
            name: sensor.name || 'Temperature Sensor'
          }));
          setActiveSensors(sensors);
        }
      } catch (error) {
        console.error('Failed to fetch thinkfan config:', error);
        setError('Failed to fetch thinkfan config');
      }
    };

    fetchConfig();
  }, []);

  useEffect(() => {
    setPendingChanges(configData.levels);
  }, [configData]);

  useEffect(() => {
    const fetchAndValidateSensors = async () => {
      try {
        const sensors = await ipcRenderer.invoke('get-available-sensors');
        setValidatedSensors(sensors);
      } catch (error) {
        console.error('Failed to fetch sensors:', error);
        setError('Failed to fetch available sensors');
      }
    };

    fetchAndValidateSensors();
    const interval = setInterval(fetchAndValidateSensors, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedSensor) return;

    const updateReading = async () => {
      try {
        const reading = await ipcRenderer.invoke('get-sensor-reading', selectedSensor);
        setSensorReadings(prev => [...prev, { timestamp: Date.now(), value: reading }].slice(-10));
      } catch (error) {
        console.error('Failed to read sensor:', error);
        setSelectedSensor(null);
        setError('Sensor path changed or became unavailable. Please reselect the sensor.');
      }
    };

    updateReading();
    const interval = setInterval(updateReading, 1000);
    return () => clearInterval(interval);
  }, [selectedSensor]);

  useEffect(() => {
    const updateSensorTemperatures = async () => {
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
      setActiveSensors(updatedSensors);
    };

    updateSensorTemperatures();
    const interval = setInterval(updateSensorTemperatures, 2000);
    return () => clearInterval(interval);
  }, [activeSensors.length]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      {error && (
        <div className="mb-4 p-4 border border-red-500 bg-red-50 text-red-700 rounded-md">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-6 h-6" />
            ThinkFan Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sensors" className="w-full">
            <TabsList className="w-full justify-start border-b">
              <TabsTrigger 
                value="sensors" 
                className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:border-b-[3px] data-[state=active]:border-primary data-[state=active]:font-bold"
              >
                <Thermometer className="w-4 h-4" />
                Sensors
              </TabsTrigger>
              <TabsTrigger 
                value="fans" 
                className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:border-b-[3px] data-[state=active]:border-primary data-[state=active]:font-bold"
              >
                <Fan className="w-4 h-4" />
                Fans
              </TabsTrigger>
              <TabsTrigger 
                value="levels" 
                className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:border-b-[3px] data-[state=active]:border-primary data-[state=active]:font-bold"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 20h18M3 12h18M3 4h18" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Levels
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sensors">
              <SensorPanel
                selectedSensor={selectedSensor}
                sensorReadings={sensorReadings}
                validatedSensors={validatedSensors}
                activeSensors={activeSensors}
                onSensorSelect={handleSensorSelect}
                onSensorRemove={handleSensorRemove}
              />
            </TabsContent>

            <TabsContent value="fans">
              <FanPanel fans={configData.fans} />
            </TabsContent>

            <TabsContent value="levels">
              <LevelPanel
                levels={configData.levels}
                pendingChanges={pendingChanges}
                editingLevel={editingLevel}
                activeSensors={activeSensors}
                onLevelEdit={handleLevelEdit}
                onLevelChange={handleLevelChange}
                onTemperatureBoundaryChange={handleTemperatureBoundaryChange}
                onLevelCancel={handleLevelCancel}
                onApplyChanges={handleApplyChanges}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
} 