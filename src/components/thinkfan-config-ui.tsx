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

interface ActiveSensor {
  path: string;
  name: string;
  currentTemp?: number;
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
  const [activeSensors, setActiveSensors] = useState<ActiveSensor[]>([]);

  const handleLevelEdit = (index: number) => {
    setEditingLevel(index);
  };

  const handleTemperatureBoundaryChange = (index: number, isHigh: boolean, sensorIndex: number, value: number) => {
    const newLevels = [...pendingChanges];
    
    // Validate input value
    if (value < 0) {
      setError('Temperature values must be positive');
      return;
    }

    if (isHigh) {
      const currentLimits = [...(newLevels[index].upper_limit || [])];
      currentLimits[sensorIndex] = value;
      
      // Check if new upper limit is less than current lower limit
      if (newLevels[index].lower_limit && value < newLevels[index].lower_limit[sensorIndex]) {
        setError('Upper limit cannot be lower than lower limit');
        return;
      }
      
      newLevels[index] = { 
        ...newLevels[index], 
        upper_limit: currentLimits
      };

      if (index < newLevels.length - 1) {
        const nextLowerLimits = [...(newLevels[index + 1].lower_limit || [])];
        nextLowerLimits[sensorIndex] = value;
        newLevels[index + 1] = { 
          ...newLevels[index + 1], 
          lower_limit: nextLowerLimits
        };
      }
    } else {
      const currentLimits = [...(newLevels[index].lower_limit || [])];
      currentLimits[sensorIndex] = value;
      
      // Check if new lower limit is higher than current upper limit
      if (value > newLevels[index].upper_limit[sensorIndex]) {
        setError('Lower limit cannot be higher than upper limit');
        return;
      }
      
      newLevels[index] = { 
        ...newLevels[index], 
        lower_limit: currentLimits
      };

      if (index > 0) {
        const prevUpperLimits = [...(newLevels[index - 1].upper_limit || [])];
        prevUpperLimits[sensorIndex] = value;
        newLevels[index - 1] = { 
          ...newLevels[index - 1], 
          upper_limit: prevUpperLimits
        };
      }
    }
    
    setError(null);
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
        const sensorWithTemp = {
          path: sensorPath,
          name: newSensor.name,
          currentTemp: temp
        };
        setActiveSensors(prev => [...prev, sensorWithTemp]);
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

  const updateSensorTemperatures = async () => {
    const updatedSensors = await Promise.all(
      activeSensors.map(async (sensor) => {
        try {
          const temp = await ipcRenderer.invoke('get-sensor-reading', sensor.path);
          return {
            ...sensor,
            currentTemp: temp
          };
        } catch (error) {
          console.error(`Error reading sensor ${sensor.path}:`, error);
          return sensor;
        }
      })
    );
    setActiveSensors(updatedSensors);
  };

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

  useEffect(() => {
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
                    {validatedSensors.map((sensor, index) => {
                      const isActive = activeSensors.some(s => s.path === sensor.path);
                      return (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-medium">{sensor.name} - {sensor.sensor}</h3>
                              <p className="text-sm text-gray-500">{sensor.adapter}</p>
                              <p className="text-xs text-gray-400">{sensor.path || 'No path available'}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-medium">{sensor.current.toFixed(1)}°C</span>
                              {isActive ? (
                                <Button
                                  variant="outline"
                                  onClick={() => sensor.path && handleSensorRemove(sensor.path)}
                                  disabled={!sensor.path}
                                  className={!sensor.path ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  Remove Sensor
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  onClick={() => sensor.path && handleSensorSelect(sensor.path)}
                                  disabled={!sensor.path}
                                  className={!sensor.path ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  {sensor.path ? 'Use This Sensor' : 'No Path Available'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                            <h3 className="font-medium">Fan {index + 1}</h3>
                            <p className="text-sm text-gray-500">
                              Path: {fan.tpacpi || fan.hwmon || fan.path || 'Unknown'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              Type: {fan.type || (fan.tpacpi ? 'TPACPI' : 'HWMON')}
                            </span>
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
                              <label className="text-sm font-medium">Fan Speed Level</label>
                              <Input
                                type="number"
                                value={pendingChanges[index].speed}
                                onChange={(e) => handleLevelChange(index, 'speed', parseInt(e.target.value))}
                              />
                            </div>
                            {activeSensors.map((sensor, sensorIndex) => (
                              <div key={sensor.path} className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <h4 className="font-medium text-sm">{sensor.name}</h4>
                                  {sensor.currentTemp && (
                                    <span className="text-xs text-gray-500">
                                      Current: {sensor.currentTemp}°C
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-500">Low Temperature (°C)</label>
                                    <Input
                                      type="number"
                                      value={pendingChanges[index].lower_limit?.[sensorIndex] ?? 0}
                                      onChange={(e) => handleTemperatureBoundaryChange(
                                        index,
                                        false,
                                        sensorIndex,
                                        parseInt(e.target.value)
                                      )}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">High Temperature (°C)</label>
                                    <Input
                                      type="number"
                                      value={pendingChanges[index].upper_limit[sensorIndex] ?? 0}
                                      onChange={(e) => handleTemperatureBoundaryChange(
                                        index,
                                        true,
                                        sensorIndex,
                                        parseInt(e.target.value)
                                      )}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={handleLevelCancel}>Cancel</Button>
                              <Button variant="outline" onClick={handleApplyChanges} className="ml-auto">
                                Apply Changes
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-medium">Level {level.speed}</h3>
                              <div className="space-y-1">
                                {activeSensors.map((sensor, sensorIndex) => (
                                  <div key={sensor.path} className="text-sm">
                                    <span className="font-medium">{sensor.name}</span>
                                    <span className="text-gray-500">
                                      : {level.lower_limit?.[sensorIndex] ?? 0}°C - {level.upper_limit[sensorIndex]}°C
                                    </span>
                                    {sensor.currentTemp && (
                                      <span className="text-xs text-gray-400 ml-2">
                                        (Current: {sensor.currentTemp}°C)
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
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
