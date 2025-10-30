import React, { useState, useEffect } from 'react';
import { ref, get, set, update, onValue } from 'firebase/database';
import { database } from '../../firebase';

const ConnectionPanel = ({ user, onConnected }) => {
  const [partnerCode, setPartnerCode] = useState('');
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const generateUserCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const part1 = letters[Math.floor(Math.random() * letters.length)];
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `U-${part1}${part2}`;
  };

  useEffect(() => {
    if (!user) return;
    const userRef = ref(database, `users/${user.uid}`);

    onValue(userRef, async (snapshot) => {
      const data = snapshot.val();

      if (data) {
        setUserData(data);
        if (!data.userCode) {
          const newCode = generateUserCode();
          await update(userRef, { userCode: newCode });
          setUserData((prev) => ({ ...prev, userCode: newCode }));
        }
      } else {
        const newCode = generateUserCode();
        const newUser = {
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'New User',
          userCode: newCode,
          coupleCode: '',
          partnerUid: '',
        };
        await set(userRef, newUser);
        setUserData(newUser);
      }

      setLoading(false);
    });
  }, [user]);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');

    try {
      if (!partnerCode.trim()) {
        setError('Please enter your partner’s code.');
        setConnecting(false);
        return;
      }

      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      let partner = null;

      snapshot.forEach((child) => {
        const val = child.val();
        if (val.userCode === partnerCode.trim()) {
          partner = { uid: child.key, ...val };
        }
      });

      if (!partner) {
        setError('No user found with that code 😢');
        setConnecting(false);
        return;
      }

      if (userData?.partnerUid === partner.uid) {
        onConnected();
        setConnecting(false);
        return;
      }

      const coupleCode = `C-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      await update(ref(database, `users/${user.uid}`), {
        coupleCode,
        partnerUid: partner.uid,
      });
      await update(ref(database, `users/${partner.uid}`), {
        coupleCode,
        partnerUid: user.uid,
      });

      setUserData((prev) => ({
        ...prev,
        coupleCode,
        partnerUid: partner.uid,
      }));

      onConnected();
    } catch (err) {
      console.error('❌ Connection failed:', err);
      setError('Failed to connect. Please try again.');
    } finally {
      setConnecting(false);
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
    <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-semibold text-gray-800 mb-3">Your Info</h2>
      <p className="text-gray-600 mb-1">{userData?.name}</p>
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-pink-50 px-3 py-2 rounded-xl mb-4">
        <span className="text-sm text-gray-800">Your Code:</span>
        <span className="font-semibold text-pink-600">
          {userData?.userCode || '—'}
        </span>
        {userData?.userCode && (
          <button
            className="text-xs text-blue-500 hover:underline ml-2"
            onClick={() => navigator.clipboard.writeText(userData.userCode)}
          >
            Copy
          </button>
        )}
      </div>

      {!userData?.coupleCode ? (
        <>
          <h3 className="text-md font-semibold text-gray-800 mb-2">
            Connect with Partner
          </h3>
          <input
            type="text"
            value={partnerCode}
            onChange={(e) => setPartnerCode(e.target.value)}
            placeholder="Enter partner’s code (e.g. U-ABC123)"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-200 focus:outline-none text-sm"
          />
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full mt-3 bg-gradient-to-r from-blue-400 to-pink-400 text-white py-2 rounded-xl hover:from-blue-500 hover:to-pink-500 transition-all duration-200 font-medium disabled:opacity-50"
          >
            {connecting ? 'Connecting… 💞' : 'Connect to Partner 💕'}
          </button>
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

          <div className="bg-yellow-50 border border-yellow-100 rounded-xl mt-4 p-3 text-xs text-gray-600">
            <p className="font-semibold mb-1">How to Connect:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Share your code with your partner</li>
              <li>Ask for theirs</li>
              <li>Enter their code and click connect</li>
              <li>You’ll both be automatically paired 💕</li>
            </ol>
          </div>
        </>
      ) : (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">
            You’re connected with your partner! 🎉
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Couple Code: <span className="font-semibold">{userData.coupleCode}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default ConnectionPanel;
