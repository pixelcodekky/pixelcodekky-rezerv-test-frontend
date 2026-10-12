"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Checkout" },
  { href: "/transactions", label: "Transactions" },
] as const;

/** Reads the current path for the active link; render inside <Suspense> (the path is request-time data). */
export function NavLinks() {
  return <NavLinkList pathname={usePathname()} />;
}

/** The links themselves; without a pathname (Suspense fallback) none is highlighted. */
export function NavLinkList({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
