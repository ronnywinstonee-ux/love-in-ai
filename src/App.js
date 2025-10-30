import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, database } from './firebase';
import { ref, get } from 'firebase/database';
import ConnectionPanel from './components/Connection/ConnectionPanel';
import ChatRoom from './components/Chat/ChatRoom';

const App = () => {
  const [user, setUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const provider = new GoogleAuthProvider();

  // Handle Firebase authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user already has a couple connection
        const userRef = ref(database, `users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        const data = snapshot.val();

        if (data && data.coupleCode && data.partnerUid) {
          setConnected(true);
        } else {
          setConnected(false);
        }
      } else {
        setConnected(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setConnected(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        <div className="w-10 h-10 border-4 border-pink-300 border-t-transparent rounded-full animate-spin mr-3"></div>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center bg-gradient-to-br from-pink-50 to-blue-50">
        <h1 className="text-3xl font-bold text-pink-600 mb-4">💞 Welcome to AshWin Chat</h1>
        <p className="text-gray-600 mb-6">Connect privately and chat with your special person 💕</p>
        <button
          onClick={handleLogin}
          className="bg-gradient-to-r from-blue-400 to-pink-400 text-white px-6 py-3 rounded-2xl shadow-md hover:from-blue-500 hover:to-pink-500 transition-all duration-200 font-medium"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-50 flex flex-col">
      <header className="flex justify-between items-center p-4 border-b border-gray-100 shadow-sm bg-white">
        <h1 className="text-xl font-semibold text-pink-500">AshWin 💕</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600">{user.displayName}</p>
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1 border border-pink-300 text-pink-500 rounded-xl hover:bg-pink-50 transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        {!connected ? (
          <ConnectionPanel user={user} onConnected={() => setConnected(true)} />
        ) : (
          <ChatRoom user={user} />
        )}
      </main>
    </div>
  );
};

export default App;
