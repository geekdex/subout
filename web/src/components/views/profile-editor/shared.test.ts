import { describe, expect, it } from "vitest";
import { moveArrayItem } from "./shared";

describe("moveArrayItem", () => {
  it("moves an item forward and backward without mutating the source", () => {
    const original = ["a", "b", "c", "d"];
    expect(moveArrayItem(original, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveArrayItem(original, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(original).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the same array for no-op moves", () => {
    const original = ["a", "b"];
    expect(moveArrayItem(original, 0, 0)).toBe(original);
    expect(moveArrayItem(original, 0, -1)).toBe(original);
    expect(moveArrayItem(original, 0, 2)).toBe(original);
  });
});
