import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { boardApi } from "./server/api";

export default defineConfig({
  plugins: [react(), tailwindcss(), boardApi()],
  server: {
    host: "127.0.0.1",
    allowedHosts: [".taila76294.ts.net", ".heygaia.io"],
  },
  preview: {
    host: process.env.PREVIEW_HOST ?? "127.0.0.1",
    allowedHosts: [".taila76294.ts.net", ".heygaia.io"],
  },
});
