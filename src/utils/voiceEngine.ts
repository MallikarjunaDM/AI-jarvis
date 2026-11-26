// Web Speech API (TTS + Dictation) & Gemini Live PCM Audio Engine

let audioUnlocked = false;
let pendingGreeting: string | null = null;
let ttsMuted = false;

export function isTtsMuted(): boolean {
  return ttsMuted;
}

export function setTtsMuted(muted: boolean): void {
  ttsMuted = muted;
  if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function selectBritishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const preferredNames = [
    'Daniel',
    'Arthur',
    'Oliver',
    'Google UK English Male',
    'Microsoft George',
    'Microsoft Ryan',
    'British',
  ];

  const gbVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en-gb'));
  for (const name of preferredNames) {
    const match = gbVoices.find((v) => v.name.toLowerCase().includes(name.toLowerCase()));
    if (match) return match;
  }
  if (gbVoices.length > 0) return gbVoices[0];

  const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  return enVoices[0] ?? voices[0];
}

export function speakJarvis(text: string, onEnd?: () => void): void {
  if (ttsMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const chosen = selectBritishVoice(voices);
  if (chosen) {
    utterance.voice = chosen;
    utterance.lang = chosen.lang;
  } else {
    utterance.lang = 'en-GB';
  }
  utterance.rate = 1.02;
  utterance.pitch = 0.94;

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function scheduleBootGreeting(greeting: string, onSpoken?: () => void): () => void {
  pendingGreeting = greeting;

  const trySpeak = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    if (pendingGreeting && !ttsMuted) {
      const text = pendingGreeting;
      pendingGreeting = null;
      speakJarvis(text, onSpoken);
    }
    cleanup();
  };

  const cleanup = () => {
    window.removeEventListener('pointerdown', trySpeak);
    window.removeEventListener('keydown', trySpeak);
  };

  // Pre-warm voices list in Chrome
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }

  window.addEventListener('pointerdown', trySpeak, { once: true });
  window.addEventListener('keydown', trySpeak, { once: true });

  return cleanup;
}

export function markAudioUnlocked(): void {
  audioUnlocked = true;
  pendingGreeting = null;
}

export interface SpeechRecognitionController {
  supported: boolean;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function createDictationController(callbacks: {
  onTranscript: (text: string) => void;
  onError: (msg: string) => void;
  onEnd: () => void;
}): SpeechRecognitionController {
  if (typeof window === 'undefined') {
    return { supported: false, start: () => {}, stop: () => {} };
  }

  const win = window as unknown as {
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    SpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  const Ctor = win.webkitSpeechRecognition ?? win.SpeechRecognition;

  if (!Ctor) {
    return { supported: false, start: () => {}, stop: () => {} };
  }

  let recognition: SpeechRecognitionInstance | null = null;

  return {
    supported: true,
    start: () => {
      markAudioUnlocked();
      stopSpeaking();
      recognition = new Ctor();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? '';
        if (transcript) {
          callbacks.onTranscript(transcript);
        }
      };

      recognition.onerror = (event) => {
        const code = event.error;
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          callbacks.onError('Microphone permission blocked. Allow Microphone in your browser address bar.');
        } else if (code !== 'no-speech' && code !== 'aborted') {
          callbacks.onError(`Voice recognition error: ${code}`);
        }
      };

      recognition.onend = () => {
        callbacks.onEnd();
      };

      recognition.start();
    },
    stop: () => {
      try {
        recognition?.stop();
      } catch {
        // Ignore stop errors
      }
    },
  };
}

// --- Gemini Live API (16kHz PCM input / 24kHz PCM output) ---

export function pcmFloat32ToBase64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64PcmToAudioBuffer(base64: string, audioCtx: AudioContext): AudioBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }

  const audioBuffer = audioCtx.createBuffer(1, sampleCount, 24000);
  audioBuffer.copyToChannel(float32, 0);
  return audioBuffer;
}
