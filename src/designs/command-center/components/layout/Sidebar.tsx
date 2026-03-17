import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="2" width="7" height="7" rx="1" />
        <rect x="11" y="2" width="7" height="7" rx="1" />
        <rect x="2" y="11" width="7" height="7" rx="1" />
        <rect x="11" y="11" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: "/schedule",
    label: "Schedule",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="16" height="15" rx="2" />
        <path d="M2 7h16" />
        <path d="M6 1v4" />
        <path d="M14 1v4" />
      </svg>
    ),
  },
  {
    to: "/tasks",
    label: "Tasks",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 5h12" />
        <path d="M4 10h12" />
        <path d="M4 15h8" />
        <rect x="1" y="4" width="2" height="2" rx="0.5" />
        <rect x="1" y="9" width="2" height="2" rx="0.5" />
        <rect x="1" y="14" width="2" height="2" rx="0.5" />
      </svg>
    ),
  },
  {
    to: "/apps",
    label: "Apps",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 2l7 4v8l-7 4-7-4V6l7-4z" />
        <path d="M10 10l7-4" />
        <path d="M10 10l-7-4" />
        <path d="M10 10v8" />
      </svg>
    ),
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="10" width="3" height="8" rx="0.5" />
        <rect x="7" y="6" width="3" height="12" rx="0.5" />
        <rect x="12" y="3" width="3" height="15" rx="0.5" />
        <rect x="17" y="8" width="1" height="0" rx="0" />
      </svg>
    ),
  },
];

const settingsItem: NavItem = {
  to: "/settings",
  label: "Settings",
  icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1v2M10 17v2M1 10h2M17 10h2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4" />
    </svg>
  ),
};

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      title={item.label}
      className={({ isActive }) =>
        `flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
          isActive
            ? "bg-[var(--bg-tertiary)] text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`
      }
    >
      {item.icon}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <nav className="flex flex-col items-center w-14 bg-[var(--bg-secondary)] py-4 justify-between">
      <div className="flex flex-col items-center gap-2">
        {navItems.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </div>
      <div className="flex flex-col items-center">
        <SidebarLink item={settingsItem} />
      </div>
    </nav>
  );
}
