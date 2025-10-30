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

  console.log('NEW CHATROOM LOADED - DARK MODE:', darkMode); // PROOF

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

  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      console.log('USER DATA LOADED:', data);

      if (!data?.coupleCode) {
        console.log('NO COUPLECODE - DISCONNECTING');
        onDisconnect();
        return;
      }

      if (data?.partnerUid) {
        const partnerRef = ref(database, `users/${data.partnerUid}`);
        onValue(partnerRef, (snap) => {
          const pData = snap.val();
          setPartnerData(pData);
          console.log('PARTNER DATA:', pData);

          const typingRef = ref(database, `typing/${data.coupleCode}/${data.partnerUid}`);
          onValue(typingRef, (tSnap) => {
            const isTyping = !!tSnap.val();
            setPartnerTyping(isTyping);
            console.log('PARTNER TYPING:', isTyping);
          });
        });
      }
    });
    return () => unsubscribe();
  }, [user, onDisconnect]);

  useEffect(() => {
    if (!userData?.coupleCode) return;
    console.log('LISTENING TO CHAT:', userData.coupleCode);
    const chatRef = ref(database, `chats/${userData.coupleCode}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgList = Object.entries(data)
          .map(([key, val]) => ({ id: key, ...val }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgList);
        console.log('MESSAGES LOADED:', msgList.length);
      } else {
        setMessages([]);
      }
    });
    return () => unsubscribe();
  }, [userData?.coupleCode]);

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
      console.log('TEXT SENT');
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

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !userData?.coupleCode) return;
    setSending(true);
    try {
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
    } catch (err) {
      alert('Image failed.');
    }
    setSending(false);
    fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      console.log('RECORDING WITH MIME:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        console.log('BLOB SIZE:', blob.size);
        setSending(true);
        try {
          const url = await uploadAudioToCloudinary(blob);
          console.log('AUDIO UPLOADED:', url);
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
          console.log('VOICE NOTE SENT');
        } catch (err) {
          alert('Voice note failed.');
        }
        setSending(false);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      setTimeout(() => mediaRecorder.state === 'recording' && mediaRecorder.stop(), 180000);
    } catch (err) {
      alert('Mic denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const formatTime = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  const formatMsgTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
      } catch (err) { alert('Drawing failed.'); }
      setSending(false);
    }, 'image/png');
  };

  const addReaction = async (msgId, emoji) => {
    const msgRef = ref(database, `chats/${userData.coupleCode}/${msgId}/reactions/${user.uid}`);
    const snap = await onValue(msgRef, s => s.val());
    if (snap.val() === emoji) {
      await remove(msgRef);
    } else {
      await set(msgRef, emoji);
    }
    setShowReactionPicker(null);
  };

  const deleteMessage = async (msgId) => {
    if (!window.confirm('Delete message?')) return;
    await remove(ref(database, `chats/${userData.coupleCode}/${msgId}`));
  };

  const VoiceMessage = ({ msg }) => {
    const audioRef = useRef(null);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.addEventListener('loadedmetadata', () => {
        setDuration(Math.floor(audio.duration));
        console.log('AUDIO DURATION:', audio.duration);
      });
      audio.addEventListener('error', (e) => console.error('AUDIO ERROR:', e));
    }, [msg.audioUrl]);

    const togglePlay = () => {
      const audio = audioRef.current;
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
        setPlayingAudio(msg.id);
      }
      setIsPlaying(!isPlaying);
    };

    return (
      <div className={`flex items-center gap-3 p-3 rounded-2xl max-w-[280px] ${msg.senderUid === user.uid ? 'bg-pink-100' : 'bg-white border border-pink-200'}`}>
        <button onClick={togglePlay} className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${isPlaying ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-purple-500'}`}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div className="flex-1">
          <div className="flex items-end gap-0.5 h-6">
            {[...Array(15)].map((_, i) => (
              <div key={i} className={`w-0.5 rounded-full bg-pink-400 ${isPlaying ? 'animate-ping' : ''}`} style={{ height: isPlaying ? `${20 + Math.random() * 20}px` : '12px', animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          <p className="text-xs text-gray-500">{duration ? formatTime(duration) : '0:00'}</p>
        </div>
        <audio ref={audioRef} src={msg.audioUrl} preload="metadata" />
      </div>
    );
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect?')) return;
    await update(ref(database, `users/${user.uid}`), { coupleCode: '', partnerUid: '', partnerName: '' });
    if (userData?.partnerUid) {
      await update(ref(database, `users/${userData.partnerUid}`), { coupleCode: '', partnerUid: '', partnerName: '' });
    }
    onDisconnect();
  };

  if (!userData?.coupleCode) {
    return <div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-10 h-10 border-4 border-pink-300 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p>Loading...</p></div></div>;
  }

  return (
    <div className={`flex flex-col w-full max-w-2xl mx-auto rounded-3xl shadow-2xl border h-[90vh] overflow-hidden ${darkMode ? 'bg-gray-900 text-white border-gray-700' : 'bg-white text-gray-800 border-pink-100'}`}>
      {/* HEADER */}
      <div className={`p-4 ${darkMode ? 'bg-gray-800' : 'bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400'} relative overflow-hidden`}>
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 ${darkMode ? 'bg-gray-700' : 'bg-white'} rounded-full flex items-center justify-center text-2xl shadow-lg`}>Heart</div>
            <div>
              <h2 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-white drop-shadow-lg'}`}>Love Chat</h2>
              {partnerData && (
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-white drop-shadow'}`}>{partnerData.name}</p>
                  <div className={`w-2 h-2 rounded-full ${partnerData.online ? 'bg-green-300' : 'bg-gray-300'} animate-pulse`}></div>
                </div>
              )}
            </div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className={`text-3xl hover:scale-110 ${darkMode ? 'text-white' : 'text-white'}`}>Settings</button>
        </div>

        {showSettings && (
          <div className={`mt-3 p-4 ${darkMode ? 'bg-gray-700' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl space-y-3`}>
            <div className="flex items-center justify-between pb-3 border-b ${darkMode ? 'border-gray-600' : 'border-pink-100'}">
              <div>
                <p className="text-xs text-gray-500 font-medium">Your Code</p>
                <p className="text-lg font-bold text-pink-600">{userData?.userCode}</p>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(userData.userCode); alert('Copied!'); }} className="text-sm bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 transition-all shadow-md">
                Copy
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Dark Mode</span>
              <button onClick={() => setDarkMode(!darkMode)} className={`w-12 h-6 rounded-full ${darkMode ? 'bg-purple-600' : 'bg-gray-300'} p-1 transition-all`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${darkMode ? 'translate-x-6' : ''}`} />
              </button>
            </div>
            <button onClick={handleDisconnect} className="w-full text-sm px-4 py-2 border-2 border-red-300 text-red-500 rounded-xl hover:bg-red-50 transition-all font-medium">
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* MESSAGES */}
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

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.senderUid === user.uid ? 'items-end' : 'items-start'} group`}>
            <div className={`px-4 py-3 rounded-3xl text-sm max-w-[75%] shadow-lg ${msg.senderUid === user.uid ? (darkMode ? 'bg-purple-600 text-white' : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white') : (darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-800 border border-pink-100')} relative`}>
              {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
              {msg.imageUrl && <img src={msg.imageUrl} className="mt-1 rounded-2xl max-w-[250px] cursor-pointer" onClick={() => window.open(msg.imageUrl, '_blank')} />}
              {msg.drawingUrl && <img src={msg.drawingUrl} className="mt-1 rounded-2xl max-w-[250px] border-2 border-dashed border-pink-300" onClick={() => window.open(msg.drawingUrl, '_blank')} />}
              {msg.audioUrl && <VoiceMessage msg={msg} />}
              {msg.reactions && Object.values(msg.reactions).map((e, i) => <span key={i} className="ml-1">{e}</span>)}
              <button onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)} className="absolute -right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-white p-1 rounded-full shadow-md text-xs">+1</button>
              {msg.senderUid === user.uid && <button onClick={() => deleteMessage(msg.id)} className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-red-100 p-1 rounded-full shadow-md text-xs text-red-600">Trash</button>}
            </div>
            <p className="text-xs text-gray-400 mt-1 px-2">{formatMsgTime(msg.timestamp)}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className={`p-3 border-t-2 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white/80 border-pink-100'} backdrop-blur-sm`}>
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
          <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={handleKeyPress} placeholder="Type..." disabled={sending} className={`flex-1 px-4 py-3 border-2 rounded-2xl text-sm outline-none ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'border-pink-200'} focus:ring-2 focus:ring-pink-300`} />
          <button onClick={sendMessage} disabled={sending || !newMessage.trim()} className="bg-gradient-to-r from-pink-500 to-purple-500 text-white px-6 py-3 rounded-2xl hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 font-semibold shadow-lg">
            {sending ? 'Hourglass' : 'Envelope'}
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={sending} className="text-pink-500 text-3xl hover:scale-110" title="Photo">Camera</button>
          <button onClick={() => setShowDrawing(true)} disabled={sending} className="text-purple-500 text-3xl hover:scale-110" title="Draw">Pencil</button>
          <button onClick={isRecording ? stopRecording : startRecording} disabled={sending} className={`text-3xl hover:scale-110 ${isRecording ? 'text-red-500 animate-pulse' : 'text-blue-500'}`} title="Voice">Microphone</button>
          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
        </div>
      </div>

      {/* REACTION PICKER */}
      {showReactionPicker && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50" onClick={() => setShowReactionPicker(null)}>
          <div className="bg-white p-3 rounded-full shadow-lg flex gap-2" onClick={(e) => e.stopPropagation()}>
            {['Heart', 'Laugh', 'Cry', 'Angry', 'Thumbs Up'].map(e => (
              <button key={e} onClick={() => addReaction(showReactionPicker, e)} className="text-2xl hover:scale-125 transition-transform">{e}</button>
            ))}
          </div>
        </div>
      )}

      {/* DRAWING MODAL */}
      {showDrawing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-3xl p-6 shadow-2xl max-w-md w-full ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h3 className="text-xl font-bold text-center mb-4">Draw!</h3>
            <canvas ref={canvasRef} width={300} height={300} className="border-2 border-pink-200 rounded-2xl cursor-crosshair mb-4 block mx-auto bg-white shadow-inner" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} />
            <div className="flex gap-2 justify-center mb-4">
              {['#FF1493', '#FF69B4', '#9370DB', '#4169E1', '#000000', '#FFD700'].map(c => (
                <button key={c} onClick={() => setDrawColor(c)} className={`w-8 h-8 rounded-full border-2 ${drawColor === c ? 'border-black scale-110' : 'border-gray-300'}`} style={{ backgroundColor: c }} />
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
    </div>
  );
};

export default ChatRoom;