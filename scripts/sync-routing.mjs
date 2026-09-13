import { copyFileSync } from "node:fs";
copyFileSync("lib/routing/engine.mjs", "public/engine.mjs");
copyFileSync("lib/routing/shape.mjs", "public/shape.mjs");
