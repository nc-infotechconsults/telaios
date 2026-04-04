import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
} from "@heroui/react";

const NAV_ITEMS = [
  { to: "/", label: "Projects" },
  { to: "/agents", label: "Agent Profiles" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const location = useLocation();
  // Chat and execution pages need full height (no scroll at layout level)
  const isFullHeight =
    location.pathname.includes("/projects/") ||
    location.pathname.includes("/execute");

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Navbar isBordered maxWidth="full" className="shrink-0">
        <NavbarBrand>
          <span className="font-bold text-lg tracking-tight">⚙ SWE AI Platform</span>
        </NavbarBrand>
        <NavbarContent className="gap-6" justify="center">
          {NAV_ITEMS.map((item) => (
            <NavbarItem key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive ? "text-primary" : "text-foreground/60 hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </NavbarItem>
          ))}
        </NavbarContent>
      </Navbar>

      <main
        className={
          isFullHeight
            ? "flex-1 overflow-hidden"
            : "flex-1 overflow-y-auto"
        }
      >
        {isFullHeight ? (
          <Outlet />
        ) : (
          <div className="container max-w-6xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
