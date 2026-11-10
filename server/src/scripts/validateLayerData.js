import { loadLayerData } from '../data/loadLayerData.js';

const dir = process.env.LAYER_DATA_DIR || 'src/data/layers';
try {
  const d = loadLayerData(dir);
  console.log('Layer data OK:', dir);
  console.log(' soil moisture calendar rows:', Object.values(d.soilMoisture.calendar).flat().length);
  console.log(' ndvi centers:', Object.keys(d.ndvi.centers).join(', '));
  console.log(' heat days:', d.heat.n);
  console.log(' atlas points:', Object.keys(d.atlas.points).join(', '));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}