import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Thermometer, Fan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const electron = window.require('electron')
const { ipcRenderer } = electron

interface Sensor {
  type: string;
  path: string;
  name: string;
}

interface Fan {
  type: string;
  path: string;
  name: string;
}

interface Level {
  level: number;
  low: number;
  high: number;
}

interface AvailableSensor {
  adapter: string;
  name: string;
  sensor: string;
  path: string;
  current: number;
}

const ThinkfanConfig = () => {
  const [configData, setConfigData] = useState<{
    sensors: Sensor[];
    fans: Fan[];
    levels: Level[];
  }>({
    sensors: [],
    fans: [],
    levels: []
  });

  const [pendingChanges, setPendingChanges] = useState<Level[]>([]);
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableSensors, setAvailableSensors] = useState<AvailableSensor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [validatedSensors, setValidatedSensors] = useState<AvailableSensor[]>([]);

  const handleLevelEdit = (index: number) => {
    setEditingLevel(index);
  };

  const handleTemperatureBoundaryChange = (index: number, isHigh: boolean, value: number) => {
    const newLevels = [...pendingChanges];
    if (isHigh) {
      newLevels[index] = { ...newLevels[index], high: value };
      if (index < newLevels.length - 1) {
        newLevels[index + 1] = { ...newLevels[index + 1], low: value };
      }
    } else {
      newLevels[index] = { ...newLevels[index], low: value };
      if (index > 0) {
        newLevels[index - 1] = { ...newLevels[index - 1], high: value };
      }
    }
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

  const handleLevelChange = (index: number, field: keyof Level, value: number) => {
    const newLevels = [...pendingChanges];
    newLevels[index] = {
      ...newLevels[index],
      [field]: value
    };
    setPendingChanges(newLevels);
  };

  const handleSensorSelect = async (sensorPath: string) => {
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

  const validateSensor = async (sensor: AvailableSensor): Promise<boolean> => {
    try {
      const readings: number[] = [];
      for (let i = 0; i < 3; i++) {
        const newReading = await ipcRenderer.invoke('get-sensor-reading', sensor.path);
        readings.push(newReading);
        await new Promise(resolve => setTimeout(resolve, 700)); // Wait 700ms between readings
      }

      // Check if all readings are the same (stuck sensor)
      if (readings.every(r => r === readings[0])) {
        return false;
      }

      // Check if readings are within valid range (0-110°C)
      return readings.every(r => r > 0 && r <= 110);
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await ipcRenderer.invoke('read-thinkfan-config');
        setConfigData(data);
      } catch (error) {
        console.error('Failed to fetch thinkfan config:', error);
        // Add error handling here (e.g., show error message to user)
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
                                value={pendingChanges[index].level}
                                onChange={(e) => handleLevelChange(index, 'level', parseInt(e.target.value))}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Low Temperature (°C)</label>
                              <Input
                                type="number"
                                value={pendingChanges[index].low}
                                onChange={(e) => handleTemperatureBoundaryChange(index, false, parseInt(e.target.value))}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">High Temperature (°C)</label>
                              <Input
                                type="number"
                                value={pendingChanges[index].high}
                                onChange={(e) => handleTemperatureBoundaryChange(index, true, parseInt(e.target.value))}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={handleLevelCancel}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-medium">Level {level.level}</h3>
                              <p className="text-sm text-gray-500">
                                {level.low}°C - {level.high}°C
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
                  {pendingChanges.length > 0 && (
                    <div className="mt-4 flex justify-end">
                      <Button onClick={handleApplyChanges}>Apply Changes</Button>
                    </div>
                  )}
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
