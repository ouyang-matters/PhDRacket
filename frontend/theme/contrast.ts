// WCAG 2 contrast ratios, for checking theme palettes.

/** Parses #rgb, #rrggbb or rgba(r, g, b, a) into [r, g, b, a]. */
export function parseColor(color: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color.trim());
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  throw new Error(`unsupported color ${color}`);
}

/** `top` composited over an opaque `bottom`. */
export function blend(top: string, bottom: string): [number, number, number] {
  const [r, g, b, a] = parseColor(top);
  const [R, G, B] = parseColor(bottom);
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio of `fg` on `bg` (1 to 21). Translucent colors are blended over `bg`. */
export function contrast(fg: string, bg: string): number {
  const back = blend(bg, "#808080");
  const backHex = `#${back.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
  const front = blend(fg, backHex);
  const [a, b] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
