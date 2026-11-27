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
import { SpotlightCard, Magnet, CountUp } from '../ReactBits/index.js';

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

  // Expose handleApprove to parent via callback prop for global Ctrl+Enter shortcut
  useEffect(() => {
    if (onRegisterApproveHandler) {
      onRegisterApproveHandler(handleApprove);
      return () => onRegisterApproveHandler(null);
    }
  }, [onRegisterApproveHandler, session?.id]);

  // Three-second undoable reject
  const handleReject = (task: Task) => {
    effectiveScheduleUndo(task, 'reject');
  };

  // Three-second undoable cancel
  const handleCancel = (task: Task) => {
    effectiveScheduleUndo(task, 'cancel');
  };

  const handleRetry = async (taskId: string) => {
    if (!window.knotApi) return;
    setActionLoading(taskId);
    try {
      await window.knotApi.orchestration.retryTask(taskId);
      await loadData();
      onRefresh?.();
    } catch (err) {
      console.error('[AntigravityExecutionPanel] Retry failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (task: Task) => {
    switch (task.status) {
      case 'awaiting_approval':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#E05252] border border-[#E05252]/40">
            <AlertTriangle size={10} className="text-[#E05252]" /> Awaiting Approval
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#E05252] border border-[#E05252]/40">
            <Play size={10} className="text-[#E05252] animate-pulse" /> Running
          </span>
        );
      case 'succeeded':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#F0F0ED] border border-emerald-500/40">
            <CheckCircle2 size={10} className="text-emerald-400" /> Succeeded
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#E05252] border border-[#E05252]/50">
            <XCircle size={10} className="text-[#E05252]" /> Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#A5A5A0] border border-[#292C2F]">
            <XCircle size={10} className="text-[#A5A5A0]" /> Cancelled
          </span>
        );
      case 'queued':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#111213] text-[#A5A5A0] border border-[#292C2F]">
            <Clock size={10} className="text-[#A5A5A0]" /> Queued
          </span>
        );
    }
  };

  // Determine highlighted task: priority to running, awaiting_approval, or selected task
  const activeOrPendingTask = tasks.find(
    (t) => t.status === 'running' || t.status === 'awaiting_approval'
  );
  const highlightedTask =
    (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : null) ||
    runningTask ||
    activeOrPendingTask ||
    tasks[0] ||
    null;

  const isHighlightedPending = highlightedTask ? effectiveIsTaskPending(highlightedTask.id) : false;
  const highlightedPendingAction = highlightedTask ? effectiveGetPendingAction(highlightedTask.id) : undefined;
  const isPendingCancellation = highlightedPendingAction?.actionType === 'cancel';
  const isPendingRejection = highlightedPendingAction?.actionType === 'reject';

  return (
    <div className="flex flex-col h-full bg-[#1B1D1F] border border-[#292C2F] rounded-xl overflow-hidden shadow-md">
      {/* Header */}
      <div className="px-4 py-3 bg-[#1B1D1F] border-b border-[#292C2F] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#E05252]" />
          <div>
            <h3 className="text-xs font-bold text-[#F0F0ED]">Antigravity Execution</h3>
            <div className="text-[10px] text-[#A5A5A0] font-mono">
              Deterministic task execution engine
            </div>
          </div>
        </div>

        {/* Process Status Pill */}
        <div className="flex items-center gap-1.5">
          {status?.state === 'running' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#292C2F] text-[#E05252] border border-[#E05252]/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E05252] animate-ping" />
              Running
            </span>
          ) : status?.state === 'error' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#292C2F] text-[#E05252] border border-[#E05252]">
              <ShieldAlert size={10} /> Error
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[#111213] text-[#A5A5A0] border border-[#292C2F]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A5A5A0]" />
              Idle
            </span>
          )}
        </div>
      </div>

      {/* Active / Highlighted Task Banner */}
      {highlightedTask && (
        <div
          data-testid={`highlighted-task-card-${highlightedTask.id}`}
          className={`p-3.5 border-b space-y-2 shrink-0 ${
            highlightedTask.status === 'awaiting_approval'
              ? 'bg-[#111213] border-[#E05252]/40'
              : 'bg-[#111213] border-[#292C2F]'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E05252]">
              {highlightedTask.status === 'awaiting_approval' ? 'Requires Approval' : 'Active Task'}
            </span>
            {getStatusBadge(highlightedTask)}
          </div>

          <h4 className="text-xs font-bold text-[#F0F0ED]">{highlightedTask.title}</h4>

          {/* Pending 3-Second Undo Grace Period Banner */}
          {isHighlightedPending && highlightedPendingAction && (
            <div
              data-testid={`active-task-pending-banner-${highlightedTask.id}`}
              className="p-2.5 rounded-lg bg-[#1B1D1F] border border-[#E05252]/60 space-y-1.5 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-[#E05252]/20 text-[#E05252]">
                    <RotateCcw size={13} className="animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E05252]">
                      {isPendingCancellation ? 'Cancellation Scheduled' : 'Rejection Scheduled'}
                    </span>
                    <span
                      data-testid={`active-task-countdown-${highlightedTask.id}`}
                      className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#E05252] text-[#F0F0ED]"
                    >
                      {highlightedPendingAction.secondsRemaining}s remaining
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => effectiveUndoAction(highlightedTask.id)}
                  data-testid="undo-task-action-btn"
                  aria-label={`Undo ${highlightedPendingAction.actionType} for ${highlightedTask.title}`}
                  className="px-2.5 py-1 rounded bg-[#292C2F] hover:bg-[#32363a] text-[#F0F0ED] text-xs font-bold flex items-center gap-1 border border-[#E05252] cursor-pointer"
                >
                  <RotateCcw size={11} className="text-[#E05252]" />
                  <span>Undo</span>
                </button>
              </div>

              <p className="text-[10px] text-[#A5A5A0] font-mono">
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
                <Magnet padding={12} disabled={false}>
                  <button
                    onClick={() => handleApprove(highlightedTask.id)}
                    disabled={actionLoading === highlightedTask.id || isPendingRejection}
                    title={isPendingRejection ? 'Task is currently scheduled for rejection' : 'Approve & Dispatch Task (Ctrl+Enter)'}
                    aria-label="Approve and Dispatch Task (Ctrl+Enter)"
                    className="px-3 py-1.5 rounded bg-[#E05252] hover:bg-[#ef6565] disabled:opacity-40 disabled:cursor-not-allowed text-[#F0F0ED] text-xs font-semibold flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 size={12} />
                    <span>Approve & Dispatch</span>
                    <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#111213] border border-white/20 text-[#F0F0ED]">
                      Ctrl+Enter
                    </kbd>
                  </button>
                </Magnet>
                {isPendingRejection ? (
                  <button
                    onClick={() => effectiveUndoAction(highlightedTask.id)}
                    data-testid="undo-rejection-btn"
                    className="px-3 py-1 rounded bg-[#292C2F] hover:bg-[#32363a] text-[#F0F0ED] text-xs font-semibold flex items-center gap-1.5 border border-[#E05252] cursor-pointer"
                  >
                    <RotateCcw size={12} className="text-[#E05252]" />
                    <span>Undo Rejection</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleReject(highlightedTask)}
                    disabled={actionLoading === highlightedTask.id}
                    data-testid="reject-task-btn"
                    className="px-3 py-1 rounded bg-[#111213] hover:bg-rose-950/50 text-[#E05252] border border-[#E05252]/40 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
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
                    className="px-2.5 py-1 rounded bg-[#292C2F] hover:bg-[#32363a] text-[#F0F0ED] text-xs font-semibold flex items-center gap-1.5 border border-[#E05252] cursor-pointer"
                  >
                    <RotateCcw size={12} className="text-[#E05252]" />
                    <span>Undo Cancellation</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleCancel(highlightedTask)}
                    disabled={actionLoading === highlightedTask.id}
                    data-testid="cancel-task-btn"
                    className="px-2.5 py-1 rounded bg-[#111213] hover:bg-rose-950/50 text-[#E05252] border border-[#E05252]/40 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <XCircle size={12} />
                    <span>Cancel Task</span>
                  </button>
                )}
                <button
                  onClick={() => setInspectingTaskId(highlightedTask.id)}
                  className="px-2.5 py-1 rounded bg-[#292C2F] hover:bg-[#32363a] text-[#F0F0ED] text-xs font-medium flex items-center gap-1 transition-all cursor-pointer border border-[#292C2F]"
                >
                  <GitCommit size={12} />
                  <span>Inspect Git Changes</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setInspectingTaskId(highlightedTask.id)}
                className="px-2.5 py-1 rounded bg-[#292C2F] hover:bg-[#32363a] text-[#F0F0ED] text-xs font-medium flex items-center gap-1 transition-all cursor-pointer border border-[#292C2F]"
              >
                <GitCommit size={12} />
                <span>Inspect Git Changes</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-[#292C2F] bg-[#111213] px-3 shrink-0">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'queue'
              ? 'border-[#E05252] text-[#F0F0ED] font-bold'
              : 'border-transparent text-[#A5A5A0] hover:text-[#F0F0ED]'
          }`}
        >
          <ListTodo size={12} />
          <span>Task Queue (<CountUp to={tasks.length} />)</span>
        </button>

        <button
          onClick={() => setActiveTab('stream')}
          className={`px-3 py-2 text-xs font-medium border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'stream'
              ? 'border-[#E05252] text-[#F0F0ED] font-bold'
              : 'border-transparent text-[#A5A5A0] hover:text-[#F0F0ED]'
          }`}
        >
          <Terminal size={12} />
          <span>Live Stream (<CountUp to={streamEvents.length} />)</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#111213]">
        {activeTab === 'queue' ? (
          tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#A5A5A0] text-xs">
              <ListTodo size={24} className="mb-2 text-[#E05252] opacity-50" />
              <p className="font-semibold text-[#F0F0ED]">No tasks in queue</p>
              <p className="text-[11px] mt-1 max-w-xs text-[#A5A5A0]">
                Tasks delegated by ChatGPT will automatically appear and queue here for execution.
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const isSelected = selectedTaskId === task.id || (!selectedTaskId && highlightedTask?.id === task.id);
              return (
                <SpotlightCard
                  key={task.id}
                  spotlightColor="rgba(224, 82, 82, 0.1)"
                  onClick={() => onSelectTaskId?.(task.id)}
                  className={`p-2.5 rounded-lg bg-[#1B1D1F] border space-y-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#E05252] bg-[#292C2F]/50 shadow-xs'
                      : 'border-[#292C2F] hover:border-[#E05252]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-xs text-[#F0F0ED] truncate">
                        {task.title}
                      </span>
                    </div>
                    {getStatusBadge(task)}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-[#A5A5A0] pt-1">
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
                      className="px-2 py-0.5 rounded bg-[#111213] hover:bg-[#292C2F] text-[#F0F0ED] border border-[#292C2F] text-[10px] font-mono flex items-center gap-1 transition-all cursor-pointer"
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
                        className="px-2 py-0.5 rounded bg-[#292C2F] hover:bg-[#32363a] text-[#F0F0ED] text-[10px] font-mono flex items-center gap-1 transition-all cursor-pointer border border-[#292C2F]"
                      >
                        <RotateCcw size={10} /> Retry Task
                      </button>
                    )}
                  </div>
                </SpotlightCard>
              );
            })
          )
        ) : (
          /* Live Stream view */
          streamEvents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#A5A5A0] text-xs font-mono">
              Waiting for execution stream events...
            </div>
          ) : (
            <div className="space-y-1 font-mono text-[11px]">
              {streamEvents.map((evt, idx) => (
                <div key={idx} className="p-2 rounded bg-[#1B1D1F] border border-[#292C2F]">
                  <div className="flex items-center justify-between text-[10px] text-[#E05252]">
                    <span className="font-bold">{evt.type}</span>
                    <span className="text-[#A5A5A0]">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <pre className="text-[10px] text-[#F0F0ED] overflow-x-auto whitespace-pre-wrap mt-1 font-mono">
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
