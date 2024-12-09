import React from 'react';
import { Card, CardContent } from '../elements/card';
import { Button } from '../elements/button';

interface AvailableSensor {
  adapter: string;
  name: string;
  sensor: string;
  path: string;
  current: number;
}

interface ActiveSensor {
  path: string;
  name: string;
  currentTemp?: number;
}

interface SensorPanelProps {
  selectedSensor: string | null;
  sensorReadings: Array<{ timestamp: number; value: number }>;
  validatedSensors: AvailableSensor[];
  activeSensors: ActiveSensor[];
  onSensorSelect: (path: string) => void;
  onSensorRemove: (path: string) => void;
}

export function SensorPanel({
  selectedSensor,
  sensorReadings,
  validatedSensors,
  activeSensors,
  onSensorSelect,
  onSensorRemove
}: SensorPanelProps) {
  return (
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
                        onClick={() => sensor.path && onSensorRemove(sensor.path)}
                        disabled={!sensor.path}
                        className={!sensor.path ? 'opacity-50 cursor-not-allowed' : ''}
                      >
                        Remove Sensor
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => sensor.path && onSensorSelect(sensor.path)}
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
  );
} 