import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type PublicButtonProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type">;

function isExternalHref(href: string) {
  return /^(https?:)?\/\//.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
}

export default function PublicButton({
  children,
  className,
  href,
  type = "button",
  ...props
}: PublicButtonProps) {
  if (href) {
    if (isExternalHref(href)) {
      return (
        <a className={className} href={href} {...props}>
          {children}
        </a>
      );
    }

    return (
      <Link className={className} href={href} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={className} type={type} {...props}>
      {children}
    </button>
  );
}
