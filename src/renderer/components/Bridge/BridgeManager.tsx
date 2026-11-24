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
import { FolderGit2, RefreshCw } from 'lucide-react';

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
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  // Load Projects on mount
  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await window.knotApi?.projects.list(true);
      setProjects(list || []);

      if (list && list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProjectId]);

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

      // If event pertains to the active session or verification, refresh state
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

  if (isLoading) {
    return (
      <div className="py-24 text-center text-xs font-mono text-[#F9F9F9]/50 animate-pulse">
        Loading bridge environment...
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-[#092634] border border-[#F9F9F9]/10 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[#004E72]/30 border border-[#004E72] flex items-center justify-center mx-auto text-[#FF6E42]">
          <FolderGit2 size={24} />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[#F9F9F9]">No Projects Found</h3>
          <p className="text-xs text-[#F9F9F9]/60 max-w-md mx-auto leading-relaxed">
            The ChatGPT Bridge operates within project and session sandboxes. Please create a project and session in the &quot;Projects &amp; Sessions&quot; tab first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Session Selection Toolbar */}
      <div className="rounded-xl border border-[#F9F9F9]/10 bg-[#092634]/70 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Project Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[#F9F9F9]/50 font-mono text-[11px] uppercase">Project:</span>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#004E72]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Session Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[#F9F9F9]/50 font-mono text-[11px] uppercase">Session:</span>
            {sessions.length === 0 ? (
              <span className="text-[#F9F9F9]/40 italic">No sessions in project</span>
            ) : (
              <select
                value={selectedSessionId || ''}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#004E72]"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.status})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <button
          onClick={refreshBridgeData}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 hover:text-[#F9F9F9] transition-colors"
        >
          <RefreshCw size={12} />
          <span>Sync Bridge</span>
        </button>
      </div>

      {/* Main Status & Diagnostics Card */}
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
