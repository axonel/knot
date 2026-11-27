import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Copy,
  FolderOpen,
  RefreshCw,
  User,
  Bot,
  Sparkles,
  Terminal,
  Check,
} from 'lucide-react';
import type { Message, Project, Session, SessionBridgePaths } from '../../../shared/types.js';
import { SpotlightCard, Waves, ShinyText } from '../ReactBits/index.js';

interface SharedConversationPanelProps {
  project: Project | null;
  session: Session | null;
  sessionPaths?: SessionBridgePaths | null;
  onRefresh?: () => void;
}

export const SharedConversationPanel: React.FC<SharedConversationPanelProps> = ({
  project,
  session,
  sessionPaths,
  onRefresh,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    if (!session || !window.knotApi) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const msgs = await window.knotApi.messages.list(session.id, { limit: 200 });
      setMessages(msgs);
    } catch (err) {
      console.error('[SharedConversationPanel] Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const msgDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadMessages();

    if (!window.knotApi) return;

    const debouncedLoad = () => {
      if (msgDebounceTimer.current) {
        clearTimeout(msgDebounceTimer.current);
      }
      msgDebounceTimer.current = setTimeout(() => {
        loadMessages();
      }, 150);
    };

    // Listen to bridge and orchestration events for live update
    const unBridge = window.knotApi.bridge.onEvent((evt) => {
      if (
        evt.type === 'message-received' ||
        evt.type === 'message-published' ||
        evt.type === 'workspace-ready'
      ) {
        debouncedLoad();
      }
    });

    const unOrch = window.knotApi.orchestration.onEvent(() => {
      debouncedLoad();
    });

    return () => {
      if (msgDebounceTimer.current) {
        clearTimeout(msgDebounceTimer.current);
      }
      unBridge();
      unOrch();
    };
  }, [session?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleCopyPath = () => {
    if (sessionPaths?.conversationFile) {
      navigator.clipboard.writeText(sessionPaths.conversationFile);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenFolder = () => {
    if (sessionPaths?.sessionDir && window.knotApi) {
      window.knotApi.bridge.openDirectory(sessionPaths.sessionDir);
    }
  };

  const renderSenderBadge = (sender: string) => {
    switch (sender.toLowerCase()) {
      case 'user':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#F0F0ED] border border-[#292C2F]">
            <User size={10} className="text-[#F0F0ED]" /> User
          </span>
        );
      case 'chatgpt':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#F0F0ED] border border-[#292C2F]">
            <Bot size={10} className="text-[#E05252]" /> ChatGPT (Orchestrator)
          </span>
        );
      case 'antigravity':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#E05252] border border-[#E05252]/40">
            <Sparkles size={10} className="text-[#E05252]" /> Antigravity (Executor)
          </span>
        );
      case 'knot':
      case 'system':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#111213] text-[#A5A5A0] border border-[#292C2F]">
            <Terminal size={10} className="text-[#A5A5A0]" /> Knot
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111213] border border-[#292C2F] rounded-xl overflow-hidden shadow-lg">
      {/* Panel Header */}
      <div className="px-4 py-3 bg-[#1B1D1F] border-b border-[#292C2F] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={16} className="text-[#E05252] shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-[#F0F0ED] truncate font-sans">
                {session ? session.title : 'Select a Session'}
              </h2>
              {project && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#111213] text-[#A5A5A0] border border-[#292C2F]">
                  {project.name}
                </span>
              )}
            </div>
            <div className="text-[10px] text-[#A5A5A0] font-mono truncate">
              {sessionPaths?.conversationFile || 'Canonical conversation.md snapshot'}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {sessionPaths?.conversationFile && (
            <button
              onClick={handleCopyPath}
              title="Copy conversation.md path"
              className="p-1.5 rounded-lg bg-[#111213] border border-[#292C2F] text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-all text-xs flex items-center gap-1 cursor-pointer"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span className="text-[10px] hidden sm:inline">{copied ? 'Copied' : 'Path'}</span>
            </button>
          )}

          {sessionPaths?.sessionDir && (
            <button
              onClick={handleOpenFolder}
              title="Open session directory in file manager"
              className="p-1.5 rounded-lg bg-[#111213] border border-[#292C2F] text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-all text-xs flex items-center gap-1 cursor-pointer"
            >
              <FolderOpen size={12} />
              <span className="text-[10px] hidden sm:inline">Folder</span>
            </button>
          )}

          <button
            onClick={() => {
              loadMessages();
              onRefresh?.();
            }}
            disabled={loading}
            title="Reload conversation"
            className="p-1.5 rounded-lg bg-[#111213] border border-[#292C2F] text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-all text-xs cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#111213] relative">
        {!session ? (
          <div className="h-full relative flex flex-col items-center justify-center text-center p-8 text-[#A5A5A0]">
            <Waves lineColor="rgba(240, 240, 237, 0.04)" accentColor="rgba(224, 82, 82, 0.2)" className="absolute inset-0 pointer-events-none" />
            <FileText size={32} className="mb-2 text-[#292C2F] relative z-10" />
            <ShinyText text="Select a project and session to inspect collaboration." speed={3} className="text-xs font-medium text-[#F0F0ED] relative z-10" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full relative flex flex-col items-center justify-center text-center p-8 text-[#A5A5A0]">
            <Waves lineColor="rgba(240, 240, 237, 0.04)" accentColor="rgba(224, 82, 82, 0.2)" className="absolute inset-0 pointer-events-none" />
            <Sparkles size={32} className="mb-2 text-[#E05252] relative z-10" />
            <p className="text-xs font-semibold text-[#F0F0ED] relative z-10">No messages recorded yet</p>
            <p className="text-[11px] mt-1 max-w-sm text-[#A5A5A0] relative z-10">
              ChatGPT can write to the inbox via Desktop Commander MCP, or you can send a message using Knot.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isAgent = msg.sender === 'antigravity';
            const isGpt = msg.sender === 'chatgpt';

            return (
              <SpotlightCard
                key={msg.id}
                spotlightColor="rgba(224, 82, 82, 0.08)"
                className={`p-3.5 rounded-xl border transition-all ${
                  isUser
                    ? 'bg-[#1B1D1F] border-[#292C2F] ml-6'
                    : isAgent
                    ? 'bg-[#1B1D1F] border-[#E05252]/30 mr-6'
                    : isGpt
                    ? 'bg-[#1B1D1F] border-[#292C2F] mr-6'
                    : 'bg-[#111213] border-[#292C2F]'
                }`}
              >
                {/* Message Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#292C2F] text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[#A5A5A0] text-[10px]">#{msg.sequence}</span>
                    {renderSenderBadge(msg.sender)}
                    {msg.recipient && (
                      <span className="text-[10px] text-[#A5A5A0] font-mono">
                        &rarr; {msg.recipient}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-[#A5A5A0]">
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
                  </span>
                </div>

                {/* Markdown Message Body */}
                <div className="text-xs text-[#F0F0ED] leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.contentMarkdown}
                </div>
              </SpotlightCard>
            );
          })
        )}
      </div>
    </div>
  );
};
