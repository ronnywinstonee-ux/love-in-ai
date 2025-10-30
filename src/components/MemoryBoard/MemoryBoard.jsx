import React, { useState, useEffect } from 'react';
import { database } from '../../firebase';
import { ref, push, onValue, off, serverTimestamp, orderByChild, query } from 'firebase/database';

const MemoryBoard = ({ authMethod }) => {
  const [memories, setMemories] = useState([]);
  const [newMemory, setNewMemory] = useState('');
  const [loading, setLoading] = useState(true);

  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  const coupleCode = currentUser?.coupleCode;

  // Load memories from Firebase Realtime Database
  useEffect(() => {
    if (!coupleCode || !database) {
      setLoading(false);
      return;
    }

    console.log('📡 Loading memories from Firebase for couple:', coupleCode);

    const memoriesRef = ref(database, `couples/${coupleCode}/memories`);
    const memoriesQuery = query(memoriesRef, orderByChild('timestamp'));

    const unsubscribe = onValue(memoriesQuery, (snapshot) => {
      const memoriesData = snapshot.val();
      if (memoriesData) {
        const memoriesArray = Object.entries(memoriesData).map(([id, memory]) => ({
          id,
          ...memory
        })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Newest first
        
        setMemories(memoriesArray);
        console.log('✅ Loaded', memoriesArray.length, 'memories from Firebase');
      } else {
        setMemories([]);
        console.log('📭 No memories found in Firebase');
      }
      setLoading(false);
    }, (error) => {
      console.error('❌ Error loading memories from Firebase:', error);
      setLoading(false);
    });

    return () => {
      off(memoriesRef, 'value', unsubscribe);
    };
  }, [coupleCode]);

  const handleAddMemory = async (e) => {
    e.preventDefault();
    if (!newMemory.trim() || !coupleCode || !currentUser) return;

    const memoryText = newMemory.trim();
    setNewMemory('');
    setLoading(true);

    try {
      const memoriesRef = ref(database, `couples/${coupleCode}/memories`);
      
      await push(memoriesRef, {
        text: memoryText,
        authorId: currentUser.id,
        authorName: currentUser.name,
        timestamp: serverTimestamp(),
        type: 'text'
      });

      console.log('✅ Memory saved to Firebase');
    } catch (error) {
      console.error('❌ Error saving memory to Firebase:', error);
      alert('Failed to save memory. Please try again.');
      
      // Fallback to localStorage
      const fallbackMemory = {
        id: Date.now().toString(),
        text: memoryText,
        authorId: currentUser.id,
        authorName: currentUser.name,
        timestamp: new Date().toISOString(),
        type: 'text'
      };
      
      const storedMemories = JSON.parse(localStorage.getItem(`memories_${coupleCode}`)) || [];
      const updatedMemories = [...storedMemories, fallbackMemory];
      localStorage.setItem(`memories_${coupleCode}`, JSON.stringify(updatedMemories));
      setMemories(updatedMemories);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Recently';
    
    let date;
    if (timestamp && typeof timestamp === 'object' && timestamp.hasOwnProperty('seconds')) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'Recently';
    }
    
    return date.toLocaleDateString() + ' • ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading && memories.length === 0) {
    return (
      <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500">Loading memories...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-100">
      {/* Memory Board Header */}
      <div className="bg-white px-6 py-4 border-b border-gray-100 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Your Memory Board</h2>
            <p className="text-sm text-gray-500">
              Share special moments and memories • 
              <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                authMethod === 'firebase' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {authMethod === 'firebase' ? '🔥 Real-time' : '🔄 Mock'}
              </span>
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {memories.length} memory{memories.length !== 1 ? 'ies' : ''}
          </div>
        </div>
      </div>

      {/* Memory Creation */}
      <form onSubmit={handleAddMemory} className="p-6 border-b border-gray-100">
        <div className="flex space-x-4">
          <div className="flex-1">
            <textarea
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder="Share a special memory or moment..."
              rows="3"
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-transparent resize-none disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!newMemory.trim() || loading}
            className="px-6 py-3 bg-gradient-to-r from-blue-400 to-pink-400 text-white rounded-2xl font-medium hover:from-blue-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 self-start"
          >
            {loading ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>

      {/* Memories Grid */}
      <div className="p-6">
        {memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <div className="text-6xl mb-4">📝</div>
            <p className="text-lg font-medium">No memories yet</p>
            <p className="text-sm">Start sharing your special moments above!</p>
            <div className="mt-4 text-xs text-gray-400">
              {authMethod === 'firebase' ? 'Memories sync in real-time' : 'Using local storage'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="bg-gradient-to-br from-blue-50 to-pink-50 border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <p className="text-gray-800 mb-3">{memory.text}</p>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span className="font-medium flex items-center space-x-1">
                    <span>{memory.authorName === 'User 1' ? '👨' : '👩'}</span>
                    <span>{memory.authorName}</span>
                  </span>
                  <span>{formatDate(memory.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoryBoard;