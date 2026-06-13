import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Edinburgh Roundnet Ratings
        </Link>
        <div className="ml-auto flex items-center gap-4 text-sm text-slate-600">
          <Link href="/" className="hover:text-slate-900">
            Board
          </Link>
          <Link href="/admin" className="hover:text-slate-900">
            Admin
          </Link>
        </div>
      </nav>
    </header>
  );
}
