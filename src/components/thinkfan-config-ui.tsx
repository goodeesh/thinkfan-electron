import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Thermometer, Fan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const electron = window.require('electron')
const { ipcRenderer } = electron
import type { ThinkfanConfig, ThinkfanLevel } from '../types/thinkfan';

interface AvailableSensor {
  adapter: string;
  name: string;
  sensor: string;
  path: string;
  current: number;
}

interface SensorReading {
  timestamp: number;
  value: number;
}

const ThinkfanConfig = () => {
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

  const handleLevelEdit = (index: number) => {
    setEditingLevel(index);
  };

  const handleTemperatureBoundaryChange = (index: number, isHigh: boolean, value: number) => {
    const newLevels = [...pendingChanges];
    
    // Validate input value
    if (value < 0) {
      setError('Temperature values must be positive');
      return;
    }

    if (isHigh) {
      // Check if new upper limit is less than current lower limit
      if (newLevels[index].lower_limit && value < newLevels[index].lower_limit[0]) {
        setError('Upper limit cannot be lower than lower limit');
        return;
      }
      
      newLevels[index] = { 
        ...newLevels[index], 
        upper_limit: [value]
      };
      if (index < newLevels.length - 1) {
        newLevels[index + 1] = { 
          ...newLevels[index + 1], 
          lower_limit: [value]
        };
      }
    } else {
      // Check if new lower limit is higher than current upper limit
      if (value > newLevels[index].upper_limit[0]) {
        setError('Lower limit cannot be higher than upper limit');
        return;
      }
      
      newLevels[index] = { 
        ...newLevels[index], 
        lower_limit: [value]
      };
      if (index > 0) {
        newLevels[index - 1] = { 
          ...newLevels[index - 1], 
          upper_limit: [value]
        };
      }
    }
    
    setError(null);  // Clear any previous errors
    setPendingChanges(newLevels);
  };

  const handleApplyChanges = async () => {
    try {
      setError(null);
      console.log('Applying changes:', pendingChanges);
      const updatedConfig = await ipcRenderer.invoke('update-thinkfan-config', pendingChanges);
      console.log('Received updated config:', updatedConfig);
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
      newLevels[index] = {
        ...newLevels[index],
        speed: value
      };
    }
    setPendingChanges(newLevels);
  };

  const handleSensorSelect = async (sensorPath: string) => {
    setSelectedSensor(sensorPath);
    try {
      setError(null);
      console.log('Selecting sensor:', sensorPath);
      const updatedConfig = await ipcRenderer.invoke('update-thinkfan-sensor', sensorPath);
      setConfigData(updatedConfig);
    } catch (error) {
      console.error('Failed to update sensor:', error);
      setError('Failed to update sensor configuration. Make sure you have the necessary permissions.');
    }
  };


  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await ipcRenderer.invoke('read-thinkfan-config');
        setConfigData(data);
        if (data.sensors && data.sensors[0]?.path) {
          setSelectedSensor(data.sensors[0].path);
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

    // Initial fetch
    fetchAndValidateSensors();

    // Refresh every 2 seconds
    const interval = setInterval(fetchAndValidateSensors, 2000);

    // Cleanup
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedSensor) return;

    const updateReading = async () => {
      try {
        const reading = await ipcRenderer.invoke('get-sensor-reading', selectedSensor);
        setSensorReadings(prev => [
          ...prev,
          { timestamp: Date.now(), value: reading }
        ].slice(-10));
      } catch (error) {
        console.error('Failed to read sensor:', error);
        // If path becomes invalid, try to find new path
        setSelectedSensor(null);
        setError('Sensor path changed or became unavailable. Please reselect the sensor.');
      }
    };

    // Initial reading
    updateReading();
    
    // Update every second
    const interval = setInterval(updateReading, 1000);
    
    return () => clearInterval(interval);
  }, [selectedSensor]);

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
              <Card>
                <CardContent className="mt-4">
                  <div className="space-y-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-medium">Available Temperature Sensors</h3>
                      <p className="text-sm text-gray-500">Select a sensor to use for fan control</p>
                    </div>
                    {selectedSensor && (
                      <div className="p-4 border rounded-lg mb-4">
                        <div className="space-y-2">
                          <h3 className="font-medium">Current Active Sensor</h3>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Path:</span>
                            <span className="font-mono text-sm">{selectedSensor}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Temperature:</span>
                            <span className="font-medium">
                              {sensorReadings.length > 0 
                                ? `${sensorReadings[sensorReadings.length - 1].value.toFixed(1)}°C`
                                : 'Loading...'}
                            </span>
                          </div>
                          <div className="h-20 mt-2">
                            {sensorReadings.length > 1 && (
                              <div className="flex items-end justify-between h-full">
                                {sensorReadings.map((reading) => {
                                  const height = `${(reading.value / 100) * 100}%`;
                                  return (
                                    <div 
                                      key={reading.timestamp}
                                      className="w-4 bg-primary/60 rounded-t"
                                      style={{ height }}
                                      title={`${reading.value.toFixed(1)}°C`}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {validatedSensors.map((sensor, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-medium">{sensor.name} - {sensor.sensor}</h3>
                            <p className="text-sm text-gray-500">{sensor.adapter}</p>
                            <p className="text-xs text-gray-400">{sensor.path || 'No path available'}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-medium">{sensor.current.toFixed(1)}°C</span>
                            <Button
                              variant="outline"
                              onClick={() => sensor.path && handleSensorSelect(sensor.path)}
                              disabled={!sensor.path}
                              className={!sensor.path ? 'opacity-50 cursor-not-allowed' : ''}
                            >
                              {sensor.path ? 'Use This Sensor' : 'No Path Available'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fans">
              <Card>
                <CardContent className="mt-4">
                  <div className="space-y-4">
                    {configData.fans.map((fan, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-medium">{fan.name}</h3>
                            <p className="text-sm text-gray-500">{fan.path}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Type: {fan.type}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="levels">
              <Card>
                <CardContent className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {configData.levels.map((level, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        {editingLevel === index ? (
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium">Level</label>
                              <Input
                                type="number"
                                value={pendingChanges[index].speed}
                                onChange={(e) => handleLevelChange(index, 'speed', parseInt(e.target.value))}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Low Temperature (°C)</label>
                              <Input
                                type="number"
                                value={pendingChanges[index].lower_limit?.[0] ?? 0}
                                onChange={(e) => handleTemperatureBoundaryChange(index, false, parseInt(e.target.value))}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">High Temperature (°C)</label>
                              <Input
                                type="number"
                                value={pendingChanges[index].upper_limit[0]}
                                onChange={(e) => handleTemperatureBoundaryChange(index, true, parseInt(e.target.value))}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={handleLevelCancel}>Cancel</Button>
                              <Button variant="outline" onClick={handleApplyChanges} className="ml-auto">Apply Changes</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-medium">Level {level.speed}</h3>
                              <p className="text-sm text-gray-500">
                                {level.lower_limit?.[0] ?? 0}°C - {level.upper_limit[0]}°C
                              </p>
                            </div>
                            <Button variant="outline" onClick={() => handleLevelEdit(index)}>
                              Edit
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ThinkfanConfig;
