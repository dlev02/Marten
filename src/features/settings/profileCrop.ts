export type Crop = { zoom: number; x: number; y: number };
export const initialCrop: Crop = { zoom: 1, x: 0, y: 0 };
export const cropSide = 512;

export function cropBounds(width: number, height: number, crop: Crop) {
  const zoom = Math.max(1, Math.min(3, crop.zoom));
  const side = Math.min(width, height) / zoom;
  return {
    x: ((width - side) * (Math.max(-1, Math.min(1, crop.x)) + 1)) / 2,
    y: ((height - side) * (Math.max(-1, Math.min(1, crop.y)) + 1)) / 2,
    side,
  };
}

export async function loadProfileImage(file: File): Promise<ImageBitmap> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("Choose a photo up to 10 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo could not be opened. Try a JPEG or PNG image.");
  }
  if (
    bitmap.width * bitmap.height > 40_000_000 ||
    !bitmap.width ||
    !bitmap.height
  ) {
    bitmap.close();
    throw new Error("Choose a photo smaller than 40 megapixels.");
  }
  return bitmap;
}

export function drawProfileCrop(
  canvas: HTMLCanvasElement,
  image: ImageBitmap,
  crop: Crop,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not prepare this photo.");
  const bounds = cropBounds(image.width, image.height, crop);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    image,
    bounds.x,
    bounds.y,
    bounds.side,
    bounds.side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

export async function exportProfileCrop(image: ImageBitmap, crop: Crop) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = cropSide;
  drawProfileCrop(canvas, image, crop);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("The cropped photo could not be saved.")),
      "image/jpeg",
      0.9,
    );
  });
  if (blob.size > 1024 * 1024)
    throw new Error("The cropped photo is too large. Choose another photo.");
  return blob;
}
