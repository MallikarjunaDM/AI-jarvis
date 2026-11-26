import { GoogleGenAI, Type } from '@google/genai';
import type { ChatResponse } from '../shared/types.ts';
import { getGraph, scoreNotes } from './notesIndex.ts';

let sharedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  if (!sharedClient) {
    sharedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return sharedClient;
}

interface HistoryTurn {
  role: 'user' | 'model';
  text: string;
}

const sessionHistories = new Map<string, HistoryTurn[]>();
const MAX_HISTORY_TURNS = 10;

const JARVIS_SYSTEM_PROMPT = `You are JARVIS, the user's personal AI second brain and chief of staff.
Persona rules:
- You are a dry, impeccably polite British butler with razor wit.
- Address the user as "sir" occasionally (never every sentence — once every couple of turns or when landing a dry quip is plenty). One genuinely funny line beats three bland ones.
- When the user asks a question about their notes: answer ONLY from the provided candidate notes in ONE witty sentence plus the crisp facts (2–3 sentences maximum total). Never recite the note back verbatim because the note is already displayed on screen. If the provided notes do not cover the question, admit it gracefully in character and set isNoteQuery to false with usedNodeIds as [].
- When the user makes small talk, greets you, or asks for a joke: respond warmly with dry butler wit, set isNoteQuery to false, and return usedNodeIds as [] so the 3D camera stays still.
- Only include numeric IDs in usedNodeIds for notes that genuinely supplied facts for your answer (subset of the candidate note IDs provided).`;

export async function handleChat(sessionId: string, userMessage: string): Promise<ChatResponse> {
  const ai = getGeminiClient();
  const graph = getGraph();
  const candidates = scoreNotes(userMessage, graph, 6);

  const history = sessionHistories.get(sessionId) ?? [];

  const candidateBlock =
    candidates.length > 0
      ? candidates
          .map(
            ({ node, score }) =>
              `[NODE ID ${node.id}] Title: "${node.label}" | Group: ${node.group} | Relevance: ${score.toFixed(1)}\n${node.content}`,
          )
          .join('\n\n---\n\n')
      : 'No matching notes found by keyword overlap.';

  const historyText =
    history.length > 0
      ? history.map((h) => `${h.role === 'user' ? 'User' : 'JARVIS'}: ${h.text}`).join('\n')
      : '(Start of session)';

  const prompt = `Recent conversation:
${historyText}

Top candidate notes from the user's knowledge base (${graph.nodes.length} total notes indexed):
${candidateBlock}

User's latest message:
"${userMessage}"`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction: JARVIS_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: {
            type: Type.STRING,
            description: 'JARVIS response in 1-3 concise, witty British butler sentences.',
          },
          isNoteQuery: {
            type: Type.BOOLEAN,
            description: 'True only if the user asked about their notes AND the candidate notes answered it.',
          },
          usedNodeIds: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: 'Numeric IDs of the candidate notes used to answer. Empty array for small talk or unanswerable queries.',
          },
        },
        required: ['answer', 'isNoteQuery', 'usedNodeIds'],
      },
    },
  });

  const rawJson = (response.text ?? '{}').trim();
  let parsed: { answer?: string; isNoteQuery?: boolean; usedNodeIds?: number[] } = {};
  try {
    parsed = JSON.parse(rawJson) as typeof parsed;
  } catch {
    parsed = { answer: rawJson || 'I seem to have misplaced my spectacles, sir. Could you rephrase that?', isNoteQuery: false, usedNodeIds: [] };
  }

  const validCandidateIds = new Set(candidates.map((c) => c.node.id));
  const cleanedNodeIds =
    parsed.isNoteQuery && Array.isArray(parsed.usedNodeIds)
      ? Array.from(
          new Set(
            parsed.usedNodeIds.filter(
              (id) => Number.isInteger(id) && id >= 0 && id < graph.nodes.length && validCandidateIds.has(id),
            ),
          ),
        )
      : [];

  const answerText =
    typeof parsed.answer === 'string' && parsed.answer.trim().length > 0
      ? parsed.answer.trim()
      : 'At your service, sir, though the archives appear silent on that particular point.';

  const updatedHistory: HistoryTurn[] = [
    ...history,
    { role: 'user' as const, text: userMessage },
    { role: 'model' as const, text: answerText },
  ].slice(-MAX_HISTORY_TURNS);
  sessionHistories.set(sessionId, updatedHistory);

  return {
    answer: answerText,
    nodes: cleanedNodeIds,
    isNoteQuery: Boolean(parsed.isNoteQuery && cleanedNodeIds.length > 0),
  };
}

export async function generateRememberConfirmation(noteTitle: string, noteContent: string): Promise<string> {
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `A new note titled "${noteTitle}" was just filed into captures/ with content: "${noteContent}". Confirm this in ONE dry, witty British butler sentence (under 22 words).`,
      config: {
        systemInstruction:
          'You are JARVIS, a dry, impeccably polite British butler with razor wit. Address the user as "sir" if natural, and keep it to one crisp, memorable sentence.',
      },
    });
    return (response.text ?? '').trim() || `Filed under "${noteTitle}", sir—one more star in your constellation.`;
  } catch {
    return `Duly noted and filed under "${noteTitle}", sir.`;
  }
}
