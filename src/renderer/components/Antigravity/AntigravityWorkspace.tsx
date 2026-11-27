import React, { useState, useEffect, useCallback } from 'react';
import type {
  Project,
  Session,
  Message,
  AntigravityStatus,
  AntigravityExecutionMode,
  AntigravityUiEvent,
} from '../../../shared/types.js';
import { AgentStatusCard } from './AgentStatusCard.js';
import { ConversationTimeline, type ActiveToolEvent } from './ConversationTimeline.js';
import { Composer } from './Composer.js';
import { StopProcessModal } from '../Safety/StopProcessModal.js';
import { FolderGit2, RefreshCw } from 'lucide-react';

export const AntigravityWorkspace: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [status, setStatus] = useState<AntigravityStatus | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [activeTools, setActiveTools] = useState<ActiveToolEvent[]>([]);
  const [selectedMode, setSelectedMode] = useState<AntigravityExecutionMode>('default');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showStopModal, setShowStopModal] = useState(false);
  const [isStoppingProcess, setIsStoppingProcess] = useState(false);

  // Load Projects
  const loadProjects = useCallback(async () => {
    try {
      const list = await window.knotApi?.projects.list(true);
      setProjects(list || []);
      if (list && list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Load Sessions
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
      console.error('Failed to load sessions:', err);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load Status and History for selected session
  const refreshSessionData = useCallback(async () => {
    if (!selectedSessionId || !window.knotApi?.antigravity) return;

    try {
      const s = await window.knotApi.antigravity.getStatus(selectedSessionId);
      setStatus(s);
      setSelectedMode(s.executionMode || 'default');

      const history = await window.knotApi.antigravity.getHistory(selectedSessionId);
      setMessages(history || []);
    } catch (err) {
      console.error('Failed to load Antigravity session data:', err);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    refreshSessionData();
  }, [refreshSessionData]);

  // Subscribe to live Antigravity events
  useEffect(() => {
    if (!window.knotApi?.antigravity?.onEvent) return;

    const unsubscribe = window.knotApi.antigravity.onEvent((ev: AntigravityUiEvent) => {
      if (ev.sessionId !== selectedSessionId) return;

      if (ev.type === 'status_changed') {
        refreshSessionData();
      } else if (ev.type === 'text_delta') {
        const delta = (ev.data.textDelta as string) || '';
        if (delta) {
          setStreamingText((prev) => prev + delta);
        }
      } else if (ev.type === 'tool_started' || ev.type === 'tool_completed' || ev.type === 'tool_denied') {
        const tool = ev.data.tool as any;
        const stepIndex = (ev.data.stepIndex as number) || 0;
        if (tool) {
          setActiveTools((prev) => {
            const next = [...prev];
            const existingIdx = next.findIndex((t) => t.stepIndex === stepIndex);
            if (existingIdx !== -1) {
              next[existingIdx] = { tool, stepIndex };
            } else {
              next.push({ tool, stepIndex });
            }
            return next;
          });
        }
      } else if (ev.type === 'turn_completed') {
        setStreamingText('');
        setActiveTools([]);
        refreshSessionData();
      } else if (ev.type === 'error') {
        setErrorBanner((ev.data.error as string) || 'Execution error');
        setStreamingText('');
        refreshSessionData();
      } else if (ev.type === 'auth_required') {
        setErrorBanner('Google Antigravity authentication required');
        refreshSessionData();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedSessionId, refreshSessionData]);

  // Actions
  const handleStart = async (mode?: AntigravityExecutionMode) => {
    if (!selectedSessionId || !window.knotApi?.antigravity) return;
    setErrorBanner(null);
    try {
      await window.knotApi.antigravity.start(selectedSessionId, { mode: mode || selectedMode });
      await refreshSessionData();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStop = async () => {
    if (!selectedSessionId || !window.knotApi?.antigravity) return;
    try {
      await window.knotApi.antigravity.stop(selectedSessionId);
      setStreamingText('');
      setActiveTools([]);
      await refreshSessionData();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleInterrupt = async () => {
    if (!selectedSessionId || !window.knotApi?.antigravity) return;
    try {
      await window.knotApi.antigravity.interrupt(selectedSessionId);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResume = async () => {
    if (!selectedSessionId || !window.knotApi?.antigravity) return;
    setErrorBanner(null);
    try {
      await window.knotApi.antigravity.resume(selectedSessionId);
      await refreshSessionData();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSendMessage = async (prompt: string) => {
    if (!selectedSessionId || !window.knotApi?.antigravity) return;
    setErrorBanner(null);
    setStreamingText('');
    setActiveTools([]);

    // Optimistic user message in UI
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      sessionId: selectedSessionId,
      sequence: messages.length + 1,
      sender: 'user',
      recipient: 'antigravity',
      messageType: 'text',
      contentMarkdown: prompt,
      correlationId: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      await window.knotApi.antigravity.sendMessage(selectedSessionId, prompt);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      await refreshSessionData();
    }
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const isThinking = status?.state === 'thinking';

  return (
    <div className="space-y-5">
      {/* Top Project & Session Context Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1B1D1F] p-3 rounded-xl border border-[#F0F0ED]/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-[#F0F0ED]/70 font-medium">
            <FolderGit2 size={15} className="text-[#292C2F]" />
            <span>Project:</span>
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-[#111213] border border-[#F0F0ED]/15 rounded-lg px-2.5 py-1 text-xs text-[#F0F0ED] font-mono focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#F0F0ED]/70 font-medium">
            <span>Session:</span>
            <select
              value={selectedSessionId || ''}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              disabled={sessions.length === 0}
              className="bg-[#111213] border border-[#F0F0ED]/15 rounded-lg px-2.5 py-1 text-xs text-[#F0F0ED] font-mono focus:outline-none disabled:opacity-40"
            >
              {sessions.length === 0 ? (
                <option value="">No sessions</option>
              ) : (
                sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.id.slice(0, 8)})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <button
          onClick={refreshSessionData}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED]/70 hover:text-[#F0F0ED] transition-colors"
          title="Refresh session status"
        >
          <RefreshCw size={12} />
          <span>Refresh</span>
        </button>
      </div>

      {errorBanner && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300 flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-400 hover:text-rose-200 ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Agent Status Card */}
      <AgentStatusCard
        status={status}
        onStart={handleStart}
        onStop={() => setShowStopModal(true)}
        onInterrupt={handleInterrupt}
        onResume={handleResume}
        onModeChange={setSelectedMode}
        selectedMode={selectedMode}
        disabled={!selectedSessionId}
      />

      {/* Main Conversation & Timeline Area */}
      <ConversationTimeline
        messages={messages}
        streamingText={streamingText}
        activeTools={activeTools}
        isThinking={isThinking}
      />

      {/* Prompt Composer */}
      <Composer
        onSendMessage={handleSendMessage}
        onInterrupt={handleInterrupt}
        isThinking={isThinking}
        workingDirectory={currentProject?.repositoryPath}
        disabled={!selectedSessionId}
      />

      {/* Stop Process Confirmation Modal */}
      <StopProcessModal
        isOpen={showStopModal}
        isStopping={isStoppingProcess}
        processDetails={{
          name: 'Antigravity Implementation Worker',
          processType: 'antigravity',
          state: status?.state || 'Running',
          pid: status?.pid ?? null,
          activeSessionId: selectedSessionId,
        }}
        onConfirmStop={async () => {
          setIsStoppingProcess(true);
          try {
            await handleStop();
          } finally {
            setIsStoppingProcess(false);
            setShowStopModal(false);
          }
        }}
        onCancel={() => setShowStopModal(false)}
      />
    </div>
  );
};
