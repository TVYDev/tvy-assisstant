"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMiniApp } from "./provider";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  match?: (path: string) => boolean;
};

function IconHome() {
  return (
    <svg className="size-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

function IconPay() {
  return (
    <svg className="size-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconAbout() {
  return (
    <svg className="size-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg className="size-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21 19a5 5 0 0 0-6-4.7" />
    </svg>
  );
}

function IconFit() {
  return (
    <svg className="size-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8v8M18 8v8M9 12h6M4 10v4M20 10v4" />
    </svg>
  );
}

function IconTasks() {
  return (
    <svg className="size-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg className="size-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

export function DockNav() {
  const pathname = usePathname();
  const { session } = useMiniApp();
  const isOwner = session?.isOwner ?? false;

  const items: NavItem[] = isOwner
    ? [
        { href: "/", label: "Home", icon: <IconHome /> },
        {
          href: "/people",
          label: "People",
          icon: <IconPeople />,
          match: (path) => path.startsWith("/people"),
        },
        { href: "/fitness", label: "Fit", icon: <IconFit /> },
        { href: "/tasks", label: "Tasks", icon: <IconTasks /> },
        { href: "/more", label: "More", icon: <IconMore /> },
      ]
    : [
        { href: "/", label: "Home", icon: <IconHome /> },
        { href: "/pay", label: "Pay", icon: <IconPay /> },
        { href: "/about", label: "About", icon: <IconAbout /> },
      ];

  return (
    <nav className="dock dock-md border-t border-base-300 bg-base-100">
      {items.map((item) => {
        const active = item.match
          ? item.match(pathname)
          : pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "dock-active" : undefined}
          >
            {item.icon}
            <span className="dock-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
