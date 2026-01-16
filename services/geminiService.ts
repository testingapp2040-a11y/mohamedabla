import { GoogleGenAI, LiveSession, LiveServerMessage, Modality } from "@google/genai";
import { Blob } from '../types';
import { MOHAMED_ABLA_DOCUMENT, NOUR_SYSTEM_INSTRUCTION_PREFIX } from "../constants";
import { MutableRefObject } from 'react';

// Helper functions for audio encoding/decoding
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Gemini Live API Service
export interface LiveSessionCallbacks {
  onTranscriptionUpdate: (type: 'user' | 'bot', text: string) => void;
  onTurnComplete: (userText: string, botText: string) => void;
  onStatusChange: (status: string) => void;
  onError: (error: Error) => void;
}

export const connectLiveSession = async (
  sessionPromiseRef: MutableRefObject<Promise<LiveSession> | null>,
  inputAudioContextRef: MutableRefObject<AudioContext | null>,
  outputAudioContextRef: MutableRefObject<AudioContext | null>,
  inputNodeRef: MutableRefObject<AudioNode | null>,
  outputNodeRef: MutableRefObject<AudioNode | null>,
  nextStartTimeRef: MutableRefObject<number>,
  sourcesRef: MutableRefObject<Set<AudioBufferSourceNode>>,
  mediaStreamRef: MutableRefObject<MediaStream | null>,
  callbacks: LiveSessionCallbacks,
) => {
  try {
    callbacks.onStatusChange("Initializing Gemini Live API...");
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

    inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
    outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
    outputNodeRef.current = outputAudioContextRef.current.createGain();
    outputNodeRef.current.connect(outputAudioContextRef.current.destination);

    let currentInputTranscription = '';
    let currentOutputTranscription = '';

    const systemInstruction = `${NOUR_SYSTEM_INSTRUCTION_PREFIX}\n\n${MOHAMED_ABLA_DOCUMENT}`;

    sessionPromiseRef.current = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: async () => {
          callbacks.onStatusChange("Session connected. Requesting microphone access...");
          console.debug('Live session opened');

          // Request microphone access
          try {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current);
            
            // Create a DynamicsCompressorNode for more aggressive noise reduction
            const compressor = inputAudioContextRef.current!.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-60, inputAudioContextRef.current!.currentTime); // Lower threshold to catch quieter noise
            compressor.knee.setValueAtTime(20, inputAudioContextRef.current!.currentTime); // Sharper compression curve
            compressor.ratio.setValueAtTime(15, inputAudioContextRef.current!.currentTime); // More aggressive compression ratio
            compressor.attack.setValueAtTime(0.003, inputAudioContextRef.current!.currentTime); // Very fast attack
            compressor.release.setValueAtTime(0.3, inputAudioContextRef.current!.currentTime); // Moderate release to avoid choppiness

            inputNodeRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);

            (inputNodeRef.current as ScriptProcessorNode).onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current!.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            // Connect the audio stream: Source -> Compressor -> ScriptProcessor -> Destination
            source.connect(compressor);
            compressor.connect(inputNodeRef.current);
            inputNodeRef.current.connect(inputAudioContextRef.current.destination);
            // Now that microphone is active, update the status
            callbacks.onStatusChange("Session connected. Microphone active. Awaiting your query.");

          } catch (micError) {
            console.error('Microphone access error:', micError);
            callbacks.onError(new Error("Couldn't access your microphone. Please enable it in your browser settings."));
            callbacks.onStatusChange("Microphone access denied. Please enable and try again.");
          }
        },
        onmessage: async (message: LiveServerMessage) => {
          // console.debug('Live message received:', message);

          // Handle bot audio output
          const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64EncodedAudioString && outputAudioContextRef.current && outputNodeRef.current) {
            nextStartTimeRef.current = Math.max(
              nextStartTimeRef.current,
              outputAudioContextRef.current.currentTime,
            );
            try {
              const audioBuffer = await decodeAudioData(
                decode(base64EncodedAudioString),
                outputAudioContextRef.current,
                24000,
                1,
              );
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
              sourcesRef.current.add(source);
            } catch (audioDecodeError) {
              console.error("Error decoding audio data:", audioDecodeError);
            }
          }

          // Handle interruption
          const interrupted = message.serverContent?.interrupted;
          if (interrupted) {
            for (const source of sourcesRef.current.values()) {
              source.stop();
              sourcesRef.current.delete(source);
            }
            nextStartTimeRef.current = 0;
            callbacks.onStatusChange("Nour was interrupted. Please continue.");
          }

          // Handle transcription updates
          if (message.serverContent?.inputTranscription) {
            currentInputTranscription += message.serverContent.inputTranscription.text;
            callbacks.onTranscriptionUpdate('user', currentInputTranscription);
          }
          if (message.serverContent?.outputTranscription) {
            currentOutputTranscription += message.serverContent.outputTranscription.text;
            callbacks.onTranscriptionUpdate('bot', currentOutputTranscription);
          }

          // Handle turn complete
          if (message.serverContent?.turnComplete) {
            callbacks.onTurnComplete(currentInputTranscription, currentOutputTranscription);
            currentInputTranscription = '';
            currentOutputTranscription = '';
            callbacks.onStatusChange("What else would you like to know about Mohamed Abla?");
          }
        },
        onerror: (e: ErrorEvent) => {
          console.error('Live session error:', e);
          callbacks.onError(new Error(`Live session error: ${e.message || 'Unknown error'}`));
          callbacks.onStatusChange("Ah, it seems we hit a little bump. Trying to reconnect, insh'Allah.");
        },
        onclose: (e: CloseEvent) => {
          console.debug('Live session closed:', e);
          if (e.wasClean) {
            callbacks.onStatusChange("Conversation ended cleanly. Ma'salama!");
          } else {
            callbacks.onStatusChange("Conversation ended unexpectedly. Please try again.");
            callbacks.onError(new Error(`Live session closed unexpectedly: Code ${e.code}, Reason: ${e.reason}`));
          }
          // Cleanup audio resources
          inputAudioContextRef.current?.close();
          outputAudioContextRef.current?.close();
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
          }
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, // Using Kore for Nour
        },
        systemInstruction: systemInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    });

    return sessionPromiseRef.current; // Return the promise
  } catch (error) {
    console.error('Failed to connect live session:', error);
    callbacks.onError(new Error(`Failed to start the conversation: ${(error as Error).message}`));
    callbacks.onStatusChange("Couldn't start our chat. There might be an issue with the API key or your connection.");
    return null;
  }
};

export const disconnectLiveSession = async (
  sessionPromiseRef: MutableRefObject<Promise<LiveSession> | null>,
  inputAudioContextRef: MutableRefObject<AudioContext | null>,
  outputAudioContextRef: MutableRefObject<AudioContext | null>,
  inputNodeRef: MutableRefObject<AudioNode | null>,
  sourcesRef: MutableRefObject<Set<AudioBufferSourceNode>>,
  mediaStreamRef: MutableRefObject<MediaStream | null>,
) => {
  if (sessionPromiseRef.current) {
    const session = await sessionPromiseRef.current;
    session.close();
    sessionPromiseRef.current = null;
  }

  // Stop all playing audio
  for (const source of sourcesRef.current.values()) {
    source.stop();
  }
  sourcesRef.current.clear();

  // Disconnect microphone
  if (inputNodeRef.current) {
    inputNodeRef.current.disconnect();
    inputNodeRef.current = null;
  }
  if (mediaStreamRef.current) {
    mediaStreamRef.current.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
  }

  // Close audio contexts
  inputAudioContextRef.current?.close();
  outputAudioContextRef.current?.close();
  inputAudioContextRef.current = null;
  outputAudioContextRef.current = null;
};