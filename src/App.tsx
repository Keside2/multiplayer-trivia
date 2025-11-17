// src/App.tsx
import { useEffect, useState, useRef } from "react";
import { db, loginAnon } from "./firebaseConfig";
import {
  ref,
  set,
  onValue,
  get,
  update,
  push,
  runTransaction,
  onDisconnect,
  remove,
} from "firebase/database";
import axios from "axios";
import "./App.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";

interface Player {
  name: string;
  score: number;
}
interface Round {
  question: string;
  options: string[];
  answer: string;
  remainingTime: number;
  totalTime: number;
  roundActive: boolean;
  roundId: number;
  category: string;
  roundNumber?: number;
}
interface ChatMessage {
  user: string;
  text: string;
  timestamp: number;
}

const CATEGORIES = [
  { name: "General Knowledge", id: 9 },
  { name: "Science & Nature", id: 17 },
  { name: "Sports", id: 21 },
  { name: "History", id: 23 },
  { name: "Geography", id: 22 },
  { name: "Entertainment", id: 11 },
  { name: "Math", id: 19 },
];

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// watchRoomPresence (unchanged) - cleans empty rooms & updates publicRooms players count
function watchRoomPresence(roomId: string) {
  const presenceListRef = ref(db, `rooms/${roomId}/presence`);
  onValue(presenceListRef, async (snap) => {
    const presence = snap.val() || {};
    const count = Object.keys(presence).length;
    await update(ref(db, `publicRooms/${roomId}`), { players: count });
    if (count === 0) {
      console.log(`🧹 Removing empty room: ${roomId}`);
      await remove(ref(db, `rooms/${roomId}`));
      await remove(ref(db, `publicRooms/${roomId}`));
    }
  });

  const cleanupRef = ref(db, `rooms/${roomId}/cleanup`);
  onValue(cleanupRef, async (snap) => {
    if (snap.exists()) {
      const presenceSnap = await get(presenceListRef);
      if (
        !presenceSnap.exists() ||
        Object.keys(presenceSnap.val()).length === 0
      ) {
        console.log(`🧹 Cleanup triggered for empty room: ${roomId}`);
        await remove(ref(db, `rooms/${roomId}`));
        await remove(ref(db, `publicRooms/${roomId}`));
      }
    }
  });
}

function getTimeForDifficulty(diff: string) {
  switch (diff) {
    case "easy":
      return 20;
    case "medium":
      return 15;
    case "hard":
      return 10;
    default:
      return 20;
  }
}

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState<string>("");
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [round, setRound] = useState<Round | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage>>(
    {}
  );
  const [showIntro, setShowIntro] = useState(true);

  const [chatInput, setChatInput] = useState<string>("");
  const [publicRooms, setPublicRooms] = useState<Record<string, any>>({});
  const [selectedCategory, setSelectedCategory] = useState<number>(9);
  const [difficulty, setDifficulty] =
    useState<(typeof DIFFICULTIES)[number]>("easy");
  const [loadingQuestion, setLoadingQuestion] = useState<boolean>(false);
  const [nameEntered, setNameEntered] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [gameOver, setGameOver] = useState(false);
  const [currentRoundIndex, setCurrentRoundIndex] = useState<number>(0);
  const [lastResults, setLastResults] = useState<Record<string, any> | null>(
    null
  );
  const [showNextRoundOverlay, setShowNextRoundOverlay] = useState(false);
  const [nextRoundCountdown, setNextRoundCountdown] = useState<number | null>(
    null
  );
  const [gameStarted, setGameStarted] = useState(false);

  // New states for flow & UI:
  const [countdown, setCountdown] = useState<{
    startAt: number;
    duration: number;
  } | null>(null);

  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);
  const [_, setShowSummary] = useState(false);

  const questionCache = useRef<any[]>([]);
  const { width, height } = useWindowSize();

  const playSound = (name: string) => {
    const audio = new Audio(`/sounds/${name}.mp3`);
    audio.play().catch(() => {});
  };

  // ------------------------
  // Generic countdown function
  // ------------------------
  function startCountdown(
    duration: number,
    onTick: (n: number) => void,
    onEnd: () => void
  ) {
    let counter = duration;
    const tick = () => {
      onTick(counter);
      counter--;
      if (counter < 0) onEnd();
      else setTimeout(tick, 1000);
    };
    tick();
  }

  useEffect(() => {
    loginAnon().then((user) => setUserId(user.uid));
  }, []);

  useEffect(() => {
    const roomsRef = ref(db, "publicRooms");
    return onValue(roomsRef, (snap) => setPublicRooms(snap.val() || {}));
  }, []);

  // --- ROOM CREATION & JOIN ---
  async function createRoom() {
    if (!userId) return toast.error("Not signed in");
    const newCode = generateRoomCode();
    setRoomId(newCode);
    setIsHost(true);
    setGameOver(false);
    setCurrentRoundIndex(0);
    const hostName = playerName || "Player-" + userId.slice(0, 5);

    await set(ref(db, `rooms/${newCode}`), {
      host: userId,
      createdAt: Date.now(),
      category: CATEGORIES.find((c) => c.id === selectedCategory)?.name,
      settings: { questionCount, difficulty },
    });

    await set(ref(db, `rooms/${newCode}/leaderboard/${userId}`), {
      name: hostName,
      score: 0,
    });

    const publicRoomData = { hostName, players: 1, createdAt: Date.now() };
    await set(ref(db, `publicRooms/${newCode}`), publicRoomData);

    const presenceRef = ref(db, `rooms/${newCode}/presence/${userId}`);
    await set(presenceRef, true);
    onDisconnect(presenceRef).remove();

    const roomCleanupRef = ref(db, `rooms/${newCode}/cleanup`);
    onDisconnect(roomCleanupRef).set({
      timestamp: Date.now(),
      triggeredBy: userId,
    });

    watchRoomPresence(newCode);

    setPublicRooms((prev) => ({ ...prev, [newCode]: publicRoomData }));
    preloadQuestions(selectedCategory, difficulty);

    toast.success(`Room ${newCode} created`);
  }

  async function joinRoom(codeFromClick?: string) {
    const code = (codeFromClick || roomInput).trim().toUpperCase();
    if (!code) return toast.error("Enter a valid room code!");
    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) return toast.error("Room not found!");
    setRoomId(code);
    const player = playerName || "Player-" + userId?.slice(0, 5);

    await set(ref(db, `rooms/${code}/leaderboard/${userId}`), {
      name: player,
      score: 0,
    });

    const playersRef = ref(db, `publicRooms/${code}/players`);
    runTransaction(playersRef, (count) => (count || 0) + 1);

    const presenceRef = ref(db, `rooms/${code}/presence/${userId}`);
    await set(presenceRef, true);
    onDisconnect(presenceRef).remove();

    const roomCleanupRef = ref(db, `rooms/${code}/cleanup`);
    onDisconnect(roomCleanupRef).set({
      timestamp: Date.now(),
      triggeredBy: userId,
    });

    watchRoomPresence(code);

    preloadQuestions(selectedCategory, difficulty);
    toast.success(`Joined room ${code}`);
  }

  // --- SYNC FIREBASE ---
  useEffect(() => {
    if (!roomId || !userId) return;

    const hostRef = ref(db, `rooms/${roomId}/host`);
    const leaderboardRef = ref(db, `rooms/${roomId}/leaderboard`);
    const roundRef = ref(db, `rooms/${roomId}/currentRound`);
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const settingsRef = ref(db, `rooms/${roomId}/settings`);
    const resultsRef = ref(db, `rooms/${roomId}/lastResults`);
    const gameOverRef = ref(db, `rooms/${roomId}/gameOver`);
    const indexRef = ref(db, `rooms/${roomId}/currentRoundIndex`);
    const countdownRef = ref(db, `rooms/${roomId}/countdown`);

    const unsubHost = onValue(hostRef, (snap) =>
      setIsHost(snap.val() === userId)
    );
    const unsubBoard = onValue(leaderboardRef, (snap) =>
      setPlayers(snap.val() || {})
    );
    const unsubRound = onValue(roundRef, (snap) => setRound(snap.val()));
    const unsubChat = onValue(chatRef, (snap) =>
      setChatMessages(snap.val() || {})
    );
    const unsubSettings = onValue(settingsRef, (snap) => {
      const s = snap.val();
      if (s?.questionCount) setQuestionCount(s.questionCount);
      if (s?.difficulty) setDifficulty(s.difficulty);
    });
    const unsubResults = onValue(resultsRef, (snap) => {
      const r = snap.val();
      setLastResults(r || null);
      // show short summary UI on clients when results update
      if (r) {
        setShowSummary(true);
        setTimeout(() => setShowSummary(false), 2500);
        if (userId && r.players && r.players[userId]) {
          const pRes = r.players[userId];
          if (pRes.correct) toast.success("✅ You were correct!");
          else toast.info("❌ You were incorrect.");
        }
      }
    });
    const unsubGameOver = onValue(gameOverRef, (snap) =>
      setGameOver(!!snap.val())
    );
    const unsubIndex = onValue(indexRef, (snap) => {
      const val = snap.val();
      if (typeof val === "number") setCurrentRoundIndex(val);
    });
    const unsubCountdown = onValue(countdownRef, (snap) => {
      const cd = snap.val();
      if (cd && cd.startAt && cd.duration) {
        setCountdown({ startAt: cd.startAt, duration: cd.duration });
      } else {
        setCountdown(null);
        setCountdownNumber(null);
      }
    });

    return () => {
      unsubHost();
      unsubBoard();
      unsubRound();
      unsubChat();
      unsubSettings();
      unsubResults();
      unsubGameOver();
      unsubIndex();
      unsubCountdown();
    };
  }, [roomId, userId]);

  // Update countdownNumber locally (clients will observe countdown node in DB)
  useEffect(() => {
    if (!countdown) return;
    const tick = () => {
      const endAt = countdown.startAt + countdown.duration * 1000;
      const msLeft = endAt - Date.now();
      const sec = Math.max(0, Math.ceil(msLeft / 1000));
      setCountdownNumber(sec);
      if (msLeft <= 0) {
        setCountdown(null);
        setCountdownNumber(null);
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [countdown]);

  // Auto-cleanup when user closes tab or reloads
  useEffect(() => {
    const handleUnload = async () => {
      if (!roomId || !userId) return;
      await remove(ref(db, `rooms/${roomId}/presence/${userId}`));
      const hostSnap = await get(ref(db, `rooms/${roomId}/host`));
      const hostId = hostSnap.val();
      if (hostId === userId) {
        await remove(ref(db, `rooms/${roomId}`));
        await remove(ref(db, `publicRooms/${roomId}`));
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [roomId, userId]);

  // countdown — host responsibilities: decrement DB remainingTime each second
  useEffect(() => {
    if (!isHost || !round?.roundActive) return;
    const timer = setInterval(async () => {
      if (!roomId) return;
      try {
        const roundSnap = await get(ref(db, `rooms/${roomId}/currentRound`));
        if (!roundSnap.exists()) {
          clearInterval(timer);
          return;
        }
        const cur = roundSnap.val();
        if (!cur || !cur.roundActive) {
          clearInterval(timer);
          return;
        }
        if (cur.remainingTime <= 1) {
          clearInterval(timer);
          await evaluateRound(cur);
          return;
        }
        await update(ref(db, `rooms/${roomId}/currentRound`), {
          remainingTime: cur.remainingTime - 1,
        });
      } catch (err) {
        console.error("Countdown error:", err);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [round?.roundId, isHost, roomId]);

  // --- PRELOAD QUESTIONS ---
  async function preloadQuestions(
    cat: number,
    diff: (typeof DIFFICULTIES)[number]
  ) {
    try {
      const res = await axios.get(
        `https://opentdb.com/api.php?amount=6&category=${cat}&difficulty=${diff}&type=multiple`
      );
      const items = res.data.results || [];
      questionCache.current.push(
        ...items.map((q: any) => ({
          question: q.question,
          options: [...q.incorrect_answers, q.correct_answer].sort(
            () => Math.random() - 0.5
          ),
          answer: q.correct_answer,
          category: q.category,
        }))
      );
    } catch (err) {
      console.error("preload error", err);
      toast.error("Failed to preload questions.");
    }
  }

  // START next round (host only) — now with pre-game countdown
  async function startNewRound() {
    if (!isHost || !roomId) return;

    try {
      const settingsSnap = await get(ref(db, `rooms/${roomId}/settings`));
      const settings = settingsSnap.exists()
        ? settingsSnap.val()
        : { questionCount, difficulty };
      const indexSnap = await get(ref(db, `rooms/${roomId}/currentRoundIndex`));
      let idx = indexSnap.exists() ? indexSnap.val() : 0;

      if (idx >= settings.questionCount) {
        await set(ref(db, `rooms/${roomId}/gameOver`), true);
        return;
      }

      setLoadingQuestion(true);
      playSound("newround");

      // Only first round has 3..2..1 countdown
      if (idx === 0) {
        await new Promise<void>((resolve) => {
          startCountdown(3, setCountdownNumber, resolve);
        });
        setCountdownNumber(null);
      }

      // Prepare next question
      let nextQ = questionCache.current.shift();
      if (!nextQ) {
        await preloadQuestions(selectedCategory, settings.difficulty);
        nextQ = questionCache.current.shift();
      }
      if (!nextQ) throw new Error("No question available");

      const roundId = Date.now();
      const remainingTime = getTimeForDifficulty(settings.difficulty);

      await set(ref(db, `rooms/${roomId}/currentRound`), {
        question: nextQ.question,
        options: nextQ.options,
        answer: nextQ.answer,
        category: nextQ.category,
        remainingTime,
        totalTime: remainingTime,
        roundActive: true,
        roundId,
        roundNumber: idx + 1,
      });

      await set(ref(db, `rooms/${roomId}/currentRoundIndex`), idx + 1);
      await set(ref(db, `rooms/${roomId}/gameOver`), false);
      if (!gameStarted) setGameStarted(true);
    } catch (err) {
      console.error("startNewRound error", err);
      toast.error("Error starting new round.");
    } finally {
      setLoadingQuestion(false);
    }
  }

  // --- Evaluate Round (with quick-answer bonus) ---
  async function evaluateRound(currentRound: any) {
    if (!isHost || !roomId || !currentRound) return;
    const roundId = currentRound.roundId;
    const correctAnswer = currentRound.answer;

    try {
      const answersSnap = await get(
        ref(db, `rooms/${roomId}/answers/${roundId}`)
      );
      const answers = answersSnap.exists() ? answersSnap.val() : {};

      const results: Record<string, any> = { players: {}, correctAnswer };
      const boardSnap = await get(ref(db, `rooms/${roomId}/leaderboard`));
      const board = boardSnap.exists() ? boardSnap.val() : {};

      for (const pid of Object.keys(board || {})) {
        // answers stored as { selected, remainingTime, timestamp }
        const ansObj = answers[pid] ?? null;
        const selected = ansObj ? ansObj.selected : null;
        const remainingAtAnswer = ansObj ? ansObj.remainingTime : 0;

        const correct =
          selected !== null &&
          String(selected).trim().toLowerCase() ===
            String(correctAnswer).trim().toLowerCase();

        // calculate score: base 10 + quick-answer bonus (floor(remaining/2))
        const basePoints = correct ? 10 : 0;
        const timeBonus = correct
          ? Math.floor((remainingAtAnswer || 0) / 2)
          : 0;
        const awarded = basePoints + timeBonus;

        results.players[pid] = { selected, correct, awarded, timeBonus };

        if (correct) {
          const newScore = (board[pid]?.score || 0) + awarded;
          await set(ref(db, `rooms/${roomId}/leaderboard/${pid}`), {
            name: board[pid]?.name || `Player-${pid.slice(0, 5)}`,
            score: newScore,
          });
        }
      }

      // write results for clients to show summary
      await set(ref(db, `rooms/${roomId}/lastResults`), {
        roundId,
        timestamp: Date.now(),
        players: results.players,
        correctAnswer,
      });

      // mark current round inactive
      await update(ref(db, `rooms/${roomId}/currentRound`), {
        roundActive: false,
        remainingTime: 0,
      });

      const settingsSnap = await get(ref(db, `rooms/${roomId}/settings`));
      const total = settingsSnap.exists()
        ? settingsSnap.val().questionCount
        : questionCount;
      const idxSnap = await get(ref(db, `rooms/${roomId}/currentRoundIndex`));
      const curIndex = idxSnap.exists() ? idxSnap.val() : 1;

      if (curIndex >= total) {
        // game over
        await set(ref(db, `rooms/${roomId}/gameOver`), true);

        const finalBoardSnap = await get(
          ref(db, `rooms/${roomId}/leaderboard`)
        );
        const finalBoard = finalBoardSnap.exists() ? finalBoardSnap.val() : {};
        let topId: string | null = null;
        let topScore = -Infinity;
        for (const pid of Object.keys(finalBoard)) {
          const s = finalBoard[pid].score || 0;
          if (s > topScore) {
            topScore = s;
            topId = pid;
          }
        }
        const winner = topId ? { id: topId, ...finalBoard[topId] } : null;
        await set(ref(db, `rooms/${roomId}/winner`), winner || null);
        toast.info("🏁 Game over!");
      } else {
        // ✅ Show correct answer overlay for 5 seconds with countdown
        // Show correct answer overlay for 5 seconds with countdown
        setShowNextRoundOverlay(true);

        let counter = 5;

        const countdown = setInterval(() => {
          counter--; // decrement first
          if (counter <= 0) {
            clearInterval(countdown);
            setNextRoundCountdown(null);
            setShowNextRoundOverlay(false);
            startNewRound(); // immediately start next round
          } else {
            setNextRoundCountdown(counter);
          }
        }, 1000);
      }
    } catch (err) {
      console.error("evaluateRound error", err);
      toast.error("Error evaluating round.");
    }
  }

  // --- handleSubmit (store remainingTime so we can award quick-answer bonus) ---
  async function handleSubmit(option: string) {
    if (!userId || !round || !round.roundActive || !roomId)
      return toast.error("Can't submit right now.");
    try {
      await set(ref(db, `rooms/${roomId}/answers/${round.roundId}/${userId}`), {
        selected: option,
        remainingTime: round.remainingTime,
        timestamp: Date.now(),
      });
      toast.info("Answer saved");
    } catch (err) {
      console.error("submit answer error", err);
      toast.error("Failed to save answer");
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !userId || !roomId) return;
    await push(ref(db, `rooms/${roomId}/chat`), {
      user: playerName || "Player-" + userId.slice(0, 5),
      text: chatInput,
      timestamp: Date.now(),
    });
    setChatInput("");
  }

  async function restartGame() {
    if (!isHost || !roomId) return;
    const boardSnap = await get(ref(db, `rooms/${roomId}/leaderboard`));
    const board = boardSnap.exists() ? boardSnap.val() : {};
    for (const pid of Object.keys(board)) {
      await update(ref(db, `rooms/${roomId}/leaderboard/${pid}`), { score: 0 });
    }
    await remove(ref(db, `rooms/${roomId}/currentRound`));
    await remove(ref(db, `rooms/${roomId}/lastResults`));
    await set(ref(db, `rooms/${roomId}/currentRoundIndex`), 0);
    await set(ref(db, `rooms/${roomId}/gameOver`), false);
    toast.success("Game reset. Start a new round to begin.");
  }

  // Leave room (both players & host)
  async function leaveRoom() {
    if (!roomId || !userId) return;
    try {
      await remove(ref(db, `rooms/${roomId}/presence/${userId}`));
      const hostSnap = await get(ref(db, `rooms/${roomId}/host`));
      const hostId = hostSnap.val();
      if (hostId === userId) {
        console.log(`Host left, deleting room ${roomId}`);
        await remove(ref(db, `rooms/${roomId}`));
        await remove(ref(db, `publicRooms/${roomId}`));
      }
      setRoomId(null);
      setIsHost(false);
      toast.info("You left the room.");
    } catch (err) {
      console.error("Leave room error:", err);
    }
  }

  // --- UI & SCREENS ---

  // Intro screen with particles
  if (showIntro) {
    return (
      <div className="intro-container">
        {/* Floating particles */}
        {/* Floating particles */}
        {[...Array(30)].map((_, i) => {
          const size = Math.random() * 6 + 4; // 4px to 10px
          const duration = Math.random() * 5 + 4; // 4s to 9s
          const delay = Math.random() * 5; // 0s to 5s
          const left = Math.random() * 100; // 0% to 100%
          const top = Math.random() * 100; // 0% to 100%

          return (
            <div
              key={i}
              className="particle"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                left: `${left}%`,
                top: `${top}%`,
                animationDuration: `${duration}s`,
                animationDelay: `${delay}s`,
              }}
            ></div>
          );
        })}

        <h1 className="intro-title">Multiplayer Trivia</h1>
        <p className="intro-subtitle">
          Challenge your friends in real-time trivia battles!
        </p>

        <button
          className="intro-play-button"
          onClick={() => setShowIntro(false)}
        >
          ▶ Play Now
        </button>

        <div className="quick-features">
          <div className="quick-feature-card">
            🕹️ Real-time multiplayer battles
          </div>
          <div className="quick-feature-card">
            🏆 Earn points and climb leaderboards
          </div>
          <div className="quick-feature-card">
            🎯 Test your knowledge across categories
          </div>
        </div>
      </div>
    );
  }

  // Welcome screen
  if (!nameEntered) {
    return (
      <div className="welcome-screen">
        <h1>🎮 Multiplayer Trivia</h1>
        <input
          type="text"
          placeholder="Enter your name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
        <button
          onClick={() => {
            if (!playerName.trim()) return toast.error("Enter a name!");
            setNameEntered(true);
          }}
        >
          Continue
        </button>
        <ToastContainer position="top-center" autoClose={1500} />
      </div>
    );
  }

  // Lobby
  if (!roomId) {
    return (
      <div className="lobby">
        <div className="card">
          <h2>Create Room</h2>
          <label>Select Category:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(Number(e.target.value))}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label>Select Difficulty:</label>
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])
            }
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>

          <label style={{ display: "block", marginTop: 8 }}>
            Number of Questions:
          </label>
          <input
            type="number"
            min={3}
            max={50}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            style={{ width: "40%", margin: "8px 0" }}
          />
          <br />
          <button onClick={createRoom}>➕ New Room</button>
        </div>

        <div className="card">
          <h2>Join Room</h2>
          <input
            className="jop"
            type="text"
            placeholder="Enter room code"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
          />
          <button onClick={() => joinRoom()}>Join Room</button>
        </div>

        <div className="public-rooms">
          <h3>🧩 Public Rooms</h3>
          {Object.keys(publicRooms).length === 0 ? (
            <p>No rooms yet</p>
          ) : (
            Object.entries(publicRooms).map(([id, room]) => (
              <div key={id} className="room-item" onClick={() => joinRoom(id)}>
                <strong>{id}</strong> — {room.hostName} ({room.players} players)
              </div>
            ))
          )}
        </div>

        <ToastContainer position="top-center" autoClose={1500} />
      </div>
    );
  }

  // Game over + confetti overlay
  if (gameOver && roomId) {
    const finalBoardArr = Object.entries(players).sort(
      ([, a], [, b]) => b.score - a.score
    );
    const winnerEntry = finalBoardArr[0];
    const winnerName = winnerEntry ? winnerEntry[1].name || "—" : "—";
    const winnerScore = winnerEntry ? winnerEntry[1].score : 0;

    return (
      <>
        <Confetti
          width={width}
          height={height}
          numberOfPieces={500}
          recycle={false}
        />
        <div className="winner-overlay">
          <h1>🏆 {winnerName} Wins! 🏆</h1>
          <p>Score: {winnerScore}</p>
          {isHost && <button onClick={restartGame}>🔁 Restart Game</button>}
          <br></br>
          {isHost && (
            <button
              onClick={leaveRoom}
              style={{
                background: "#d33",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                cursor: "pointer",
                marginBottom: "10px",
              }}
            >
              🚪 Leave Room
            </button>
          )}
          {!isHost && (
            <button
              onClick={() => {
                setRoomId(null);
                setIsHost(false);
              }}
            >
              Leave
            </button>
          )}
        </div>
        <div className="game-layout">
          <div className="main-panel">
            <div className="card">
              <h3>Final Leaderboard</h3>
              {finalBoardArr.map(([id, p]) => (
                <div
                  key={id}
                  className={`leaderboard-item ${id === userId ? "you" : ""}`}
                >
                  <span>{p.name}</span>
                  <span>{p.score} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // If a countdown is active, show countdown overlay (clients listen to DB countdown node)
  const CountdownOverlay = () => {
    if (!countdownNumber) return null;
    return (
      <div className="next-round-overlay" style={{ zIndex: 1000 }}>
        <div className="spinner" />
        <p>Starting in {countdownNumber}...</p>
      </div>
    );
  };

  // End-of-round summary overlay (shows lastResults briefly)
  // const RoundSummaryOverlay = () => {
  //   if (!showSummary || !lastResults) return null;
  //   return (
  //     <div className="next-round-overlay" style={{ zIndex: 1000 }}>
  //       <h2>Round Results</h2>
  //       <p>
  //         Correct answer:{" "}
  //         <strong
  //           dangerouslySetInnerHTML={{ __html: lastResults.correctAnswer }}
  //         />
  //       </p>
  //       <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 12 }}>
  //         {Object.entries(lastResults.players || {}).map(([pid, info]: any) => (
  //           <div
  //             key={pid}
  //             style={{
  //               display: "flex",
  //               justifyContent: "space-between",
  //               padding: "6px 0",
  //               width: 420,
  //             }}
  //           >
  //             <div style={{ minWidth: 160 }}>{players[pid]?.name || pid}</div>
  //             <div>
  //               {info.correct ? "✅" : "❌"} (+{info.awarded || 0})
  //             </div>
  //           </div>
  //         ))}
  //       </div>
  //     </div>
  //   );
  // };

  // Main game UI
  return (
    <div className="game-layout">
      {showNextRoundOverlay && (
        <div className="next-round-overlay">
          <div className="next-round-card">
            <h2>✅ Correct Answer:</h2>
            <h3
              dangerouslySetInnerHTML={{
                __html: lastResults?.correctAnswer || "N/A",
              }}
            />
            <p>Next round in {nextRoundCountdown}s...</p>
          </div>
        </div>
      )}

      {/* Overlays (countdown + summary) */}
      {countdownNumber && <CountdownOverlay />}
      {/* {showSummary && <RoundSummaryOverlay />} */}

      <div className="main-panel">
        <h1>🔥 Room {roomId}</h1>
        <p>
          {" "}
          Category: <strong>{round?.category || "..."}</strong>{" "}
          {isHost && <span className="host-badge">🟢 Host</span>}
        </p>
        <button
          onClick={leaveRoom}
          style={{
            background: "#d33",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "6px 12px",
            cursor: "pointer",
            marginBottom: "10px",
          }}
        >
          🚪 Leave Room
        </button>

        <div style={{ marginBottom: 8 }}>
          <strong>Round:</strong>{" "}
          {round?.roundNumber ?? (currentRoundIndex || 0)}/{questionCount}
        </div>

        {isHost && (
          <div style={{ marginBottom: 8 }}>
            <button disabled={loadingQuestion} onClick={startNewRound}>
              {loadingQuestion ? "Loading..." : "🔄 Next Question"}
            </button>
            {gameOver && (
              <button style={{ marginLeft: 8 }} onClick={restartGame}>
                Restart
              </button>
            )}
          </div>
        )}

        {round?.roundActive ? (
          <div className="card question">
            <h2 dangerouslySetInnerHTML={{ __html: round.question }}></h2>
            <div
              className={`timer-bar ${
                round.remainingTime <= (round.totalTime || 20) * 0.25
                  ? "low-time"
                  : ""
              }`}
              style={{
                width: `${
                  (round.remainingTime / (round.totalTime || 20)) * 100
                }%`,
                transition: "width 1s linear",
                backgroundColor:
                  round.totalTime === 20
                    ? "green"
                    : round.totalTime === 15
                    ? "orange"
                    : "red",
                height: "8px",
                borderRadius: "4px",
                marginBottom: "4px",
              }}
            />
            <p>⏳ {round.remainingTime}s</p>

            <div className="options">
              {round.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(opt)}
                  dangerouslySetInnerHTML={{ __html: opt }}
                />
              ))}
            </div>
            <small>
              Tip: you may change your answer until the timer ends. Fast answers
              earn a small time bonus!
            </small>
          </div>
        ) : (
          <div className="card">
            <p>No active round.</p>
            {isHost ? (
              <button onClick={startNewRound}>
                {loadingQuestion ? "Loading..." : "Start Round"}
              </button>
            ) : (
              <p>Waiting for host...</p>
            )}
            {lastResults && (
              <div style={{ marginTop: 12 }}>
                <strong>Last answer:</strong>{" "}
                <span
                  dangerouslySetInnerHTML={{
                    __html: lastResults.correctAnswer,
                  }}
                />
                <div style={{ marginTop: 8 }}>
                  {Object.entries(lastResults.players || {}).map(
                    ([pid, info]: any) => (
                      <div
                        key={pid}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "4px 0",
                        }}
                      >
                        <div>{players[pid]?.name || pid}</div>
                        <div>
                          {info.correct ? "✅" : "❌"} (+{info.awarded || 0})
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="right-panel">
        <div className="leaderboard card">
          <h2>🏆 Leaderboard</h2>
          {Object.entries(players)
            .sort(([, a], [, b]) => b.score - a.score)
            .map(([id, p]) => (
              <div
                key={id}
                className={`leaderboard-item ${id === userId ? "you" : ""}`}
              >
                <span>{p.name}</span>
                <span>{p.score} pts</span>
              </div>
            ))}
        </div>

        <div className="chat card">
          <h2>💬 Chat</h2>
          <div className="chat-messages">
            {Object.entries(chatMessages)
              .sort(([, a], [, b]) => a.timestamp - b.timestamp)
              .map(([id, msg]) => (
                <div key={id}>
                  <strong>{msg.user}</strong>: {msg.text}
                </div>
              ))}
          </div>
          <div className="chat-input">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type..."
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChat();
              }}
            />
            <button onClick={sendChat}>Send</button>
          </div>
        </div>
      </div>

      <ToastContainer position="top-center" autoClose={1500} />
    </div>
  );
}
