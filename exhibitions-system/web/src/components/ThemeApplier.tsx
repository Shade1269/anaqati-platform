import { useEffect } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { applyPrimaryColor, resetTheme } from '../lib/theme';

/**
 * Applies the logged-in tenant's primary color at runtime so each white-label
 * client sees their own accent. Falls back to the default Black Axis gold when
 * there is no tenant branding (logged out, platform owner, or employee app).
 */
export function ThemeApplier() {
  const { profile } = useAdminAuth();
  const color = profile?.tenant?.primary_color ?? null;

  useEffect(() => {
    if (color) applyPrimaryColor(color);
    else resetTheme();
  }, [color]);

  return null;
}
