import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ariaLabel?: string;
  icon: LucideIcon;
  label: string;
  pressed?: boolean;
  showLabel?: boolean;
  shortcut?: string;
};

export function IconButton({
  ariaLabel,
  className,
  icon: Icon,
  label,
  pressed,
  showLabel = false,
  shortcut,
  title,
  ...buttonProps
}: IconButtonProps) {
  const iconButtonClassName = ["icon-button", showLabel ? "labeled-icon-button" : "", className].filter(Boolean).join(" ");
  const feedbackLabel = shortcut ? `${label} (${shortcut})` : label;

  return (
    <button
      {...buttonProps}
      aria-label={ariaLabel ?? feedbackLabel}
      aria-pressed={pressed}
      className={iconButtonClassName}
      title={title ?? feedbackLabel}
      type="button"
    >
      <Icon aria-hidden="true" size={18} strokeWidth={2.4} />
      <span className={showLabel ? "icon-button-label" : "sr-only"}>{label}</span>
    </button>
  );
}
