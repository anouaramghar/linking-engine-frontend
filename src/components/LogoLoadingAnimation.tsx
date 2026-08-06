import type { SVGProps } from "react";

export type LogoLoadingSize = "xs" | "sm" | "md" | "lg" | number;

export interface LogoLoadingAnimationProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  size?: LogoLoadingSize;
  label?: string;
  className?: string;
  static?: boolean;
}

const SIZE_MAP: Record<"xs" | "sm" | "md" | "lg", number> = {
  xs: 14,
  sm: 18,
  md: 24,
  lg: 36,
};

export default function LogoLoadingAnimation({
  size = "sm",
  label,
  className = "",
  static: isStatic = false,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
  ...props
}: LogoLoadingAnimationProps) {
  const pxSize = typeof size === "number" ? size : SIZE_MAP[size] ?? 18;
  const effectiveLabel = ariaLabel ?? label;
  const isHidden = ariaHidden ?? !effectiveLabel;

  return (
    <svg
      {...(isHidden
        ? { "aria-hidden": "true" }
        : { role: "status", "aria-label": effectiveLabel, "aria-live": "polite" })}
      width={pxSize}
      height={pxSize}
      viewBox="0 0 26 26"
      fill="none"
      className={`logo-loading-anim flex-none ${isStatic ? "" : "logo-anim-svg"} ${className}`}
      {...props}
    >
      <circle
        cx="6"
        cy="20"
        r="4"
        fill="currentColor"
        className={isStatic ? "" : "logo-anim-node-solid"}
      />
      <circle
        cx="20"
        cy="6"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className={isStatic ? "" : "logo-anim-node-hollow"}
      />
      <path
        d="M8.8 17.2 L17.2 8.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className={isStatic ? "" : "logo-anim-link"}
      />
    </svg>
  );
}

/**
 * A combined badge / indicator with the animated logo and a text description.
 */
export function LogoLoadingIndicator({
  text,
  size = "sm",
  className = "",
}: {
  text: string;
  size?: LogoLoadingSize;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoLoadingAnimation size={size} className="text-primary flex-none" label={text} />
      <span>{text}</span>
    </span>
  );
}
