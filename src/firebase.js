// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDYCSPBGdGLGF6N6CQIIyVRnKqLhvvqE6Q",
  authDomain: "ashwin-bf4dd.firebaseapp.com",
  // TRIMMED trailing spaces and ensure proper URL
  databaseURL: "https://ashwin-bf4dd-default-rtdb.firebaseio.com",
  projectId: "ashwin-bf4dd",
  // storageBucket usually ends with .appspot.com
  storageBucket: "ashwin-bf4dd.appspot.com",
  messagingSenderId: "645261116127",
  appId: "1:645261116127:web:96102509936bbea902df6a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Authentication
const auth = getAuth(app);

// Realtime Database
const database = getDatabase(app);

export { auth, database };
export default app;
