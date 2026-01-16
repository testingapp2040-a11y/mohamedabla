import React, { useEffect, useRef } from 'react';
import { Message } from '../types';

interface ChatWindowProps {
  messages: Message[];
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-orange-50 rounded-lg shadow-inner custom-scrollbar">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex mb-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`
              max-w-[75%] p-3 rounded-lg text-sm md:text-base shadow-md
              ${message.sender === 'user'
                ? 'bg-orange-400 text-white rounded-br-none'
                : message.sender === 'bot'
                  ? 'bg-white text-gray-800 rounded-bl-none border border-orange-200'
                  : 'bg-gray-200 text-gray-600 italic text-center w-full'
              }
            `}
          >
            {message.text}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatWindow;
