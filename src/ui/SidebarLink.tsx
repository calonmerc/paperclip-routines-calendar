import { useHostLocation, useHostNavigation, type PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";
import { ROUTE_PATH } from "../constants.js";
import { t } from "./theme.js";

export function RoutineCalendarSidebarLink(_props: PluginSidebarProps) {
  const nav = useHostNavigation();
  const location = useHostLocation();
  const href = nav.resolveHref(`/${ROUTE_PATH}`);
  const active = location.pathname === href;

  return (
    <a
      {...nav.linkProps(`/${ROUTE_PATH}`)}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 500,
        color: t.fg,
        textDecoration: "none",
        background: active ? t.accent : "transparent",
      }}
    >
      <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <rect x="2" y="3" width="12" height="11" rx="1.5" />
        <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
      </svg>
      <span>Routine calendar</span>
    </a>
  );
}
