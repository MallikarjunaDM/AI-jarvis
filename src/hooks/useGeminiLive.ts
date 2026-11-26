import { useCallback, useEffect, useRef, useState } from 'react';
import type { KnowledgeGraph, NoteLink, NoteNode } from '../../shared/types';
import { base64PcmToAudioBuffer, pcmFloat32ToBase64, stopSpeaking } from '../utils/voiceEngine';

export type LiveStatus = 'disconnected' | 'connecting' | 'listening' | 'speaking' | 'error';

interface UseGeminiLiveOptions {
  onFocusNodes: (nodeIds: number[]) => void;
  onNodeBorn: (payload: {
    node: NoteNode;
    relatedNodeId: number | null;
    links: NoteLink[];
    graph: KnowledgeGraph;
  }) => void;
  onTranscriptUpdate: (userText: string, jarvisText: string) => void;
}

export function useGeminiLive(options: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<LiveStatus>('disconnected');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const userTranscriptRef = useRef<string>('');
  const jarvisTranscriptRef = useRef<string>('');

  const clearAudioQueue = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearAudioQueue();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }

    setStatus('disconnected');
  }, [clearAudioQueue]);

  const connect = useCallback(async () => {
    if (wsRef.current) {
      disconnect();
      return;
    }

    stopSpeaking();
    setErrorMsg(null);
    setStatus('connecting');
    userTranscriptRef.current = '';
    jarvisTranscriptRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const pcm = event.inputBuffer.getChannelData(0);
          const base64 = pcmFloat32ToBase64(pcm);
          ws.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          type: string;
          data?: string;
          text?: string;
          nodes?: number[];
          node?: NoteNode;
          relatedNodeId?: number | null;
          links?: NoteLink[];
          graph?: KnowledgeGraph;
          message?: string;
        };

        switch (msg.type) {
          case 'ready':
            setStatus('listening');
            break;

          case 'audio':
            if (msg.data && outputCtxRef.current) {
              setStatus('speaking');
              const ctx = outputCtxRef.current;
              const audioBuffer = base64PcmToAudioBuffer(msg.data, ctx);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);

              const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
              source.start(startAt);
              nextStartTimeRef.current = startAt + audioBuffer.duration;
              activeSourcesRef.current.add(source);

              source.onended = () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0 && wsRef.current) {
                  setStatus('listening');
                }
              };
            }
            break;

          case 'interrupted':
            clearAudioQueue();
            jarvisTranscriptRef.current = '';
            setStatus('listening');
            break;

          case 'inputTranscript':
            if (msg.text) {
              userTranscriptRef.current = (userTranscriptRef.current + ' ' + msg.text).trim();
              optionsRef.current.onTranscriptUpdate(
                userTranscriptRef.current,
                jarvisTranscriptRef.current,
              );
            }
            break;

          case 'outputTranscript':
            if (msg.text) {
              jarvisTranscriptRef.current = (jarvisTranscriptRef.current + ' ' + msg.text).trim();
              optionsRef.current.onTranscriptUpdate(
                userTranscriptRef.current,
                jarvisTranscriptRef.current,
              );
            }
            break;

          case 'turnComplete':
            userTranscriptRef.current = '';
            jarvisTranscriptRef.current = '';
            break;

          case 'focusNodes':
            if (Array.isArray(msg.nodes) && msg.nodes.length > 0) {
              optionsRef.current.onFocusNodes(msg.nodes);
            }
            break;

          case 'nodeBorn':
            if (msg.node && msg.graph) {
              optionsRef.current.onNodeBorn({
                node: msg.node,
                relatedNodeId: msg.relatedNodeId ?? null,
                links: msg.links ?? [],
                graph: msg.graph,
              });
            }
            break;

          case 'error':
            setErrorMsg(msg.message ?? 'Live conversation error.');
            setStatus('error');
            disconnect();
            break;

          case 'closed':
            disconnect();
            break;
        }
      };

      ws.onerror = () => {
        setErrorMsg('WebSocket connection to Live Voice failed.');
        setStatus('error');
        disconnect();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          disconnect();
        }
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Microphone access is required for live voice conversation.';
      setErrorMsg(message);
      setStatus('error');
      disconnect();
    }
  }, [clearAudioQueue, disconnect]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    errorMsg,
    isActive: status === 'connecting' || status === 'listening' || status === 'speaking',
    connect,
    disconnect,
  };
}
