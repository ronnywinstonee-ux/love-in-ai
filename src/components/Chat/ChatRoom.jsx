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
  const [darkMode, setDarkMode] = useState(false);
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
  const partnerTypingUnsubscribe = useRef(null);

  console.log('🔥 NEW CHATROOM LOADED - DARK MODE:', darkMode);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, partnerTyping]);

  // Canvas setup
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

  // Load user data & partner with proper cleanup
  useEffect(() => {
    if (!user) return;

    const userRef = ref(database, `users/${user.uid}`);
    const userUnsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      console.log('👤 USER DATA LOADED:', data);

      if (!data?.coupleCode) {
        console.log('⚠️ NO COUPLECODE - DISCONNECTING');
        onDisconnect();
        return;
      }

      // Clean up previous partner typing listener
      if (partnerTypingUnsubscribe.current) {
        partnerTypingUnsubscribe.current();
      }

      if (data?.partnerUid) {
        const partnerRef = ref(database, `users/${data.partnerUid}`);
        const partnerUnsubscribe = onValue(partnerRef, (snap) => {
          const pData = snap.val();
          setPartnerData(pData);
          console.log('💑 PARTNER DATA:', pData);

          // Partner typing listener with proper cleanup
          const typingRef = ref(database, `typing/${data.coupleCode}/${data.partnerUid}`);
          partnerTypingUnsubscribe.current = onValue(typingRef, (tSnap) => {
            const isTyping = !!tSnap.val();
            setPartnerTyping(isTyping);
            console.log('⌨️ PARTNER TYPING:', isTyping);
          });
        });
        return () => partnerUnsubscribe();
      }
    });

    return () => {
      userUnsubscribe();
      if (partnerTypingUnsubscribe.current) {
        partnerTypingUnsubscribe.current();
      }
    };
  }, [user, onDisconnect]);

  // Load messages
  useEffect(() => {
    if (!userData?.coupleCode) return;
    console.log('📡 LISTENING TO CHAT:', userData.coupleCode);
    
    const chatRef = ref(database, `chats/${userData.coupleCode}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgList = Object.entries(data)
          .map(([key, val]) => ({ id: key, ...val }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgList);
        console.log('✅ MESSAGES LOADED:', msgList.length);
      } else {
        setMessages([]);
      }
    });
    return () => unsubscribe();
  }, [userData?.coupleCode]);

  // FIXED Typing indicator - SAFE NULL CHECKS
  useEffect(() => {
    // Clear typing if no message or no connection
    if (!userData?.coupleCode || !user?.uid || !newMessage.trim()) {
      if (userData?.coupleCode && user?.uid) {
        try {
          const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
          set(typingRef, null);
        } catch (err) {
          console.log('Typing clear failed (normal on disconnect)');
        }
      }
      return;
    }

    // Send typing indicator
    try {
      const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
      set(typingRef, true);
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        try {
          set(typingRef, null);
        } catch (err) {
          console.log('Typing timeout failed (normal)');
        }
      }, 1500);
    } catch (err) {
      console.error('Typing indicator error:', err);
    }
  }, [newMessage, userData?.coupleCode, user?.uid]);

  // Send text message
  const sendMessage = async () => {
    if (!newMessage.trim() || !userData?.coupleCode) {
      console.log('❌ CANNOT SEND: No message or no coupleCode');
      return;
    }
    setSending(true);
    try {
      const chatRef = ref(database, `chats/${userData.coupleCode}`);
      const newMsgRef = push(chatRef);
      await set(newMsgRef, {
        sender: userData.name || user.displayName || user.email,
        senderUid: user.uid,
        text: newMessage,
        imageUrl: '',
        audioUrl: '',
        drawingUrl: '',
        reactions: {},
        timestamp: Date.now(),
      });
      setNewMessage('');
      console.log('✅ TEXT MESSAGE SENT');
    } catch (err) {
      console.error('❌ SEND FAILED:', err);
      alert('Failed to send message. Check console.');
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
      console.log('📸 UPLOADING IMAGE...');
      const url = await uploadPhotoToCloudinary(file);
      console.log('✅ IMAGE UPLOADED:', url);
      
      const chatRef = ref(database, `chats/${userData.coupleCode}`);
      const newMsgRef = push(chatRef);
      await set(newMsgRef, {
        sender: userData.name || user.displayName || user.email,
        senderUid: user.uid,
        text: '',
        imageUrl: url,
        audioUrl: '',
        drawingUrl: '',
        reactions: {},
        timestamp: Date.now(),
      });
      console.log('✅ IMAGE MESSAGE SENT');
    } catch (err) {
      console.error('❌ IMAGE FAILED:', err);
      alert('Image upload failed. Check console.');
    }
    setSending(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Voice recording - FIXED FORMAT
  const startRecording = async () => {
    if (!navigator.mediaDevices) {
      alert('Your browser does not support voice recording.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      console.log('🎤 STARTING RECORDING WITH:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        console.log('🎤 BLOB CREATED, SIZE:', blob.size, 'TYPE:', mimeType);
        
        setSending(true);
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        
        try {
          console.log('📤 UPLOADING VOICE NOTE...');
          const url = await uploadAudioToCloudinary(blob);
          console.log('✅ VOICE UPLOADED:', url);
          
          const chatRef = ref(database, `chats/${userData.coupleCode}`);
          const newMsgRef = push(chatRef);
          await set(newMsgRef, {
            sender: userData.name || user.displayName || user.email,
            senderUid: user.uid,
            text: '',
            imageUrl: '',
            audioUrl: url,
            drawingUrl: '',
            reactions: {},
            timestamp: Date.now(),
          });
          console.log('✅ VOICE NOTE SENT SUCCESSFULLY');
        } catch (err) {
          console.error('❌ VOICE UPLOAD FAILED:', err);
          alert('Failed to upload voice note. Check console.');
        }
        setSending(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Auto-stop after 3 minutes
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 180000);
    } catch (err) {
      console.error('❌ RECORDING ERROR:', err);
      alert('Failed to start recording. Check microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMsgTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Drawing functions
  const startDrawing = (e) => {
    if (!ctx || !canvasRef.current) return;
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing || !ctx || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.strokeStyle = drawColor;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const sendDrawing = async () => {
    if (!canvasRef.current || !userData?.coupleCode) return;
    
    setSending(true);
    try {
      console.log('🎨 UPLOADING DRAWING...');
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const url = await uploadPhotoToCloudinary(blob);
          console.log('✅ DRAWING UPLOADED:', url);
          
          const chatRef = ref(database, `chats/${userData.coupleCode}`);
          const newMsgRef = push(chatRef);
          await set(newMsgRef, {
            sender: userData.name || user.displayName || user.email,
            senderUid: user.uid,
            text: '',
            imageUrl: '',
            audioUrl: '',
            drawingUrl: url,
            reactions: {},
            timestamp: Date.now(),
          });
          console.log('✅ DRAWING SENT');
          setShowDrawing(false);
          clearCanvas();
        } catch (err) {
          console.error('❌ DRAWING FAILED:', err);
          alert('Failed to send drawing.');
        }
        setSending(false);
      }, 'image/png');
    } catch (err) {
      console.error('❌ DRAWING UPLOAD FAILED:', err);
      setSending(false);
    }
  };

  // Reactions
  const addReaction = async (msgId, emoji) => {
    if (!userData?.coupleCode) return;
    try {
      const reactionsRef = ref(database, `chats/${userData.coupleCode}/${msgId}/reactions/${user.uid}`);
      const snapshot = await get(reactionsRef);
      const currentReaction = snapshot.val();
      
      if (currentReaction === emoji) {
        await remove(reactionsRef);
        console.log('✅ REACTION REMOVED:', emoji);
      } else {
        await set(reactionsRef, emoji);
        console.log('✅ REACTION ADDED:', emoji);
      }
    } catch (err) {
      console.error('❌ REACTION FAILED:', err);
    }
    setShowReactionPicker(null);
  };

  // Delete message (only own messages)
  const deleteMessage = async (msgId) => {
    if (!window.confirm('Delete this message?')) return;
    if (!userData?.coupleCode) return;
    
    try {
      await remove(ref(database, `chats/${userData.coupleCode}/${msgId}`));
      console.log('✅ MESSAGE DELETED');
    } catch (err) {
      console.error('❌ DELETE FAILED:', err);
      alert('Failed to delete message.');
    }
  };

  // Voice message component - WHATSAPP STYLE
  const VoiceMessage = ({ msg }) => {
    const audioRef = useRef(null);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const handleLoadedMetadata = () => {
        setDuration(Math.floor(audio.duration || 0));
        console.log('🔊 AUDIO LOADED - DURATION:', audio.duration, 'URL:', msg.audioUrl);
      };

      const handleError = (e) => {
        console.error('🔊 AUDIO PLAYBACK ERROR:', e);
        setError('Playback failed');
      };

      const handleEnded = () => {
        setIsPlaying(false);
        setPlayingAudio(null);
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('error', handleError);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('error', handleError);
        audio.removeEventListener('ended', handleEnded);
      };
    }, [msg.audioUrl]);

    const togglePlay = () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio.play().catch((err) => {
          console.error('❌ PLAYBACK FAILED:', err);
          setError('Cannot play audio');
        });
        setIsPlaying(true);
        setPlayingAudio(msg.id);
      }
    };

    return (
      <div className={`flex items-center gap-3 p-3 rounded-2xl max-w-[280px] shadow-md ${
        msg.senderUid === user.uid 
          ? 'bg-gradient-to-r from-pink-100 to-purple-100' 
          : 'bg-white border border-pink-200'
      }`}>
        <button
          onClick={togglePlay}
          disabled={!!error}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-all ${
            isPlaying ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-purple-500'
          } ${error ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        
        <div className="flex-1 min-w-0">
          {/* Waveform animation */}
          <div className="flex items-end gap-0.5 h-6 mb-1">
            {[...Array(15)].map((_, i) => (
              <div
                key={i}
                className={`w-0.5 rounded-full transition-all bg-pink-400 ${
                  isPlaying ? 'animate-waveform' : ''
                }`}
                style={{
                  height: isPlaying ? `${8 + Math.random() * 24}px` : '12px',
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
          
          <p className="text-xs text-gray-500 truncate">
            {duration ? formatTime(duration) : '0:00'}
          </p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        
        {/* Hidden audio element */}
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
          <source src={msg.audioUrl} type="audio/ogg" />
          Your browser cannot play this audio. <a href={msg.audioUrl} target="_blank" rel="noopener noreferrer">Download</a>
        </audio>
      </div>
    );
  };

  // Disconnect
  const handleDisconnect = async () => {
    const confirmed = window.confirm('💔 Disconnect from your partner? You can reconnect with someone else after.');
    if (!confirmed) return;

    try {
      const myRef = ref(database, `users/${user.uid}`);
      await update(myRef, { 
        coupleCode: '', 
        partnerUid: '',
        partnerName: '',
      });
      
      if (userData?.partnerUid) {
        const partnerRef = ref(database, `users/${userData.partnerUid}`);
        await update(partnerRef, { 
          coupleCode: '', 
          partnerUid: '',
          partnerName: '',
        });
      }

      console.log('✅ DISCONNECTED SUCCESSFULLY');
      alert('✅ Disconnected successfully!');
      onDisconnect();
    } catch (err) {
      console.error('❌ DISCONNECT FAILED:', err);
      alert('Failed to disconnect. Try again.');
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
    <div className={`flex flex-col w-full max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl border border-pink-100 h-[90vh] overflow-hidden ${darkMode ? 'bg-gray-900 text-white border-gray-700' : ''}`}>
      {/* Header */}
      <div className={`p-4 bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 relative overflow-hidden ${darkMode ? 'bg-gray-800' : ''}`}>
        <div className="absolute inset-0 bg-white opacity-10 animate-pulse"></div>
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 ${darkMode ? 'bg-gray-700' : 'bg-white'} rounded-full flex items-center justify-center text-2xl shadow-lg`}>
              💕
            </div>
            <div>
              <h2 className={`text-white font-bold text-lg drop-shadow-lg ${darkMode ? 'text-white' : ''}`}>💬 Love Chat</h2>
              {partnerData && (
                <div className="flex items-center gap-2">
                  <p className={`text-white text-sm font-medium drop-shadow ${darkMode ? 'text-gray-300' : ''}`}>
                    {partnerData.name}
                  </p>
                  <div className={`w-2 h-2 rounded-full ${partnerData.online ? 'bg-green-300' : 'bg-gray-300'} animate-pulse`}></div>
                  {partnerData.online && <span className={`text-xs ${darkMode ? 'text-green-400' : 'text-green-300'}`}>Active now</span>}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-white text-3xl hover:scale-110 transition-transform duration-200 drop-shadow-lg"
            title="Settings"
          >
            ⚙️
          </button>
        </div>

        {/* Settings Dropdown */}
        {showSettings && (
          <div className={`mt-3 p-4 ${darkMode ? 'bg-gray-700 text-white' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl space-y-3 animate-slideDown`}>
            <div className="flex items-center justify-between pb-3 border-b ${darkMode ? 'border-gray-600' : 'border-pink-100'}">
              <div>
                <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Your Code</p>
                <p className="text-lg font-bold text-pink-600">{userData?.userCode}</p>
              </div>
              <button
                className="text-sm bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 transition-all shadow-md"
                onClick={() => {
                  navigator.clipboard.writeText(userData.userCode);
                  alert('📋 Code copied to clipboard!');
                }}
              >
                Copy
              </button>
            </div>
            
            {/* Dark Mode Toggle */}
            <div className="flex items-center justify-between py-2">
              <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Dark Mode</span>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none ${darkMode ? 'bg-purple-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ${darkMode ? 'translate-x-6' : ''}`} />
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

      {/* Messages Area */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${darkMode ? 'bg-gray-800' : 'bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50'} relative`}>
        {/* Typing Indicator */}
        {partnerTyping && partnerData && (
          <div className={`flex items-center gap-2 p-3 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
            <div className="flex gap-1">
              <div className={`w-2 h-2 rounded-full animate-bounce ${darkMode ? 'bg-gray-400' : 'bg-blue-500'}`} style={{ animationDelay: '0s' }}></div>
              <div className={`w-2 h-2 rounded-full animate-bounce ${darkMode ? 'bg-gray-400' : 'bg-blue-500'}`} style={{ animationDelay: '0.1s' }}></div>
              <div className={`w-2 h-2 rounded-full animate-bounce ${darkMode ? 'bg-gray-400' : 'bg-blue-500'}`} style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-blue-600'}`}>
              {partnerData.name} is typing...
            </span>
          </div>
        )}

        {/* Empty State */}
        {messages.length === 0 ? (
          <div className={`text-center mt-10 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}>
            <p className="text-6xl mb-3 animate-bounce">💕</p>
            <p className="text-lg font-medium">Start your conversation!</p>
            <p className="text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}">
              Send a message, photo, voice note, or drawing
            </p>
          </div>
        ) : (
          /* Messages */
          messages.map((msg, index) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.senderUid === user.uid ? 'items-end' : 'items-start'} animate-slideIn relative group`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div
                className={`relative px-4 py-3 rounded-3xl text-sm max-w-[75%] shadow-lg transform transition-all hover:scale-[1.02] ${
                  msg.senderUid === user.uid
                    ? darkMode
                      ? 'bg-purple-600 text-white rounded-br-md'
                      : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-br-md'
                    : darkMode
                    ? 'bg-gray-700 text-white rounded-bl-md'
                    : 'bg-white text-gray-800 rounded-bl-md border-2 border-pink-100'
                }`}
              >
                {/* Reaction Picker */}
                {showReactionPicker === msg.id && (
                  <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 flex gap-2 bg-white p-2 rounded-xl shadow-lg z-10 border border-gray-200">
                    {reactionEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addReaction(msg.id, emoji)}
                        className="text-2xl hover:scale-125 transition-transform p-1 rounded"
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Message Content */}
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
                    <span className="absolute top-2 right-2 text-xl">✏️</span>
                  </div>
                )}
                
                {msg.audioUrl && <VoiceMessage msg={msg} />}

                {/* Reactions Display */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {Object.values(msg.reactions).map((emoji, i) => (
                      <span key={i} className="text-lg">{emoji}</span>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id);
                  }}
                  className="absolute -right-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-2 rounded-full shadow-md text-sm hover:bg-gray-50"
                  title="Add reaction"
                >
                  +1
                </button>
                
                {msg.senderUid === user.uid && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMessage(msg.id);
                    }}
                    className="absolute -left-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-100 p-2 rounded-full shadow-md text-sm text-red-600 hover:bg-red-200"
                    title="Delete message"
                  >
                    🗑️
                  </button>
                )}
              </div>
              
              <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'} mt-1 px-2`}>
                {formatMsgTime(msg.timestamp)}
              </p>
            </div>
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={`p-3 border-t-2 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white/80 border-pink-100'} backdrop-blur-sm`}>
        {/* Recording Indicator */}
        {isRecording && (
          <div className="mb-3 flex items-center justify-between bg-red-50 border border-red-200 rounded-xl p-3 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-red-600">
                Recording... {formatTime(recordingTime)}
              </span>
            </div>
            <button
              onClick={stopRecording}
              className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition-colors"
            >
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
            className={`flex-1 px-4 py-3 border-2 rounded-2xl focus:ring-2 focus:ring-pink-300 focus:border-pink-300 text-sm outline-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed ${
              darkMode
                ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                : 'border-pink-200 bg-white text-gray-800 placeholder-gray-500'
            } ${sending || isRecording ? 'opacity-50' : ''}`}
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
            className={`text-2xl transition-transform ${sending || isRecording ? 'opacity-50 cursor-not-allowed' : 'text-pink-500 hover:scale-110'}`}
            title="Send photo"
          >
            📸
          </button>
          
          <button
            onClick={() => setShowDrawing(true)}
            disabled={sending || isRecording}
            className={`text-2xl transition-transform ${sending || isRecording ? 'opacity-50 cursor-not-allowed' : 'text-purple-500 hover:scale-110'}`}
            title="Draw something"
          >
            ✏️
          </button>
          
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={sending}
            className={`text-2xl transition-transform ${sending ? 'opacity-50 cursor-not-allowed' : ''} ${
              isRecording ? 'text-red-500 animate-pulse' : 'text-blue-500 hover:scale-110'
            }`}
            title={isRecording ? 'Stop recording' : 'Voice note (3 min max)'}
          >
            🎤
          </button>
          
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>
      </div>

      {/* Drawing Modal */}
      {showDrawing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
            <h3 className="text-xl font-bold text-center mb-4">✏️ Draw Something Sweet!</h3>
            
            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              className={`border-4 rounded-2xl cursor-crosshair mb-4 block mx-auto shadow-inner ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-pink-200'}`}
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
                  className={`w-10 h-10 rounded-full border-4 transition-transform hover:scale-110 ${
                    drawColor === color ? 'border-black scale-110' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={clearCanvas}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-300 transition font-medium"
              >
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
                {sending ? '⏳ Sending...' : 'Send 💕'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes waveform {
          0%, 100% {
            height: 8px;
            opacity: 0.4;
          }
          50% {
            height: 24px;
            opacity: 1;
          }
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
        .animate-waveform {
          animation: waveform 0.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default ChatRoom;