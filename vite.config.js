import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const key = env.ISBNDB_API_KEY;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/isbndb": {
          target: "https://api2.isbndb.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => {
            try {
              const url = new URL(path, "http://localhost");
              const endpoint = url.searchParams.get("endpoint") || "";
              url.searchParams.delete("endpoint");
              const remaining = url.searchParams.toString();
              return endpoint + (remaining ? "?" + remaining : "");
            } catch {
              return path.replace(/^\/api\/isbndb/, "");
            }
          },
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Authorization", key);
            });
          },
        },
      },
    },
  };
});
