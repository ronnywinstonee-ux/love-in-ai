import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, update, remove, get } from 'firebase/database';
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
  const [partnerTyping, setPartnerTyping] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState('#FF1493');
  const [ctx, setCtx] = useState(null);
  const recordingTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  // Load user data
  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      console.log('👤 User data loaded:', data);

      if (!data?.coupleCode) {
        console.log('⚠️ No coupleCode - disconnected');
        onDisconnect();
        return;
      }

      if (data?.partnerUid) {
        const partnerRef = ref(database, `users/${data.partnerUid}`);
        onValue(partnerRef, (partnerSnap) => {
          const pData = partnerSnap.val();
          setPartnerData(pData);
          console.log('💑 Partner data loaded:', pData);
        });

        // Watch partner typing
        const typingRef = ref(database, `typing/${data.coupleCode}/${data.partnerUid}`);
        onValue(typingRef, (typingSnap) => {
          setPartnerTyping(!!typingSnap.val());
        });
      }
    });

    return () => unsubscribe();
  }, [user, onDisconnect]);

  // Load messages
  useEffect(() => {
    if (!userData?.coupleCode) return;
    console.log('📡 Listening to chat:', userData.coupleCode);
    
    const chatRef = ref(database, `chats/${userData.coupleCode}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
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

  // Typing indicator
  useEffect(() => {
    if (!userData?.coupleCode || !user?.uid) return;

    if (newMessage.trim()) {
      const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
      set(typingRef, true);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        set(typingRef, false);
      }, 1500);
    } else {
      const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
      set(typingRef, false);
    }
  }, [newMessage, userData?.coupleCode, user?.uid]);

  // Send text message
  const sendMessage = async () => {
    if (!newMessage.trim() || !userData?.coupleCode) return;
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
        timestamp: Date.now(),
      });
      setNewMessage('');
      console.log('✅ Message sent');
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
      console.log('✅ Image uploaded:', url);
      
      const chatRef = ref(database, `chats/${userData.coupleCode}`);
      const newMsgRef = push(chatRef);
      await set(newMsgRef, {
        sender: userData.name || user.displayName || user.email,
        senderUid: user.uid,
        text: '',
        imageUrl: url,
        audioUrl: '',
        drawingUrl: '',
        timestamp: Date.now(),
      });
      console.log('✅ Image message sent');
    } catch (err) {
      console.error('❌ Image failed:', err);
      alert('Image upload failed.');
    }
    setSending(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Voice recording (3 minutes)
  const startRecording = async () => {
    if (!navigator.mediaDevices) {
      alert('Your browser does not support voice recording.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        console.log('🎤 Recording stopped, size:', blob.size);
        
        setSending(true);
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        
        try {
          console.log('📤 Uploading voice note...');
          const url = await uploadAudioToCloudinary(blob);
          console.log('✅ Voice uploaded:', url);
          
          const chatRef = ref(database, `chats/${userData.coupleCode}`);
          const newMsgRef = push(chatRef);
          await set(newMsgRef, {
            sender: userData.name || user.displayName || user.email,
            senderUid: user.uid,
            text: '',
            imageUrl: '',
            audioUrl: url,
            drawingUrl: '',
            timestamp: Date.now(),
          });
          console.log('✅ Voice note sent');
        } catch (err) {
          console.error('❌ Voice upload failed:', err);
          alert('Failed to upload voice note.');
        }
        setSending(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Stop after 3 minutes
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 180000);
    } catch (err) {
      console.error('❌ Recording error:', err);
      alert('Failed to start recording. Check microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
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
      console.log('🎨 Uploading drawing...');
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const url = await uploadPhotoToCloudinary(blob);
          console.log('✅ Drawing uploaded:', url);
          
          const chatRef = ref(database, `chats/${userData.coupleCode}`);
          const newMsgRef = push(chatRef);
          await set(newMsgRef, {
            sender: userData.name || user.displayName || user.email,
            senderUid: user.uid,
            text: '',
            imageUrl: '',
            audioUrl: '',
            drawingUrl: url,
            timestamp: Date.now(),
          });
          console.log('✅ Drawing sent');
          setShowDrawing(false);
          clearCanvas();
        } catch (err) {
          console.error('❌ Drawing failed:', err);
          alert('Failed to send drawing.');
        }
        setSending(false);
      }, 'image/png');
    } catch (err) {
      console.error('❌ Drawing upload failed:', err);
      setSending(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    const confirmed = window.confirm('💔 Disconnect from your partner?');
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

      alert('✅ Disconnected successfully!');
      onDisconnect();
    } catch (err) {
      console.error('❌ Disconnect failed:', err);
      alert('Failed to disconnect.');
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

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl border border-pink-100 h-[90vh] overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 relative overflow-hidden">
        <div className="absolute inset-0 bg-white opacity-10 animate-pulse"></div>
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-2xl shadow-lg">
              💕
            </div>
            <div>
              <h2 className="text-white font-bold text-lg drop-shadow-lg">💬 Love Chat</h2>
              {partnerData && (
                <div className="flex items-center gap-2">
                  <p className="text-white text-sm font-medium drop-shadow">{partnerData.name}</p>
                  <div className={`w-2 h-2 rounded-full ${partnerData.online ? 'bg-green-300' : 'bg-gray-300'} animate-pulse`}></div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-white text-3xl hover:scale-110 transition-transform duration-200 drop-shadow-lg"
          >
            ⚙️
          </button>
        </div>

        {showSettings && (
          <div className="mt-3 p-4 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-pink-100">
              <div>
                <p className="text-xs text-gray-500 font-medium">Your Code</p>
                <p className="text-lg font-bold text-pink-600">{userData?.userCode}</p>
              </div>
              <button
                className="text-sm bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 transition shadow-md"
                onClick={() => {
                  navigator.clipboard.writeText(userData.userCode);
                  alert('📋 Code copied!');
                }}
              >
                Copy
              </button>
            </div>
            <button
              onClick={handleDisconnect}
              className="w-full text-sm px-4 py-2 border-2 border-red-300 text-red-500 rounded-xl hover:bg-red-50 transition font-medium"
            >
              💔 Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 relative">
        {/* Typing Indicator */}
        {partnerTyping && partnerData && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-white shadow-sm border border-pink-100 animate-pulse">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-sm text-pink-600 font-medium">
              {partnerData.name} is typing...
            </span>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">
            <p className="text-6xl mb-3 animate-bounce">💕</p>
            <p className="text-lg font-medium">Start your conversation!</p>
            <p className="text-sm mt-2">Send a message, photo, voice note, or drawing</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.senderUid === user.uid ? 'items-end' : 'items-start'} animate-slideIn`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div
                className={`px-4 py-3 rounded-3xl text-sm max-w-[75%] shadow-lg transform transition-all hover:scale-[1.02] ${
                  msg.senderUid === user.uid
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-br-md'
                    : 'bg-white text-gray-800 rounded-bl-md border-2 border-pink-100'
                }`}
              >
                {msg.text && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>}
                
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="sent"
                    className="mt-2 rounded-2xl max-w-[250px] cursor-pointer hover:opacity-90 transition shadow-md"
                    onClick={() => window.open(msg.imageUrl, '_blank')}
                  />
                )}
                
                {msg.drawingUrl && (
                  <div className="relative mt-2">
                    <img
                      src={msg.drawingUrl}
                      alt="drawing"
                      className="rounded-2xl max-w-[250px] cursor-pointer hover:opacity-90 transition shadow-md border-2 border-dashed border-pink-300"
                      onClick={() => window.open(msg.drawingUrl, '_blank')}
                    />
                    <span className="absolute top-2 right-2 text-xl">✏️</span>
                  </div>
                )}
                
                {msg.audioUrl && (
                  <audio controls className="mt-2 w-full max-w-[250px] rounded-lg">
                    <source src={msg.audioUrl} type="audio/webm" />
                    <source src={msg.audioUrl} type="audio/mp3" />
                  </audio>
                )}
              </div>
              
              <p className="text-xs text-gray-400 mt-1 px-2 font-medium">
                {formatMsgTime(msg.timestamp)}
              </p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t-2 border-pink-100 bg-white/80 backdrop-blur-sm">
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
              className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition"
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
            disabled={sending}
            className="flex-1 px-4 py-3 border-2 border-pink-200 rounded-2xl focus:ring-2 focus:ring-pink-300 focus:border-pink-300 text-sm outline-none disabled:bg-gray-50 transition-all"
          />
          
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim()}
            className="bg-gradient-to-r from-pink-500 to-purple-500 text-white px-6 py-3 rounded-2xl hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg transform hover:scale-105"
          >
            {sending ? '⏳' : '💌'}
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="text-pink-500 text-3xl hover:scale-110 transition-transform disabled:opacity-50"
            title="Send Image"
          >
            📸
          </button>
          
          <button
            onClick={() => setShowDrawing(true)}
            disabled={sending}
            className="text-purple-500 text-3xl hover:scale-110 transition-transform disabled:opacity-50"
            title="Draw & Send"
          >
            ✏️
          </button>
          
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={sending}
            className={`text-3xl hover:scale-110 transition-transform disabled:opacity-50 ${isRecording ? 'text-red-500 animate-pulse' : 'text-blue-500'}`}
            title={isRecording ? 'Stop Recording' : 'Voice Note (3 min)'}
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
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">✏️ Draw Something!</h3>
            
            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              className="border-4 border-pink-200 rounded-2xl cursor-crosshair mb-4 bg-white shadow-inner"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
            
            <div className="flex gap-2 mb-4 justify-center flex-wrap">
              {['#FF1493', '#FF69B4', '#9370DB', '#4169E1', '#000000', '#FFD700'].map(color => (
                <button
                  key={color}
                  onClick={() => setDrawColor(color)}
                  className={`w-10 h-10 rounded-full border-4 transition-transform hover:scale-110 ${
                    drawColor === color ? 'border-gray-800 scale-110' : 'border-gray-300'
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
                className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 transition disabled:opacity-50 font-semibold shadow-lg"
              >
                {sending ? '⏳' : 'Send 💕'}
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
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default ChatRoom;