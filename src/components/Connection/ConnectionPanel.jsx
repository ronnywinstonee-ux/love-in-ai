import React, { useState, useEffect } from 'react';
import { ref, get, set, update, onValue } from 'firebase/database';
import { database } from '../../firebase';

const ConnectionPanel = ({ user, onConnected }) => {
  const [partnerCode, setPartnerCode] = useState('');
  const [userData, setUserData] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  // Generate permanent user code (only once)
  const generateUserCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const part1 = letters[Math.floor(Math.random() * letters.length)];
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `U-${part1}${part2}`;
  };

  // Load or create user data
  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);

    const unsubscribe = onValue(userRef, async (snapshot) => {
      const data = snapshot.val();

      if (data) {
        // Update online status to true
        await update(userRef, { online: true });
        setUserData(data);

        // Watch partner info if connected
        if (data.partnerUid) {
          const partnerRef = ref(database, `users/${data.partnerUid}`);
          onValue(partnerRef, (partnerSnap) => {
            if (partnerSnap.exists()) {
              setPartnerData(partnerSnap.val());
            }
          });
        } else {
          setPartnerData(null);
        }
      } else {
        // Create new user entry
        const newCode = generateUserCode();
        const newUser = {
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          userCode: newCode,
          coupleCode: '',
          partnerUid: '',
          online: true,
          createdAt: Date.now(),
        };
        await set(userRef, newUser);
        setUserData(newUser);
      }

      setLoading(false);
    });

    // When user leaves, mark offline
    return () => {
      update(userRef, { online: false });
      unsubscribe();
    };
  }, [user]);

  // Handle connect to partner
  const handleConnect = async () => {
    setConnecting(true);
    setError('');

    try {
      if (!partnerCode.trim()) {
        setError('Please enter your partner code.');
        setConnecting(false);
        return;
      }

      const cleanCode = partnerCode.trim().toUpperCase();

      // Don't connect to yourself
      if (cleanCode === userData?.userCode) {
        setError('You cannot connect to yourself!');
        setConnecting(false);
        return;
      }

      // Find partner by code
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      let partner = null;

      snapshot.forEach((child) => {
        const val = child.val();
        if (val.userCode === cleanCode) {
          partner = { uid: child.key, ...val };
        }
      });

      if (!partner) {
        setError('No user found with that code. Check and try again.');
        setConnecting(false);
        return;
      }

      // Create shared couple code
      const coupleCode = `CHAT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      console.log('🔗 Creating couple code:', coupleCode);

      // Update both users
      await update(ref(database, `users/${user.uid}`), {
        coupleCode,
        partnerUid: partner.uid,
        partnerName: partner.name,
        connectedAt: Date.now(),
      });

      await update(ref(database, `users/${partner.uid}`), {
        coupleCode,
        partnerUid: user.uid,
        partnerName: userData.name,
        connectedAt: Date.now(),
      });

      console.log('✅ Both users updated with couple code');

      // Load partner info
      const partnerRef = ref(database, `users/${partner.uid}`);
      const partnerSnap = await get(partnerRef);
      setPartnerData(partnerSnap.val());

      // Update local state
      setUserData((prev) => ({
        ...prev,
        coupleCode,
        partnerUid: partner.uid,
        partnerName: partner.name,
      }));

      alert('🎉 Connected successfully!');
      onConnected();
    } catch (err) {
      console.error('❌ Connection failed:', err);
      setError('Failed to connect. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    if (!userData?.partnerUid) return;

    const confirmDisconnect = window.confirm(
      'Are you sure you want to disconnect? All chat history will remain but you can connect with someone else.'
    );

    if (!confirmDisconnect) return;

    try {
      const myRef = ref(database, `users/${user.uid}`);
      const partnerRef = ref(database, `users/${userData.partnerUid}`);

      // Clear connection for both users
      await update(myRef, { 
        coupleCode: '', 
        partnerUid: '',
        partnerName: '',
      });
      await update(partnerRef, { 
        coupleCode: '', 
        partnerUid: '',
        partnerName: '',
      });

      setPartnerData(null);
      setUserData((prev) => ({
        ...prev,
        coupleCode: '',
        partnerUid: '',
        partnerName: '',
      }));
      
      alert('✅ Disconnected successfully. You can now connect with someone else.');
    } catch (err) {
      console.error('❌ Disconnect failed:', err);
      alert('Failed to disconnect. Try again.');
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">
        <div className="w-8 h-8 border-4 border-pink-300 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        Loading your info...
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-2xl shadow-md border border-gray-100 max-w-md mx-auto">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">💞 Connection Center</h2>
      
      {/* User Info Card */}
      <div className="bg-gradient-to-r from-blue-50 to-pink-50 p-4 rounded-xl mb-4">
        <p className="text-sm text-gray-600 mb-1">Your Name</p>
        <p className="text-lg font-semibold text-gray-800 mb-3">{userData?.name}</p>
        
        <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg">
          <div>
            <p className="text-xs text-gray-500">Your Code</p>
            <p className="text-xl font-bold text-pink-600">
              {userData?.userCode || '—'}
            </p>
          </div>
          {userData?.userCode && (
            <button
              className="text-sm bg-pink-500 text-white px-3 py-1 rounded-lg hover:bg-pink-600 transition"
              onClick={() => {
                navigator.clipboard.writeText(userData.userCode);
                alert('📋 Code copied! Share it with your partner.');
              }}
            >
              Copy Code
            </button>
          )}
        </div>
      </div>

      {!userData?.coupleCode ? (
        <>
          {/* Connect Section */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              🔗 Connect with Partner
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              Ask your partner for their code and enter it below:
            </p>
            <input
              type="text"
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
              placeholder="e.g. U-AB12C"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-300 focus:outline-none text-center text-lg font-semibold"
            />
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full mt-3 bg-gradient-to-r from-blue-500 to-pink-500 text-white py-3 rounded-xl hover:from-blue-600 hover:to-pink-600 transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? '🔄 Connecting...' : '💕 Connect Now'}
            </button>
            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center border-t border-gray-200 pt-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <p className="text-green-600 font-semibold mb-1">✅ Connected!</p>
            <p className="text-sm text-gray-600">You can now chat with your partner</p>
          </div>
          
          {partnerData && (
            <div className="bg-gradient-to-r from-pink-50 to-blue-50 p-4 rounded-xl mb-4">
              <p className="text-sm text-gray-500 mb-1">Your Partner</p>
              <p className="text-xl font-semibold text-pink-600">{partnerData.name}</p>
              <p
                className={`text-sm font-medium mt-1 ${
                  partnerData.online ? 'text-green-500' : 'text-gray-400'
                }`}
              >
                {partnerData.online ? '🟢 Online' : '⚪ Offline'}
              </p>
            </div>
          )}
          
          <button
            onClick={handleDisconnect}
            className="text-sm px-4 py-2 border-2 border-red-300 text-red-500 rounded-xl hover:bg-red-50 transition font-medium"
          >
            💔 Disconnect
          </button>
        </div>
      )}
    </div>
  );
};

export default ConnectionPanel;