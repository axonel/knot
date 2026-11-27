import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Wrench,
  Database,
  Cpu,
  FolderGit2,
  Clock,
  FileCheck,
  ShieldAlert,
} from 'lucide-react';
import type { ReliabilityDiagnostics, ReconciliationReport } from '../../../shared/types.js';

interface ReliabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReliabilityModal: React.FC<ReliabilityModalProps> = ({ isOpen, onClose }) => {
  const [diagnostics, setDiagnostics] = useState<ReliabilityDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunReport, setLastRunReport] = useState<ReconciliationReport | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    if (!window.knotApi?.reliability) return;
    setLoading(true);
    setError(null);
    try {
      const data = await window.knotApi.reliability.getDiagnostics();
      setDiagnostics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReconcile = async () => {
    if (!window.knotApi?.reliability) return;
    setReconciling(true);
    setError(null);
    try {
      const report = await window.knotApi.reliability.reconcile();
      setLastRunReport(report);
      await fetchDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconciling(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostics();
    }
  }, [isOpen, fetchDiagnostics]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentReport = lastRunReport || diagnostics?.reconciliation.lastReport;

  const getStatusBadge = () => {
    const status = diagnostics?.status || 'unknown';
    if (status === 'healthy') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-[#004E72]/40 text-[#F9F9F9] border border-[#004E72]">
          <CheckCircle size={14} className="text-[#F9F9F9]" />
          System Healthy
        </span>
      );
    }
    if (status === 'degraded') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/50">
          <AlertTriangle size={14} />
          State Degraded
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-[#FF6E42] text-[#090B0D]">
        <AlertOctagon size={14} />
        Critical Failure
      </span>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reliability-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090B0D]/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl bg-[#092634] border border-[#F9F9F9]/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#090B0D] border-b border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#004E72]/30 text-[#FF6E42]">
              <Wrench size={20} />
            </div>
            <div>
              <h2 id="reliability-modal-title" className="text-sm font-bold text-[#F9F9F9] tracking-wide">
                Runtime Reliability & State Reconciliation
              </h2>
              <p className="text-xs text-[#F9F9F9]/60 font-mono mt-0.5">
                Atomic state coordination, in-flight recovery, and mailbox integrity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {diagnostics && getStatusBadge()}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#F9F9F9]/60 hover:text-[#F9F9F9] hover:bg-[#F9F9F9]/10 transition-colors"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Action Bar */}
        <div className="px-6 py-3 bg-[#092634] border-b border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
          <div className="text-xs text-[#F9F9F9]/70 font-mono">
            Last Checked: {diagnostics ? new Date(diagnostics.timestamp).toLocaleTimeString() : 'Never'}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchDiagnostics}
              disabled={loading || reconciling}
              className="px-3 py-1.5 rounded text-xs font-medium text-[#F9F9F9]/80 bg-[#090B0D] border border-[#F9F9F9]/15 hover:text-[#F9F9F9] hover:border-[#F9F9F9]/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleReconcile}
              disabled={reconciling || loading}
              className="px-3.5 py-1.5 rounded text-xs font-bold text-[#090B0D] bg-[#FF6E42] hover:bg-[#FF6E42]/90 flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            >
              <Wrench size={13} className={reconciling ? 'animate-spin' : ''} />
              <span>{reconciling ? 'Reconciling...' : 'Run State Reconciliation'}</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-lg bg-[#FF6E42]/10 border border-[#FF6E42]/40 text-[#FF6E42] text-xs flex items-center gap-2.5">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Subsystems Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Database Card */}
            <div className="p-4 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#F9F9F9]/70 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Database size={14} className="text-[#004E72]" /> SQLite Storage
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                    diagnostics?.database.available
                      ? 'bg-[#004E72]/40 text-[#F9F9F9]'
                      : 'bg-[#FF6E42]/20 text-[#FF6E42]'
                  }`}
                >
                  {diagnostics?.database.available ? 'Connected' : 'Unavailable'}
                </span>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">Schema Version:</span>
                  <span>v{diagnostics?.database.version || 7}</span>
                </div>
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">WAL Mode:</span>
                  <span>{diagnostics?.database.walMode ? 'Active' : 'Disabled'}</span>
                </div>
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">Busy Timeout:</span>
                  <span>{diagnostics?.database.busyTimeout || 5000}ms</span>
                </div>
              </div>
            </div>

            {/* Bridge Lifecycle Card */}
            <div className="p-4 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#F9F9F9]/70 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <FolderGit2 size={14} className="text-[#004E72]" /> Bridge Filesystem
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                    diagnostics?.bridge.status === 'watching'
                      ? 'bg-[#004E72]/40 text-[#F9F9F9]'
                      : diagnostics?.bridge.status === 'degraded'
                      ? 'bg-[#FF6E42]/20 text-[#FF6E42]'
                      : 'bg-[#FF6E42] text-[#090B0D]'
                  }`}
                >
                  {diagnostics?.bridge.status || 'unknown'}
                </span>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">Watchers Active:</span>
                  <span>{diagnostics?.bridge.activeWatchersCount ?? 0}</span>
                </div>
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">Pending Inbound:</span>
                  <span
                    className={
                      (diagnostics?.bridge.pendingInboundCount ?? 0) > 0 ? 'text-[#FF6E42] font-bold' : ''
                    }
                  >
                    {diagnostics?.bridge.pendingInboundCount ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">Rejected Archived:</span>
                  <span>{diagnostics?.bridge.rejectedCount ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Orchestration & Execution Card */}
            <div className="p-4 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#F9F9F9]/70 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Cpu size={14} className="text-[#004E72]" /> Task Execution
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                    diagnostics?.orchestration.activeProcessesCount
                      ? 'bg-[#004E72]/40 text-[#F9F9F9]'
                      : 'bg-[#F9F9F9]/10 text-[#F9F9F9]/60'
                  }`}
                >
                  {diagnostics?.orchestration.activeProcessesCount ? 'Active Turn' : 'Idle'}
                </span>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">Running / Queued:</span>
                  <span>
                    {diagnostics?.orchestration.runningTasksCount ?? 0} /{' '}
                    {diagnostics?.orchestration.queuedTasksCount ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">Awaiting Approval:</span>
                  <span>{diagnostics?.orchestration.awaitingApprovalCount ?? 0}</span>
                </div>
                <div className="flex justify-between text-[#F9F9F9]/80">
                  <span className="text-[#F9F9F9]/50">Interrupted (Restart):</span>
                  <span
                    className={
                      (diagnostics?.orchestration.interruptedTasksCount ?? 0) > 0
                        ? 'text-[#FF6E42] font-bold'
                        : ''
                    }
                  >
                    {diagnostics?.orchestration.interruptedTasksCount ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Reconciliation History Section */}
          <div className="rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#F9F9F9]/10 pb-3">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-[#FF6E42]" />
                <h3 className="text-xs font-bold text-[#F9F9F9] uppercase tracking-wider font-mono">
                  Latest State Reconciliation Report
                </h3>
              </div>
              {currentReport && (
                <span className="text-xs text-[#F9F9F9]/50 font-mono">
                  Duration: {currentReport.durationMs}ms
                </span>
              )}
            </div>

            {currentReport ? (
              <div className="space-y-4">
                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 rounded bg-[#092634]/50 border border-[#F9F9F9]/5">
                    <span className="text-[#F9F9F9]/50 block">Tasks Inspected</span>
                    <span className="text-[#F9F9F9] font-bold text-sm mt-0.5 block">
                      {currentReport.tasksReconciled}
                    </span>
                  </div>
                  <div className="p-3 rounded bg-[#092634]/50 border border-[#F9F9F9]/5">
                    <span className="text-[#F9F9F9]/50 block">Context Docs</span>
                    <span className="text-[#F9F9F9] font-bold text-sm mt-0.5 block">
                      {currentReport.contextDocsReconciled}
                    </span>
                  </div>
                  <div className="p-3 rounded bg-[#092634]/50 border border-[#F9F9F9]/5">
                    <span className="text-[#F9F9F9]/50 block">Issues Detected</span>
                    <span
                      className={`font-bold text-sm mt-0.5 block ${
                        currentReport.issuesDetected > 0 ? 'text-[#FF6E42]' : 'text-[#F9F9F9]'
                      }`}
                    >
                      {currentReport.issuesDetected}
                    </span>
                  </div>
                  <div className="p-3 rounded bg-[#092634]/50 border border-[#F9F9F9]/5">
                    <span className="text-[#F9F9F9]/50 block">Issues Repaired</span>
                    <span className="text-[#004E72] font-bold text-sm mt-0.5 block text-[#F9F9F9]">
                      {currentReport.issuesRepaired}
                    </span>
                  </div>
                </div>

                {/* Granular Report Details */}
                <div className="space-y-3 pt-2 text-xs font-mono">
                  {currentReport.details.interruptedTasksRecovered.length > 0 && (
                    <div className="p-3 rounded bg-[#FF6E42]/10 border border-[#FF6E42]/30 space-y-1">
                      <span className="font-bold text-[#FF6E42] flex items-center gap-1.5">
                        <ShieldAlert size={14} /> Interrupted Tasks Recovered (Marked for Manual Retry):
                      </span>
                      <ul className="list-disc list-inside text-[#F9F9F9]/80 pl-2 space-y-0.5">
                        {currentReport.details.interruptedTasksRecovered.map((tid) => (
                          <li key={tid}>Task ID: {tid}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentReport.details.contextDriftConflictsDetected.length > 0 && (
                    <div className="p-3 rounded bg-[#FF6E42]/10 border border-[#FF6E42]/30 space-y-1">
                      <span className="font-bold text-[#FF6E42] flex items-center gap-1.5">
                        <AlertTriangle size={14} /> On-Disk Context Drift Detected (Preserved SQLite Canonical State):
                      </span>
                      <ul className="list-disc list-inside text-[#F9F9F9]/80 pl-2 space-y-0.5">
                        {currentReport.details.contextDriftConflictsDetected.map((drift, i) => (
                          <li key={i}>{drift}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentReport.details.reMaterializedContextFiles.length > 0 && (
                    <div className="p-3 rounded bg-[#092634] border border-[#004E72]/40 space-y-1">
                      <span className="font-bold text-[#F9F9F9] flex items-center gap-1.5">
                        <FileCheck size={14} className="text-[#004E72]" /> Re-Materialized Missing Context Documents:
                      </span>
                      <ul className="list-disc list-inside text-[#F9F9F9]/80 pl-2 space-y-0.5">
                        {currentReport.details.reMaterializedContextFiles.map((cid) => (
                          <li key={cid}>Context ID: {cid}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentReport.details.reMaterializedResultFiles.length > 0 && (
                    <div className="p-3 rounded bg-[#092634] border border-[#004E72]/40 space-y-1">
                      <span className="font-bold text-[#F9F9F9] flex items-center gap-1.5">
                        <FileCheck size={14} className="text-[#004E72]" /> Re-Materialized Outbox Task Result Files:
                      </span>
                      <ul className="list-disc list-inside text-[#F9F9F9]/80 pl-2 space-y-0.5">
                        {currentReport.details.reMaterializedResultFiles.map((rid) => (
                          <li key={rid}>Task ID: {rid}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentReport.details.missedBridgeMessagesProcessed.length > 0 && (
                    <div className="p-3 rounded bg-[#092634] border border-[#004E72]/40 space-y-1">
                      <span className="font-bold text-[#F9F9F9] flex items-center gap-1.5">
                        <CheckCircle size={14} className="text-[#004E72]" /> Processed Inbound Mailbox Files:
                      </span>
                      <ul className="list-disc list-inside text-[#F9F9F9]/80 pl-2 space-y-0.5">
                        {currentReport.details.missedBridgeMessagesProcessed.map((file, i) => (
                          <li key={i} className="truncate">
                            {file}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentReport.details.errors.length > 0 && (
                    <div className="p-3 rounded bg-[#FF6E42]/10 border border-[#FF6E42]/30 space-y-1">
                      <span className="font-bold text-[#FF6E42] flex items-center gap-1.5">
                        <AlertTriangle size={14} /> Warnings / Reconciliation Diagnostics:
                      </span>
                      <ul className="list-disc list-inside text-[#F9F9F9]/80 pl-2 space-y-0.5">
                        {currentReport.details.errors.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentReport.issuesDetected === 0 && (
                    <div className="p-3 rounded bg-[#004E72]/15 border border-[#004E72]/30 text-xs text-[#F9F9F9]/80 flex items-center gap-2">
                      <CheckCircle size={15} className="text-[#F9F9F9] shrink-0" />
                      <span>All database records, filesystem mailboxes, and context documents are perfectly aligned. No issues detected.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-[#F9F9F9]/50 font-mono">
                No reconciliation has been executed yet. Click "Run State Reconciliation" above to perform a full system scan.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-[#090B0D] border-t border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#F9F9F9]/40 font-mono">
            Knot Runtime v1.0.0 &bull; SQLite Canonical State Authority
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-medium text-[#F9F9F9] bg-[#004E72] hover:bg-[#004E72]/80 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
