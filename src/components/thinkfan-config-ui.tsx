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
          <Tabs defaultValue="sensors">
            <TabsList>
              <TabsTrigger value="sensors" className="flex items-center gap-2">
                <Thermometer className="w-4 h-4" />
                Sensors
              </TabsTrigger>
              <TabsTrigger value="fans" className="flex items-center gap-2">
                <Fan className="w-4 h-4" />
                Fans
              </TabsTrigger>
              <TabsTrigger value="levels">Levels</TabsTrigger>
            </TabsList>

            <TabsContent value="sensors">
              <Card>
                <CardContent className="mt-4">
                  <div className="space-y-4">
                    {configData.sensors.map((sensor, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-medium">{sensor.name}</h3>
                            <p className="text-sm text-gray-500">{sensor.path}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Type: {sensor.type}</span>
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
