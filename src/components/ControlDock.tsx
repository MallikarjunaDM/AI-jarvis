import { ChevronDown, ChevronUp, Mic, MicOff, MonitorUp, Radio, Send } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { NoteNode } from '../../shared/types';
import type { LiveStatus } from '../hooks/useGeminiLive';

interface ControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  statusLabel: string | null;
  answerText: string;
  sourceNodes: NoteNode[];
  exampleQuestions: string[];
  isThinking: boolean;
  isDictating: boolean;
  dictationSupported: boolean;
  liveStatus: LiveStatus;
  liveTranscript: { user: string; jarvis: string } | null;
  isSharingScreen: boolean;
  quietMode: boolean;
  errorText: string | null;
  onSubmitPrompt: (text: string) => void;
  onToggleDictation: () => void;
  onToggleLiveVoice: () => void;
  onToggleShareScreen: () => void;
  onFocusSingleNode: (nodeId: number) => void;
}

export default function ControlDock({
  collapsed,
  onToggleCollapse,
  statusLabel,
  answerText,
  sourceNodes,
  exampleQuestions,
  isThinking,
  isDictating,
  dictationSupported,
  liveStatus,
  liveTranscript,
  isSharingScreen,
  quietMode,
  errorText,
  onSubmitPrompt,
  onToggleDictation,
  onToggleLiveVoice,
  onToggleShareScreen,
  onFocusSingleNode,
}: ControlDockProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;
    setInput('');
    onSubmitPrompt(trimmed);
  };

  const liveActive =
    liveStatus === 'connecting' || liveStatus === 'listening' || liveStatus === 'speaking';

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(920px,94vw)] transition-transform duration-200 ease-out ${
        collapsed ? 'translate-y-[calc(100%-30px)]' : 'translate-y-0'
      }`}
    >
      {/* Collapse / Expand tab attached to top edge */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Toggle Controls (H)"
          className="flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#0a0f1d]/95 border border-b-0 border-white/12 text-[11px] font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Surface */}
      <div
        data-screen-panel="dock"
        className="rounded-xl bg-[#0a0f1d]/95 border border-white/12 shadow-2xl px-4 py-3 space-y-2.5"
      >
        {/* Status + Live Transcript / Answer row */}
        <div className="flex flex-col gap-1">
          {(statusLabel || errorText || quietMode) && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                {statusLabel && <span className="font-medium text-sky-300">{statusLabel}</span>}
                {quietMode && <span className="text-slate-400">Quiet mode (type "narrate" to speak)</span>}
              </div>
              {errorText && <span className="text-rose-400 truncate">{errorText}</span>}
            </div>
          )}

          {liveActive && liveTranscript && (liveTranscript.user || liveTranscript.jarvis) ? (
            <div className="text-sm text-slate-200 leading-snug space-y-0.5">
              {liveTranscript.user && (
                <p className="text-xs text-slate-400 truncate">You: {liveTranscript.user}</p>
              )}
              {liveTranscript.jarvis && (
                <p className="text-slate-100">{liveTranscript.jarvis}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-100 leading-snug">{answerText}</p>
          )}

          {sourceNodes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-0.5 text-xs text-slate-400">
              <span>Sources:</span>
              {sourceNodes.map((n, idx) => (
                <span key={n.id} className="inline-flex items-center gap-2">
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => onFocusSingleNode(n.id)}
                    className="text-sky-400 hover:text-sky-300 hover:underline transition-colors whitespace-nowrap"
                  >
                    {n.label}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Input + Voice + Screen Share Controls */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Ask JARVIS, "where do I click to...", "take over and...", or "remember that..."'
            disabled={isThinking}
            className="flex-1 min-w-0 px-3.5 py-2 rounded-lg bg-[#11192e] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60 transition-colors"
          />

          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask</span>
          </button>

          <button
            type="button"
            onClick={onToggleShareScreen}
            title={isSharingScreen ? 'Stop watching external screen' : 'Share external screen/tab for Eyes'}
            className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              isSharingScreen
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                : 'bg-[#11192e] border-white/10 text-slate-200 hover:border-white/25'
            }`}
          >
            <MonitorUp className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{isSharingScreen ? 'Watching' : 'Share Screen'}</span>
          </button>

          {dictationSupported && (
            <button
              type="button"
              onClick={onToggleDictation}
              disabled={liveActive || isThinking}
              title={isDictating ? 'Stop voice dictation' : 'Voice command (Chrome)'}
              className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isDictating
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                  : 'bg-[#11192e] border-white/10 text-slate-200 hover:border-white/25'
              } disabled:opacity-40 disabled:pointer-events-none`}
            >
              {isDictating ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isDictating ? 'Stop' : 'Speak'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleLiveVoice}
            title={liveActive ? 'End Live Voice conversation' : 'Start real-time Gemini Live voice conversation'}
            className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              liveActive
                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                : 'bg-[#11192e] border-white/10 text-slate-200 hover:border-sky-400/40 hover:text-sky-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{liveActive ? 'End Live' : 'Live Voice'}</span>
          </button>
        </form>

        {/* Compact Example Questions & Screen Pack Prompts Strip */}
        {exampleQuestions.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 text-[11px] text-slate-400">
            <span className="shrink-0 text-slate-500">Try:</span>
            {exampleQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSubmitPrompt(q)}
                disabled={isThinking}
                className="px-2.5 py-1 rounded-md bg-[#11192e] hover:bg-[#182340] border border-white/8 text-slate-300 hover:text-white transition-colors truncate max-w-[260px] shrink-0"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
