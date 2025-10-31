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

// REAL EMOJIS — NO TEXT NAMES
const CHAT_EMOJIS = ['thumbs up', 'red heart', 'face with tears of joy', 'loudly crying face', 'pleading face', 'thinking face'];

const CANVAS_EMOJIS = [
  'red heart', 'sparkles', 'fire', 'rose', 'kissing face', 'loudly crying face',
  'smiling face with heart-eyes', 'two hearts', 'glowing star', 'sparkling heart',
  'smiling face', 'smiling face with smiling eyes', 'kissing face with closed eyes', 'kiss mark',
  'crying face', 'grinning face with smiling eyes', 'pleading face', 'winking face',
  'smiling face with sunglasses', 'hugging face', 'cherry blossom', 'hibiscus',
  'rainbow', 'butterfly', 'crescent moon', 'star', 'dizzy', 'balloon', 'party popper'
];

// MAP TEXT → REAL EMOJI
const EMOJI_MAP = {
  'thumbs up': 'thumbs up',
  'red heart': 'red heart',
  'face with tears of joy': 'face with tears of joy',
  'loudly crying face': 'loudly crying face',
  'pleading face': 'pleading face',
  'thinking face': 'thinking face',
  'sparkles': 'sparkles',
  'fire': 'fire',
  'rose': 'rose',
  'kissing face': 'kissing face',
  'smiling face with heart-eyes': 'smiling face with heart-eyes',
  'two hearts': 'two hearts',
  'glowing star': 'glowing star',
  'sparkling heart': 'sparkling heart',
  'smiling face': 'smiling face',
  'smiling face with smiling eyes': 'smiling face with smiling eyes',
  'kissing face with closed eyes': 'kissing face with closed eyes',
  'kiss mark': 'kiss mark',
  'crying face': 'crying face',
  'grinning face with smiling eyes': 'grinning face with smiling eyes',
  'winking face': 'winking face',
  'smiling face with sunglasses': 'smiling face with sunglasses',
  'hugging face': 'hugging face',
  'cherry blossom': 'cherry blossom',
  'hibiscus': 'hibiscus',
  'rainbow': 'rainbow',
  'butterfly': 'butterfly',
  'crescent moon': 'crescent moon',
  'star': 'star',
  'dizzy': 'dizzy',
  'balloon': 'balloon',
  'party popper': 'party popper'
};

const ChatRoom = ({ user, onDisconnect }) => {
  console.log('FORCE PROOF: v2025.11.05 - REAL EMOJIS RENDERED');

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [userData, setUserData] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDrawing, setShowDrawing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCanvasEmojiPicker, setShowCanvasEmojiPicker] = useState(false);
  const [canvasBg, setCanvasBg] = useState('#ffffff');
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [placedEmojis, setPlacedEmojis] = useState([]);
  const [ctx, setCtx] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (showDrawing && canvasRef.current) {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = 4;
      setCtx(context);
      redrawCanvas();
    }
  }, [showDrawing, canvasBg, placedEmojis]);

  const redrawCanvas = () => {
    if (!ctx || !canvasRef.current) return;
    const canvas = canvasRef.current;
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    placedEmojis.forEach(item => {
      ctx.font = '30px serif';
      ctx.fillText(EMOJI_MAP[item.emoji] || item.emoji, item.x - 15, item.y + 10);
    });
  };

  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      if (!data?.coupleCode) onDisconnect();
    });
    return () => unsubscribe();
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
        sent: true,
        delivered: false,
        seen: false
      });
      setNewMessage('');
    } catch (err) {
      alert('Failed to send.');
    }
    setSending(false);
  };

  const addEmojiToCanvas = (emojiName) => {
    const emoji = EMOJI_MAP[emojiName] || emojiName;
    const newEmoji = { emoji: emojiName, x: 150, y: 150, id: Date.now() };
    setPlacedEmojis(prev => [...prev, newEmoji]);
    setShowCanvasEmojiPicker(false);
  };

  const addReaction = async (msgId, emojiName) => {
    const reactionRef = ref(database, `chats/${userData.coupleCode}/${msgId}/reactions/${user.uid}`);
    const snap = await onValue(reactionRef, s => s.val(), { onlyOnce: true });
    if (snap.val() === emojiName) {
      await remove(reactionRef);
    } else {
      await set(reactionRef, emojiName);
    }
  };

  const renderEmoji = (name) => EMOJI_MAP[name] || name;

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto rounded-3xl shadow-2xl border h-[90vh] overflow-hidden bg-white">
      {/* HEADER */}
      <div className="p-4 bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <UserCircleIcon className="w-12 h-12 text-white" />
            <div>
              <h2 className="font-bold text-lg text-white">Love Chat</h2>
              <p className="text-sm text-white">Ashley Onkendi</p>
            </div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}>
            <Cog6ToothIcon className="w-8 h-8 text-white" />
          </button>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.senderUid === user.uid ? 'items-end' : 'items-start'}`}>
            <div className={`px-4 py-3 rounded-3xl text-sm max-w-[75%] shadow-lg ${msg.senderUid === user.uid ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white' : 'bg-white text-gray-800 border border-pink-100'}`}>
              {msg.text && <p>{msg.text}</p>}
              {msg.reactions && Object.entries(msg.reactions).map(([uid, name]) => (
                <span key={uid} className="inline-block bg-white text-xs px-1.5 py-0.5 rounded-full shadow ml-1">
                  {renderEmoji(name)}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className="p-3 border-t-2 border-pink-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-2">
            <FaceSmileIcon className="w-6 h-6 text-gray-600" />
          </button>
          <input 
            type="text" 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)} 
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..." 
            className="flex-1 px-4 py-3 border-2 border-pink-200 rounded-2xl text-sm outline-none"
          />
          <button onClick={sendMessage} className="p-3 bg-gradient-to-r from-pink-500 to-purple-500 rounded-2xl">
            <PaperAirplaneIcon className="w-6 h-6 text-white" />
          </button>
          <button onClick={() => setShowDrawing(true)}>
            <PencilIcon className="w-8 h-8 text-purple-500" />
          </button>
        </div>

        {/* EMOJI PICKER */}
        {showEmojiPicker && (
          <div className="mt-2 bg-white p-3 rounded-2xl shadow-xl grid grid-cols-6 gap-2">
            {CHAT_EMOJIS.map(name => (
              <button
                key={name}
                onClick={() => {
                  setNewMessage(prev => prev + renderEmoji(name));
                  setShowEmojiPicker(false);
                }}
                className="text-2xl hover:scale-125 transition"
              >
                {renderEmoji(name)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DRAWING MODAL */}
      {showDrawing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold text-center mb-4">Draw Something Sweet!</h3>

            <canvas 
              ref={canvasRef} 
              width={300} 
              height={300} 
              className="border-2 border-pink-200 rounded-2xl mx-auto mb-4"
              style={{ backgroundColor: canvasBg }}
            />

            <button
              onClick={() => setShowCanvasEmojiPicker(!showCanvasEmojiPicker)}
              className="mx-auto flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl"
            >
              <FaceSmileIcon className="w-5 h-5" /> Add Emoji
            </button>

            {showCanvasEmojiPicker && (
              <div className="mt-2 bg-white p-3 rounded-2xl shadow-xl grid grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                {CANVAS_EMOJIS.map(name => (
                  <button
                    key={name}
                    onClick={() => addEmojiToCanvas(name)}
                    className="text-2xl hover:scale-125 transition"
                  >
                    {renderEmoji(name)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowDrawing(false)} className="flex-1 bg-red-100 text-red-600 px-4 py-2 rounded-xl">Cancel</button>
              <button onClick={() => setShowDrawing(false)} className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRoom;