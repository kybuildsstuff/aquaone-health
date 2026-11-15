// Shrinks a phone photo to at most 1600px on its long side, as a JPEG, before upload, so it
// sends fast on mobile data. Falls back to the original file if the browser can't decode it.
export async function shrinkPhoto(file: File, logTag: string): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob && blob.size > 0) return blob;
  } catch (e) {
    console.error(`${logTag}_resize_failed`, e instanceof Error ? e.message : String(e));
  }
  return file;
}
