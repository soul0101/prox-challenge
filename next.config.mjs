/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  // The Claude Agent SDK resolves its own `cli.js` at runtime via
  // `fileURLToPath(import.meta.url)` and spawns it as a subprocess. There's
  // no static `import` of cli.js, so Next.js's output tracer doesn't know to
  // copy it into the serverless function bundle — on Vercel this fails with
  //   "Claude Code executable not found at …/cli.js. Is
  //    options.pathToClaudeCodeExecutable set?"
  //
  // Two-part fix:
  //  1. Mark the SDK + sharp + canvas as external server packages so webpack
  //     leaves them alone and they're resolved from node_modules at runtime.
  //  2. Force-include the SDK's entire directory (cli.js, wasm, vendored
  //     ripgrep) into the traced files for the API routes that import it.
  serverExternalPackages: [
    "@anthropic-ai/claude-agent-sdk",
    "@napi-rs/canvas",
    "sharp",
    "pdfjs-dist",
  ],
  outputFileTracingIncludes: {
    "/api/chat": [
      "./node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
      "./node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs",
      "./node_modules/@anthropic-ai/claude-agent-sdk/*.wasm",
      "./node_modules/@anthropic-ai/claude-agent-sdk/vendor/**/*",
      "./node_modules/@anthropic-ai/claude-agent-sdk/entrypoints/**/*",
      "./node_modules/@anthropic-ai/claude-agent-sdk/transport/**/*",
    ],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.externals = [...(config.externals || []), { canvas: "commonjs canvas" }];
    return config;
  },
  async headers() {
    return [
      {
        source: "/artifact-runner/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
