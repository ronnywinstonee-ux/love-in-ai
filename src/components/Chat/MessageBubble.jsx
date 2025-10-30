// src/components/Chat/MessageBubble.jsx
import React, { useState } from 'react';
import { ref, update } from 'firebase/database';
import { database } from '../../firebase';

const MessageBubble = ({ message, isOwnMessage, coupleCode, currentUserId }) => {
  const [showReactions, setShowReactions] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const addReaction = async (emoji) => {
    if (!message.id) return;
    const messageRef = ref(
      database,
      `couples/${coupleCode}/messages/${message.id}/reactions/${currentUserId}`
    );
    await update(messageRef, { emoji });
    setShowReactions(false);
  };

  // 🖼️ PHOTO MESSAGE
  if (message.type === 'photo') {
    return (
      <>
        <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}>
          <div
            className={`max-w-xs lg:max-w-md rounded-2xl shadow-lg relative overflow-hidden ${
              isOwnMessage
                ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white rounded-br-sm'
                : 'bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-bl-sm'
            }`}
            onMouseDown={() => setTimeout(() => setShowReactions(true), 600)}
            onMouseUp={() => setTimeout(() => setShowReactions(false), 100)}
          >
            <div className="p-3">
              <div className="relative">
                <img
                  src={message.photoUrl}
                  alt="Shared"
                  className={`rounded-xl max-w-full max-h-64 object-cover shadow-md cursor-pointer transition ${
                    message.uploading ? 'opacity-60 blur-[1px]' : 'hover:scale-105'
                  }`}
                  onClick={() => !message.uploading && setShowImageModal(true)}
                />
                {message.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded-xl text-white text-sm font-medium">
                    Uploading...
                  </div>
                )}
              </div>

              <div
                className={`text-xs mt-2 opacity-75 ${
                  isOwnMessage ? 'text-right' : 'text-left'
                }`}
              >
                {formatTime(message.timestamp)}
              </div>
            </div>

            {showReactions && !message.uploading && (
              <div className="absolute top-0 left-0 flex gap-2 bg-white rounded-full shadow-lg p-2">
                <button onClick={() => addReaction('❤️')}>❤️</button>
                <button onClick={() => addReaction('💋')}>💋</button>
                <button onClick={() => addReaction('😍')}>😍</button>
              </div>
            )}

            {message.reactions && Object.values(message.reactions).length > 0 && (
              <div className="flex gap-1 mt-1 px-2 pb-2">
                {Object.values(message.reactions).map((r, i) => (
                  <span key={i}>{r.emoji}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 🖼️ Lightbox Modal */}
        {showImageModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
            onClick={() => setShowImageModal(false)}
          >
            <img
              src={message.photoUrl}
              alt="Full"
              className="max-w-full max-h-[90vh] rounded-lg shadow-lg"
            />
          </div>
        )}
      </>
    );
  }

  // 🎤 VOICE MESSAGE
  if (message.type === 'voice') {
    return (
      <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}>
        <div
          className={`max-w-xs lg:max-w-md rounded-2xl shadow-lg ${
            isOwnMessage
              ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white rounded-br-sm'
              : 'bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-bl-sm'
          }`}
        >
          <div className="p-3">
            <audio controls className="max-w-full">
              <source src={message.audioUrl} type="audio/webm" />
            </audio>
            <div
              className={`text-xs mt-2 opacity-75 ${
                isOwnMessage ? 'text-right' : 'text-left'
              }`}
            >
              {formatTime(message.timestamp)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 💬 TEXT OR SYSTEM MESSAGE
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  // 📝 NORMAL TEXT MESSAGE
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-md relative ${
          isOwnMessage
            ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white rounded-br-sm'
            : 'bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-bl-sm'
        }`}
        onMouseDown={() => setTimeout(() => setShowReactions(true), 600)}
        onMouseUp={() => setTimeout(() => setShowReactions(false), 100)}
      >
        <div className="text-sm font-medium">{message.text}</div>
        <div
          className={`text-xs mt-1 opacity-75 ${
            isOwnMessage ? 'text-right' : 'text-left'
          }`}
        >
          {formatTime(message.timestamp)}
        </div>

        {showReactions && (
          <div className="absolute top-0 left-0 flex gap-2 bg-white rounded-full shadow-lg p-2">
            <button onClick={() => addReaction('❤️')}>❤️</button>
            <button onClick={() => addReaction('💋')}>💋</button>
            <button onClick={() => addReaction('😍')}>😍</button>
          </div>
        )}

        {message.reactions && Object.values(message.reactions).length > 0 && (
          <div className="flex gap-1 mt-1">
            {Object.values(message.reactions).map((r, i) => (
              <span key={i}>{r.emoji}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
