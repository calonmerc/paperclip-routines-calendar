import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { resolveSettings, type CalendarSettings } from "./lib/settings.js";

// The calendar reads routines from the REST API in the UI (the worker SDK
// can't list them; see AGENTS.md). The worker reports health and serves the
// per-company settings, which only it can read.
const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("health", async () => {
      return { status: "ok", checkedAt: new Date().toISOString() };
    });

    ctx.data.register("settings", async (params): Promise<CalendarSettings> => {
      const companyId = typeof params.companyId === "string" ? params.companyId : undefined;
      return resolveSettings(await ctx.config.get(companyId));
    });
  },

  async onHealth() {
    return { status: "ok", message: "Plugin worker is running" };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
