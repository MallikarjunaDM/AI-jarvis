import { Compass, FilePlus2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatResponse,
  DriverPlanResponse,
  DriverStepResponse,
  KnowledgeGraph,
  NoteNode,
  RememberResponse,
  ScreenPointResult,
} from '../shared/types';
import ControlDock from './components/ControlDock';
import KnowledgeGalaxy3D, { type FocusRequest, type HoverInfo } from './components/KnowledgeGalaxy3D';
import NoteInspector from './components/NoteInspector';
import ScreenGuideOverlay, {
  type ActivePointer,
  type DriverUiState,
} from './components/ScreenGuideOverlay';
import { useGeminiLive } from './hooks/useGeminiLive';
import { getGroupStyle } from './utils/galaxyTheme';
import { captureScreenPng } from './utils/screenCapture';
import {
  createDictationController,
  isTtsMuted,
  markAudioUnlocked,
  scheduleBootGreeting,
  setTtsMuted,
  speakJarvis,
  stopSpeaking,
} from './utils/voiceEngine';

const IDLE_DRIVER: DriverUiState = {
  phase: 'idle',
  task: '',
  plan: null,
  currentStepIndex: 0,
  narration: '',
  cursor: null,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function App() {
  const [graph, setGraph] = useState<KnowledgeGraph>({
    nodes: [],
    links: [],
    exampleQuestions: [],
  });
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<number[]>([]);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [answerText, setAnswerText] = useState('Initializing knowledge galaxy…');
  const [sourceIds, setSourceIds] = useState<number[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeakingTts, setIsSpeakingTts] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [muted, setMuted] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<{ user: string; jarvis: string } | null>(null);

  // Screen Pack (Eyes & Hands) state
  const [pointer, setPointer] = useState<ActivePointer | null>(null);
  const [driver, setDriver] = useState<DriverUiState>(IDLE_DRIVER);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [notePadOpen, setNotePadOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `session-${Date.now()}`,
  );
  const flightCounterRef = useRef(0);
  const bootScheduledRef = useRef(false);
  const webglCaptureRef = useRef<() => string | null>(() => null);
  const sharedVideoRef = useRef<HTMLVideoElement | null>(null);
  const sharedStreamRef = useRef<MediaStream | null>(null);
  const driverAbortRef = useRef(false);
  const driverRef = useRef(driver);
  driverRef.current = driver;
  const pointerRef = useRef(pointer);
  pointerRef.current = pointer;
  const noteDraftRef = useRef({ title: '', body: '' });
  noteDraftRef.current = { title: noteTitle, body: noteBody };

  const issueFocus = useCallback(
    (mode: FocusRequest['mode'], nodeIds: number[], newbornId?: number | null) => {
      flightCounterRef.current += 1;
      setFocusRequest({
        id: flightCounterRef.current,
        mode,
        nodeIds,
        newbornId,
      });
    },
    [],
  );

  // Load initial graph from backend
  useEffect(() => {
    let active = true;
    fetch('/api/graph')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load notes graph.');
        return res.json() as Promise<KnowledgeGraph>;
      })
      .then((data) => {
        if (!active) return;
        setGraph(data);
        const greeting = `Good evening, sir. ${data.nodes.length} notes indexed, all present and accounted for.`;
        setAnswerText(greeting);

        if (!bootScheduledRef.current) {
          bootScheduledRef.current = true;
          scheduleBootGreeting(greeting, () => setIsSpeakingTts(false));
        }
      })
      .catch((err) => {
        if (!active) return;
        setErrorText(err instanceof Error ? err.message : 'Unable to reach server.');
      });

    return () => {
      active = false;
    };
  }, []);

  // Clean up shared screen stream on unmount
  useEffect(() => {
    return () => {
      if (sharedStreamRef.current) {
        sharedStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Physical screen-corner fail-safe while Careful Driver is active
  useEffect(() => {
    if (driver.phase !== 'driving') return;

    const onMouseMove = (ev: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const inCorner =
        (ev.clientX <= 12 && ev.clientY <= 12) ||
        (ev.clientX >= w - 12 && ev.clientY <= 12) ||
        (ev.clientX <= 12 && ev.clientY >= h - 12) ||
        (ev.clientX >= w - 12 && ev.clientY >= h - 12);
      if (inCorner) {
        driverAbortRef.current = true;
        stopSpeaking();
        setDriver((prev) => ({
          ...prev,
          phase: 'stopped',
          cursor: null,
          narration: 'Corner fail-safe triggered. Driver halted immediately.',
        }));
        setAnswerText('Corner fail-safe triggered. Stopped immediately.');
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [driver.phase]);

  // Adjacency lookup
  const neighborMap = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const link of graph.links) {
      const aList = map.get(link.source) ?? [];
      aList.push(link.target);
      map.set(link.source, aList);

      const bList = map.get(link.target) ?? [];
      bList.push(link.source);
      map.set(link.target, bList);
    }
    return map;
  }, [graph.links]);

  const activeNeighborIds = useMemo(() => {
    const set = new Set<number>();
    if (selectedNodeId !== null) {
      for (const nb of neighborMap.get(selectedNodeId) ?? []) set.add(nb);
    }
    for (const hid of highlightedNodeIds) {
      for (const nb of neighborMap.get(hid) ?? []) set.add(nb);
    }
    return Array.from(set);
  }, [neighborMap, selectedNodeId, highlightedNodeIds]);

  const selectedNode = useMemo(
    () => (selectedNodeId !== null ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [graph.nodes, selectedNodeId],
  );

  const selectedNodeNeighbors = useMemo(() => {
    if (selectedNodeId === null) return [];
    const ids = neighborMap.get(selectedNodeId) ?? [];
    return ids
      .map((id) => graph.nodes.find((n) => n.id === id))
      .filter((n): n is NoteNode => Boolean(n));
  }, [graph.nodes, neighborMap, selectedNodeId]);

  const sourceNodes = useMemo(() => {
    return sourceIds
      .map((id) => graph.nodes.find((n) => n.id === id))
      .filter((n): n is NoteNode => Boolean(n));
  }, [graph.nodes, sourceIds]);

  const groups = useMemo(() => {
    return Array.from(new Set(graph.nodes.map((n) => n.group)));
  }, [graph.nodes]);

  const combinedExamples = useMemo(() => {
    return [
      ...graph.exampleQuestions,
      'Where do I click to open a new note?',
      'Take over and open a new note titled Hello from my AI',
    ];
  }, [graph.exampleQuestions]);

  const speakResponse = useCallback((text: string) => {
    if (isTtsMuted()) return;
    setIsSpeakingTts(true);
    speakJarvis(text, () => setIsSpeakingTts(false));
  }, []);

  const applyFlyToSource = useCallback(
    (nodeIds: number[]) => {
      if (nodeIds.length === 0) return;
      setHighlightedNodeIds(nodeIds);
      setSourceIds(nodeIds);
      setSelectedNodeId(nodeIds[0]);

      if (nodeIds.length >= 4) {
        issueFocus('cluster', nodeIds);
      } else {
        issueFocus('node', nodeIds);
      }
    },
    [issueFocus],
  );

  const handleSelectNode = useCallback(
    (nodeId: number) => {
      markAudioUnlocked();
      setActiveGroupFilter(null);
      setHighlightedNodeIds([nodeId]);
      setSelectedNodeId(nodeId);
      issueFocus('node', [nodeId]);
    },
    [issueFocus],
  );

  const handleResetOverview = useCallback(() => {
    setSelectedNodeId(null);
    setHighlightedNodeIds([]);
    setActiveGroupFilter(null);
    issueFocus('overview', []);
  }, [issueFocus]);

  const saveNoteFromComposer = useCallback(
    async (explicitTitle?: string, explicitBody?: string) => {
      const titleToSave = (explicitTitle ?? noteDraftRef.current.title).trim();
      const bodyToSave = (explicitBody ?? noteDraftRef.current.body).trim() || titleToSave;
      if (!titleToSave && !bodyToSave) return;

      const res = await fetch('/api/remember', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleToSave || undefined,
          text: bodyToSave,
        }),
      });
      const data = (await res.json()) as RememberResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save note.');

      setNotePadOpen(false);
      setNoteTitle('');
      setNoteBody('');
      setGraph(data.graph);
      setSourceIds([data.node.id]);
      setHighlightedNodeIds([data.node.id]);
      setSelectedNodeId(data.node.id);
      issueFocus('node', [data.node.id], data.node.id);
      return data;
    },
    [issueFocus],
  );

  // Screen Sharing toggle for watching external tabs/windows
  const handleToggleShareScreen = useCallback(async () => {
    if (isSharingScreen) {
      if (sharedStreamRef.current) {
        sharedStreamRef.current.getTracks().forEach((t) => t.stop());
        sharedStreamRef.current = null;
      }
      if (sharedVideoRef.current) {
        sharedVideoRef.current.srcObject = null;
      }
      setIsSharingScreen(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: false,
      });
      sharedStreamRef.current = stream;
      if (!sharedVideoRef.current) {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        sharedVideoRef.current = video;
      }
      sharedVideoRef.current.srcObject = stream;
      await sharedVideoRef.current.play();
      setIsSharingScreen(true);

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setIsSharingScreen(false);
        sharedStreamRef.current = null;
      });
    } catch {
      setErrorText('Screen sharing cancelled or unavailable.');
    }
  }, [isSharingScreen]);

  const takeShot = useCallback(async (withGrid = true) => {
    return captureScreenPng({
      getWebGLDataUrl: () => webglCaptureRef.current(),
      sharedVideo: sharedVideoRef.current,
      withGrid,
    });
  }, []);

  const handleEmergencyStop = useCallback(() => {
    driverAbortRef.current = true;
    stopSpeaking();
    setPointer(null);
    setDriver((prev) =>
      prev.phase === 'idle'
        ? prev
        : {
            ...prev,
            phase: 'stopped',
            cursor: null,
            narration: 'Stopped immediately. Touching nothing else.',
          },
    );
    setAnswerText('Stopped immediately.');
  }, []);

  // Execute Careful Driver one step at a time (screenshot -> look -> act -> narrate)
  const executeDriverPlan = useCallback(async () => {
    const current = driverRef.current;
    if (!current.plan || current.phase !== 'awaiting_go') return;

    driverAbortRef.current = false;
    const planSteps = current.plan.steps;
    const task = current.task;
    const completedHistory: string[] = [];

    setDriver((prev) => ({
      ...prev,
      phase: 'driving',
      currentStepIndex: 0,
      narration: 'Starting first step…',
    }));

    for (let stepIdx = 0; stepIdx < Math.max(planSteps.length + 1, 6); stepIdx++) {
      if (driverAbortRef.current) return;

      // 1. Fresh screenshot before looking
      await delay(220);
      if (driverAbortRef.current) return;
      const shot = await takeShot(true);
      if (driverAbortRef.current) return;

      // 2. Ask vision model for the SINGLE next step
      const res = await fetch('/api/screen/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: shot,
          task,
          planSteps,
          stepIndex: stepIdx,
          completedHistory,
        }),
      });
      if (!res.ok) throw new Error('Driver step execution failed.');
      const step = (await res.json()) as DriverStepResponse;
      if (driverAbortRef.current) return;

      // 3. Glide animated AI cursor if coordinates provided
      if (typeof step.action.xPercent === 'number' && typeof step.action.yPercent === 'number') {
        setDriver((prev) => ({
          ...prev,
          currentStepIndex: Math.min(stepIdx, planSteps.length - 1),
          narration: step.narration,
          cursor: {
            xPercent: step.action.xPercent!,
            yPercent: step.action.yPercent!,
            clicking: false,
          },
        }));
        await delay(520);
        if (driverAbortRef.current) return;

        setDriver((prev) => ({
          ...prev,
          cursor: prev.cursor ? { ...prev.cursor, clicking: true } : null,
        }));
        await delay(220);
      } else {
        setDriver((prev) => ({
          ...prev,
          currentStepIndex: Math.min(stepIdx, planSteps.length - 1),
          narration: step.narration,
        }));
      }

      if (driverAbortRef.current) return;

      // 4. Perform the single action & narrate one sentence
      setAnswerText(step.narration);
      speakResponse(step.narration);

      if (step.action.type === 'open_notepad') {
        setNoteTitle('');
        setNoteBody('');
        setNotePadOpen(true);
      } else if (step.action.type === 'fill_notepad') {
        setNotePadOpen(true);
        if (step.action.noteTitle) setNoteTitle(step.action.noteTitle);
        if (step.action.noteBody) setNoteBody(step.action.noteBody);
      } else if (step.action.type === 'save_notepad') {
        await saveNoteFromComposer(step.action.noteTitle, step.action.noteBody);
      } else if (
        step.action.type === 'click' &&
        typeof step.action.xPercent === 'number' &&
        typeof step.action.yPercent === 'number'
      ) {
        const px = (step.action.xPercent / 100) * window.innerWidth;
        const py = (step.action.yPercent / 100) * window.innerHeight;
        const el = document.elementFromPoint(px, py) as HTMLElement | null;
        const clickable = el?.closest('button, a, input, textarea') as HTMLElement | null;
        if (clickable && !clickable.closest('[data-screen-panel="driver"]')) {
          clickable.click();
        }
      } else if (step.action.type === 'type' && step.action.text) {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: step.action.text,
            sessionId: sessionIdRef.current,
          }),
        });
        if (resp.ok) {
          const chatData = (await resp.json()) as ChatResponse;
          setAnswerText(chatData.answer);
          if (chatData.isNoteQuery && chatData.nodes.length > 0) {
            applyFlyToSource(chatData.nodes);
          }
        }
      }

      completedHistory.push(`Step ${stepIdx + 1}: ${step.narration}`);

      if (step.done || step.action.type === 'finish') {
        setDriver((prev) => ({
          ...prev,
          phase: 'done',
          cursor: null,
          currentStepIndex: planSteps.length,
          narration: step.narration,
        }));
        return;
      }

      await delay(750);
    }

    setDriver((prev) => ({
      ...prev,
      phase: 'done',
      cursor: null,
      narration: 'Done, sir.',
    }));
  }, [applyFlyToSource, saveNoteFromComposer, speakResponse, takeShot]);

  const handleSubmitPrompt = useCallback(
    async (rawText: string) => {
      markAudioUnlocked();
      const text = rawText.trim();
      if (!text) return;

      setErrorText(null);
      const lower = text.toLowerCase();

      // Prompt 3: Quiet & Narrate commands
      if (/^(?:quiet|silence|mute)(?:\s+mode)?[.!]?$/i.test(lower)) {
        setMuted(true);
        setTtsMuted(true);
        setIsSpeakingTts(false);
        setAnswerText('Quiet mode enabled. Working silently.');
        return;
      }
      if (/^(?:narrate|speak|voice\s+on|unmute)[.!]?$/i.test(lower)) {
        setMuted(false);
        setTtsMuted(false);
        const msg = 'Voice narration restored, sir.';
        setAnswerText(msg);
        speakJarvis(msg, () => setIsSpeakingTts(false));
        return;
      }

      // Prompt 2: Instant "stop" command
      if (/^(?:stop|abort|halt|cancel)[.!]?$/i.test(lower)) {
        handleEmergencyStop();
        return;
      }

      // Prompt 2: Confirm "go" when plan is waiting
      if (/^(?:go|proceed|yes|do it)[.!]?$/i.test(lower) && driverRef.current.phase === 'awaiting_go') {
        executeDriverPlan().catch((err) => {
          setErrorText(err instanceof Error ? err.message : 'Driver execution failed.');
          handleEmergencyStop();
        });
        return;
      }

      setIsThinking(true);
      stopSpeaking();

      const isTakeOver = /^(?:jarvis[,:]?\s*)?take\s+over\s+and\s+/i.test(text);
      const isPointerAsk =
        /^(?:where\s+do\s+i\s+click|show\s+me\s+where|point\s+at|point\s+to)\b/i.test(text);
      const isPointerAdjust =
        Boolean(pointerRef.current) &&
        /\b(?:further\s+(?:left|right|up|down)|a\s+(?:little|bit)\s+(?:left|right|higher|lower|up|down)|next\s+to|slightly\s+(?:left|right|higher|lower))\b/i.test(
          text,
        );
      const isRemember = /^(?:jarvis[,:]?\s*)?remember\s+that\b/i.test(text);

      try {
        if (isTakeOver) {
          const task = text.replace(/^(?:jarvis[,:]?\s*)?take\s+over\s+and\s+/i, '').trim();
          setPointer(null);
          setDriver({
            phase: 'planning',
            task,
            plan: null,
            currentStepIndex: 0,
            narration: 'Taking screenshot and preparing plan…',
            cursor: null,
          });

          const shot = await takeShot(true);
          const res = await fetch('/api/screen/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: shot, task }),
          });
          const plan = (await res.json()) as DriverPlanResponse & { error?: string };
          if (!res.ok) throw new Error(plan.error ?? 'Failed to build plan.');

          if (!plan.allowed) {
            const refusal = plan.refusalReason ?? 'Hard refusal: unsafe action blocked.';
            setDriver({
              phase: 'refused',
              task,
              plan,
              currentStepIndex: 0,
              narration: refusal,
              cursor: null,
            });
            setAnswerText(refusal);
            speakResponse(refusal);
          } else {
            const msg = `${plan.summary} Say "go" when you are ready.`;
            setDriver({
              phase: 'awaiting_go',
              task,
              plan,
              currentStepIndex: 0,
              narration: 'Review the 3–6 step plan and type "go" or click Go.',
              cursor: null,
            });
            setAnswerText(msg);
            speakResponse('Plan ready, sir. Say go when you are ready.');
          }
        } else if (isPointerAsk || isPointerAdjust) {
          const shot = await takeShot(true);
          const res = await fetch('/api/screen/point', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: shot,
              query: text,
              previousPoint: isPointerAdjust ? pointerRef.current : null,
            }),
          });
          const data = (await res.json()) as ScreenPointResult & { error?: string };
          if (!res.ok) throw new Error(data.error ?? 'Pointer inspection failed.');

          if (data.found) {
            setPointer({
              xPercent: data.xPercent,
              yPercent: data.yPercent,
              label: data.label,
            });
          } else {
            setPointer(null);
          }
          setAnswerText(data.reply);
          speakResponse(data.reply);
        } else if (isRemember) {
          const res = await fetch('/api/remember', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          const data = (await res.json()) as RememberResponse & { error?: string };
          if (!res.ok) throw new Error(data.error ?? 'Failed to remember note.');

          setGraph(data.graph);
          setAnswerText(data.answer);
          setSourceIds([data.node.id]);
          setHighlightedNodeIds([data.node.id]);
          setSelectedNodeId(data.node.id);
          issueFocus('node', [data.node.id], data.node.id);
          speakResponse(data.answer);
        } else {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              sessionId: sessionIdRef.current,
            }),
          });
          const data = (await res.json()) as ChatResponse & { error?: string };
          if (!res.ok) throw new Error(data.error ?? 'Brain query failed.');

          setAnswerText(data.answer);
          if (data.isNoteQuery && data.nodes.length > 0) {
            applyFlyToSource(data.nodes);
          } else {
            setSourceIds([]);
            setHighlightedNodeIds([]);
          }
          speakResponse(data.answer);
        }
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : 'Request failed.');
      } finally {
        setIsThinking(false);
      }
    },
    [
      applyFlyToSource,
      executeDriverPlan,
      handleEmergencyStop,
      issueFocus,
      speakResponse,
      takeShot,
    ],
  );

  // Chrome Web Speech Recognition (dictation)
  const dictationRef = useRef<ReturnType<typeof createDictationController> | null>(null);
  const submitRef = useRef(handleSubmitPrompt);
  submitRef.current = handleSubmitPrompt;

  if (!dictationRef.current) {
    dictationRef.current = createDictationController({
      onTranscript: (transcript) => {
        setIsDictating(false);
        submitRef.current(transcript);
      },
      onError: (msg) => {
        setErrorText(msg);
        setIsDictating(false);
      },
      onEnd: () => {
        setIsDictating(false);
      },
    });
  }

  const handleToggleDictation = useCallback(() => {
    if (!dictationRef.current?.supported) return;
    if (isDictating) {
      dictationRef.current.stop();
      setIsDictating(false);
    } else {
      setErrorText(null);
      setIsDictating(true);
      dictationRef.current.start();
    }
  }, [isDictating]);

  // Real-time Gemini Live Voice Conversation (gemini-3.8-live)
  const live = useGeminiLive({
    onFocusNodes: (nodeIds) => {
      applyFlyToSource(nodeIds);
    },
    onNodeBorn: (payload) => {
      setGraph(payload.graph);
      setSourceIds([payload.node.id]);
      setHighlightedNodeIds([payload.node.id]);
      setSelectedNodeId(payload.node.id);
      issueFocus('node', [payload.node.id], payload.node.id);
    },
    onTranscriptUpdate: (user, jarvis) => {
      setLiveTranscript({ user, jarvis });
      if (jarvis) setAnswerText(jarvis);
    },
  });

  const handleToggleLiveVoice = useCallback(() => {
    markAudioUnlocked();
    if (live.isActive) {
      live.disconnect();
      setLiveTranscript(null);
    } else {
      setErrorText(null);
      live.connect();
    }
  }, [live]);

  // Keyboard shortcuts: H toggles HUD dock, Escape closes inspector / pointer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setHighlightedNodeIds([]);
        setPointer(null);
      } else if (!inInput && (e.key === 'h' || e.key === 'H')) {
        setDockCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleToggleMute = () => {
    markAudioUnlocked();
    const next = !muted;
    setMuted(next);
    setTtsMuted(next);
    if (next) setIsSpeakingTts(false);
  };

  // Status line (static text + glyph, zero animate-pulse)
  const statusLabel = useMemo(() => {
    if (live.status === 'connecting') return '● Connecting Live Voice…';
    if (live.status === 'listening') return '● Live Voice listening…';
    if (live.status === 'speaking') return '● Live Voice speaking…';
    if (isDictating) return '● listening…';
    if (isThinking) return '● thinking…';
    if (isSpeakingTts) return '● speaking…';
    return null;
  }, [live.status, isDictating, isThinking, isSpeakingTts]);

  const combinedError = errorText ?? live.errorMsg;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#050811] text-slate-100">
      {/* Full-bleed Three.js Knowledge Galaxy */}
      <KnowledgeGalaxy3D
        nodes={graph.nodes}
        links={graph.links}
        selectedNodeId={selectedNodeId}
        highlightedNodeIds={highlightedNodeIds}
        neighborNodeIds={activeNeighborIds}
        activeGroupFilter={activeGroupFilter}
        focusRequest={focusRequest}
        isLiveSpeaking={live.status === 'speaking' || isSpeakingTts}
        onSelectNode={handleSelectNode}
        onHoverNode={setHoverInfo}
        onRegisterCapture={(fn) => {
          webglCaptureRef.current = fn;
        }}
      />

      {/* Minimal Top-Left Header Bar */}
      <header
        data-screen-panel="header"
        className="fixed top-4 left-5 z-20 flex items-center gap-4 px-4 py-2 rounded-xl bg-[#0a0f1d]/92 border border-white/10"
      >
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
            JARVIS
          </h1>
          <span className="text-xs font-mono-tabular text-slate-400 whitespace-nowrap">
            {graph.nodes.length} notes · {graph.links.length} links
          </span>
        </div>

        {/* Interactive Group Filters */}
        <nav className="hidden lg:flex items-center gap-1 border-l border-white/10 pl-4">
          <button
            type="button"
            onClick={() => setActiveGroupFilter(null)}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              activeGroupFilter === null
                ? 'bg-white/12 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All
          </button>
          {groups.map((grp) => {
            const style = getGroupStyle(grp);
            const isActive = activeGroupFilter === grp;
            return (
              <button
                key={grp}
                type="button"
                onClick={() => setActiveGroupFilter(isActive ? null : grp)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white/12 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: style.hex }}
                />
                <span>{style.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 border-l border-white/10 pl-3">
          <button
            type="button"
            onClick={() => setNotePadOpen(true)}
            title="New Note"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">New Note</span>
          </button>
          <button
            type="button"
            onClick={handleResetOverview}
            title="Reset camera overview"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Compass className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleToggleMute}
            title={muted ? 'Unmute voice output (Narrate)' : 'Mute voice output (Quiet)'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Projected 3D Hover Tooltip */}
      {hoverInfo && (
        <div
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-full pb-2.5"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          <div className="px-2.5 py-1.5 rounded-lg bg-[#0a0f1d]/95 border border-white/15 shadow-lg whitespace-nowrap">
            <p className="text-xs font-medium text-white">{hoverInfo.node.label}</p>
            <p className="text-[11px] text-slate-400">
              {getGroupStyle(hoverInfo.node.group).label} · Node {hoverInfo.node.id}
            </p>
          </div>
        </div>
      )}

      {/* Side Inspector (appears only when a node is selected or focused) */}
      {selectedNode && (
        <NoteInspector
          node={selectedNode}
          neighbors={selectedNodeNeighbors}
          onClose={() => {
            setSelectedNodeId(null);
            setHighlightedNodeIds([]);
          }}
          onSelectNeighbor={handleSelectNode}
          onAskAboutNode={(label) => handleSubmitPrompt(`Summarize ${label}`)}
        />
      )}

      {/* Universal Screen Pack Overlay (The Pointer + Careful Driver + Note Pad) */}
      <ScreenGuideOverlay
        pointer={pointer}
        onDismissPointer={() => setPointer(null)}
        driver={driver}
        onConfirmGo={() => {
          executeDriverPlan().catch((err) => {
            setErrorText(err instanceof Error ? err.message : 'Driver execution failed.');
            handleEmergencyStop();
          });
        }}
        onEmergencyStop={handleEmergencyStop}
        onDismissDriver={() => setDriver(IDLE_DRIVER)}
        notePadOpen={notePadOpen}
        noteTitle={noteTitle}
        noteBody={noteBody}
        onChangeNoteTitle={setNoteTitle}
        onChangeNoteBody={setNoteBody}
        onSaveNotePad={() => {
          saveNoteFromComposer()
            .then((saved) => {
              if (saved) {
                setAnswerText(saved.answer);
                speakResponse(saved.answer);
              }
            })
            .catch((err) => {
              setErrorText(err instanceof Error ? err.message : 'Failed to save note.');
            });
        }}
        onCloseNotePad={() => setNotePadOpen(false)}
      />

      {/* Collapsible Bottom Control Dock */}
      <ControlDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((v) => !v)}
        statusLabel={statusLabel}
        answerText={answerText}
        sourceNodes={sourceNodes}
        exampleQuestions={combinedExamples}
        isThinking={isThinking}
        isDictating={isDictating}
        dictationSupported={Boolean(dictationRef.current?.supported)}
        liveStatus={live.status}
        liveTranscript={liveTranscript}
        isSharingScreen={isSharingScreen}
        quietMode={muted}
        errorText={combinedError}
        onSubmitPrompt={handleSubmitPrompt}
        onToggleDictation={handleToggleDictation}
        onToggleLiveVoice={handleToggleLiveVoice}
        onToggleShareScreen={handleToggleShareScreen}
        onFocusSingleNode={handleSelectNode}
      />
    </main>
  );
}
