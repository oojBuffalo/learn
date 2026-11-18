import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PORT matches the API server's own override (server/src/index.ts); 127.0.0.1 is the only address it listens on.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": { target: `http://127.0.0.1:${process.env.PORT || 4321}`, changeOrigin: false } } },
});
