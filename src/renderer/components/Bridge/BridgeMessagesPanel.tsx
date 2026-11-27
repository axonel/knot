import React, { useState } from 'react';
import {
  Send,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  FileText,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { Message, BridgeEvent } from '../../../shared/types.js';

interface BridgeMessagesPanelProps {
  projectId: string;
  sessionId: string;
  messages: Message[];
  onRefresh: () => void;
  recentBridgeEvents: BridgeEvent[];
}

export const BridgeMessagesPanel: React.FC<BridgeMessagesPanelProps> = ({
  projectId,
  sessionId,
  messages,
  onRefresh,
  recentBridgeEvents,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'inbound' | 'outbound' | 'rejected' | 'canonical'>('all');
  const [outboundText, setOutboundText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());

  // Filter messages based on tab
  const filteredMessages = messages.filter((m) => {
    if (activeFilter === 'inbound') return m.sender === 'chatgpt';
    if (activeFilter === 'outbound') return m.sender === 'knot' || m.sender === 'system' || m.sender === 'user';
    return true;
  });

  // Filter rejected events
  const rejectedEvents = recentBridgeEvents.filter((e) => e.type === 'message-rejected');

  const toggleExpand = (id: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outboundText.trim() || isSending) return;

    try {
      setIsSending(true);
      if (window.knotApi?.bridge?.sendMessage) {
        await window.knotApi.bridge.sendMessage(
          projectId,
          sessionId,
          outboundText.trim()
        );
        setOutboundText('');
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to send bridge message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'handshake':
        return 'bg-[#E05252]/20 text-[#E05252] border-[#E05252]/40';
      case 'task_proposal':
        return 'bg-[#292C2F]/40 text-[#F0F0ED] border-[#292C2F]';
      case 'file_review':
        return 'bg-purple-900/40 text-purple-200 border-purple-700/50';
      default:
        return 'bg-[#111213] text-[#F0F0ED]/60 border-[#F0F0ED]/10';
    }
  };

  return (
    <div className="rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F] p-5 shadow-lg flex flex-col space-y-4">
      {/* Panel Header & Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0ED]/10 pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[#E05252]" />
          <h3 className="text-sm font-semibold text-[#F0F0ED]">Bridge Message Stream</h3>
          <span className="text-xs font-mono text-[#F0F0ED]/40">({messages.length} total)</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex p-0.5 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 text-xs">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeFilter === 'all'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-medium'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              }`}
            >
              All ({messages.length})
            </button>
            <button
              onClick={() => setActiveFilter('inbound')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeFilter === 'inbound'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-medium'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              }`}
            >
              Inbound ({messages.filter((m) => m.sender === 'chatgpt').length})
            </button>
            <button
              onClick={() => setActiveFilter('outbound')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeFilter === 'outbound'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-medium'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              }`}
            >
              Outbound ({messages.filter((m) => m.sender !== 'chatgpt').length})
            </button>
            {rejectedEvents.length > 0 && (
              <button
                onClick={() => setActiveFilter('rejected')}
                className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  activeFilter === 'rejected'
                    ? 'bg-red-900/60 text-red-200 font-medium'
                    : 'text-red-400 hover:text-red-300'
                }`}
              >
                <span>Rejected ({rejectedEvents.length})</span>
              </button>
            )}
            <button
              onClick={() => setActiveFilter('canonical')}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                activeFilter === 'canonical'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-medium'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              }`}
            >
              <FileText size={12} />
              <span>Conversation View</span>
            </button>
          </div>

          <button
            onClick={onRefresh}
            title="Refresh Messages"
            className="p-1.5 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 text-[#F0F0ED]/60 hover:text-[#F0F0ED] hover:bg-[#111213]/80 transition-colors"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Messages List Area */}
      <div className="space-y-3 min-h-[220px] max-h-[460px] overflow-y-auto pr-1">
        {activeFilter === 'rejected' ? (
          rejectedEvents.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#F0F0ED]/40 italic">
              No rejected messages. All inbound files adhered to protocol v1.
            </div>
          ) : (
            <div className="space-y-2.5">
              {rejectedEvents.map((evt, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between text-red-300 font-medium">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-red-400" />
                      Rejected File: {(evt.data?.filename as string) || 'Unknown'}
                    </span>
                    <span className="text-[10px] font-mono text-red-400/80">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-red-200/80 bg-red-950/50 p-2 rounded border border-red-900/40">
                    Reason: {String(evt.data?.reason || 'Validation error')}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeFilter === 'canonical' ? (
          /* Canonical markdown view */
          <div className="p-4 rounded-xl bg-[#111213] border border-[#F0F0ED]/10 space-y-3">
            <div className="flex items-center justify-between border-b border-[#F0F0ED]/10 pb-2 text-xs font-mono text-[#F0F0ED]/60">
              <span className="flex items-center gap-1.5">
                <FileText size={14} className="text-[#292C2F]" />
                conversation.md (Canonical Single-Writer View)
              </span>
              <span className="text-[10px] text-[#F0F0ED]/40">Knot exclusive writer</span>
            </div>
            {messages.length === 0 ? (
              <div className="text-xs text-[#F0F0ED]/40 py-8 text-center italic">
                No conversation history yet. Send a message to ChatGPT or run a handshake test.
              </div>
            ) : (
              <div className="space-y-4 font-mono text-xs">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg bg-[#1B1D1F]/60 border border-[#F0F0ED]/5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#F0F0ED]/50 border-b border-[#F0F0ED]/5 pb-1">
                      <span className="font-semibold text-[#F0F0ED]">
                        ### [{m.sequence}] {m.sender.toUpperCase()} ({m.messageType})
                      </span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-[#F0F0ED]/80 text-[11px] leading-relaxed pt-1">
                      {m.contentMarkdown}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#F0F0ED]/40 italic space-y-1">
            <div>No messages in this view.</div>
            <div className="text-[11px]">Send an outbound message below or run a handshake test.</div>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isExpanded = expandedMessageIds.has(msg.id);
            const isChatGPT = msg.sender === 'chatgpt';
            const isKnot = msg.sender === 'knot';

            return (
              <div
                key={msg.id}
                className={`p-3 rounded-xl border transition-all ${
                  isChatGPT
                    ? 'bg-[#111213] border-[#E05252]/20 hover:border-[#E05252]/40'
                    : 'bg-[#1B1D1F]/70 border-[#292C2F]/40 hover:border-[#292C2F]'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[#F0F0ED]/40 font-semibold">
                      #{msg.sequence}
                    </span>

                    {/* Sender Pill */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        isChatGPT
                          ? 'bg-[#E05252]/15 text-[#E05252] border-[#E05252]/30'
                          : isKnot
                          ? 'bg-[#292C2F]/30 text-[#F0F0ED] border-[#292C2F]'
                          : 'bg-[#111213] text-[#F0F0ED]/60 border-[#F0F0ED]/10'
                      }`}
                    >
                      {isChatGPT ? (
                        <>
                          <ArrowDownLeft size={11} />
                          ChatGPT
                        </>
                      ) : (
                        <>
                          <ArrowUpRight size={11} />
                          {msg.sender === 'knot' ? 'Knot' : msg.sender}
                        </>
                      )}
                    </span>

                    {/* Message Type Badge */}
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${getTypeBadge(
                        msg.messageType
                      )}`}
                    >
                      {msg.messageType}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#F0F0ED]/40 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>

                    <button
                      onClick={() => toggleExpand(msg.id)}
                      className="p-1 text-[#F0F0ED]/40 hover:text-[#F0F0ED] transition-colors"
                      title={isExpanded ? 'Collapse' : 'Expand full text'}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                </div>

                {/* Content preview or full body */}
                <div className="mt-2 text-xs text-[#F0F0ED]/90 font-mono leading-relaxed whitespace-pre-wrap">
                  {isExpanded || msg.contentMarkdown.length <= 160
                    ? msg.contentMarkdown
                    : `${msg.contentMarkdown.slice(0, 160)}...`}
                </div>

                {/* Footer details if correlation */}
                {msg.correlationId && (
                  <div className="mt-2 pt-1 border-t border-[#F0F0ED]/5 text-[10px] font-mono text-[#F0F0ED]/40 truncate">
                    Correlation: {msg.correlationId}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Outbound Message Form */}
      <form
        onSubmit={handleSendMessage}
        className="pt-3 border-t border-[#F0F0ED]/10 space-y-2.5"
      >
        <div className="flex items-center justify-between text-xs text-[#F0F0ED]/60">
          <span className="font-semibold text-[#F0F0ED] flex items-center gap-1.5">
            <ArrowUpRight size={13} className="text-[#292C2F]" />
            Send Outbound Message to ChatGPT
          </span>
          <span className="text-[10px] font-mono text-[#F0F0ED]/40 bg-[#111213] px-2 py-0.5 rounded border border-[#F0F0ED]/10">
            type: message
          </span>
        </div>

        <div className="relative">
          <textarea
            value={outboundText}
            onChange={(e) => setOutboundText(e.target.value)}
            placeholder="Type your markdown instruction or task for ChatGPT..."
            rows={3}
            className="w-full bg-[#111213] border border-[#F0F0ED]/10 rounded-xl p-3 text-xs text-[#F0F0ED] placeholder-[#F0F0ED]/30 focus:outline-none focus:border-[#292C2F] font-mono resize-none transition-colors"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#F0F0ED]/40">
          <div className="leading-tight">
            Atomic write to outbox; single-writer sync to <code className="text-[#F0F0ED]/60">conversation.md</code>.
          </div>
          <button
            type="submit"
            disabled={!outboundText.trim() || isSending}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
              outboundText.trim() && !isSending
                ? 'bg-[#292C2F] hover:bg-[#292C2F]/80 text-[#F0F0ED] cursor-pointer'
                : 'bg-[#111213] text-[#F0F0ED]/30 border border-[#F0F0ED]/10 cursor-not-allowed'
            }`}
          >
            <Send size={13} />
            <span>{isSending ? 'Writing to Outbox...' : 'Send to Outbox'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
