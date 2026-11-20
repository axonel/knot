import React, { useState, useRef, useEffect } from 'react';
import { LogEntry, LogLevel } from '../../../shared/types.js';
import { Terminal, Copy, Check, Trash2, ChevronDown, ChevronRight, ArrowDown } from 'lucide-react';

interface DiagnosticLogsProps {
  logs: LogEntry[];
  onClear: () => void;
  defaultExpanded?: boolean;
}

export const DiagnosticLogs: React.FC<DiagnosticLogsProps> = ({
  logs,
  onClear,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.level === filter;
  });

  useEffect(() => {
    if (autoScroll && isExpanded && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll, isExpanded]);

  const handleCopy = async () => {
    if (logs.length === 0) return;
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLogEntryStyle = (level: LogLevel) => {
    switch (level) {
      case 'stderr':
        return 'text-[#FF6E42] border-l-2 border-[#FF6E42]/60 pl-2 bg-[#FF6E42]/5';
      case 'system':
        return 'text-[#F9F9F9]/80 border-l-2 border-[#004E72] pl-2 bg-[#004E72]/10';
      case 'stdout':
      default:
        return 'text-[#F9F9F9]/90 pl-2.5';
    }
  };

  return (
    <div className="mt-4 border border-[#F9F9F9]/10 rounded-lg bg-[#092634]/60 overflow-hidden">
      {/* Header / Collapse Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#092634] border-b border-[#F9F9F9]/10 select-none">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs font-semibold text-[#F9F9F9] hover:text-white transition-colors cursor-pointer"
          data-testid="toggle-logs-btn"
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-[#F9F9F9]/70" />
          ) : (
            <ChevronRight size={14} className="text-[#F9F9F9]/70" />
          )}
          <span className="flex items-center gap-1.5">
            <Terminal size={14} className="text-[#004E72]" />
            Diagnostic Logs
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10">
            {logs.length}
          </span>
        </button>

        {isExpanded && (
          <div className="flex items-center gap-1.5">
            {/* Filter Buttons */}
            <div className="flex items-center rounded bg-[#090B0D] p-0.5 border border-[#F9F9F9]/10 mr-1 text-[11px]">
              {(['all', 'stdout', 'stderr', 'system'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setFilter(level)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                    filter === level
                      ? 'bg-[#004E72] text-[#F9F9F9]'
                      : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
              className={`p-1 rounded border text-xs cursor-pointer transition-colors ${
                autoScroll
                  ? 'bg-[#004E72]/40 border-[#004E72] text-[#F9F9F9]'
                  : 'bg-[#090B0D] border-[#F9F9F9]/10 text-[#F9F9F9]/40 hover:text-[#F9F9F9]'
              }`}
            >
              <ArrowDown size={13} />
            </button>

            {/* Copy Logs */}
            <button
              onClick={handleCopy}
              disabled={logs.length === 0}
              title="Copy logs to clipboard"
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#090B0D] border border-[#F9F9F9]/10 text-[11px] text-[#F9F9F9]/80 hover:text-[#F9F9F9] hover:border-[#F9F9F9]/20 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {copied ? <Check size={12} className="text-[#F9F9F9]" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Clear Logs */}
            <button
              onClick={onClear}
              disabled={logs.length === 0}
              title="Clear log buffer"
              className="p-1 rounded bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/60 hover:text-[#FF6E42] hover:border-[#FF6E42]/40 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Log Output Body */}
      {isExpanded && (
        <div
          ref={logContainerRef}
          className="p-3 bg-[#090B0D] max-h-64 min-h-[140px] overflow-y-auto font-mono text-[11px] leading-relaxed select-text space-y-1"
          data-testid="log-container"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-[#F9F9F9]/40 text-xs italic font-sans">
              No log messages recorded
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`py-0.5 rounded-sm transition-colors break-words ${getLogEntryStyle(
                  log.level
                )}`}
              >
                <span className="text-[#F9F9F9]/40 mr-2 select-none">
                  {log.timestamp.slice(11, 19)}
                </span>
                <span className="whitespace-pre-wrap">{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
