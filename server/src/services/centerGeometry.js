import { getCenterView } from './explorerService.js';
import { AppError } from '../utils/AppError.js';

// Name + map box of an area. The center id is already validated when it is saved on the farm,
// so an unknown id here is a server problem, not a client error.
export function getCenterGeometry(centerId) {
  const view = getCenterView(centerId);
  if (!view) throw new AppError(500, 'INTERNAL', `Unknown center: ${centerId}`);
  return { name: view.name, bbox: view.bbox };
}