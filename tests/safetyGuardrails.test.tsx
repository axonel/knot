import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react';
import type { Task, Session, Project } from '../src/shared/types.js';
import { AntigravityExecutionPanel } from '../src/renderer/components/Workspace/AntigravityExecutionPanel.js';
import { TaskApprovalPreview } from '../src/renderer/components/Workspace/TaskApprovalPreview.js';
import { StopProcessModal } from '../src/renderer/components/Safety/StopProcessModal.js';
import { UndoNotificationBanner } from '../src/renderer/components/Safety/UndoNotificationBanner.js';
import { CollaborationWorkspace } from '../src/renderer/components/Workspace/CollaborationWorkspace.js';
import { useTaskUndoManager } from '../src/renderer/hooks/useTaskUndoManager.js';

function createMockKnotApi(tasksOverride: Task[] = []) {
  const dummyProject: Project = {
    id: 'p-safety-1',
    name: 'Safety Test Project',
    repositoryPath: '/mock/repos/safety-test',
    repositoryRemote: 'git@github.com:axonel/knot.git',
    trustPolicy: 'approval_required',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
  };

  const dummySession: Session = {
    id: 's-safety-1',
    projectId: 'p-safety-1',
    title: 'Safety Guardrails Session',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    metadata: null,
  };

  const defaultTasks: Task[] = tasksOverride;

  return {
    startDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    stopDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn().mockResolvedValue({
      state: 'Running' as const,
      connectionState: 'connected' as const,
      connectionVerified: true,
      pid: 9942,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      errorMessage: null,
    }),
    getLogs: vi.fn().mockResolvedValue([]),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn().mockReturnValue(vi.fn()),
    onLog: vi.fn().mockReturnValue(vi.fn()),
    projects: {
      list: vi.fn().mockResolvedValue([dummyProject]),
      get: vi.fn().mockResolvedValue(dummyProject),
      create: vi.fn().mockResolvedValue(dummyProject),
      update: vi.fn(),
      updateTrustPolicy: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      selectDirectory: vi.fn().mockResolvedValue('/mock/selected'),
    },
    sessions: {
      list: vi.fn().mockResolvedValue([dummySession]),
      get: vi.fn().mockResolvedValue(dummySession),
      create: vi.fn().mockResolvedValue(dummySession),
      updateStatus: vi.fn(),
      updateTitle: vi.fn(),
    },
    messages: {
      list: vi.fn().mockResolvedValue([]),
      send: vi.fn(),
    },
    tasks: {
      list: vi.fn().mockResolvedValue(defaultTasks),
      get: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
    },
    events: {
      list: vi.fn().mockResolvedValue([]),
      listBySession: vi.fn().mockResolvedValue([]),
      append: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    bridge: {
      initSessionBridge: vi.fn().mockResolvedValue({
        projectDir: '/p',
        sessionDir: '/s',
        inboxDir: '/in',
        processedDir: '/proc',
        rejectedDir: '/rej',
        outboxDir: '/out',
        conversationFile: '/conv.md',
      }),
      getStatus: vi.fn().mockResolvedValue({
        workspaceInitialized: true,
        bridgeRoot: '/mock/bridge/v1',
        desktopCommanderRunning: true,
        mcpPermissionConfigured: true,
        handshakeState: 'verified',
        activeProjectId: dummyProject.id,
        activeSessionId: dummySession.id,
      }),
      startHandshakeTest: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      onStatusChange: vi.fn().mockReturnValue(vi.fn()),
      getInstructions: vi.fn().mockResolvedValue('Instructions'),
    },
    orchestration: {
      listTasks: vi.fn().mockImplementation(() => Promise.resolve(defaultTasks)),
      getRunningTask: vi.fn().mockImplementation(() => Promise.resolve(defaultTasks.find((t) => t.status === 'running') || null)),
      approveTask: vi.fn().mockResolvedValue(undefined),
      approveAndDispatch: vi.fn(),
      rejectTask: vi.fn().mockResolvedValue(undefined),
      cancelTask: vi.fn().mockResolvedValue(undefined),
      retryTask: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    antigravity: {
      getStatus: vi.fn().mockResolvedValue({
        state: 'ready',
        installed: true,
        authenticated: true,
        activeSessionId: dummySession.id,
        activeTurnId: null,
        pid: 7712,
      }),
      startTurn: vi.fn(),
      start: vi.fn().mockResolvedValue({ success: true }),
      stop: vi.fn().mockResolvedValue({ success: true }),
      interrupt: vi.fn(),
      resume: vi.fn().mockResolvedValue({ success: true }),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      onUiEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    context: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getHistory: vi.fn().mockResolvedValue([]),
      getResolved: vi.fn(),
      resolveConflicts: vi.fn(),
      revertRevision: vi.fn(),
      listConflicts: vi.fn().mockResolvedValue([]),
    },
    getGitStatusSummary: vi.fn().mockResolvedValue({
      branch: 'main',
      isClean: true,
      stagedFiles: [],
      unstagedFiles: [],
      untrackedFiles: [],
    }),
    getTaskGitDiff: vi.fn().mockResolvedValue({ files: [] }),
  };
}

describe('P2 Safety Guardrails', () => {
  const dummySession: Session = {
    id: 's-safety-1',
    projectId: 'p-safety-1',
    title: 'Safety Guardrails Session',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    metadata: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 900 });
  });

  describe('1. Three-Second Undo Manager Hook (useTaskUndoManager)', () => {
    const sampleTask: Task = {
      id: 'task-hook-1',
      sessionId: 's-safety-1',
      title: 'Hook Test Task',
      description: 'Test task for undo manager',
      createdBy: 'chatgpt',
      assignedTo: 'antigravity',
      status: 'running',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    it('schedules action, counts down, and executes callback upon 3s expiry', () => {
      vi.useFakeTimers();
      const onExecute = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useTaskUndoManager(onExecute));

      expect(result.current.pendingActions).toHaveLength(0);
      expect(result.current.isTaskPending(sampleTask.id)).toBe(false);

      // Schedule action
      act(() => {
        result.current.scheduleAction(sampleTask, 'cancel', 3);
      });

      expect(result.current.pendingActions).toHaveLength(1);
      expect(result.current.isTaskPending(sampleTask.id)).toBe(true);
      expect(result.current.getPendingAction(sampleTask.id)?.secondsRemaining).toBe(3);
      expect(onExecute).not.toHaveBeenCalled();

      // Advance by 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.getPendingAction(sampleTask.id)?.secondsRemaining).toBe(2);
      expect(onExecute).not.toHaveBeenCalled();

      // Advance by remaining 2 seconds (total 3s)
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onExecute).toHaveBeenCalledWith(sampleTask.id, 'cancel');
      expect(result.current.pendingActions).toHaveLength(0);
      expect(result.current.isTaskPending(sampleTask.id)).toBe(false);

      vi.useRealTimers();
    });

    it('undoAction cancels timer and prevents callback execution', () => {
      vi.useFakeTimers();
      const onExecute = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useTaskUndoManager(onExecute));

      act(() => {
        result.current.scheduleAction(sampleTask, 'reject', 3);
      });

      expect(result.current.isTaskPending(sampleTask.id)).toBe(true);

      // Advance 1.5 seconds
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      // Undo
      act(() => {
        result.current.undoAction(sampleTask.id);
      });

      expect(result.current.isTaskPending(sampleTask.id)).toBe(false);

      // Advance past 3 seconds
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onExecute).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('prevents duplicate scheduling for the same task', () => {
      vi.useFakeTimers();
      const onExecute = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useTaskUndoManager(onExecute));

      act(() => {
        result.current.scheduleAction(sampleTask, 'cancel', 3);
      });
      act(() => {
        result.current.scheduleAction(sampleTask, 'cancel', 3);
      });

      expect(result.current.pendingActions).toHaveLength(1);

      vi.useRealTimers();
    });
  });

  describe('2. Three-Second Undo UI in AntigravityExecutionPanel', () => {
    const runningTask: Task = {
      id: 'task-cancel-ui',
      sessionId: dummySession.id,
      title: 'Run Heavy Pipeline Migration',
      description: 'Executes automated migration on files',
      createdBy: 'chatgpt',
      assignedTo: 'antigravity',
      status: 'running',
      approvalStatus: 'approved',
      priority: 'high',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    const awaitingTask: Task = {
      id: 'task-reject-ui',
      sessionId: dummySession.id,
      title: 'Deploy to Production Cluster',
      description: 'Performs release deployment',
      createdBy: 'chatgpt',
      assignedTo: 'antigravity',
      status: 'awaiting_approval',
      approvalStatus: 'awaiting_approval',
      priority: 'urgent',
      payload: {
        policyCategory: 'sensitive',
        policyReason: 'Production deployment requires explicit review',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    it('clicking Cancel on running task schedules cancellation and provides Undo button', async () => {
      window.knotApi = createMockKnotApi([runningTask]) as any;

      render(<AntigravityExecutionPanel session={dummySession} />);

      await waitFor(() => {
        expect(screen.getByTestId('highlighted-task-card-task-cancel-ui')).toBeInTheDocument();
      });

      const cancelBtn = screen.getByTestId('cancel-task-btn');
      fireEvent.click(cancelBtn);

      // Verify cancellation is scheduled
      expect(screen.getByText(/Cancellation Scheduled/i)).toBeInTheDocument();
      expect(screen.getByTestId('undo-cancellation-btn')).toBeInTheDocument();
      expect(window.knotApi!.orchestration.cancelTask).not.toHaveBeenCalled();

      // Click Undo
      fireEvent.click(screen.getByTestId('undo-cancellation-btn'));

      // Verify cancellation reverted
      expect(screen.queryByText(/Cancellation Scheduled/i)).not.toBeInTheDocument();
      expect(window.knotApi!.orchestration.cancelTask).not.toHaveBeenCalled();
    });

    it('clicking Reject on awaiting task schedules rejection and provides Undo button', async () => {
      window.knotApi = createMockKnotApi([awaitingTask]) as any;

      render(<AntigravityExecutionPanel session={dummySession} />);

      await waitFor(() => {
        expect(screen.getByTestId('highlighted-task-card-task-reject-ui')).toBeInTheDocument();
      });

      const rejectBtn = screen.getByTestId('reject-task-btn');
      fireEvent.click(rejectBtn);

      // Verify rejection is scheduled
      expect(screen.getByText(/Rejection Scheduled/i)).toBeInTheDocument();
      expect(screen.getByTestId('undo-rejection-btn')).toBeInTheDocument();
      expect(window.knotApi!.orchestration.rejectTask).not.toHaveBeenCalled();

      // Click Undo
      fireEvent.click(screen.getByTestId('undo-rejection-btn'));

      // Verify rejection reverted
      expect(screen.queryByText(/Rejection Scheduled/i)).not.toBeInTheDocument();
      expect(window.knotApi!.orchestration.rejectTask).not.toHaveBeenCalled();
    });
  });

  describe('3. Undo Notification Banner Component', () => {
    it('renders countdown, warning notice, and allows undoing pending task', () => {
      const onUndo = vi.fn();
      const pendingActions = [
        {
          taskId: 'task-100',
          taskTitle: 'Delete Cache Tables',
          actionType: 'cancel' as const,
          secondsRemaining: 3,
          totalSeconds: 3,
          scheduledAt: Date.now(),
          expiresAt: Date.now() + 3000,
        },
      ];

      render(<UndoNotificationBanner pendingActions={pendingActions} onUndo={onUndo} />);

      expect(screen.getByRole('region')).toBeInTheDocument();
      expect(screen.getByText('Cancellation Scheduled')).toBeInTheDocument();
      expect(screen.getByText('3s')).toBeInTheDocument();
      expect(screen.getByText('Delete Cache Tables')).toBeInTheDocument();

      const undoBtn = screen.getByTestId('undo-btn-task-100');
      fireEvent.click(undoBtn);
      expect(onUndo).toHaveBeenCalledWith('task-100');
    });
  });

  describe('4. Stop Process Confirmation Modal', () => {
    it('renders full process telemetry, distinction between stop and restart, and fallback escalation policy', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <StopProcessModal
          isOpen={true}
          processDetails={{
            name: 'Desktop Commander Remote',
            processType: 'desktop_commander',
            state: 'Running',
            pid: 12345,
          }}
          onConfirmStop={onConfirm}
          onCancel={onCancel}
        />
      );

      // Verify identification and telemetry
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Desktop Commander Remote')).toBeInTheDocument();
      expect(screen.getByText(/PID: 12345/)).toBeInTheDocument();

      // Verify explicit stop distinction
      expect(screen.getByText(/Explicit Stop Operation • No Automatic Restart/i)).toBeInTheDocument();

      // Verify graceful termination and timeout escalation policy
      expect(screen.getByText(/Termination & Escalation Policy/i)).toBeInTheDocument();
      expect(screen.getByText(/SIGINT/)).toBeInTheDocument();
      expect(screen.getByText(/SIGKILL/)).toBeInTheDocument();

      // Verify connection impact
      expect(screen.getByText(/Active MCP client connections/i)).toBeInTheDocument();
    });

    it('Esc key closes modal safely without stopping process', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <StopProcessModal
          isOpen={true}
          processDetails={{
            name: 'Antigravity Implementation Worker',
            processType: 'antigravity',
            state: 'Running',
            pid: 6789,
          }}
          onConfirmStop={onConfirm}
          onCancel={onCancel}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('Cancel button keeps process running without stopping', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <StopProcessModal
          isOpen={true}
          processDetails={{
            name: 'Desktop Commander Remote',
            processType: 'desktop_commander',
            state: 'Running',
            pid: 12345,
          }}
          onConfirmStop={onConfirm}
          onCancel={onCancel}
        />
      );

      const cancelBtn = screen.getByTestId('cancel-stop-btn');
      fireEvent.click(cancelBtn);

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('Confirming Stop triggers termination callback and prevents duplicate clicks', async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const { rerender } = render(
        <StopProcessModal
          isOpen={true}
          isStopping={false}
          processDetails={{
            name: 'Desktop Commander Remote',
            processType: 'desktop_commander',
            state: 'Running',
            pid: 12345,
          }}
          onConfirmStop={onConfirm}
          onCancel={onCancel}
        />
      );

      const confirmBtn = screen.getByTestId('confirm-stop-btn');
      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledTimes(1);

      // Rerender as isStopping=true
      rerender(
        <StopProcessModal
          isOpen={true}
          isStopping={true}
          processDetails={{
            name: 'Desktop Commander Remote',
            processType: 'desktop_commander',
            state: 'Stopping',
            pid: 12345,
          }}
          onConfirmStop={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(confirmBtn).toBeDisabled();
      expect(screen.getByText('Stopping Process...')).toBeInTheDocument();
    });
  });

  describe('5. Pre-Execution Proposal Preview', () => {
    it('displays actual proposed commands, file paths, and risk policy when present', () => {
      const taskWithData: Task = {
        id: 'task-preview-1',
        sessionId: dummySession.id,
        title: 'Run DB Migrations',
        description: 'Updates schema and generates artifacts',
        createdBy: 'chatgpt',
        assignedTo: 'antigravity',
        status: 'awaiting_approval',
        approvalStatus: 'awaiting_approval',
        priority: 'high',
        executionMode: 'direct',
        payload: {
          policyCategory: 'sensitive',
          policyReason: 'Modifying database schema requires approval',
          commands: ['npm run db:migrate', 'npm run generate'],
          files: ['src/db/schema.ts', 'migrations/002.sql'],
        },
        acceptanceCriteria: ['All migrations apply cleanly'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };

      render(<TaskApprovalPreview task={taskWithData} defaultExpanded={true} />);

      // Verify unexecuted disclaimer
      expect(screen.getByTestId('preview-proposal-disclaimer')).toBeInTheDocument();
      expect(screen.getByText(/Planned Proposal • Unexecuted/i)).toBeInTheDocument();

      // Verify risk policy reason
      expect(screen.getByText(/Modifying database schema requires approval/)).toBeInTheDocument();

      // Verify commands
      expect(screen.getByText('npm run db:migrate')).toBeInTheDocument();
      expect(screen.getByText('npm run generate')).toBeInTheDocument();

      // Verify files
      expect(screen.getByText('src/db/schema.ts')).toBeInTheDocument();
      expect(screen.getByText('migrations/002.sql')).toBeInTheDocument();

      // Verify criteria
      expect(screen.getByText('All migrations apply cleanly')).toBeInTheDocument();
    });

    it('displays explicit "None declared in task payload" for missing commands and files', () => {
      const bareTask: Task = {
        id: 'task-preview-bare',
        sessionId: dummySession.id,
        title: 'Review Project Documentation',
        description: 'Inspect README overview',
        createdBy: 'chatgpt',
        assignedTo: 'antigravity',
        status: 'awaiting_approval',
        approvalStatus: 'awaiting_approval',
        priority: 'normal',
        payload: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };

      render(<TaskApprovalPreview task={bareTask} defaultExpanded={true} />);

      expect(screen.getByTestId('preview-no-commands')).toHaveTextContent(
        'No specific shell commands declared in task payload'
      );
      expect(screen.getByTestId('preview-no-files')).toHaveTextContent(
        'No specific file paths declared in task payload'
      );
    });

    it('supports collapsing and expanding proposal details', () => {
      const bareTask: Task = {
        id: 'task-preview-toggle',
        sessionId: dummySession.id,
        title: 'Simple Task',
        description: null,
        createdBy: 'chatgpt',
        assignedTo: 'antigravity',
        status: 'awaiting_approval',
        approvalStatus: 'awaiting_approval',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };

      render(<TaskApprovalPreview task={bareTask} defaultExpanded={true} />);

      expect(screen.getByTestId('preview-proposal-disclaimer')).toBeInTheDocument();

      // Toggle collapse
      fireEvent.click(screen.getByTestId('approval-preview-toggle-task-preview-toggle'));
      expect(screen.queryByTestId('preview-proposal-disclaimer')).not.toBeInTheDocument();

      // Toggle expand again
      fireEvent.click(screen.getByTestId('approval-preview-toggle-task-preview-toggle'));
      expect(screen.getByTestId('preview-proposal-disclaimer')).toBeInTheDocument();
    });
  });

  describe('6. Integration with Keyboard & Ctrl+Enter Safety', () => {
    it('Ctrl+Enter does NOT approve a task that has a scheduled rejection pending', async () => {
      const awaitingTask: Task = {
        id: 'task-reject-ctrl-enter',
        sessionId: dummySession.id,
        title: 'Delete Production Database',
        description: 'Dangerous task',
        createdBy: 'chatgpt',
        assignedTo: 'antigravity',
        status: 'awaiting_approval',
        approvalStatus: 'awaiting_approval',
        priority: 'urgent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      };

      window.knotApi = createMockKnotApi([awaitingTask]) as any;

      render(<CollaborationWorkspace />);

      await waitFor(() => {
        expect(screen.getByTestId('highlighted-task-card-task-reject-ctrl-enter')).toBeInTheDocument();
      });

      // User clicks Reject, scheduling a 3-second rejection
      const rejectBtn = screen.getByTestId('reject-task-btn');
      fireEvent.click(rejectBtn);

      expect(screen.getAllByText(/Rejection Scheduled/i).length).toBeGreaterThanOrEqual(1);

      // Press Ctrl+Enter
      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

      // Approval must be strictly blocked while task is scheduled for rejection
      expect(window.knotApi!.orchestration.approveTask).not.toHaveBeenCalled();
    });
  });
});
