import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const directory = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: directory("./web"),
  publicDir: directory("./public"),
  plugins: [react()],
  resolve: { alias: { "@": directory("./") } },
  build: { outDir: directory("./dist-netlify"), emptyOutDir: true },
});
