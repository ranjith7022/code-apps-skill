import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Building2, FlaskConical, Upload, Beaker } from "lucide-react";

const mainNav = [
  { to: "/sample-feature", label: "Workspace", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Building2 },
];

const devNav = [
  { to: "/write-test", label: "Write test", icon: FlaskConical },
  { to: "/upload-test", label: "Upload test", icon: Upload },
  { to: "/experiments", label: "Experiments", icon: Beaker },
];

function NavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-[7px] text-[13px] rounded-lg transition-colors ${
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        }`
      }
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </NavLink>
  );
}

export default function Layout() {
  return (
    <div className="h-dvh flex bg-background text-foreground overflow-hidden">
      <aside className="w-52 shrink-0 border-r border-border/40 flex flex-col">
        <div className="h-12 px-5 flex items-center">
          <span className="text-[13px] font-semibold tracking-tight text-foreground/90">
            Code Apps
          </span>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto">
          {mainNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          <div className="mt-5 mb-1.5 px-3">
            <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
              Dev
            </span>
          </div>
          {devNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
