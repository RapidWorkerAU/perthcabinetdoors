import { createElement, type HTMLAttributes, type ReactNode } from "react";

type PublicSectionProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "main" | "header" | "footer";
  children: ReactNode;
  className?: string;
};

export default function PublicSection({
  as: Component = "section",
  children,
  className,
  ...props
}: PublicSectionProps) {
  return createElement(Component, { className, ...props }, children);
}
