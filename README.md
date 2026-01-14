# 🎮 Multiplayer Trivia Game

A real-time multiplayer trivia game built with React, TypeScript, and Firebase Realtime Database. Players can create or join rooms, compete in trivia rounds, and chat live. Fast answers earn bonus points!

---

## 🛠 Features

- Real-time multiplayer gameplay
- Create and join public/private rooms
- Automatic room cleanup when all players leave
- Host-controlled rounds
- Hosts can start new rounds and manage game flow
- Live leaderboard with real-time updates
- Highlights the current player
- Trivia questions fetched from Open Trivia Database (OpenTDB)
- Multiple difficulty levels: Easy, Medium, Hard
- Categories: General Knowledge, Science, Sports, History, Geography, Entertainment, Math
- Base points for correct answers + quick-answer bonus
- Live room chat for all players
- Round start countdown (3..2..1) for dramatic effect
- Confetti for winners

---

## 🖥 UI Overview

- **Welcome Screen:** Enter a player name before joining or creating a room
- **Lobby:** Create a new room (select category, difficulty, number of questions) or join existing rooms via code or public room list
- **Game Layout:**
  - **Left/Main Panel:** Current round question, options, timer, and round info
  - **Right Panel:** Leaderboard and chat
  - **Overlays:** Countdown before rounds, round summary, and game-over confetti
- **Host vs Player:** Host sees "Next Question" and "Restart Game" buttons; players see "Waiting for host"

---

## ⚡ Installation

### Clone the repository

```bash
git clone https://github.com/Keside2/multiplayer-trivia.git
cd multiplayer-trivia/client
```

### Install dependencies

```bash
npm install
```

### Firebase Setup

1. Create a Firebase project
2. Enable Realtime Database
3. Copy your Firebase config into `src/firebaseConfig.ts`

Example:

```ts
// client/src/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
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
```

> ⚠️ **Important:** Replace the placeholder values with your own Firebase configuration.

### Optional: Using environment variables

Create a `.env` file in the project root:

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_DATABASE_URL=your_db_url
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Update `firebaseConfig.ts` to use `import.meta.env` values.

### Start development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🎮 How to Play

1. Enter a player name
2. Create a room or join a room
3. If hosting:
   - Start rounds with **Next Question**
   - Monitor the leaderboard
4. Players select answers before the timer runs out
5. At round end:
   - Quick summary of results
   - Next round starts automatically
6. Game ends when all questions are answered
7. Winner is displayed with confetti
8. Host can restart the game

---

## 📂 Project Structure

```
src/
├─ App.tsx           # Main React component & game logic
├─ firebaseConfig.ts # Firebase setup & auth
├─ App.css           # Styling for layout & components
public/
├─ sounds/           # Sound effects (e.g., "newround.mp3")
```

---

## 🔧 Tech Stack

- Frontend: React + TypeScript + Vite
- Realtime backend: Firebase Realtime Database
- Notifications: react-toastify
- UI helpers: react-use for window size, confetti animations
- Trivia API: Open Trivia DB

---

## ⚠️ Known Issues / TODOs

- Only multiple-choice questions are supported
- Quick-answer bonus logic may not sync perfectly on slow networks
- Add more trivia categories
- Mobile UI optimization

---

## 🤝 Contributing

1. Fork the repository
2. Create a new branch: `git checkout -b feature/my-feature`
3. Make changes & commit: `git commit -m "Add feature"`
4. Push to branch: `git push origin feature/my-feature`
5. Open a pull request

---

## 🚀 Deployment

1. Build the app: `npm run build`
2. Deploy using Vercel / Netlify / Firebase Hosting

---

## 📝 License

MIT License © 2025

---

## 📸 Screenshots / GIFs

![Game Layout](image/game-layout.png)

![Game Layout](image/game-layout2.png)

![Game Layout](image/game-layout3.png)

![Game Layout](image/game-layout4.png)

![Game Layout](image/game-layout5.png)
