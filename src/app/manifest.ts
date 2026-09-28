import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Speaking Practice",
    short_name: "Speaking",
    description: "ビジネス英語スピーキングの自分専用トレーニング",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f3f0",
    theme_color: "#f4f3f0",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
