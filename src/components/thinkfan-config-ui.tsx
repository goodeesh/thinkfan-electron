import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Thermometer, Fan } from 'lucide-react';

const ThinkfanConfig = () => {
  const [configData, setConfigData] = useState({
    sensors: [
      { type: 'hwmon', path: '/sys/class/hwmon/hwmon0/temp1_input', name: 'CPU' },
      { type: 'hwmon', path: '/sys/class/hwmon/hwmon1/temp1_input', name: 'GPU' }
    ],
    fans: [
      { type: 'hwmon', path: '/sys/class/hwmon/hwmon2/fan1_input', name: 'CPU Fan' }
    ],
    levels: [
      { level: 0, low: 0, high: 55 },
      { level: 1, low: 48, high: 65 },
      { level: 2, low: 55, high: 75 },
      { level: 3, low: 65, high: 85 },
      { level: 4, low: 75, high: 95 },
      { level: 7, low: 85, high: 255 }
    ]
  });

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
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
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium">Level {level.level}</h3>
                          <div className="text-sm">
                            <span>{level.low}°C - {level.high}°C</span>
                          </div>
                        </div>
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
