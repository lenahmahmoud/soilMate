// The three SoilMate service centers. Single source of truth for layer data.
// export const CENTERS = Object.freeze([
//   { id: 'desouk', name: 'Desouk', nameAr: 'دسوق' },
//   { id: 'sidi_salem', name: 'Sidi Salem', nameAr: 'سيدي سالم' },
//   { id: 'baltim', name: 'Baltim', nameAr: 'بلطيم' },
// ]);

// export const CENTER_IDS = Object.freeze(CENTERS.map((c) => c.id));

// The three SoilMate service centers. Single source of truth for layer data.
const GOVERNORATE = 'Kafr El-Sheikh';

export const CENTERS = Object.freeze([
  { id: 'desouk', name: 'Desouk', nameAr: 'دسوق', governorate: GOVERNORATE },
  { id: 'sidi_salem', name: 'Sidi Salem', nameAr: 'سيدي سالم', governorate: GOVERNORATE },
  { id: 'baltim', name: 'Baltim', nameAr: 'بلطيم', governorate: GOVERNORATE },
]);

export const CENTER_IDS = Object.freeze(CENTERS.map((c) => c.id));