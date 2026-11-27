import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Search,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Copy,
  Check,
  ArrowLeft,
  FolderGit2,
  ShieldCheck,
  RefreshCw,
  GitCommit,
  ExternalLink,
  Layers,
  Sparkles,
  User,
  Bot,
  X,
} from 'lucide-react';
import type {
  Project,
  Session,
  Task,
  EventItem,
  TaskExecutionTrace,
  TaskTraceStage,
  EventActor,
  EventProvenance,
  EventSeverity,
} from '../../../shared/types.js';
import { GitDiffViewer } from './GitDiffViewer.js';
import { SpotlightCard, Magnet, CountUp } from '../ReactBits/index.js';

export interface UnifiedTimelinePanelProps {
  project: Project | null;
  session: Session | null;
  initialTaskId?: string | null;
  onRefresh?: () => void;
  onNavigateToTask?: (taskId: string) => void;
  onNavigateToContext?: () => void;
  onNavigateToConversation?: () => void;
}

type TimelineViewLevel = 'project' | 'session' | 'task';
type ActorFilter = 'all' | EventActor;
type CategoryFilter =
  | 'all'
  | 'tasks'
  | 'execution'
  | 'approvals'
  | 'git'
  | 'context'
  | 'verification'
  | 'errors';

export const UnifiedTimelinePanel: React.FC<UnifiedTimelinePanelProps> = ({
  project,
  session,
  initialTaskId,
  onRefresh,
  onNavigateToTask,
  onNavigateToContext,
  onNavigateToConversation,
}) => {
  // Navigation / Scope level
  const [viewLevel, setViewLevel] = useState<TimelineViewLevel>(
    initialTaskId ? 'task' : session ? 'session' : 'project'
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId || null);

  // Data states
  const [events, setEvents] = useState<EventItem[]>([]);
  const [taskTrace, setTaskTrace] = useState<TaskExecutionTrace | null>(null);
  const [sessionTasks, setSessionTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actorFilter, setActorFilter] = useState<ActorFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  // Accordion open/close states
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({
    assignment: true,
    queue: true,
    approval: true,
    execution: true,
    git: true,
    completion: true,
    verification: true,
  });

  // Export & Git Diff Modals
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json'>('markdown');
  const [exportContent, setExportContent] = useState<string>('');
  const [isExportCopied, setIsExportCopied] = useState<boolean>(false);
  const [showGitDiffModal, setShowGitDiffModal] = useState<boolean>(false);
  const [copiedCommit, setCopiedCommit] = useState<boolean>(false);

  // Load session tasks for dropdown selection
  useEffect(() => {
    if (!session || !window.knotApi?.orchestration) return;
    window.knotApi.orchestration
      .listTasks(session.id)
      .then((tasks) => setSessionTasks(tasks))
      .catch((err) => console.error('[UnifiedTimelinePanel] Error loading tasks:', err));
  }, [session?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showExportModal) {
          e.stopPropagation();
          e.preventDefault();
          setShowExportModal(false);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [showExportModal]);

  // Load events or trace based on view level and selected task
  const loadTimelineData = useCallback(async () => {
    if (!window.knotApi?.events) return;
    setLoading(true);
    setError(null);

    try {
      if (viewLevel === 'task' && selectedTaskId) {
        const trace = await window.knotApi.events.getTaskTrace(selectedTaskId);
        setTaskTrace(trace);
        setEvents(trace.events);
      } else if (viewLevel === 'session' && session) {
        const list = await window.knotApi.events.list(session.id, {
          projectId: project?.id,
          order: sortOrder,
        });
        setEvents(list);
        setTaskTrace(null);
      } else if (project) {
        const list = await window.knotApi.events.list({
          projectId: project.id,
          order: sortOrder,
        });
        setEvents(list);
        setTaskTrace(null);
      } else {
        setEvents([]);
        setTaskTrace(null);
      }
    } catch (err) {
      console.error('[UnifiedTimelinePanel] Error loading timeline:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [viewLevel, selectedTaskId, session?.id, project?.id, sortOrder]);

  useEffect(() => {
    loadTimelineData();
  }, [loadTimelineData]);

  // Handle switching to a task
  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    setViewLevel('task');
    if (onNavigateToTask) {
      onNavigateToTask(taskId);
    }
  };

  const handleBackToTimeline = () => {
    setSelectedTaskId(null);
    setViewLevel(session ? 'session' : 'project');
  };

  // Toggle single event payload expansion
  const toggleEventExpanded = (id: string) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle stage accordion
  const toggleStageExpanded = (stageName: string) => {
    setExpandedStages((prev) => ({
      ...prev,
      [stageName]: !prev[stageName],
    }));
  };

  // Handle trace export
  const handleOpenExport = async (format: 'markdown' | 'json') => {
    if (!selectedTaskId || !window.knotApi?.events?.exportTaskTrace) return;
    try {
      const content = await window.knotApi.events.exportTaskTrace(selectedTaskId, format);
      setExportFormat(format);
      setExportContent(content);
      setIsExportCopied(false);
      setShowExportModal(true);
    } catch (err) {
      console.error('[UnifiedTimelinePanel] Error exporting trace:', err);
    }
  };

  const handleCopyExport = async () => {
    if (!exportContent) return;
    await navigator.clipboard.writeText(exportContent);
    setIsExportCopied(true);
    setTimeout(() => setIsExportCopied(false), 2000);
  };

  const handleDownloadExport = () => {
    if (!exportContent) return;
    const blob = new Blob([exportContent], {
      type: exportFormat === 'json' ? 'application/json' : 'text/markdown',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-trace-${selectedTaskId || 'export'}.${exportFormat === 'json' ? 'json' : 'md'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCommit = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedCommit(true);
    setTimeout(() => setCopiedCommit(false), 2000);
  };

  // Filter events client-side for immediate responsiveness
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // 1. Actor filter
      if (actorFilter !== 'all' && ev.actor !== actorFilter) {
        return false;
      }

      // 2. Category filter
      if (categoryFilter !== 'all') {
        const type = ev.eventType.toLowerCase();
        if (categoryFilter === 'tasks' && !type.includes('task')) return false;
        if (categoryFilter === 'execution' && !type.includes('tool') && !type.includes('turn') && !type.includes('process')) return false;
        if (categoryFilter === 'approvals' && !type.includes('approval')) return false;
        if (categoryFilter === 'git' && !type.includes('git')) return false;
        if (categoryFilter === 'context' && !type.includes('context')) return false;
        if (categoryFilter === 'verification' && !type.includes('verif')) return false;
        if (categoryFilter === 'errors' && ev.severity !== 'error' && !type.includes('fail') && !type.includes('denied')) return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const titleMatch = (ev.title || '').toLowerCase().includes(query);
        const typeMatch = (ev.eventType || '').toLowerCase().includes(query);
        const actorMatch = (ev.actor || '').toLowerCase().includes(query);
        const provenanceMatch = (ev.provenance || '').toLowerCase().includes(query);
        const dataMatch = ev.data ? JSON.stringify(ev.data).toLowerCase().includes(query) : false;
        if (!titleMatch && !typeMatch && !actorMatch && !provenanceMatch && !dataMatch) {
          return false;
        }
      }

      return true;
    });
  }, [events, actorFilter, categoryFilter, searchQuery]);

  // Provenance Badge Formatter
  const renderProvenanceBadge = (provenance: EventProvenance | string) => {
    switch (provenance) {
      case 'chatgpt_reported':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#292C2F]/30 text-[#F0F0ED] border border-[#292C2F]">
            <Bot size={10} className="text-[#292C2F]" />
            ChatGPT Reported
          </span>
        );
      case 'antigravity_reported':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#E05252]/20 text-[#E05252] border border-[#E05252]/40">
            <Sparkles size={10} />
            Antigravity Reported
          </span>
        );
      case 'git_verified':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#292C2F]/40 text-[#F0F0ED] border border-[#F0F0ED]/20">
            <FolderGit2 size={10} className="text-[#292C2F]" />
            Git Verified
          </span>
        );
      case 'user_recorded':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#1B1D1F] text-[#F0F0ED] border border-[#F0F0ED]/30">
            <User size={10} />
            User Action
          </span>
        );
      case 'knot_observed':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#292C2F]/20 text-[#F0F0ED]/80 border border-[#292C2F]/50">
            <Layers size={10} />
            Knot Observed
          </span>
        );
    }
  };

  // Actor Badge Formatter
  const renderActorBadge = (actor: EventActor | string) => {
    switch (actor) {
      case 'chatgpt':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#292C2F] text-[#F0F0ED]">
            ChatGPT
          </span>
        );
      case 'antigravity':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#E05252] text-[#F0F0ED]">
            Antigravity
          </span>
        );
      case 'knot':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#1B1D1F] text-[#F0F0ED] border border-[#292C2F]">
            Knot
          </span>
        );
      case 'git':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#1B1D1F] text-[#292C2F] border border-[#292C2F]">
            Git
          </span>
        );
      case 'user':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#F0F0ED]/10 text-[#F0F0ED]">
            User
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1B1D1F] text-[#F0F0ED]/70">
            {actor}
          </span>
        );
    }
  };

  // Severity Indicator
  const renderSeverityDot = (severity?: EventSeverity) => {
    switch (severity) {
      case 'error':
        return <div className="w-2 h-2 rounded-full bg-[#E05252] shrink-0 shadow-[0_0_8px_#E05252]" title="Error" />;
      case 'warning':
      case 'warn':
        return <div className="w-2 h-2 rounded-full bg-[#E05252]/80 shrink-0" title="Warning" />;
      case 'success':
        return <div className="w-2 h-2 rounded-full bg-[#292C2F] shrink-0" title="Success" />;
      case 'info':
      default:
        return <div className="w-1.5 h-1.5 rounded-full bg-[#F0F0ED]/30 shrink-0" />;
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return iso;
    }
  };

  const formatDurationMs = (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return '—';
    if (ms < 1000) return `${ms}ms`;
    const secs = (ms / 1000).toFixed(1);
    if (ms < 60000) return `${secs}s`;
    const mins = Math.floor(ms / 60000);
    const remSecs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${remSecs}s`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#111213] text-[#F0F0ED] overflow-hidden">
      {/* Top Header & View Level Selector */}
      <div className="p-3 bg-[#1B1D1F] border-b border-[#F0F0ED]/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[#E05252]" />
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-[#F0F0ED]">
              Unified Execution Timeline
            </h2>
          </div>

          {/* Level Switcher: Project vs Session vs Task */}
          <div className="flex items-center bg-[#111213] p-0.5 rounded-lg border border-[#F0F0ED]/10">
            <button
              onClick={() => {
                setViewLevel('project');
                setSelectedTaskId(null);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                viewLevel === 'project'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              }`}
            >
              Project
            </button>
            <button
              onClick={() => {
                setViewLevel('session');
                setSelectedTaskId(null);
              }}
              disabled={!session}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                viewLevel === 'session'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              } ${!session ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Session
            </button>
            <button
              onClick={() => {
                if (sessionTasks.length > 0 && !selectedTaskId) {
                  setSelectedTaskId(sessionTasks[0].id);
                }
                setViewLevel('task');
              }}
              disabled={sessionTasks.length === 0}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                viewLevel === 'task'
                  ? 'bg-[#E05252] text-[#111213] font-bold'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              } ${sessionTasks.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <span>Task Trace</span>
              {selectedTaskId && <span className="text-[10px] font-mono">({selectedTaskId.slice(0, 6)})</span>}
            </button>
          </div>
        </div>

        {/* Task Selector (when on task view or when tasks exist) */}
        <div className="flex items-center gap-2">
          {sessionTasks.length > 0 && (
            <select
              value={selectedTaskId || ''}
              onChange={(e) => {
                if (e.target.value) handleSelectTask(e.target.value);
              }}
              className="bg-[#111213] text-xs font-mono border border-[#F0F0ED]/10 rounded px-2.5 py-1 text-[#F0F0ED] focus:outline-none focus:border-[#292C2F] max-w-[200px] truncate"
            >
              <option value="" disabled>
                Select Task Trace...
              </option>
              {sessionTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => {
              loadTimelineData();
              if (onRefresh) onRefresh();
            }}
            title="Refresh Timeline"
            className="p-1.5 rounded bg-[#111213] border border-[#F0F0ED]/10 text-[#F0F0ED]/70 hover:text-[#F0F0ED] hover:bg-[#292C2F]/20 transition-all text-xs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-2.5 bg-[#1B1D1F]/70 border-b border-[#F0F0ED]/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Search input */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#F0F0ED]/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, tools, commits..."
            className="w-full bg-[#111213] text-xs pl-8 pr-2.5 py-1 rounded border border-[#F0F0ED]/10 text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:outline-none focus:border-[#292C2F]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#F0F0ED]/40 hover:text-[#F0F0ED]"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Actor Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <span className="text-[10px] uppercase font-mono text-[#F0F0ED]/40 mr-1">Actor:</span>
          {(['all', 'chatgpt', 'antigravity', 'knot', 'user', 'git'] as ActorFilter[]).map((act) => (
            <button
              key={act}
              onClick={() => setActorFilter(act)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                actorFilter === act
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold'
                  : 'bg-[#111213] text-[#F0F0ED]/60 hover:text-[#F0F0ED] border border-[#F0F0ED]/10'
              }`}
            >
              {act === 'all' ? 'All' : act.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <span className="text-[10px] uppercase font-mono text-[#F0F0ED]/40 mr-1">Category:</span>
          {(
            [
              ['all', 'All'],
              ['tasks', 'Tasks'],
              ['execution', 'Execution'],
              ['approvals', 'Approvals'],
              ['git', 'Git'],
              ['context', 'Context'],
              ['verification', 'Verification'],
              ['errors', 'Errors'],
            ] as [CategoryFilter, string][]
          ).map(([cat, label]) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2 py-0.5 rounded text-[11px] transition-all ${
                categoryFilter === cat
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold'
                  : 'bg-[#111213] text-[#F0F0ED]/60 hover:text-[#F0F0ED] border border-[#F0F0ED]/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Chronological Sort Toggle */}
        <button
          onClick={() => setSortOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'))}
          title={`Order: ${sortOrder === 'ASC' ? 'Oldest first (Chronological)' : 'Newest first'}`}
          className="px-2 py-1 rounded bg-[#111213] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED]/70 hover:text-[#F0F0ED] font-mono flex items-center gap-1"
        >
          <span>{sortOrder === 'ASC' ? 'ASC ↑' : 'DESC ↓'}</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {error && (
          <div className="p-3 bg-[#E05252]/10 border border-[#E05252]/40 rounded-lg text-xs text-[#E05252] flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* LEVEL 3: TASK EXECUTION TRACE VIEW */}
        {viewLevel === 'task' && taskTrace ? (
          <div className="space-y-4">
            {/* Top Navigation & Task Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#F0F0ED]/10">
              <button
                onClick={handleBackToTimeline}
                className="flex items-center gap-1.5 text-xs text-[#F0F0ED]/70 hover:text-[#F0F0ED] font-mono transition-colors"
              >
                <ArrowLeft size={13} />
                <span>Back to {session ? 'Session' : 'Project'} Timeline</span>
              </button>

              <div className="flex items-center gap-2">
                <Magnet padding={8} disabled={false}>
                  <button
                    onClick={() => handleOpenExport('markdown')}
                    className="px-2.5 py-1 rounded bg-[#1B1D1F] border border-[#292C2F] text-xs text-[#F0F0ED] hover:bg-[#292C2F] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={12} />
                    <span>Export MD</span>
                  </button>
                </Magnet>
                <Magnet padding={8} disabled={false}>
                  <button
                    onClick={() => handleOpenExport('json')}
                    className="px-2.5 py-1 rounded bg-[#1B1D1F] border border-[#292C2F] text-xs text-[#F0F0ED] hover:bg-[#292C2F] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={12} />
                    <span>Export JSON</span>
                  </button>
                </Magnet>
              </div>
            </div>

            {/* Task Summary Banner */}
            <div className="p-4 bg-[#1B1D1F] rounded-lg border border-[#292C2F] space-y-3 shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#F0F0ED] truncate">
                      {taskTrace.task.title}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        taskTrace.summary.status === 'succeeded'
                          ? 'bg-[#292C2F] text-[#F0F0ED]'
                          : taskTrace.summary.status === 'failed'
                          ? 'bg-[#E05252] text-[#111213]'
                          : 'bg-[#E05252]/20 text-[#E05252]'
                      }`}
                    >
                      {taskTrace.summary.status}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#111213] text-[#F0F0ED]/60 border border-[#F0F0ED]/10">
                      mode: {taskTrace.summary.executionMode}
                    </span>
                  </div>
                  <div className="text-xs text-[#F0F0ED]/60 font-mono">
                    Task ID: <span className="text-[#F0F0ED]">{taskTrace.task.id}</span>
                  </div>
                </div>

                {/* Quick actions for task */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGitDiffModal(true)}
                    className="px-3 py-1.5 rounded bg-[#292C2F]/30 border border-[#292C2F] text-xs text-[#F0F0ED] hover:bg-[#292C2F] transition-all flex items-center gap-1.5 font-medium"
                  >
                    <FolderGit2 size={13} className="text-[#E05252]" />
                    <span>Inspect Git Diff</span>
                  </button>

                  {onNavigateToConversation && (
                    <button
                      onClick={onNavigateToConversation}
                      className="px-3 py-1.5 rounded bg-[#111213] border border-[#F0F0ED]/20 text-xs text-[#F0F0ED]/80 hover:text-[#F0F0ED] transition-all flex items-center gap-1.5 font-medium"
                    >
                      <ExternalLink size={12} />
                      <span>Conversation</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-[#F0F0ED]/10 text-xs">
                <div className="p-2 bg-[#111213] rounded border border-[#F0F0ED]/5">
                  <div className="text-[10px] uppercase font-mono text-[#F0F0ED]/50">Total Duration</div>
                  <div className="font-mono text-sm font-bold text-[#F0F0ED]">
                    {formatDurationMs(taskTrace.summary.totalDurationMs)}
                  </div>
                </div>

                <div className="p-2 bg-[#111213] rounded border border-[#F0F0ED]/5">
                  <div className="text-[10px] uppercase font-mono text-[#F0F0ED]/50">Queue Wait</div>
                  <div className="font-mono text-sm font-bold text-[#F0F0ED]">
                    {formatDurationMs(taskTrace.summary.queueDurationMs)}
                  </div>
                </div>

                <div className="p-2 bg-[#111213] rounded border border-[#F0F0ED]/5">
                  <div className="text-[10px] uppercase font-mono text-[#F0F0ED]/50">Execution Time</div>
                  <div className="font-mono text-sm font-bold text-[#E05252]">
                    {formatDurationMs(taskTrace.summary.executionDurationMs)}
                  </div>
                </div>

                <div className="p-2 bg-[#111213] rounded border border-[#F0F0ED]/5">
                  <div className="text-[10px] uppercase font-mono text-[#F0F0ED]/50">Approver</div>
                  <div className="font-mono text-xs text-[#F0F0ED] truncate">
                    {taskTrace.summary.isApproved
                      ? taskTrace.summary.approver || 'User Approved'
                      : 'Not Required'}
                  </div>
                </div>
              </div>

              {/* Verified Commit & Verification Info */}
              {(taskTrace.summary.verifiedCommit || taskTrace.summary.hasChatGptVerification) && (
                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[#F0F0ED]/10 text-xs font-mono">
                  {taskTrace.summary.verifiedCommit && (
                    <div className="flex items-center gap-1.5">
                      <GitCommit size={13} className="text-[#292C2F]" />
                      <span className="text-[#F0F0ED]/60">Verified Commit:</span>
                      <span className="text-[#F0F0ED] font-bold">
                        {taskTrace.summary.verifiedCommit.slice(0, 8)}
                      </span>
                      <button
                        onClick={() => handleCopyCommit(taskTrace.summary.verifiedCommit!)}
                        title="Copy commit hash"
                        className="text-[#F0F0ED]/40 hover:text-[#F0F0ED]"
                      >
                        {copiedCommit ? <Check size={11} className="text-[#292C2F]" /> : <Copy size={11} />}
                      </button>
                    </div>
                  )}

                  {taskTrace.summary.hasChatGptVerification && (
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={13} className="text-[#E05252]" />
                      <span className="text-[#E05252] font-semibold">ChatGPT Verified:</span>
                      <span className="text-[#F0F0ED]/80 truncate max-w-sm">
                        {taskTrace.summary.chatGptVerificationSummary || 'Verified by ChatGPT'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 7 Stages Accordion */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#F0F0ED]/60 px-1">
                7-Stage Execution Lifecycle
              </h3>

              {taskTrace.stages.map((stage: TaskTraceStage, idx: number) => {
                const isExpanded = Boolean(expandedStages[stage.name]);
                const isSuccess = stage.status === 'completed';
                const isFail = stage.status === 'failed';
                const isPending = stage.status === 'pending';

                return (
                  <div
                    key={stage.name}
                    className="bg-[#1B1D1F] rounded-lg border border-[#F0F0ED]/10 overflow-hidden"
                  >
                    {/* Stage Header */}
                    <button
                      onClick={() => toggleStageExpanded(stage.name)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#292C2F]/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono ${
                            isSuccess
                              ? 'bg-[#292C2F] text-[#F0F0ED]'
                              : isFail
                              ? 'bg-[#E05252] text-[#111213]'
                              : isPending
                              ? 'bg-[#111213] text-[#F0F0ED]/40 border border-[#F0F0ED]/20'
                              : 'bg-[#E05252]/20 text-[#E05252]'
                          }`}
                        >
                          {idx + 1}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#F0F0ED]">{stage.label}</span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                                isSuccess
                                  ? 'text-[#F0F0ED] bg-[#292C2F]/40'
                                  : isFail
                                  ? 'text-[#E05252] bg-[#E05252]/20'
                                  : 'text-[#F0F0ED]/40 bg-[#111213]'
                              }`}
                            >
                              {stage.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#F0F0ED]/50">{stage.description}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-mono text-[#F0F0ED]/40">
                          {stage.events.length} {stage.events.length === 1 ? 'event' : 'events'}
                        </span>
                        {isExpanded ? (
                          <ChevronDown size={14} className="text-[#F0F0ED]/50" />
                        ) : (
                          <ChevronRight size={14} className="text-[#F0F0ED]/50" />
                        )}
                      </div>
                    </button>

                    {/* Stage Events Body */}
                    {isExpanded && (
                      <div className="p-3 bg-[#111213]/50 border-t border-[#F0F0ED]/10 space-y-2">
                        {stage.events.length === 0 ? (
                          <div className="text-center py-3 text-xs text-[#F0F0ED]/40 font-mono italic">
                            No events recorded for this stage yet.
                          </div>
                        ) : (
                          stage.events.map((ev) => (
                            <div
                              key={ev.id}
                              className="p-2.5 rounded bg-[#1B1D1F]/60 border border-[#F0F0ED]/5 hover:border-[#292C2F]/50 transition-colors space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {renderSeverityDot(ev.severity)}
                                  <span className="text-xs font-semibold text-[#F0F0ED]">
                                    {ev.title || ev.eventType}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[11px]">
                                  {renderActorBadge(ev.actor)}
                                  {renderProvenanceBadge(ev.provenance)}
                                  <span className="text-[#F0F0ED]/40">{formatTimestamp(ev.timestamp)}</span>
                                </div>
                              </div>

                              {/* Clickable payload expansion */}
                              {ev.data && Object.keys(ev.data).length > 0 && (
                                <div>
                                  <button
                                    onClick={() => toggleEventExpanded(ev.id)}
                                    className="text-[10px] font-mono text-[#292C2F] hover:text-[#F0F0ED] flex items-center gap-1 mt-1"
                                  >
                                    {expandedEventIds.has(ev.id) ? (
                                      <>
                                        <ChevronDown size={10} /> Hide details
                                      </>
                                    ) : (
                                      <>
                                        <ChevronRight size={10} /> View payload details
                                      </>
                                    )}
                                  </button>

                                  {expandedEventIds.has(ev.id) && (
                                    <pre className="mt-1.5 p-2 bg-[#111213] rounded border border-[#F0F0ED]/10 text-[10px] font-mono text-[#F0F0ED]/80 overflow-x-auto max-h-48">
                                      {JSON.stringify(ev.data, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* LEVEL 1 & 2: PROJECT AND SESSION TIMELINE VIEW */
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 text-xs text-[#F0F0ED]/60 font-mono">
              <span>
                Showing <CountUp to={filteredEvents.length} /> of <CountUp to={events.length} /> events
              </span>
              <span>Sorted {sortOrder === 'ASC' ? 'oldest first' : 'newest first'}</span>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="text-center py-12 bg-[#1B1D1F] rounded-lg border border-[#F0F0ED]/10 space-y-2">
                <Clock size={28} className="mx-auto text-[#F0F0ED]/20" />
                <div className="text-xs font-mono text-[#F0F0ED]/60">No events match the selected criteria.</div>
              </div>
            ) : (
              <div className="relative pl-6 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#292C2F]/40">
                {filteredEvents.map((ev) => {
                  const isExpanded = expandedEventIds.has(ev.id);
                  const isError = ev.severity === 'error' || ev.eventType.includes('failed');

                  return (
                    <SpotlightCard
                      key={ev.id}
                      spotlightColor="rgba(224, 82, 82, 0.08)"
                      className="relative bg-[#1B1D1F] p-3 rounded-lg border border-[#292C2F] hover:border-[#E05252]/40 transition-colors space-y-2"
                    >
                      {/* Timeline Dot on the line */}
                      <div
                        className={`absolute -left-[23px] top-4 w-3 h-3 rounded-full border-2 border-[#111213] ${
                          isError ? 'bg-[#E05252]' : 'bg-[#292C2F]'
                        }`}
                      />

                      {/* Event Row Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {renderSeverityDot(ev.severity)}
                          <span className="text-xs font-bold text-[#F0F0ED] truncate">
                            {ev.title || ev.eventType}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {renderActorBadge(ev.actor)}
                          {renderProvenanceBadge(ev.provenance)}
                          <span className="text-[11px] font-mono text-[#F0F0ED]/40">
                            {formatTimestamp(ev.timestamp)}
                          </span>
                        </div>
                      </div>

                      {/* Context / Task / Navigation Links */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        {ev.taskId && (
                          <button
                            onClick={() => handleSelectTask(ev.taskId!)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-[#E05252] hover:underline"
                          >
                            <Sparkles size={11} />
                            <span>View Task Trace ({ev.taskId.slice(0, 6)})</span>
                          </button>
                        )}

                        {ev.data && typeof ev.data.contextId === 'string' && onNavigateToContext && (
                          <button
                            onClick={onNavigateToContext}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-[#292C2F] hover:underline"
                          >
                            <ExternalLink size={11} />
                            <span>View in Context Vault</span>
                          </button>
                        )}
                      </div>

                      {/* Expandable Payload preview */}
                      {ev.data && Object.keys(ev.data).length > 0 && (
                        <div>
                          <button
                            onClick={() => toggleEventExpanded(ev.id)}
                            className="text-[10px] font-mono text-[#292C2F] hover:text-[#F0F0ED] flex items-center gap-1"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronDown size={10} /> Hide details
                              </>
                            ) : (
                              <>
                                <ChevronRight size={10} /> Show details
                              </>
                            )}
                          </button>

                          {isExpanded && (
                            <pre className="mt-1.5 p-2 bg-[#111213] rounded border border-[#F0F0ED]/10 text-[10px] font-mono text-[#F0F0ED]/80 overflow-x-auto max-h-48">
                              {JSON.stringify(ev.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </SpotlightCard>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Trace Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#1B1D1F] border border-[#292C2F] rounded-xl max-w-2xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#F0F0ED]/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download size={16} className="text-[#E05252]" />
                <h3 className="text-sm font-bold font-mono text-[#F0F0ED]">
                  Export Task Trace ({exportFormat.toUpperCase()})
                </h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-[#F0F0ED]/60 hover:text-[#F0F0ED]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <pre className="p-3 bg-[#111213] rounded-lg border border-[#F0F0ED]/10 text-xs font-mono text-[#F0F0ED]/90 overflow-x-auto max-h-[50vh] whitespace-pre-wrap">
                {exportContent}
              </pre>
            </div>

            <div className="px-4 py-3 border-t border-[#F0F0ED]/10 flex items-center justify-end gap-2 bg-[#111213]">
              <button
                onClick={handleCopyExport}
                className="px-3 py-1.5 rounded bg-[#1B1D1F] border border-[#292C2F] text-xs font-medium text-[#F0F0ED] hover:bg-[#292C2F] transition-colors flex items-center gap-1.5"
              >
                {isExportCopied ? <Check size={12} className="text-[#292C2F]" /> : <Copy size={12} />}
                <span>{isExportCopied ? 'Copied!' : 'Copy to Clipboard'}</span>
              </button>

              <button
                onClick={handleDownloadExport}
                className="px-3 py-1.5 rounded bg-[#292C2F] text-xs font-bold text-[#F0F0ED] hover:bg-[#292C2F]/80 transition-colors flex items-center gap-1.5"
              >
                <Download size={12} />
                <span>Download File</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Git Diff Viewer Modal */}
      {showGitDiffModal && selectedTaskId && (
        <GitDiffViewer taskId={selectedTaskId} onClose={() => setShowGitDiffModal(false)} />
      )}
    </div>
  );
};
