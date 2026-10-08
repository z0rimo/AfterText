import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Used only for the embedded local development demo (docs/CORE_SPEC.md
// Section 19.1/19.22) — the published library itself continues to build via
// the repository's normal plain-tsc `build`/`typecheck` scripts, not Vite.
export default defineConfig({
  root: "demo",
  plugins: [react()]
});
