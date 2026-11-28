import React, { useState, useEffect, useCallback } from 'react';
import type {
  Project,
  Session,
  Message,
  BridgeStatusInfo,
  HandshakeChallenge,
  BridgeEvent,
} from '../../../shared/types.js';
import { ConnectionStatusCard } from './ConnectionStatusCard.js';
import { BridgeMessagesPanel } from './BridgeMessagesPanel.js';
import { HandshakeModal } from './HandshakeModal.js';
import { FolderGit2, RefreshCw, Terminal, Clock, AlertCircle, Zap } from 'lucide-react';

export const BridgeManager: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [status, setStatus] = useState<BridgeStatusInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recentEvents, setRecentEvents] = useState<BridgeEvent[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // Load Projects on mount
  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await window.knotApi?.projects.list(true);
      setProjects(list || []);

      if (list && list.length > 0) {
        setSelectedProjectId((prev) => prev || list[0].id);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Load Sessions when selectedProjectId changes
  const loadSessions = useCallback(async () => {
    if (!selectedProjectId) {
      setSessions([]);
      setSelectedSessionId(null);
      return;
    }
    try {
      const list = await window.knotApi?.sessions.list(selectedProjectId);
      setSessions(list || []);

      if (list && list.length > 0) {
        setSelectedSessionId(list[0].id);
      } else {
        setSelectedSessionId(null);
      }
    } catch (err) {
      console.error('Failed to load sessions for project:', err);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load Bridge Status & Messages when session is selected
  const refreshBridgeData = useCallback(async () => {
    if (!selectedProjectId || !selectedSessionId) {
      if (window.knotApi?.bridge?.getStatus) {
        const s = await window.knotApi.bridge.getStatus();
        setStatus(s);
      }
      setMessages([]);
      return;
    }

    try {
      setIsSyncing(true);
      if (window.knotApi?.bridge?.getStatus) {
        const s = await window.knotApi.bridge.getStatus(selectedSessionId);
        setStatus(s);
      }

      if (window.knotApi?.messages?.list) {
        const msgList = await window.knotApi.messages.list(selectedSessionId);
        setMessages(msgList);
      }
    } catch (err) {
      console.error('Failed to refresh bridge data:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [selectedProjectId, selectedSessionId]);

  useEffect(() => {
    refreshBridgeData();
  }, [refreshBridgeData]);

  // Subscribe to live bridge events
  useEffect(() => {
    if (!window.knotApi?.bridge?.onEvent) return;

    const unsubscribe = window.knotApi.bridge.onEvent((event: BridgeEvent) => {
      setRecentEvents((prev) => [event, ...prev.slice(0, 49)]);

      const evtSessionId = event.data?.sessionId as string | undefined;
      if (
        !evtSessionId ||
        evtSessionId === selectedSessionId ||
        event.type === 'connection-verified' ||
        event.type === 'message-received' ||
        event.type === 'message-published' ||
        event.type === 'error'
      ) {
        refreshBridgeData();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedSessionId, refreshBridgeData]);

  // Initialize Session Workspace
  const handleInitWorkspace = async () => {
    if (!selectedProjectId || !selectedSessionId) return;
    try {
      setIsInitializing(true);
      if (window.knotApi?.bridge?.initSessionBridge) {
        await window.knotApi.bridge.initSessionBridge(selectedProjectId, selectedSessionId);
        await refreshBridgeData();
      }
    } catch (err) {
      console.error('Failed to init session workspace:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  // Start Connection Test Handshake
  const handleStartConnectionTest = async (): Promise<HandshakeChallenge | null> => {
    if (!selectedProjectId || !selectedSessionId) return null;
    try {
      if (window.knotApi?.bridge?.startConnectionTest) {
        const chal = await window.knotApi.bridge.startConnectionTest(
          selectedProjectId,
          selectedSessionId
        );
        await refreshBridgeData();
        return chal;
      }
    } catch (err) {
      console.error('Failed to start connection test:', err);
    }
    return null;
  };

  const getHeaderStatusBadge = () => {
    const handshakeState = status?.handshakeState || 'not_configured';
    switch (handshakeState) {
      case 'verified':
        return (
          <span
            data-testid="header-status-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#1B1D1F] text-[#F0F0ED] border border-[#292C2F]"
          >
            <span className="w-2 h-2 rounded-full bg-[#E05252]" />
            Verified & Active
          </span>
        );
      case 'awaiting_response':
        return (
          <span
            data-testid="header-status-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#1B1D1F] text-[#E05252] border border-[#E05252]/40 animate-pulse"
          >
            <Clock size={12} />
            Awaiting Response...
          </span>
        );
      case 'workspace_ready':
        return (
          <span
            data-testid="header-status-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#1B1D1F] text-[#F0F0ED] border border-[#292C2F]"
          >
            <Zap size={12} className="text-[#A5A5A0]" />
            Ready for Test
          </span>
        );
      case 'error':
        return (
          <span
            data-testid="header-status-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#1B1D1F] text-[#E05252] border border-[#E05252]"
          >
            <AlertCircle size={12} />
            Verification Failed
          </span>
        );
      case 'not_configured':
      default:
        return (
          <span
            data-testid="header-status-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#1B1D1F] text-[#A5A5A0] border border-[#292C2F]"
          >
            <Clock size={12} />
            Not Initialized
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center text-xs font-mono text-[#A5A5A0] animate-pulse">
        Loading bridge environment...
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-[#1B1D1F] border border-[#292C2F] text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[#000000] border border-[#292C2F] flex items-center justify-center mx-auto text-[#E05252]">
          <FolderGit2 size={24} />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[#F0F0ED]">No Projects Found</h3>
          <p className="text-xs text-[#A5A5A0] max-w-md mx-auto leading-relaxed">
            The ChatGPT Bridge operates within project and session sandboxes. Please create a project and session in the &quot;Projects &amp; Sessions&quot; tab first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#F0F0ED] tracking-tight">ChatGPT Bridge</h1>
            {getHeaderStatusBadge()}
          </div>
          <p className="text-xs text-[#A5A5A0] mt-1">
            Manage the local filesystem bridge and exchange messages with ChatGPT.
          </p>
        </div>
      </div>

      {/* Compact Context Toolbar */}
      <div
        data-testid="bridge-context-toolbar"
        className="rounded-xl border border-[#292C2F] bg-[#1B1D1F] p-3 flex flex-wrap items-center justify-between gap-3 text-xs select-none"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Project Selector */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#000000] border border-[#292C2F]">
            <FolderGit2 size={13} className="text-[#E05252] shrink-0" />
            <span className="text-[#A5A5A0] font-mono text-[10px] uppercase tracking-wider font-semibold">
              Project:
            </span>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              data-testid="project-selector"
              aria-label="Select Project"
              className="bg-transparent text-[#F0F0ED] font-mono text-xs focus:outline-none cursor-pointer pr-1"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#1B1D1F] text-[#F0F0ED]">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Session Selector */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#000000] border border-[#292C2F]">
            <Terminal size={13} className="text-[#A5A5A0] shrink-0" />
            <span className="text-[#A5A5A0] font-mono text-[10px] uppercase tracking-wider font-semibold">
              Session:
            </span>
            {sessions.length === 0 ? (
              <span className="text-[#A5A5A0]/60 italic font-mono text-xs">No sessions in project</span>
            ) : (
              <select
                value={selectedSessionId || ''}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                data-testid="session-selector"
                aria-label="Select Session"
                className="bg-transparent text-[#F0F0ED] font-mono text-xs focus:outline-none cursor-pointer pr-1"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#1B1D1F] text-[#F0F0ED]">
                    {s.title} ({s.status})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Sync Bridge Action */}
        <button
          onClick={refreshBridgeData}
          disabled={isSyncing}
          data-testid="sync-bridge-btn"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#000000] hover:bg-[#292C2F] border border-[#292C2F] text-[#F0F0ED] font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={isSyncing ? 'animate-spin text-[#E05252]' : 'text-[#A5A5A0]'} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Bridge'}</span>
        </button>
      </div>

      {/* Main Connection & Diagnostics Overview Card */}
      <ConnectionStatusCard
        status={status}
        selectedProjectId={selectedProjectId}
        selectedSessionId={selectedSessionId}
        onOpenTestModal={() => setIsTestModalOpen(true)}
        onInitWorkspace={handleInitWorkspace}
        isInitializing={isInitializing}
      />

      {/* Messages Stream Panel */}
      {selectedProjectId && selectedSessionId && (
        <BridgeMessagesPanel
          projectId={selectedProjectId}
          sessionId={selectedSessionId}
          messages={messages}
          onRefresh={refreshBridgeData}
          recentBridgeEvents={recentEvents}
        />
      )}

      {/* Handshake Verification Modal */}
      {selectedProjectId && selectedSessionId && (
        <HandshakeModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          projectId={selectedProjectId}
          sessionId={selectedSessionId}
          activeChallenge={status?.activeChallenge || null}
          handshakeState={status?.handshakeState || 'not_configured'}
          onStartTest={handleStartConnectionTest}
        />
      )}
    </div>
  );
};
