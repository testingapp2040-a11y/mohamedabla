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
      <svg
        className={`w-8 h-8 text-white
          ${isListening ? 'animate-bounce' : ''}
        `}
        fill="currentColor"
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.749A5.998 5.998 0 0110 16a5.998 5.001 0 01-1-1.251V13a1 1 0 10-2 0v1.5c0 2.298 1.838 4.195 4 4.495V20a1 1 0 102 0v-1.255c2.162-.299 4-2.197 4-4.495V13a1 1 0 10-2 0v1.749z"
          clipRule="evenodd"
        ></path>
      </svg>
    </button>
  );
};

export default MicrophoneButton;
