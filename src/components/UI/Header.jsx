// src/components/UI/Header.jsx
import React from 'react';
import { signOut } from 'firebase/auth';
import { auth, database } from '../../firebase';
import { remove, ref } from 'firebase/database';

const Header = ({ user, userData }) => {
  const handleLogout = async () => {
    try {
      // Remove typing presence for current user if connected to a couple
      if (userData?.coupleCode && user?.uid) {
        const typingRef = ref(database, `couples/${userData.coupleCode}/typing/${user.uid}`);
        await remove(typingRef).catch(()=>{});
      }

      await signOut(auth);
      // onAuthStateChanged listener in App will handle redirecting to login view
    } catch (err) {
      console.error('Logout error:', err);
      alert('Failed to logout. Please try again.');
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-40">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">AshWin 💕</div>
          <div className="text-sm text-gray-600">Private couples space</div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-sm text-gray-600 mr-4">{userData?.name || user?.email}</div>
          <button
            onClick={handleLogout}
            className="bg-gradient-to-r from-gray-200 to-gray-300 px-3 py-1 rounded-md text-sm hover:from-gray-300 hover:to-gray-400 transition"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
