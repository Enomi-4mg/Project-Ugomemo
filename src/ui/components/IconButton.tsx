import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  showLabel?: boolean;
};

export function IconButton({
  className,
  icon: Icon,
  label,
  showLabel = false,
  ...buttonProps
}: IconButtonProps) {
  const iconButtonClassName = ["icon-button", showLabel ? "labeled-icon-button" : "", className].filter(Boolean).join(" ");

  return (
    <button {...buttonProps} aria-label={label} className={iconButtonClassName} title={label} type="button">
      <Icon aria-hidden="true" size={18} strokeWidth={2.4} />
      <span className={showLabel ? "icon-button-label" : "sr-only"}>{label}</span>
    </button>
  );
}
