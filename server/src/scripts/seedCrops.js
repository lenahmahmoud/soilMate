import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDB, disconnectDB } from '../config/db.js';
import Crop from '../models/Crop.js';
import { CROPS } from '../data/crops.seed.js';

// server/public/crops (this file is server/src/scripts/seedCrops.js)
const CROPS_DIR = fileURLToPath(new URL('../../public/crops', import.meta.url));
const MAX_IMAGE_KB = 150;
const MAX_THUMB_KB = 40;

const sizeKb = (file) => (fs.existsSync(file) ? fs.statSync(file).size / 1024 : null);

function checkImages() {
  return CROPS.map((c) => {
    const img = sizeKb(path.join(CROPS_DIR, c.image.file));
    const thumb = sizeKb(path.join(CROPS_DIR, 'thumb', c.image.thumbFile));
    const warn = [];
    if (img != null && img > MAX_IMAGE_KB) warn.push(`image > ${MAX_IMAGE_KB} KB`);
    if (thumb != null && thumb > MAX_THUMB_KB) warn.push(`thumb > ${MAX_THUMB_KB} KB`);
    return {
      id: c.id,
      image: img == null ? 'MISSING' : `ok (${Math.round(img)} KB)`,
      thumb: thumb == null ? 'MISSING' : `ok (${Math.round(thumb)} KB)`,
      warning: warn.join(', '),
      missing: img == null || thumb == null,
    };
  });
}

async function main() {
  // 1. Every crop must pass the model rules (checked before anything is written).
  const invalid = [];
  for (const c of CROPS) {
    try {
      await new Crop(c).validate();
    } catch (err) {
      invalid.push(`${c.id}: ${Object.values(err.errors ?? {}).map((e) => e.message).join('; ') || err.message}`);
    }
  }
  if (invalid.length) {
    console.error('Seed data is invalid:\n  ' + invalid.join('\n  '));
    process.exit(1);
  }

  // 2. Every crop must have both image files. FAIL otherwise (nothing is written).
  const rows = checkImages();
  console.table(rows.map(({ missing, ...r }) => r));
  const missing = rows.filter((r) => r.missing);
  if (missing.length) {
    console.error(
      `\n${missing.length} crop(s) are missing image files. Expected:\n` +
        `  public/crops/<id>.webp   and   public/crops/thumb/<id>.webp\nNothing was written to the database.`,
    );
    process.exit(1);
  }

  // 3. Idempotent upsert by id. "status" is only set when the crop is first created, so a crop
  //    the agronomy owner already marked "reviewed" is not reset to "placeholder" by a re-run.
  await connectDB();
  try {
    const ops = CROPS.map(({ status, ...rest }) => ({
      updateOne: {
        filter: { id: rest.id },
        update: { $set: rest, $setOnInsert: { status } },
        upsert: true,
      },
    }));
    const res = await Crop.bulkWrite(ops);
    console.log(
      `\nCrops seeded: ${res.upsertedCount} created, ${res.modifiedCount} updated, ` +
        `${CROPS.length - res.upsertedCount - res.modifiedCount} unchanged.`,
    );
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});