import React, { useState, useEffect, useCallback } from 'react';
import { LogEntry, ProcessStatusInfo } from '../../../shared/types.js';
import { DesktopCommanderLogo } from '../DesktopCommanderLogo.js';
import { StatusBadge } from './StatusBadge.js';
import { DiagnosticLogs } from './DiagnosticLogs.js';
import { Play, Square, Loader2, AlertCircle, Clock, Hash } from 'lucide-react';

export const ProcessManager: React.FC = () => {
  const [status, setStatus] = useState<ProcessStatusInfo>({
    state: 'Stopped',
    pid: null,
    startedAt: null,
    stoppedAt: null,
    exitCode: null,
    errorMessage: null,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [actionPending, setActionPending] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  // Initialize status and register listeners
  useEffect(() => {
    if (!window.threadlineApi) {
      setUiError('Desktop Commander API unavailable in this environment');
      return;
    }

    // Fetch initial status and logs
    window.threadlineApi.getStatus().then(setStatus).catch((err) => {
      setUiError(err instanceof Error ? err.message : String(err));
    });

    window.threadlineApi.getLogs().then(setLogs).catch(() => {});

    // Listen for live status changes
    const unsubStatus = window.threadlineApi.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setActionPending(false);
      if (newStatus.state !== 'Error') {
        setUiError(null);
      }
    });

    // Listen for incoming logs
    const unsubLogs = window.threadlineApi.onLog((newLog) => {
      setLogs((prev) => [...prev, newLog]);
    });

    return () => {
      unsubStatus();
      unsubLogs();
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!window.threadlineApi || actionPending) return;
    setActionPending(true);
    setUiError(null);

    try {
      const res = await window.threadlineApi.startDesktopCommander();
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
    if (!window.threadlineApi || actionPending) return;
    setActionPending(true);
    setUiError(null);

    try {
      const res = await window.threadlineApi.stopDesktopCommander();
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
    if (!window.threadlineApi) return;
    await window.threadlineApi.clearLogs();
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
    <div className="rounded-xl border border-[#F9F9F9]/10 bg-[#092634] p-5 shadow-lg select-none">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#F9F9F9]/10">
        <div className="flex items-center gap-3">
          <DesktopCommanderLogo size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[#F9F9F9] tracking-tight">
                Desktop Commander Remote
              </h2>
              <StatusBadge state={status.state} />
            </div>
            <p className="text-xs text-[#F9F9F9]/60 font-normal">
              Managed child process bridge (<code className="text-[#F9F9F9]/80 font-mono text-[11px]">npx @wonderwhy-er/desktop-commander@latest remote</code>)
            </p>
          </div>
        </div>

        {/* Start / Stop Action Buttons */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={handleStop}
              disabled={isTransitioning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF6E42] text-[#F9F9F9] text-xs font-semibold hover:bg-[#FF6E42]/90 active:bg-[#FF6E42]/80 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              data-testid="stop-btn"
            >
              {isTransitioning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Square size={13} fill="currentColor" />
              )}
              <span>Stop Process</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={isTransitioning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#004E72] text-[#F9F9F9] text-xs font-semibold hover:bg-[#004E72]/90 active:bg-[#004E72]/80 disabled:opacity-50 transition-colors shadow-sm cursor-pointer border border-[#F9F9F9]/10"
              data-testid="start-btn"
            >
              {isTransitioning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={13} fill="currentColor" />
              )}
              <span>Start Remote</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner when state is Error or UI error exists */}
      {(status.errorMessage || uiError) && (
        <div className="mt-3.5 flex items-start gap-2.5 p-3 rounded-lg bg-[#FF6E42]/10 border border-[#FF6E42]/30 text-[#FF6E42] text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Process Error:</span>
            <span className="opacity-90">{status.errorMessage || uiError}</span>
          </div>
        </div>
      )}

      {/* Process Telemetry Info Grid */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {/* PID info */}
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10">
          <Hash size={14} className="text-[#004E72]" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#F9F9F9]/50">
              Process ID
            </span>
            <span className="text-xs font-mono font-medium text-[#F9F9F9]">
              {status.pid ? status.pid : '—'}
            </span>
          </div>
        </div>

        {/* Started At */}
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10">
          <Clock size={14} className="text-[#004E72]" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#F9F9F9]/50">
              Last Started
            </span>
            <span className="text-xs font-medium text-[#F9F9F9]">
              {formatTimestamp(status.startedAt)}
            </span>
          </div>
        </div>

        {/* Stopped At / Exit Code */}
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10">
          <Clock size={14} className="text-[#FF6E42]" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#F9F9F9]/50">
              Last Stopped
            </span>
            <span className="text-xs font-medium text-[#F9F9F9]">
              {formatTimestamp(status.stoppedAt)}
              {status.exitCode !== null && (
                <span className="ml-1 text-[10px] font-mono text-[#F9F9F9]/60">
                  (exit {status.exitCode})
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Diagnostic Logs */}
      <DiagnosticLogs logs={logs} onClear={handleClearLogs} defaultExpanded={true} />
    </div>
  );
};
