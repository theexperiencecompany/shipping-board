import type { IconName } from "../icons";
import { icons } from "../icons";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const icon = icons[name];
  return (
    <svg
      viewBox={icon.viewBox}
      aria-hidden="true"
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
