import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AquaOne Health",
    short_name: "AquaOne",
    description: "Your cat's daily health companion, from PureStream.",
    start_url: "/start",
    display: "standalone",
    background_color: "#F9F8F7",
    theme_color: "#071D3C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
