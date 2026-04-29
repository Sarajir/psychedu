import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: https://<user>.github.io/psychedu/
const base = process.env.BASE_PATH?.trim() || "/";

export default defineConfig({
  plugins: [react()],
  base: base.endsWith("/") ? base : `${base}/`,
});
