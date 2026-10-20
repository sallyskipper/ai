import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { isBookable } from "@/lib/catalog";
import { logoutAction } from "@/actions/auth";
import { Avatar, Badge, LinkButton, Logo } from "./ui";

export async function PublicNav() {
  const viewer = await getViewer();
  const unread = viewer ? await db.notification.count({ where: { userId: viewer.id, readAt: null } }) : 0;
  // Service links follow the catalog order (Solo, Duo, Coaching); "Soon" shows only while a service isn't bookable.
  const services = await db.service.findMany({ where: { game: { slug: "valorant" } }, orderBy: { sortOrder: "asc" } });
  const links = [
    ...services.map((s) => ({ href: `/services/${s.slug}`, label: s.name, soon: !isBookable(s) })),
    { href: "/providers", label: "Providers", soon: false },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <span className="hidden h-6 w-px bg-line md:block" />
        <span className="hidden items-center gap-2 rounded-md border border-line bg-coal px-2.5 py-1 text-xs font-semibold tracking-wider text-muted uppercase md:inline-flex">
          <span className="size-1.5 rounded-full bg-red" /> Valorant
        </span>
        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-panel hover:text-text">
              {l.label}
              {l.soon && <Badge tone="gray">Soon</Badge>}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {viewer ? (
            <>
              <Link href="/dashboard/notifications" className="relative rounded-md p-2 text-muted hover:bg-panel hover:text-text" aria-label={`Notifications (${unread} unread)`}>
                <BellIcon />
                {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-red px-1 text-center text-[10px] leading-4 font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
              </Link>
              <LinkButton href={viewer.role === "ADMIN" ? "/admin" : "/dashboard"} variant="secondary" size="sm">
                <Avatar name={viewer.displayName} color={viewer.avatarColor} size={20} />
                Dashboard
              </LinkButton>
              <form action={logoutAction} className="hidden sm:block">
                <button className="rounded-md px-2 py-1.5 text-xs text-faint hover:text-text">Sign out</button>
              </form>
            </>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" size="sm">Sign in</LinkButton>
              <LinkButton href="/register" size="sm">Get started</LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function BellIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-coal">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">
            A Valorant services marketplace with personally vetted providers, administrator-set minimum prices and reviews only from completed orders.
          </p>
          <p className="mt-4 max-w-md text-xs text-faint">
            Redline is not affiliated with or endorsed by Riot Games. Valorant is a trademark of Riot Games, Inc. Never share your account password with anyone.
          </p>
        </div>
        <div>
          <p className="label">Services</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-text" href="/services/valorant-solo-rank-up">Solo Rank Up</Link></li>
            <li><Link className="hover:text-text" href="/services/valorant-duo-rank-up">Duo Rank Up</Link></li>
            <li><Link className="hover:text-text" href="/services/valorant-coaching">Coaching</Link></li>
          </ul>
        </div>
        <div>
          <p className="label">Marketplace</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-text" href="/providers">Browse providers</Link></li>
            <li><Link className="hover:text-text" href="/register?type=provider">Become a provider</Link></li>
            <li><Link className="hover:text-text" href="/dashboard/support">Support</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
