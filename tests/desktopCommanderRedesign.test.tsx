import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ProcessManager } from '../src/renderer/components/DesktopCommander/ProcessManager.js';
import { App } from '../src/renderer/App.js';
import { ProcessStatusInfo, LogEntry } from '../src/shared/types.js';

function createFullMockKnotApi() {
  return {
    startDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    stopDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn().mockResolvedValue({
      state: 'Stopped' as const,
      connectionState: 'disconnected' as const,
      connectionVerified: false,
      pid: null,
      startedAt: null,
      stoppedAt: null,
      exitCode: null,
      errorMessage: null,
    }),
    getLogs: vi.fn().mockResolvedValue([]),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn().mockReturnValue(vi.fn()),
    onLog: vi.fn().mockReturnValue(vi.fn()),
    projects: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'p-1', trustPolicy: 'approval_required' }),
      update: vi.fn().mockResolvedValue({ id: 'p-1' }),
      updateTrustPolicy: vi.fn().mockResolvedValue({ id: 'p-1' }),
      archive: vi.fn().mockResolvedValue({ id: 'p-1' }),
      unarchive: vi.fn().mockResolvedValue({ id: 'p-1' }),
      selectDirectory: vi.fn().mockResolvedValue('/mock/path'),
    },
    sessions: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 's-1', status: 'active' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 's-1' }),
      updateTitle: vi.fn().mockResolvedValue({ id: 's-1' }),
    },
    messages: {
      list: vi.fn().mockResolvedValue([]),
      append: vi.fn().mockResolvedValue({ id: 'm-1' }),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 't-1' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 't-1' }),
    },
    events: {
      list: vi.fn().mockResolvedValue([]),
      append: vi.fn().mockResolvedValue({ id: 'e-1' }),
      getTaskTrace: vi.fn().mockResolvedValue(null),
      exportTaskTrace: vi.fn().mockResolvedValue(''),
    },
    bridge: {
      getStatus: vi.fn().mockResolvedValue({
        state: 'configured',
        pairingVerified: true,
        bridgeRoot: '/tmp/bridge',
        activeSessions: [],
        watchedSessions: [],
        latestDispatchedTask: null,
        latestPublishedResult: null,
        unreadResultsCount: 0,
        allowedDirectories: [],
      }),
      listMessages: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue({ success: true }),
      syncInbox: vi.fn().mockResolvedValue({ success: true, processedMessages: 0, acknowledgedResults: 0 }),
      startChallenge: vi.fn().mockResolvedValue({ challengeToken: 'test-challenge' }),
      watchSession: vi.fn().mockResolvedValue(true),
      unwatchSession: vi.fn().mockResolvedValue(true),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      getInboxWatcherStatus: vi.fn().mockResolvedValue({ activeWatchers: [], isWatching: false }),
    },
    antigravity: {
      getStatus: vi.fn().mockResolvedValue({
        isInstalled: true,
        binaryPath: '/usr/bin/agy',
        processState: 'idle',
        activePid: null,
        activeSessionId: null,
        conversationId: null,
        cwd: '/tmp',
        lastExitCode: null,
        mode: 'planner',
      }),
      setMode: vi.fn().mockResolvedValue(true),
      startSession: vi.fn().mockResolvedValue({ success: true }),
      sendPrompt: vi.fn().mockResolvedValue({ success: true, turnId: 'turn-1' }),
      cancelExecution: vi.fn().mockResolvedValue(true),
      resumeSession: vi.fn().mockResolvedValue(true),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    orchestration: {
      approveTask: vi.fn().mockResolvedValue({ id: 't-1', status: 'queued', approvalStatus: 'approved' }),
      rejectTask: vi.fn().mockResolvedValue({ id: 't-1', status: 'cancelled', approvalStatus: 'rejected' }),
      cancelTask: vi.fn().mockResolvedValue({ id: 't-1', status: 'cancelled' }),
      retryTask: vi.fn().mockResolvedValue({ id: 't-1', status: 'queued', retryCount: 1 }),
      listTasks: vi.fn().mockResolvedValue([]),
      listQueued: vi.fn().mockResolvedValue([]),
      getRunningTask: vi.fn().mockResolvedValue(null),
      dispatchNext: vi.fn().mockResolvedValue(null),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    context: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      addRevision: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      archive: vi.fn().mockResolvedValue(true),
      unarchive: vi.fn().mockResolvedValue(true),
      getDiff: vi.fn().mockResolvedValue(null),
    },
    taskApproval: {
      approveTask: vi.fn().mockResolvedValue({ success: true }),
      rejectTask: vi.fn().mockResolvedValue({ success: true }),
      cancelTask: vi.fn().mockResolvedValue({ success: true }),
      onTaskStateChange: vi.fn().mockReturnValue(vi.fn()),
    },
  };
}

describe('Desktop Commander Page Redesign', () => {
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

    const baseMock = createFullMockKnotApi();
    window.knotApi = {
      ...baseMock,
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
    } as any;
  });

  it('renders Desktop Commander page heading, subtitle, and process controls', async () => {
    render(<ProcessManager />);

    await waitFor(() => {
      // 1. Page Title & Subtitle
      expect(screen.getByRole('heading', { level: 1, name: 'Desktop Commander' })).toBeInTheDocument();
      expect(screen.getByText('Manage the local Desktop Commander Remote connection and inspect its runtime activity.')).toBeInTheDocument();

      // 2. Managed Process Identity
      expect(screen.getByRole('heading', { level: 2, name: 'Desktop Commander Remote' })).toBeInTheDocument();
      expect(screen.getByText('Local Process')).toBeInTheDocument();

      // 3. Compact Telemetry
      expect(screen.getByText('Process ID')).toBeInTheDocument();
      expect(screen.getByText('State')).toBeInTheDocument();
      expect(screen.getByText('Last Started')).toBeInTheDocument();
      expect(screen.getByText('Last Stopped')).toBeInTheDocument();

      // 4. Primary Start Action
      const startBtn = screen.getByTestId('start-btn');
      expect(startBtn).toBeInTheDocument();
      expect(startBtn).toHaveTextContent('Start Remote');

      // 5. Diagnostic Logs Workspace
      expect(screen.getByText('Diagnostic Logs')).toBeInTheDocument();
      expect(screen.getByText('No diagnostic output yet')).toBeInTheDocument();
    });
  });

  it('does NOT contain Multi-Agent Architecture, Process Isolation cards, or Log Sanitization cards', async () => {
    render(<ProcessManager />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Desktop Commander' })).toBeInTheDocument();
    });

    // Verify completely removed
    expect(screen.queryByText('Multi-Agent Architecture')).not.toBeInTheDocument();
    expect(screen.queryByText('Process Isolation')).not.toBeInTheDocument();
    expect(screen.queryByText('Log Sanitization')).not.toBeInTheDocument();
  });

  it('switches to Running state and renders Stop button with connection badge', async () => {
    render(<ProcessManager />);

    await waitFor(() => {
      expect(screen.getByTestId('start-btn')).toBeInTheDocument();
    });

    act(() => {
      statusCallback({
        state: 'Running',
        connectionState: 'connected',
        connectionVerified: true,
        pid: 24680,
        startedAt: new Date().toISOString(),
        stoppedAt: null,
        exitCode: null,
        errorMessage: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('stop-btn')).toBeInTheDocument();
      expect(screen.getByText('24680')).toBeInTheDocument();
      expect(screen.getByTestId('connection-badge')).toHaveTextContent('Remote Verified');
    });

    // Click Stop button opens StopProcessModal
    fireEvent.click(screen.getByTestId('stop-btn'));

    await waitFor(() => {
      expect(screen.getByText('Confirm Process Termination')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-stop-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirm-stop-btn'));

    await waitFor(() => {
      expect(window.knotApi?.stopDesktopCommander).toHaveBeenCalledTimes(1);
    });
  });

  it('streams logs with levels and supports filters and clear buffer', async () => {
    render(<ProcessManager />);

    await waitFor(() => {
      expect(screen.getByText('Diagnostic Logs')).toBeInTheDocument();
    });

    const stdoutLog: LogEntry = {
      id: 'log-1',
      timestamp: new Date().toISOString(),
      level: 'stdout',
      message: 'Desktop Commander Remote listening on port 8080',
    };
    const stderrLog: LogEntry = {
      id: 'log-2',
      timestamp: new Date().toISOString(),
      level: 'stderr',
      message: 'Experimental warning: feature enabled',
    };

    act(() => {
      logCallback(stdoutLog);
      logCallback(stderrLog);
    });

    await waitFor(() => {
      expect(screen.getByText('Desktop Commander Remote listening on port 8080')).toBeInTheDocument();
      expect(screen.getByText('Experimental warning: feature enabled')).toBeInTheDocument();
    });

    // Test stderr filter
    const stderrBtn = screen.getByRole('button', { name: 'stderr' });
    fireEvent.click(stderrBtn);

    await waitFor(() => {
      expect(screen.queryByText('Desktop Commander Remote listening on port 8080')).not.toBeInTheDocument();
      expect(screen.getByText('Experimental warning: feature enabled')).toBeInTheDocument();
    });

    // Test stdout filter
    const stdoutBtn = screen.getByRole('button', { name: 'stdout' });
    fireEvent.click(stdoutBtn);

    await waitFor(() => {
      expect(screen.getByText('Desktop Commander Remote listening on port 8080')).toBeInTheDocument();
      expect(screen.queryByText('Experimental warning: feature enabled')).not.toBeInTheDocument();
    });

    // Reset to all
    const allBtn = screen.getByRole('button', { name: 'all' });
    fireEvent.click(allBtn);

    await waitFor(() => {
      expect(screen.getByText('Desktop Commander Remote listening on port 8080')).toBeInTheDocument();
      expect(screen.getByText('Experimental warning: feature enabled')).toBeInTheDocument();
    });
  });

  it('renders Desktop Commander tab in App shell with correct Header title and without static architecture cards', async () => {
    render(<App />);

    // Click on Desktop Commander nav item
    const dcNavBtn = screen.getByRole('button', { name: /Desktop Commander/ });
    fireEvent.click(dcNavBtn);

    await waitFor(() => {
      // Header shows Desktop Commander
      expect(screen.getAllByText('Desktop Commander').length).toBeGreaterThan(1);
      // Main heading
      expect(screen.getByRole('heading', { level: 1, name: 'Desktop Commander' })).toBeInTheDocument();
      // Architecture section is not present
      expect(screen.queryByText('Multi-Agent Architecture')).not.toBeInTheDocument();
    });
  });
});
