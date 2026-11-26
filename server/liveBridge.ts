import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  type FunctionDeclaration,
  type LiveServerMessage,
  Modality,
  Type,
} from '@google/genai';
import { getGeminiClient } from './geminiBrain.ts';
import { createRememberNote, getGraph, scoreNotes } from './notesIndex.ts';

const searchNotesDecl: FunctionDeclaration = {
  name: 'search_notes',
  description:
    "Searches the user's markdown knowledge base for notes matching a question or topic. Always call this whenever the user asks about their business, notes, budgets, clients, equipment, or team.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Keywords or question to search in the user notes.',
      },
    },
    required: ['query'],
  },
};

const rememberNoteDecl: FunctionDeclaration = {
  name: 'remember_note',
  description:
    'Saves a new thought or fact into the captures/ folder when the user says "remember that..." or asks you to remember/save a note.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      thought: {
        type: Type.STRING,
        description: 'The fact or note content to remember.',
      },
    },
    required: ['thought'],
  },
};

export function attachLiveWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (reqUrl.pathname === '/api/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    let session: Awaited<ReturnType<ReturnType<typeof getGeminiClient>['live']['connect']>> | null = null;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    try {
      const ai = getGeminiClient();
      const graph = getGraph();
      const catalogSummary = graph.nodes
        .map((n) => `[${n.id}] ${n.label} (${n.group})`)
        .join(', ');

      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Charon',
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [searchNotesDecl, rememberNoteDecl] }],
          systemInstruction: `You are JARVIS, the user's dry, impeccably polite British butler and AI second brain.
Rules:
- Address the user as "sir" occasionally (never every sentence). One genuinely witty line beats three bland ones.
- Keep spoken answers crisp and brief (1–3 sentences). Never read a full note aloud — the user can see the note on screen.
- When the user asks about their business, notes, numbers, equipment, or team, call search_notes first and answer ONLY from the returned note contents.
- When the user says "remember that..." or asks to save a note, call remember_note and confirm with one witty line.
- For small talk or jokes, reply directly with dry wit without calling search_notes.

Indexed knowledge base (${graph.nodes.length} notes): ${catalogSummary}`,
        },
        callbacks: {
          onopen: () => {
            safeSend({ type: 'ready' });
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              safeSend({ type: 'inputTranscript', text: content.inputTranscription.text });
            }
            if (content?.outputTranscription?.text) {
              safeSend({ type: 'outputTranscript', text: content.outputTranscription.text });
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                safeSend({ type: 'audio', data: part.inlineData.data });
              }
            }
            if (content?.interrupted) {
              safeSend({ type: 'interrupted' });
            }
            if (content?.turnComplete) {
              safeSend({ type: 'turnComplete' });
            }

            for (const call of message.toolCall?.functionCalls ?? []) {
              if (call.name === 'search_notes') {
                const query = String((call.args as { query?: string } | undefined)?.query ?? '');
                const matches = scoreNotes(query, getGraph(), 6);
                const nodeIds = matches.map((m) => m.node.id);

                if (nodeIds.length > 0) {
                  safeSend({ type: 'focusNodes', nodes: nodeIds });
                }

                const resultText =
                  matches.length > 0
                    ? matches
                        .map((m) => `Node ${m.node.id} (${m.node.label}): ${m.node.content}`)
                        .join('\n\n')
                    : 'No matching notes were found in the knowledge base.';

                session?.sendToolResponse({
                  functionResponses: [
                    {
                      id: call.id ?? call.name,
                      name: call.name,
                      response: { notes: resultText, nodeIds },
                    },
                  ],
                });
              } else if (call.name === 'remember_note') {
                const thought = String((call.args as { thought?: string } | undefined)?.thought ?? '');
                const created = createRememberNote(thought);
                safeSend({
                  type: 'nodeBorn',
                  node: created.node,
                  relatedNodeId: created.relatedNodeId,
                  links: created.links,
                  graph: created.graph,
                });

                session?.sendToolResponse({
                  functionResponses: [
                    {
                      id: call.id ?? call.name,
                      name: call.name,
                      response: {
                        saved: true,
                        title: created.node.label,
                        path: created.node.path,
                        nodeId: created.node.id,
                      },
                    },
                  ],
                });
              }
            }
          },
          onerror: (err) => {
            safeSend({
              type: 'error',
              message: err instanceof Error ? err.message : 'Live API session error.',
            });
          },
          onclose: () => {
            safeSend({ type: 'closed' });
          },
        },
      });
    } catch (err) {
      safeSend({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to initialize Gemini Live session.',
      });
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session) return;
      try {
        const parsed = JSON.parse(raw.toString()) as { audio?: string; text?: string };
        if (parsed.audio) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text) {
          session.sendRealtimeInput({ text: parsed.text });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch {
        // Ignore close errors
      }
      session = null;
    });
  });
}
