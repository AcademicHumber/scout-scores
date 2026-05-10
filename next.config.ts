import type { NextConfig } from "next"
import withSerwist from "@serwist/next"

const nextConfig: NextConfig = {
  /* config options here */
}

// withSerwist injects webpack config even when disable:true, which triggers
// "Webpack configured but Turbopack is not" warnings in dev. Skip the
// wrapper entirely in development so Turbopack runs without interference.
export default process.env.NODE_ENV === "development"
  ? nextConfig
  : withSerwist({
      swSrc: "src/app/sw.ts",
      swDest: "public/sw.js",
    })(nextConfig)
