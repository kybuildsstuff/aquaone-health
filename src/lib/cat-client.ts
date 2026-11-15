"use client";
import { CAT_HEADER } from "@/lib/cats";

// The cat this browser tab is showing, set by <ShownCat> on every screen. Saves send it so they land
// on the cat she was looking at.
let shown: string | null = null;
export const setShownCat = (id: string | null) => {
  shown = id;
};
export const catHeader = (): Record<string, string> => (shown ? { [CAT_HEADER]: shown } : {});
