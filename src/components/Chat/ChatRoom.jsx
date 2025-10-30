import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { database } from '../../firebase';
import { uploadPhotoToCloudinary, uploadAudioToCloudinary } from '../../utils/cloudinaryUpload';

const ChatRoom = ({ user, onDisconnect }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [userData, setUserData] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDrawing, setShowDrawing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [darkMode, setDarkMode] = useState(false); // DARK MODE STATE
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState('#FF1493');
  const [ctx, setCtx] = useState(null);
  const recordingTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  console.log('🔄 ChatRoom rendering - Dark Mode:', darkMode); // DEBUG LOG

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, partnerTyping]);

  useEffect(() => {
    if (showDrawing && canvasRef.current) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 3;
      setCtx(context);
    }
  }, [showDrawing]);

  // Load user & partner + TYPING LISTENER
  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      console.log('👤 User data loaded:', data);

      if (!data?.coupleCode) {
        console.log('⚠️ No coupleCode - disconnecting');
        onDisconnect();
        return;
      }

      if (data?.partnerUid) {
        const partnerRef = ref(database, `users/${data.partnerUid}`);
        onValue(partnerRef, (snap) => {
          const pData = snap.val();
          setPartnerData(pData);
          console.log('💑 Partner data:', pData);

          // TYPING LISTENER
          const typingRef = ref(database, `typing/${data.coupleCode}/${data.partnerUid}`);
          onValue(typingRef, (tSnap) => {
            const isTyping = !!tSnap.val();
            setPartnerTyping(isTyping);
            console.log('⌨️ Partner typing:', isTyping);
          });
        });
      }
    });
    return () => unsubscribe();
  }, [user, onDisconnect]);

  // Load messages
  useEffect(() => {
    if (!userData?.coupleCode) return;
    console.log('📡 Listening to chats:', userData.coupleCode);
    const chatRef = ref(database, `chats/${userData.coupleCode}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      console.log('💬 Chat data:', data);
      if (data) {
        const msgList = Object.entries(data)
          .map(([key, val]) => ({ id: key, ...val }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgList);
        console.log('✅ Messages loaded:', msgList.length);
      } else {
        setMessages([]);
      }
    });
    return () => unsubscribe();
  }, [userData?.coupleCode]);

  // TYPING INDICATOR SENDER
  useEffect(() => {
    if (!userData?.coupleCode || !newMessage.trim()) {
      const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
      set(typingRef, null);
      return;
    }
    const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
    set(typingRef, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => set(typingRef, null), 1500);
  }, [newMessage, userData?.coupleCode, user.uid]);

  // Send text
  const sendMessage = async () => {
    if (!newMessage.trim() || !userData?.coupleCode) return;
    setSending(true);
    try {
      const chatRef = ref(database, `chats/${userData.coupleCode}`);
      const newMsgRef = push(chatRef);
      await set(newMsgRef, {
        sender: userData.name || user.displayName,
        senderUid: user.uid,
        text: newMessage,
        imageUrl: '',
        audioUrl: '',
        drawingUrl: '',
        reactions: {},
        timestamp: Date.now(),
      });
      setNewMessage('');
      console.log('✅ Text sent');
    } catch (err) {
      console.error('❌ Send failed:', err);
      alert('Failed to send message.');
    }
    setSending(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !userData?.coupleCode) return;
    setSending(true);
    try {
      console.log('📸 Uploading image...');
      const url = await uploadPhotoToCloudinary(file);
      const chatRef = ref(database, `chats/${userData.coupleCode}`);
      const newMsgRef = push(chatRef);
      await set(newMsgRef, {
        sender: userData.name || user.displayName,
        senderUid: user.uid,
        text: '',
        imageUrl: url,
        audioUrl: '',
        drawingUrl: '',
        reactions: {},
        timestamp: Date.now(),
      });
      console.log('✅ Image sent');
    } catch (err) {
      console.error('❌ Image failed:', err);
      alert('Image upload failed.');
    }
    setSending(false);
    fileInputRef.current.value = '';
  };

  // VOICE RECORDING (FIXED MIME)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      console.log('🎤 Starting record with MIME:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        console.log('🎤 Blob created, size:', blob.size);
        setSending(true);
        try {
          const url = await uploadAudioToCloudinary(blob);
          console.log('✅ Audio uploaded URL:', url);
          const chatRef = ref(database, `chats/${userData.coupleCode}`);
          const newMsgRef = push(chatRef);
          await set(newMsgRef, {
            sender: userData.name || user.displayName,
            senderUid: user.uid,
            text: '',
            imageUrl: '',
            audioUrl: url,
            drawingUrl: '',
            reactions: {},
            timestamp: Date.now(),
          });
          console.log('✅ Voice note sent');
        } catch (err) {
          console.error('❌ Voice upload failed:', err);
          alert('Voice note failed.');
        }
        setSending(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Chunk every second
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
      }, 180000); // 3 min max
    } catch (err) {
      console.error('❌ Mic error:', err);
      alert('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const formatTime = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMsgTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Drawing functions (unchanged)
  const startDrawing = (e) => {
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e) => {
    if (!isDrawing || !ctx) return;
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.strokeStyle = drawColor;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const sendDrawing = async () => {
    if (!canvasRef.current || !userData?.coupleCode) return;
    setSending(true);
    canvasRef.current.toBlob(async (blob) => {
      try {
        const url = await uploadPhotoToCloudinary(blob);
        const chatRef = ref(database, `chats/${userData.coupleCode}`);
        const newMsgRef = push(chatRef);
        await set(newMsgRef, {
          sender: userData.name || user.displayName,
          senderUid: user.uid,
          text: '',
          imageUrl: '',
          audioUrl: '',
          drawingUrl: url,
          reactions: {},
          timestamp: Date.now(),
        });
        setShowDrawing(false);
        clearCanvas();
        console.log('✅ Drawing sent');
      } catch (err) {
        console.error('❌ Drawing failed:', err);
        alert('Drawing failed.');
      }
      setSending(false);
    }, 'image/png');
  };

  // REACTIONS
  const addReaction = async (msgId, emoji) => {
    try {
      const msgRef = ref(database, `chats/${userData.coupleCode}/${msgId}/reactions`);
      const userReactionRef = ref(database, `${msgRef.path}/${user.uid}`);
      const userReactionSnap = await onValue(userReactionRef, (snap) => snap.val());
      const currentReaction = userReactionSnap.val();
      if (currentReaction === emoji) {
        await remove(userReactionRef);
      } else {
        await set(userReactionRef, emoji);
      }
      console.log('✅ Reaction added:', emoji);
    } catch (err) {
      console.error('❌ Reaction failed:', err);
    }
    setShowReactionPicker(null);
  };

  // DELETE MESSAGE (YOUR OWN ONLY)
  const deleteMessage = async (msgId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await remove(ref(database, `chats/${userData.coupleCode}/${msgId}`));
      console.log('✅ Message deleted');
    } catch (err) {
      console.error('❌ Delete failed:', err);
      alert('Delete failed.');
    }
  };

  // FIXED VOICE MESSAGE COMPONENT (WHATSAPP STYLE + WORKING PLAYBACK)
  const VoiceMessage = ({ msg }) => {
    const audioRef = useRef(null);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
      const audio = audioRef.current;
      if (audio) {
        audio.addEventListener('loadedmetadata', () => {
          setDuration(Math.floor(audio.duration));
          console.log('🔊 Audio loaded, duration:', audio.duration, 'URL:', msg.audioUrl);
        });
        audio.addEventListener('error', (e) => {
          console.error('🔊 Audio error:', e);
          setError('Playback failed - check console');
        });
        audio.addEventListener('ended', () => {
          setIsPlaying(false);
          setPlayingAudio(null);
        });
      }
    }, [msg.audioUrl]);

    const togglePlay = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch((err) => {
          console.error('❌ Play failed:', err);
          setError('Play failed - try refresh');
        });
        setPlayingAudio(msg.id);
      }
      setIsPlaying(!isPlaying);
    };

    return (
      <div className={`flex items-center gap-3 p-3 rounded-2xl max-w-[280px] ${msg.senderUid === user.uid ? 'bg-gradient-to-r from-pink-100 to-purple-100' : 'bg-white border border-pink-200'}`}>
        <button
          onClick={togglePlay}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-all ${isPlaying ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-purple-500'}`}
          disabled={!!error}
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        <div className="flex-1 min-w-0">
          {/* WHATSAPP WAVEFORM */}
          <div className="flex items-end gap-0.5 h-6 mb-1">
            {[...Array(15)].map((_, i) => (
              <div
                key={i}
                className={`w-0.5 rounded-full transition-all bg-pink-400 ${isPlaying ? 'animate-ping' : ''}`}
                style={{
                  height: isPlaying ? `${20 + Math.random() * 20}px` : '12px',
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 truncate">{duration ? formatTime(duration) : '0:00'}</p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        {/* HIDDEN AUDIO FOR PLAYBACK */}
        <audio
          ref={audioRef}
          src={msg.audioUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        >
          <source src={msg.audioUrl} type="audio/webm" />
          <source src={msg.audioUrl} type="audio/mp3" />
          <source src={msg.audioUrl} type="audio/wav" />
          Your browser can't play this audio. <a href={msg.audioUrl} target="_blank">Download</a>
        </audio>
      </div>
    );
  };

  // DISCONNECT
  const handleDisconnect = async () => {
    if (!window.confirm('💔 Disconnect from partner?')) return;
    try {
      const myRef = ref(database, `users/${user.uid}`);
      await update(myRef, { coupleCode: '', partnerUid: '', partnerName: '' });
      if (userData?.partnerUid) {
        const partnerRef = ref(database, `users/${userData.partnerUid}`);
        await update(partnerRef, { coupleCode: '', partnerUid: '', partnerName: '' });
      }
      console.log('✅ Disconnected');
      onDisconnect();
    } catch (err) {
      console.error('❌ Disconnect failed:', err);
      alert('Disconnect failed.');
    }
  };

  if (!userData?.coupleCode) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-pink-300 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p>Loading chat...</p>
        </div>
      </div>
    );
  }

  const reactionEmojis = ['❤️', '😂', '😢', '😡', '👍'];

  return (
    <div className={`flex flex-col w-full max-w-2xl mx-auto ${darkMode ? 'bg-gray-900 text-white border-gray-700' : 'bg-white text-gray-800 border-pink-100'} rounded-3xl shadow-2xl border h-[90vh] overflow-hidden`}>
      {/* HEADER WITH DARK MODE TOGGLE */}
      <div className={`p-4 relative overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400'}`}>
        <div className="absolute inset-0 bg-white opacity-10 animate-pulse"></div>
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 ${darkMode ? 'bg-gray-700' : 'bg-white'} rounded-full flex items-center justify-center text-2xl shadow-lg`}>💕</div>
            <div>
              <h2 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-white drop-shadow-lg'}`}>💬 Love Chat</h2>
              {partnerData && (
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-white drop-shadow'}`}>{partnerData.name}</p>
                  <div className={`w-2 h-2 rounded-full ${partnerData.online ? 'bg-green-300' : 'bg-gray-300'} animate-pulse`}></div>
                  {partnerData.online && <span className={`text-xs ${darkMode ? 'text-green-400' : 'text-green-300'}`}>Active now</span>}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`text-3xl hover:scale-110 transition-transform ${darkMode ? 'text-white' : 'text-white drop-shadow-lg'}`}
          >
            ⚙️
          </button>
        </div>

        {/* SETTINGS DROPDOWN WITH DARK MODE */}
        {showSettings && (
          <div className={`mt-3 p-4 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl space-y-3 animate-in slide-in-from-top-2 duration-200`}>
            <div className="flex items-center justify-between pb-3 border-b ${darkMode ? 'border-gray-600' : 'border-pink-100'}">
              <div>
                <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Your Code</p>
                <p className="text-lg font-bold text-pink-600">{userData?.userCode}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(userData.userCode);
                  alert('📋 Code copied!');
                }}
                className="text-sm bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 transition-all shadow-md"
              >
                Copy
              </button>
            </div>
            {/* DARK MODE TOGGLE */}
            <div className="flex items-center justify-between py-2">
              <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Dark Mode</span>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`relative w-12 h-6 rounded-full transition-colors ${darkMode ? 'bg-purple-600' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${darkMode ? 'translate-x-6' : ''}`}
                />
              </button>
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full text-sm px-4 py-2 border-2 border-red-300 text-red-500 rounded-xl hover:bg-red-50 transition-all font-medium"
            >
              💔 Disconnect
            </button>
          </div>
        )}
      </div>

      {/* MESSAGES AREA WITH TYPING INDICATOR */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${darkMode ? 'bg-gray-800' : 'bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50'} relative`}>
        {/* TYPING DOTS */}
        {partnerTyping && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-blue-600'}`}>{partnerData?.name} is typing...</span>
          </div>
        )}

        {messages.length === 0 ? (
          <div className={`text-center mt-10 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}>
            <p className="text-6xl mb-3 animate-bounce">💕</p>
            <p className="text-lg font-medium">Start your conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.senderUid === user.uid ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-200`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div
                className={`relative px-4 py-3 rounded-3xl text-sm max-w-[75%] shadow-lg group ${
                  msg.senderUid === user.uid
                    ? darkMode
                      ? 'bg-purple-600 text-white rounded-br-md'
                      : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-br-md'
                    : darkMode
                    ? 'bg-gray-700 text-white rounded-bl-md'
                    : 'bg-white text-gray-800 rounded-bl-md border border-pink-100'
                }`}
              >
                {/* REACTION PICKER */}
                {showReactionPicker === msg.id && (
                  <div className="absolute -top-14 left-1/2 transform -translate-x-1/2 flex gap-2 bg-white p-2 rounded-xl shadow-lg z-10">
                    {reactionEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addReaction(msg.id, emoji)}
                        className="text-2xl hover:scale-110 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {msg.text && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>}
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="Sent image"
                    className="mt-2 rounded-2xl max-w-[250px] cursor-pointer hover:opacity-90 transition-opacity shadow-md"
                    onClick={() => window.open(msg.imageUrl, '_blank')}
                  />
                )}
                {msg.drawingUrl && (
                  <div className="relative mt-2">
                    <img
                      src={msg.drawingUrl}
                      alt="Drawing"
                      className="rounded-2xl max-w-[250px] cursor-pointer hover:opacity-90 transition-opacity shadow-md border-2 border-dashed border-pink-300"
                      onClick={() => window.open(msg.drawingUrl, '_blank')}
                    />
                    <span className="absolute top-1 right-1 text-xl">✏️</span>
                  </div>
                )}
                {msg.audioUrl && <VoiceMessage msg={msg} />}

                {/* REACTIONS DISPLAY */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {Object.values(msg.reactions).map((emoji, i) => (
                      <span key={i} className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        {emoji}
                      </span>
                    ))}
                  </div>
                )}

                {/* HOVER BUTTONS FOR REACT/DELETE */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id);
                  }}
                  className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white rounded-full shadow-md text-xs"
                  title="React"
                >
                  +1
                </button>
                {msg.senderUid === user.uid && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMessage(msg.id);
                    }}
                    className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-red-100 rounded-full shadow-md text-xs text-red-600"
                    title="Delete"
                  >
                    🗑️
                  </button>
                )}
              </div>
              <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'} mt-1 px-2`}>{formatMsgTime(msg.timestamp)}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className={`p-3 border-t-2 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white/80 border-pink-100'} backdrop-blur-sm`}>
        {isRecording && (
          <div className="mb-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-xl p-2 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-red-600">Recording... {formatTime(recordingTime)}</span>
            </div>
            <button onClick={stopRecording} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition">
              Stop
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={sending || isRecording}
            className={`flex-1 px-4 py-3 border-2 rounded-2xl text-sm outline-none transition-all ${
              darkMode
                ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                : 'border-pink-200 bg-white text-gray-800 placeholder-gray-500'
            } ${sending || isRecording ? 'opacity-50 cursor-not-allowed' : 'focus:ring-2 focus:ring-pink-300 focus:border-pink-300'}`}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim() || isRecording}
            className={`px-6 py-3 rounded-2xl font-semibold shadow-lg transition-all ${
              sending || !newMessage.trim() || isRecording
                ? 'opacity-50 cursor-not-allowed'
                : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600 hover:scale-105'
            }`}
          >
            {sending ? '⏳' : '💌'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || isRecording}
            className="text-2xl text-pink-500 hover:scale-110 transition-transform disabled:opacity-50"
            title="Send photo"
          >
            📸
          </button>
          <button
            onClick={() => setShowDrawing(true)}
            disabled={sending || isRecording}
            className="text-2xl text-purple-500 hover:scale-110 transition-transform disabled:opacity-50"
            title="Draw"
          >
            ✏️
          </button>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={sending}
            className={`text-2xl transition-transform hover:scale-110 disabled:opacity-50 ${
              isRecording ? 'text-red-500 animate-pulse' : 'text-blue-500'
            }`}
            title={isRecording ? 'Stop recording' : 'Voice note'}
          >
            🎤
          </button>
          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
        </div>
      </div>

      {/* DRAWING MODAL (UNCHANGED) */}
      {showDrawing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-3xl p-6 shadow-2xl max-w-md w-full ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
            <h3 className="text-xl font-bold text-center mb-4">✏️ Draw Something Sweet!</h3>
            <canvas
              ref={canvasRef}
              width={300}
              height={300}
              className="border-2 border-pink-200 rounded-2xl cursor-crosshair mb-4 block mx-auto shadow-inner bg-white"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
            <div className="flex gap-2 justify-center mb-4 flex-wrap">
              {['#FF1493', '#FF69B4', '#9370DB', '#4169E1', '#000000', '#FFD700'].map((color) => (
                <button
                  key={color}
                  onClick={() => setDrawColor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                    drawColor === color ? 'border-black scale-110' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={clearCanvas} className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-300 transition font-medium">
                Clear
              </button>
              <button
                onClick={() => setShowDrawing(false)}
                className="flex-1 bg-red-100 text-red-600 px-4 py-2 rounded-xl hover:bg-red-200 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={sendDrawing}
                disabled={sending}
                className={`flex-1 px-4 py-2 rounded-xl font-semibold shadow-lg transition-all ${
                  sending
                    ? 'opacity-50 cursor-not-allowed'
                    : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600'
                }`}
              >
                {sending ? '⏳' : 'Send 💕'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-in-from-bottom-2 {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slide-in-from-top-2 {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-in {
          animation-fill-mode: both;
        }
        .slide-in-from-bottom-2 {
          animation-name: slide-in-from-bottom-2;
          animation-duration: 0.3s;
        }
        .slide-in-from-top-2 {
          animation-name: slide-in-from-top-2;
          animation-duration: 0.2s;
        }
      `}</style>
    </div>
  );
};

export default ChatRoom;