import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, update } from 'firebase/database';
import { database } from '../../firebase';
import { uploadPhotoToCloudinary, uploadAudioToCloudinary } from '../../utils/cloudinaryUpload';

const ChatRoom = ({ user, onDisconnect }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [userData, setUserData] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 🧠 Load user data from Firebase
  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      console.log('👤 User data loaded:', data);

      // If no coupleCode, user got disconnected - kick them out
      if (!data?.coupleCode) {
        console.log('⚠️ No coupleCode - user disconnected');
        onDisconnect();
        return;
      }

      // Load partner data if connected
      if (data?.partnerUid) {
        const partnerRef = ref(database, `users/${data.partnerUid}`);
        onValue(partnerRef, (partnerSnap) => {
          const pData = partnerSnap.val();
          setPartnerData(pData);
          console.log('💑 Partner data loaded:', pData);
        });
      }
    });

    return () => unsubscribe();
  }, [user, onDisconnect]);

  // 💬 Load chat messages in real-time
  useEffect(() => {
    if (!userData?.coupleCode) {
      console.log('⚠️ No coupleCode found, waiting...');
      return;
    }

    console.log('📡 Listening to chat:', userData.coupleCode);
    const chatRef = ref(database, `chats/${userData.coupleCode}`);
    
    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      console.log('💬 Chat data received:', data);
      
      if (data) {
        const msgList = Object.entries(data).map(([key, val]) => ({
          id: key,
          ...val,
        })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgList);
        console.log('✅ Messages loaded:', msgList.length);
      } else {
        setMessages([]);
        console.log('📭 No messages yet');
      }
    });

    return () => unsubscribe();
  }, [userData?.coupleCode]);

  // ✉️ Send a text message
  const sendMessage = async () => {
    if (!newMessage.trim() || !userData?.coupleCode) {
      console.log('❌ Cannot send: missing message or coupleCode');
      return;
    }

    setSending(true);
    try {
      const chatRef = ref(database, `chats/${userData.coupleCode}`);
      const newMsgRef = push(chatRef);
      
      const messageData = {
        sender: userData.name || user.displayName || user.email,
        senderUid: user.uid,
        text: newMessage,
        imageUrl: '',
        audioUrl: '',
        timestamp: Date.now(),
      };

      console.log('📤 Sending message:', messageData);
      await set(newMsgRef, messageData);
      console.log('✅ Message sent successfully');
      
      setNewMessage('');
    } catch (err) {
      console.error('❌ Failed to send message:', err);
      alert('Failed to send message. Check console for details.');
    }
    setSending(false);
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 📸 Send an image message
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
        timestamp: Date.now(),
      });
      console.log('✅ Image message sent');
    } catch (err) {
      console.error('❌ Image upload failed:', err);
      alert('Failed to upload image. Check console.');
    }
    setSending(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 🎤 Record voice note
  const startRecording = async () => {
    if (!navigator.mediaDevices) {
      alert('Your browser does not support voice recording.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];

      mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
        setSending(true);
        try {
          console.log('🎤 Uploading voice note...');
          const url = await uploadAudioToCloudinary(audioBlob);
          console.log('✅ Audio uploaded:', url);
          
          const chatRef = ref(database, `chats/${userData.coupleCode}`);
          const newMsgRef = push(chatRef);
          await set(newMsgRef, {
            sender: userData.name || user.displayName || user.email,
            senderUid: user.uid,
            text: '',
            imageUrl: '',
            audioUrl: url,
            timestamp: Date.now(),
          });
          console.log('✅ Voice note sent');
        } catch (err) {
          console.error('❌ Audio upload failed:', err);
          alert('Failed to upload voice note. Check console.');
        }
        setSending(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      audioRef.current = mediaRecorder;
      alert('🎤 Recording started! (5 seconds max)');
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 5000);
    } catch (err) {
      console.error('❌ Recording error:', err);
      alert('Failed to start recording. Check microphone permissions.');
    }
  };

  // 💔 Handle disconnect
  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      '💔 Disconnect from your partner? You can reconnect with someone else after.'
    );
    if (!confirmed) return;

    try {
      const myRef = ref(database, `users/${user.uid}`);
      const partnerRef = ref(database, `users/${userData.partnerUid}`);

      // Clear connection for both users
      await update(myRef, { 
        coupleCode: '', 
        partnerUid: '',
        partnerName: '',
      });
      
      if (userData?.partnerUid) {
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
      alert('Failed to disconnect. Try again.');
    }
  };

  // 🕒 Format time (like 07:45 PM)
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  // 👇 UI Layout
  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 h-[90vh]">
      {/* Header with Settings */}
      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-blue-50">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-pink-600 font-semibold text-xl">💬 Chat Room</h2>
            {partnerData && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-gray-700 font-medium text-sm">{partnerData.name}</p>
                <p className={`text-xs font-medium ${partnerData.online ? 'text-green-500' : 'text-gray-400'}`}>
                  {partnerData.online ? '🟢 Online' : '⚪ Offline'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-2xl hover:scale-110 transition"
            title="Settings"
          >
            ⚙️
          </button>
        </div>

        {/* Settings Dropdown */}
        {showSettings && (
          <div className="mt-3 p-3 bg-white rounded-xl border border-gray-200 space-y-2">
            <div className="flex items-center justify-between pb-2 border-b">
              <div>
                <p className="text-xs text-gray-500">Your Code</p>
                <p className="text-sm font-bold text-pink-600">{userData?.userCode}</p>
              </div>
              <button
                className="text-xs bg-pink-500 text-white px-3 py-1 rounded-lg hover:bg-pink-600 transition"
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
              className="w-full text-sm px-3 py-2 border-2 border-red-300 text-red-500 rounded-lg hover:bg-red-50 transition font-medium"
            >
              💔 Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-pink-50 to-blue-50">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">
            <p className="text-4xl mb-2">💕</p>
            <p>No messages yet. Say hi to your partner!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.senderUid === user.uid ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`px-4 py-2 rounded-2xl text-sm max-w-[75%] shadow-sm ${
                  msg.senderUid === user.uid
                    ? 'bg-pink-500 text-white rounded-br-none'
                    : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'
                }`}
              >
                {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="sent"
                    className="mt-1 rounded-lg max-w-[250px] cursor-pointer hover:opacity-90"
                    onClick={() => window.open(msg.imageUrl, '_blank')}
                  />
                )}
                {msg.audioUrl && (
                  <audio controls className="mt-1 w-full max-w-[250px]">
                    <source src={msg.audioUrl} type="audio/mp3" />
                  </audio>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 px-1">{formatTime(msg.timestamp)}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-gray-200 bg-white flex items-center gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          disabled={sending}
          className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-300 text-sm outline-none disabled:bg-gray-50"
        />
        <button
          onClick={sendMessage}
          disabled={sending || !newMessage.trim()}
          className="bg-pink-500 text-white px-5 py-2 rounded-xl hover:bg-pink-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {sending ? '...' : 'Send'}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className="text-pink-500 text-2xl hover:scale-110 transition disabled:opacity-50"
          title="Send Image"
        >
          📸
        </button>
        <button
          onClick={startRecording}
          disabled={sending}
          className="text-pink-500 text-2xl hover:scale-110 transition disabled:opacity-50"
          title="Voice Note (5s)"
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
  );
};

export default ChatRoom;