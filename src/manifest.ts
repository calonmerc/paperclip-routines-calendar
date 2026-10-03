import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { ROUTE_PATH } from "./constants.js";
import { COLLAPSE_ABOVE_RANGE, DEFAULT_SETTINGS } from "./lib/settings.js";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-routines-calendar",
  apiVersion: 1,
  version: "0.1.1",
  displayName: "Routines Calendar",
  description: "Visualize Paperclip routines on a calendar",
  author: "Kyle Menigoz",
  categories: ["ui"],
  capabilities: ["ui.page.register", "ui.sidebar.register"],
  instanceConfigSchema: {
    type: "object",
    properties: {
      timeGridCollapseAbove: {
        type: "integer",
        title: "Collapse frequent schedules in week and day views",
        description:
          "A schedule that runs more than this many times in a day is shown as a single \"N×\" entry above the time grid instead of one block per run.",
        default: DEFAULT_SETTINGS.timeGridCollapseAbove,
        ...COLLAPSE_ABOVE_RANGE,
      },
    },
  },
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "routine-calendar",
        displayName: "Routine calendar",
        exportName: "RoutineCalendarPage",
        routePath: ROUTE_PATH
      },
      {
        type: "sidebar",
        id: "routine-calendar-link",
        displayName: "Routine calendar",
        exportName: "RoutineCalendarSidebarLink"
      }
    ]
  }
};

export default manifest;
