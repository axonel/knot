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
  Copy,
  Check,
  Code2,
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
  const [expandedDetailsIds, setExpandedDetailsIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const toggleDetails = (id: string) => {
    setExpandedDetailsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!outboundText.trim() || isSending) return;

    try {
      setIsSending(true);
      setFeedback(null);
      if (window.knotApi?.bridge?.sendMessage) {
        await window.knotApi.bridge.sendMessage(
          projectId,
          sessionId,
          outboundText.trim()
        );
        setOutboundText('');
        setFeedback({
          type: 'success',
          message: 'Message written atomically to outbox.',
        });
        setTimeout(() => setFeedback(null), 4000);
        onRefresh();
      } else {
        throw new Error('Bridge API unavailable');
      }
    } catch (err) {
      console.error('Failed to send bridge message:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to write message to outbox.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'handshake':
        return 'bg-[#000000] text-[#E05252] border-[#E05252]/40';
      case 'task_proposal':
        return 'bg-[#000000] text-[#F0F0ED] border-[#292C2F]';
      case 'file_review':
        return 'bg-[#000000] text-[#A5A5A0] border-[#292C2F]';
      default:
        return 'bg-[#000000] text-[#A5A5A0] border-[#292C2F]';
    }
  };

  const inboundCount = messages.filter((m) => m.sender === 'chatgpt').length;
  const outboundCount = messages.filter((m) => m.sender !== 'chatgpt').length;

  return (
    <div className="rounded-xl border border-[#292C2F] bg-[#1B1D1F] p-4.5 space-y-4 select-none flex flex-col">
      {/* Stream Header & Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#292C2F]">
        <div className="flex items-center gap-2.5">
          <MessageSquare size={16} className="text-[#E05252]" />
          <h3 className="text-sm font-semibold text-[#F0F0ED]">Bridge Message Stream</h3>
          <span className="text-xs font-mono text-[#A5A5A0]">
            ({messages.length} total)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex p-0.5 rounded-lg bg-[#000000] border border-[#292C2F] text-xs">
            <button
              onClick={() => setActiveFilter('all')}
              data-testid="filter-all-btn"
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold'
                  : 'text-[#A5A5A0] hover:text-[#F0F0ED]'
              }`}
            >
              All ({messages.length})
            </button>
            <button
              onClick={() => setActiveFilter('inbound')}
              data-testid="filter-inbound-btn"
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                activeFilter === 'inbound'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold'
                  : 'text-[#A5A5A0] hover:text-[#F0F0ED]'
              }`}
            >
              <ArrowDownLeft size={12} className="text-[#E05252]" />
              <span>Inbound ({inboundCount})</span>
            </button>
            <button
              onClick={() => setActiveFilter('outbound')}
              data-testid="filter-outbound-btn"
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                activeFilter === 'outbound'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold'
                  : 'text-[#A5A5A0] hover:text-[#F0F0ED]'
              }`}
            >
              <ArrowUpRight size={12} />
              <span>Outbound ({outboundCount})</span>
            </button>
            {rejectedEvents.length > 0 && (
              <button
                onClick={() => setActiveFilter('rejected')}
                data-testid="filter-rejected-btn"
                className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                  activeFilter === 'rejected'
                    ? 'bg-[#E05252] text-[#F0F0ED] font-semibold'
                    : 'text-[#E05252] hover:text-[#F0F0ED]'
                }`}
              >
                <span>Rejected ({rejectedEvents.length})</span>
              </button>
            )}
            <button
              onClick={() => setActiveFilter('canonical')}
              data-testid="filter-canonical-btn"
              className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                activeFilter === 'canonical'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold'
                  : 'text-[#A5A5A0] hover:text-[#F0F0ED]'
              }`}
            >
              <FileText size={12} />
              <span>Conversation View</span>
            </button>
          </div>

          <button
            onClick={onRefresh}
            title="Refresh Messages"
            aria-label="Refresh Messages"
            data-testid="refresh-messages-btn"
            className="p-1.5 rounded-lg bg-[#000000] border border-[#292C2F] text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-colors cursor-pointer"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Message List Stream Area */}
      <div
        data-testid="bridge-messages-container"
        className="space-y-3 min-h-[240px] max-h-[460px] overflow-y-auto pr-1 select-text"
      >
        {activeFilter === 'rejected' ? (
          rejectedEvents.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#A5A5A0] font-mono italic">
              No rejected messages. All inbound files adhered to protocol v1.
            </div>
          ) : (
            <div className="space-y-2.5">
              {rejectedEvents.map((evt, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-lg bg-[#000000] border border-[#E05252] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between text-[#E05252] font-semibold">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      Rejected File: {(evt.data?.filename as string) || 'Unknown'}
                    </span>
                    <span className="text-[10px] font-mono text-[#A5A5A0]">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#F0F0ED] bg-[#1B1D1F] p-2.5 rounded border border-[#292C2F]">
                    Reason: {String(evt.data?.reason || 'Validation error')}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeFilter === 'canonical' ? (
          /* Canonical Markdown View */
          <div className="p-4 rounded-lg bg-[#000000] border border-[#292C2F] space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-[#292C2F] pb-2 text-xs text-[#A5A5A0]">
              <span className="flex items-center gap-1.5 font-semibold text-[#F0F0ED]">
                <FileText size={14} className="text-[#E05252]" />
                conversation.md (Canonical Single-Writer View)
              </span>
              <span className="text-[10px] text-[#A5A5A0]">Knot Exclusive Writer</span>
            </div>
            {messages.length === 0 ? (
              <div className="text-xs text-[#A5A5A0] py-8 text-center italic">
                No conversation history yet. Send a message to ChatGPT or run a connection test.
              </div>
            ) : (
              <div className="space-y-3.5 text-xs">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg bg-[#1B1D1F] border border-[#292C2F] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#A5A5A0] border-b border-[#292C2F] pb-1">
                      <span className="font-semibold text-[#F0F0ED]">
                        ### [{m.sequence}] {m.sender.toUpperCase()} ({m.messageType})
                      </span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-[#F0F0ED] text-[11px] leading-relaxed pt-1">
                      {m.contentMarkdown}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="py-14 text-center text-xs text-[#A5A5A0] font-mono space-y-1.5">
            <div className="text-[#F0F0ED] font-semibold">No messages in this view.</div>
            <div className="text-[11px]">
              Use the composer below to send an outbound message, or trigger a handshake test.
            </div>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isExpanded = expandedMessageIds.has(msg.id);
            const isDetailsExpanded = expandedDetailsIds.has(msg.id);
            const isChatGPT = msg.sender === 'chatgpt';
            const isKnot = msg.sender === 'knot';
            const isLong = msg.contentMarkdown.length > 220;

            return (
              <div
                key={msg.id}
                data-testid={`message-item-${msg.id}`}
                className={`p-3.5 rounded-lg border transition-all ${
                  isChatGPT
                    ? 'bg-[#000000] border-l-4 border-l-[#E05252] border-t-[#292C2F] border-r-[#292C2F] border-b-[#292C2F]'
                    : 'bg-[#1B1D1F] border-l-4 border-l-[#292C2F] border-t-[#292C2F] border-r-[#292C2F] border-b-[#292C2F]'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[10px] text-[#A5A5A0] font-bold">
                      #{msg.sequence}
                    </span>

                    {/* Sender and Direction Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${
                        isChatGPT
                          ? 'bg-[#000000] text-[#E05252] border-[#E05252]/40'
                          : isKnot
                          ? 'bg-[#000000] text-[#F0F0ED] border-[#292C2F]'
                          : 'bg-[#000000] text-[#A5A5A0] border-[#292C2F]'
                      }`}
                    >
                      {isChatGPT ? (
                        <>
                          <ArrowDownLeft size={12} className="text-[#E05252]" />
                          ChatGPT (Inbound)
                        </>
                      ) : (
                        <>
                          <ArrowUpRight size={12} />
                          {msg.sender === 'knot' ? 'Knot (Outbound)' : `${msg.sender} (Outbound)`}
                        </>
                      )}
                    </span>

                    {/* Message Type Badge */}
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getTypeBadge(
                        msg.messageType
                      )}`}
                    >
                      type: {msg.messageType}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#A5A5A0] flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>

                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.contentMarkdown)}
                      title="Copy Message Text"
                      aria-label="Copy Message Text"
                      className="p-1 text-[#A5A5A0] hover:text-[#F0F0ED] transition-colors cursor-pointer"
                    >
                      {copiedId === msg.id ? (
                        <Check size={13} className="text-[#E05252]" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>

                    {isLong && (
                      <button
                        onClick={() => toggleExpand(msg.id)}
                        data-testid={`toggle-expand-${msg.id}`}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-colors cursor-pointer"
                        title={isExpanded ? 'Collapse Message' : 'Expand Message'}
                      >
                        {isExpanded ? (
                          <>
                            <span>Show Less</span>
                            <ChevronDown size={12} />
                          </>
                        ) : (
                          <>
                            <span>Show More</span>
                            <ChevronRight size={12} />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Content body with markdown formatting support */}
                <div className="mt-2.5 text-xs text-[#F0F0ED] font-mono leading-relaxed whitespace-pre-wrap select-text">
                  {isExpanded || !isLong
                    ? msg.contentMarkdown
                    : `${msg.contentMarkdown.slice(0, 220)}...`}
                </div>

                {/* Technical Metadata Disclosure */}
                <div className="mt-2.5 pt-2 border-t border-[#292C2F] flex flex-col gap-1 text-[10px] font-mono">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleDetails(msg.id)}
                      className="text-[#A5A5A0] hover:text-[#F0F0ED] flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Code2 size={11} />
                      <span>{isDetailsExpanded ? 'Hide Details' : 'Show Technical Details'}</span>
                    </button>
                    {msg.correlationId && !isDetailsExpanded && (
                      <span className="text-[#A5A5A0] truncate max-w-[200px]">
                        Corr: {msg.correlationId}
                      </span>
                    )}
                  </div>

                  {isDetailsExpanded && (
                    <div className="p-2 rounded bg-[#000000] border border-[#292C2F] space-y-1 text-[#A5A5A0] mt-1">
                      <div>
                        <strong className="text-[#F0F0ED]">Message ID:</strong> {msg.id}
                      </div>
                      {msg.correlationId && (
                        <div>
                          <strong className="text-[#F0F0ED]">Correlation ID:</strong>{' '}
                          {msg.correlationId}
                        </div>
                      )}
                      <div>
                        <strong className="text-[#F0F0ED]">Timestamp:</strong> {msg.createdAt}
                      </div>
                      <div>
                        <strong className="text-[#F0F0ED]">Sender:</strong> {msg.sender}
                      </div>
                      <div>
                        <strong className="text-[#F0F0ED]">Direction:</strong>{' '}
                        {isChatGPT ? 'Inbound' : 'Outbound'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Redesigned Outbound Message Composer */}
      <form
        onSubmit={handleSendMessage}
        data-testid="outbound-composer-form"
        className="pt-3.5 border-t border-[#292C2F] space-y-3"
      >
        <div className="flex items-center justify-between text-xs text-[#A5A5A0] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ArrowUpRight size={14} className="text-[#E05252]" />
            <span className="font-semibold text-[#F0F0ED]">Send Message to ChatGPT</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="bg-[#000000] px-2 py-0.5 rounded border border-[#292C2F] text-[#A5A5A0]">
              type: message
            </span>
            <span className="bg-[#000000] px-2 py-0.5 rounded border border-[#292C2F] text-[#A5A5A0]">
              Atomic write: outbox/*.json
            </span>
          </div>
        </div>

        <div className="relative">
          <textarea
            value={outboundText}
            onChange={(e) => setOutboundText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your markdown instruction or task for ChatGPT..."
            rows={3}
            data-testid="outbound-message-input"
            className="w-full bg-[#000000] border border-[#292C2F] rounded-lg p-3 text-xs text-[#F0F0ED] placeholder-[#A5A5A0]/50 focus:outline-none focus:border-[#E05252] font-mono resize-none transition-colors"
          />
        </div>

        {/* Feedback Alert if any */}
        {feedback && (
          <div
            data-testid="composer-feedback"
            className={`p-2 rounded-lg text-xs font-mono flex items-center gap-2 border ${
              feedback.type === 'success'
                ? 'bg-[#000000] text-[#F0F0ED] border-[#292C2F]'
                : 'bg-[#000000] text-[#E05252] border-[#E05252]'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check size={14} className="text-[#E05252]" />
            ) : (
              <AlertTriangle size={14} className="text-[#E05252]" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-[#A5A5A0] flex-wrap gap-2">
          <div className="leading-tight font-mono text-[10px]">
            Atomic write to outbox; single-writer sync to <code className="text-[#F0F0ED]">conversation.md</code>.
          </div>
          <button
            type="submit"
            disabled={!outboundText.trim() || isSending}
            data-testid="send-outbox-btn"
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
              outboundText.trim() && !isSending
                ? 'bg-[#E05252] hover:bg-[#E05252]/90 text-[#F0F0ED] cursor-pointer'
                : 'bg-[#000000] text-[#A5A5A0]/40 border border-[#292C2F] cursor-not-allowed'
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
