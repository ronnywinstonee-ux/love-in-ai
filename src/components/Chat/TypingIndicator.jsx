import React from 'react';

const TypingIndicator = () => {
  return (
    <div className="flex items-center space-x-2 p-3">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
        <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
        <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
      </div>
      <span className="text-sm text-gray-600">Your partner is typing...</span>
    </div>
  );
};

export default TypingIndicator;