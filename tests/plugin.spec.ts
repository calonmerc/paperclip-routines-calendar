import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

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

describe("worker", () => {
  it("serves health over the data bridge", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    const data = await harness.getData<{ status: string }>("health");
    expect(data.status).toBe("ok");
  });
});
