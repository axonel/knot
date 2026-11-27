import React, { useState } from 'react';
import {
  Folder,
  Copy,
  ExternalLink,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  Terminal,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { BridgeStatusInfo, HandshakeState } from '../../../shared/types.js';

interface ConnectionStatusCardProps {
  status: BridgeStatusInfo | null;
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  onOpenTestModal: () => void;
  onInitWorkspace: () => void;
  isInitializing?: boolean;
}

export const ConnectionStatusCard: React.FC<ConnectionStatusCardProps> = ({
  status,
  selectedProjectId,
  selectedSessionId,
  onOpenTestModal,
  onInitWorkspace,
  isInitializing = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyPath = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy bridge path:', err);
    }
  };

  const handleOpenFolder = async (path: string) => {
    if (window.knotApi?.bridge?.openDirectory) {
      await window.knotApi.bridge.openDirectory(path);
    }
  };

  const getHandshakeBadge = (state: HandshakeState) => {
    switch (state) {
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#292C2F]/40 text-[#F0F0ED] border border-[#292C2F]">
            <CheckCircle2 size={13} className="text-[#E05252]" />
            Verified & Active
          </span>
        );
      case 'awaiting_response':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#E05252]/20 text-[#E05252] border border-[#E05252]/40 animate-pulse">
            <Clock size={13} />
            Awaiting Response...
          </span>
        );
      case 'workspace_ready':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#292C2F]/20 text-[#F0F0ED]/80 border border-[#292C2F]/50">
            <Zap size={13} className="text-[#292C2F]" />
            Ready for Test
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-950/40 text-red-400 border border-red-800/50">
            <AlertCircle size={13} />
            Verification Failed
          </span>
        );
      case 'not_configured':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#111213] text-[#F0F0ED]/40 border border-[#F0F0ED]/10">
            <Clock size={13} />
            Not Initialized
          </span>
        );
    }
  };

  const bridgeRoot = status?.bridgeRoot || 'Detecting...';
  const isDCActive = status?.desktopCommanderRunning ?? false;
  const handshakeState = status?.handshakeState || 'not_configured';
  const hasSession = Boolean(selectedProjectId && selectedSessionId);
  const isWorkspaceReady = Boolean(status?.sessionPaths);

  return (
    <div className="rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F] p-5 shadow-lg space-y-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0ED]/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#F0F0ED]">ChatGPT Filesystem Bridge</h3>
            {getHandshakeBadge(handshakeState)}
          </div>
          <p className="text-xs text-[#F0F0ED]/60 mt-0.5">
            Bidirectional Markdown message exchange via Desktop Commander MCP
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasSession && !isWorkspaceReady && (
            <button
              onClick={onInitWorkspace}
              disabled={isInitializing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#292C2F] hover:bg-[#292C2F]/80 text-[#F0F0ED] transition-colors border border-[#292C2F]/40"
            >
              {isInitializing ? 'Initializing...' : 'Initialize Session Workspace'}
            </button>
          )}

          <button
            onClick={onOpenTestModal}
            disabled={!hasSession || !isWorkspaceReady}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
              hasSession && isWorkspaceReady
                ? 'bg-[#E05252] hover:bg-[#E05252]/90 text-[#F0F0ED] cursor-pointer'
                : 'bg-[#111213] text-[#F0F0ED]/30 border border-[#F0F0ED]/10 cursor-not-allowed'
            }`}
            title={!hasSession ? 'Select a project and session first' : undefined}
          >
            <Zap size={14} />
            <span>Test Connection</span>
          </button>
        </div>
      </div>

      {/* Grid of Status Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Workspace Root */}
        <div className="p-3 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#F0F0ED]/60 font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Folder size={12} className="text-[#292C2F]" />
              Bridge Root
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleCopyPath(bridgeRoot)}
                title="Copy Path"
                className="p-1 hover:text-[#F0F0ED] transition-colors"
              >
                {copied ? <Check size={12} className="text-[#E05252]" /> : <Copy size={12} />}
              </button>
              <button
                onClick={() => handleOpenFolder(bridgeRoot)}
                title="Open Folder"
                className="p-1 hover:text-[#F0F0ED] transition-colors"
              >
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
          <div className="font-mono text-[11px] text-[#F0F0ED]/90 truncate" title={bridgeRoot}>
            {bridgeRoot}
          </div>
          <div className="text-[10px] text-[#F0F0ED]/40 font-mono">Protocol: KNOT_MESSAGE_V1</div>
        </div>

        {/* Desktop Commander MCP Status */}
        <div className="p-3 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#F0F0ED]/60 font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Terminal size={12} className="text-[#292C2F]" />
              Desktop Commander
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                isDCActive ? 'bg-[#E05252] shadow-[0_0_8px_#E05252]' : 'bg-[#F0F0ED]/20'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold ${
                isDCActive ? 'text-[#F0F0ED]' : 'text-[#F0F0ED]/50'
              }`}
            >
              {isDCActive ? 'Process Active' : 'Process Inactive'}
            </span>
          </div>
          <div className="text-[10px] text-[#F0F0ED]/40 font-mono">
            {isDCActive ? 'Child process running on stdio' : 'Launch from Desktop Commander tab'}
          </div>
        </div>

        {/* MCP Permissions & Verification */}
        <div className="p-3 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#F0F0ED]/60 font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} className="text-[#292C2F]" />
              MCP Scope
            </span>
            <span className="text-[10px] font-mono text-[#F0F0ED]/40">read / write</span>
          </div>
          <div className="text-xs text-[#F0F0ED]/80 truncate">
            {status?.lastVerifiedAt ? (
              <span className="text-[#F0F0ED]/90">
                Verified: {new Date(status.lastVerifiedAt).toLocaleTimeString()}
              </span>
            ) : (
              <span className="text-[#F0F0ED]/50">Never verified</span>
            )}
          </div>
          <div className="text-[10px] text-[#F0F0ED]/40 font-mono">
            Strict 256 KB file cap, UUID validated
          </div>
        </div>
      </div>

      {/* Real-time Diagnostics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-[#111213]/80 border border-[#F0F0ED]/10 text-[11px] font-mono text-[#F0F0ED]/70">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              status?.watcherActive ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span>
            Watcher:{' '}
            <strong className="text-[#F0F0ED]">
              {status?.watcherActive
                ? `${status.watchedSessionsCount ?? 1} session inbox(es) active`
                : 'Offline'}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {status?.antigravityRunning && (
            <span className="text-[#E05252] font-semibold">● Antigravity Executing</span>
          )}
          {typeof status?.unreadResultsCount === 'number' && status.unreadResultsCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-[#292C2F]/40 text-[#F0F0ED] border border-[#292C2F]/60">
              {status.unreadResultsCount} unread outbox result(s)
            </span>
          )}
          {status?.latestDispatchedTask && (
            <span className="text-[#F0F0ED]/50 truncate max-w-xs" title={status.latestDispatchedTask.title}>
              Dispatched: {status.latestDispatchedTask.title}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
