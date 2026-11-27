import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  RefreshCw,
  History,
  Archive,
  RotateCcw,
  AlertTriangle,
  GitCompare,
  X,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { diffLines, type Change } from 'diff';
import type {
  Project,
  Session,
  ContextDocument,
  ContextRevision,
  ContextConflict,
  ContextScope,
  ContextProvenance,
  CreateContextInput,
  UpdateContextInput,
} from '../../../shared/types.js';

interface ContextVaultPanelProps {
  project: Project | null;
  session: Session | null;
  onRefresh?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  architecture_decisions: 'Architecture Decisions',
  product_requirements: 'Product Requirements',
  technical_constraints: 'Technical Constraints',
  coding_conventions: 'Coding Conventions',
  environment_setup: 'Environment Setup',
  project_overview: 'Project Overview',
  known_issues: 'Known Issues',
  user_notes: 'User Notes',
  session_objective: 'Session Objective',
  current_focus: 'Current Focus',
  recorded_decisions: 'Recorded Decisions',
  active_constraints: 'Active Constraints',
  unresolved_questions: 'Unresolved Questions',
  important_findings: 'Important Findings',
  pending_verification: 'Pending Verification',
  session_handoff: 'Session Handoff',
};

export const ContextVaultPanel: React.FC<ContextVaultPanelProps> = ({
  project,
  session,
  onRefresh,
}) => {
  const [documents, setDocuments] = useState<ContextDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<ContextRevision[]>([]);
  const [selectedRevisionNum, setSelectedRevisionNum] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<ContextConflict[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [scopeFilter, setScopeFilter] = useState<'all' | 'project' | 'session'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // View state
  const [activeTab, setActiveTab] = useState<'content' | 'history' | 'diff'>('content');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [docToArchive, setDocToArchive] = useState<ContextDocument | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<string>('architecture_decisions');
  const [formScope, setFormScope] = useState<ContextScope>('project');
  const [formContent, setFormContent] = useState('');
  const [formRequiresVerification, setFormRequiresVerification] = useState(false);
  const [formChangeSummary, setFormChangeSummary] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId) || null,
    [documents, selectedDocId]
  );

  const selectedHistoricalRevision = useMemo(() => {
    if (selectedRevisionNum === null) return null;
    return revisions.find((r) => r.revision === selectedRevisionNum) || null;
  }, [revisions, selectedRevisionNum]);

  const loadDocuments = async () => {
    if (!project || !window.knotApi?.context) return;
    setLoading(true);
    try {
      const docs = await window.knotApi.context.list({
        projectId: project.id,
        sessionId: session?.id || null,
        includeArchived: showArchived,
      });
      setDocuments(docs);

      const conflictList = await window.knotApi.context.listConflicts(project.id, true);
      setConflicts(conflictList);

      // Default select first doc if none selected or if selected is missing
      if (!selectedDocId && docs.length > 0) {
        setSelectedDocId(docs[0].id);
      } else if (selectedDocId && !docs.some((d) => d.id === selectedDocId)) {
        setSelectedDocId(docs.length > 0 ? docs[0].id : null);
      }
    } catch (err) {
      console.error('[ContextVaultPanel] Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRevisions = async (docId: string) => {
    if (!window.knotApi?.context) return;
    try {
      const revs = await window.knotApi.context.getRevisions(docId);
      setRevisions(revs);
      if (revs.length > 1 && selectedRevisionNum === null) {
        setSelectedRevisionNum(revs[1].revision);
      }
    } catch (err) {
      console.error('[ContextVaultPanel] Failed to load revisions:', err);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [project?.id, session?.id, showArchived]);

  useEffect(() => {
    if (selectedDocId) {
      loadRevisions(selectedDocId);
      setSelectedRevisionNum(null);
      setActiveTab('content');
    }
  }, [selectedDocId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCreateModal) {
          e.stopPropagation();
          e.preventDefault();
          setShowCreateModal(false);
          return;
        }
        if (showEditModal) {
          e.stopPropagation();
          e.preventDefault();
          setShowEditModal(false);
          return;
        }
        if (selectedRevisionNum !== null) {
          e.stopPropagation();
          e.preventDefault();
          setSelectedRevisionNum(null);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [showCreateModal, showEditModal, selectedRevisionNum]);

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (scopeFilter !== 'all' && doc.scope !== scopeFilter) return false;
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = doc.title.toLowerCase().includes(query);
        const matchesContent = doc.contentMarkdown.toLowerCase().includes(query);
        if (!matchesTitle && !matchesContent) return false;
      }
      return true;
    });
  }, [documents, scopeFilter, categoryFilter, searchQuery]);

  // Synchronize selected document when filters change
  useEffect(() => {
    if (filteredDocuments.length > 0) {
      if (!selectedDocId || !filteredDocuments.some((d) => d.id === selectedDocId)) {
        setSelectedDocId(filteredDocuments[0].id);
      }
    } else {
      setSelectedDocId(null);
    }
  }, [filteredDocuments, selectedDocId]);

  // Session Handoff note for active session
  const currentSessionHandoff = useMemo(() => {
    if (!session) return null;
    return documents.find(
      (d) => d.sessionId === session.id && d.category === 'session_handoff' && !d.isArchived
    );
  }, [documents, session]);

  // Unique categories for filter dropdown
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      set.add(doc.category);
    }
    return Array.from(set);
  }, [documents]);

  // Diff comparison lines between current document and selected revision
  const diffLinesData = useMemo(() => {
    if (!selectedDoc || !selectedHistoricalRevision) return [];
    return diffLines(selectedHistoricalRevision.contentMarkdown, selectedDoc.contentMarkdown);
  }, [selectedDoc, selectedHistoricalRevision]);

  // Handlers
  const handleOpenCreateModal = (suggestedCategory?: string, suggestedScope?: ContextScope) => {
    setFormTitle('');
    setFormCategory(suggestedCategory || 'architecture_decisions');
    setFormScope(suggestedScope || (session ? 'session' : 'project'));
    setFormContent('');
    setFormRequiresVerification(false);
    setFormChangeSummary('');
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !window.knotApi?.context) return;
    if (!formTitle.trim()) {
      setFormError('Title cannot be empty');
      return;
    }
    setFormError(null);

    try {
      const input: CreateContextInput = {
        projectId: project.id,
        sessionId: formScope === 'session' && session ? session.id : null,
        scope: formScope,
        category: formCategory.trim(),
        title: formTitle.trim(),
        contentMarkdown: formContent,
        requiresVerification: formRequiresVerification,
        changeSummary: formChangeSummary.trim() || undefined,
        author: 'user',
        provenance: 'user-authored',
      };
      const created = await window.knotApi.context.create(input);
      setShowCreateModal(false);
      await loadDocuments();
      setSelectedDocId(created.id);
      onRefresh?.();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenEditModal = () => {
    if (!selectedDoc) return;
    setFormTitle(selectedDoc.title);
    setFormCategory(selectedDoc.category);
    setFormScope(selectedDoc.scope);
    setFormContent(selectedDoc.contentMarkdown);
    setFormRequiresVerification(selectedDoc.requiresVerification);
    setFormChangeSummary('');
    setFormError(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc || !window.knotApi?.context) return;
    if (!formTitle.trim()) {
      setFormError('Title cannot be empty');
      return;
    }
    setFormError(null);

    try {
      const input: UpdateContextInput = {
        title: formTitle.trim(),
        category: formCategory.trim(),
        contentMarkdown: formContent,
        requiresVerification: formRequiresVerification,
        changeSummary: formChangeSummary.trim() || undefined,
        author: 'user',
        provenance: 'user-authored',
        expectedRevision: selectedDoc.currentRevision,
        expectedContentHash: selectedDoc.contentHash,
      };
      const updated = await window.knotApi.context.update(selectedDoc.id, input);
      setShowEditModal(false);
      await loadDocuments();
      await loadRevisions(updated.id);
      onRefresh?.();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleArchiveToggle = async (doc: ContextDocument) => {
    if (!window.knotApi?.context) return;
    try {
      if (doc.isArchived) {
        await window.knotApi.context.restore(doc.id);
      } else {
        await window.knotApi.context.archive(doc.id);
      }
      setShowArchiveConfirm(false);
      setDocToArchive(null);
      await loadDocuments();
      onRefresh?.();
    } catch (err) {
      console.error('[ContextVaultPanel] Error archiving/restoring doc:', err);
    }
  };

  const handleResolveConflict = async (conflictId: string) => {
    if (!window.knotApi?.context) return;
    try {
      await window.knotApi.context.resolveConflict(conflictId);
      await loadDocuments();
      onRefresh?.();
    } catch (err) {
      console.error('[ContextVaultPanel] Error resolving conflict:', err);
    }
  };

  const getProvenanceBadgeStyle = (provenance: ContextProvenance) => {
    switch (provenance) {
      case 'chatgpt-authored':
        return 'bg-[#FF6E42]/10 border-[#FF6E42]/40 text-[#FF6E42]';
      case 'antigravity-reported':
        return 'bg-[#004E72]/30 border-[#004E72] text-[#F9F9F9]';
      case 'knot-derived':
        return 'bg-[#004E72]/20 border-[#004E72]/40 text-[#F9F9F9]/80';
      case 'user-authored':
      default:
        return 'bg-[#092634] border-[#004E72] text-[#F9F9F9]';
    }
  };

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-[#090B0D] text-[#F9F9F9]/50 text-xs font-mono">
        Select a project from the sidebar to inspect its Context Vault.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#090B0D] text-[#F9F9F9] border border-[#F9F9F9]/10 rounded-xl overflow-hidden shadow-xl">
      {/* Top Header */}
      <div className="px-4 py-3 bg-[#092634] border-b border-[#F9F9F9]/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <BookOpen size={18} className="text-[#FF6E42]" />
          <div>
            <h2 className="text-xs font-bold text-[#F9F9F9] tracking-wider uppercase font-mono">
              Project Context Vault
            </h2>
            <p className="text-[11px] text-[#F9F9F9]/60 font-mono">
              {project.name} &bull; {documents.length} document{documents.length !== 1 ? 's' : ''} stored
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenCreateModal()}
            className="px-3 py-1.5 rounded-lg bg-[#FF6E42] text-[#090B0D] font-bold text-xs flex items-center gap-1.5 hover:bg-[#FF6E42]/90 transition-all shadow-sm"
          >
            <Plus size={14} />
            <span>New Document</span>
          </button>

          <button
            onClick={loadDocuments}
            title="Refresh Vault Data"
            disabled={loading}
            className="p-2 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 hover:text-[#F9F9F9] hover:bg-[#004E72]/30 transition-all text-xs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Unresolved Conflicts Warning Banner */}
      {conflicts.length > 0 && (
        <div className="p-3 bg-[#092634] border-b border-[#FF6E42]/40 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[#FF6E42] font-mono">
              <ShieldAlert size={15} />
              <span>
                {conflicts.length} Unresolved Context Update Conflict{conflicts.length !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="text-[11px] text-[#F9F9F9]/60 font-mono">
              Preserved current document; update was safely rejected
            </span>
          </div>

          <div className="space-y-1.5">
            {conflicts.map((c) => (
              <div
                key={c.id}
                className="p-2 rounded bg-[#090B0D] border border-[#FF6E42]/30 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#F9F9F9] truncate">
                    Incoming: &quot;{c.incomingTitle}&quot; (Author: {c.incomingAuthor})
                  </div>
                  <div className="text-[11px] text-[#F9F9F9]/70 font-mono truncate">
                    {c.conflictReason} &bull; Expected Rev: {c.expectedRevision ?? 'none'}, Actual Rev:{' '}
                    {c.actualRevision}
                  </div>
                </div>
                <button
                  onClick={() => handleResolveConflict(c.id)}
                  className="px-2.5 py-1 rounded bg-[#004E72] text-[#F9F9F9] font-medium text-[11px] hover:bg-[#004E72]/80 transition-all shrink-0"
                >
                  Mark Resolved
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session Handoff Highlight Card */}
      {session && (
        <div className="px-4 py-2 bg-[#092634]/60 border-b border-[#F9F9F9]/10 shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/30 shrink-0">
              Session Handoff
            </span>
            {currentSessionHandoff ? (
              <span className="text-xs font-semibold text-[#F9F9F9] truncate">
                {currentSessionHandoff.title} (Rev {currentSessionHandoff.currentRevision})
              </span>
            ) : (
              <span className="text-xs text-[#F9F9F9]/50 font-mono truncate">
                No active handoff note written for session &quot;{session.title}&quot;
              </span>
            )}
          </div>

          {currentSessionHandoff ? (
            <button
              onClick={() => setSelectedDocId(currentSessionHandoff.id)}
              className="text-[11px] font-mono text-[#FF6E42] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>View Handoff</span>
              <ArrowRight size={11} />
            </button>
          ) : (
            <button
              onClick={() => handleOpenCreateModal('session_handoff', 'session')}
              className="text-[11px] font-mono text-[#F9F9F9]/70 hover:text-[#FF6E42] transition-colors shrink-0"
            >
              + Create Handoff Note
            </button>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-3 bg-[#092634]/30 border-b border-[#F9F9F9]/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Filter Chips */}
          <div className="flex items-center bg-[#090B0D] p-0.5 rounded-lg border border-[#F9F9F9]/10">
            {(['all', 'project', 'session'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScopeFilter(s)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono uppercase transition-all ${
                  scopeFilter === s
                    ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                    : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
                }`}
              >
                {s === 'all' ? 'All Scopes' : `${s} Context`}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-2.5 py-1 text-xs text-[#F9F9F9] focus:outline-none focus:border-[#004E72] font-mono"
          >
            <option value="all">All Categories</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] || c}
              </option>
            ))}
          </select>

          {/* Show Archived Toggle */}
          <label className="flex items-center gap-1.5 text-xs text-[#F9F9F9]/70 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded bg-[#090B0D] border-[#F9F9F9]/20 text-[#004E72]"
            />
            <span className="font-mono text-[11px]">Show Archived</span>
          </label>
        </div>

        {/* Search Input */}
        <div className="relative w-48 sm:w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-[#F9F9F9]/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg pl-8 pr-3 py-1 text-xs text-[#F9F9F9] focus:outline-none focus:border-[#004E72]"
          />
        </div>
      </div>

      {/* Main Content Area (Two Columns) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Document List */}
        <div className="w-80 border-r border-[#F9F9F9]/10 flex flex-col overflow-y-auto shrink-0 bg-[#090B0D]/50 divide-y divide-[#F9F9F9]/5">
          {filteredDocuments.length === 0 ? (
            <div className="p-6 text-center text-[#F9F9F9]/40 text-xs font-mono">
              No context documents found matching filter.
            </div>
          ) : (
            filteredDocuments.map((doc) => {
              const isSelected = doc.id === selectedDocId;
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`w-full text-left p-3.5 transition-all flex flex-col gap-1.5 ${
                    isSelected
                      ? 'bg-[#092634] border-l-2 border-[#FF6E42]'
                      : 'hover:bg-[#092634]/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#F9F9F9] truncate">{doc.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#090B0D] text-[#F9F9F9]/80 border border-[#F9F9F9]/10 shrink-0">
                      Rev {doc.currentRevision}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-[#004E72]/40 text-[#F9F9F9]">
                      {CATEGORY_LABELS[doc.category] || doc.category}
                    </span>

                    <span
                      className={`px-1.5 py-0.5 rounded border text-[9px] ${getProvenanceBadgeStyle(
                        doc.provenance
                      )}`}
                    >
                      {doc.provenance}
                    </span>

                    {doc.scope === 'session' && (
                      <span className="px-1.5 py-0.5 rounded bg-[#092634] text-[#F9F9F9]/70 border border-[#F9F9F9]/10">
                        Session
                      </span>
                    )}

                    {doc.requiresVerification && (
                      <span className="px-1.5 py-0.5 rounded bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/30">
                        Needs Verification
                      </span>
                    )}

                    {doc.isArchived && (
                      <span className="px-1.5 py-0.5 rounded bg-[#090B0D] text-[#F9F9F9]/50 border border-[#F9F9F9]/20">
                        Archived
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] text-[#F9F9F9]/50 font-mono truncate">
                    Updated: {new Date(doc.updatedAt).toLocaleTimeString()}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Column: Selected Document Detail & History */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#090B0D]">
          {selectedDoc ? (
            <>
              {/* Document Subheader / Meta Bar */}
              <div className="p-4 bg-[#092634] border-b border-[#F9F9F9]/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#F9F9F9] truncate">{selectedDoc.title}</h3>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#FF6E42] text-[#090B0D]">
                      Revision {selectedDoc.currentRevision}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-mono text-[#F9F9F9]/70">
                    <span>Scope: <strong className="text-[#F9F9F9]">{selectedDoc.scope}</strong></span>
                    <span>&bull;</span>
                    <span>Category: <strong className="text-[#F9F9F9]">{CATEGORY_LABELS[selectedDoc.category] || selectedDoc.category}</strong></span>
                    <span>&bull;</span>
                    <span>Author: <strong className="text-[#F9F9F9]">{selectedDoc.author}</strong></span>
                    <span>&bull;</span>
                    <span title={selectedDoc.contentHash}>SHA: {selectedDoc.contentHash.slice(0, 8)}...</span>
                  </div>
                </div>

                {/* Document Actions */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-[#090B0D] p-0.5 rounded-lg border border-[#F9F9F9]/10">
                    <button
                      onClick={() => setActiveTab('content')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                        activeTab === 'content'
                          ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                          : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
                      }`}
                    >
                      Content
                    </button>
                    <button
                      onClick={() => setActiveTab('history')}
                      className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                        activeTab === 'history'
                          ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                          : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
                      }`}
                    >
                      <History size={12} />
                      <span>History ({revisions.length})</span>
                    </button>
                    {revisions.length > 1 && (
                      <button
                        onClick={() => setActiveTab('diff')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                          activeTab === 'diff'
                            ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                            : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
                        }`}
                      >
                        <GitCompare size={12} />
                        <span>Diff</span>
                      </button>
                    )}
                  </div>

                  {!selectedDoc.isArchived ? (
                    <>
                      <button
                        onClick={handleOpenEditModal}
                        className="px-2.5 py-1 rounded bg-[#004E72] text-[#F9F9F9] text-xs font-medium hover:bg-[#004E72]/80 transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setDocToArchive(selectedDoc);
                          setShowArchiveConfirm(true);
                        }}
                        className="p-1.5 rounded bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 hover:text-[#FF6E42] hover:border-[#FF6E42]/40 transition-all"
                        title="Archive Document"
                      >
                        <Archive size={13} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setDocToArchive(selectedDoc);
                        setShowArchiveConfirm(true);
                      }}
                      className="px-2.5 py-1 rounded bg-[#004E72] text-[#F9F9F9] text-xs font-medium flex items-center gap-1 hover:bg-[#004E72]/80 transition-all"
                    >
                      <RotateCcw size={12} />
                      <span>Restore</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Tab Views */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'content' && (
                  <div className="max-w-4xl mx-auto space-y-4">
                    {selectedDoc.requiresVerification && (
                      <div className="p-3 rounded-lg bg-[#FF6E42]/10 border border-[#FF6E42]/30 text-xs text-[#FF6E42] flex items-center gap-2">
                        <AlertTriangle size={14} />
                        <span>This document is marked as requiring verification against the repository.</span>
                      </div>
                    )}
                    <div className="bg-[#092634]/40 border border-[#F9F9F9]/10 rounded-xl p-5 shadow-sm font-mono text-xs leading-relaxed whitespace-pre-wrap">
                      {selectedDoc.contentMarkdown}
                    </div>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="max-w-4xl mx-auto space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-[#F9F9F9]/70 mb-2">
                      Revision Timeline ({revisions.length} total)
                    </h4>
                    {revisions.map((rev) => (
                      <div
                        key={rev.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          rev.revision === selectedDoc.currentRevision
                            ? 'bg-[#092634] border-[#FF6E42]/50'
                            : 'bg-[#092634]/30 border-[#F9F9F9]/10'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#F9F9F9]">
                              Revision {rev.revision}
                            </span>
                            {rev.revision === selectedDoc.currentRevision && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#FF6E42] text-[#090B0D] font-bold font-mono">
                                Current
                              </span>
                            )}
                            <span className="text-[11px] text-[#F9F9F9]/60 font-mono">
                              &bull; Author: {rev.author} ({rev.provenance})
                            </span>
                          </div>

                          <span className="text-[11px] text-[#F9F9F9]/50 font-mono">
                            {new Date(rev.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {rev.changeSummary && (
                          <div className="mt-2 text-xs text-[#F9F9F9]/80 font-sans italic">
                            &ldquo;{rev.changeSummary}&rdquo;
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-mono text-[#F9F9F9]/60">
                          <span>SHA: {rev.contentHash.slice(0, 12)}...</span>
                          {rev.revision !== selectedDoc.currentRevision && (
                            <button
                              onClick={() => {
                                setSelectedRevisionNum(rev.revision);
                                setActiveTab('diff');
                              }}
                              className="text-[#FF6E42] hover:underline flex items-center gap-1 font-semibold"
                            >
                              <span>Compare with Current</span>
                              <GitCompare size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'diff' && (
                  <div className="max-w-4xl mx-auto space-y-4">
                    <div className="p-3 bg-[#092634] border border-[#F9F9F9]/10 rounded-lg flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span>Comparing:</span>
                        <select
                          value={selectedRevisionNum || ''}
                          onChange={(e) => setSelectedRevisionNum(Number(e.target.value))}
                          className="bg-[#090B0D] border border-[#F9F9F9]/20 rounded px-2 py-0.5 text-xs text-[#F9F9F9]"
                        >
                          {revisions
                            .filter((r) => r.revision !== selectedDoc.currentRevision)
                            .map((r) => (
                              <option key={r.revision} value={r.revision}>
                                Revision {r.revision} ({new Date(r.createdAt).toLocaleDateString()})
                              </option>
                            ))}
                        </select>
                        <ArrowRight size={12} className="text-[#F9F9F9]/40" />
                        <span className="font-bold text-[#FF6E42]">Current (Rev {selectedDoc.currentRevision})</span>
                      </div>
                    </div>

                    <div className="border border-[#F9F9F9]/10 rounded-xl overflow-hidden bg-[#090B0D] font-mono text-xs">
                      {diffLinesData.map((part: Change, idx: number) => {
                        const isAdded = part.added;
                        const isRemoved = part.removed;
                        let lineStyle = 'text-[#F9F9F9]';
                        let prefix = ' ';
                        let bgStyle = 'bg-transparent';

                        if (isAdded) {
                          lineStyle = 'text-[#F9F9F9] font-medium';
                          prefix = '+';
                          bgStyle = 'bg-[#004E72]/40 border-l-2 border-[#004E72]';
                        } else if (isRemoved) {
                          lineStyle = 'text-[#FF6E42] font-medium';
                          prefix = '-';
                          bgStyle = 'bg-[#FF6E42]/10 border-l-2 border-[#FF6E42]';
                        }

                        return (
                          <div
                            key={idx}
                            className={`px-4 py-1 flex items-start gap-3 whitespace-pre-wrap ${bgStyle} ${lineStyle}`}
                          >
                            <span className="select-none text-[#F9F9F9]/40 shrink-0 font-bold">{prefix}</span>
                            <span className="flex-1">{part.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs font-mono text-[#F9F9F9]/40">
              Select a context document from the left list to view.
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-xl bg-[#092634] border border-[#F9F9F9]/10 rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#F9F9F9]">Create Context Document</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-[#F9F9F9]/50 hover:text-[#F9F9F9]"
              >
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded bg-[#FF6E42]/20 border border-[#FF6E42]/40 text-xs text-[#FF6E42] font-mono">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Scope</label>
                <select
                  value={formScope}
                  onChange={(e) => setFormScope(e.target.value as ContextScope)}
                  className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9]"
                >
                  <option value="project">Project Context (Survives Sessions)</option>
                  <option value="session" disabled={!session}>
                    Session Context ({session ? session.title : 'No active session'})
                  </option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Category</label>
                <input
                  type="text"
                  required
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g. architecture_decisions"
                  className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Document Title</label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Database Architecture Decisions"
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Markdown Content</label>
              <textarea
                required
                rows={8}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="# Decisions..."
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg p-3 text-xs text-[#F9F9F9] font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Change Summary</label>
              <input
                type="text"
                value={formChangeSummary}
                onChange={(e) => setFormChangeSummary(e.target.value)}
                placeholder="Initial creation rationale"
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9]"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-[#F9F9F9]/80 cursor-pointer">
              <input
                type="checkbox"
                checked={formRequiresVerification}
                onChange={(e) => setFormRequiresVerification(e.target.checked)}
              />
              <span>Flag as requiring verification against repository</span>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#F9F9F9]/10">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg bg-[#090B0D] text-[#F9F9F9]/70 text-xs hover:text-[#F9F9F9]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#FF6E42] text-[#090B0D] font-bold text-xs hover:bg-[#FF6E42]/90"
              >
                Create Document
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleEditSubmit}
            className="w-full max-w-xl bg-[#092634] border border-[#F9F9F9]/10 rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#F9F9F9]">
                Edit Document (Rev {selectedDoc.currentRevision} &rarr; {selectedDoc.currentRevision + 1})
              </h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-[#F9F9F9]/50 hover:text-[#F9F9F9]"
              >
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div className="p-2.5 rounded bg-[#FF6E42]/20 border border-[#FF6E42]/40 text-xs text-[#FF6E42] font-mono">
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Document Title</label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Category</label>
              <input
                type="text"
                required
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Markdown Content</label>
              <textarea
                required
                rows={8}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg p-3 text-xs text-[#F9F9F9] font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Change Summary (Required for history)</label>
              <input
                type="text"
                required
                value={formChangeSummary}
                onChange={(e) => setFormChangeSummary(e.target.value)}
                placeholder="What changed in this revision?"
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#F9F9F9]/10">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-lg bg-[#090B0D] text-[#F9F9F9]/70 text-xs hover:text-[#F9F9F9]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#FF6E42] text-[#090B0D] font-bold text-xs hover:bg-[#FF6E42]/90"
              >
                Save Revision {selectedDoc.currentRevision + 1}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Archive / Restore Confirmation Modal */}
      {showArchiveConfirm && docToArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md bg-[#092634] border border-[#F9F9F9]/10 rounded-xl p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#F9F9F9]">
              {docToArchive.isArchived ? 'Restore Context Document' : 'Archive Context Document'}
            </h3>
            <p className="text-xs text-[#F9F9F9]/80 font-mono leading-relaxed">
              {docToArchive.isArchived
                ? `Are you sure you want to restore "${docToArchive.title}"? It will reappear in active searches and be discoverable by ChatGPT.`
                : `Are you sure you want to archive "${docToArchive.title}"? Archived documents will no longer be attached to tasks or included in active context manifests.`}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#F9F9F9]/10">
              <button
                onClick={() => {
                  setShowArchiveConfirm(false);
                  setDocToArchive(null);
                }}
                className="px-4 py-2 rounded-lg bg-[#090B0D] text-[#F9F9F9]/70 text-xs hover:text-[#F9F9F9]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchiveToggle(docToArchive)}
                className={`px-4 py-2 rounded-lg text-xs font-bold ${
                  docToArchive.isArchived
                    ? 'bg-[#004E72] text-[#F9F9F9] hover:bg-[#004E72]/80'
                    : 'bg-[#FF6E42] text-[#090B0D] hover:bg-[#FF6E42]/90'
                }`}
              >
                {docToArchive.isArchived ? 'Confirm Restore' : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
