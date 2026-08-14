import type { SVGProps } from "react";

type PublicArrowIconProps = Omit<SVGProps<SVGSVGElement>, "children">;

/**
 * The small right-pointing arrow on "keep going" links and buttons.
 *
 * These used to be the literal characters `->`, which rendered as a hyphen and
 * a greater-than sign sitting at different heights and reading as a typo rather
 * than an affordance. Drawn instead, so it sits on the baseline, scales with
 * the font size (width/height are 1em) and inherits the link colour through
 * currentColor - including on hover, where a hard-coded colour would not.
 *
 * Always decorative: the link text alongside it already says where you are
 * going, so it is hidden from screen readers.
 */
export default function PublicArrowIcon({ className, ...props }: PublicArrowIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M2.75 8h10.5M9 3.75 13.25 8 9 12.25" />
    </svg>
  );
}
