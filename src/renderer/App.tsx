import { useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './components/elements/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/elements/tabs';
import { Settings, Thermometer, Fan } from 'lucide-react';
import { SensorPanel } from './components/panels/SensorPanel';
import { FanPanel } from './components/panels/FanPanel';
import { LevelPanel } from './components/panels/LevelPanel';
import { useConfigStore, useSensorStore } from './store';

export function App() {
  const { 
    configData,
    pendingChanges,
    editingLevel,
    error,
    setEditingLevel,
    fetchConfig,
    updateConfig
  } = useConfigStore();

  const {
    validatedSensors,
    activeSensors,
    selectedSensor,
    sensorReadings,
    addSensor,
    removeSensor,
    fetchSensors,
    updateSensorReadings
  } = useSensorStore();

  // Initial data fetch
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Fetch and update sensors
  useEffect(() => {
    fetchSensors();
    const interval = setInterval(fetchSensors, 2000);
    return () => clearInterval(interval);
  }, [fetchSensors]);

  // Update sensor readings
  useEffect(() => {
    if (!selectedSensor) return;
    
    updateSensorReadings();
    const interval = setInterval(updateSensorReadings, 1000);
    return () => clearInterval(interval);
  }, [selectedSensor, updateSensorReadings]);

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
                onSensorSelect={addSensor}
                onSensorRemove={removeSensor}
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
                onLevelEdit={setEditingLevel}
                onApplyChanges={() => updateConfig(pendingChanges)}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
} 