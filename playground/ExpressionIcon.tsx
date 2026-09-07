import {
  ChatCircleDots,
  Cloud,
  Heart,
  Moon,
  Sparkle,
  Star,
  WarningCircle,
  Waveform,
  type Icon,
  type IconProps,
} from "@phosphor-icons/react";
import type { SheetFrame } from "./frames";

const EXPRESSION_ICONS: Record<SheetFrame["id"], Icon> = {
  idle: Heart,
  blink: Sparkle,
  listening: Waveform,
  talking: ChatCircleDots,
  happy: Star,
  thinking: Cloud,
  surprised: WarningCircle,
  sleepy: Moon,
};

export function ExpressionIcon({ expression, ...props }: IconProps & { expression: SheetFrame["id"] }) {
  const IconComponent = EXPRESSION_ICONS[expression];
  return <IconComponent aria-hidden="true" {...props} />;
}
