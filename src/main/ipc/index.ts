import { setupConfigHandlers } from './handlers/config';
import { setupSensorHandlers } from './handlers/sensor';

export function setupIpcHandlers() {
  setupConfigHandlers();
  setupSensorHandlers();
} 