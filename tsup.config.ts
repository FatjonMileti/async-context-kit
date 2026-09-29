import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: false,
  clean: true,
  minify: false,
  treeshake: true,
  target: "node18",
  outDir: "dist",
  outExtension({ format }) {
    if (format === "cjs") {
      return { js: ".cjs" };
    }
    return { js: ".js" };
  },
});
