import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContextVaultPanel } from '../src/renderer/components/Workspace/ContextVaultPanel.js';
import type { Project, Session, ContextDocument, ContextRevision, ContextConflict } from '../src/shared/types.js';

describe('ContextVaultPanel Component', () => {
  const mockProject: Project = {
    id: 'p-1',
    name: 'Context Test Project',
    repositoryPath: '/path/to/repo',
    repositoryRemote: 'git@github.com:test/repo.git',
    trustPolicy: 'approval_required',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    archivedAt: null,
  };

  const mockSession: Session = {
    id: 's-1',
    projectId: 'p-1',
    title: 'Active Dev Session',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    lastActivityAt: '2026-01-01T00:00:00Z',
    startedAt: '2026-01-01T00:00:00Z',
    endedAt: null,
    metadata: null,
  };

  const sampleDoc1: ContextDocument = {
    id: 'ctx-1',
    projectId: 'p-1',
    sessionId: null,
    scope: 'project',
    category: 'architecture_decisions',
    title: 'Database Architecture Decision',
    contentMarkdown: '# Architecture\n\nUse SQLite with WAL mode.',
    author: 'chatgpt',
    provenance: 'chatgpt-authored',
    contentHash: 'hash12345678',
    currentRevision: 1,
    isArchived: false,
    requiresVerification: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    archivedAt: null,
  };

  const sampleDoc2: ContextDocument = {
    id: 'ctx-2',
    projectId: 'p-1',
    sessionId: 's-1',
    scope: 'session',
    category: 'session_handoff',
    title: 'Session 1 Handoff Note',
    contentMarkdown: '# Handoff\n\nNext step is frontend tests.',
    author: 'chatgpt',
    provenance: 'chatgpt-authored',
    contentHash: 'hash87654321',
    currentRevision: 2,
    isArchived: false,
    requiresVerification: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    archivedAt: null,
  };

  const sampleRevisions: ContextRevision[] = [
    {
      id: 'rev-2',
      contextId: 'ctx-2',
      revision: 2,
      title: 'Session 1 Handoff Note',
      contentMarkdown: '# Handoff\n\nNext step is frontend tests.',
      contentHash: 'hash87654321',
      author: 'chatgpt',
      provenance: 'chatgpt-authored',
      requiresVerification: true,
      changeSummary: 'Added instructions for vitest UI tests',
      createdAt: '2026-01-01T01:00:00Z',
    },
    {
      id: 'rev-1',
      contextId: 'ctx-2',
      revision: 1,
      title: 'Session 1 Handoff Initial',
      contentMarkdown: '# Handoff\n\nWork in progress.',
      contentHash: 'hash00000000',
      author: 'user',
      provenance: 'user-authored',
      requiresVerification: false,
      changeSummary: 'Initial creation',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const sampleConflict: ContextConflict = {
    id: 'conf-1',
    contextId: 'ctx-1',
    projectId: 'p-1',
    sessionId: 's-1',
    expectedRevision: 1,
    actualRevision: 2,
    incomingTitle: 'Conflict Title',
    incomingContent: 'Conflict content',
    incomingAuthor: 'chatgpt',
    conflictReason: 'Revision mismatch: expected revision 1 but document is at revision 2',
    isResolved: false,
    createdAt: '2026-01-01T00:00:00Z',
  };

  let mockContextApi: any;

  beforeEach(() => {
    mockContextApi = {
      list: vi.fn().mockResolvedValue([sampleDoc1, sampleDoc2]),
      get: vi.fn().mockImplementation((id) => Promise.resolve(id === 'ctx-1' ? sampleDoc1 : sampleDoc2)),
      create: vi.fn().mockImplementation((d) =>
        Promise.resolve({
          id: 'ctx-new',
          ...d,
          currentRevision: 1,
          isArchived: false,
          requiresVerification: Boolean(d.requiresVerification),
          contentHash: 'newhash',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archivedAt: null,
        })
      ),
      update: vi.fn().mockImplementation((_id, d) =>
        Promise.resolve({
          ...sampleDoc1,
          ...d,
          currentRevision: sampleDoc1.currentRevision + 1,
          contentHash: 'updatedhash',
          updatedAt: new Date().toISOString(),
        })
      ),
      archive: vi.fn().mockImplementation((_id) =>
        Promise.resolve({
          ...sampleDoc1,
          isArchived: true,
          archivedAt: new Date().toISOString(),
        })
      ),
      restore: vi.fn().mockImplementation((_id) =>
        Promise.resolve({
          ...sampleDoc1,
          isArchived: false,
          archivedAt: null,
        })
      ),
      getRevisions: vi.fn().mockImplementation((docId) =>
        Promise.resolve(docId === 'ctx-2' ? sampleRevisions : [sampleRevisions[0]])
      ),
      getRevision: vi.fn().mockImplementation((_docId, rev) =>
        Promise.resolve(sampleRevisions.find((r) => r.revision === rev) || null)
      ),
      listConflicts: vi.fn().mockResolvedValue([sampleConflict]),
      resolveConflict: vi.fn().mockResolvedValue(undefined),
      getHandoff: vi.fn().mockResolvedValue(sampleDoc2),
      getManifest: vi.fn().mockResolvedValue(null),
    };

    window.knotApi = {
      ...(window.knotApi || {}),
      context: mockContextApi,
    } as any;
  });

  it('renders prompt when no project is provided', () => {
    render(<ContextVaultPanel project={null} session={null} />);
    expect(screen.getByText(/Select a project from the sidebar to inspect its Context Vault/i)).toBeInTheDocument();
  });

  it('loads and renders documents with category badges and revision numbers', async () => {
    render(<ContextVaultPanel project={mockProject} session={mockSession} />);

    await waitFor(() => {
      expect(mockContextApi.list).toHaveBeenCalledWith({
        projectId: 'p-1',
        sessionId: 's-1',
        includeArchived: false,
      });
    });

    const docMatches = await screen.findAllByText('Database Architecture Decision');
    expect(docMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Session 1 Handoff Note')).toBeInTheDocument();
  });

  it('renders session handoff card and unresolved conflicts banner', async () => {
    render(<ContextVaultPanel project={mockProject} session={mockSession} />);

    // Session Handoff note display
    expect(await screen.findByText(/Session 1 Handoff Note \(Rev 2\)/i)).toBeInTheDocument();

    // Conflict banner
    expect(screen.getByText(/1 Unresolved Context Update Conflict/i)).toBeInTheDocument();
    expect(screen.getByText(/Mark Resolved/i)).toBeInTheDocument();

    // Click Mark Resolved
    fireEvent.click(screen.getByText('Mark Resolved'));
    await waitFor(() => {
      expect(mockContextApi.resolveConflict).toHaveBeenCalledWith('conf-1');
    });
  });

  it('switches between Content, History, and Diff tabs', async () => {
    render(<ContextVaultPanel project={mockProject} session={mockSession} />);

    // Click on ctx-2 (which has 2 revisions)
    const doc2Btn = await screen.findByRole('button', { name: /Session 1 Handoff Note/i });
    fireEvent.click(doc2Btn);

    // Initial content tab
    expect(await screen.findByText(/Next step is frontend tests/i)).toBeInTheDocument();

    // Switch to History tab
    const historyTabBtn = screen.getByRole('button', { name: /History \(2\)/i });
    fireEvent.click(historyTabBtn);

    expect(await screen.findByText(/Added instructions for vitest UI tests/i)).toBeInTheDocument();
    expect(screen.getByText(/Revision Timeline/i)).toBeInTheDocument();

    // Switch to Diff tab
    const diffTabBtn = screen.getByRole('button', { name: /^Diff$/i });
    fireEvent.click(diffTabBtn);

    expect(await screen.findByText(/Comparing:/i)).toBeInTheDocument();
  });

  it('filters documents by search query', async () => {
    render(<ContextVaultPanel project={mockProject} session={mockSession} />);

    await screen.findAllByText('Database Architecture Decision');

    const searchInput = screen.getByPlaceholderText('Search documents...');
    fireEvent.change(searchInput, { target: { value: 'Handoff' } });

    expect(screen.getAllByText('Session 1 Handoff Note').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('Database Architecture Decision')).toHaveLength(0);
  });

  it('opens Create Document modal and submits new document', async () => {
    render(<ContextVaultPanel project={mockProject} session={mockSession} />);

    const newBtn = await screen.findByRole('button', { name: /New Document/i });
    fireEvent.click(newBtn);

    expect(screen.getByText('Create Context Document')).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/e\.g\. Database Architecture Decisions/i);
    fireEvent.change(titleInput, { target: { value: 'New Test Standard' } });

    const contentInput = screen.getByPlaceholderText('# Decisions...');
    fireEvent.change(contentInput, { target: { value: '# Standards\nStrict adherence.' } });

    const submitBtn = screen.getByRole('button', { name: /^Create Document$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockContextApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p-1',
          title: 'New Test Standard',
          contentMarkdown: '# Standards\nStrict adherence.',
        })
      );
    });
  });

  it('opens Archive Confirmation modal and archives document', async () => {
    render(<ContextVaultPanel project={mockProject} session={mockSession} />);

    await screen.findAllByText('Database Architecture Decision');

    const archiveBtn = screen.getByTitle('Archive Document');
    fireEvent.click(archiveBtn);

    expect(screen.getByText(/Are you sure you want to archive/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Confirm Archive/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockContextApi.archive).toHaveBeenCalledWith('ctx-1');
    });
  });
});
