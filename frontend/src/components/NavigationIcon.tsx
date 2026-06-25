import type { NavigationItem } from "../types/navigation";

const NAV_ICON_PATHS: Record<NonNullable<NavigationItem["icon"]>, string[]> = {
  dashboard: ["M4 13h7V4H4v9Z", "M13 20h7V4h-7v16Z", "M4 20h7v-5H4v5Z"],
  users: ["M16 11a4 4 0 1 0-8 0", "M4 20a8 8 0 0 1 16 0", "M18 8a3 3 0 0 1 3 3", "M21 20a5 5 0 0 0-3-4.6"],
  send: ["M4 12 20 4l-4 16-4-7-8-1Z", "m12 13 8-9"],
  template: ["M6 4h12v16H6V4Z", "M9 8h6", "M9 12h6", "M9 16h4"],
  contacts: ["M7 5h10v14H7V5Z", "M10 9h4", "M10 13h4", "M5 8h2", "M5 12h2", "M5 16h2"],
  leads: ["M5 19v-6a7 7 0 0 1 14 0v6", "M9 19v-6a3 3 0 0 1 6 0v6", "M12 4v3"],
  pairing: ["M8 7a6 6 0 0 1 8 0", "M5 4a10 10 0 0 1 14 0", "M9 11h6v9H9v-9Z", "M12 15h.01"],
  accounts: ["M5 6h14v12H5V6Z", "M8 10h8", "M8 14h5"],
  channels: ["M4 7h16", "M4 12h16", "M4 17h16", "M8 4v16", "M16 4v16"],
};

interface NavigationIconProps {
  icon?: NavigationItem["icon"];
  className?: string;
}

function NavigationIcon({ icon, className }: NavigationIconProps) {
  if (!icon) {
    return null;
  }

  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {NAV_ICON_PATHS[icon].map((path) => (
          <path key={path} d={path} />
        ))}
      </svg>
    </span>
  );
}

export default NavigationIcon;
