import React, { useState, useEffect, useCallback } from 'react';
import { LogEntry, ProcessStatusInfo } from '../../../shared/types.js';
import { DesktopCommanderLogo } from '../DesktopCommanderLogo.js';
import { StatusBadge } from './StatusBadge.js';
import { DiagnosticLogs } from './DiagnosticLogs.js';
import { StopProcessModal } from '../Safety/StopProcessModal.js';
import { Play, Square, Loader2, AlertCircle, Clock, Hash, Wifi, Key } from 'lucide-react';
import { Magnet } from '../ReactBits/index.js';

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

  // Initialize status and register listeners
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
    <div className="rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F] p-5 shadow-lg select-none">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#F0F0ED]/10">
        <div className="flex items-center gap-3">
          <DesktopCommanderLogo size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[#F0F0ED] tracking-tight">
                Desktop Commander Remote
              </h2>
              <StatusBadge state={status.state} />
              {isRunning && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${
                    status.connectionVerified
                      ? 'bg-[#292C2F]/20 border-[#292C2F]/60 text-[#F0F0ED]'
                      : status.connectionState === 'pairing_required'
                      ? 'bg-[#E05252]/20 border-[#E05252]/60 text-[#E05252]'
                      : 'bg-[#F0F0ED]/5 border-[#F0F0ED]/15 text-[#F0F0ED]/60'
                  }`}
                  data-testid="connection-badge"
                >
                  <Wifi size={12} className={status.connectionVerified ? 'text-[#292C2F]' : 'text-current'} />
                  {status.connectionVerified
                    ? 'Remote Verified'
                    : status.connectionState === 'pairing_required'
                    ? 'Pairing Required'
                    : 'Awaiting Connection'}
                </span>
              )}
            </div>
            <p className="text-xs text-[#F0F0ED]/60 font-normal">
              Managed child process bridge (<code className="text-[#F0F0ED]/80 font-mono text-[11px]">npx @wonderwhy-er/desktop-commander@latest remote</code>)
            </p>
          </div>
        </div>

        {/* Start / Stop Action Buttons */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Magnet padding={10} disabled={false}>
              <button
                onClick={() => setShowStopModal(true)}
                disabled={isTransitioning}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E05252] text-[#F0F0ED] text-xs font-semibold hover:bg-[#ef6565] active:bg-[#c93b3b] disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                data-testid="stop-btn"
              >
                {isTransitioning ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Square size={13} fill="currentColor" />
                )}
                <span>Stop Process</span>
              </button>
            </Magnet>
          ) : (
            <Magnet padding={10} disabled={false}>
              <button
                onClick={handleStart}
                disabled={isTransitioning}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#292C2F] text-[#F0F0ED] text-xs font-semibold hover:bg-[#32363a] active:bg-[#1B1D1F] disabled:opacity-50 transition-colors shadow-sm cursor-pointer border border-[#292C2F]"
                data-testid="start-btn"
              >
                {isTransitioning ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={13} fill="currentColor" />
                )}
                <span>Start Remote</span>
              </button>
            </Magnet>
          )}
        </div>
      </div>

      {/* Pairing Guidance Notice */}
      {isRunning && status.connectionState === 'pairing_required' && (
        <div className="mt-3.5 flex items-start gap-2.5 p-3 rounded-lg bg-[#E05252]/10 border border-[#E05252]/30 text-[#E05252] text-xs">
          <Key size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Device Pairing Required:</span>
            <span className="opacity-90">
              Desktop Commander Remote requires initial authentication. Check the diagnostic logs below for the authorization URL.
            </span>
          </div>
        </div>
      )}

      {/* Error Banner when state is Error or UI error exists */}
      {(status.errorMessage || uiError) && (
        <div className="mt-3.5 flex items-start gap-2.5 p-3 rounded-lg bg-[#E05252]/10 border border-[#E05252]/30 text-[#E05252] text-xs">
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
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#000000] border border-[#F0F0ED]/10">
          <Hash size={14} className="text-[#292C2F]" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#F0F0ED]/50">
              Process ID
            </span>
            <span className="text-xs font-mono font-medium text-[#F0F0ED]">
              {status.pid ? status.pid : '—'}
            </span>
          </div>
        </div>

        {/* Started At */}
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#000000] border border-[#F0F0ED]/10">
          <Clock size={14} className="text-[#292C2F]" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#F0F0ED]/50">
              Last Started
            </span>
            <span className="text-xs font-medium text-[#F0F0ED]">
              {formatTimestamp(status.startedAt)}
            </span>
          </div>
        </div>

        {/* Stopped At / Exit Code */}
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#000000] border border-[#F0F0ED]/10">
          <Clock size={14} className="text-[#E05252]" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#F0F0ED]/50">
              Last Stopped
            </span>
            <span className="text-xs font-medium text-[#F0F0ED]">
              {formatTimestamp(status.stoppedAt)}
              {status.exitCode !== null && (
                <span className="ml-1 text-[10px] font-mono text-[#F0F0ED]/60">
                  (exit {status.exitCode})
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Diagnostic Logs */}
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
