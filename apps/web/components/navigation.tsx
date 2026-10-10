"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const pages: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/fixtures/mercurypay", label: "MercuryPay fixture", icon: "fixture" },
  { href: "/evidence", label: "Evidence", icon: "evidence" },
  { href: "/status", label: "Phase status", icon: "status" },
];

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="navigation">
      {pages.map((page) => (
        <Link
          key={page.href}
          href={page.href}
          className={`nav-link${pathname === page.href ? " nav-link-active" : ""}`}
          aria-current={pathname === page.href ? "page" : undefined}
        >
          <Icon name={page.icon} />
          <span>{page.label}</span>
          {pathname === page.href && <span className="nav-active-mark" aria-hidden="true" />}
        </Link>
      ))}
    </nav>
  );
}
