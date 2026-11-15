"use client";
import { setShownCat } from "@/lib/cat-client";

// Marks which cat this screen shows (Every cat in the house), for saves made from it.
export default function ShownCat({ id }: { id: string }) {
  setShownCat(id);
  return null;
}
