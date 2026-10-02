import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

// The calendar reads routines from the REST API in the UI (the worker SDK
// can't list them; see AGENTS.md), so the worker only reports health for now.
const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("health", async () => {
      return { status: "ok", checkedAt: new Date().toISOString() };
    });
  },

  async onHealth() {
    return { status: "ok", message: "Plugin worker is running" };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
