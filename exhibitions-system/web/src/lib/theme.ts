/**
 * White-label theming. The design system stores its accent as HSL channels in
 * CSS variables (e.g. `--primary: 42 53% 54%`). Tenants provide a primary color
 * as a hex string, so we convert hex -> "H S% L%" and set the variables at runtime.
 */

const DEFAULT_PRIMARY = '42 53% 54%';
const DEFAULT_PRIMARY_HOVER = '42 60% 62%';

/** Convert a hex color (#RGB or #RRGGBB) to "H S% L%" HSL channels. */
export function hexToHslChannels(hex: string): string | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;

  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const light = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    sat = light > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue /= 6;
  }

  const H = Math.round(hue * 360);
  const S = Math.round(sat * 100);
  const L = Math.round(light * 100);
  return `${H} ${S}% ${L}%`;
}

/** Apply a tenant primary color (hex) to the running document. */
export function applyPrimaryColor(hex: string | null | undefined): void {
  const root = document.documentElement;
  const channels = hex ? hexToHslChannels(hex) : null;
  if (!channels) {
    resetTheme();
    return;
  }
  const [H, S, L] = channels.split(' ');
  const lNum = Math.min(78, parseInt(L, 10) + 8);
  root.style.setProperty('--primary', channels);
  root.style.setProperty('--primary-hover', `${H} ${S} ${lNum}%`);
}

/** Restore the default Black Axis gold accent. */
export function resetTheme(): void {
  const root = document.documentElement;
  root.style.setProperty('--primary', DEFAULT_PRIMARY);
  root.style.setProperty('--primary-hover', DEFAULT_PRIMARY_HOVER);
}
