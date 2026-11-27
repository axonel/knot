import React, { useEffect, useRef } from 'react';
import type { Message, AntigravityToolCall } from '../../../shared/types.js';
import {
  User,
  Sparkles,
  Bot,
  Terminal,
  FileCode,
  AlertTriangle,
  CheckCircle,
  Activity,
  Layers,
} from 'lucide-react';

export interface ActiveToolEvent {
  tool: AntigravityToolCall;
  stepIndex: number;
}

interface ConversationTimelineProps {
  messages: Message[];
  streamingText: string;
  activeTools: ActiveToolEvent[];
  isThinking: boolean;
}

export const ConversationTimeline: React.FC<ConversationTimelineProps> = ({
  messages,
  streamingText,
  activeTools,
  isThinking,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, streamingText, activeTools]);

  const getSenderBadge = (sender: string) => {
    switch (sender) {
      case 'user':
        return (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E05252]">
            <User size={13} />
            <span>You</span>
          </div>
        );
      case 'antigravity':
        return (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#292C2F]">
            <Sparkles size={13} />
            <span>Antigravity</span>
          </div>
        );
      case 'chatgpt':
        return (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <Bot size={13} />
            <span>ChatGPT (Bridge)</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F0F0ED]/60">
            <Layers size={13} />
            <span className="capitalize">{sender}</span>
          </div>
        );
    }
  };

  const renderToolIcon = (name: string) => {
    if (name.includes('command') || name.includes('bash') || name.includes('terminal')) {
      return <Terminal size={14} className="text-[#292C2F]" />;
    }
    return <FileCode size={14} className="text-[#292C2F]" />;
  };

  return (
    <div className="flex-1 flex flex-col rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F]/30 overflow-hidden min-h-[400px]">
      <div className="p-3 border-b border-[#F0F0ED]/10 bg-[#1B1D1F] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-[#292C2F]" />
          <h3 className="text-xs font-semibold text-[#F0F0ED]">Session Conversation Timeline</h3>
        </div>
        <span className="text-[10px] font-mono text-[#F0F0ED]/40">
          {messages.length} messages
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
        {messages.length === 0 && !isThinking && streamingText.length === 0 && activeTools.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#F0F0ED]/40 space-y-2">
            <Sparkles size={28} className="text-[#292C2F]/60 animate-pulse" />
            <p className="text-xs">No conversation history in this session yet.</p>
            <p className="text-[11px] text-[#F0F0ED]/30">
              Type an instruction below to prompt the Antigravity agent.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col space-y-1.5 ${
                isUser ? 'items-end' : 'items-start'
              }`}
            >
              <div className="flex items-center gap-2">
                {getSenderBadge(msg.sender)}
                <span className="text-[10px] font-mono text-[#F0F0ED]/30">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>

              <div
                className={`max-w-[85%] rounded-xl p-3.5 leading-relaxed break-words ${
                  isUser
                    ? 'bg-[#292C2F] text-[#F0F0ED] shadow-sm'
                    : 'bg-[#000000] border border-[#F0F0ED]/10 text-[#F0F0ED]/90 shadow-sm'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans text-xs">
                  {msg.contentMarkdown}
                </div>
              </div>
            </div>
          );
        })}

        {/* Active Tool Calls */}
        {activeTools.length > 0 && (
          <div className="space-y-2 pt-2">
            {activeTools.map((t, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-[#292C2F]/40 bg-[#000000] p-3 space-y-2 shadow-inner"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs font-medium text-[#F0F0ED]">
                    {renderToolIcon(t.tool.name)}
                    <span>{t.tool.name}</span>
                  </div>
                  <div>
                    {t.tool.status === 'done' ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        <CheckCircle size={10} /> completed
                      </span>
                    ) : t.tool.status === 'denied' ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-[#E05252] bg-[#E05252]/10 px-2 py-0.5 rounded border border-[#E05252]/20">
                        <AlertTriangle size={10} /> denied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-[#292C2F] bg-[#292C2F]/20 px-2 py-0.5 rounded border border-[#292C2F]/40 animate-pulse">
                        <Activity size={10} className="animate-spin" /> executing...
                      </span>
                    )}
                  </div>
                </div>

                {t.tool.parameters && Object.keys(t.tool.parameters).length > 0 && (
                  <pre className="text-[11px] font-mono bg-[#1B1D1F]/60 p-2 rounded border border-[#F0F0ED]/5 text-[#F0F0ED]/70 overflow-x-auto max-h-32">
                    {JSON.stringify(t.tool.parameters, null, 2)}
                  </pre>
                )}

                {t.tool.output && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#F0F0ED]/40">
                      Output:
                    </span>
                    <pre className="text-[11px] font-mono bg-[#1B1D1F]/30 p-2 rounded text-[#F0F0ED]/80 overflow-x-auto max-h-36">
                      {t.tool.output}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Live Streaming Delta / Thinking Box */}
        {(isThinking || streamingText.length > 0) && (
          <div className="flex flex-col space-y-1.5 items-start">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#292C2F]">
                <Sparkles size={13} className="animate-spin" />
                <span>Antigravity (Streaming)</span>
              </div>
              <span className="text-[10px] font-mono text-[#E05252] animate-pulse">
                Thinking...
              </span>
            </div>

            <div className="max-w-[85%] rounded-xl p-3.5 bg-[#000000] border border-[#292C2F]/40 text-[#F0F0ED]/90 shadow-sm space-y-2">
              <div className="whitespace-pre-wrap font-sans text-xs">
                {streamingText}
                <span className="inline-block w-1.5 h-3 ml-1 bg-[#E05252] animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
