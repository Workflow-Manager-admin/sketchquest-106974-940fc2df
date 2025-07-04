/**
 * All import statements are now located at the very top of this file per ESLint and React best practices.
 * All React hooks (useState, useEffect, useRef) are *only* called at the top level of their containing components.
 * No import statements or hook calls are present inside conditionals or after early returns.
 */
import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import LoginPage from "./components/LoginPage";
import SpinningWheelPanel from "./components/SpinningWheelPanel";
import HomePage from "./components/HomePage";
import {
  collection,
  addDoc,
  setDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  getDoc as firestoreGetDoc,
  increment as firestoreIncrement, // Alias to match usage below
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadString,
  getDownloadURL,
} from "firebase/storage";
import { db, storage } from "./firebase";

// --- Game topics and config ---
const GAME_TOPICS = [
  "Penguin", "Owl", "Parrot", "Elephant", "Kangaroo", "Lion",
  "Cat", "Dog", "Flamingo", "Peacock", "Raccoon", "Rabbit", "Fish",
  "Giraffe", "Tiger", "Frog", "Crab", "Horse", "Eagle", "Swan"
];
const DRAW_TIME = 30; // seconds

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- App Main ---
/**
 * ErrorBoundary and error-recovery helpers: must be defined before App is called to avoid "is not defined".
 */

// Error boundary for app-wide fatal errors
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error: error, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    if (window && window.console) console.error("App Fatal Error:", error, errorInfo);
  }

  handleReload = () => window.location.reload();
  handleReturnToLogin = () => {
    localStorage.removeItem("doodleFinderUser");
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-center" style={{ minHeight: "100vh", color: "#888" }}>
          <div className="navbar"
            style={{
              fontFamily: "Comic Sans MS, Comic Sans, cursive",
              fontSize: 30,
              letterSpacing: 2,
              fontWeight: 900,
              color: "#3b82f6",
              margin: "20px 0 28px 0",
              textShadow: "1px 3px 0 #fff, 0 4px 12px #c9e7ff",
            }}>
            <span style={{ color: "#3b82f6" }}>Doodle</span>
            <span style={{ color: "#f59e42", marginLeft: 8 }}>Finder</span>
            <span style={{ color: "#2ad389", marginLeft: 18, fontSize: 17 }}>LIVE</span>
          </div>
          <h2 style={{ margin: "40px 0 12px", color: "#d22" }}>
            A critical error occurred.
          </h2>
          <div style={{ color: "#aa1111", marginBottom: 18, whiteSpace: "pre-line" }}>
            {this.state.error ? String(this.state.error) : "Unknown error"}
          </div>
          <button className="btn" style={{
            background: "#3b82f6", color: "#fff", fontSize: 17,
            borderRadius: 8, padding: "10px 28px", marginRight: 7,
          }} onClick={this.handleReturnToLogin}>
            Return to Login
          </button>
          <button className="btn" style={{
            background: "#f59e42", color: "#fff", fontSize: 17,
            borderRadius: 8, padding: "10px 28px", marginLeft: 7
          }} onClick={this.handleReload}>
            Refresh App
          </button>
          <div style={{ marginTop: 26, fontSize: 13, color: "#888" }}>
            If this keeps happening, please report it!
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Missing drawing recovery component for interrupted sessions
function MissingDrawingRecovery({ setCurrentUser, setAppStage }) {
  const [rejoining, setRejoining] = useState(false);
  const errorReason =
    "Your drawing could not be found for this round. This may occur if you reloaded at an unfortunate moment or there was a connection problem.";

  const handleReturnToLogin = () => {
    localStorage.removeItem("doodleFinderUser");
    setCurrentUser(null);
    setAppStage("entry");
  };

  return (
    <div className="app-center" style={{ minHeight: "100vh", color: "#888" }}>
      <div className="navbar"
        style={{
          fontFamily: "Comic Sans MS, Comic Sans, cursive",
          fontSize: 30,
          letterSpacing: 2,
          fontWeight: 900,
          color: "#3b82f6",
          margin: "20px 0 28px 0",
          textShadow: "1px 3px 0 #fff, 0 4px 12px #c9e7ff",
        }}>
        <span style={{ color: "#3b82f6" }}>Doodle</span>
        <span style={{ color: "#f59e42", marginLeft: 8 }}>Finder</span>
        <span style={{ color: "#2ad389", marginLeft: 18, fontSize: 17 }}>LIVE</span>
      </div>
      <h2 style={{ margin: "40px 0 12px", color: "#d22" }}>
        Oops! Something went wrong this round.
      </h2>
      <div style={{ marginBottom: 24, fontSize: 16 }}>
        {errorReason}
      </div>
      <button
        className="btn"
        style={{
          background: "#3b82f6",
          color: "#fff",
          fontSize: 17,
          borderRadius: 8,
          padding: "10px 28px",
          marginRight: 7,
        }}
        onClick={handleReturnToLogin}
      >
        Return to Login
      </button>
      <button
        className="btn"
        style={{
          background: "#f59e42",
          color: "#fff",
          fontSize: 17,
          borderRadius: 8,
          padding: "10px 28px",
          marginLeft: 7,
          opacity: rejoining ? 0.7 : 1
        }}
        disabled={rejoining}
        onClick={() => window.location.reload()}
      >
        Refresh & Retry
      </button>
      <div style={{ marginTop: 26, fontSize: 13, color: "#888" }}>
        If this keeps happening, check your internet connection.
      </div>
    </div>
  );
}

// --- App Main ---
function App() {
  // Core state
  const [currentUser, setCurrentUser] = useState(() => {
    let cached = localStorage.getItem("doodleFinderUser");
    return cached ? JSON.parse(cached) : null;
  });
  const [appStage, setAppStage] = useState("entry"); // entry | topic | drawing | main | voting | result
  const [gameId, setGameId] = useState(null);
  const [topicSpin, setTopicSpin] = useState({
    spinning: false,
    selected: null,
    angle: 0,
  });
  const [gameTopic, setGameTopic] = useState(null);
  const [drawings, setDrawings] = useState([]); // {id, userId, username, drawingURL, topic}
  const [guesses, setGuesses] = useState([]);   // {userId, username, guess, drawingId, isCorrect}
  const [votes, setVotes] = useState([]);       // {userId, forDrawingId}
  const [myDrawing, setMyDrawing] = useState(null);
  const [countdown, setCountdown] = useState(DRAW_TIME);
  const [votingEnabled, setVotingEnabled] = useState(false);
  const [roundTimerActive, setRoundTimerActive] = useState(false);
  const [winnerDrawing, setWinnerDrawing] = useState(null);

  // --- Game Session Bootstrap ---
  useEffect(() => {
    // Subscribe to latest game doc
    const gamesQ = query(collection(db, "games"), orderBy("startTime", "desc"));
    const unsub = onSnapshot(gamesQ, (snap) => {
      if (!snap.empty) {
        const gameDoc = snap.docs[0];
        setGameId(gameDoc.id);
        const data = gameDoc.data();
        setGameTopic(data.topic || null);
        // Set stage based on status
        if (data.status === "topic") setAppStage("topic");
        else if (data.status === "drawing") setAppStage("drawing");
        else if (data.status === "guessing" || data.status === "main") setAppStage("main");
        else if (data.status === "voting") {
          setAppStage("voting");
          setVotingEnabled(true);
        }
        else if (data.status === "result") setAppStage("result");
        if (data.status !== "voting") setVotingEnabled(false);
      }
    });
    return unsub;
  }, []);

  // --- User Drawing Subscription ---
  useEffect(() => {
    if (!gameId) return;
    const drawingsQ = query(collection(db, "games", gameId, "drawings"), orderBy("createdAt"));
    const unsub = onSnapshot(drawingsQ, (snap) => {
      let items = [];
      snap.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
      setDrawings(items);
      if (currentUser)
        setMyDrawing(items.find(i => i.userId === currentUser.userId) || null);
    });
    return unsub;
  }, [gameId, currentUser]);

  // Guesses subscription (real-time)
  useEffect(() => {
    if (!gameId) return;
    const guessesQ = collection(db, "games", gameId, "guesses");
    const unsub = onSnapshot(guessesQ, (snap) => {
      const gs = [];
      snap.forEach(doc => gs.push(doc.data()));
      setGuesses(gs);
    });
    return unsub;
  }, [gameId]);

  // Votes subscription
  useEffect(() => {
    if (!gameId) return;
    const votesQ = collection(db, "games", gameId, "votes");
    const unsub = onSnapshot(votesQ, (snap) => {
      const vs = [];
      snap.forEach(doc => vs.push(doc.data()));
      setVotes(vs);
      // Winner detection (for result stage)
      if (appStage === "result" && drawings.length) {
        const votesCount = {};
        drawings.forEach(d => (votesCount[d.id] = 0));
        vs.forEach(v => { if (v.forDrawingId) votesCount[v.forDrawingId]++; });
        let max = -1, win = null;
        for (let dr of drawings) {
          const v = votesCount[dr.id] || 0;
          if (v > max) { max = v; win = dr; }
        }
        setWinnerDrawing(win);
      }
    });
    return unsub;
    // eslint-disable-next-line
  }, [gameId, appStage, drawings.length]);

  // Countdown for drawing phase
  useEffect(() => {
    if (appStage !== "drawing") {
      setCountdown(DRAW_TIME);
      setRoundTimerActive(false);
      return;
    }
    setRoundTimerActive(true);
    if (countdown === 0) {
      setTimeout(() => setAppStage("main"), 900);
      setRoundTimerActive(false);
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [appStage, countdown]);

  // -- User Login/Join --
  // PUBLIC_INTERFACE
  async function handleLogin(username) {
    try {
      // Check for collisions in players for current game
      // Find latest game or create if none (status: topic)
      let latestGameSnap = await getDocs(query(collection(db, "games"), orderBy("startTime", "desc")));
      let gameDocId, exists = false;
      if (!latestGameSnap.empty) {
        const g = latestGameSnap.docs[0];
        gameDocId = g.id;
        const playersQ = collection(db, "games", g.id, "players");
        const playersSnap = await getDocs(playersQ);
        for (let p of playersSnap.docs)
          if (p.data().username === username) { exists = true; break; }
      }
      if (exists) throw new Error("Username already in use. Try another!");
      const userId = "u" + Math.random().toString(36).substr(2, 9) + Date.now().toString().slice(-4);
      localStorage.setItem("doodleFinderUser", JSON.stringify({ username, userId }));
      setCurrentUser({ username, userId });
      // Join/insert to players:
      if (gameDocId) {
        await setDoc(doc(db, "games", gameDocId, "players", userId), {
          userId,
          username,
          joinedAt: serverTimestamp(),
        }, { merge: true });
      }
      setAppStage("topic");
    } catch (err) {
      // Bubble up to LoginPage for user-facing error
      throw err;
    }
  }

  // --- Start new round/game ---
  // PUBLIC_INTERFACE
  async function handleStartNewGame() {
    try {
      if (!currentUser) return;
      const newGameObj = {
        status: "topic",
        topic: null,
        startTime: serverTimestamp(),
      };
      const gameDoc = await addDoc(collection(db, "games"), newGameObj);
      setGameId(gameDoc.id);
      await setDoc(
        doc(db, "games", gameDoc.id, "players", currentUser.userId),
        {
          userId: currentUser.userId,
          username: currentUser.username,
          joinedAt: serverTimestamp(),
        }, { merge: true }
      );
      setGameTopic(null);
      setAppStage("topic");
      setRoundTimerActive(false);
      setCountdown(DRAW_TIME);
    } catch (err) {
      alert("Failed to start a new game. Check your connection and try again. " + (err.message || ""));
    }
  }

  // --- Animated Topic Spinner & Assignment ---
  // PUBLIC_INTERFACE
  async function handleSpinAndChooseTopic() {
    setTopicSpin({ spinning: true, selected: null, angle: 0 });
    let idx = Math.floor(Math.random() * GAME_TOPICS.length);
    try {
      for (let t = 0; t < 35 + idx; t++) {
        setTopicSpin((prev) => ({
          spinning: true,
          selected: GAME_TOPICS[t % GAME_TOPICS.length],
          angle: (t % GAME_TOPICS.length) * (360 / GAME_TOPICS.length)
        }));
        await sleep(45 + Math.sqrt(t) * 6);
      }
      // Save topic and move to drawing phase
      if (gameId) {
        await updateDoc(doc(db, "games", gameId), {
          topic: GAME_TOPICS[idx],
          status: "drawing",
          drawStart: serverTimestamp(),
        });
      }
      setGameTopic(GAME_TOPICS[idx]);
      setTopicSpin({ spinning: false, selected: GAME_TOPICS[idx], angle: 0 });
      setAppStage("drawing");
      setCountdown(DRAW_TIME);
      setRoundTimerActive(true);
    } catch (err) {
      alert("Failed to spin and assign topic. Try again! " + (err.message || ""));
      setTopicSpin({ spinning: false, selected: null, angle: 0 });
    }
  }

  // --- Drawing Upload and Registration ---
  // PUBLIC_INTERFACE
  /**
   * Handles drawing submission:
   *  1. Uploads image to Firebase Storage
   *  2. Saves document to Firestore under "drawings"
   *  3. Checks if all players have submitted, and if so, advances the game stage to "main"
   *  4. Triggers UI routing to ensure all drawings are shown
   */
  async function handleDrawingSubmit(dataUrl) {
    try {
      if (!currentUser || !gameId || !gameTopic) return;
      const path =
        "games/" + gameId + "/drawings/" + currentUser.userId + "_" + Date.now() + ".png";
      const sref = storageRef(storage, path);
      let url;
      try {
        await uploadString(sref, dataUrl, "data_url");
        url = await getDownloadURL(sref);
      } catch (e) {
        alert("There was an error saving your drawing. Please try again. " + e.message);
        return;
      }

      // Save drawing in Firestore (with doc id as userId for dedup)
      await setDoc(
        doc(db, "games", gameId, "drawings", currentUser.userId),
        {
          userId: currentUser.userId,
          username: currentUser.username,
          drawingURL: url,
          topic: gameTopic,
          createdAt: serverTimestamp(),
          votes: 0,
        }
      );
      setMyDrawing({
        userId: currentUser.userId,
        username: currentUser.username,
        drawingURL: url,
        topic: gameTopic,
      });

      // After storing drawing: check if all players have submitted
      // 1. Get all players
      const playersSnap = await getDocs(collection(db, "games", gameId, "players"));
      const playerIds = playersSnap.docs.map(doc => doc.id);
      // 2. Get all drawings
      const drawingsSnap = await getDocs(collection(db, "games", gameId, "drawings"));
      const drawingIds = drawingsSnap.docs.map(doc => doc.id);

      // 3. If all players have a drawing, advance stage to "main" (guessing phase)
      // (If enabled for single-player test, still proceed)
      const allSubmitted = playerIds.every(pid => drawingIds.includes(pid)) && playerIds.length > 0;
      if (allSubmitted) {
        await updateDoc(doc(db, "games", gameId), {
          status: "main" // Could also be "guessing"
        });
        setAppStage("main");
      }
    } catch (err) {
      alert("Failed to upload and register your drawing. Check your connection and retry. " + (err.message || ""));
    }
    // Otherwise, UI will update showing Doodle Submitted, waiting for others...
  }

  // --- Guess submission for a drawing ---
  // PUBLIC_INTERFACE
  /**
   * Submit a guess for a drawing. Enforces:
   *  - One guess per user per drawing
   *  - Cannot guess own drawing
   *  - If guess is correct, owner of the drawing receives a point
   */
  async function handleGuess(drawingId, guessValue) {
    try {
      if (!guessValue.trim() || !currentUser || !gameId) return;
      const targetDrawing = drawings.find(d => d.id === drawingId);
      if (!targetDrawing) return;
      // Restrict guessing one's own drawing
      if (targetDrawing.userId === currentUser.userId) return;

      // Restrict to one guess per user per drawing
      const existingGuessKey = `${currentUser.userId}_${drawingId}`;
      const guessAlreadySubmitted = guesses.some(
        (g) => g.userId === currentUser.userId && g.drawingId === drawingId
      );
      if (guessAlreadySubmitted) return;

      // Evaluate guess: correct if matches topic (case insensitive, ignores whitespace)
      let isCorrect = false;
      if (
        guessValue.trim().toLowerCase() ===
        targetDrawing.topic.trim().toLowerCase()
      ) {
        isCorrect = true;
      }

      // Save guess for this user/drawing
      await setDoc(
        doc(db, "games", gameId, "guesses", existingGuessKey),
        {
          guess: guessValue,
          userId: currentUser.userId,
          username: currentUser.username,
          drawingId,
          isCorrect,
          submittedAt: serverTimestamp(),
        }
      );

      // If guess is correct, increment owner's "points" field atomically
      if (isCorrect && targetDrawing.userId) {
        // Points for drawing owner
        const drawingUserDoc = doc(db, "games", gameId, "players", targetDrawing.userId);
        // Use Firestore increment for atomic update
        await updateDoc(drawingUserDoc, {
          points: firestoreIncrement(1),
        }).catch(() => {}); // Safe for player docs that may not exist
      }
    } catch (err) {
      alert("There was an error submitting your guess. Please check your connection and try again.");
    }
  }

  // --- Voting for a drawing ---
  // PUBLIC_INTERFACE
  async function handleVote(drawingId) {
    try {
      if (!currentUser || !gameId || !drawingId || myDrawing?.id === drawingId) return;
      // Only one vote per user
      const alreadyVoted = votes.some(
        (v) => v.userId === currentUser.userId
      );
      if (alreadyVoted) return;
      await setDoc(
        doc(db, "games", gameId, "votes", currentUser.userId),
        {
          userId: currentUser.userId,
          forDrawingId: drawingId,
          at: serverTimestamp(),
        }
      );
    } catch (err) {
      alert("Failed to submit your vote, please check your connection and try again!");
    }
  }

  // ----- UI Rendering Switched by Stage ------
  if (!currentUser || appStage === "entry") {
    return (
      <LoginPage
        onLogin={handleLogin}
        accentColor="#f59e42"
        primaryColor="#3b82f6"
      />
    );
  }

  // Topic spinning wheel
  if (appStage === "topic") {
    return (
      <SpinningWheelPanel
        topics={GAME_TOPICS}
        topicSpin={topicSpin}
        onSpin={handleSpinAndChooseTopic}
        selectedTopic={topicSpin.selected}
        disabled={topicSpin.spinning}
      />
    );
  }

  // Drawing Canvas & Timer (inline)
  if (appStage === "drawing") {
    // DoodleCanvas inline here to keep output within one file for simplicity
    // (as subtask did not request splitting this part)
    return (
      <div className="app-center">
        <div className="navbar" style={{
          fontFamily: "Comic Sans MS, Comic Sans, cursive",
          fontSize: 30,
          letterSpacing: 2,
          fontWeight: 900,
          color: "#3b82f6",
          margin: "20px 0 28px 0",
          textShadow: "1px 3px 0 #fff, 0 4px 12px #c9e7ff",
        }}>
          <span style={{ color: "#3b82f6" }}>Doodle</span>
          <span style={{ color: "#f59e42", marginLeft: 8 }}>Finder</span>
          <span style={{ color: "#2ad389", marginLeft: 18, fontSize: 17 }}>LIVE</span>
        </div>
        <div className="card" style={{
          background: myDrawing ? "#f8f6f1" : "#fcfdfd",
          padding: 30,
          borderRadius: 18,
          margin: "0 auto",
        }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{
              display: "inline-block",
              background: "#fff6e6",
              color: "#f59e42",
              borderRadius: 12,
              padding: "8px 18px",
              fontWeight: 800,
              fontSize: 22,
              fontFamily: "Comic Sans MS, Comic Sans, cursive",
              letterSpacing: 2,
              boxShadow: "0px 1px 7px #f59e427e",
              border: "2.2px solid #f59e42"
            }}>
              Topic: {gameTopic}
            </span>
          </div>
          {!myDrawing ? (
            <>
              <h2 style={{ color: "#3b82f6" }}>Draw this!</h2>
              <div style={{ marginBottom: 22, fontSize: 17, color: "#888" }}>
                You have <b style={{ color: "#f59e42" }}>{countdown}</b> seconds!
              </div>
              <DoodleCanvas submitCb={handleDrawingSubmit} disabled={false} />
            </>
          ) : (
            <>
              <h2 style={{ color: "#3b82f6" }}>Doodle Submitted!</h2>
              <div style={{ fontSize: 18, color: "#666", margin: "18px 0" }}>
                Waiting for others to finish...
              </div>
              <img
                src={myDrawing.drawingURL}
                alt="your doodle"
                style={{
                  width: "235px",
                  boxShadow: "0 2px 16px 0 #eccc9c",
                  border: "4px solid #f59e42",
                  margin: "16px 0",
                }}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  // --- ENFORCED USER FLOW FOR COMPETITION/RESULTS ---
  // HomePage: Only show guess input if at least one drawing is not by the current user
  if (appStage === "main" || appStage === "guessing") {
    // Detect if there is at least one other's drawing
    const otherDrawings = drawings.filter(
      (d) => currentUser && d.userId !== currentUser.userId
    );

    // If user's own drawing is missing (e.g., reload mid-round or data race), provide recovery options
    if (!myDrawing) {
      return (
        <MissingDrawingRecovery setCurrentUser={setCurrentUser} setAppStage={setAppStage} />
      );
    }

    return (
      <HomePage
        user={currentUser}
        drawings={drawings}
        guesses={guesses}
        votes={votes}
        onGuess={otherDrawings.length === 0 ? () => {} : handleGuess}
        onVote={handleVote}
        votingEnabled={false}
        roundTimer={null}
        showGuessInput={otherDrawings.length !== 0}
        myUserId={currentUser.userId}
        errorMessage={null}
      />
    );
  }

  // Voting phase
  if (appStage === "voting") {
    return (
      <HomePage
        user={currentUser}
        drawings={drawings}
        guesses={guesses}
        votes={votes}
        onGuess={() => {}}
        onVote={handleVote}
        votingEnabled={true}
        roundTimer={null}
      />
    );
  }

  // Result phase
  if (appStage === "result") {
    return (
      <div className="app-center">
        <div className="navbar"
          style={{
            fontFamily: "Comic Sans MS, Comic Sans, cursive",
            fontSize: 30,
            letterSpacing: 2,
            fontWeight: 900,
            color: "#3b82f6",
            margin: "20px 0 28px 0",
            textShadow: "1px 3px 0 #fff, 0 4px 12px #c9e7ff",
          }}
        >
          <span style={{ color: "#3b82f6" }}>Doodle</span>
          <span style={{ color: "#f59e42", marginLeft: 8 }}>Finder</span>
          <span style={{ color: "#2ad389", marginLeft: 18, fontSize: 17 }}>LIVE</span>
        </div>
        <div className="card" style={{
          padding: 30,
          borderRadius: 17,
          background: "#fcfdfd",
          margin: "0 auto",
        }}>
          <h1 style={{ color: "#3b82f6" }}>🎉 Winner!</h1>
          <div style={{ fontSize: 26, margin: "10px 0", color: "#f59e42" }}>
            {winnerDrawing?.username === currentUser.username
              ? "You are the Winner! 🏆"
              : `${winnerDrawing?.username} wins the round!`}
          </div>
          <img
            src={winnerDrawing?.drawingURL}
            alt="winning doodle"
            style={{
              width: 200,
              border: "6px solid #3b82f6",
              borderRadius: 20,
              boxShadow: "0 3px 16px #aacffd",
              margin: "28px 0",
            }}
          />
          <div style={{ margin: "15px 0" }}>
            <span style={{ color: "#888" }}>Drawing Topic: </span>
            <span style={{ color: "#222", fontWeight: 700, fontSize: 18 }}>
              {winnerDrawing?.topic}
            </span>
          </div>
          <div style={{ margin: "21px 0" }}>
            <table style={{ width: "100%", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ color: "#555", fontWeight: 600 }}>Player</th>
                  <th style={{ color: "#555", fontWeight: 600 }}>Votes</th>
                </tr>
              </thead>
              <tbody>
                {[...drawings]
                  .sort((a, b) => (b.votes || 0) - (a.votes || 0))
                  .map((d, ix) => (
                    <tr
                      key={d.id}
                      style={{
                        background:
                          ix === 0
                            ? "#fffde8"
                            : ix === 1
                            ? "#f1f8ff"
                            : undefined,
                      }}
                    >
                      <td style={{ color: "#3b82f6", fontWeight: 500, padding: 5 }}>
                        {d.username}
                        {currentUser.username === d.username && " (You)"}
                      </td>
                      <td style={{ color: "#f59e42", fontWeight: 700 }}>
                        {d.votes || 0}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn"
            style={{ background: "#3b82f6", color: "#fff", fontSize: 18, borderRadius: 9, padding: "12px 34px" }}
            onClick={handleStartNewGame}
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // fallback
  return <div>Invalid state</div>;
}



const AppExportWithBoundary = (props) => (
  <AppErrorBoundary>
    <App {...props} />
  </AppErrorBoundary>
);

export default AppExportWithBoundary;

// --- Topic Spinner ---
function TopicSpinner({
  topics,
  topicSpin,
  onSpin,
  user,
  gameStarted,
  startNewGame,
}) {
  return (
    <div className="app-center" style={{ minHeight: "100vh" }}>
      <GameHeader />
      <div className="card" style={{ padding: 30, borderRadius: 18, background: "#fcfdfd", margin: "0 auto" }}>
        <h2 style={{ color: "#3b82f6" }}>Spin to Pick a Drawing Topic!</h2>
        <div className="spinner-box" style={{ margin: "44px auto" }}>
          <Wheel topics={topics} spin={topicSpin} />
        </div>
        <div style={{ marginBottom: 16 }}>
          {topicSpin.selected && (
            <div
              style={{
                fontSize: 26,
                margin: "14px 0",
                color: "#f59e42",
                fontFamily: "Comic Sans MS, Comic Sans, cursive",
                letterSpacing: 2,
              }}
            >
              Topic: {topicSpin.selected}
            </div>
          )}
        </div>
        <button
          className="btn"
          style={{
            background: "#f59e42",
            color: "#fff",
            fontSize: 22,
            padding: "14px 34px",
            marginTop: 14,
            borderRadius: 10,
            letterSpacing: 2,
          }}
          onClick={onSpin}
          disabled={topicSpin.spinning}
        >
          {topicSpin.spinning ? "Spinning..." : "Spin & Start!"}
        </button>
        {gameStarted && (
          <div style={{ marginTop: 34 }}>
            <button className="btn" style={{ color: "#3b82f6", background: "#ececec", borderRadius: 7 }}
              onClick={startNewGame}
            >
              🆕 New Game (reset)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Wheel component (animated) ---
function Wheel({ topics, spin }) {
  const radius = 120;
  const canvasRef = useRef();
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, 2 * radius, 2 * radius);
    // Draw segments
    const anglePer = (2 * Math.PI) / topics.length;
    for (let i = 0; i < topics.length; i++) {
      ctx.beginPath();
      ctx.moveTo(radius, radius);
      ctx.arc(
        radius,
        radius,
        radius,
        anglePer * i + (spin.angle * Math.PI) / 180,
        anglePer * (i + 1) + (spin.angle * Math.PI) / 180
      );
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? "#f59e42" : "#3b82f6";
      ctx.globalAlpha = 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      // Text
      ctx.save();
      ctx.translate(radius, radius);
      ctx.rotate(anglePer * (i + 0.5) + (spin.angle * Math.PI) / 180);
      ctx.textAlign = "right";
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(topics[i], radius - 18, 7);
      ctx.restore();
    }
    // Arrow
    ctx.beginPath();
    ctx.moveTo(radius, 10);
    ctx.lineTo(radius - 15, 35);
    ctx.lineTo(radius + 15, 35);
    ctx.closePath();
    ctx.fillStyle = "#da2222";
    ctx.fill();
  }, [spin, topics, radius]);
  return (
    <canvas
      ref={canvasRef}
      width={2 * radius}
      height={2 * radius}
      style={{ borderRadius: "50%", background: "#fff", boxShadow: "0 2px 14px 0 #e0e0e0" }}
      aria-label="Spinning Wheel"
    />
  );
}

// --- Drawing Panel ---
function DrawingPanel({ topic, onSubmit, countdown, myDrawingData, accentColor }) {
  const [submitted, setSubmitted] = useState(false);
  const [drawingDataUrl, setDrawingDataUrl] = useState(null);

  const submitDrawing = async () => {
    if (!drawingDataUrl) {
      alert("Draw something before submitting!");
      return;
    }
    await onSubmit(drawingDataUrl);
    setSubmitted(true);
  };

  // The topic should be visible to the user whether before or after submission
  return (
    <div className="app-center">
      <GameHeader />
      <div
        className="card"
        style={{
          background: submitted || myDrawingData ? "#f8f6f1" : "#fcfdfd",
          padding: 30,
          borderRadius: 18,
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              display: "inline-block",
              background: "#fff6e6",
              color: accentColor,
              borderRadius: 12,
              padding: "8px 18px",
              fontWeight: 800,
              fontSize: 22,
              fontFamily: "Comic Sans MS, Comic Sans, cursive",
              letterSpacing: 2,
              boxShadow: "0px 1px 7px #f59e427e",
              border: `2.2px solid ${accentColor}`,
            }}
          >
            Topic:&nbsp;{topic}
          </span>
        </div>

        {!submitted && !myDrawingData && (
          <>
            <h2 style={{ color: "#3b82f6" }}>
              Draw this!
            </h2>
            <div style={{ marginBottom: 22, fontSize: 17, color: "#888" }}>
              You have <b style={{ color: "#f59e42" }}>{countdown}</b> seconds!
            </div>
            <DoodleCanvas
              submitCb={setDrawingDataUrl}
              disabled={submitted}
            />
            <button
              className="btn"
              style={{
                background: accentColor,
                color: "#fff",
                padding: "10px 34px",
                marginTop: 18,
                fontSize: 18,
                borderRadius: 8,
                fontWeight: 700,
              }}
              disabled={!drawingDataUrl || submitted}
              onClick={submitDrawing}
            >
              Submit Drawing
            </button>
          </>
        )}

        {(submitted || myDrawingData) && (
          <>
            <h2 style={{ color: "#3b82f6" }}>Doodle Submitted!</h2>
            <div style={{ fontSize: 18, color: "#666", margin: "18px 0" }}>
              Waiting for others to finish...
            </div>
            <img
              src={myDrawingData?.drawingURL || drawingDataUrl}
              alt="your doodle"
              style={{
                width: "235px",
                boxShadow: "0 2px 16px 0 #eccc9c",
                border: "4px solid #f59e42",
                margin: "16px 0",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// --- Canvas Drawing ---
function DoodleCanvas({ submitCb, disabled }) {
  const canvasRef = useRef();
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState("draw"); // or 'erase'

  useEffect(() => {
    submitCb(canvasRef.current?.toDataURL());
    // eslint-disable-next-line
  }, []);

  const start = (e) => {
    if (disabled) return;
    setDrawing(true);
    draw(e, true);
  };
  const end = () => setDrawing(false);

  function draw(e, justStarted = false) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x =
      (e.touches ? e.touches[0].clientX : e.nativeEvent.offsetX || e.nativeEvent.layerX) -
      (e.touches ? rect.left : 0);
    const y =
      (e.touches ? e.touches[0].clientY : e.nativeEvent.offsetY || e.nativeEvent.layerY) -
      (e.touches ? rect.top : 0);
    if (justStarted) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (drawing) {
      ctx.lineTo(x, y);
      ctx.strokeStyle = mode === "draw" ? "#262626" : "#fff";
      ctx.lineCap = "round";
      ctx.lineWidth = mode === "draw" ? 4 : 20;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    // Update preview
    submitCb(canvas.toDataURL());
  }

  function clearCanvas() {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    submitCb(c.toDataURL());
  }

  return (
    <div style={{ margin: "15px auto 0", display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        width={340}
        height={320}
        style={{
          background: "#fff",
          border: "3px solid #3b82f6",
          borderRadius: 18,
          boxShadow: "0 2px 6px #e1e6ef66",
          cursor: mode === "draw" ? "crosshair" : "not-allowed",
        }}
        onMouseDown={start}
        onTouchStart={start}
        onMouseUp={end}
        onTouchEnd={end}
        onMouseMove={draw}
        onTouchMove={draw}
        onMouseLeave={end}
      ></canvas>
      <div style={{ marginTop: 9, display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          className="btn"
          style={{
            background: "#ececec",
            color: "#222",
            borderRadius: 8,
            fontWeight: 700,
          }}
          onClick={clearCanvas}
          disabled={disabled}
        >
          Clear
        </button>
        <button
          className="btn"
          style={{
            background: "#3b82f6",
            color: "#fff",
            borderRadius: 8,
            fontWeight: 700,
            opacity: mode === "erase" ? 0.88 : 0.62,
            border: mode === "erase" ? "2px solid #f59e42" : "",
          }}
          onClick={() => setMode(mode === "draw" ? "erase" : "draw")}
          disabled={disabled}
        >
          {mode === "draw" ? "Switch to Erase" : "Switch to Draw"}
        </button>
      </div>
    </div>
  );
}

// --- Guessing Panel ---
function GuessingPanel({
  allDrawings,
  myDrawingData,
  guessInput,
  setGuessInput,
  submitGuess,
  guesses,
}) {
  return (
    <div className="app-center">
      <GameHeader />
      <div className="card" style={{ padding: 30, margin: "0 auto", borderRadius: 18 }}>
        <h2 style={{ color: "#3b82f6" }}>Guess other's Doodles!</h2>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", margin: "10px 0" }}>
          {allDrawings
            .filter((d) => d.userId !== myDrawingData?.userId)
            .map((drawing) => (
              <div
                key={drawing.id}
                className="drawing-thumb"
                style={{
                  width: 150,
                  margin: "10px",
                  background: "#fff",
                  border: "2px solid #f59e42",
                  borderRadius: 18,
                  boxShadow: "0 2px 4px #fc8",
                  padding: 10,
                  textAlign: "center",
                }}
              >
                <img
                  src={drawing.drawingURL}
                  alt="doodle"
                  style={{ width: "100%", borderRadius: 12 }}
                />
                <span style={{ color: "#3b82f6", fontWeight: "bold", fontSize: 15 }}>
                  By: {drawing.username}
                </span>
              </div>
            ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitGuess();
          }}
          style={{ margin: "25px 0 0 0" }}
        >
          <input
            className="modern-input"
            placeholder="Your guess? (optional, for fun)"
            maxLength={32}
            style={{
              padding: 10,
              fontSize: 18,
              borderRadius: 8,
              marginRight: 12,
              minWidth: 200,
            }}
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value)}
          />
          <button
            className="btn"
            style={{
              padding: "10px 28px",
              background: "#3b82f6",
              color: "#fff",
              borderRadius: 7,
              fontWeight: 600,
              fontSize: 17,
            }}
            type="submit"
          >
            Submit Guess
          </button>
        </form>
        <div style={{ marginTop: 27 }}>
          <span style={{ color: "#888" }}>Recent guesses:</span>
          <div>
            {guesses.slice(-4).map((g, i) => (
              <li key={i} style={{ color: "#6a5acd", fontSize: 16 }}>
                {g.username}: {g.guess}
              </li>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Voting Panel ---
function VotingPanel({ allDrawings, myDrawingData, hasVoted, castVote }) {
  return (
    <div className="app-center">
      <GameHeader />
      <div
        className="card"
        style={{ padding: 24, background: "#fcfdfd", borderRadius: 17 }}
      >
        <h2 style={{ color: "#3b82f6", marginBottom: 20 }}>Vote for your Favorite!</h2>
        <div
          style={{
            display: "flex",
            gap: 25,
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: 15,
          }}
        >
          {allDrawings.map((drawing) => (
            <div
              key={drawing.id}
              className="draw-thumb"
              style={{
                border: "3px solid #3b82f6",
                borderRadius: 18,
                background: "#fff",
                padding: 12,
                margin: "10px 0px",
                boxShadow: "0 2px 8px #aee9ff99",
                textAlign: "center",
                position: "relative"
              }}
            >
              <img
                src={drawing.drawingURL}
                alt="doodle"
                style={{ width: 130, borderRadius: 12 }}
              />
              <div>
                <span style={{ color: "#f59e42", fontWeight: 700 }}>
                  By: {drawing.username}
                </span>
              </div>
              <button
                className="btn"
                style={{
                  background: "#f59e42",
                  color: "#fff",
                  borderRadius: 10,
                  fontWeight: "bold",
                  fontSize: 17,
                  padding: "8px 12px",
                  marginTop: 7,
                  opacity: !hasVoted && myDrawingData?.id !== drawing.id ? 1 : 0.7,
                  cursor: hasVoted || myDrawingData?.id === drawing.id ? "not-allowed" : "pointer",
                }}
                disabled={hasVoted || myDrawingData?.id === drawing.id}
                onClick={() => castVote(drawing.id)}
              >
                {myDrawingData?.id === drawing.id
                  ? "You"
                  : hasVoted
                  ? "Voted"
                  : "Vote"}
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24 }}>
          {!hasVoted ? (
            <span style={{ color: "#888" }}>
              You cannot vote for your own doodle.
            </span>
          ) : (
            <span style={{ color: "#15b230" }}>
              Thanks for voting! Waiting for results...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Winner Announcement Panel ---
function WinnerPanel({ allDrawings, winner, user, onPlayAgain }) {
  return (
    <div className="app-center">
      <GameHeader />
      <div className="card" style={{ padding: 30, borderRadius: 17, background: "#fcfdfd", margin: "0 auto" }}>
        <h1 style={{ color: "#3b82f6" }}>🎉 Winner!</h1>
        <div style={{ fontSize: 26, margin: "10px 0", color: "#f59e42" }}>
          {winner?.username === user.username
            ? "You are the Winner! 🏆"
            : `${winner?.username} wins the round!`}
        </div>
        <img
          src={winner?.drawingURL}
          alt="winning doodle"
          style={{
            width: 200,
            border: "6px solid #3b82f6",
            borderRadius: 20,
            boxShadow: "0 3px 16px #aacffd",
            margin: "28px 0",
          }}
        />
        <div style={{ margin: "15px 0" }}>
          <span style={{ color: "#888" }}>Drawing Topic: </span>
          <span style={{ color: "#222", fontWeight: 700, fontSize: 18 }}>
            {winner?.topic}
          </span>
        </div>
        <div style={{ margin: "21px 0" }}>
          <table style={{ width: "100%", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ color: "#555", fontWeight: 600 }}>Player</th>
                <th style={{ color: "#555", fontWeight: 600 }}>Votes</th>
              </tr>
            </thead>
            <tbody>
              {[...allDrawings]
                .sort((a, b) => (b.votes || 0) - (a.votes || 0))
                .map((d, ix) => (
                  <tr
                    key={d.id}
                    style={{
                      background:
                        ix === 0
                          ? "#fffde8"
                          : ix === 1
                          ? "#f1f8ff"
                          : undefined,
                    }}
                  >
                    <td style={{ color: "#3b82f6", fontWeight: 500, padding: 5 }}>
                      {d.username}
                      {user.username === d.username && " (You)"}
                    </td>
                    <td style={{ color: "#f59e42", fontWeight: 700 }}>
                      {d.votes || 0}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <button className="btn" style={{ background: "#3b82f6", color: "#fff", fontSize: 18, borderRadius: 9, padding: "12px 34px" }} onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}

// --- Header branding/status ---
function GameHeader() {
  return (
    <div
      className="navbar"
      style={{
        fontFamily: "Comic Sans MS, Comic Sans, cursive",
        fontSize: 30,
        letterSpacing: 2,
        fontWeight: 900,
        color: "#3b82f6",
        margin: "20px 0 28px 0",
        textShadow: "1px 3px 0 #fff, 0 4px 12px #c9e7ff",
      }}
    >
      <span style={{ color: "#3b82f6" }}>Doodle</span>
      <span style={{ color: "#f59e42", marginLeft: 8 }}>Finder</span>
      <span style={{ color: "#2ad389", marginLeft: 18, fontSize: 17 }}>
        LIVE
      </span>
    </div>
  );
}

// --- CSS additions for playful, vibrant style (inline) ---
const style = document.createElement("style");
style.innerHTML = `
.app-center {
  display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 100vh; background: linear-gradient(40deg, #f6fbff 0%, #fcfdfd 100%);
  padding-top: 30px;
}
.btn {
  border: none;
  outline: none;
  font-family: inherit;
  font-weight: 700;
  border-radius: 7px;
  transition: all 0.16s ease;
  cursor: pointer;
  box-shadow: 0 2px 7px 0 #e7e7e77e;
}
.btn:active {
  transform: translateY(2px);
  opacity: 0.86;
}
.modern-input {
  background: #fff;
  border: 2px solid #3b82f6;
  font-size: 18px;
  padding: 8px 16px;
  border-radius: 9px;
  margin-bottom: 8px;
  min-width: 210px;
}
.card {
  box-shadow: 0 4px 24px 0 #f2f5fa33;
  border: 1.5px solid #c3dbfe22;
}
.modern-loader:after {
  content: '';
  display: block;
  margin: 20px auto;
  width: 40px; height: 40px;
  border-radius: 50%;
  border: 5px solid #39f6;
  border-top: 5px solid #f59e42;
  animation: spin 1s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }
@media (max-width:600px){
  .card { padding: 17px !important;}
  .app-center { padding-top: 14px; }
}
`;
document.head.appendChild(style);

// PUBLIC_INTERFACE
