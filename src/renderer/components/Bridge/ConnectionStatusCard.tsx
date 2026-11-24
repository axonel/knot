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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#004E72]/40 text-[#F9F9F9] border border-[#004E72]">
            <CheckCircle2 size={13} className="text-[#FF6E42]" />
            Verified & Active
          </span>
        );
      case 'awaiting_response':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/40 animate-pulse">
            <Clock size={13} />
            Awaiting Response...
          </span>
        );
      case 'workspace_ready':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#004E72]/20 text-[#F9F9F9]/80 border border-[#004E72]/50">
            <Zap size={13} className="text-[#004E72]" />
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#090B0D] text-[#F9F9F9]/40 border border-[#F9F9F9]/10">
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
    <div className="rounded-xl border border-[#F9F9F9]/10 bg-[#092634] p-5 shadow-lg space-y-4">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F9F9F9]/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[#F9F9F9]">ChatGPT Filesystem Bridge</h3>
            {getHandshakeBadge(handshakeState)}
          </div>
          <p className="text-xs text-[#F9F9F9]/60 mt-0.5">
            Bidirectional Markdown message exchange via Desktop Commander MCP
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasSession && !isWorkspaceReady && (
            <button
              onClick={onInitWorkspace}
              disabled={isInitializing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] transition-colors border border-[#004E72]/40"
            >
              {isInitializing ? 'Initializing...' : 'Initialize Session Workspace'}
            </button>
          )}

          <button
            onClick={onOpenTestModal}
            disabled={!hasSession || !isWorkspaceReady}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
              hasSession && isWorkspaceReady
                ? 'bg-[#FF6E42] hover:bg-[#FF6E42]/90 text-[#F9F9F9] cursor-pointer'
                : 'bg-[#090B0D] text-[#F9F9F9]/30 border border-[#F9F9F9]/10 cursor-not-allowed'
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
        <div className="p-3 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#F9F9F9]/60 font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Folder size={12} className="text-[#004E72]" />
              Bridge Root
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleCopyPath(bridgeRoot)}
                title="Copy Path"
                className="p-1 hover:text-[#F9F9F9] transition-colors"
              >
                {copied ? <Check size={12} className="text-[#FF6E42]" /> : <Copy size={12} />}
              </button>
              <button
                onClick={() => handleOpenFolder(bridgeRoot)}
                title="Open Folder"
                className="p-1 hover:text-[#F9F9F9] transition-colors"
              >
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
          <div className="font-mono text-[11px] text-[#F9F9F9]/90 truncate" title={bridgeRoot}>
            {bridgeRoot}
          </div>
          <div className="text-[10px] text-[#F9F9F9]/40 font-mono">Protocol: KNOT_MESSAGE_V1</div>
        </div>

        {/* Desktop Commander MCP Status */}
        <div className="p-3 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#F9F9F9]/60 font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Terminal size={12} className="text-[#004E72]" />
              Desktop Commander
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                isDCActive ? 'bg-[#FF6E42] shadow-[0_0_8px_#FF6E42]' : 'bg-[#F9F9F9]/20'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold ${
                isDCActive ? 'text-[#F9F9F9]' : 'text-[#F9F9F9]/50'
              }`}
            >
              {isDCActive ? 'Process Active' : 'Process Inactive'}
            </span>
          </div>
          <div className="text-[10px] text-[#F9F9F9]/40 font-mono">
            {isDCActive ? 'Child process running on stdio' : 'Launch from Desktop Commander tab'}
          </div>
        </div>

        {/* MCP Permissions & Verification */}
        <div className="p-3 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#F9F9F9]/60 font-mono uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} className="text-[#004E72]" />
              MCP Scope
            </span>
            <span className="text-[10px] font-mono text-[#F9F9F9]/40">read / write</span>
          </div>
          <div className="text-xs text-[#F9F9F9]/80 truncate">
            {status?.lastVerifiedAt ? (
              <span className="text-[#F9F9F9]/90">
                Verified: {new Date(status.lastVerifiedAt).toLocaleTimeString()}
              </span>
            ) : (
              <span className="text-[#F9F9F9]/50">Never verified</span>
            )}
          </div>
          <div className="text-[10px] text-[#F9F9F9]/40 font-mono">
            Strict 256 KB file cap, UUID validated
          </div>
        </div>
      </div>
    </div>
  );
};
