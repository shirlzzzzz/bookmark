import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const key = env.ISBNDB_API_KEY;
  console.log("ISBNdb key loaded:", key ? "yes" : "NO");

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/isbndb": {
          target: "https://api2.isbndb.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/isbndb/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              proxyReq.setHeader("Authorization", key);
              console.log("Proxying:", req.url, "-> auth key present:", !!key);
            });
          },
        },
      },
    },
  };
});