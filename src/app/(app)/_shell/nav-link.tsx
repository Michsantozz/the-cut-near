"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ComponentProps } from "react";

type NavLinkProps = ComponentProps<typeof Link> & { href: string };

/**
 * A link that marks itself `aria-current="page"` on its own route (and below it); style it with `aria-[current=page]:`.
 * On routes with dynamic segments the path is only known at request time, so the plain link is prerendered
 * and the marked one streams in.
 */
export function NavLink(props: NavLinkProps) {
  return (
    <Suspense fallback={<Link {...props} />}>
      <CurrentAwareLink {...props} />
    </Suspense>
  );
}

function CurrentAwareLink({ href, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const current = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return <Link href={href} aria-current={current ? "page" : undefined} {...props} />;
}
