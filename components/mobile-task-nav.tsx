import Link from "next/link";
import type { ReactNode } from "react";

export function MobileTaskNav({
  ariaLabel,
  children,
  className,
  sticky = false,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  const classes = [
    "mobile-task-nav",
    sticky ? "mobile-task-nav--sticky" : null,
    className,
  ].filter(Boolean).join(" ");

  return <nav className={classes} aria-label={ariaLabel}>{children}</nav>;
}

export function MobileTaskNavLabel({ code, label }: { code: string; label: string }) {
  return <><span className="mono">{code}</span><strong>{label}</strong></>;
}

export function MobileTaskNavLink({
  code,
  href,
  label,
}: {
  code: string;
  href: string;
  label: string;
}) {
  return (
    <Link className="mobile-task-nav__item" href={href}>
      <MobileTaskNavLabel code={code} label={label} />
    </Link>
  );
}
