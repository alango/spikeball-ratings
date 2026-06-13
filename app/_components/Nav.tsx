"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={
          active ? "font-medium text-slate-900" : "text-slate-600 hover:text-slate-900"
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
          <img src="/icon.png" alt="" width={24} height={24} className="shrink-0 rounded" />
          <span className="truncate">Edinburgh Roundnet Ratings</span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-4 text-sm">
          {navLink("/", "Board")}
          {navLink("/admin", "Admin")}
        </div>
      </nav>
    </header>
  );
}
