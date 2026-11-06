import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { boardApi } from "./server/api";

export default defineConfig({
  plugins: [react(), tailwindcss(), boardApi()],
});
