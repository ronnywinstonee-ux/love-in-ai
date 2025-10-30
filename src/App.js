import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, database } from './firebase';
import { ref, get, onValue } from 'firebase/database';
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
        // Watch user data in real-time for connection status
        const userRef = ref(database, `users/${currentUser.uid}`);
        
        onValue(userRef, (snapshot) => {
          const data = snapshot.val();
          console.log('👤 App: User data updated:', data);
          
          if (data && data.coupleCode && data.partnerUid) {
            console.log('✅ User is connected');
            setConnected(true);
          } else {
            console.log('⚠️ User not connected');
            setConnected(false);
          }
          setLoading(false);
        });
      } else {
        setConnected(false);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    const confirmed = window.confirm('Are you sure you want to logout?');
    if (!confirmed) return;
    
    try {
      await signOut(auth);
      setUser(null);
      setConnected(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleConnected = () => {
    console.log('🎉 Connection successful!');
    setConnected(true);
  };

  const handleDisconnected = () => {
    console.log('💔 Disconnected!');
    setConnected(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500 bg-gradient-to-br from-pink-50 to-blue-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-pink-300 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center bg-gradient-to-br from-pink-50 to-blue-50">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-pink-600 mb-2">💞 AshWin Chat</h1>
          <p className="text-gray-600">Connect privately with your special person</p>
        </div>
        <button
          onClick={handleLogin}
          className="bg-gradient-to-r from-blue-500 to-pink-500 text-white px-8 py-3 rounded-2xl shadow-lg hover:from-blue-600 hover:to-pink-600 transition-all duration-200 font-semibold text-lg"
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
          <p className="text-sm text-gray-600">{user.displayName || user.email}</p>
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
          <ConnectionPanel user={user} onConnected={handleConnected} />
        ) : (
          <ChatRoom user={user} onDisconnect={handleDisconnected} />
        )}
      </main>
    </div>
  );
};

export default App;