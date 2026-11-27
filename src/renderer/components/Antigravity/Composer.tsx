import React, { useState, KeyboardEvent } from 'react';
import { Send, AlertTriangle, Folder } from 'lucide-react';

interface ComposerProps {
  onSendMessage: (prompt: string) => void;
  onInterrupt: () => void;
  isThinking: boolean;
  workingDirectory?: string | null;
  disabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  onInterrupt,
  isThinking,
  workingDirectory,
  disabled = false,
}) => {
  const [prompt, setPrompt] = useState('');

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isThinking || disabled) return;
    onSendMessage(trimmed);
    setPrompt('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F] p-3 shadow-lg space-y-2">
      {/* Top pill bar */}
      <div className="flex items-center justify-between text-[11px] text-[#F0F0ED]/50 font-mono px-1">
        <div className="flex items-center gap-1.5 truncate max-w-[70%]">
          <Folder size={12} className="text-[#292C2F] shrink-0" />
          <span className="truncate">{workingDirectory || 'No project directory selected'}</span>
        </div>
        <div className="text-[10px] text-[#F0F0ED]/40">
          Enter to send, Shift+Enter for newline
        </div>
      </div>

      {/* Input area */}
      <div className="relative flex items-end gap-2 bg-[#000000] rounded-lg border border-[#F0F0ED]/15 p-2 focus-within:border-[#292C2F] transition-colors">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            disabled
              ? 'Select or create a project session to prompt Antigravity...'
              : isThinking
              ? 'Agent is thinking... you can send after completion or interrupt.'
              : 'Send instruction to Antigravity (e.g. Inspect tests, run build, check issues)...'
          }
          rows={2}
          className="flex-1 bg-transparent text-xs text-[#F0F0ED] placeholder-[#F0F0ED]/30 resize-none focus:outline-none font-sans leading-relaxed disabled:cursor-not-allowed"
        />

        <div className="flex items-center gap-1.5 pb-0.5">
          {isThinking ? (
            <button
              onClick={onInterrupt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E05252]/20 border border-[#E05252]/40 text-[#E05252] text-xs font-medium hover:bg-[#E05252]/30 transition-colors"
              title="Interrupt agent execution"
            >
              <AlertTriangle size={13} />
              <span>Interrupt</span>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!prompt.trim() || disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#292C2F] text-[#F0F0ED] text-xs font-medium hover:bg-[#292C2F]/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
              title="Send prompt"
            >
              <Send size={13} />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
