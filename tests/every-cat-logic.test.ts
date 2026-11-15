import { describe, expect, it } from "vitest";
import { CAT_ERRORS, MAX_CATS, pickCat } from "../src/lib/cats";

describe("every cat: choosing the cat", () => {
  const cats = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("the remembered cat when it's still hers and active", () => expect(pickCat(cats, "b")?.id).toBe("b"));
  it("her first cat when nothing is remembered, or the remembered one is gone", () => {
    expect(pickCat(cats, null)?.id).toBe("a");
    expect(pickCat(cats, "removed")?.id).toBe("a");
  });
  it("nothing before her first cat", () => expect(pickCat([], "a")).toBeNull());
  it("the limit is four and the refusal says so", () => {
    expect(MAX_CATS).toBe(4);
    expect(CAT_ERRORS.cat_limit).toContain("up to 4 cats");
  });
});
