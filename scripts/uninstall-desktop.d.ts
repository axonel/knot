export interface DesktopIntegrationOptions {
  home?: string;
  projectDir?: string;
  xdgDataHome?: string;
  binDir?: string;
}

export function uninstallDesktopIntegration(options?: DesktopIntegrationOptions): void;
