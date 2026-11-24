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

  useEffect(() => {
    loadMessages();

    if (!window.knotApi) return;

    // Listen to bridge and orchestration events for live update
    const unBridge = window.knotApi.bridge.onEvent((evt) => {
      if (
        evt.type === 'message-received' ||
        evt.type === 'message-published' ||
        evt.type === 'workspace-ready'
      ) {
        loadMessages();
      }
    });

    const unOrch = window.knotApi.orchestration.onEvent(() => {
      loadMessages();
    });

    return () => {
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#004E72]/30 text-[#F9F9F9] border border-[#004E72]">
            <User size={10} className="text-[#F9F9F9]" /> User
          </span>
        );
      case 'chatgpt':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#004E72]/40 text-[#F9F9F9] border border-[#004E72]">
            <Bot size={10} className="text-[#FF6E42]" /> ChatGPT (Orchestrator)
          </span>
        );
      case 'antigravity':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/40">
            <Sparkles size={10} className="text-[#FF6E42]" /> Antigravity (Executor)
          </span>
        );
      case 'knot':
      case 'system':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#092634] text-[#F9F9F9]/70 border border-[#F9F9F9]/10">
            <Terminal size={10} className="text-[#004E72]" /> Knot
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-xl overflow-hidden">
      {/* Panel Header */}
      <div className="px-4 py-3 bg-[#092634] border-b border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={16} className="text-[#FF6E42] shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-[#F9F9F9] truncate">
                {session ? session.title : 'Select a Session'}
              </h2>
              {project && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10">
                  {project.name}
                </span>
              )}
            </div>
            <div className="text-[10px] text-[#F9F9F9]/40 font-mono truncate">
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
              className="p-1.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 hover:text-[#F9F9F9] hover:bg-[#004E72]/20 transition-all text-xs flex items-center gap-1"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span className="text-[10px] hidden sm:inline">{copied ? 'Copied' : 'Path'}</span>
            </button>
          )}

          {sessionPaths?.sessionDir && (
            <button
              onClick={handleOpenFolder}
              title="Open session directory in file manager"
              className="p-1.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 hover:text-[#F9F9F9] hover:bg-[#004E72]/20 transition-all text-xs flex items-center gap-1"
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
            className="p-1.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 hover:text-[#F9F9F9] hover:bg-[#004E72]/20 transition-all text-xs"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {!session ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#F9F9F9]/40">
            <FileText size={32} className="mb-2 text-[#F9F9F9]/20" />
            <p className="text-xs font-medium">Select a project and session from the sidebar to view the conversation.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#F9F9F9]/40">
            <Sparkles size={32} className="mb-2 text-[#004E72]" />
            <p className="text-xs font-semibold text-[#F9F9F9]">No messages recorded yet</p>
            <p className="text-[11px] mt-1 max-w-sm">
              ChatGPT can write to the inbox via Desktop Commander MCP, or you can send a message using Knot.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isAgent = msg.sender === 'antigravity';
            const isGpt = msg.sender === 'chatgpt';

            return (
              <div
                key={msg.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isUser
                    ? 'bg-[#004E72]/15 border-[#004E72]/30 ml-6'
                    : isAgent
                    ? 'bg-[#FF6E42]/5 border-[#FF6E42]/20 mr-6'
                    : isGpt
                    ? 'bg-[#092634] border-[#004E72]/40 mr-6'
                    : 'bg-[#092634]/50 border-[#F9F9F9]/10'
                }`}
              >
                {/* Message Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#F9F9F9]/5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[#F9F9F9]/40 text-[10px]">#{msg.sequence}</span>
                    {renderSenderBadge(msg.sender)}
                    {msg.recipient && (
                      <span className="text-[10px] text-[#F9F9F9]/40 font-mono">
                        → {msg.recipient}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-[#F9F9F9]/40">
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
                  </span>
                </div>

                {/* Markdown Message Body */}
                <div className="text-xs text-[#F9F9F9]/90 leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.contentMarkdown}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
