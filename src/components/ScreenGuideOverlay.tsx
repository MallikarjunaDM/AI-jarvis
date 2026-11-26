import { Check, OctagonAlert, Play, X } from 'lucide-react';
import type { DriverPlanResponse } from '../../shared/types';

export interface ActivePointer {
  xPercent: number;
  yPercent: number;
  label: string;
}

export interface DriverUiState {
  phase: 'idle' | 'planning' | 'awaiting_go' | 'driving' | 'stopped' | 'done' | 'refused';
  task: string;
  plan: DriverPlanResponse | null;
  currentStepIndex: number;
  narration: string;
  cursor: { xPercent: number; yPercent: number; clicking: boolean } | null;
}

interface ScreenGuideOverlayProps {
  pointer: ActivePointer | null;
  onDismissPointer: () => void;
  driver: DriverUiState;
  onConfirmGo: () => void;
  onEmergencyStop: () => void;
  onDismissDriver: () => void;
  notePadOpen: boolean;
  noteTitle: string;
  noteBody: string;
  onChangeNoteTitle: (val: string) => void;
  onChangeNoteBody: (val: string) => void;
  onSaveNotePad: () => void;
  onCloseNotePad: () => void;
}

export default function ScreenGuideOverlay({
  pointer,
  onDismissPointer,
  driver,
  onConfirmGo,
  onEmergencyStop,
  onDismissDriver,
  notePadOpen,
  noteTitle,
  noteBody,
  onChangeNoteTitle,
  onChangeNoteBody,
  onSaveNotePad,
  onCloseNotePad,
}: ScreenGuideOverlayProps) {
  // Compute arrow tail offset inward from the target tip so it never clips off-screen
  const renderPointerArrow = () => {
    if (!pointer) return null;
    const tipX = pointer.xPercent;
    const tipY = pointer.yPercent;
    const dx = tipX > 50 ? -12 : 12;
    const dy = tipY > 50 ? -14 : 14;
    const tailX = Math.max(8, Math.min(92, tipX + dx));
    const tailY = Math.max(8, Math.min(92, tipY + dy));

    const angleDeg = (Math.atan2(tipY - tailY, tipX - tailX) * 180) / Math.PI;

    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <svg
          className="w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Crisp white outer outline */}
          <line
            x1={tailX}
            y1={tailY}
            x2={tipX}
            y2={tipY}
            stroke="#FFFFFF"
            strokeWidth="0.95"
            strokeLinecap="round"
          />
          {/* Big red-orange shaft */}
          <line
            x1={tailX}
            y1={tailY}
            x2={tipX}
            y2={tipY}
            stroke="#FF4500"
            strokeWidth="0.58"
            strokeLinecap="round"
          />
          {/* Target arrowhead */}
          <g transform={`translate(${tipX}, ${tipY}) rotate(${angleDeg})`}>
            <polygon
              points="0,0 -2.6,-1.35 -2.1,0 -2.6,1.35"
              fill="#FF4500"
              stroke="#FFFFFF"
              strokeWidth="0.28"
              strokeLinejoin="round"
            />
          </g>
        </svg>

        {/* Dark pill near tail with 2-4 word label + dismiss */}
        <div
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/95 border border-white/80 shadow-2xl"
          style={{ left: `${tailX}%`, top: `${tailY}%` }}
        >
          <span className="text-xs font-semibold text-white whitespace-nowrap">
            {pointer.label}
          </span>
          <button
            type="button"
            onClick={onDismissPointer}
            title="Dismiss pointer"
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderPointerArrow()}

      {/* Careful Driver animated AI mouse cursor */}
      {driver.cursor && (
        <div
          className="fixed z-50 pointer-events-none transition-all duration-500 ease-out"
          style={{
            left: `${driver.cursor.xPercent}%`,
            top: `${driver.cursor.yPercent}%`,
            transform: 'translate(-4px, -4px)',
          }}
        >
          <div className="relative">
            {driver.cursor.clicking && (
              <span className="absolute -inset-2 rounded-full border-2 border-amber-400 opacity-80" />
            )}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 3L19 11L12.5 13.5L10 20L4 3Z"
                fill="#FF4500"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Careful Driver Plan & Safety Console */}
      {driver.phase !== 'idle' && (
        <div
          data-screen-panel="driver"
          className="fixed top-16 left-5 z-30 w-[360px] max-w-[calc(100vw-2.5rem)] rounded-xl bg-[#0a0f1d]/95 border border-white/15 shadow-2xl p-4 text-slate-100 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-amber-300">
                {driver.phase === 'refused'
                  ? 'Safety Boundary Enforced'
                  : driver.phase === 'awaiting_go'
                  ? 'Careful Driver Plan · Awaiting "go"'
                  : driver.phase === 'driving'
                  ? 'Careful Driver Active · Corner or "stop" aborts'
                  : driver.phase === 'stopped'
                  ? 'Careful Driver Stopped'
                  : driver.phase === 'done'
                  ? 'Task Complete'
                  : 'Inspecting Screen…'}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {driver.task}
              </p>
            </div>
            {(driver.phase === 'done' || driver.phase === 'stopped' || driver.phase === 'refused') && (
              <button
                type="button"
                onClick={onDismissDriver}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {driver.plan && driver.plan.steps.length > 0 && (
            <ol className="space-y-1.5 text-xs text-slate-300">
              {driver.plan.steps.map((step, idx) => {
                const completed = driver.phase === 'done' || idx < driver.currentStepIndex;
                const current = driver.phase === 'driving' && idx === driver.currentStepIndex;
                return (
                  <li
                    key={idx}
                    className={`flex items-start gap-2 ${
                      completed
                        ? 'text-emerald-300'
                        : current
                        ? 'text-white font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="font-mono-tabular shrink-0 mt-0.5">
                      {completed ? '✓' : `${idx + 1}.`}
                    </span>
                    <span>{step}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {driver.narration && (
            <p className="text-xs text-slate-200 border-t border-white/10 pt-2.5">
              {driver.narration}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            {driver.phase === 'awaiting_go' && (
              <>
                <button
                  type="button"
                  onClick={onConfirmGo}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Go — Execute Plan</span>
                </button>
                <button
                  type="button"
                  onClick={onEmergencyStop}
                  className="px-3 py-2 rounded-lg bg-white/8 hover:bg-white/15 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
              </>
            )}

            {(driver.phase === 'driving' || driver.phase === 'planning') && (
              <button
                type="button"
                onClick={onEmergencyStop}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <OctagonAlert className="w-3.5 h-3.5" />
                <span>Emergency Stop (or type "stop")</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Built-in Harmless Note Pad Modal (for "open a new note titled ..." tasks) */}
      {notePadOpen && (
        <div
          data-screen-panel="notepad"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-30 w-[440px] max-w-[calc(100vw-2rem)] rounded-xl bg-[#0a0f1d]/96 border border-white/15 shadow-2xl p-4 text-slate-100 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <h3 className="font-display text-sm font-semibold text-white">
              New Note Editor
            </h3>
            <button
              type="button"
              onClick={onCloseNotePad}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2.5">
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => onChangeNoteTitle(e.target.value)}
              placeholder="Note title…"
              className="w-full px-3 py-2 rounded-lg bg-[#11192e] border border-white/12 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60"
            />
            <textarea
              rows={5}
              value={noteBody}
              onChange={(e) => onChangeNoteBody(e.target.value)}
              placeholder="Write your note content…"
              className="w-full px-3 py-2 rounded-lg bg-[#11192e] border border-white/12 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/60 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCloseNotePad}
              className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-slate-300 transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveNotePad}
              disabled={!noteTitle.trim() && !noteBody.trim()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Note</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
