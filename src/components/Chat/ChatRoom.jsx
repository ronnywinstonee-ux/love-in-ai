import React, { useEffect, useState, useRef } from "react";
import { ref, push, onValue, serverTimestamp } from "firebase/database";
import { database } from "../../firebase";
import MessageBubble from "./MessageBubble";
import { uploadPhotoToCloudinary, uploadAudioToCloudinary } from "../../utils/cloudinary";

const ChatRoom = ({ user }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [coupleCode, setCoupleCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const bottomRef = useRef(null);

  // Load couple code
  useEffect(() => {
    const userRef = ref(database, `users/${user.uid}`);
    onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data?.coupleCode) setCoupleCode(data.coupleCode);
    });
  }, [user]);

  // Load chat messages
  useEffect(() => {
    if (!coupleCode) return;

    const messagesRef = ref(database, `couples/${coupleCode}/messages`);
    onValue(messagesRef, (snapshot) => {
      const msgs = [];
      snapshot.forEach((child) => msgs.push({ id: child.key, ...child.val() }));
      setMessages(msgs.sort((a, b) => a.timestamp - b.timestamp));
      setLoading(false);
    });
  }, [coupleCode]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send text message
  const sendMessage = async () => {
    if (!input.trim()) return;
    const messagesRef = ref(database, `couples/${coupleCode}/messages`);
    await push(messagesRef, {
      senderId: user.uid,
      text: input.trim(),
      type: "text",
      timestamp: Date.now(),
    });
    setInput("");
  };

  // Handle photo upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const photoUrl = await uploadPhotoToCloudinary(file);
      const messagesRef = ref(database, `couples/${coupleCode}/messages`);
      await push(messagesRef, {
        senderId: user.uid,
        photoUrl,
        type: "photo",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Photo upload failed:", error);
      alert("Failed to upload photo 😢");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Handle voice message recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      setAudioChunks([]);
      recorder.start();
      setRecording(true);

      recorder.ondataavailable = (event) => {
        setAudioChunks((prev) => [...prev, event.data]);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        try {
          const audioUrl = await uploadAudioToCloudinary(blob);
          const messagesRef = ref(database, `couples/${coupleCode}/messages`);
          await push(messagesRef, {
            senderId: user.uid,
            audioUrl,
            type: "voice",
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error("Audio upload failed:", error);
          alert("Failed to upload voice message 😢");
        }
      };
    } catch (error) {
      console.error("Microphone error:", error);
      alert("Please allow microphone access.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-pink-400 to-blue-400 text-white px-5 py-3 text-lg font-semibold flex justify-between items-center">
        <span>💬 Chat Room</span>
        {uploadingPhoto && <span className="text-sm opacity-80">Uploading photo…</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-br from-pink-50 via-white to-blue-50">
        {loading ? (
          <p className="text-center text-gray-400 mt-10">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-400 mt-10">
            No messages yet. Say hi 👋
          </p>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwnMessage={msg.senderId === user.uid}
              coupleCode={coupleCode}
              currentUserId={user.uid}
            />
          ))
        )}
        <div ref={bottomRef}></div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-3 flex items-center gap-2 bg-white">
        <label
          htmlFor="photoInput"
          className="cursor-pointer text-pink-500 text-xl hover:text-pink-600 transition"
          title="Send photo"
        >
          📸
        </label>
        <input
          id="photoInput"
          type="file"
          accept="image/*"
          onChange={handlePhotoUpload}
          className="hidden"
        />

        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          className={`text-xl ${recording ? "text-red-500" : "text-blue-500"} transition`}
          title="Hold to record voice"
        >
          🎤
        </button>

        <input
          type="text"
          placeholder="Type your message..."
          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-pink-200 outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />

        <button
          onClick={sendMessage}
          className="bg-gradient-to-r from-blue-400 to-pink-400 text-white px-4 py-2 rounded-xl hover:from-blue-500 hover:to-pink-500 transition-all duration-200 text-sm font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatRoom;
