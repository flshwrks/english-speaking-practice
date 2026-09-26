import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Speaking Practice",
    short_name: "Speaking",
    description: "ビジネス英語スピーキングの自分専用トレーニング",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#2f5bd3",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
