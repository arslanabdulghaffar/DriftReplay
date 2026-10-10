/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@driftreplay/core", "@driftreplay/fixtures"],
};

export default config;
