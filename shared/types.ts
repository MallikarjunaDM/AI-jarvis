export interface NoteNode {
  id: number;
  label: string;
  group: string;
  excerpt: string;
  content: string;
  path: string;
  wordCount: number;
  wikilinks: string[];
  isNewborn?: boolean;
}

export interface NoteLink {
  source: number;
  target: number;
  reason: 'wikilink' | 'mention' | 'semantic';
}

export interface KnowledgeGraph {
  nodes: NoteNode[];
  links: NoteLink[];
  exampleQuestions: string[];
}

export interface ChatResponse {
  answer: string;
  nodes: number[];
  isNoteQuery: boolean;
}

export interface RememberResponse {
  answer: string;
  node: NoteNode;
  relatedNodeId: number | null;
  links: NoteLink[];
  graph: KnowledgeGraph;
}

export interface ScreenPointResult {
  found: boolean;
  xPercent: number;
  yPercent: number;
  label: string;
  reply: string;
}

export interface DriverPlanResponse {
  allowed: boolean;
  refusalReason?: string;
  summary: string;
  steps: string[];
}

export type DriverActionType =
  | 'click'
  | 'type'
  | 'open_notepad'
  | 'fill_notepad'
  | 'save_notepad'
  | 'finish';

export interface DriverStepResponse {
  done: boolean;
  narration: string;
  action: {
    type: DriverActionType;
    xPercent?: number;
    yPercent?: number;
    text?: string;
    noteTitle?: string;
    noteBody?: string;
  };
}

