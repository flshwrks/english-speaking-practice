import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Azure Speech SDK は Node 専用の依存を含むのでバンドルせずに読み込む
  serverExternalPackages: ["microsoft-cognitiveservices-speech-sdk"],
};

export default nextConfig;
