// Overlay system types for multi-overlay support with orientation-aware configurations

export type OverlayPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type OverlayMode = 'random' | 'user_choice';

/**
 * Settings for a specific orientation (portrait or landscape)
 */
export interface OrientationSettings {
  enabled: boolean;
  position: OverlayPosition;
  opacity: number;   // 0-1
  scale: number;     // 0-1
}

/**
 * A single overlay item with support for different portrait/landscape configurations
 */
export interface OverlayItem {
  id: string;
  name: string;                    // Display name for carousel
  portraitUrl: string;             // Overlay image for portrait photos
  landscapeUrl: string;            // Overlay image for landscape photos (can be same as portrait)
  portrait: OrientationSettings;
  landscape: OrientationSettings;
}

/**
 * New overlay configuration supporting multiple overlays
 */
export interface OverlayConfig {
  enabled: boolean;
  mode: OverlayMode;              // How overlay is selected: 'random' or 'user_choice'
  overlays: OverlayItem[];        // Max 5 items
}

/**
 * Legacy overlay configuration (for backward compatibility)
 */
export interface LegacyOverlayConfig {
  enabled: boolean;
  url: string;
  position: OverlayPosition;
  opacity: number;
  scale: number;
}

/**
 * Type guard to check if config is legacy format
 */
export function isLegacyOverlayConfig(config: unknown): config is LegacyOverlayConfig {
  if (!config || typeof config !== 'object') return false;
  const obj = config as Record<string, unknown>;
  return 'url' in obj && typeof obj.url === 'string' && !('overlays' in obj);
}

/**
 * Convert legacy overlay config to new format
 */
export function migrateLegacyConfig(legacy: LegacyOverlayConfig): OverlayConfig {
  const settings: OrientationSettings = {
    enabled: true,
    position: legacy.position,
    opacity: legacy.opacity,
    scale: legacy.scale,
  };

  return {
    enabled: legacy.enabled,
    mode: 'random',
    overlays: [{
      id: crypto.randomUUID(),
      name: 'Default Overlay',
      portraitUrl: legacy.url,
      landscapeUrl: legacy.url,
      portrait: { ...settings },
      landscape: { ...settings },
    }],
  };
}

/**
 * Get the default overlay configuration
 */
export function getDefaultOverlayConfig(): OverlayConfig {
  return {
    enabled: false,
    mode: 'random',
    overlays: [],
  };
}

/**
 * Get the default orientation settings
 */
export function getDefaultOrientationSettings(): OrientationSettings {
  return {
    enabled: true,
    position: 'bottom-right',
    opacity: 0.8,
    scale: 0.3,
  };
}

/**
 * Create a new empty overlay item
 */
export function createEmptyOverlayItem(): OverlayItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    portraitUrl: '',
    landscapeUrl: '',
    portrait: getDefaultOrientationSettings(),
    landscape: getDefaultOrientationSettings(),
  };
}

/**
 * Maximum number of overlays allowed per upload link
 */
export const MAX_OVERLAYS = 5;
