import React, { useState, useEffect, useCallback } from 'react';
import { LogEntry, ProcessStatusInfo } from '../../../shared/types.js';
import { DesktopCommanderLogo } from '../DesktopCommanderLogo.js';
import { StatusBadge } from './StatusBadge.js';
import { DiagnosticLogs } from './DiagnosticLogs.js';
import { StopProcessModal } from '../Safety/StopProcessModal.js';
import { Play, Square, Loader2, AlertCircle, Wifi, Key } from 'lucide-react';

export const ProcessManager: React.FC = () => {
  const [status, setStatus] = useState<ProcessStatusInfo>({
    state: 'Stopped',
    connectionState: 'disconnected',
    connectionVerified: false,
    pid: null,
    startedAt: null,
    stoppedAt: null,
    exitCode: null,
    errorMessage: null,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [actionPending, setActionPending] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [showStopModal, setShowStopModal] = useState(false);

  // Initialize status and register IPC listeners
  useEffect(() => {
    if (!window.knotApi) {
      setUiError('Desktop Commander API unavailable in this environment');
      return;
    }

    // Fetch initial status and logs
    window.knotApi.getStatus().then(setStatus).catch((err) => {
      setUiError(err instanceof Error ? err.message : String(err));
    });

    window.knotApi.getLogs().then(setLogs).catch(() => {});

    // Listen for live status changes
    const unsubStatus = window.knotApi.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setActionPending(false);
      if (newStatus.state !== 'Error') {
        setUiError(null);
      }
    });

    // Listen for incoming logs
    const unsubLogs = window.knotApi.onLog((newLog) => {
      setLogs((prev) => [...prev, newLog]);
    });

    return () => {
      unsubStatus();
      unsubLogs();
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!window.knotApi || actionPending) return;
    setActionPending(true);
    setUiError(null);

    try {
      const res = await window.knotApi.startDesktopCommander();
      if (!res.success) {
        setUiError(res.message || 'Failed to start process');
        setActionPending(false);
      }
    } catch (err) {
      setUiError(err instanceof Error ? err.message : String(err));
      setActionPending(false);
    }
  }, [actionPending]);

  const handleStop = useCallback(async () => {
    if (!window.knotApi || actionPending) return;
    setActionPending(true);
    setUiError(null);

    try {
      const res = await window.knotApi.stopDesktopCommander();
      if (!res.success) {
        setUiError(res.message || 'Failed to stop process');
        setActionPending(false);
      }
    } catch (err) {
      setUiError(err instanceof Error ? err.message : String(err));
      setActionPending(false);
    }
  }, [actionPending]);

  const handleClearLogs = useCallback(async () => {
    if (!window.knotApi) return;
    await window.knotApi.clearLogs();
    setLogs([]);
  }, []);

  const isTransitioning = status.state === 'Starting' || status.state === 'Stopping' || actionPending;
  const isRunning = status.state === 'Running';

  const formatTimestamp = (iso: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 select-none">
      {/* 4A. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#292C2F]">
        <div>
          <h1 className="text-lg font-bold text-[#F0F0ED] tracking-tight">Desktop Commander</h1>
          <p className="text-xs text-[#A5A5A0] mt-0.5">
            Manage the local Desktop Commander Remote connection and inspect its runtime activity.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <StatusBadge state={status.state} />
          {isRunning && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border ${
                status.connectionVerified
                  ? 'bg-[#292C2F] border-[#292C2F] text-[#F0F0ED]'
                  : status.connectionState === 'pairing_required'
                  ? 'bg-[#E05252]/15 border-[#E05252]/40 text-[#E05252]'
                  : 'bg-[#1B1D1F] border-[#292C2F] text-[#A5A5A0]'
              }`}
              data-testid="connection-badge"
            >
              <Wifi size={12} className={status.connectionVerified ? 'text-[#F0F0ED]' : 'text-current'} />
              {status.connectionVerified
                ? 'Remote Verified'
                : status.connectionState === 'pairing_required'
                ? 'Pairing Required'
                : 'Awaiting Connection'}
            </span>
          )}
        </div>
      </div>

      {/* 4B. Desktop Commander Remote Process Control Section */}
      <div className="rounded-xl border border-[#292C2F] bg-[#1B1D1F] p-4 sm:p-5 shadow-xs space-y-4">
        {/* Process Identity & Primary Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <DesktopCommanderLogo size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-[#F0F0ED] tracking-tight">
                  Desktop Commander Remote
                </h2>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#000000] border border-[#292C2F] text-[#A5A5A0]">
                  Local Process
                </span>
              </div>
              <p className="text-xs text-[#A5A5A0] mt-0.5">
                Local child-process bridge for AI tool execution (<code className="text-[#F0F0ED] font-mono text-[11px]">npx @wonderwhy-er/desktop-commander@latest remote</code>)
              </p>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="shrink-0">
            {isRunning ? (
              <button
                onClick={() => setShowStopModal(true)}
                disabled={isTransitioning}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#E05252] text-[#F0F0ED] text-xs font-semibold hover:bg-[#ef6565] active:bg-[#c93b3b] disabled:opacity-50 transition-colors shadow-xs cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E05252]"
                data-testid="stop-btn"
                aria-label="Stop Desktop Commander Remote process"
              >
                {isTransitioning ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Square size={13} fill="currentColor" />
                )}
                <span>Stop Remote</span>
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={isTransitioning}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#292C2F] text-[#F0F0ED] text-xs font-semibold hover:bg-[#32363a] active:bg-[#1B1D1F] border border-[#292C2F] hover:border-[#E05252]/40 disabled:opacity-50 transition-all shadow-xs cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E05252]"
                data-testid="start-btn"
                aria-label="Start Desktop Commander Remote process"
              >
                {isTransitioning ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={13} fill="currentColor" />
                )}
                <span>Start Remote</span>
              </button>
            )}
          </div>
        </div>

        {/* Compact Process Telemetry Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
          <div className="p-2.5 rounded-lg bg-[#000000] border border-[#292C2F] flex flex-col justify-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#A5A5A0]">Process ID</span>
            <span className="font-mono font-medium text-[#F0F0ED] mt-0.5 truncate">
              {status.pid ? status.pid : '—'}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#000000] border border-[#292C2F] flex flex-col justify-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#A5A5A0]">State</span>
            <span className="font-medium text-[#F0F0ED] mt-0.5 truncate">
              {status.state}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#000000] border border-[#292C2F] flex flex-col justify-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#A5A5A0]">Last Started</span>
            <span className="font-mono text-[#F0F0ED] mt-0.5 truncate">
              {formatTimestamp(status.startedAt)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-[#000000] border border-[#292C2F] flex flex-col justify-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#A5A5A0]">Last Stopped</span>
            <span className="font-mono text-[#F0F0ED] mt-0.5 truncate">
              {formatTimestamp(status.stoppedAt)}
              {status.exitCode !== null && (
                <span className="ml-1 text-[10px] text-[#A5A5A0]">({status.exitCode})</span>
              )}
            </span>
          </div>
        </div>

        {/* Pairing Guidance Notice */}
        {isRunning && status.connectionState === 'pairing_required' && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#E05252]/10 border border-[#E05252]/30 text-[#E05252] text-xs">
            <Key size={15} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">Device Pairing Required</span>
              <span className="text-[#F0F0ED]/80 text-[11px]">
                Desktop Commander Remote requires initial authentication. Check the diagnostic logs below for the authorization URL.
              </span>
            </div>
          </div>
        )}

        {/* Error Banner when state is Error or UI error exists */}
        {(status.errorMessage || uiError) && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#E05252]/10 border border-[#E05252]/30 text-[#E05252] text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">Process Error</span>
              <span className="text-[#F0F0ED]/80 text-[11px]">{status.errorMessage || uiError}</span>
            </div>
          </div>
        )}
      </div>

      {/* 4C. Diagnostic Logs Primary Workspace */}
      <DiagnosticLogs logs={logs} onClear={handleClearLogs} defaultExpanded={true} />

      {/* Stop Process Confirmation Modal */}
      <StopProcessModal
        isOpen={showStopModal}
        isStopping={actionPending || status.state === 'Stopping'}
        processDetails={{
          name: 'Desktop Commander Remote',
          processType: 'desktop_commander',
          state: status.state,
          pid: status.pid,
        }}
        onConfirmStop={async () => {
          await handleStop();
          setShowStopModal(false);
        }}
        onCancel={() => setShowStopModal(false)}
      />
    </div>
  );
};
