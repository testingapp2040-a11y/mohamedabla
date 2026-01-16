import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LiveSession } from '@google/genai';
import { connectLiveSession, disconnectLiveSession, LiveSessionCallbacks } from './services/geminiService';
import { Message } from './types';
import MicrophoneButton from './components/MicrophoneButton';
import ChatWindow from './components/ChatWindow';

function App() {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string>("Tap the microphone to start our journey!");
  const [isApiConnecting, setIsApiConnecting] = useState<boolean>(false);
  const [currentTranscription, setCurrentTranscription] = useState<{ user: string; bot: string }>({ user: '', bot: '' });

  // Refs for audio contexts and streams
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputNodeRef = useRef<AudioNode | null>(null);
  const outputNodeRef = useRef<AudioNode | null>(null); // Added this ref
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const addMessage = useCallback((sender: 'user' | 'bot' | 'status', text: string) => {
    setMessages((prevMessages) => [...prevMessages, { id: Date.now().toString() + Math.random(), sender, text }]);
  }, []);

  const updateMessage = useCallback((sender: 'user' | 'bot', text: string) => {
    setMessages((prevMessages) => {
      // Fix: Replace findLastIndex with a manual loop for broader compatibility
      let lastMessageIndex = -1;
      for (let i = prevMessages.length - 1; i >= 0; i--) {
        if (prevMessages[i].sender === sender) {
          lastMessageIndex = i;
          break;
        }
      }

      if (lastMessageIndex !== -1 && prevMessages[lastMessageIndex].text !== text) {
        const updatedMessages = [...prevMessages];
        updatedMessages[lastMessageIndex] = { ...updatedMessages[lastMessageIndex], text };
        return updatedMessages;
      } else if (lastMessageIndex === -1 || prevMessages[lastMessageIndex].text !== text) {
        // Only add if there's no previous message or the text is different
        return [...prevMessages, { id: Date.now().toString() + Math.random(), sender, text }];
      }
      return prevMessages;
    });
  }, []);


  const liveSessionCallbacks: LiveSessionCallbacks = {
    onTranscriptionUpdate: useCallback((type: 'user' | 'bot', text: string) => {
      setCurrentTranscription(prev => ({ ...prev, [type]: text }));
      if (text) {
        updateMessage(type, text);
      }
    }, [updateMessage]),
    onTurnComplete: useCallback((userText: string, botText: string) => {
      if (userText) addMessage('user', userText);
      if (botText) addMessage('bot', botText);
      setCurrentTranscription({ user: '', bot: '' }); // Clear current transcription after turn complete
    }, [addMessage]),
    onStatusChange: useCallback((newStatus: string) => {
      setStatus(newStatus);
      if (!newStatus.includes("Microphone active.")) { // Avoid adding duplicate 'mic active' status messages
        addMessage('status', newStatus);
      }
    }, [addMessage]),
    onError: useCallback((error: Error) => {
      console.error("App level error:", error);
      let errorMessage = `Error: ${error.message}. Please try again, ya habibi.`;

      const isApiKeyRelatedError = error.message.includes("Requested entity was not found.") || error.message.includes("Network error");

      if (isApiKeyRelatedError && window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        errorMessage = "آه، يبدو أن هناك مشكلة في مفتاح الـ API الخاص بك أو في الاتصال. من فضلك اضغط على زر الميكروفون مرة أخرى لإعادة اختيار مفتاح API مدفوع من مشروع GCP. يمكنك العثور على مزيد من المعلومات حول الفوترة هنا: ai.google.dev/gemini-api/docs/billing." +
                       "\n\nAh, it seems there might be an issue with your API key or connection. Please tap the microphone button again to re-select a paid API key from a GCP project. You can find more information on billing at ai.google.dev/gemini-api/docs/billing.";
      }
      addMessage('status', errorMessage);
      setIsListening(false);
      setIsApiConnecting(false);
    }, [addMessage]),
  };


  const handleToggleListening = async () => {
    if (isListening) {
      setIsListening(false);
      setIsApiConnecting(true); // Indicate that we are in a disconnecting state
      await disconnectLiveSession(
        sessionPromiseRef,
        inputAudioContextRef,
        outputAudioContextRef,
        inputNodeRef,
        sourcesRef,
        mediaStreamRef,
      );
      setStatus("Conversation closed. Ma'salama!");
      setIsApiConnecting(false);
    } else {
      setIsApiConnecting(true);
      setStatus("Connecting to Nour's wisdom...");

      let apiKeySelected = true;
      // Per coding guidelines, window.aistudio.hasSelectedApiKey() is assumed to be pre-configured and accessible.
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        apiKeySelected = await window.aistudio.hasSelectedApiKey();
        if (!apiKeySelected) {
          addMessage('status', "It seems we need to select an API key first. Please choose your paid API key from the dialog.");
          await window.aistudio.openSelectKey();
          // As per guidelines, assume success and proceed, even if hasSelectedApiKey() might not reflect immediately.
          // The API client is initialized *inside* connectLiveSession, so it will pick up the new key.
          apiKeySelected = true;
        }
      } else {
        console.warn("window.aistudio object not found or hasSelectedApiKey function missing. Proceeding without explicit API key selection check.");
      }

      if (apiKeySelected) { // Proceed if key assumed selected or check wasn't possible
        const session = await connectLiveSession(
          sessionPromiseRef,
          inputAudioContextRef,
          outputAudioContextRef,
          inputNodeRef,
          outputNodeRef,
          nextStartTimeRef,
          sourcesRef,
          mediaStreamRef,
          liveSessionCallbacks,
        );
        if (session) {
          setIsListening(true);
        } else {
          // If session connection failed even after attempting key selection,
          // the onError callback will provide specific messages.
          // This else block is for cases where connectLiveSession returns null but no specific error was caught by callbacks.
          if (!isListening) { // Only show this if we didn't successfully start listening
            addMessage('status', "Couldn't start our chat. Please ensure you've selected a valid API key and try again. Billing info: ai.google.dev/gemini-api/docs/billing");
          }
        }
      }
      setIsApiConnecting(false);
    }
  };

  useEffect(() => {
    // Initial welcome message from Nour (now more formal)
    addMessage('bot', "أهلاً وسهلاً بك في مصر! أنا نوّر، مرشدتك السياحية التي ستطلعك على حياة وأعمال الفنان العظيم محمد عبلة. كيف يمكنني مساعدتك اليوم؟\n\nWelcome to Egypt! I am Nour, your friendly tour guide, here to tell you about the life and work of the great artist Mohamed Abla. How may I assist you today?");

    // Cleanup on component unmount
    return () => {
      disconnectLiveSession(
        sessionPromiseRef,
        inputAudioContextRef,
        outputAudioContextRef,
        inputNodeRef,
        sourcesRef,
        mediaStreamRef,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount


  // Render the current transcription if available, dynamically update it.
  const displayedMessages = [...messages];
  if (currentTranscription.user) {
    // Fix: Replace findLastIndex with a manual loop
    let lastUserMsgIndex = -1;
    for (let i = displayedMessages.length - 1; i >= 0; i--) {
      if (displayedMessages[i].sender === 'user') {
        lastUserMsgIndex = i;
        break;
      }
    }

    if (lastUserMsgIndex !== -1) {
      displayedMessages[lastUserMsgIndex] = { ...displayedMessages[lastUserMsgIndex], text: currentTranscription.user };
    } else {
      displayedMessages.push({ id: 'current-user-transcription', sender: 'user', text: currentTranscription.user });
    }
  }
  if (currentTranscription.bot) {
    // Fix: Replace findLastIndex with a manual loop
    let lastBotMsgIndex = -1;
    for (let i = displayedMessages.length - 1; i >= 0; i--) {
      if (displayedMessages[i].sender === 'bot') {
        lastBotMsgIndex = i;
        break;
      }
    }

    if (lastBotMsgIndex !== -1) {
      displayedMessages[lastBotMsgIndex] = { ...displayedMessages[lastBotMsgIndex], text: currentTranscription.bot };
    } else {
      displayedMessages.push({ id: 'current-bot-transcription', sender: 'bot', text: currentTranscription.bot });
    }
  }


  return (
    <div className="flex flex-col h-full w-full bg-white rounded-xl shadow-2xl">
      <header className="p-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md flex items-center justify-between">
        <h1 className="text-2xl font-bold font-serif">Nour's Art Journey</h1>
        <div className="flex items-center space-x-2">
          <span className="text-sm">Status:</span>
          <span className="font-semibold text-amber-100">{status}</span>
        </div>
      </header>

      <ChatWindow messages={displayedMessages} />

      <footer className="p-4 bg-gradient-to-r from-amber-200 to-orange-200 shadow-inner flex justify-center items-center relative">
        <MicrophoneButton
          isListening={isListening}
          onClick={handleToggleListening}
          disabled={isApiConnecting}
        />
        {isApiConnecting && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center space-x-2 text-gray-700">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            <span>Connecting...</span>
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;