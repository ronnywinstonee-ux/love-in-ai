import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { database } from '../../firebase';
import { uploadPhotoToCloudinary } from '../../utils/cloudinaryUpload';
import { 
  PhotoIcon, 
  PencilIcon, 
  MicrophoneIcon, 
  PaperAirplaneIcon, 
  Cog6ToothIcon,
  UserCircleIcon,
  FaceSmileIcon,
  CameraIcon
} from '@heroicons/react/24/outline';

// REAL EMOJIS — NOT TEXT
const EMOJIS = ['Thumbs Up', 'Red Heart', 'Face with Tears of Joy', 'Loudly Crying Face', 'Pleading Face', 'Thinking Face'];
// FIXED: Real Unicode emojis for sketch
const SKETCH_EMOJIS = ['Heart', 'Glowing Star', 'Fire', 'Rose', 'Kiss Mark', 'Smiling Face with Tear'];

const ChatRoom = ({ user, onDisconnect }) => {
  console.log('FORCE PROOF: v2025.11.02 - REAL EMOJIS + WHATSAPP TICKS + CLEAN SKETCH');

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
  const [darkMode, setDarkMode] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactingTo, setReactingTo] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [canvasBg, setCanvasBg] = useState('#ffffff');
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState('#FF1493');
  const [ctx, setCtx] = useState(null);
  const recordingTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const partnerTypingUnsubscribe = useRef(null);
  const streamRef = useRef(null);
  const touchStartX = useRef(0);
  const touchMsgId = useRef(null);

  const MAX_RECORDING_SECONDS = 240;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, partnerTyping]);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') setDarkMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (showDrawing && canvasRef.current) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 4;
      setCtx(context);

      context.fillStyle = canvasBg;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [showDrawing, canvasBg]);

  useEffect(() => {
    if (!user) return;

    const userRef = ref(database, `users/${user.uid}`);
    const userUnsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);

      if (!data?.coupleCode) {
        onDisconnect();
        return;
      }

      if (partnerTypingUnsubscribe.current) {
        partnerTypingUnsubscribe.current();
      }

      if (data?.partnerUid) {
        const partnerRef = ref(database, `users/${data.partnerUid}`);
        const partnerUnsubscribe = onValue(partnerRef, (snap) => {
          const pData = snap.val();
          setPartnerData(pData);

          const typingRef = ref(database, `typing/${data.coupleCode}/${data.partnerUid}`);
          partnerTypingUnsubscribe.current = onValue(typingRef, (tSnap) => {
            setPartnerTyping(!!tSnap.val());
          });
        });
        return () => partnerUnsubscribe();
      }
    });

    return () => {
      userUnsubscribe();
      if (partnerTypingUnsubscribe.current) partnerTypingUnsubscribe.current();
    };
  }, [user, onDisconnect]);

  useEffect(() => {
    if (!userData?.coupleCode) return;

    const chatRef = ref(database, `chats/${userData.coupleCode}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgList = Object.entries(data)
          .map(([key, val]) => ({ id: key, ...val }))
          .sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgList);
      } else {
        setMessages([]);
      }
    });
    return () => unsubscribe();
  }, [userData?.coupleCode]);

  useEffect(() => {
    if (!messages.length || !partnerData?.online) return;
    messages.forEach(msg => {
      if (msg.senderUid === user.uid && msg.sent && !msg.delivered) {
        update(ref(database, `chats/${userData.coupleCode}/${msg.id}`), { delivered: true });
      }
    });
  }, [messages, partnerData?.online, user.uid, userData?.coupleCode]);

  useEffect(() => {
    if (!messages.length || !partnerData?.online) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.senderUid !== user.uid && !lastMsg.seen) {
      update(ref(database, `chats/${userData.coupleCode}/${lastMsg.id}`), { seen: true });
    }
  }, [messages, partnerData?.online, user.uid, userData?.coupleCode]);

  useEffect(() => {
    if (!userData?.coupleCode || !user?.uid || !newMessage.trim()) {
      if (userData?.coupleCode && user?.uid) {
        const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
        set(typingRef, null);
      }
      return;
    }

    const typingRef = ref(database, `typing/${userData.coupleCode}/${user.uid}`);
    set(typingRef, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => set(typingRef, null), 1500);
  }, [newMessage, userData?.coupleCode, user?.uid]);

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
        replyTo: replyTo ? { text: replyTo.text, sender: replyTo.sender } : null,
        sent: true,
        delivered: false,
        seen: false
      });
      setNewMessage('');
      setReplyTo(null);
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
        sender: userData.name || user.displayName || user.email,
        senderUid: user.uid,
        text: '',
        imageUrl: url,
        audioUrl: '',
        drawingUrl: '',
        reactions: {},
        timestamp: Date.now(),
        sent: true,
        delivered: false,
        seen: false
      });
    } catch (err) {
      alert('Image failed.');
    }
    setSending(false);
    fileInputRef.current.value = '';
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadPhotoToCloudinary(file);
      await update(ref(database, `users/${user.uid}`), { photoURL: url });
      alert('Avatar updated!');
    } catch (err) {
      alert('Failed to update avatar.');
    }
    setUploadingAvatar(false);
  };

  const startRecording = async () => { /* SAME */ };
  const stopAndSendRecording = () => { /* SAME */ };
  const cancelRecording = () => { /* SAME */ };

  const formatTime = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  const formatMsgTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const startDrawing = (e) => { 
    if (!ctx) return; 
    setIsDrawing(true); 
    const r = canvasRef.current.getBoundingClientRect(); 
    ctx.beginPath(); 
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top); 
  };
  const draw = (e) => { 
    if (!isDrawing || !ctx) return; 
    const r = canvasRef.current.getBoundingClientRect(); 
    ctx.strokeStyle = drawColor; 
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top); 
    ctx.stroke(); 
  };
  const stopDrawing = () => setIsDrawing(false);
  const clearCanvas = () => {
    if (!ctx) return;
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  // FIXED: Use real emoji, not text
  const drawEmoji = (emoji, x, y) => { 
    if (!ctx) return;
    ctx.font = '30px serif'; 
    ctx.fillText(emoji, x, y); 
  };

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
          sent: true,
          delivered: false,
          seen: false
        });
        setShowDrawing(false);
        clearCanvas();
      } catch (err) { alert('Drawing failed.'); }
      setSending(false);
    }, 'image/png');
  };

  const addReaction = async (msgId, emoji) => {
    const reactionRef = ref(database, `chats/${userData.coupleCode}/${msgId}/reactions/${user.uid}`);
    const snap = await onValue(reactionRef, s => s.val(), { onlyOnce: true });
    if (snap.val() === emoji) {
      await remove(reactionRef);
    } else {
      await set(reactionRef, emoji);
    }
    setReactingTo(null);
  };

  const deleteMessage = async (msgId) => {
    if (!window.confirm('Delete?')) return;
    await remove(ref(database, `chats/${userData.coupleCode}/${msgId}`));
  };

  const handleTouchStart = (e, msgId) => {
    touchStartX.current = e.touches[0].clientX;
    touchMsgId.current = msgId;
  };

  const handleTouchEnd = (e) => {
    if (!touchMsgId.current) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (deltaX < -50) {
      const msg = messages.find(m => m.id === touchMsgId.current);
      if (msg) setReplyTo({ text: msg.text || '[Media]', sender: msg.sender });
    }
    touchMsgId.current = null;
  };

  const VoiceMessage = ({ msg }) => { /* SAME */ };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect?')) return;
    await update(ref(database, `users/${user.uid}`), { coupleCode: '', partnerUid: '', partnerName: '' });
    if (userData?.partnerUid) {
      await update(ref(database, `users/${userData.partnerUid}`), { coupleCode: '', partnerUid: '', partnerName: '' });
    }
    onDisconnect();
  };

  // FIXED: WhatsApp-style ticks
  const OneTick = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" className="text-gray-400">
      <path d="M2 8 L6 12 L14 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );

  const TwoGrayTicks = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" className="text-gray-400">
      <path d="M2 8 L6 12 L14 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M8 8 L12 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );

  const TwoBlueTicks = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" className="text-blue-500">
      <path d="M2 8 L6 12 L14 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M8 8 L12 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );

  if (!userData?.coupleCode) {
    return <div className="flex items-center justify-center h-full"><div className="text-center"><div className="w-10 h-10 border-4 border-pink-300 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p>Loading...</p></div></div>;
  }

  return (
    <div className={`flex flex-col w-full max-w-2xl mx-auto rounded-3xl shadow-2xl border h-[90vh] overflow-hidden ${darkMode ? 'bg-gray-900 text-white border-gray-700' : 'bg-white text-gray-800 border-pink-100'}`}>
      {/* HEADER */}
      <div className={`p-4 ${darkMode ? 'bg-gray-800' : 'bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400'} relative overflow-hidden`}>
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {partnerData?.photoURL ? (
              <img src={partnerData.photoURL} className="w-12 h-12 rounded-full object-cover shadow-lg" alt="Partner" />
            ) : (
              <UserCircleIcon className="w-12 h-12 text-white" />
            )}
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
          <button onClick={() => setShowSettings(!showSettings)} className="hover:scale-110 transition-transform">
            <Cog6ToothIcon className="w-8 h-8 text-white" />
          </button>
        </div>

        {showSettings && (
          <div className={`mt-3 p-4 ${darkMode ? 'bg-gray-700' : 'bg-white/95'} backdrop-blur-sm rounded-2xl shadow-xl space-y-4`}>
            <div className="flex items-center gap-4 pb-3 border-b ${darkMode ? 'border-gray-600' : 'border-pink-100'}">
              <div className="relative">
                {userData?.photoURL ? (
                  <img src={userData.photoURL} className="w-16 h-16 rounded-full object-cover" alt="You" />
                ) : (
                  <UserCircleIcon className="w-16 h-16 text-gray-400" />
                )}
                <label className="absolute bottom-0 right-0 bg-pink-500 p-1.5 rounded-full cursor-pointer hover:bg-pink-600 transition">
                  <CameraIcon className="w-4 h-4 text-white" />
                  <input type="file" accept="image/*" ref={avatarInputRef} className="hidden" onChange={handleAvatarUpload} />
                </label>
              </div>
              <div>
                <p className="font-medium">{userData?.name || 'You'}</p>
                <p className="text-xs text-gray-500">Tap to change photo</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Dark Mode</span>
              <button onClick={() => setDarkMode(!darkMode)} className={`w-12 h-6 rounded-full ${darkMode ? 'bg-purple-600' : 'bg-gray-300'} p-1 transition-all`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${darkMode ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            <div className="flex items-center justify-between pb-3 border-b ${darkMode ? 'border-gray-600' : 'border-pink-100'}">
              <div>
                <p className="text-xs text-gray-500 font-medium">Your Code</p>
                <p className="text-lg font-bold text-pink-600">{userData?.userCode}</p>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(userData.userCode); alert('Copied!'); }} className="text-sm bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 transition-all shadow-md">
                Copy
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

        {replyTo && (
          <div className={`mb-2 p-2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} text-xs`}>
            Replying to: <span className="font-medium">{replyTo.sender}</span> — {replyTo.text}
            <button onClick={() => setReplyTo(null)} className="ml-2 text-red-500">x</button>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.senderUid === user.uid ? 'items-end' : 'items-start'} group`}
            onTouchStart={(e) => handleTouchStart(e, msg.id)}
            onTouchEnd={handleTouchEnd}
            onMouseDown={() => setReactingTo(msg.id)}
            onMouseUp={() => setTimeout(() => setReactingTo(null), 300)}
          >
            <div className={`px-4 py-3 rounded-3xl text-sm max-w-[75%] shadow-lg ${msg.senderUid === user.uid ? (darkMode ? 'bg-purple-600 text-white' : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white') : (darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-800 border border-pink-100')} relative`}>
              {msg.replyTo && (
                <div className={`text-xs opacity-70 mb-1 ${msg.senderUid === user.uid ? 'text-pink-200' : 'text-gray-500'}`}>
                  ↳ {msg.replyTo.sender}: {msg.replyTo.text}
                </div>
              )}
              {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
              {msg.imageUrl && <img src={msg.imageUrl} className="mt-1 rounded-2xl max-w-[250px] cursor-pointer" onClick={() => window.open(msg.imageUrl, '_blank')} />}
              {msg.drawingUrl && <img src={msg.drawingUrl} className="mt-1 rounded-2xl max-w-[250px] border-2 border-dashed border-pink-300" onClick={() => window.open(msg.drawingUrl, '_blank')} />}
              {msg.audioUrl && <VoiceMessage msg={msg} />}
              {msg.reactions && Object.entries(msg.reactions).map(([uid, emoji]) => (
                <span key={uid} className="inline-block bg-white text-xs px-1.5 py-0.5 rounded-full shadow ml-1">{emoji}</span>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
              <span>{formatMsgTime(msg.timestamp)}</span>
              {msg.senderUid === user.uid && (
                <div className="flex items-center">
                  {msg.sent && !msg.delivered && <OneTick />}
                  {msg.delivered && !msg.seen && <TwoGrayTicks />}
                  {msg.seen && <TwoBlueTicks />}
                </div>
              )}
            </div>

            {reactingTo === msg.id && (
              <div className="flex gap-1 mt-1 bg-white p-1 rounded-full shadow-lg">
                {EMOJIS.map(emoji => (
                  <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="text-lg hover:scale-125 transition">
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className={`p-3 border-t-2 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white/80 border-pink-100'} backdrop-blur-sm relative`}>
        {isRecording && (
          <div className="mb-3 flex items-center justify-between bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-2xl p-3 shadow-lg animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-white rounded-full animate-ping"></div>
              <span className="font-bold text-sm">Recording... {formatTime(recordingTime)} / 4:00</span>
            </div>
            <div className="flex gap-2">
              <button onClick={cancelRecording} className="bg-white text-red-600 px-3 py-1.5 rounded-xl font-bold text-xs hover:bg-red-100 transition">Cancel</button>
              <button onClick={stopAndSendRecording} className="bg-white text-green-600 px-3 py-1.5 rounded-xl font-bold text-xs hover:bg-green-100 transition">Send</button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-2">
            <FaceSmileIcon className={`w-6 h-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
          <input 
            type="text" 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)} 
            onKeyPress={handleKeyPress} 
            placeholder="Type a message..." 
            disabled={sending || isRecording}
            className={`flex-1 px-4 py-3 border-2 rounded-2xl text-sm outline-none transition-all ${darkMode ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400' : 'border-pink-200 bg-white text-gray-800 placeholder-gray-500'} focus:ring-2 focus:ring-pink-300 focus:border-pink-300 ${sending || isRecording ? 'opacity-50' : ''}`}
          />
          <button onClick={sendMessage} disabled={sending || !newMessage.trim() || isRecording} className={`p-3 rounded-2xl transition-all ${sending || !newMessage.trim() || isRecording ? 'opacity-50 cursor-not-allowed' : 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 hover:scale-105 shadow-lg'}`}>
            <PaperAirplaneIcon className="w-6 h-6 text-white" />
          </button>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
            <PhotoIcon className={`w-8 h-8 transition-transform ${sending || isRecording ? 'text-gray-400' : 'text-pink-500 hover:scale-110'}`} />
          </label>
          <button onClick={() => setShowDrawing(true)} disabled={sending || isRecording} className={`transition-transform ${sending || isRecording ? 'opacity-50' : 'hover:scale-110'}`}>
            <PencilIcon className={`w-8 h-8 ${sending || isRecording ? 'text-gray-400' : 'text-purple-500'}`} />
          </button>
          <button onClick={isRecording ? stopAndSendRecording : startRecording} disabled={sending} className={`transition-transform ${sending ? 'opacity-50' : ''} ${isRecording ? 'animate-pulse' : ''}`}>
            <MicrophoneIcon className={`w-8 h-8 ${isRecording ? 'text-red-500' : sending ? 'text-gray-400' : 'text-blue-500'} ${!sending && 'hover:scale-110'}`} />
          </button>
        </div>

        {showEmojiPicker && (
          <div className="absolute bottom-16 left-4 bg-white p-3 rounded-2xl shadow-xl grid grid-cols-6 gap-2">
            {EMOJIS.map(emoji => (
              <button key={emoji} onClick={() => { setNewMessage(prev => prev + emoji); setShowEmojiPicker(false); }} className="text-2xl hover:scale-125 transition">
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DRAWING MODAL */}
      {showDrawing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-3xl p-6 shadow-2xl max-w-md w-full ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h3 className="text-xl font-bold text-center mb-4">Draw Something Sweet!</h3>
            
            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Background Color</p>
              <div className="flex gap-2 justify-center">
                {['#ffffff', '#ffe4e1', '#e6e6fa', '#f0fff0', '#fffacd', '#d3d3d3'].map(color => (
                  <button
                    key={color}
                    onClick={() => setCanvasBg(color)}
                    className={`w-8 h-8 rounded-full border-2 ${canvasBg === color ? 'border-black scale-110' : 'border-gray-300'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <canvas ref={canvasRef} width={300} height={300} className="border-2 border-pink-200 rounded-2xl cursor-crosshair mb-4 block mx-auto shadow-inner" style={{ backgroundColor: canvasBg }} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} />
            
            <div className="flex gap-2 justify-center mb-4">
              {['#FF1493', '#FF69B4', '#9370DB', '#4169E1', '#000000', '#FFD700'].map(c => (
                <button key={c} onClick={() => setDrawColor(c)} className={`w-8 h-8 rounded-full border-2 ${drawColor === c ? 'border-black scale-110' : 'border-gray-300'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            
            <div className="flex gap-1 justify-center mb-4">
              {SKETCH_EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => drawEmoji(emoji, 50 + SKETCH_EMOJIS.indexOf(emoji) * 40, 50)} className="text-2xl hover:scale-125 transition">
                  {emoji}
                </button>
              ))}
            </div>
            
            <div className="flex gap-2">
              <button onClick={clearCanvas} className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-300 transition font-medium">Clear</button>
              <button onClick={() => setShowDrawing(false)} className="flex-1 bg-red-100 text-red-600 px-4 py-2 rounded-xl hover:bg-red-200 transition font-medium">Cancel</button>
              <button onClick={sendDrawing} disabled={sending} className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 font-semibold shadow-lg">
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRoom;