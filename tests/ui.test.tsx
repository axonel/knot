import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { KnotLogo } from '../src/renderer/components/KnotLogo.js';
import { DesktopCommanderLogo } from '../src/renderer/components/DesktopCommanderLogo.js';
import { StatusBadge } from '../src/renderer/components/DesktopCommander/StatusBadge.js';
import { ProcessManager } from '../src/renderer/components/DesktopCommander/ProcessManager.js';
import { StatusPill } from '../src/renderer/components/ProjectManager/StatusPill.js';
import { ProjectList } from '../src/renderer/components/ProjectManager/ProjectList.js';
import { ProjectDetail } from '../src/renderer/components/ProjectManager/ProjectDetail.js';
import { SessionDetail } from '../src/renderer/components/ProjectManager/SessionDetail.js';
import { App } from '../src/renderer/App.js';
import { ConnectionStatusCard } from '../src/renderer/components/Bridge/ConnectionStatusCard.js';
import { HandshakeModal } from '../src/renderer/components/Bridge/HandshakeModal.js';
import { BridgeMessagesPanel } from '../src/renderer/components/Bridge/BridgeMessagesPanel.js';
import { AgentStatusCard } from '../src/renderer/components/Antigravity/AgentStatusCard.js';
import { ConversationTimeline } from '../src/renderer/components/Antigravity/ConversationTimeline.js';
import { Composer } from '../src/renderer/components/Antigravity/Composer.js';
import { CollaborationWorkspace } from '../src/renderer/components/Workspace/CollaborationWorkspace.js';
import { ChatGptActivityPanel } from '../src/renderer/components/Workspace/ChatGptActivityPanel.js';
import { AntigravityExecutionPanel } from '../src/renderer/components/Workspace/AntigravityExecutionPanel.js';
import { SharedConversationPanel } from '../src/renderer/components/Workspace/SharedConversationPanel.js';
import { DirectoryAccessDiagnostic } from '../src/renderer/components/Workspace/DirectoryAccessDiagnostic.js';
import { ProcessStatusInfo, LogEntry, Project, Session, Message, BridgeStatusInfo, AntigravityStatus } from '../src/shared/types.js';

function createMockKnotApi() {
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
      create: vi.fn().mockImplementation((d) => Promise.resolve({ id: 'p-1', trustPolicy: 'approval_required', ...d, createdAt: '', updatedAt: '', archivedAt: null, sessionCount: 0 })),
      update: vi.fn().mockImplementation((id, d) => Promise.resolve({ id, trustPolicy: 'approval_required', ...d, createdAt: '', updatedAt: '', archivedAt: null, sessionCount: 0 })),
      updateTrustPolicy: vi.fn().mockImplementation((id, trustPolicy) => Promise.resolve({ id, name: 'P', trustPolicy, repositoryPath: null, repositoryRemote: null, createdAt: '', updatedAt: '', archivedAt: null, sessionCount: 0 })),
      archive: vi.fn().mockImplementation((id) => Promise.resolve({ id, name: 'Archived', trustPolicy: 'approval_required', repositoryPath: null, repositoryRemote: null, createdAt: '', updatedAt: '', archivedAt: new Date().toISOString(), sessionCount: 0 })),
      unarchive: vi.fn().mockImplementation((id) => Promise.resolve({ id, name: 'Active', trustPolicy: 'approval_required', repositoryPath: null, repositoryRemote: null, createdAt: '', updatedAt: '', archivedAt: null, sessionCount: 0 })),
      selectDirectory: vi.fn().mockResolvedValue('/mock/path'),
    },
    sessions: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((d) => Promise.resolve({ id: 's-1', ...d, status: 'active', createdAt: '', updatedAt: '', lastActivityAt: '', startedAt: '', endedAt: null, metadata: null })),
      updateStatus: vi.fn().mockImplementation((id, status) => Promise.resolve({ id, projectId: 'p-1', title: 'S', status, createdAt: '', updatedAt: '', lastActivityAt: '', startedAt: '', endedAt: null, metadata: null })),
      updateTitle: vi.fn().mockImplementation((id, title) => Promise.resolve({ id, projectId: 'p-1', title, status: 'active', createdAt: '', updatedAt: '', lastActivityAt: '', startedAt: '', endedAt: null, metadata: null })),
    },
    messages: {
      list: vi.fn().mockResolvedValue([]),
      append: vi.fn().mockImplementation((d) => Promise.resolve({ id: 'm-1', ...d, sequence: 1, createdAt: '' })),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((d) => Promise.resolve({ id: 't-1', ...d, status: 'pending', createdAt: '', updatedAt: '', startedAt: null, completedAt: null, payload: null })),
      updateStatus: vi.fn().mockImplementation((id, status) => Promise.resolve({ id, sessionId: 's-1', title: 'T', status, createdAt: '', updatedAt: '', startedAt: null, completedAt: null, payload: null })),
    },
    events: {
      list: vi.fn().mockResolvedValue([]),
      append: vi.fn().mockImplementation((d) => Promise.resolve({ id: 'e-1', ...d, createdAt: '' })),
      getTaskTrace: vi.fn().mockResolvedValue({
        task: { id: 't-1', sessionId: 's-1', title: 'Task 1', status: 'succeeded', createdAt: '', updatedAt: '', startedAt: null, completedAt: null, payload: null },
        events: [],
        stages: [],
        summary: {
          taskId: 't-1',
          taskTitle: 'Task 1',
          status: 'succeeded',
          priority: 'normal',
          executionMode: 'default',
          assignedAt: '',
          dispatchedAt: null,
          completedAt: null,
          totalDurationMs: null,
          queueDurationMs: null,
          executionDurationMs: null,
          isApproved: true,
          approver: null,
          hasGitVerification: false,
          verifiedCommit: null,
          hasChatGptVerification: false,
          chatGptVerificationSummary: null,
        },
      }),
      exportTaskTrace: vi.fn().mockResolvedValue('# Task Execution Trace'),
    },
    bridge: {
      getStatus: vi.fn().mockResolvedValue({
        workspaceInitialized: true,
        bridgeRoot: '/mock/bridge/v1',
        exists: true,
        readable: true,
        writable: true,
        watcherActive: true,
        watchedSessionsCount: 1,
        watchedSessionIds: ['s-1'],
        desktopCommanderRunning: true,
        mcpPermissionConfigured: true,
        handshakeState: 'workspace_ready',
        activeProjectId: null,
        activeSessionId: null,
        lastInboundMessage: null,
        lastOutboundMessage: null,
      }),
      initSessionBridge: vi.fn().mockResolvedValue({
        projectDir: '/mock/bridge/v1/projects/p-1',
        sessionDir: '/mock/bridge/v1/projects/p-1/sessions/s-1',
        inboxDir: '/mock/bridge/v1/projects/p-1/sessions/s-1/inbox/chatgpt',
        processedDir: '/mock/bridge/v1/projects/p-1/sessions/s-1/processed/chatgpt',
        rejectedDir: '/mock/bridge/v1/projects/p-1/sessions/s-1/rejected/chatgpt',
        outboxDir: '/mock/bridge/v1/projects/p-1/sessions/s-1/outbox/knot',
        conversationFile: '/mock/bridge/v1/projects/p-1/sessions/s-1/conversation.md',
      }),
      sendMessage: vi.fn().mockImplementation((_p, s, c) =>
        Promise.resolve({
          id: 'm-out-1',
          sessionId: s,
          sequence: 1,
          sender: 'knot',
          recipient: 'chatgpt',
          messageType: 'text',
          contentMarkdown: c,
          correlationId: null,
          createdAt: new Date().toISOString(),
        })
      ),
      startConnectionTest: vi.fn().mockResolvedValue({
        id: 'chal-1',
        challengeId: 'knot-challenge-1234',
        projectId: 'p-1',
        sessionId: 's-1',
        outboxFilePath: '/mock/outbox/handshake.md',
        inboxExpectedFilePath: '/mock/inbox/handshake.md',
        instructions: 'Test instructions',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        status: 'pending',
      }),
      openDirectory: vi.fn().mockResolvedValue(true),
      getInstructions: vi.fn().mockResolvedValue({
        bridgeRoot: '/mock/bridge/v1',
        sessionDir: '/mock/bridge/v1/projects/p-1/sessions/s-1',
        inboxDir: '/mock/inbox',
        outboxDir: '/mock/outbox',
        allowedDirectoriesConfig: '{\n  "allowedDirectories": ["/mock/bridge/v1"]\n}',
        chatgptPrompt: 'ChatGPT prompt snippet',
      }),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    antigravity: {
      detect: vi.fn().mockResolvedValue({
        installed: true,
        executablePath: '/usr/bin/agy',
        version: '1.5.14',
        supportedModes: ['default', 'accept-edits', 'auto', 'plan'],
        supportsStreaming: true,
        supportsResumption: true,
        readiness: 'ready',
      }),
      getStatus: vi.fn().mockResolvedValue({
        sessionId: 's-1',
        state: 'ready',
        pid: 12345,
        cliConversationId: 'agy-conv-1',
        workingDirectory: '/home/user/project',
        executionMode: 'default',
        model: null,
        effort: null,
        lastStartedAt: new Date().toISOString(),
        lastExitCode: null,
        capabilities: {
          installed: true,
          executablePath: '/usr/bin/agy',
          version: '1.5.14',
          supportedModes: ['default', 'accept-edits', 'auto', 'plan'],
          supportsStreaming: true,
          supportsResumption: true,
          readiness: 'ready',
        },
        currentTurnPending: false,
        lastResult: null,
      }),
      start: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      interrupt: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      getHistory: vi.fn().mockResolvedValue([]),
      onEvent: vi.fn().mockReturnValue(() => {}),
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
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    git: {
      getTaskDiff: vi.fn().mockResolvedValue(null),
      getFileDiff: vi.fn().mockResolvedValue(null),
      getRepoStatus: vi.fn().mockResolvedValue(null),
    },
    context: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((d) =>
        Promise.resolve({
          id: 'ctx-1',
          ...d,
          currentRevision: 1,
          isArchived: false,
          requiresVerification: false,
          contentHash: 'hash',
          createdAt: '',
          updatedAt: '',
          archivedAt: null,
        })
      ),
      update: vi.fn().mockImplementation((id, d) =>
        Promise.resolve({
          id,
          ...d,
          currentRevision: 2,
          isArchived: false,
          requiresVerification: false,
          contentHash: 'hash2',
          createdAt: '',
          updatedAt: '',
          archivedAt: null,
        })
      ),
      archive: vi.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          isArchived: true,
          currentRevision: 1,
          requiresVerification: false,
          contentHash: 'hash',
          createdAt: '',
          updatedAt: '',
          archivedAt: new Date().toISOString(),
        })
      ),
      restore: vi.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          isArchived: false,
          currentRevision: 1,
          requiresVerification: false,
          contentHash: 'hash',
          createdAt: '',
          updatedAt: '',
          archivedAt: null,
        })
      ),
      getRevisions: vi.fn().mockResolvedValue([]),
      getRevision: vi.fn().mockResolvedValue(null),
      listConflicts: vi.fn().mockResolvedValue([]),
      resolveConflict: vi.fn().mockResolvedValue(undefined),
      getHandoff: vi.fn().mockResolvedValue(null),
      getManifest: vi.fn().mockResolvedValue(null),
    },
    reliability: {
      getDiagnostics: vi.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: { available: true, path: ':memory:', version: 7, walMode: true, busyTimeout: 5000 },
        bridge: { status: 'watching', activeWatchersCount: 1, watchedPaths: [], pendingInboundCount: 0, rejectedCount: 0 },
        orchestration: { activeProcessesCount: 0, runningTasksCount: 0, queuedTasksCount: 0, awaitingApprovalCount: 0, interruptedTasksCount: 0, pendingResultsPublicationCount: 0 },
        reconciliation: { lastReconciliationAt: new Date().toISOString(), lastDurationMs: 5, issuesDetectedTotal: 0, issuesRepairedTotal: 0 },
      }),
      reconcile: vi.fn().mockResolvedValue({
        id: 'mock-reconciliation',
        reconciledAt: new Date().toISOString(),
        durationMs: 5,
        tasksReconciled: 0,
        bridgeFilesReconciled: 0,
        contextDocsReconciled: 0,
        resultsReconciled: 0,
        issuesDetected: 0,
        issuesRepaired: 0,
        details: {
          interruptedTasksRecovered: [],
          archivedTasksCancelled: [],
          missedBridgeMessagesProcessed: [],
          reMaterializedContextFiles: [],
          contextDriftConflictsDetected: [],
          reMaterializedResultFiles: [],
          errors: [],
        },
      }),
    },
    security: {
      getDiagnostics: vi.fn().mockResolvedValue({
        status: 'enforced',
        timestamp: new Date().toISOString(),
        bridgeTrust: {
          mode: 'unauthenticated_filesystem',
          description: 'Bridge inbox files are unauthenticated local files.',
          senderIdentityGuaranteed: false,
        },
        projectTrust: {
          projectId: 'p-1',
          projectName: 'Mock Project',
          trustPolicy: 'approval_required',
          trustedProjectsCount: 0,
          approvalRequiredProjectsCount: 1,
        },
        taskAuthorization: {
          pendingApprovalsCount: 0,
          sensitivePolicy: 'Sensitive tasks require approval',
          contentHashIntegrityEnforced: true,
        },
        antigravityPermissions: {
          mode: 'native_interactive_permissions',
          dangerouslySkipPermissions: false,
          alwaysProceed: false,
          sandboxActive: true,
          nativePermissionsPreserved: true,
        },
        filesystemScope: {
          enforceRepositoryBoundaries: true,
          rejectSymlinkEscapes: true,
          maxMessageSizeBytes: 262144,
        },
        desktopCommander: {
          running: false,
          isolatedConfig: true,
          independentAccessControl: true,
        },
      }),
    },
  };
}

describe('UI and Branding Components', () => {
  beforeEach(() => {
    window.knotApi = createMockKnotApi();
  });

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
        ...createMockKnotApi(),
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

  describe('Project & Session Management UI', () => {
    describe('StatusPill', () => {
      it('renders session status variants correctly', () => {
        const { rerender } = render(<StatusPill status="active" type="session" />);
        expect(screen.getByTestId('status-pill')).toHaveTextContent('Active');

        rerender(<StatusPill status="paused" type="session" />);
        expect(screen.getByTestId('status-pill')).toHaveTextContent('Paused');

        rerender(<StatusPill status="completed" type="session" />);
        expect(screen.getByTestId('status-pill')).toHaveTextContent('Completed');

        rerender(<StatusPill status="archived" type="session" />);
        expect(screen.getByTestId('status-pill')).toHaveTextContent('Archived');
      });

      it('renders task status variants correctly', () => {
        const { rerender } = render(<StatusPill status="running" type="task" />);
        expect(screen.getByTestId('status-pill')).toHaveTextContent('Running');

        rerender(<StatusPill status="queued" type="task" />);
        expect(screen.getByTestId('status-pill')).toHaveTextContent('Queued');

        rerender(<StatusPill status="succeeded" type="task" />);
        expect(screen.getByTestId('status-pill')).toHaveTextContent('Succeeded');

        rerender(<StatusPill status="failed" type="task" />);
        expect(screen.getByTestId('status-pill')).toHaveTextContent('Failed');
      });
    });

    describe('ProjectList', () => {
      const mockProjects: Project[] = [
        {
          id: 'proj-1',
          name: 'Knot Main Repo',
          repositoryPath: '/home/user/workspace/knot',
          repositoryRemote: 'https://github.com/axonel/knot',
          trustPolicy: 'approval_required',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archivedAt: null,
          sessionCount: 3,
        },
        {
          id: 'proj-2',
          name: 'Archived Demo',
          repositoryPath: null,
          repositoryRemote: null,
          trustPolicy: 'approval_required',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archivedAt: new Date().toISOString(),
          sessionCount: 0,
        },
      ];

      it('renders empty state when no projects exist', () => {
        render(
          <ProjectList
            projects={[]}
            isLoading={false}
            onSelectProject={vi.fn()}
            onRefresh={vi.fn()}
          />
        );

        expect(screen.getByText('No projects found')).toBeInTheDocument();
        expect(screen.getByText('Create First Project')).toBeInTheDocument();
      });

      it('renders active projects and triggers selection on click', () => {
        const onSelect = vi.fn();
        render(
          <ProjectList
            projects={mockProjects}
            isLoading={false}
            onSelectProject={onSelect}
            onRefresh={vi.fn()}
          />
        );

        expect(screen.getByText('Knot Main Repo')).toBeInTheDocument();
        expect(screen.getByText('3 sessions')).toBeInTheDocument();
        expect(screen.queryByText('Archived Demo')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Knot Main Repo'));
        expect(onSelect).toHaveBeenCalledWith('proj-1');
      });

      it('opens New Project modal and creates a project', async () => {
        const onRefresh = vi.fn();
        render(
          <ProjectList
            projects={[]}
            isLoading={false}
            onSelectProject={vi.fn()}
            onRefresh={onRefresh}
          />
        );

        fireEvent.click(screen.getByTestId('new-project-btn'));
        expect(screen.getByPlaceholderText('e.g. knot or my-project')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('e.g. knot or my-project'), {
          target: { value: 'New Test Project' },
        });

        fireEvent.click(screen.getByText('Create Project'));

        await waitFor(() => {
          expect(window.knotApi?.projects.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'New Test Project' })
          );
          expect(onRefresh).toHaveBeenCalled();
        });
      });
    });

    describe('ProjectDetail', () => {
      const mockProject: Project = {
        id: 'proj-1',
        name: 'Knot Main Repo',
        repositoryPath: '/home/user/workspace/knot',
        repositoryRemote: 'https://github.com/axonel/knot',
        trustPolicy: 'approval_required',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archivedAt: null,
        sessionCount: 1,
      };

      const mockSessions: Session[] = [
        {
          id: 'sess-1',
          projectId: 'proj-1',
          title: 'Initial Development',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          endedAt: null,
          metadata: null,
        },
      ];

      it('renders project metadata, sessions, and triggers status change', async () => {
        (window.knotApi!.sessions.list as any).mockResolvedValue(mockSessions);

        render(
          <ProjectDetail
            project={mockProject}
            onBack={vi.fn()}
            onSelectSession={vi.fn()}
            onProjectUpdated={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText('Initial Development')).toBeInTheDocument();
        });

        const pauseBtn = screen.getByText('Pause');
        fireEvent.click(pauseBtn);

        await waitFor(() => {
          expect(window.knotApi?.sessions.updateStatus).toHaveBeenCalledWith('sess-1', 'paused');
        });
      });
    });

    describe('SessionDetail', () => {
      const mockSession: Session = {
        id: 'sess-1',
        projectId: 'proj-1',
        title: 'Session Alpha',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        endedAt: null,
        metadata: null,
      };

      it('renders session details and appends message', async () => {
        (window.knotApi!.sessions.get as any).mockResolvedValue(mockSession);
        (window.knotApi!.messages.list as any).mockResolvedValue([]);
        (window.knotApi!.tasks.list as any).mockResolvedValue([]);
        (window.knotApi!.events.list as any).mockResolvedValue([]);

        render(
          <SessionDetail
            sessionId="sess-1"
            onBack={vi.fn()}
            onSessionUpdated={vi.fn()}
          />
        );

        await waitFor(() => {
          expect(screen.getByText('Session Alpha')).toBeInTheDocument();
        });

        const textarea = screen.getByPlaceholderText('Type message content or notes here...');
        fireEvent.change(textarea, { target: { value: 'Testing message appending' } });

        const sendBtn = screen.getByText('Send Message');
        fireEvent.click(sendBtn);

        await waitFor(() => {
          expect(window.knotApi?.messages.append).toHaveBeenCalledWith(
            expect.objectContaining({
              sessionId: 'sess-1',
              contentMarkdown: 'Testing message appending',
            })
          );
        });
      });
    });
  });

  describe('ChatGPT Bridge UI Components', () => {
    describe('ConnectionStatusCard', () => {
      const mockStatus: BridgeStatusInfo = {
        workspaceInitialized: true,
        bridgeRoot: '/home/user/.config/knot/bridge/v1',
        desktopCommanderRunning: true,
        mcpPermissionConfigured: true,
        handshakeState: 'workspace_ready',
        activeProjectId: 'proj-1',
        activeSessionId: 'sess-1',
        lastInboundMessage: null,
        lastOutboundMessage: null,
        lastVerifiedAt: '2026-11-24T10:00:00.000Z',
        sessionPaths: {
          projectDir: '/mock/projects/proj-1',
          sessionDir: '/mock/projects/proj-1/sessions/sess-1',
          inboxDir: '/mock/projects/proj-1/sessions/sess-1/inbox/chatgpt',
          processedDir: '/mock/projects/proj-1/sessions/sess-1/processed/chatgpt',
          rejectedDir: '/mock/projects/proj-1/sessions/sess-1/rejected/chatgpt',
          outboxDir: '/mock/projects/proj-1/sessions/sess-1/outbox/knot',
          conversationFile: '/mock/projects/proj-1/sessions/sess-1/conversation.md',
        },
      };

      it('renders bridge root and status badges correctly', () => {
        render(
          <ConnectionStatusCard
            status={mockStatus}
            selectedProjectId="proj-1"
            selectedSessionId="sess-1"
            onOpenTestModal={vi.fn()}
            onInitWorkspace={vi.fn()}
          />
        );

        expect(screen.getByText('ChatGPT Filesystem Bridge')).toBeInTheDocument();
        expect(screen.getByText('Ready for Test')).toBeInTheDocument();
        expect(screen.getByText('/home/user/.config/knot/bridge/v1')).toBeInTheDocument();
        expect(screen.getByText('Process Active')).toBeInTheDocument();
        expect(screen.getByText('Test Connection')).toBeInTheDocument();
      });

      it('triggers onOpenTestModal when Test Connection button is clicked', () => {
        const handleOpenTest = vi.fn();
        render(
          <ConnectionStatusCard
            status={mockStatus}
            selectedProjectId="proj-1"
            selectedSessionId="sess-1"
            onOpenTestModal={handleOpenTest}
            onInitWorkspace={vi.fn()}
          />
        );

        const testBtn = screen.getByText('Test Connection');
        fireEvent.click(testBtn);
        expect(handleOpenTest).toHaveBeenCalledTimes(1);
      });
    });

    describe('HandshakeModal', () => {
      it('renders modal with step guidance and challenge details', () => {
        const mockChallenge = {
          id: 'chal-1',
          challengeId: 'knot-challenge-98765432',
          projectId: 'proj-1',
          sessionId: 'sess-1',
          outboxFilePath: '/mock/outbox/handshake.md',
          inboxExpectedFilePath: '/mock/inbox/handshake.md',
          instructions: 'Use Desktop Commander to read outbox and reply to inbox.',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          status: 'pending' as const,
        };

        render(
          <HandshakeModal
            isOpen={true}
            onClose={vi.fn()}
            projectId="proj-1"
            sessionId="sess-1"
            activeChallenge={mockChallenge}
            handshakeState="awaiting_response"
            onStartTest={vi.fn()}
          />
        );

        expect(screen.getByText('Verify ChatGPT Bridge Connection')).toBeInTheDocument();
        expect(screen.getByText('Awaiting ChatGPT Response...')).toBeInTheDocument();
        expect(screen.getByText('knot-challenge-98765432')).toBeInTheDocument();
        expect(screen.getByText(/Use Desktop Commander to read outbox/)).toBeInTheDocument();
      });
    });

    describe('BridgeMessagesPanel', () => {
      const mockMessages: Message[] = [
        {
          id: 'msg-1',
          sessionId: 'sess-1',
          sequence: 1,
          sender: 'knot',
          recipient: 'chatgpt',
          messageType: 'text',
          contentMarkdown: 'Task for ChatGPT: review parser implementation.',
          correlationId: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          sessionId: 'sess-1',
          sequence: 2,
          sender: 'chatgpt',
          recipient: 'knot',
          messageType: 'text',
          contentMarkdown: 'Parser review complete. All syntax checks passed.',
          correlationId: null,
          createdAt: new Date().toISOString(),
        },
      ];

      it('renders messages and handles tab switching and outbound send', async () => {
        const handleRefresh = vi.fn();
        render(
          <BridgeMessagesPanel
            projectId="proj-1"
            sessionId="sess-1"
            messages={mockMessages}
            onRefresh={handleRefresh}
            recentBridgeEvents={[]}
          />
        );

        expect(screen.getByText('Bridge Message Stream')).toBeInTheDocument();
        expect(screen.getByText('Task for ChatGPT: review parser implementation.')).toBeInTheDocument();
        expect(screen.getByText('Parser review complete. All syntax checks passed.')).toBeInTheDocument();

        // Type and send an outbound message
        const textarea = screen.getByPlaceholderText('Type your markdown instruction or task for ChatGPT...');
        fireEvent.change(textarea, { target: { value: 'New task for ChatGPT' } });

        const sendBtn = screen.getByText('Send to Outbox');
        fireEvent.click(sendBtn);

        await waitFor(() => {
          expect(window.knotApi?.bridge.sendMessage).toHaveBeenCalledWith(
            'proj-1',
            'sess-1',
            'New task for ChatGPT'
          );
          expect(handleRefresh).toHaveBeenCalled();
        });
      });
    });
  });

  describe('Google Antigravity UI Components', () => {
    describe('AgentStatusCard', () => {
      const mockStatus: AntigravityStatus = {
        sessionId: 'sess-1',
        state: 'ready',
        pid: 24680,
        cliConversationId: 'conv-knot-001',
        workingDirectory: '/home/user/my-repo',
        executionMode: 'auto',
        model: 'gemini-3.8-flash',
        effort: 'high',
        lastStartedAt: new Date().toISOString(),
        lastExitCode: null,
        capabilities: {
          installed: true,
          executablePath: '/usr/local/bin/agy',
          version: '1.5.14',
          supportedModes: ['default', 'accept-edits', 'auto', 'plan'],
          supportsStreaming: true,
          supportsResumption: true,
          readiness: 'ready',
        },
        currentTurnPending: false,
        lastResult: null,
      };

      it('renders capabilities, ready status, PID, and controls', () => {
        const handleStart = vi.fn();
        const handleStop = vi.fn();

        render(
          <AgentStatusCard
            status={mockStatus}
            onStart={handleStart}
            onStop={handleStop}
            onInterrupt={vi.fn()}
            onResume={vi.fn()}
            onModeChange={vi.fn()}
            selectedMode="auto"
          />
        );

        expect(screen.getByText('Google Antigravity Agent')).toBeInTheDocument();
        expect(screen.getByText(/agy v1.5.14/)).toBeInTheDocument();
        expect(screen.getByText('Ready')).toBeInTheDocument();
        expect(screen.getByText('Active / Idle')).toBeInTheDocument();
        expect(screen.getByText(/conv-knot-001/)).toBeInTheDocument();
        expect(screen.getByText(/PID: 24680/)).toBeInTheDocument();

        const stopBtn = screen.getByTitle('Stop persistent process');
        fireEvent.click(stopBtn);
        expect(handleStop).toHaveBeenCalled();
      });

      it('renders authentication banner when auth is required', () => {
        const authStatus: AntigravityStatus = {
          ...mockStatus,
          state: 'authentication_required',
          capabilities: {
            ...mockStatus.capabilities,
            readiness: 'auth_required',
          },
        };

        render(
          <AgentStatusCard
            status={authStatus}
            onStart={vi.fn()}
            onStop={vi.fn()}
            onInterrupt={vi.fn()}
            onResume={vi.fn()}
            onModeChange={vi.fn()}
            selectedMode="default"
          />
        );

        expect(screen.getByText(/Google Antigravity authentication is required/)).toBeInTheDocument();
        expect(screen.getByText('agy')).toBeInTheDocument();
      });
    });

    describe('ConversationTimeline', () => {
      const mockMessages: Message[] = [
        {
          id: 'm-1',
          sessionId: 's-1',
          sequence: 1,
          sender: 'user',
          recipient: 'antigravity',
          messageType: 'text',
          contentMarkdown: 'Run the test suite and verify coverage.',
          correlationId: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'm-2',
          sessionId: 's-1',
          sequence: 2,
          sender: 'antigravity',
          recipient: 'chatgpt',
          messageType: 'text',
          contentMarkdown: 'All 15 tests passed with 100% code coverage.',
          correlationId: null,
          createdAt: new Date().toISOString(),
        },
      ];

      it('renders messages, sender badges, and active streaming indicator', () => {
        render(
          <ConversationTimeline
            messages={mockMessages}
            streamingText="Generating test report..."
            activeTools={[
              {
                tool: {
                  name: 'run_command',
                  parameters: { CommandLine: 'npm test' },
                  status: 'done',
                },
                stepIndex: 1,
              },
            ]}
            isThinking={true}
          />
        );

        expect(screen.getByText('Run the test suite and verify coverage.')).toBeInTheDocument();
        expect(screen.getByText('All 15 tests passed with 100% code coverage.')).toBeInTheDocument();
        expect(screen.getByText('run_command')).toBeInTheDocument();
        expect(screen.getByText('completed')).toBeInTheDocument();
        expect(screen.getByText('Antigravity (Streaming)')).toBeInTheDocument();
        expect(screen.getByText(/Generating test report.../)).toBeInTheDocument();
      });
    });

    describe('Composer', () => {
      it('triggers onSendMessage on submit click and Enter key', () => {
        const handleSend = vi.fn();
        const handleInterrupt = vi.fn();

        render(
          <Composer
            onSendMessage={handleSend}
            onInterrupt={handleInterrupt}
            isThinking={false}
            workingDirectory="/path/to/project"
          />
        );

        const textarea = screen.getByPlaceholderText(/Send instruction to Antigravity/);
        fireEvent.change(textarea, { target: { value: 'Inspect code quality' } });

        const sendBtn = screen.getByTitle('Send prompt');
        fireEvent.click(sendBtn);

        expect(handleSend).toHaveBeenCalledWith('Inspect code quality');
      });

      it('shows interrupt button when thinking', () => {
        const handleInterrupt = vi.fn();
        render(
          <Composer
            onSendMessage={vi.fn()}
            onInterrupt={handleInterrupt}
            isThinking={true}
            workingDirectory="/path/to/project"
          />
        );

        const interruptBtn = screen.getByTitle('Interrupt agent execution');
        fireEvent.click(interruptBtn);
        expect(handleInterrupt).toHaveBeenCalled();
      });
    });
  });

  describe('Prompt 07 Multi-Project Collaboration Workspace', () => {
    beforeEach(() => {
      window.knotApi = createMockKnotApi();
    });

    const dummyProject: Project = {
      id: 'p-orch-1',
      name: 'Alpha Project',
      repositoryPath: '/mock/repos/alpha',
      repositoryRemote: 'git@github.com:axonel/knot.git',
      trustPolicy: 'approval_required',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };

    const dummySession: Session = {
      id: 's-orch-1',
      projectId: 'p-orch-1',
      title: 'Auth Orchestration',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      metadata: null,
    };

    describe('DirectoryAccessDiagnostic', () => {
      it('renders bridge and repository access chips with allowedDirectories copy button', () => {
        const dummyBridgeStatus: BridgeStatusInfo = {
          workspaceInitialized: true,
          bridgeRoot: '/mock/bridge/v1',
          desktopCommanderRunning: true,
          mcpPermissionConfigured: true,
          handshakeState: 'verified',
          activeProjectId: dummyProject.id,
          activeSessionId: dummySession.id,
          lastInboundMessage: null,
          lastOutboundMessage: null,
        };

        render(
          <DirectoryAccessDiagnostic
            project={dummyProject}
            bridgeStatus={dummyBridgeStatus}
          />
        );

        expect(screen.getByText('Desktop Commander Access Diagnostic')).toBeInTheDocument();
        expect(screen.getByText('Bridge Directory')).toBeInTheDocument();
        expect(screen.getByText('Project Repository')).toBeInTheDocument();
        expect(screen.getByText('Accessible')).toBeInTheDocument();
        expect(screen.getByText('Configured')).toBeInTheDocument();
        expect(screen.getByText('Copy allowedDirectories')).toBeInTheDocument();
      });
    });

    describe('SharedConversationPanel', () => {
      it('renders conversation messages with role badges and action buttons', async () => {
        window.knotApi!.messages.list = vi.fn().mockResolvedValue([
          {
            id: 'm-1',
            sessionId: dummySession.id,
            sequence: 1,
            sender: 'chatgpt',
            recipient: 'knot',
            messageType: 'text',
            contentMarkdown: 'Let us plan the auth migration.',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'm-2',
            sessionId: dummySession.id,
            sequence: 2,
            sender: 'antigravity',
            recipient: 'chatgpt',
            messageType: 'text',
            contentMarkdown: 'Executed migration tasks successfully.',
            createdAt: new Date().toISOString(),
          },
        ]);

        render(
          <SharedConversationPanel
            project={dummyProject}
            session={dummySession}
            sessionPaths={{
              projectDir: '/p',
              sessionDir: '/s',
              inboxDir: '/in',
              processedDir: '/proc',
              rejectedDir: '/rej',
              outboxDir: '/out',
              conversationFile: '/conv.md',
            }}
          />
        );

        await waitFor(() => {
          expect(screen.getByText('Auth Orchestration')).toBeInTheDocument();
          expect(screen.getByText(/Let us plan the auth migration/)).toBeInTheDocument();
          expect(screen.getByText(/Executed migration tasks successfully/)).toBeInTheDocument();
          expect(screen.getByText(/ChatGPT \(Orchestrator\)/)).toBeInTheDocument();
          expect(screen.getByText(/Antigravity \(Executor\)/)).toBeInTheDocument();
        });
      });
    });

    describe('ChatGptActivityPanel', () => {
      it('renders chronological activities with category filter chips', async () => {
        window.knotApi!.events.list = vi.fn().mockResolvedValue([
          {
            id: 'e-1',
            sessionId: dummySession.id,
            taskId: null,
            eventType: 'chatgpt_activity',
            actor: 'chatgpt',
            data: {
              category: 'repo_inspection',
              reference: 'src/main/auth.ts',
              summary: 'Inspected token validation logic',
            },
            createdAt: new Date().toISOString(),
          },
        ]);

        render(<ChatGptActivityPanel session={dummySession} />);

        await waitFor(() => {
          expect(screen.getByText('ChatGPT-Reported Activity')).toBeInTheDocument();
          expect(screen.getByText('Repo Inspection')).toBeInTheDocument();
          expect(screen.getByText('src/main/auth.ts')).toBeInTheDocument();
          expect(screen.getByText('Inspected token validation logic')).toBeInTheDocument();
        });
      });
    });

    describe('AntigravityExecutionPanel', () => {
      it('renders worker status, active task card, and queue', async () => {
        window.knotApi!.orchestration.listTasks = vi.fn().mockResolvedValue([
          {
            id: 't-1',
            sessionId: dummySession.id,
            title: 'Deploy Production Release',
            status: 'awaiting_approval',
            approvalStatus: 'awaiting_approval',
            priority: 'urgent',
            acceptanceCriteria: ['All tests pass'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]);

        render(<AntigravityExecutionPanel session={dummySession} />);

        await waitFor(() => {
          expect(screen.getByText('Antigravity Execution')).toBeInTheDocument();
          expect(screen.getByText('Requires Approval')).toBeInTheDocument();
          expect(screen.getAllByText('Deploy Production Release')[0]).toBeInTheDocument();
          expect(screen.getByText('Approve & Dispatch')).toBeInTheDocument();
          expect(screen.getByText('Reject')).toBeInTheDocument();
        });
      });
    });

    describe('CollaborationWorkspace', () => {
      it('renders the 3-panel workspace layout with toolbar buttons', async () => {
        window.knotApi!.projects.list = vi.fn().mockResolvedValue([dummyProject]);
        window.knotApi!.sessions.list = vi.fn().mockResolvedValue([dummySession]);

        render(<CollaborationWorkspace />);

        await waitFor(() => {
          expect(screen.getByText('Multi-Agent Workspace')).toBeInTheDocument();
          expect(screen.getAllByText('Alpha Project')[0]).toBeInTheDocument();
          expect(screen.getByText('Activity')).toBeInTheDocument();
          expect(screen.getByText('Execution')).toBeInTheDocument();
          expect(screen.getByText('Diagnostic')).toBeInTheDocument();
        });
      });
    });
  });
});



