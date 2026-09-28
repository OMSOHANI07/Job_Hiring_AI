import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The examples route reads the bundled sample DOCX files at runtime.
  outputFileTracingIncludes: { "/api/examples/load": ["./samples/*.docx"] },
  serverExternalPackages: ["unpdf", "mammoth", "exceljs"],
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default nextConfig;
