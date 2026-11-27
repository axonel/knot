import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Play,
  RotateCcw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Terminal,
  ShieldAlert,
  ListTodo,
  GitCommit,
} from 'lucide-react';
import type { Task, Session, AntigravityStatus, AntigravityUiEvent } from '../../../shared/types.js';
import { GitDiffViewer } from './GitDiffViewer.js';
import { TaskApprovalPreview } from './TaskApprovalPreview.js';
import { useTaskUndoManager, type PendingTaskAction } from '../../hooks/useTaskUndoManager.js';

interface AntigravityExecutionPanelProps {
  session: Session | null;
  onRefresh?: () => void;
  selectedTaskId?: string | null;
  onSelectTaskId?: (taskId: string | null) => void;
  onRegisterApproveHandler?: (handler: ((taskId: string) => Promise<void>) | null) => void;
  // Safety guardrail props from parent workspace
  scheduleUndoAction?: (task: Task, actionType: 'cancel' | 'reject') => void;
  undoAction?: (taskId: string) => void;
  isTaskPending?: (taskId: string) => boolean;
  getPendingAction?: (taskId: string) => PendingTaskAction | undefined;
}

export const AntigravityExecutionPanel: React.FC<AntigravityExecutionPanelProps> = ({
  session,
  onRefresh,
  selectedTaskId,
  onSelectTaskId,
  onRegisterApproveHandler,
  scheduleUndoAction,
  undoAction,
  isTaskPending,
  getPendingAction,
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<AntigravityStatus | null>(null);
  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'stream'>('queue');
  const [streamEvents, setStreamEvents] = useState<Array<{ type: string; timestamp: string; data: Record<string, unknown> }>>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inspectingTaskId, setInspectingTaskId] = useState<string | null>(null);

  const loadData = async () => {
    if (!session || !window.knotApi) {
      setTasks([]);
      setRunningTask(null);
      return;
    }

    try {
      const [taskList, running, agyStatus] = await Promise.all([
        window.knotApi.orchestration.listTasks(session.id),
        window.knotApi.orchestration.getRunningTask(session.id),
        window.knotApi.antigravity.getStatus(session.id),
      ]);
      setTasks(taskList);
      setRunningTask(running);
      setStatus(agyStatus);
    } catch (err) {
      console.error('[AntigravityExecutionPanel] Failed to load data:', err);
    }
  };

  // Local fallback undo manager if parent did not provide one (e.g. standalone test)
  const localUndoManager = useTaskUndoManager(async (taskId, actionType) => {
    if (!window.knotApi) return;
    try {
      // Revalidate task status before executing
      const taskList = session ? await window.knotApi.orchestration.listTasks(session.id) : [];
      const currentTask = taskList.find((t) => t.id === taskId);
      if (currentTask && ['succeeded', 'failed', 'cancelled'].includes(currentTask.status)) {
        return;
      }

      if (actionType === 'cancel') {
        await window.knotApi.orchestration.cancelTask(taskId, 'Cancelled by user');
      } else {
        await window.knotApi.orchestration.rejectTask(taskId, 'Rejected by user');
      }
      await loadData();
      onRefresh?.();
    } catch (err) {
      console.error(`[AntigravityExecutionPanel] Deferred ${actionType} failed:`, err);
    }
  });

  const effectiveScheduleUndo = scheduleUndoAction || localUndoManager.scheduleAction;
  const effectiveUndoAction = undoAction || localUndoManager.undoAction;
  const effectiveIsTaskPending = isTaskPending || localUndoManager.isTaskPending;
  const effectiveGetPendingAction = getPendingAction || localUndoManager.getPendingAction;

  const orchDebounceTimer = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadData();

    if (!window.knotApi) return;

    const debouncedLoad = () => {
      if (orchDebounceTimer.current) {
        clearTimeout(orchDebounceTimer.current);
      }
      orchDebounceTimer.current = setTimeout(() => {
        loadData();
      }, 150);
    };

    const unAgy = window.knotApi.antigravity.onEvent((evt: AntigravityUiEvent) => {
      if (evt.sessionId === session?.id) {
        setStreamEvents((prev) => [
          ...prev.slice(-49),
          { type: evt.type, timestamp: evt.timestamp, data: evt.data },
        ]);
        if (evt.type === 'status_changed' || evt.type === 'turn_completed') {
          debouncedLoad();
        }
      }
    });

    const unOrch = window.knotApi.orchestration.onEvent(() => {
      debouncedLoad();
    });

    return () => {
      if (orchDebounceTimer.current) {
        clearTimeout(orchDebounceTimer.current);
      }
      unAgy();
      unOrch();
    };
  }, [session?.id]);

  const handleApprove = async (taskId: string) => {
    if (!window.knotApi) return;
    // Safety check: Cannot approve task if it is scheduled for rejection
    const pending = effectiveGetPendingAction(taskId);
    if (pending && pending.actionType === 'reject') {
      return;
    }

    setActionLoading(taskId);
    try {
      await window.knotApi.orchestration.approveTask(taskId);
      await loadData();
      onRefresh?.();
    } catch (err) {
      console.error('[AntigravityExecutionPanel] Failed to approve task:', err);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    onRegisterApproveHandler?.(handleApprove);
    return () => {
      onRegisterApproveHandler?.(null);
    };
  }, [onRegisterApproveHandler, session?.id, effectiveGetPendingAction]);

  const handleReject = (targetTask: Task) => {
    // 3-second undo grace period
    if (effectiveIsTaskPending(targetTask.id)) return;
    effectiveScheduleUndo(targetTask, 'reject');
  };

  const handleCancel = (targetTask: Task) => {
    // 3-second undo grace period
    if (effectiveIsTaskPending(targetTask.id)) return;
    effectiveScheduleUndo(targetTask, 'cancel');
  };

  const handleRetry = async (taskId: string) => {
    if (!window.knotApi) return;
    setActionLoading(taskId);
    try {
      await window.knotApi.orchestration.retryTask(taskId);
      await loadData();
    } catch (err) {
      console.error('[AntigravityExecutionPanel] Failed to retry task:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (task: Task) => {
    // Check pending undo action first
    if (effectiveIsTaskPending(task.id)) {
      const pending = effectiveGetPendingAction(task.id);
      const isCancel = pending?.actionType === 'cancel';
      return (
        <span
          data-testid={`status-badge-pending-${task.id}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/50 animate-pulse"
        >
          <RotateCcw size={10} />
          <span>{isCancel ? `Cancelling (${pending?.secondsRemaining}s)` : `Rejecting (${pending?.secondsRemaining}s)`}</span>
        </span>
      );
    }

    const tStatus = task.status;
    const approvalStatus = task.approvalStatus;

    if (tStatus === 'awaiting_approval' || approvalStatus === 'awaiting_approval') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950/60 text-amber-300 border border-amber-800">
          <ShieldAlert size={10} /> Awaiting Approval
        </span>
      );
    }
    switch (tStatus) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#004E72]/40 text-[#F9F9F9] border border-[#004E72]">
            <Play size={10} className="text-[#FF6E42] animate-pulse" /> Running
          </span>
        );
      case 'succeeded':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800">
            <CheckCircle2 size={10} /> Succeeded
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-950/60 text-rose-300 border border-rose-800">
            <AlertTriangle size={10} /> Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#092634] text-[#F9F9F9]/50 border border-[#F9F9F9]/10">
            <XCircle size={10} /> Cancelled
          </span>
        );
      case 'queued':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#004E72]/20 text-[#F9F9F9]/80 border border-[#004E72]/40">
            <Clock size={10} /> Queued
          </span>
        );
    }
  };

  const awaitingApprovalTask = tasks.find((t) => t.status === 'awaiting_approval');
  const highlightedTask =
    (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : null) ||
    awaitingApprovalTask ||
    runningTask;

  const isHighlightedPending = highlightedTask ? effectiveIsTaskPending(highlightedTask.id) : false;
  const highlightedPendingAction = highlightedTask ? effectiveGetPendingAction(highlightedTask.id) : undefined;
  const isPendingRejection = isHighlightedPending && highlightedPendingAction?.actionType === 'reject';
  const isPendingCancellation = isHighlightedPending && highlightedPendingAction?.actionType === 'cancel';

  return (
    <div className="flex flex-col h-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-[#092634] border-b border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#FF6E42]" />
          <div>
            <h3 className="text-xs font-bold text-[#F9F9F9]">Antigravity Execution</h3>
            <div className="text-[10px] text-[#F9F9F9]/40 font-mono">
              Implementation Worker
            </div>
          </div>
        </div>

        {/* Worker Status Chip */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              status?.state === 'ready'
                ? 'bg-emerald-400'
                : status?.state === 'thinking' || status?.state === 'starting'
                ? 'bg-[#FF6E42] animate-pulse'
                : 'bg-zinc-500'
            }`}
          />
          <span className="text-[10px] font-mono uppercase text-[#F9F9F9]/60">
            {status?.state || 'Stopped'}
          </span>
        </div>
      </div>

      {/* Highlighted Active or Approval Card */}
      {highlightedTask && (
        <div
          data-testid={`highlighted-task-card-${highlightedTask.id}`}
          className={`p-3 border-b space-y-2 shrink-0 ${
            highlightedTask.status === 'awaiting_approval'
              ? 'bg-amber-950/20 border-amber-800/40'
              : 'bg-[#004E72]/10 border-[#004E72]/30'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#FF6E42]">
              {highlightedTask.status === 'awaiting_approval' ? 'Requires Approval' : 'Active Task'}
            </span>
            {getStatusBadge(highlightedTask)}
          </div>

          <h4 className="text-xs font-bold text-[#F9F9F9]">{highlightedTask.title}</h4>

          {/* Pending 3-Second Undo Grace Period Banner */}
          {isHighlightedPending && highlightedPendingAction && (
            <div
              data-testid={`active-task-pending-banner-${highlightedTask.id}`}
              className="p-2.5 rounded-lg bg-[#092634] border border-[#FF6E42]/60 space-y-1.5 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-[#FF6E42]/20 text-[#FF6E42]">
                    <RotateCcw size={13} className="animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#FF6E42]">
                      {isPendingCancellation ? 'Cancellation Scheduled' : 'Rejection Scheduled'}
                    </span>
                    <span
                      data-testid={`active-task-countdown-${highlightedTask.id}`}
                      className="ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#FF6E42] text-[#090B0D]"
                    >
                      {highlightedPendingAction.secondsRemaining}s remaining
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => effectiveUndoAction(highlightedTask.id)}
                  data-testid="undo-task-action-btn"
                  aria-label={`Undo ${highlightedPendingAction.actionType} for ${highlightedTask.title}`}
                  className="px-2.5 py-1 rounded bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] text-xs font-bold flex items-center gap-1 border border-[#FF6E42]/50 hover:border-[#FF6E42] cursor-pointer"
                >
                  <RotateCcw size={11} className="text-[#FF6E42]" />
                  <span>Undo</span>
                </button>
              </div>

              <p className="text-[10px] text-[#F9F9F9]/70 font-mono">
                {isPendingCancellation
                  ? 'Task execution continues in background until the grace period expires without undo.'
                  : 'Action will dispatch to backend when the 3-second timer expires.'}
              </p>
            </div>
          )}

          {/* Pre-Execution Proposal Preview */}
          <TaskApprovalPreview
            task={highlightedTask}
            defaultExpanded={highlightedTask.status === 'awaiting_approval'}
          />

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {highlightedTask.status === 'awaiting_approval' ? (
              <>
                <button
                  onClick={() => handleApprove(highlightedTask.id)}
                  disabled={actionLoading === highlightedTask.id || isPendingRejection}
                  title={isPendingRejection ? 'Task is currently scheduled for rejection' : 'Approve & Dispatch Task (Ctrl+Enter)'}
                  aria-label="Approve and Dispatch Task (Ctrl+Enter)"
                  className="px-3 py-1 rounded bg-[#004E72] hover:bg-[#004E72]/80 disabled:opacity-40 disabled:cursor-not-allowed text-[#F9F9F9] text-xs font-semibold flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6E42] cursor-pointer"
                >
                  <CheckCircle2 size={12} />
                  <span>Approve & Dispatch</span>
                  <kbd className="hidden sm:inline-flex px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#090B0D]/60 border border-[#F9F9F9]/20 text-[#F9F9F9]/70">
                    Ctrl+Enter
                  </kbd>
                </button>
                {isPendingRejection ? (
                  <button
                    onClick={() => effectiveUndoAction(highlightedTask.id)}
                    data-testid="undo-rejection-btn"
                    className="px-3 py-1 rounded bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] text-xs font-semibold flex items-center gap-1.5 border border-[#FF6E42] cursor-pointer"
                  >
                    <RotateCcw size={12} className="text-[#FF6E42]" />
                    <span>Undo Rejection</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleReject(highlightedTask)}
                    disabled={actionLoading === highlightedTask.id}
                    data-testid="reject-task-btn"
                    className="px-3 py-1 rounded bg-[#090B0D] hover:bg-rose-950/50 text-rose-300 border border-rose-800 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <XCircle size={12} />
                    <span>Reject</span>
                  </button>
                )}
              </>
            ) : highlightedTask.status === 'running' ? (
              <>
                {isPendingCancellation ? (
                  <button
                    onClick={() => effectiveUndoAction(highlightedTask.id)}
                    data-testid="undo-cancellation-btn"
                    className="px-2.5 py-1 rounded bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] text-xs font-semibold flex items-center gap-1.5 border border-[#FF6E42] cursor-pointer"
                  >
                    <RotateCcw size={12} className="text-[#FF6E42]" />
                    <span>Undo Cancellation</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleCancel(highlightedTask)}
                    disabled={actionLoading === highlightedTask.id}
                    data-testid="cancel-task-btn"
                    className="px-2.5 py-1 rounded bg-[#090B0D] hover:bg-rose-950/50 text-rose-300 border border-rose-800 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <XCircle size={12} />
                    <span>Cancel Task</span>
                  </button>
                )}
                <button
                  onClick={() => setInspectingTaskId(highlightedTask.id)}
                  className="px-2.5 py-1 rounded bg-[#004E72]/30 hover:bg-[#004E72] text-[#F9F9F9] text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                >
                  <GitCommit size={12} />
                  <span>Inspect Git Changes</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setInspectingTaskId(highlightedTask.id)}
                className="px-2.5 py-1 rounded bg-[#004E72]/30 hover:bg-[#004E72] text-[#F9F9F9] text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
              >
                <GitCommit size={12} />
                <span>Inspect Git Changes</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-[#F9F9F9]/10 bg-[#092634]/50 px-3 shrink-0">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-all ${
            activeTab === 'queue'
              ? 'border-[#FF6E42] text-[#F9F9F9] font-bold'
              : 'border-transparent text-[#F9F9F9]/50 hover:text-[#F9F9F9]'
          }`}
        >
          <ListTodo size={12} />
          <span>Task Queue ({tasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('stream')}
          className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-all ${
            activeTab === 'stream'
              ? 'border-[#FF6E42] text-[#F9F9F9] font-bold'
              : 'border-transparent text-[#F9F9F9]/50 hover:text-[#F9F9F9]'
          }`}
        >
          <Terminal size={12} />
          <span>Live Stream ({streamEvents.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'queue' ? (
          tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#F9F9F9]/40 text-xs">
              <ListTodo size={24} className="mb-2 text-[#004E72] opacity-50" />
              <p className="font-semibold text-[#F9F9F9]/70">No tasks in queue</p>
              <p className="text-[11px] mt-1 max-w-xs text-[#F9F9F9]/40">
                Tasks delegated by ChatGPT will automatically appear and queue here for execution.
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const isSelected = selectedTaskId === task.id || (!selectedTaskId && highlightedTask?.id === task.id);
              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTaskId?.(task.id)}
                  className={`p-2.5 rounded-lg bg-[#092634]/40 border space-y-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#FF6E42] bg-[#004E72]/20 shadow-xs'
                      : 'border-[#F9F9F9]/10 hover:border-[#004E72]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-xs text-[#F9F9F9] truncate">
                        {task.title}
                      </span>
                    </div>
                    {getStatusBadge(task)}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-[#F9F9F9]/40 pt-1">
                    <span>Priority: {task.priority || 'normal'}</span>
                    <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                  </div>

                  {/* Inspect or Retry buttons for items in list */}
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectingTaskId(task.id);
                      }}
                      className="px-2 py-0.5 rounded bg-[#090B0D] hover:bg-[#004E72]/40 text-[#F9F9F9]/80 hover:text-[#F9F9F9] border border-[#F9F9F9]/10 text-[10px] font-mono flex items-center gap-1 transition-all"
                    >
                      <GitCommit size={10} /> Inspect Changes
                    </button>
                    {['failed', 'cancelled'].includes(task.status) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(task.id);
                        }}
                        disabled={actionLoading === task.id}
                        className="px-2 py-0.5 rounded bg-[#004E72]/30 hover:bg-[#004E72] text-[#F9F9F9] text-[10px] font-mono flex items-center gap-1 transition-all"
                      >
                        <RotateCcw size={10} /> Retry Task
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* Live Stream view */
          streamEvents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#F9F9F9]/40 text-xs font-mono">
              Waiting for execution stream events...
            </div>
          ) : (
            <div className="space-y-1 font-mono text-[11px]">
              {streamEvents.map((evt, idx) => (
                <div key={idx} className="p-1.5 rounded bg-[#092634]/30 border border-[#F9F9F9]/5">
                  <div className="flex items-center justify-between text-[10px] text-[#FF6E42]">
                    <span>{evt.type}</span>
                    <span className="text-[#F9F9F9]/30">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <pre className="text-[10px] text-[#F9F9F9]/80 overflow-x-auto whitespace-pre-wrap mt-0.5">
                    {JSON.stringify(evt.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Git Diff Viewer Modal */}
      {inspectingTaskId && (
        <GitDiffViewer
          taskId={inspectingTaskId}
          onClose={() => setInspectingTaskId(null)}
        />
      )}
    </div>
  );
};
