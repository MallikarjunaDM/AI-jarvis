import { ArrowUpRight, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { NoteNode } from '../../shared/types';
import { getGroupStyle } from '../utils/galaxyTheme';

interface NoteInspectorProps {
  node: NoteNode;
  neighbors: NoteNode[];
  onClose: () => void;
  onSelectNeighbor: (nodeId: number) => void;
  onAskAboutNode: (label: string) => void;
}

export default function NoteInspector({
  node,
  neighbors,
  onClose,
  onSelectNeighbor,
  onAskAboutNode,
}: NoteInspectorProps) {
  const [showFull, setShowFull] = useState(false);
  const groupStyle = getGroupStyle(node.group);

  return (
    <aside
      data-screen-panel="inspector"
      aria-label="Note Inspector"
      className="fixed top-16 right-5 z-20 w-[340px] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-14rem)] flex flex-col rounded-xl bg-[#0a0f1d]/95 border border-white/12 shadow-2xl text-slate-100"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-white/10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: groupStyle.hex }}
            />
            <span className="font-medium text-slate-300">{groupStyle.label}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{node.wordCount} words</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{neighbors.length} links</span>
          </div>
          <h2 className="mt-1 font-display text-base font-semibold text-white leading-snug">
            {node.label}
          </h2>
          <p className="mt-0.5 text-[11px] font-mono-tabular text-slate-500 truncate">
            {node.path}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close inspector"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto jarvis-scroll px-4 py-3 space-y-4">
        <div>
          <p className="text-[13px] leading-relaxed text-slate-300 whitespace-pre-wrap">
            {showFull ? node.content : node.excerpt}
          </p>
          {node.content.length > node.excerpt.length + 20 && (
            <button
              type="button"
              onClick={() => setShowFull((v) => !v)}
              className="mt-2 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
            >
              {showFull ? 'Show excerpt' : 'Read full note'}
            </button>
          )}
        </div>

        {neighbors.length > 0 && (
          <div className="pt-3 border-t border-white/10">
            <p className="text-xs font-medium text-slate-400 mb-2">
              Connected Notes ({neighbors.length})
            </p>
            <div className="space-y-1">
              {neighbors.map((nb) => {
                const nbStyle = getGroupStyle(nb.group);
                return (
                  <button
                    key={nb.id}
                    type="button"
                    onClick={() => onSelectNeighbor(nb.id)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-slate-200 hover:bg-white/8 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: nbStyle.hex }}
                      />
                      <span className="truncate">{nb.label}</span>
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10">
        <button
          type="button"
          onClick={() => onAskAboutNode(node.label)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border border-sky-400/25 transition-colors whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Summarize key takeaways</span>
        </button>
      </div>
    </aside>
  );
}
