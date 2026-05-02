import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "companiesmarketcap.com",
        pathname: "/img/company-logos/**",
      },
    ],
  },
};

export default nextConfig;
