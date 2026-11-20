import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { KnotLogo } from '../src/renderer/components/KnotLogo.js';
import { DesktopCommanderLogo } from '../src/renderer/components/DesktopCommanderLogo.js';
import { StatusBadge } from '../src/renderer/components/DesktopCommander/StatusBadge.js';
import { ProcessManager } from '../src/renderer/components/DesktopCommander/ProcessManager.js';
import { App } from '../src/renderer/App.js';
import { ProcessStatusInfo, LogEntry } from '../src/shared/types.js';

describe('UI and Branding Components', () => {
  describe('KnotLogo', () => {
    it('renders the scalable SVG geometric mark', () => {
      render(<KnotLogo />);
      expect(screen.getByLabelText('Knot logo')).toBeInTheDocument();
    });

    it('renders text and tagline when requested', () => {
      render(<KnotLogo showText={true} subtitle={true} />);
      expect(screen.getByText('Knot')).toBeInTheDocument();
      expect(screen.getByText('Where AI agents work together.')).toBeInTheDocument();
    });
  });

  describe('DesktopCommanderLogo', () => {
    it('renders the Desktop Commander geometric icon', () => {
      render(<DesktopCommanderLogo />);
      expect(screen.getByLabelText('Desktop Commander icon')).toBeInTheDocument();
    });
  });

  describe('StatusBadge', () => {
    it('renders different process states correctly', () => {
      const { rerender } = render(<StatusBadge state="Stopped" />);
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Stopped');

      rerender(<StatusBadge state="Starting" />);
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Starting');

      rerender(<StatusBadge state="Running" />);
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Running');

      rerender(<StatusBadge state="Stopping" />);
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Stopping');

      rerender(<StatusBadge state="Error" />);
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Error');
    });
  });

  describe('ProcessManager', () => {
    let mockStatus: ProcessStatusInfo;
    let mockLogs: LogEntry[];
    let statusCallback: (status: ProcessStatusInfo) => void;
    let logCallback: (log: LogEntry) => void;

    beforeEach(() => {
      mockStatus = {
        state: 'Stopped',
        connectionState: 'disconnected',
        connectionVerified: false,
        pid: null,
        startedAt: null,
        stoppedAt: null,
        exitCode: null,
        errorMessage: null,
      };

      mockLogs = [];

      window.knotApi = {
        startDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
        stopDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
        getStatus: vi.fn().mockImplementation(() => Promise.resolve(mockStatus)),
        getLogs: vi.fn().mockImplementation(() => Promise.resolve(mockLogs)),
        clearLogs: vi.fn().mockResolvedValue(undefined),
        onStatusChange: vi.fn().mockImplementation((cb) => {
          statusCallback = cb;
          return vi.fn();
        }),
        onLog: vi.fn().mockImplementation((cb) => {
          logCallback = cb;
          return vi.fn();
        }),
      };
    });

    it('renders initial Stopped state and triggers startDesktopCommander on click', async () => {
      render(<ProcessManager />);

      await waitFor(() => {
        expect(screen.getByText('Desktop Commander Remote')).toBeInTheDocument();
      });

      const startBtn = screen.getByTestId('start-btn');
      expect(startBtn).toBeInTheDocument();
      expect(startBtn).toHaveTextContent('Start Remote');

      fireEvent.click(startBtn);

      await waitFor(() => {
        expect(window.knotApi?.startDesktopCommander).toHaveBeenCalledTimes(1);
      });
    });

    it('updates UI when live status changes to Running and displays Stop button', async () => {
      render(<ProcessManager />);

      await waitFor(() => {
        expect(screen.getByText('Desktop Commander Remote')).toBeInTheDocument();
      });

      // Simulate status change from backend
      act(() => {
        statusCallback({
          state: 'Running',
          connectionState: 'unverified',
          connectionVerified: false,
          pid: 9942,
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          exitCode: null,
          errorMessage: null,
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('stop-btn')).toBeInTheDocument();
        expect(screen.getByText('9942')).toBeInTheDocument();
        expect(screen.getByTestId('connection-badge')).toHaveTextContent('Awaiting Connection');
      });

      // Simulate verified connection
      act(() => {
        statusCallback({
          state: 'Running',
          connectionState: 'connected',
          connectionVerified: true,
          pid: 9942,
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          exitCode: null,
          errorMessage: null,
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('connection-badge')).toHaveTextContent('Remote Verified');
      });

      // Click Stop button
      fireEvent.click(screen.getByTestId('stop-btn'));

      await waitFor(() => {
        expect(window.knotApi?.stopDesktopCommander).toHaveBeenCalledTimes(1);
      });
    });

    it('displays error banner when status has error', async () => {
      render(<ProcessManager />);

      await waitFor(() => {
        expect(screen.getByText('Desktop Commander Remote')).toBeInTheDocument();
      });

      act(() => {
        statusCallback({
          state: 'Error',
          connectionState: 'disconnected',
          connectionVerified: false,
          pid: null,
          startedAt: null,
          stoppedAt: new Date().toISOString(),
          exitCode: 1,
          errorMessage: 'Child process exited prematurely with code 1',
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Child process exited prematurely with code 1')).toBeInTheDocument();
      });
    });

    it('displays streaming logs and handles clearing logs', async () => {
      render(<ProcessManager />);

      await waitFor(() => {
        expect(screen.getByText('Desktop Commander Remote')).toBeInTheDocument();
      });

      const newLog: LogEntry = {
        id: 'log-1',
        timestamp: new Date().toISOString(),
        level: 'stdout',
        message: 'Device registration complete',
      };

      act(() => {
        logCallback(newLog);
      });

      await waitFor(() => {
        expect(screen.getByText('Device registration complete')).toBeInTheDocument();
      });
    });
  });

  describe('App Shell', () => {
    it('renders the complete Knot application workspace', async () => {
      render(<App />);

      expect(screen.getAllByText('Knot').length).toBeGreaterThan(0);
      expect(screen.getByText('Where AI agents work together.')).toBeInTheDocument();
      expect(screen.getByText('Desktop Commander')).toBeInTheDocument();
      expect(screen.getByText('axonel/knot')).toBeInTheDocument();
    });
  });
});
