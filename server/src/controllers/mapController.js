import { errorBody } from '../utils/errorResponse.js';
import { getMapLayer, listLayers } from '../services/explorerService.js';

export function listMapLayers(req, res) {
  res.json({ layers: listLayers() });
}

export function getMapLayerById(req, res) {
  const result = getMapLayer(req.params.layerId);
  if (result.kind === 'ok') return res.json(result.body);

  res.set('Cache-Control', 'no-store'); // do not let a cache keep an error
  if (result.kind === 'unavailable') {
    return res.status(404).json(errorBody('LAYER_NOT_AVAILABLE', result.reason));
  }
  return res.status(404).json(errorBody('NOT_FOUND', 'Unknown layer.'));
}