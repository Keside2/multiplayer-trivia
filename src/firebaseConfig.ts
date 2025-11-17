// client/src/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import type { User } from "firebase/auth";


// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCoRzWMG4Q8dYjLBMf-RQrAb2UPlt6tkjY",
  authDomain: "multiplayer-trivia-63aab.firebaseapp.com",
  databaseURL: "https://multiplayer-trivia-63aab-default-rtdb.firebaseio.com/",
  projectId: "multiplayer-trivia-63aab",
  storageBucket: "multiplayer-trivia-63aab.firebasestorage.app",
  messagingSenderId: "409629060731",
  appId: "1:409629060731:web:6315bdc870e76477de3cde",
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Export Realtime Database and Auth
export const db = getDatabase(app);
export const auth = getAuth(app);

// 🔹 Helper function for signing in anonymously
export async function loginAnon(): Promise<User> {
  await signInAnonymously(auth);
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
    });
  });
}
