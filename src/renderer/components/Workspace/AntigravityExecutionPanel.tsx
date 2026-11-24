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

interface AntigravityExecutionPanelProps {
  session: Session | null;
  onRefresh?: () => void;
}

export const AntigravityExecutionPanel: React.FC<AntigravityExecutionPanelProps> = ({ session }) => {
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

  useEffect(() => {
    loadData();

    if (!window.knotApi) return;

    const unAgy = window.knotApi.antigravity.onEvent((evt: AntigravityUiEvent) => {
      if (evt.sessionId === session?.id) {
        setStreamEvents((prev) => [
          ...prev.slice(-49),
          { type: evt.type, timestamp: evt.timestamp, data: evt.data },
        ]);
        if (evt.type === 'status_changed' || evt.type === 'turn_completed') {
          loadData();
        }
      }
    });

    const unOrch = window.knotApi.orchestration.onEvent(() => {
      loadData();
    });

    return () => {
      unAgy();
      unOrch();
    };
  }, [session?.id]);

  const handleApprove = async (taskId: string) => {
    if (!window.knotApi) return;
    setActionLoading(taskId);
    try {
      await window.knotApi.orchestration.approveTask(taskId);
      await loadData();
    } catch (err) {
      console.error('[AntigravityExecutionPanel] Failed to approve task:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (taskId: string) => {
    if (!window.knotApi) return;
    setActionLoading(taskId);
    try {
      await window.knotApi.orchestration.rejectTask(taskId, 'Rejected by user');
      await loadData();
    } catch (err) {
      console.error('[AntigravityExecutionPanel] Failed to reject task:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (taskId: string) => {
    if (!window.knotApi) return;
    setActionLoading(taskId);
    try {
      await window.knotApi.orchestration.cancelTask(taskId, 'Cancelled by user');
      await loadData();
    } catch (err) {
      console.error('[AntigravityExecutionPanel] Failed to cancel task:', err);
    } finally {
      setActionLoading(null);
    }
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

  const getStatusBadge = (tStatus: string, approvalStatus?: string | null) => {
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
  const highlightedTask = runningTask || awaitingApprovalTask;

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
            {getStatusBadge(highlightedTask.status, highlightedTask.approvalStatus)}
          </div>

          <h4 className="text-xs font-bold text-[#F9F9F9]">{highlightedTask.title}</h4>

          {highlightedTask.acceptanceCriteria && highlightedTask.acceptanceCriteria.length > 0 && (
            <div className="space-y-1 pt-1">
              <span className="text-[10px] font-mono text-[#F9F9F9]/40 uppercase">Acceptance Criteria</span>
              <ul className="text-[11px] text-[#F9F9F9]/70 space-y-0.5">
                {highlightedTask.acceptanceCriteria.map((c, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF6E42]" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {highlightedTask.status === 'awaiting_approval' ? (
              <>
                <button
                  onClick={() => handleApprove(highlightedTask.id)}
                  disabled={actionLoading === highlightedTask.id}
                  className="px-3 py-1 rounded bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  <CheckCircle2 size={12} />
                  <span>Approve & Dispatch</span>
                </button>
                <button
                  onClick={() => handleReject(highlightedTask.id)}
                  disabled={actionLoading === highlightedTask.id}
                  className="px-3 py-1 rounded bg-[#090B0D] hover:bg-rose-950/50 text-rose-300 border border-rose-800 text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  <XCircle size={12} />
                  <span>Reject</span>
                </button>
              </>
            ) : highlightedTask.status === 'running' ? (
              <>
                <button
                  onClick={() => handleCancel(highlightedTask.id)}
                  disabled={actionLoading === highlightedTask.id}
                  className="px-2.5 py-1 rounded bg-[#090B0D] hover:bg-rose-950/50 text-rose-300 border border-rose-800 text-xs font-medium flex items-center gap-1 transition-all"
                >
                  <XCircle size={12} />
                  <span>Cancel Task</span>
                </button>
                <button
                  onClick={() => setInspectingTaskId(highlightedTask.id)}
                  className="px-2.5 py-1 rounded bg-[#004E72]/30 hover:bg-[#004E72] text-[#F9F9F9] text-xs font-medium flex items-center gap-1 transition-all"
                >
                  <GitCommit size={12} />
                  <span>Inspect Git Changes</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setInspectingTaskId(highlightedTask.id)}
                className="px-2.5 py-1 rounded bg-[#004E72]/30 hover:bg-[#004E72] text-[#F9F9F9] text-xs font-medium flex items-center gap-1 transition-all"
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
            tasks.map((task) => (
              <div
                key={task.id}
                className="p-2.5 rounded-lg bg-[#092634]/40 border border-[#F9F9F9]/10 space-y-1.5 transition-all hover:border-[#004E72]/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-xs text-[#F9F9F9] truncate">
                      {task.title}
                    </span>
                  </div>
                  {getStatusBadge(task.status, task.approvalStatus)}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-[#F9F9F9]/40 pt-1">
                  <span>Priority: {task.priority || 'normal'}</span>
                  <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                </div>

                {/* Inspect or Retry buttons for items in list */}
                <div className="pt-1 flex items-center gap-2">
                  <button
                    onClick={() => setInspectingTaskId(task.id)}
                    className="px-2 py-0.5 rounded bg-[#090B0D] hover:bg-[#004E72]/40 text-[#F9F9F9]/80 hover:text-[#F9F9F9] border border-[#F9F9F9]/10 text-[10px] font-mono flex items-center gap-1 transition-all"
                  >
                    <GitCommit size={10} /> Inspect Changes
                  </button>
                  {['failed', 'cancelled'].includes(task.status) && (
                    <button
                      onClick={() => handleRetry(task.id)}
                      disabled={actionLoading === task.id}
                      className="px-2 py-0.5 rounded bg-[#004E72]/30 hover:bg-[#004E72] text-[#F9F9F9] text-[10px] font-mono flex items-center gap-1 transition-all"
                    >
                      <RotateCcw size={10} /> Retry Task
                    </button>
                  )}
                </div>
              </div>
            ))
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
