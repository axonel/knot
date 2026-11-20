export interface DesktopIntegrationOptions {
  home?: string;
  projectDir?: string;
  xdgDataHome?: string;
  binDir?: string;
}

export function installDesktopIntegration(options?: DesktopIntegrationOptions): {
  desktopFilePath: string;
  launcherPath: string;
};
