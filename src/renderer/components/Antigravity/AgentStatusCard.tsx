import React, { useState } from 'react';
import type { AntigravityStatus, AntigravityExecutionMode } from '../../../shared/types.js';
import {
  Sparkles,
  Play,
  Square,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Copy,
  Check,
  Folder,
  Hash,
  Activity,
  Cpu,
} from 'lucide-react';

interface AgentStatusCardProps {
  status: AntigravityStatus | null;
  onStart: (mode?: AntigravityExecutionMode) => void;
  onStop: () => void;
  onInterrupt: () => void;
  onResume: () => void;
  onModeChange: (mode: AntigravityExecutionMode) => void;
  selectedMode: AntigravityExecutionMode;
  disabled?: boolean;
}

export const AgentStatusCard: React.FC<AgentStatusCardProps> = ({
  status,
  onStart,
  onStop,
  onInterrupt,
  onResume,
  onModeChange,
  selectedMode,
  disabled = false,
}) => {
  const [copiedAuth, setCopiedAuth] = useState(false);

  const capabilities = status?.capabilities;
  const isInstalled = capabilities?.installed ?? false;
  const readiness = capabilities?.readiness ?? 'not_installed';
  const processState = status?.state ?? 'unavailable';
  const isThinking = processState === 'thinking';
  const isRunning = processState === 'ready' || isThinking || processState === 'starting';

  const copyAuthCommand = () => {
    navigator.clipboard.writeText('agy');
    setCopiedAuth(true);
    setTimeout(() => setCopiedAuth(false), 2000);
  };

  const getReadinessBadge = () => {
    switch (readiness) {
      case 'ready':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle size={12} /> Ready
          </span>
        );
      case 'auth_required':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#FF6E42]/10 text-[#FF6E42] border border-[#FF6E42]/20">
            <AlertTriangle size={12} /> Authentication Required
          </span>
        );
      case 'not_installed':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#FF6E42]/10 text-[#FF6E42] border border-[#FF6E42]/20">
            <XCircle size={12} /> Not Installed
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle size={12} /> CLI Error
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#F9F9F9]/10 text-[#F9F9F9]/70 border border-[#F9F9F9]/20">
            {readiness}
          </span>
        );
    }
  };

  const getProcessStateBadge = () => {
    switch (processState) {
      case 'thinking':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/40 animate-pulse">
            <Activity size={12} className="animate-spin" /> Thinking...
          </span>
        );
      case 'ready':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#004E72]/30 text-[#F9F9F9] border border-[#004E72]">
            <CheckCircle size={12} className="text-emerald-400" /> Active / Idle
          </span>
        );
      case 'starting':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#004E72]/20 text-[#F9F9F9]/80 border border-[#004E72]/40">
            Starting...
          </span>
        );
      case 'stopped':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#090B0D] text-[#F9F9F9]/50 border border-[#F9F9F9]/10">
            Stopped
          </span>
        );
      case 'authentication_required':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/40">
            Auth Required
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[#090B0D] text-[#F9F9F9]/40 border border-[#F9F9F9]/10">
            {processState}
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-[#F9F9F9]/10 bg-[#092634] p-5 shadow-lg space-y-4">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F9F9F9]/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#004E72] flex items-center justify-center text-[#F9F9F9] shadow-inner">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#F9F9F9]">Google Antigravity Agent</h2>
              {getReadinessBadge()}
              {getProcessStateBadge()}
            </div>
            <div className="text-xs text-[#F9F9F9]/60 font-mono mt-0.5">
              {isInstalled ? (
                <span>
                  agy {capabilities?.version ? `v${capabilities.version}` : ''} ({capabilities?.executablePath})
                </span>
              ) : (
                <span className="text-[#FF6E42]">CLI binary 'agy' not detected</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Mode Selector */}
          <div className="flex items-center gap-1.5 bg-[#090B0D] border border-[#F9F9F9]/15 rounded-lg px-2.5 py-1.5">
            <Cpu size={14} className="text-[#004E72]" />
            <span className="text-[11px] text-[#F9F9F9]/60">Mode:</span>
            <select
              value={selectedMode}
              onChange={(e) => onModeChange(e.target.value as AntigravityExecutionMode)}
              disabled={isRunning || disabled}
              className="bg-transparent text-xs text-[#F9F9F9] font-mono focus:outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              <option value="default" className="bg-[#092634] text-[#F9F9F9]">default</option>
              <option value="accept-edits" className="bg-[#092634] text-[#F9F9F9]">accept-edits</option>
              <option value="auto" className="bg-[#092634] text-[#F9F9F9]">auto</option>
              <option value="plan" className="bg-[#092634] text-[#F9F9F9]">plan</option>
            </select>
          </div>

          {!isRunning ? (
            <button
              onClick={() => onStart(selectedMode)}
              disabled={!isInstalled || disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#004E72] text-[#F9F9F9] text-xs font-medium hover:bg-[#004E72]/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <Play size={13} />
              <span>Start Agent</span>
            </button>
          ) : (
            <>
              {isThinking && (
                <button
                  onClick={onInterrupt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF6E42]/20 border border-[#FF6E42]/40 text-[#FF6E42] text-xs font-medium hover:bg-[#FF6E42]/30 transition-colors"
                  title="Interrupt current turn (SIGINT)"
                >
                  <AlertTriangle size={13} />
                  <span>Interrupt</span>
                </button>
              )}
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium hover:bg-rose-500/30 transition-colors"
                title="Stop persistent process"
              >
                <Square size={13} />
                <span>Stop</span>
              </button>
            </>
          )}

          {status?.cliConversationId && !isRunning && (
            <button
              onClick={onResume}
              disabled={!isInstalled || disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/20 text-[#F9F9F9]/80 text-xs font-medium hover:bg-[#090B0D]/80 hover:text-[#F9F9F9] transition-colors"
              title="Resume previous conversation"
            >
              <span>Resume Session</span>
            </button>
          )}
        </div>
      </div>

      {/* Auth Banner if required */}
      {readiness === 'auth_required' && (
        <div className="rounded-lg bg-[#FF6E42]/10 border border-[#FF6E42]/30 p-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#FF6E42]">
            <AlertTriangle size={16} className="shrink-0" />
            <span>
              Google Antigravity authentication is required. Run the command in your terminal to log in:
            </span>
          </div>
          <button
            onClick={copyAuthCommand}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#090B0D] border border-[#FF6E42]/40 font-mono text-[#F9F9F9] hover:bg-[#090B0D]/80 transition-colors shrink-0"
          >
            {copiedAuth ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>agy</span>
          </button>
        </div>
      )}

      {/* Meta Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
        <div className="bg-[#090B0D]/60 border border-[#F9F9F9]/10 rounded-lg p-2.5 flex items-center gap-2 text-[#F9F9F9]/70">
          <Folder size={14} className="text-[#004E72] shrink-0" />
          <div className="truncate">
            <span className="text-[#F9F9F9]/40 text-[10px] block">CWD</span>
            <span className="truncate block" title={status?.workingDirectory || 'No project directory'}>
              {status?.workingDirectory || 'No project directory'}
            </span>
          </div>
        </div>

        <div className="bg-[#090B0D]/60 border border-[#F9F9F9]/10 rounded-lg p-2.5 flex items-center gap-2 text-[#F9F9F9]/70">
          <Hash size={14} className="text-[#004E72] shrink-0" />
          <div className="truncate">
            <span className="text-[#F9F9F9]/40 text-[10px] block">CONVERSATION ID</span>
            <span className="truncate block" title={status?.cliConversationId || 'None (New turn)'}>
              {status?.cliConversationId || 'None (New turn)'}
            </span>
          </div>
        </div>

        <div className="bg-[#090B0D]/60 border border-[#F9F9F9]/10 rounded-lg p-2.5 flex items-center gap-2 text-[#F9F9F9]/70">
          <Activity size={14} className="text-[#004E72] shrink-0" />
          <div>
            <span className="text-[#F9F9F9]/40 text-[10px] block">PID / EXIT</span>
            <span>
              {status?.pid ? `PID: ${status.pid}` : status?.lastExitCode !== null ? `Exit code: ${status?.lastExitCode}` : 'Not Running'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
