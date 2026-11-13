import fs from "node:fs";
import path from "node:path";

// C5: public/crops/<id>.webp (full) and public/crops/thumb/<id>.webp (thumbnail).
export function checkCropImages(publicDir, ids) {
  return ids.map((id) => ({
    id,
    full: fs.existsSync(path.join(publicDir, "crops", `${id}.webp`)),
    thumb: fs.existsSync(path.join(publicDir, "crops", "thumb", `${id}.webp`)),
  }));
}

export const imageRowOk = (row) => row.full && row.thumb;