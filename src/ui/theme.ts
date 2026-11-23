export const palettes = {
  ember: "橙红",
  violet: "紫色",
  ocean: "蓝色",
  jade: "青绿色",
  gold: "金色",
} as const;

export type Palette = keyof typeof palettes;

const storageKey = "fund-helper-palette";

export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && Object.hasOwn(palettes, value);
}

export function loadPalette(): Palette {
  try {
    const saved = localStorage.getItem(storageKey);
    if (isPalette(saved)) return saved;
  } catch {
    return "ember";
  }
  return "ember";
}

export function savePalette(palette: Palette) {
  try {
    localStorage.setItem(storageKey, palette);
  } catch {
    return;
  }
}
