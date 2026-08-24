import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    // 默认 node 环境（纯函数测试）
    environment: "node",
    include: ["src/**/*.test.js", "src/**/*.spec.js"],
    globals: false,
  },
});
