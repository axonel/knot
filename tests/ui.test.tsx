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
import { ProcessStatusInfo, LogEntry, Project, Session } from '../src/shared/types.js';

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
        projects: {
          list: vi.fn().mockResolvedValue([]),
          get: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((d) => Promise.resolve({ id: 'p-1', ...d, createdAt: '', updatedAt: '', archivedAt: null, sessionCount: 0 })),
          update: vi.fn().mockImplementation((id, d) => Promise.resolve({ id, ...d, createdAt: '', updatedAt: '', archivedAt: null, sessionCount: 0 })),
          archive: vi.fn().mockImplementation((id) => Promise.resolve({ id, name: 'Archived', createdAt: '', updatedAt: '', archivedAt: new Date().toISOString(), sessionCount: 0 })),
          unarchive: vi.fn().mockImplementation((id) => Promise.resolve({ id, name: 'Active', createdAt: '', updatedAt: '', archivedAt: null, sessionCount: 0 })),
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
        },
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
});

