import { Card, CardContent } from '../elements/card';
import { Button } from '../elements/button';
import { AvailableSensor, ActiveSensor, SensorReading } from '../../../shared/types';

interface SensorPanelProps {
  selectedSensor: string | null;
  sensorReadings: SensorReading[];
  validatedSensors: AvailableSensor[];
  activeSensors: ActiveSensor[];
  onSensorSelect: (path: string) => void;
  onSensorRemove: (path: string) => void;
}

export function SensorPanel({
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
            <p className="text-sm text-gray-500">Select sensors to use for fan control</p>
          </div>
          
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