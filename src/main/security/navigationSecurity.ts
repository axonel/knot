/**
 * Navigation & External URL Security Guards
 * Prevents arbitrary navigation within the Electron window and restricts
 * external URLs opened via system browser to trusted web schemes (http/https).
 */

export interface UrlValidationResult {
  allowed: boolean;
  reason?: string;
  sanitizedUrl?: string;
}

const ALLOWED_EXTERNAL_SCHEMES = new Set(['http:', 'https:']);

/**
 * Validates whether an external link requested by the renderer is safe to open
 * via the user's default system browser (shell.openExternal).
 * Strictly rejects dangerous schemes (javascript:, file:, data:, vbscript:, custom protocols).
 */
export function validateExternalUrl(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { allowed: false, reason: 'URL must be a non-empty string' };
  }

  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_EXTERNAL_SCHEMES.has(parsed.protocol)) {
      return {
        allowed: false,
        reason: `Disallowed URL scheme: "${parsed.protocol}". Only "http:" and "https:" are permitted for external opening.`,
      };
    }
    return { allowed: true, sanitizedUrl: parsed.href };
  } catch {
    return { allowed: false, reason: 'Malformed or unparseable URL' };
  }
}

/**
 * Validates internal navigation attempts inside the Electron BrowserWindow (will-navigate).
 * Allows only the trusted Vite development server (localhost/127.0.0.1) or local file:// bundle.
 * Blocks all external navigation attempts.
 */
export function validateNavigationUrl(
  navigationUrl: string,
  devServerUrl?: string
): UrlValidationResult {
  if (!navigationUrl || typeof navigationUrl !== 'string') {
    return { allowed: false, reason: 'Navigation URL must be a non-empty string' };
  }

  try {
    const parsed = new URL(navigationUrl);

    // 1. In development, allow dev server URL (localhost or 127.0.0.1)
    if (devServerUrl) {
      const devParsed = new URL(devServerUrl);
      if (
        (parsed.origin === devParsed.origin ||
          (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) &&
        (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      ) {
        return { allowed: true, sanitizedUrl: parsed.href };
      }
    }

    // 2. In production or local file loads, allow file: protocol
    if (parsed.protocol === 'file:') {
      return { allowed: true, sanitizedUrl: parsed.href };
    }

    return {
      allowed: false,
      reason: `External navigation blocked to untrusted origin: "${parsed.origin}"`,
    };
  } catch {
    return { allowed: false, reason: 'Malformed navigation URL' };
  }
}
