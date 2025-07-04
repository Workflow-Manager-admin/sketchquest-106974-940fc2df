import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { db, storage } from "./firebase";
import {
  collection,
  addDoc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadString,
  getDownloadURL,
} from "firebase/storage";

// --- CONFIG ---
const GAME_TOPICS = [
  "Penguin",
  "Owl",
  "Parrot",
  "Elephant",
  "Kangaroo",
  "Lion",
  "Cat",
  "Dog",
  "Flamingo",
  "Peacock",
  "Raccoon",
  "Rabbit",
  "Fish",
  "Giraffe",
  "Tiger",
  "Frog",
  "Crab",
  "Horse",
  "Eagle",
  "Swan",
];
const DRAW_TIME = 30; // seconds

// --- UTILITIES ---
// PUBLIC_INTERFACE
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// PUBLIC_INTERFACE
function useQueryCollectionSnapshot(q, onChange) {
  useEffect(() => {
    const unsub = onSnapshot(q, onChange);
    return () => unsub();
  }, [q, onChange]);
}

// --- COMPONENTS ---
function DoodleFinder() {
  // State
  const [currentUser, setCurrentUser] = useState(null); // { username, userId }
  const [stage, setStage] = useState("entry"); // entry | spinning | drawing | guessing | voting | result
  const [gameData, setGameData] = useState(null); // { id,... }
  const [allDrawings, setAllDrawings] = useState([]); // List of {id, userId, username, drawingURL, votes, topic}
  const [myDrawingData, setMyDrawingData] = useState(null);
  const [topicSpin, setTopicSpin] = useState({
    spinning: false,
    selected: null,
    angle: 0,
  });
  const [countdown, setCountdown] = useState(DRAW_TIME);
  const [guessInput, setGuessInput] = useState("");
  const [guesses, setGuesses] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [winner, setWinner] = useState(null);

  // --- On mount: session/user management ---
  useEffect(() => {
    let cached = localStorage.getItem("doodleFinderUser");
    if (cached) {
      setCurrentUser(JSON.parse(cached));
      setStage("spinning");
    }
  }, []);

  // --- Real-time game data subscription ---
  useEffect(() => {
    // Subscribe to the latest game (the document with the latest startTime)
    const gamesQ = query(collection(db, "games"), orderBy("startTime", "desc"));
    const unsub = onSnapshot(gamesQ, (snap) => {
      if (!snap.empty) {
        const d = { ...snap.docs[0].data(), id: snap.docs[0].id };
        setGameData(d);
        if (d.status === "drawing") setStage("drawing");
        else if (d.status === "guessing") setStage("guessing");
        else if (d.status === "voting") setStage("voting");
        else if (d.status === "result") setStage("result");
      }
    });
    return unsub;
  }, []);

  // --- Real-time drawings (after gameData available) ---
  useEffect(() => {
    if (!gameData) return;
    const drawingsQ = query(
      collection(db, "games", gameData.id, "drawings"),
      orderBy("createdAt")
    );
    const unsub = onSnapshot(drawingsQ, (snap) => {
      const items = [];
      snap.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setAllDrawings(items);
      // Find my drawing (if present)
      if (currentUser)
        setMyDrawingData(
          items.find((i) => i.userId === currentUser.userId) || null
        );
    });
    return unsub;
    // eslint-disable-next-line
  }, [gameData, currentUser]);

  // --- Real-time guesses (only for this round) ---
  useEffect(() => {
    if (!gameData || stage !== "guessing") return;
    const guessesQ = collection(db, "games", gameData.id, "guesses");
    const unsub = onSnapshot(guessesQ, (snap) => {
      const gs = [];
      snap.forEach((doc) => gs.push(doc.data()));
      setGuesses(gs);
    });
    return unsub;
  }, [gameData, stage]);

  // --- Real-time votes ---
  useEffect(() => {
    if (!gameData || stage !== "voting") return;
    const votesQ = collection(db, "games", gameData.id, "votes");
    const unsub = onSnapshot(votesQ, (snap) => {
      const raw = [];
      snap.forEach((doc) => raw.push(doc.data()));
      // Calculate vote counts per drawing
      if (allDrawings.length === 0) return;
      const idToVotes = {};
      allDrawings.forEach((d) => (idToVotes[d.id] = 0));
      raw.forEach((v) => {
        if (v.forDrawingId && idToVotes[v.forDrawingId] !== undefined)
          idToVotes[v.forDrawingId]++;
      });
      setAllDrawings((prev) =>
        prev.map((d) => ({
          ...d,
          votes: idToVotes[d.id] || 0,
        }))
      );
      // Winner?
      if (gameData?.status === "result") {
        let max = -1;
        let win = null;
        for (let dr of allDrawings) {
          const v = idToVotes[dr.id] || 0;
          if (v > max) {
            max = v;
            win = dr;
          }
        }
        if (win) setWinner(win);
      }
    });
    return unsub;
    // eslint-disable-next-line
  }, [gameData, stage, allDrawings.length]);

  // --- Countdown logic for drawing phase ---
  useEffect(() => {
    if (stage !== "drawing") {
      setCountdown(DRAW_TIME);
      return;
    }
    if (countdown === 0) {
      setTimeout(() => setStage("guessing"), 1000);
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [countdown, stage]);

  // PUBLIC_INTERFACE
  async function handleUserEntry(name) {
    // Check for collision (username uniqueness)
    const latestGameSnap = await getDocs(
      query(collection(db, "games"), orderBy("startTime", "desc"))
    );
    let exists = false;
    if (!latestGameSnap.empty) {
      const gameId = latestGameSnap.docs[0].id;
      const playersQ = collection(db, "games", gameId, "players");
      const playersSnap = await getDocs(playersQ);
      for (let p of playersSnap.docs) {
        if (p.data().username === name) {
          exists = true;
          break;
        }
      }
    }
    if (exists) {
      alert("This username is already taken. Please choose another.");
      return;
    }
    const uid =
      "u" +
      Math.random().toString(36).substr(2, 9) +
      Date.now().toString().slice(-4);
    localStorage.setItem(
      "doodleFinderUser",
      JSON.stringify({ username: name, userId: uid })
    );
    setCurrentUser({ username: name, userId: uid });
    setStage("spinning");
    // Add to players
    if (!latestGameSnap.empty) {
      const gameId = latestGameSnap.docs[0].id;
      await setDoc(
        doc(db, "games", gameId, "players", uid),
        {
          userId: uid,
          username: name,
          joinedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  // PUBLIC_INTERFACE
  async function startNewGame() {
    // Only for first user or to force cycle
    const game = {
      status: "drawing",
      topic: null, // will spin
      startTime: serverTimestamp(),
    };
    const gameDoc = await addDoc(collection(db, "games"), game);
    // Also add self to players
    await setDoc(
      doc(db, "games", gameDoc.id, "players", currentUser.userId),
      {
        userId: currentUser.userId,
        username: currentUser.username,
        joinedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setStage("spinning");
    setGameData({ ...game, id: gameDoc.id });
    // Topic will be picked after spinner
  }

  // PUBLIC_INTERFACE
  async function handleSpinAndPickTopic() {
    // Animate and submit chosen topic
    setTopicSpin({ spinning: true, selected: null, angle: 0 });
    let idx = Math.floor(Math.random() * GAME_TOPICS.length);
    let angle = 0;
    for (let t = 0; t < 35 + idx; t++) {
      setTopicSpin((prev) => ({
        spinning: true,
        selected: GAME_TOPICS[t % GAME_TOPICS.length],
        angle: (t % GAME_TOPICS.length) * (360 / GAME_TOPICS.length),
      }));
      // linear slow down
      await sleep(45 + Math.sqrt(t) * 6);
    }
    // Save topic to gameData
    await updateDoc(doc(db, "games", gameData.id), {
      topic: GAME_TOPICS[idx],
      status: "drawing",
      drawStart: serverTimestamp(),
    });
    setTopicSpin({ spinning: false, selected: GAME_TOPICS[idx], angle: 0 });
    setStage("drawing");
  }

  // PUBLIC_INTERFACE
  async function uploadDrawing(dataUrl) {
    // Upload to Firebase Storage
    const path =
      "games/" +
      gameData.id +
      "/drawings/" +
      currentUser.userId +
      "_" +
      Date.now() +
      ".png";
    const sref = storageRef(storage, path);
    await uploadString(sref, dataUrl, "data_url");
    const url = await getDownloadURL(sref);
    // Store in Firestore
    await setDoc(
      doc(db, "games", gameData.id, "drawings", currentUser.userId),
      {
        userId: currentUser.userId,
        username: currentUser.username,
        drawingURL: url,
        topic: gameData.topic,
        createdAt: serverTimestamp(),
        votes: 0,
      }
    );
  }

  // PUBLIC_INTERFACE
  async function submitGuess() {
    if (!guessInput.trim()) return;
    // No points, for fun
    await setDoc(
      doc(db, "games", gameData.id, "guesses", currentUser.userId),
      {
        guess: guessInput,
        userId: currentUser.userId,
        username: currentUser.username,
        submittedAt: serverTimestamp(),
      }
    );
    setGuessInput("");
  }

  // PUBLIC_INTERFACE
  async function castVote(drawingId) {
    if (
      hasVoted ||
      !drawingId ||
      (myDrawingData && drawingId === myDrawingData.id)
    )
      return;
    await setDoc(
      doc(db, "games", gameData.id, "votes", currentUser.userId),
      {
        userId: currentUser.userId,
        forDrawingId: drawingId,
        at: serverTimestamp(),
      }
    );
    setHasVoted(true);
  }

  // --- Stage-based views ---
  if (!currentUser || stage === "entry")
    return (
      <UsernameEntry
        onSubmit={handleUserEntry}
        accentColor="#f59e42"
        primaryColor="#3b82f6"
      />
    );

  if (!gameData)
    return (
      <div className="app-center">
        <GameHeader />
        <div className="modern-loader" />
        <div style={{ marginTop: 24, color: "#888" }}>
          Connecting to game...
          <p>
            <button className="btn" onClick={startNewGame}>
              Start New Game
            </button>
          </p>
        </div>
      </div>
    );

  if (stage === "spinning" && !gameData.topic)
    return (
      <TopicSpinner
        topics={GAME_TOPICS}
        topicSpin={topicSpin}
        onSpin={handleSpinAndPickTopic}
        user={currentUser}
        gameStarted={!!gameData.startTime}
        startNewGame={startNewGame}
      />
    );
  if (stage === "drawing")
    return (
      <DrawingPanel
        topic={gameData.topic}
        onSubmit={uploadDrawing}
        countdown={countdown}
        myDrawingData={myDrawingData}
        accentColor="#f59e42"
      />
    );
  if (stage === "guessing")
    return (
      <GuessingPanel
        allDrawings={allDrawings}
        myDrawingData={myDrawingData}
        guessInput={guessInput}
        setGuessInput={setGuessInput}
        submitGuess={submitGuess}
        guesses={guesses}
      />
    );
  if (stage === "voting")
    return (
      <VotingPanel
        allDrawings={allDrawings}
        myDrawingData={myDrawingData}
        hasVoted={hasVoted}
        castVote={castVote}
      />
    );
  if (stage === "result")
    return (
      <WinnerPanel
        allDrawings={allDrawings}
        winner={winner}
        user={currentUser}
        onPlayAgain={startNewGame}
      />
    );

  return <div>Invalid state</div>;
}

// --- Username Entry ---
function UsernameEntry({ onSubmit, accentColor, primaryColor }) {
  const [name, setName] = useState("");
  return (
    <div className="app-center" style={{ height: "100vh", justifyContent: "center" }}>
      <GameHeader />
      <div className="card" style={{ padding: 36, margin: "0 auto", borderRadius: 20, background: "#fcfdfd" }}>
        <h2 className="title" style={{ color: primaryColor, letterSpacing: 2 }}>
          Welcome to <span style={{ color: accentColor }}>Doodle Finder!</span>
        </h2>
        <div style={{ fontSize: 18, marginBottom: 36 }}>
          Enter a unique username to join the live game:
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) return;
            onSubmit(name.trim());
          }}
        >
          <input
            className="modern-input"
            style={{ fontSize: 22, padding: 10, borderRadius: 8, borderColor: primaryColor }}
            placeholder="Username (no email, just a fun name!)"
            maxLength={15}
            autoFocus
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
          />
          <br />
          <button
            className="btn"
            style={{
              background: primaryColor,
              color: "#fff",
              padding: "12px 36px",
              fontSize: 22,
              marginTop: 16,
              borderRadius: 8,
              letterSpacing: 1,
              cursor: "pointer",
            }}
            type="submit"
            disabled={name.length < 2}
          >
            Enter Game
          </button>
        </form>
      </div>
      <div style={{ marginTop: 44, opacity: 0.8 }}>
        <small>
          No signup required. Usernames must be unique during each session.
        </small>
      </div>
    </div>
  );
}

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
  if (submitted || myDrawingData)
    return (
      <div className="app-center">
        <GameHeader />
        <div className="card" style={{ background: "#f8f6f1", padding: 30 }}>
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
          <br />
          <span style={{ color: "#999", fontSize: 15 }}>
            Topic: <span style={{ color: accentColor }}>{topic}</span>
          </span>
        </div>
      </div>
    );
  return (
    <div className="app-center">
      <GameHeader />
      <div className="card" style={{ padding: 30, borderRadius: 18, background: "#fcfdfd", margin: "0 auto" }}>
        <h2 style={{ color: "#3b82f6" }}>
          Draw this:{" "}
          <span style={{ color: accentColor, fontFamily: "Comic Sans MS, cursive" }}>
            {topic}
          </span>
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
export default DoodleFinder;
