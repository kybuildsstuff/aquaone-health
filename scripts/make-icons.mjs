// Renders the app icon (white drop on brand blue) to public/ PNGs. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const svg = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#5369EE"/>
  <path transform="translate(50 50) scale(2.6) translate(-8 -9.5)" d="M8 1.5C8 1.5 2 8 2 11.5a6 6 0 0 0 12 0C14 8 8 1.5 8 1.5z" fill="#ffffff"/>
</svg>`);

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(svg(size)).png().toFile(`public/${name}`);
  console.log("wrote public/" + name);
}
