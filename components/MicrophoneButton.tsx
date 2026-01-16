import React from 'react';

interface MicrophoneButtonProps {
  isListening: boolean;
  onClick: () => void;
  disabled: boolean;
}

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ isListening, onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative flex items-center justify-center
        w-16 h-16 rounded-full shadow-lg
        transition-all duration-300 ease-in-out
        ${isListening
          ? 'bg-red-500 hover:bg-red-600 ring-4 ring-red-300 animate-pulse'
          : 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-300'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      aria-label={isListening ? "Stop listening" : "Start listening"}
    >
      <img
        src="/microphone.png"
        alt="Microphone"
        className={`w-8 h-8
          ${isListening ? 'animate-bounce' : ''}
        `}
      />
    </button>
  );
};

export default MicrophoneButton;
