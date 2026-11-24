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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090B0D]/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-[#092634] border border-[#F9F9F9]/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#F9F9F9]/10 flex items-center justify-between bg-[#090B0D]/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FF6E42]/20 border border-[#FF6E42]/30 flex items-center justify-center text-[#FF6E42]">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#F9F9F9]">
                Verify ChatGPT Bridge Connection
              </h2>
              <p className="text-xs text-[#F9F9F9]/60">
                End-to-end filesystem handshake test with Desktop Commander MCP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#F9F9F9]/50 hover:text-[#F9F9F9] hover:bg-[#F9F9F9]/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Status Banner */}
          {handshakeState === 'verified' ? (
            <div className="p-4 rounded-xl bg-[#004E72]/30 border border-[#004E72] flex items-start gap-3">
              <CheckCircle2 size={20} className="text-[#FF6E42] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-[#F9F9F9]">
                  Bridge Connection Verified!
                </div>
                <div className="text-xs text-[#F9F9F9]/80 leading-relaxed">
                  ChatGPT successfully read the challenge from outbox and wrote a valid handshake response into the session inbox. The filesystem bridge is active and ready for collaborative workflows.
                </div>
              </div>
            </div>
          ) : handshakeState === 'error' ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 flex items-start gap-3">
              <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-red-200">
                  Verification Failed or Expired
                </div>
                <div className="text-xs text-red-300/80 leading-relaxed">
                  The challenge was rejected or timed out. Ensure Desktop Commander Remote MCP is running in ChatGPT and allowed to write to the session inbox.
                </div>
              </div>
            </div>
          ) : handshakeState === 'awaiting_response' ? (
            <div className="p-4 rounded-xl bg-[#FF6E42]/10 border border-[#FF6E42]/40 flex items-start justify-between gap-3 animate-pulse">
              <div className="flex items-start gap-3">
                <Clock size={20} className="text-[#FF6E42] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[#F9F9F9]">
                    Awaiting ChatGPT Response...
                  </div>
                  <div className="text-xs text-[#F9F9F9]/70 leading-relaxed">
                    Paste the prompt into ChatGPT. As soon as ChatGPT writes the response file to the inbox, Knot will instantly verify it.
                  </div>
                </div>
              </div>
              {timeLeft !== null && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase font-mono text-[#F9F9F9]/50">Expires in</div>
                  <div className="text-sm font-mono font-bold text-[#FF6E42]">
                    {formatTimer(timeLeft)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#090B0D] border border-[#F9F9F9]/10 flex items-start gap-3">
              <HelpCircle size={18} className="text-[#004E72] shrink-0 mt-0.5" />
              <div className="text-xs text-[#F9F9F9]/70 leading-relaxed">
                This test creates an outbox challenge file, provides you with a pre-formatted prompt for ChatGPT, and watches the inbox for the matching signed response.
              </div>
            </div>
          )}

          {/* Stepper Steps */}
          <div className="space-y-4">
            {/* Step 1: Generate Challenge */}
            <div className="p-3.5 rounded-xl bg-[#090B0D] border border-[#F9F9F9]/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F9F9F9] flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#004E72] text-[#F9F9F9] flex items-center justify-center text-[10px] font-mono">
                    1
                  </span>
                  Generate Handshake Challenge
                </span>
                <button
                  onClick={handleGenerate}
                  disabled={isStarting}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] transition-colors border border-[#004E72]/50 disabled:opacity-50"
                >
                  {isStarting ? 'Generating...' : activeChallenge ? 'Regenerate Challenge' : 'Generate Challenge'}
                </button>
              </div>
              {activeChallenge && (
                <div className="text-[11px] font-mono text-[#F9F9F9]/60 truncate">
                  Challenge ID: <span className="text-[#FF6E42]">{activeChallenge.challengeId}</span>
                </div>
              )}
            </div>

            {/* Step 2: Copy Prompt */}
            <div className="p-3.5 rounded-xl bg-[#090B0D] border border-[#F9F9F9]/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F9F9F9] flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#004E72] text-[#F9F9F9] flex items-center justify-center text-[10px] font-mono">
                    2
                  </span>
                  Copy Prompt for ChatGPT
                </span>
                <button
                  onClick={handleCopyPrompt}
                  disabled={!activeChallenge?.instructions}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    copied
                      ? 'bg-[#004E72] text-[#F9F9F9]'
                      : 'bg-[#FF6E42] hover:bg-[#FF6E42]/90 text-[#F9F9F9] disabled:opacity-30'
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? 'Copied to Clipboard' : 'Copy Prompt'}</span>
                </button>
              </div>

              {activeChallenge?.instructions ? (
                <div className="p-3 rounded-lg bg-[#092634] border border-[#F9F9F9]/10 font-mono text-[11px] text-[#F9F9F9]/90 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed select-all">
                  {activeChallenge.instructions}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#092634]/50 border border-[#F9F9F9]/10 text-center text-xs text-[#F9F9F9]/40 italic">
                  Generate a challenge above to produce the copyable prompt.
                </div>
              )}
            </div>

            {/* Step 3: Instructions & Verification Details */}
            <div className="p-3.5 rounded-xl bg-[#090B0D] border border-[#F9F9F9]/10 space-y-2 text-xs text-[#F9F9F9]/70">
              <span className="text-xs font-semibold text-[#F9F9F9] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#004E72] text-[#F9F9F9] flex items-center justify-center text-[10px] font-mono">
                  3
                </span>
                Send to ChatGPT with Desktop Commander
              </span>
              <p className="leading-relaxed">
                Paste the prompt into ChatGPT in a session with your Desktop Commander Remote custom GPT or MCP connection enabled. ChatGPT will write the response file directly to Knot&apos;s session inbox.
              </p>
              {activeChallenge && (
                <div className="pt-1 text-[11px] font-mono space-y-1 text-[#F9F9F9]/50">
                  <div className="truncate">Outbox: {activeChallenge.outboxFilePath}</div>
                  <div className="truncate">Inbox: {activeChallenge.inboxExpectedFilePath}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#F9F9F9]/10 bg-[#090B0D]/40 flex items-center justify-between">
          <div className="text-[11px] text-[#F9F9F9]/40 font-mono flex items-center gap-1.5">
            <FileCode size={13} className="text-[#004E72]" />
            <span>Self-contained local filesystem protocol v1</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] transition-colors"
          >
            {handshakeState === 'verified' ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
