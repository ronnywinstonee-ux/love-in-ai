import React, { useState, useRef } from 'react';
import { uploadAudioToCloudinary } from '../../utils/cloudinary';

const VoiceRecorder = ({ onSend }) => {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const intervalRef = useRef(null);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.current = new MediaRecorder(stream);
    audioChunks.current = [];

    mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);

    mediaRecorder.current.onstop = async () => {
      const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
      const url = await uploadAudioToCloudinary(blob);
      onSend(url, duration);
      stream.getTracks().forEach((t) => t.stop());
    };

    mediaRecorder.current.start();
    setRecording(true);
    setDuration(0);
    intervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorder.current.stop();
    setRecording(false);
    clearInterval(intervalRef.current);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={recording ? stopRecording : startRecording}
        className={`px-3 py-2 rounded-full text-white font-semibold transition text-sm ${
          recording ? 'bg-red-500' : 'bg-blue-500 hover:bg-blue-600'
        }`}
      >
        {recording ? '⏹️' : '🎤'}
      </button>
      {recording && <span className="text-xs text-gray-600">{duration}s</span>}
    </div>
  );
};

export default VoiceRecorder;