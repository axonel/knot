import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  FileCode,
} from 'lucide-react';
import type { HandshakeChallenge, HandshakeState } from '../../../shared/types.js';

interface HandshakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  sessionId: string;
  activeChallenge: HandshakeChallenge | null;
  handshakeState: HandshakeState;
  onStartTest: () => Promise<HandshakeChallenge | null>;
}

export const HandshakeModal: React.FC<HandshakeModalProps> = ({
  isOpen,
  onClose,
  activeChallenge,
  handshakeState,
  onStartTest,
}) => {
  const [isStarting, setIsStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Challenge expiry countdown
  useEffect(() => {
    if (!activeChallenge?.expiresAt || handshakeState === 'verified') {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const expires = new Date(activeChallenge.expiresAt).getTime();
      const remainingSec = Math.max(0, Math.floor((expires - now) / 1000));
      setTimeLeft(remainingSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeChallenge, handshakeState]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyPrompt = async () => {
    if (!activeChallenge?.instructions) return;
    try {
      await navigator.clipboard.writeText(activeChallenge.instructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy challenge prompt:', err);
    }
  };

  const handleGenerate = async () => {
    try {
      setIsStarting(true);
      await onStartTest();
    } catch (err) {
      console.error('Failed to generate challenge:', err);
    } finally {
      setIsStarting(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handshake-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/80 backdrop-blur-xs select-none"
    >
      <div className="w-full max-w-2xl bg-[#1B1D1F] border border-[#292C2F] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#292C2F] flex items-center justify-between bg-[#000000]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1B1D1F] border border-[#292C2F] flex items-center justify-center text-[#E05252]">
              <Zap size={16} />
            </div>
            <div>
              <h2 id="handshake-modal-title" className="text-sm font-semibold text-[#F0F0ED]">
                Verify ChatGPT Bridge Connection
              </h2>
              <p className="text-xs text-[#A5A5A0]">
                End-to-end filesystem handshake test with Desktop Commander MCP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Dialog"
            className="p-1.5 rounded-lg text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Status Banner */}
          {handshakeState === 'verified' ? (
            <div className="p-3.5 rounded-lg bg-[#000000] border border-[#292C2F] flex items-start gap-3">
              <CheckCircle2 size={18} className="text-[#E05252] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#F0F0ED]">
                  Bridge Connection Verified!
                </div>
                <div className="text-[11px] text-[#A5A5A0] leading-relaxed">
                  ChatGPT successfully read the challenge from outbox and wrote a valid handshake response into the session inbox. The filesystem bridge is active.
                </div>
              </div>
            </div>
          ) : handshakeState === 'error' ? (
            <div className="p-3.5 rounded-lg bg-[#000000] border border-[#E05252] flex items-start gap-3">
              <AlertCircle size={18} className="text-[#E05252] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#E05252]">
                  Verification Failed or Expired
                </div>
                <div className="text-[11px] text-[#A5A5A0] leading-relaxed">
                  The challenge was rejected or timed out. Ensure Desktop Commander Remote MCP is active and allowed to write to the session inbox.
                </div>
              </div>
            </div>
          ) : handshakeState === 'awaiting_response' ? (
            <div className="p-3.5 rounded-lg bg-[#000000] border border-[#E05252]/40 flex items-start justify-between gap-3 animate-pulse">
              <div className="flex items-start gap-2.5">
                <Clock size={18} className="text-[#E05252] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#F0F0ED]">
                    Awaiting ChatGPT Response...
                  </div>
                  <div className="text-[11px] text-[#A5A5A0] leading-relaxed">
                    Paste the prompt into ChatGPT. As soon as ChatGPT writes the response file to the inbox, Knot will verify it instantly.
                  </div>
                </div>
              </div>
              {timeLeft !== null && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase font-mono text-[#A5A5A0]">Expires in</div>
                  <div className="text-xs font-mono font-bold text-[#E05252]">
                    {formatTimer(timeLeft)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-[#000000] border border-[#292C2F] flex items-start gap-2.5">
              <HelpCircle size={16} className="text-[#A5A5A0] shrink-0 mt-0.5" />
              <div className="text-[11px] text-[#A5A5A0] leading-relaxed">
                This test generates an outbox challenge file, produces a formatted prompt for ChatGPT, and watches the inbox for the matching signed response.
              </div>
            </div>
          )}

          {/* Stepper Steps */}
          <div className="space-y-3">
            {/* Step 1: Generate Challenge */}
            <div className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F0F0ED] flex items-center gap-2">
                  <span className="w-4.5 h-4.5 rounded-full bg-[#292C2F] text-[#F0F0ED] flex items-center justify-center text-[10px] font-mono">
                    1
                  </span>
                  Generate Handshake Challenge
                </span>
                <button
                  onClick={handleGenerate}
                  disabled={isStarting}
                  data-testid="generate-challenge-btn"
                  className="px-3 py-1 rounded-md text-xs font-medium bg-[#292C2F] hover:bg-[#292C2F]/80 text-[#F0F0ED] transition-colors border border-[#292C2F] disabled:opacity-50 cursor-pointer"
                >
                  {isStarting ? 'Generating...' : activeChallenge ? 'Regenerate Challenge' : 'Generate Challenge'}
                </button>
              </div>
              {activeChallenge && (
                <div className="text-[11px] font-mono text-[#A5A5A0] truncate">
                  Challenge ID: <span className="text-[#F0F0ED]">{activeChallenge.challengeId}</span>
                </div>
              )}
            </div>

            {/* Step 2: Copy Prompt */}
            <div className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F0F0ED] flex items-center gap-2">
                  <span className="w-4.5 h-4.5 rounded-full bg-[#292C2F] text-[#F0F0ED] flex items-center justify-center text-[10px] font-mono">
                    2
                  </span>
                  Copy Prompt for ChatGPT
                </span>
                <button
                  onClick={handleCopyPrompt}
                  disabled={!activeChallenge?.instructions}
                  data-testid="copy-prompt-btn"
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    copied
                      ? 'bg-[#292C2F] text-[#F0F0ED]'
                      : 'bg-[#E05252] hover:bg-[#E05252]/90 text-[#F0F0ED] disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy Prompt'}</span>
                </button>
              </div>

              {activeChallenge?.instructions ? (
                <div className="p-2.5 rounded bg-[#1B1D1F] border border-[#292C2F] font-mono text-[11px] text-[#F0F0ED] max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                  {activeChallenge.instructions}
                </div>
              ) : (
                <div className="p-3 rounded bg-[#1B1D1F] border border-[#292C2F] text-center text-[11px] text-[#A5A5A0] italic">
                  Generate a challenge above to produce the copyable prompt.
                </div>
              )}
            </div>

            {/* Step 3: Instructions & Verification Details */}
            <div className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-1.5 text-xs text-[#A5A5A0]">
              <span className="text-xs font-semibold text-[#F0F0ED] flex items-center gap-2">
                <span className="w-4.5 h-4.5 rounded-full bg-[#292C2F] text-[#F0F0ED] flex items-center justify-center text-[10px] font-mono">
                  3
                </span>
                Send to ChatGPT with Desktop Commander
              </span>
              <p className="leading-relaxed text-[11px]">
                Paste the prompt into ChatGPT in a session with your Desktop Commander Remote connection enabled. ChatGPT will write the response file directly to Knot&apos;s session inbox.
              </p>
              {activeChallenge && (
                <div className="pt-1 text-[10px] font-mono space-y-0.5 text-[#A5A5A0]">
                  <div className="truncate">Outbox: {activeChallenge.outboxFilePath}</div>
                  <div className="truncate">Inbox: {activeChallenge.inboxExpectedFilePath}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#292C2F] bg-[#000000] flex items-center justify-between">
          <div className="text-[10px] text-[#A5A5A0] font-mono flex items-center gap-1.5">
            <FileCode size={12} className="text-[#A5A5A0]" />
            <span>Local filesystem protocol v1</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] hover:bg-[#292C2F]/80 text-[#F0F0ED] transition-colors cursor-pointer"
          >
            {handshakeState === 'verified' ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
