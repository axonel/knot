import React, { useEffect, useRef } from 'react';
import { Keyboard, X, ShieldAlert, Sparkles, Compass, Clock, BookOpen, MessageSquare } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  note?: string;
  icon?: React.ReactNode;
}

interface ShortcutCategory {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Workspace Navigation',
    items: [
      {
        keys: ['1'],
        description: 'Switch to Shared Conversation',
        note: 'Center canvas',
        icon: <MessageSquare size={13} className="text-[#004E72]" />,
      },
      {
        keys: ['2'],
        description: 'Switch to Context Vault',
        note: 'Project knowledge & decisions',
        icon: <BookOpen size={13} className="text-[#004E72]" />,
      },
      {
        keys: ['3'],
        description: 'Switch to Unified Timeline',
        note: 'Chronological events & traces',
        icon: <Clock size={13} className="text-[#004E72]" />,
      },
    ],
  },
  {
    title: 'Panels & Slide-Over Drawers',
    items: [
      {
        keys: ['Ctrl', 'B'],
        description: 'Toggle ChatGPT Activity / Planner Panel',
        note: 'Toggles sidebar in wide view or drawer in tiled/compact view',
        icon: <Compass size={13} className="text-[#FF6E42]" />,
      },
      {
        keys: ['Esc'],
        description: 'Close highest-priority open modal, diff viewer or drawer',
        note: 'Dismisses active overlays without modifying state',
      },
    ],
  },
  {
    title: 'Task Execution & Guardrails',
    items: [
      {
        keys: ['Ctrl', 'Enter'],
        description: 'Approve & dispatch selected task awaiting approval',
        note: 'Strictly active only when a task is awaiting user approval',
        icon: <Sparkles size={13} className="text-[#FF6E42]" />,
      },
    ],
  },
  {
    title: 'Help & Reference',
    items: [
      {
        keys: ['?'],
        description: 'Open / close this keyboard shortcuts reference',
        note: 'Shift + /',
        icon: <Keyboard size={13} className="text-[#004E72]" />,
      },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus();
      previousActiveElementRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
    >
      <div
        className="w-full max-w-2xl bg-[#092634] border border-[#F9F9F9]/15 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#090B0D] border-b border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#004E72]/40 text-[#FF6E42] border border-[#004E72]">
              <Keyboard size={16} />
            </div>
            <div>
              <h2
                id="shortcuts-dialog-title"
                className="text-xs font-bold font-mono tracking-wider uppercase text-[#F9F9F9]"
              >
                Keyboard Shortcuts Reference
              </h2>
              <p className="text-[11px] text-[#F9F9F9]/60 font-mono">
                Desktop developer ergonomics &bull; Omarchy Linux
              </p>
            </div>
          </div>

          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close shortcuts reference"
            title="Close (Esc)"
            className="p-1.5 rounded-lg text-[#F9F9F9]/60 hover:text-[#F9F9F9] hover:bg-[#F9F9F9]/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6E42] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {SHORTCUT_CATEGORIES.map((category) => (
            <div key={category.title} className="space-y-2">
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#FF6E42] flex items-center gap-1.5">
                <span>{category.title}</span>
              </h3>

              <div className="bg-[#090B0D]/70 rounded-lg border border-[#F9F9F9]/10 divide-y divide-[#F9F9F9]/5 overflow-hidden">
                {category.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-4 hover:bg-[#004E72]/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.icon && <div className="shrink-0">{item.icon}</div>}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F9F9F9] truncate">
                          {item.description}
                        </div>
                        {item.note && (
                          <div className="text-[10px] font-mono text-[#F9F9F9]/50 truncate">
                            {item.note}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, kIdx) => (
                        <React.Fragment key={kIdx}>
                          {kIdx > 0 && <span className="text-xs text-[#F9F9F9]/40 font-mono">+</span>}
                          <kbd className="inline-flex items-center justify-center min-w-[24px] px-2 py-1 text-[11px] font-mono font-bold text-[#F9F9F9] bg-[#092634] border border-[#F9F9F9]/20 rounded shadow-xs">
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Safety Guardrail Note */}
          <div className="p-3 rounded-lg bg-[#004E72]/20 border border-[#004E72]/40 flex items-start gap-2.5 text-xs">
            <ShieldAlert size={15} className="text-[#FF6E42] shrink-0 mt-0.5" />
            <div className="space-y-1 text-[#F9F9F9]/80 text-[11px] leading-relaxed">
              <span className="font-semibold text-[#F9F9F9] block">Typing & Approval Safety Guardrails:</span>
              <p>
                Navigation and approval shortcuts are suspended while typing inside inputs, textareas, code editors, or
                dialogs. Task approval with <kbd className="px-1 py-0.5 rounded bg-[#090B0D] font-mono text-[10px]">Ctrl+Enter</kbd> strictly executes only when an active task is in the awaiting-approval state.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#090B0D] border-t border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#F9F9F9]/50 font-mono">
            Press <kbd className="px-1.5 py-0.5 rounded bg-[#092634] text-[#F9F9F9] border border-[#F9F9F9]/20 text-[10px]">Esc</kbd> anytime to close
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6E42] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
