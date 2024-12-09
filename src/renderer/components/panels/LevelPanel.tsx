import { Card, CardContent } from '../elements/card';
import { Button } from '../elements/button';
import { Input } from '../elements/input';
import { ThinkfanLevel } from '../../../shared/types';
import { useConfigStore } from '../../store';

interface ActiveSensor {
  path: string;
  name: string;
  currentTemp?: number;
}

interface LevelPanelProps {
  levels: ThinkfanLevel[];
  pendingChanges: ThinkfanLevel[];
  editingLevel: number | null;
  activeSensors: ActiveSensor[];
  onLevelEdit: (index: number | null) => void;
  onApplyChanges: () => void;
}

export function LevelPanel({
  levels,
  pendingChanges,
  editingLevel,
  activeSensors,
  onLevelEdit,
  onApplyChanges
}: LevelPanelProps) {
  const { setError, setPendingChanges } = useConfigStore();

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

  const handleLevelChange = (index: number, field: keyof ThinkfanLevel, value: number) => {
    const newLevels = [...pendingChanges];
    if (field === 'speed') {
      newLevels[index] = { ...newLevels[index], speed: value };
    }
    setPendingChanges(newLevels);
  };

  const handleLevelCancel = () => {
    setPendingChanges(levels);
    onLevelEdit(null);
  };

  return (
    <Card>
      <CardContent className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {levels.map((level, index) => (
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
                    <Button variant="outline" onClick={onApplyChanges} className="ml-auto">
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
                  <Button variant="outline" onClick={() => onLevelEdit(index)}>
                    Edit
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 