import fs from 'fs';
import path from 'path';
import { Type } from '@google/genai';
import type { DriverPlanResponse, DriverStepResponse, ScreenPointResult } from '../shared/types.ts';
import { getGeminiClient } from './geminiBrain.ts';

const SCREEN_GUIDE_DIR = path.resolve(process.cwd(), 'screen-guide');
const LATEST_SCREENSHOT_PATH = path.join(SCREEN_GUIDE_DIR, 'latest.png');

export function saveLatestScreenshot(base64Png: string): void {
  try {
    fs.mkdirSync(SCREEN_GUIDE_DIR, { recursive: true });
    const cleaned = base64Png.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(LATEST_SCREENSHOT_PATH, Buffer.from(cleaned, 'base64'));
  } catch (err) {
    console.warn('[JARVIS ScreenGuide] Failed to persist latest.png:', err);
  }
}

export function getLatestScreenshotPath(): string {
  return LATEST_SCREENSHOT_PATH;
}

const HARD_REFUSAL_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  {
    regex: /\b(pay|payment|credit card|debit card|card number|cvv|bank account|routing number|wire transfer|checkout|buy now|purchase)\b/i,
    reason: 'Hard refusal: I never handle payments, card details, or banking information.',
  },
  {
    regex: /\b(password|passcode|pin code|secret key|private key|seed phrase|login credentials|enter.*password)\b/i,
    reason: 'Hard refusal: I never enter, read, or handle passwords or credentials.',
  },
  {
    regex: /\b(delete|remove file|erase|rm -rf|wipe|trash|destroy file|format drive)\b/i,
    reason: 'Hard refusal: I never delete files or erase data.',
  },
  {
    regex: /\b(send (?:an? )?(?:email|message|text|dm|tweet|slack)|reply to (?:this )?email|post (?:this|a) comment)\b/i,
    reason: 'Hard refusal: I cannot send any email or message without showing you the exact text and getting your approval first.',
  },
];

function checkHardRefusal(task: string): string | null {
  for (const rule of HARD_REFUSAL_PATTERNS) {
    if (rule.regex.test(task)) {
      return rule.reason;
    }
  }
  return null;
}

export async function pointOnScreen(
  imageBase64: string,
  query: string,
  previousPoint?: { xPercent: number; yPercent: number; label: string } | null,
): Promise<ScreenPointResult> {
  const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  saveLatestScreenshot(cleaned);

  const ai = getGeminiClient();

  const adjustmentContext = previousPoint
    ? `\nThe user is adjusting a previous pointer that was at (${previousPoint.xPercent.toFixed(1)}%, ${previousPoint.yPercent.toFixed(1)}%) labeled "${previousPoint.label}". Adjust relative to that spot based on their instruction.`
    : '';

  const prompt = `You are "The Pointer" (JARVIS Screen Guide). Look carefully at this full-screen screenshot.
Notice the optional faint percentage grid (0% to 100% horizontally from left=0 to right=100, and vertically from top=0 to bottom=100) if present.
Find the EXACT UI control, button, icon, input field, or menu item the user is asking for: "${query}".${adjustmentContext}

Rules:
- Return xPercent (0-100) and yPercent (0-100) at the EXACT center of that control so an arrow tip lands squarely on it.
- Return a short 2-4 word label for the dark pill near the arrow tail.
- Return a crisp 1-line polite assistant reply (for example: "Right there." or "Right there, sir.").
- If the requested control is genuinely not visible anywhere on the screenshot, set found: false and explain briefly in reply.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/png', data: cleaned } },
        { text: prompt },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          found: { type: Type.BOOLEAN },
          xPercent: { type: Type.NUMBER },
          yPercent: { type: Type.NUMBER },
          label: { type: Type.STRING },
          reply: { type: Type.STRING },
        },
        required: ['found', 'xPercent', 'yPercent', 'label', 'reply'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ScreenPointResult>;
  return {
    found: Boolean(parsed.found),
    xPercent: Math.max(2, Math.min(98, Number(parsed.xPercent ?? 50))),
    yPercent: Math.max(2, Math.min(98, Number(parsed.yPercent ?? 50))),
    label: (parsed.label ?? 'Target control').trim().slice(0, 36),
    reply: (parsed.reply ?? 'Right there.').trim(),
  };
}

export async function planDriverTask(
  imageBase64: string,
  task: string,
): Promise<DriverPlanResponse> {
  const deterministicRefusal = checkHardRefusal(task);
  if (deterministicRefusal) {
    return {
      allowed: false,
      refusalReason: deterministicRefusal,
      summary: deterministicRefusal,
      steps: [],
    };
  }

  const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  saveLatestScreenshot(cleaned);

  const ai = getGeminiClient();

  const prompt = `You are "The Careful Driver" (JARVIS Screen Hands).
Look at this screenshot of the application. The user asked: "take over and ${task}".

Hard refusals (NO exceptions — set allowed: false if the task involves ANY of these):
- Payments, credit/debit cards, or bank details
- Passwords or private credentials
- Deleting files
- Sending any email/message without showing the user the exact text first

Available capabilities in this workspace:
- Clicking any visible button, filter tab, or control on screen
- Typing into the visible input bar
- Opening the built-in Note Pad editor ("New Note" button in the top bar) to create, title, edit, and save a new markdown note (great for tasks like "open a new note titled Hello from my AI" or "Monday plan")

Return a short, clear plan of 3 to 6 steps that you will execute one step at a time after the user says "go".`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/png', data: cleaned } },
        { text: prompt },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          allowed: { type: Type.BOOLEAN },
          refusalReason: { type: Type.STRING },
          summary: { type: Type.STRING },
          steps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['allowed', 'summary', 'steps'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<DriverPlanResponse>;
  if (!parsed.allowed) {
    const reason =
      parsed.refusalReason ||
      parsed.summary ||
      'Hard refusal: this task crosses a safety boundary.';
    return {
      allowed: false,
      refusalReason: reason,
      summary: reason,
      steps: [],
    };
  }

  return {
    allowed: true,
    summary: parsed.summary ?? `Ready to ${task}.`,
    steps: Array.isArray(parsed.steps) && parsed.steps.length > 0
      ? parsed.steps.slice(0, 6)
      : ['Inspect the screen', 'Locate the target control', 'Complete the action'],
  };
}

export async function nextDriverStep(
  imageBase64: string,
  task: string,
  planSteps: string[],
  stepIndex: number,
  completedHistory: string[],
): Promise<DriverStepResponse> {
  const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  saveLatestScreenshot(cleaned);

  const ai = getGeminiClient();

  const prompt = `You are "The Careful Driver" executing ONE step at a time.
Task: "${task}"
Approved plan:
${planSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Completed actions so far:
${completedHistory.length > 0 ? completedHistory.join('\n') : '(None yet)'}

Look at the current screenshot and decide the SINGLE NEXT action for step ${stepIndex + 1} (or finish if the task is already complete).
Action types you can emit:
- "open_notepad": opens the built-in Note Pad editor (give xPercent, yPercent of the "New Note" button if visible).
- "fill_notepad": fills the Note Pad title and body when the Note Pad modal is open on screen (set noteTitle and noteBody, plus xPercent/yPercent near the title/body area).
- "save_notepad": clicks "Save Note" inside the open Note Pad modal to persist it to captures/ (set xPercent, yPercent on the Save button).
- "click": clicks any visible button/tab/control at (xPercent, yPercent).
- "type": types "text" into the visible input bar at (xPercent, yPercent) and submits.
- "finish": when the task is visibly complete on screen (set done: true).

Rules:
- Execute ONLY ONE step.
- Keep narration to ONE crisp, polite sentence (e.g., "Opening the note editor.", "Entering the note title.", "Done, your note is saved.").`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/png', data: cleaned } },
        { text: prompt },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          done: { type: Type.BOOLEAN },
          narration: { type: Type.STRING },
          actionType: {
            type: Type.STRING,
            description: 'One of: click, type, open_notepad, fill_notepad, save_notepad, finish',
          },
          xPercent: { type: Type.NUMBER },
          yPercent: { type: Type.NUMBER },
          text: { type: Type.STRING },
          noteTitle: { type: Type.STRING },
          noteBody: { type: Type.STRING },
        },
        required: ['done', 'narration', 'actionType'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    done?: boolean;
    narration?: string;
    actionType?: DriverStepResponse['action']['type'];
    xPercent?: number;
    yPercent?: number;
    text?: string;
    noteTitle?: string;
    noteBody?: string;
  };

  const validTypes = new Set([
    'click',
    'type',
    'open_notepad',
    'fill_notepad',
    'save_notepad',
    'finish',
  ]);
  const actionType = validTypes.has(parsed.actionType ?? '')
    ? (parsed.actionType as DriverStepResponse['action']['type'])
    : 'finish';

  return {
    done: Boolean(parsed.done || actionType === 'finish'),
    narration: (parsed.narration ?? 'Step complete.').trim(),
    action: {
      type: actionType,
      xPercent:
        typeof parsed.xPercent === 'number'
          ? Math.max(1, Math.min(99, parsed.xPercent))
          : undefined,
      yPercent:
        typeof parsed.yPercent === 'number'
          ? Math.max(1, Math.min(99, parsed.yPercent))
          : undefined,
      text: parsed.text,
      noteTitle: parsed.noteTitle,
      noteBody: parsed.noteBody,
    },
  };
}
