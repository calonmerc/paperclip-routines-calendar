import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { DEFAULT_SETTINGS, resolveSettings } from "../src/lib/settings.js";

describe("manifest", () => {
  it("declares exactly the capabilities its slots need", () => {
    expect([...manifest.capabilities].sort()).toEqual(["ui.page.register", "ui.sidebar.register"]);
  });

  it("mounts the calendar page on a non-reserved company route", () => {
    const page = manifest.ui?.slots?.find((slot) => slot.type === "page");
    expect(page).toMatchObject({ routePath: "routine-calendar", exportName: "RoutineCalendarPage" });
  });

  it("keeps the plugin id and version in sync with package.json", async () => {
    const pkg = (await import("../package.json", { with: { type: "json" } })).default;
    expect(manifest.id).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
  });
});

describe("settings", () => {
  it("declares the collapse threshold with the same default the UI falls back to", () => {
    const schema = manifest.instanceConfigSchema as { properties: Record<string, { default: unknown }> };
    expect(schema.properties.timeGridCollapseAbove?.default).toBe(DEFAULT_SETTINGS.timeGridCollapseAbove);
  });

  it("falls back to defaults for missing or invalid values", () => {
    expect(resolveSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings({ timeGridCollapseAbove: 6 })).toEqual({ timeGridCollapseAbove: 6 });
    for (const bad of [0, -1, 1441, 2.5, "12", null]) {
      expect(resolveSettings({ timeGridCollapseAbove: bad })).toEqual(DEFAULT_SETTINGS);
    }
  });
});

describe("worker", () => {
  it("serves health over the data bridge", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const data = await harness.getData<{ status: string }>("health");
    expect(data.status).toBe("ok");
  });

  it("serves the company's settings, with defaults", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    expect(await harness.getData("settings", { companyId: "c1" })).toEqual(DEFAULT_SETTINGS);
    harness.setConfig({ timeGridCollapseAbove: 4 });
    expect(await harness.getData("settings", { companyId: "c1" })).toEqual({ timeGridCollapseAbove: 4 });
  });
});
