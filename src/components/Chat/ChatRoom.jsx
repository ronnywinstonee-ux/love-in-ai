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
  const [typing, setTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
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

  // Load user & partner
  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      if (!data?.coupleCode) {
        onDisconnect();
        return;
      }
      if (data?.partnerUid) {
        const partnerRef = ref(database, `users/${data.partnerUid}`);
        onValue(partnerRef, (snap) => {
          const p = snap.val();
          setPartnerData(p);
          // Typing listener
          const typingRef = ref(database, `typing/${data.coupleCode}/${data.partnerUid}`);
          onValue(typingRef, (tSnap) => {
            setPartnerTyping(!!tSnap.val());
          });
        });
      }
    });
    return () => unsubscribe();
  }, [user, onDisconnect]);

  // Messages
  useEffect(() => {
    if (!userData?.coupleCode) return;
    const chatRef = ref(database, `chats/${userData.coupleCode}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data)
          .map(([k, v]) => ({ id: k, ...v }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);
      } else {
        setMessages([]);
      }
    });
    return () => unsubscribe();
  }, [userData?.coupleCode]);

  // Typing indicator
  useEffect(() => {
    if (!userData?.coupleCode || !newMessage.trim()) return;
    const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
    set(typingRef, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      set(typingRef, null);
    }, 1000);
    return () => clearTimeout(typingTimeoutRef.current);
  }, [newMessage, userData?.coupleCode, user.uid]);

  // Send message
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
        reactions: {},
        timestamp: Date.now(),
      });
      setNewMessage('');
      const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
      await set(typingRef, null);
    } catch (err) {
      alert('Failed to send.');
    }
    setSending(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Image
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !userData?.coupleCode) return;
    setSending(true);
    try {
      const url = await uploadPhotoToCloudinary(file);
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
    } catch (err) {
      alert('Image failed.');
    }
    setSending(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Voice
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        setSending(true);
        try {
          const url = await uploadAudioToCloudinary(blob);
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
        } catch (err) {
          alert('Voice note failed.');
        }
        setSending(false);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      setTimeout(() => mediaRecorder.state === 'recording' && mediaRecorder.stop(), 180000);
    } catch (err) {
      alert('Mic access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const formatTime = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  const formatMsgTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Drawing
  const startDrawing = (e) => { if (!ctx) return; setIsDrawing(true); const r = canvasRef.current.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); };
  const draw = (e) => { if (!isDrawing || !ctx) return; const r = canvasRef.current.getBoundingClientRect(); ctx.strokeStyle = drawColor; ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke(); };
  const stopDrawing = () => setIsDrawing(false);
  const clearCanvas = () => ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  const sendDrawing = async () => {
    if (!canvasRef.current) return;
    setSending(true);
    canvasRef.current.toBlob(async (blob) => {
      try {
        const url = await uploadPhotoToCloudinary(blob);
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
        setShowDrawing(false);
        clearCanvas();
      } catch (err) { alert('Drawing failed.'); }
      setSending(false);
    }, 'image/png');
  };

  // Reactions
  const addReaction = async (msgId, emoji) => {
    const msgRef = ref(database, `chats/${userData.coupleCode}/${msgId}/reactions`);
    const userReaction = await get(ref(database, `${msgRef.path}/${user.uid}`));
    if (userReaction.val() === emoji) {
      await update(msgRef, { [user.uid]: null });
    } else {
      await update(msgRef, { [user.uid]: emoji });
    }
    setShowReactionPicker(null);
  };

  // Delete message
  const deleteMessage = async (msgId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await remove(ref(database, `chats/${userData.coupleCode}/${msgId}`));
    } catch (err) {
      alert('Delete failed.');
    }
  };

  // Voice message component
  const VoiceMessage = ({ msg }) => {
    const [duration, setDuration] = useState(null);
    const audioElem = useRef(null);
    useEffect(() => {
      const audio = audioElem.current;
      if (!audio) return;
      const onLoaded = () => setDuration(Math.floor(audio.duration));
      audio.addEventListener('loadedmetadata', onLoaded);
      return () => audio.removeEventListener('loadedmetadata', onLoaded);
    }, [msg.audioUrl]);
    const isPlaying = playingAudio === msg.id;
    const togglePlay = () => {
      if (isPlaying) { audioElem.current.pause(); setPlayingAudio(null); }
      else { setPlayingAudio(msg.id); audioElem.current.play(); }
    };
    return (
      <div className={`flex items-center gap-2 p-2 rounded-2xl max-w-[280px] ${msg.senderUid === user.uid ? 'bg-pink-100' : 'bg-white border border-pink-100'}`}>
        <button onClick={togglePlay} className={`w-10 h-10 rounded-full flex items-center justify-center ${isPlaying ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-purple-500'} text-white shadow-md`}>
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-1 h-8">
            {[...Array(20)].map((_, i) => (
              <div key={i} className={`w-1 rounded-full bg-pink-400 transition-all ${isPlaying ? 'animate-wave' : 'h-2'}`} style={{ height: isPlaying ? `${Math.random() * 100 + 10}%` : '8px', animationDelay: `${i * 0.05}s` }} />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">{duration ? formatTime(duration) : '0:00'}</p>
        </div>
        <audio ref={audioElem} src={msg.audioUrl} onEnded={() => setPlayingAudio(null)} />
      </div>
    );
  };

  // Disconnect
  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect from partner?')) return;
    try {
      const myRef = ref(database, `users/${user.uid}`);
      const partnerRef = ref(database, `users/${userData.partnerUid}`);
      await update(myRef, { coupleCode: '', partnerUid: '', partnerName: '' });
      if (userData.partnerUid) await update(partnerRef, { coupleCode: '', partnerUid: '', partnerName: '' });
      onDisconnect();
    } catch (err) { alert('Disconnect failed.'); }
  };

  if (!userData?.coupleCode) {
    return <div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-10 h-10 border-4 border-pink-300 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p>Loading chat...</p></div></div>;
  }

  const reactions = ['Heart', 'Laugh', 'Cry', 'Angry', 'Thumbs Up'];

  return (
    <div className={`flex flex-col w-full max-w-2xl mx-auto rounded-3xl shadow-2xl border h-[90vh] overflow-hidden ${darkMode ? 'bg-gray-900 text-white border-gray-700' : 'bg-white text-gray-800 border-pink-100'}`}>
      {/* Header */}
      <div className={`p-4 ${darkMode ? 'bg-gray-800' : 'bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400'} relative overflow-hidden`}>
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 ${darkMode ? 'bg-gray-700' : 'bg-white'} rounded-full flex items-center justify-center text-2xl shadow-lg`}>Heart</div>
            <div>
              <h2 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-white drop-shadow-lg'}`}>Love Chat</h2>
              {partnerData && (
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-white drop-shadow'}`}>{partnerData.name}</p>
                  <div className={`w-2 h-2 rounded-full ${partnerData.online ? 'bg-green-400' : 'bg-gray-400'} animate-pulse`}></div>
                  {partnerData.online && <span className="text-xs text-green-300">Active now</span>}
                </div>
              )}
            </div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className={`text-3xl hover:scale-110 transition-transform ${darkMode ? 'text-white' : 'text-white'}`}>Settings</button>
        </div>

        {/* Settings */}
        {showSettings && (
          <div className={`mt-3 p-4 ${darkMode ? 'bg-gray-700' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl space-y-3 animate-slideDown`}>
            <div className="flex items-center justify-between pb-3 border-b border-pink-100">
              <div>
                <p className="text-xs text-gray-500 font-medium">Your Code</p>
                <p className="text-lg font-bold text-pink-600">{userData?.userCode}</p>
              </div>
              <button className="text-sm bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 transition-all shadow-md" onClick={() => { navigator.clipboard.writeText(userData.userCode); alert('Code copied!'); }}>
                Copy
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Dark Mode</span>
              <button onClick={() => setDarkMode(!darkMode)} className={`w-12 h-6 rounded-full ${darkMode ? 'bg-purple-600' : 'bg-gray-300'} p-1 transition-all`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
            <button onClick={handleDisconnect} className="w-full text-sm px-4 py-2 border-2 border-red-300 text-red-500 rounded-xl hover:bg-red-50 transition-all font-medium">
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${darkMode ? 'bg-gray-800' : 'bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50'} relative`}>
        {partnerTyping && (
          <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            {partnerData?.name} is typing...
          </div>
        )}

        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">
            <p className="text-6xl mb-3 animate-bounce">Heart</p>
            <p className="text-lg font-medium">Start your conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.senderUid === user.uid ? 'items-end' : 'items-start'} animate-slideIn group`} onLongPress={() => msg.senderUid === user.uid && deleteMessage(msg.id)}>
              <div className={`relative px-4 py-3 rounded-3xl text-sm max-w-[75%] shadow-lg ${msg.senderUid === user.uid ? (darkMode ? 'bg-purple-600 text-white' : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white') + ' rounded-br-md' : (darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-800') + ' rounded-bl-md border-2 border-pink-100'}`}>
                {/* Reaction Picker */}
                {showReactionPicker === msg.id && (
                  <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 flex gap-1 bg-white p-2 rounded-full shadow-lg">
                    {reactions.map(r => (
                      <button key={r} onClick={() => addReaction(msg.id, r)} className="text-xl hover:scale-125 transition-transform">{r}</button>
                    ))}
                  </div>
                )}

                {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                {msg.imageUrl && <img src={msg.imageUrl} alt="img" className="mt-1 rounded-2xl max-w-[250px] cursor-pointer" onClick={() => window.open(msg.imageUrl, '_blank')} />}
                {msg.drawingUrl && (
                  <div className="relative">
                    <img src={msg.drawingUrl} alt="drawing" className="mt-1 rounded-2xl max-w-[250px] border-2 border-dashed border-pink-300" onClick={() => window.open(msg.drawingUrl, '_blank')} />
                    <span className="absolute top-2 right-2 text-xl">Pencil</span>
                  </div>
                )}
                {msg.audioUrl && <VoiceMessage msg={msg} />}

                {/* Reactions Display */}
                {msg.reactions && Object.entries(msg.reactions).length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {Object.entries(msg.reactions).map(([uid, emoji]) => (
                      <span key={uid} className="text-xs bg-white/80 px-2 py-1 rounded-full shadow">{emoji}</span>
                    ))}
                  </div>
                )}

                {/* Long press to react/delete */}
                <button
                  onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                  className="absolute -right-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded-full shadow-md text-xs"
                >
                  +1
                </button>
                {msg.senderUid === user.uid && (
                  <button
                    onClick={() => deleteMessage(msg.id)}
                    className="absolute -left-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-100 p-1 rounded-full shadow-md text-xs text-red-600"
                  >
                    Trash
                  </button>
                )}
              </div>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-400'} mt-1 px-2`}>{formatMsgTime(msg.timestamp)}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`p-3 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white/80 border-pink-100'} border-t-2 backdrop-blur-sm`}>
        {isRecording && (
          <div className="mb-2 flex items-center justify-between bg-red-50 border border-red-200 rounded-xl p-2 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-red-600">Recording... {formatTime(recordingTime)}</span>
            </div>
            <button onClick={stopRecording} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg">Stop</button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={sending}
            className={`flex-1 px-4 py-3 border-2 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'border-pink-200'} rounded-2xl focus:ring-2 focus:ring-pink-300 focus:border-pink-300 text-sm outline-none disabled:bg-gray-50`}
          />
          <button onClick={sendMessage} disabled={sending || !newMessage.trim()} className="bg-gradient-to-r from-pink-500 to-purple-500 text-white px-6 py-3 rounded-2xl hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 font-semibold shadow-lg">
            {sending ? 'Hourglass' : 'Envelope'}
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={sending} className="text-pink-500 text-3xl hover:scale-110" title="Photo">Camera</button>
          <button onClick={() => setShowDrawing(true)} disabled={sending} className="text-purple-500 text-3xl hover:scale-110" title="Draw">Pencil</button>
          <button onClick={isRecording ? stopRecording : startRecording} disabled={sending} className={`text-3xl hover:scale-110 ${isRecording ? 'text-red-500 animate-pulse' : 'text-blue-500'}`} title="Voice">
            Microphone
          </button>
          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
        </div>
      </div>

      {/* Drawing Modal */}
      {showDrawing && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className={`rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h3 className="text-xl font-bold text-center mb-4">Draw Something!</h3>
            <canvas ref={canvasRef} width={400} height={400} className="border-4 border-pink-200 rounded-2xl cursor-crosshair mb-4 bg-white shadow-inner"
              onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
            />
            <div className="flex gap-2 mb-4 justify-center flex-wrap">
              {['#FF1493', '#FF69B4', '#9370DB', '#4169E1', '#000000', '#FFD700'].map(c => (
                <button key={c} onClick={() => setDrawColor(c)} className={`w-10 h-10 rounded-full border-4 transition-transform hover:scale-110 ${drawColor === c ? 'border-gray-800 scale-110' : 'border-gray-300'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={clearCanvas} className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-300 transition font-medium">Clear</button>
              <button onClick={() => setShowDrawing(false)} className="flex-1 bg-red-100 text-red-600 px-4 py-2 rounded-xl hover:bg-red-200 transition font-medium">Cancel</button>
              <button onClick={sendDrawing} disabled={sending} className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 font-semibold shadow-lg">
                {sending ? 'Hourglass' : 'Send Heart'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
        @keyframes wave { 0%, 100% { height: 8px; } 50% { height: 32px; } }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-wave { animation: wave 1s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default ChatRoom;