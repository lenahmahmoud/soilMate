// npm run validate:rotationlab [-- --strict] [-- --dir <folder>]
// Runs the same checks as server start-up on the data files and prints the image table (C5).
// A missing image is a warning; with --strict it is an error. The server itself never refuses to start for an image.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DIR, loadRotationLabData } from "../data/loadRotationLabData.js";
import { checkCropImages, imageRowOk } from "../utils/cropImages.js";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const dirIdx = args.indexOf("--dir");
const dir = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : DEFAULT_DIR;

try {
  const warnings = [];
  const data = loadRotationLabData(dir, { onWarn: (m) => warnings.push(m) });
  console.log(`Data OK: ${data.plansByKey.size} results, ${data.cropOrder.length} crops + fallow, version ${data.meta.version}`);
  for (const w of warnings) console.warn(`WARNING: ${w}`);

  const rows = checkCropImages(PUBLIC_DIR, [...data.cropOrder, "fallow"]);
  console.log("\nCrop images (public/crops):");
  console.log("id".padEnd(12), "full".padEnd(8), "thumb");
  for (const r of rows) {
    console.log(r.id.padEnd(12), (r.full ? "ok" : "MISSING").padEnd(8), r.thumb ? "ok" : "MISSING");
  }
  const missing = rows.filter((r) => !imageRowOk(r));
  if (missing.length) {
    const msg = `${missing.length} crop(s) without images: ${missing.map((r) => r.id).join(", ")}`;
    if (strict) {
      console.error(`ERROR: ${msg}`);
      process.exit(1);
    }
    console.warn(`WARNING: ${msg} (the frontend shows a placeholder; use --strict to fail)`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}