// The three SoilMate service centers. Single source of truth for layer data.
export const CENTERS = Object.freeze([
  { id: 'desouk', name: 'Desouk', nameAr: 'دسوق' },
  { id: 'sidi_salem', name: 'Sidi Salem', nameAr: 'سيدي سالم' },
  { id: 'baltim', name: 'Baltim', nameAr: 'بلطيم' },
]);

export const CENTER_IDS = Object.freeze(CENTERS.map((c) => c.id));