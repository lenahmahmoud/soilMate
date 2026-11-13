import Crop from "../../src/models/Crop.js";
import { CROPS } from "../../src/data/crops.seed.js";
import { SLOTS } from "../../src/constants/soilmateEnums.js";

describe("crops seed list", () => {
  test("has the 11 crops from the guide, unique ids", () => {
    expect(CROPS).toHaveLength(11);
    expect(new Set(CROPS.map((c) => c.id)).size).toBe(11);
    expect(CROPS.map((c) => c.id).sort()).toEqual([
      "alfalfa-hay",
      "cotton",
      "crimson-clover",
      "daikon",
      "fallow",
      "field-corn",
      "field-peas",
      "grain-sorghum",
      "soybeans",
      "winter-rye",
      "winter-wheat",
    ]);
  });

  test.each(CROPS.map((c) => [c.id, c]))(
    "%s passes the Crop model rules",
    async (id, c) => {
      await new Crop(c).validate(); // throws (and fails the test) when a rule is broken
    },
  );

  test("image files follow the naming rule and every crop has alt text", () => {
    for (const c of CROPS) {
      expect(c.image.file).toBe(`${c.id}.webp`);
      expect(c.image.thumbFile).toBe(`${c.id}.webp`);
      expect(c.image.alt.length).toBeGreaterThan(5);
    }
  });

  test("selectableAsCurrent matches the guide", () => {
    const current = CROPS.filter((c) => c.selectableAsCurrent)
      .map((c) => c.id)
      .sort();
    expect(current).toEqual([
      "alfalfa-hay",
      "cotton",
      "field-corn",
      "grain-sorghum",
      "soybeans",
      "winter-wheat",
    ]);
  });

  test("no crop has a default slot (V2: the farmer picks every crop)", () => {
    expect(CROPS.some((c) => "defaultForSlot" in c)).toBe(false);
  });

  test("every slot has at least 2 crops to choose from", () => {
    for (const slot of SLOTS)
      expect(
        CROPS.filter((c) => c.slots.includes(slot)).length,
      ).toBeGreaterThanOrEqual(2);
  });

  test("attributes match the guide (spot checks)", () => {
    const by = Object.fromEntries(CROPS.map((c) => [c.id, c.attributes]));
    expect(by["field-corn"]).toMatchObject({
      family: "grass",
      isLegume: false,
      waterNeed: "high",
      groundCover: "medium",
      costLevel: "high",
      typicalDays: 120,
    });
    expect(by["fallow"]).toMatchObject({
      family: "none",
      equipment: [],
      typicalDays: 60,
    });
    expect(by["field-peas"].equipment).toEqual([
      "seed_drill_planter",
      "combine_harvester",
    ]);
    expect(
      CROPS.filter((c) => c.attributes.isLegume)
        .map((c) => c.id)
        .sort(),
    ).toEqual(["alfalfa-hay", "crimson-clover", "field-peas", "soybeans"]);
  });

  test("every crop is marked placeholder", () => {
    expect(CROPS.every((c) => c.status === "placeholder")).toBe(true);
  });
});
