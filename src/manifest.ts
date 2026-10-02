import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-routines-calendar",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Routines Calendar",
  description: "Visualize Paperclip routines on a calendar",
  author: "Kyle Menigoz",
  categories: ["ui"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
    "ui.dashboardWidget.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "health-widget",
        displayName: "Routines Calendar Health",
        exportName: "DashboardWidget"
      }
    ]
  }
};

export default manifest;
