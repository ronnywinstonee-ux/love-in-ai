import { auth, database } from '../firebase';
import { ref, set, onValue, off } from 'firebase/database';

export const testFirebaseConnection = async () => {
  console.log('🧪 Testing Firebase connection...');
  
  // Check if Firebase was initialized successfully
  if (!database) {
    console.error('❌ Firebase database not initialized');
    return false;
  }

  try {
    // Test 1: Check if we can write to database
    const testRef = ref(database, 'connection_test/' + Date.now());
    await set(testRef, {
      timestamp: new Date().toISOString(),
      test: 'connection_test'
    });
    console.log('✅ Database write test passed');

    // Test 2: Check if we can read from database
    return new Promise((resolve) => {
      const readRef = ref(database, 'connection_test');
      const unsubscribe = onValue(readRef, (snapshot) => {
        off(readRef, 'value', unsubscribe);
        console.log('✅ Database read test passed');
        resolve(true);
      }, (error) => {
        console.error('❌ Database read test failed:', error);
        resolve(false);
      });
      
      // Add timeout in case the connection hangs
      setTimeout(() => {
        off(readRef, 'value', unsubscribe);
        console.error('❌ Database read test timed out');
        resolve(false);
      }, 5000);
    });
  } catch (error) {
    console.error('❌ Firebase connection test failed:', error);
    return false;
  }
};

export const isFirebaseAvailable = () => {
  return !!database;
};