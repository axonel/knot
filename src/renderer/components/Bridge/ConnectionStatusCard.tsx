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
  Radio,
  Eye,
  X,
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
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

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
          <span
            data-testid="connection-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#000000] text-[#F0F0ED] border border-[#292C2F]"
          >
            <span className="w-2 h-2 rounded-full bg-[#E05252]" />
            Verified & Active
          </span>
        );
      case 'awaiting_response':
        return (
          <span
            data-testid="connection-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#000000] text-[#E05252] border border-[#E05252]/40 animate-pulse"
          >
            <Clock size={12} className="text-[#E05252]" />
            Awaiting Response...
          </span>
        );
      case 'workspace_ready':
        return (
          <span
            data-testid="connection-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#000000] text-[#F0F0ED] border border-[#292C2F]"
          >
            <Zap size={12} className="text-[#A5A5A0]" />
            Ready for Test
          </span>
        );
      case 'error':
        return (
          <span
            data-testid="connection-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#000000] text-[#E05252] border border-[#E05252]"
          >
            <AlertCircle size={12} className="text-[#E05252]" />
            Verification Failed
          </span>
        );
      case 'not_configured':
      default:
        return (
          <span
            data-testid="connection-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#000000] text-[#A5A5A0] border border-[#292C2F]"
          >
            <Clock size={12} className="text-[#A5A5A0]" />
            Not Initialized
          </span>
        );
    }
  };

  const bridgeRoot = status?.bridgeRoot || 'Detecting...';
  const isDCActive = status?.desktopCommanderRunning ?? false;
  const handshakeState = status?.handshakeState || 'not_configured';
  const hasSession = Boolean(selectedProjectId && selectedSessionId);
  const isWorkspaceReady = Boolean(status?.sessionPaths || status?.workspaceInitialized);

  return (
    <div className="rounded-xl border border-[#292C2F] bg-[#1B1D1F] p-4.5 space-y-4 select-none">
      {/* Top Overview Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#292C2F]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#000000] border border-[#292C2F] flex items-center justify-center text-[#E05252] shrink-0">
            <Radio size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm font-semibold text-[#F0F0ED]">ChatGPT Filesystem Bridge</h3>
              {getHandshakeBadge(handshakeState)}
            </div>
            <p className="text-xs text-[#A5A5A0] mt-0.5">
              Bidirectional local filesystem synchronization with Desktop Commander MCP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasSession && !isWorkspaceReady && (
            <button
              onClick={onInitWorkspace}
              disabled={isInitializing}
              data-testid="init-workspace-btn"
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#292C2F] hover:bg-[#292C2F]/80 text-[#F0F0ED] transition-colors border border-[#292C2F] cursor-pointer disabled:opacity-50"
            >
              {isInitializing ? 'Initializing...' : 'Initialize Session Workspace'}
            </button>
          )}

          <button
            onClick={onOpenTestModal}
            disabled={!hasSession || !isWorkspaceReady}
            data-testid="test-connection-btn"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
              hasSession && isWorkspaceReady
                ? 'bg-[#E05252] hover:bg-[#E05252]/90 text-[#F0F0ED] cursor-pointer'
                : 'bg-[#000000] text-[#A5A5A0]/40 border border-[#292C2F] cursor-not-allowed'
            }`}
            title={!hasSession ? 'Select a project and session first' : undefined}
          >
            <Zap size={14} />
            <span>Test Connection</span>
          </button>
        </div>
      </div>

      {/* Restrained 4-Column Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Bridge Status */}
        <div className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="text-[10px] text-[#A5A5A0] font-mono uppercase tracking-wider">
              Bridge State
            </div>
            <div className="text-xs font-semibold text-[#F0F0ED] mt-1 flex items-center gap-1.5">
              {isWorkspaceReady ? (
                <>
                  <CheckCircle2 size={13} className="text-[#E05252]" />
                  <span>Workspace Initialized</span>
                </>
              ) : (
                <>
                  <Clock size={13} className="text-[#A5A5A0]" />
                  <span>Not Initialized</span>
                </>
              )}
            </div>
          </div>
          <div className="text-[10px] text-[#A5A5A0] font-mono pt-1 border-t border-[#292C2F]/60">
            Protocol: KNOT_MESSAGE_V1
          </div>
        </div>

        {/* 2. Bridge Root */}
        <div className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-[#A5A5A0] font-mono uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Folder size={11} className="text-[#A5A5A0]" />
                Bridge Root
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleCopyPath(bridgeRoot)}
                  title="Copy Bridge Path"
                  aria-label="Copy Bridge Path"
                  data-testid="copy-bridge-path-btn"
                  className="p-1 text-[#A5A5A0] hover:text-[#F0F0ED] transition-colors cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-[#E05252]" /> : <Copy size={12} />}
                </button>
                <button
                  onClick={() => handleOpenFolder(bridgeRoot)}
                  title="Open Bridge Folder"
                  aria-label="Open Bridge Folder"
                  data-testid="open-bridge-folder-btn"
                  className="p-1 text-[#A5A5A0] hover:text-[#F0F0ED] transition-colors cursor-pointer"
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>
            <div
              className="font-mono text-[11px] text-[#F0F0ED] truncate mt-1"
              title={bridgeRoot}
              data-testid="bridge-root-path"
            >
              {bridgeRoot}
            </div>
          </div>
          <div className="text-[10px] text-[#A5A5A0] font-mono pt-1 border-t border-[#292C2F]/60 truncate">
            Strict 256 KB file cap
          </div>
        </div>

        {/* 3. Desktop Commander Remote */}
        <div className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-[#A5A5A0] font-mono uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <Terminal size={11} className="text-[#A5A5A0]" />
                Desktop Commander
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  isDCActive ? 'bg-[#E05252]' : 'bg-[#292C2F]'
                }`}
              />
            </div>
            <div className="text-xs font-semibold text-[#F0F0ED] mt-1 flex items-center gap-1.5">
              <span>{isDCActive ? 'Process Active' : 'Process Inactive'}</span>
            </div>
          </div>
          <div className="text-[10px] text-[#A5A5A0] font-mono pt-1 border-t border-[#292C2F]/60 truncate">
            {isDCActive ? 'Child process running on stdio' : 'Start from Desktop Commander tab'}
          </div>
        </div>

        {/* 4. MCP Scope */}
        <div className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-1.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[10px] text-[#A5A5A0] font-mono uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <ShieldCheck size={11} className="text-[#A5A5A0]" />
                MCP Scope
              </span>
              <span className="text-[10px] font-mono text-[#A5A5A0]">read / write</span>
            </div>
            <div className="text-xs text-[#F0F0ED] mt-1 truncate">
              {status?.lastVerifiedAt ? (
                <span>Verified: {new Date(status.lastVerifiedAt).toLocaleTimeString()}</span>
              ) : (
                <span className="text-[#A5A5A0]">Never verified</span>
              )}
            </div>
          </div>
          <div className="text-[10px] text-[#A5A5A0] font-mono pt-1 border-t border-[#292C2F]/60 truncate">
            UUID validated, isolated sandbox
          </div>
        </div>
      </div>

      {/* Watcher and Outbox Diagnostics Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg bg-[#000000] border border-[#292C2F] text-[11px] font-mono text-[#A5A5A0]">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              status?.watcherActive ? 'bg-[#E05252]' : 'bg-[#292C2F]'
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

        <div className="flex items-center gap-3 flex-wrap">
          {status?.antigravityRunning && (
            <span className="text-[#E05252] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E05252]" />
              Antigravity Executing
            </span>
          )}

          {typeof status?.unreadResultsCount === 'number' && status.unreadResultsCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-[#292C2F] text-[#F0F0ED] border border-[#292C2F]">
              {status.unreadResultsCount} unread outbox result(s)
            </span>
          )}

          {status?.latestDispatchedTask && (
            <div className="flex items-center gap-1.5 text-[#A5A5A0]">
              <span>Dispatched:</span>
              <span
                className="text-[#F0F0ED] truncate max-w-[200px] sm:max-w-[320px]"
                title={status.latestDispatchedTask.title}
              >
                {status.latestDispatchedTask.title}
              </span>
              <button
                onClick={() => setIsDetailModalOpen(true)}
                title="Inspect Full Dispatched Summary"
                className="p-0.5 hover:text-[#F0F0ED] transition-colors cursor-pointer"
              >
                <Eye size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dispatched Task Detail Dialog */}
      {isDetailModalOpen && status?.latestDispatchedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/80">
          <div className="w-full max-w-lg bg-[#1B1D1F] border border-[#292C2F] rounded-xl p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#292C2F] pb-2">
              <h4 className="text-sm font-semibold text-[#F0F0ED]">Latest Dispatched Task</h4>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 text-[#A5A5A0] hover:text-[#F0F0ED] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 font-mono text-xs text-[#F0F0ED]">
              <div>
                <span className="text-[#A5A5A0]">Task ID:</span> {status.latestDispatchedTask.taskId}
              </div>
              <div>
                <span className="text-[#A5A5A0]">Dispatched At:</span>{' '}
                {new Date(status.latestDispatchedTask.timestamp).toLocaleString()}
              </div>
              <div className="pt-2 border-t border-[#292C2F]">
                <div className="text-[#A5A5A0] mb-1 font-sans">Full Task Summary:</div>
                <div className="p-3 bg-[#000000] border border-[#292C2F] rounded-lg max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[#F0F0ED]">
                  {status.latestDispatchedTask.title}
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] hover:bg-[#292C2F]/80 text-[#F0F0ED] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
