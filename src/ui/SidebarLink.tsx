import { useHostLocation, useHostNavigation, type PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";
import { ROUTE_PATH } from "../constants.js";
import { t } from "./theme.js";

const LINK_CLASS = "routines-calendar-sidebar-link";
const sidebarAccent = "var(--sidebar-accent, var(--accent, rgba(127,127,127,0.12)))";
const sidebarAccentFg = "var(--sidebar-accent-foreground, var(--accent-foreground, currentColor))";

/**
 * Mirrors the host's own sidebar links (Tailwind `mx-2 px-2 py-1.5
 * rounded-lg gap-2.5 font-medium text-foreground/80`, `sidebar-accent` on
 * hover and when active) with inline values and host CSS variables, so it
 * lines up without depending on the host's compiled class names.
 */
export function RoutineCalendarSidebarLink(_props: PluginSidebarProps) {
  const nav = useHostNavigation();
  const location = useHostLocation();
  const href = nav.resolveHref(`/${ROUTE_PATH}`);
  const active = location.pathname === href;

  // Colours live in the stylesheet: inline values would override :hover.
  return (
    <>
      <style>{`
        .${LINK_CLASS} { color: color-mix(in srgb, ${t.fg} 80%, transparent); background: transparent; }
        .${LINK_CLASS}:hover, .${LINK_CLASS}[aria-current="page"] { background: ${sidebarAccent}; color: ${sidebarAccentFg}; }
        .${LINK_CLASS}:focus-visible { outline: 2px solid var(--ring, ${t.primary}); outline-offset: -2px; }
      `}</style>
      <a
        {...nav.linkProps(`/${ROUTE_PATH}`)}
        className={LINK_CLASS}
        aria-current={active ? "page" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: "0 8px",
          padding: "6px 8px",
          borderRadius: 8,
          fontSize: "var(--text-compact, 13px)",
          fontWeight: 500,
          lineHeight: 1.5,
          textDecoration: "none",
          transition: "background-color 150ms, color 150ms",
        }}
      >
        <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden style={{ flexShrink: 0 }}>
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
        <span>Routine calendar</span>
      </a>
    </>
  );
}
