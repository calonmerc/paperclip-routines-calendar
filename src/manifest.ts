import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { ROUTE_PATH } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-routines-calendar",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Routines Calendar",
  description: "Visualize Paperclip routines on a calendar",
  author: "Kyle Menigoz",
  categories: ["ui"],
  capabilities: ["ui.page.register", "ui.sidebar.register"],
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
