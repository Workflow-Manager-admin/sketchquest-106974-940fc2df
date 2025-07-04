import React from "react";

/**
 * HomePage - Displays all submitted drawings, allows guessing (once per drawing, no self-guess), shows colored feedback, allows real-time votes.
 * Props:
 *  - user: current user {username, userId}
 *  - drawings: [{id, userId, username, drawingURL, topic, votes}]
 *  - guesses: [{userId, username, guess, drawingId, isCorrect}]
 *  - votes: [{userId, forDrawingId}]
 *  - onGuess(drawingId, guessValue): triggers a guess; only allowed if user hasn't guessed that drawing.
 *  - onVote(drawingId): cast a vote for a drawing; only once, not own drawing.
 *  - votingEnabled: boolean (whether voting is currently available)
 *  - roundTimer: seconds remaining for round (optional)
 */
function HomePage({
  user,
  drawings,
  guesses,
  votes,
  onGuess,
  onVote,
  votingEnabled,
  roundTimer,
}) {
  // Get a lookup for user guesses by drawing
  const userGuessesByDrawing = {};
  guesses.forEach(
    (g) =>
      g.userId === user.userId &&
      g.drawingId &&
      (userGuessesByDrawing[g.drawingId] = g)
  );
  const hasVoted = votes.some((v) => v.userId === user.userId);

  return (
    <div className="app-center" style={{ minHeight: "100vh" }}>
      <div>
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
        <h2 style={{ color: "#3b82f6", marginBottom: 4 }}>
          {votingEnabled
            ? "Vote for your favorite drawing!"
            : "Make your guesses!"}
        </h2>
        {typeof roundTimer === "number" && (
          <div style={{ marginBottom: 16, fontSize: 17, color: "#888" }}>
            Time Remaining: <b style={{ color: "#f59e42" }}>{roundTimer}</b> seconds
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            justifyContent: "center",
            margin: "14px 0 0 0",
          }}
        >
          {drawings.map((drawing) => {
            const myGuess = userGuessesByDrawing[drawing.id];
            const guessInputDisabled =
              votingEnabled ||
              drawing.userId === user.userId ||
              !!myGuess;
            const lastGuessFeedback =
              myGuess &&
              (myGuess.isCorrect
                ? { color: "green", text: "Correct!" }
                : { color: "red", text: "Incorrect" });

            // Vote-related
            const canVote =
              votingEnabled &&
              !hasVoted &&
              drawing.userId !== user.userId;

            const voted = votingEnabled && hasVoted && votes.some(
              (v) =>
                v.userId === user.userId && v.forDrawingId === drawing.id
            );

            const votesCount = votes.filter(
              (v) => v.forDrawingId === drawing.id
            ).length;

            // Score/point tracking for each player (owner)
            // Player doc may have a 'points' field set by App.js
            let score = null;
            if (drawing.userId) {
              // Try to extract score from player doc
              // It is not included in drawing object, but may be in votes/guesses/player state in App (optionally, expose externally)
              // For now, display blank or zero
              score = drawing.points || 0;
            }

            return (
              <div
                key={drawing.id}
                className="drawing-thumb"
                style={{
                  width: 194,
                  margin: "12px",
                  background: "#fff",
                  border: "2px solid #f59e42",
                  borderRadius: 18,
                  boxShadow: "0 2px 4px #fc8",
                  padding: 10,
                  textAlign: "center",
                  position: "relative",
                }}
              >
                <img
                  src={drawing.drawingURL}
                  alt="doodle"
                  style={{ width: "100%", borderRadius: 12 }}
                />
                <div style={{marginBottom: 3}}>
                  <span
                    style={{
                      color: "#3b82f6",
                      fontWeight: "bold",
                      fontSize: 15,
                      marginRight: 8,
                    }}
                  >
                    By: {drawing.username}
                  </span>
                  {/* In a real app, pass scores explicitly */}
                  <span
                    style={{
                      color: "#f59e42",
                      fontWeight: 800,
                      marginLeft: 0,
                      fontSize: 14,
                      background: "#fffbe6",
                      borderRadius: 7,
                      padding: "2px 7px",
                      border: "1px solid #fcd285",
                      marginTop: "-1px",
                      marginRight: 0,
                    }}
                  >
                    {/* Try to find score from guesses for owner */}
                    {/* Not exact but gives some points feedback */}
                    Score:{" "}
                    {(
                      guesses.filter(
                        (g) =>
                          g.drawingId === drawing.id &&
                          g.isCorrect
                      ).length || 0
                    )}
                  </span>
                </div>
                <div style={{ height: 26, margin: "5px 0" }}>
                  {!votingEnabled && drawing.userId !== user.userId ? (
                    myGuess ? (
                      <span
                        style={{
                          color: lastGuessFeedback.color,
                          fontWeight: "bolder",
                          fontSize: 16,
                        }}
                      >
                        {lastGuessFeedback.text}
                      </span>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!guessInputDisabled && e.target.guess.value)
                            onGuess(drawing.id, e.target.guess.value);
                        }}
                        style={{ margin: 0 }}
                      >
                        <input
                          name="guess"
                          style={{
                            borderRadius: 6,
                            border: "1.5px solid #3b82f6",
                            fontSize: 15,
                            padding: "4px 7px",
                            width: 90,
                            marginRight: 4,
                          }}
                          maxLength={20}
                          disabled={guessInputDisabled}
                        />
                        <button
                          type="submit"
                          className="btn"
                          style={{
                            background: "#3b82f6",
                            color: "#fff",
                            padding: "5px 10px",
                            borderRadius: 6,
                            fontWeight: "bold",
                            fontSize: 15,
                          }}
                          disabled={guessInputDisabled}
                        >
                          Guess
                        </button>
                      </form>
                    )
                  ) : null}
                  {/* Voting section */}
                  {votingEnabled && (
                    <button
                      className="btn"
                      style={{
                        background: "#f59e42",
                        color: "#fff",
                        borderRadius: 10,
                        fontWeight: "bold",
                        fontSize: 16,
                        padding: "6px 11px",
                        marginTop: 7,
                        opacity: canVote ? 1 : 0.65,
                        cursor:
                          !canVote && !voted
                            ? "not-allowed"
                            : canVote
                            ? "pointer"
                            : "not-allowed",
                        border:
                          voted || drawing.userId === user.userId
                            ? "2px solid #999"
                            : "",
                      }}
                      disabled={!canVote}
                      onClick={() => onVote(drawing.id)}
                    >
                      {drawing.userId === user.userId
                        ? "You"
                        : voted
                        ? "Voted"
                        : "Vote"}
                    </button>
                  )}
                  {votingEnabled && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 14,
                        color: "#3b82f6",
                        fontWeight: "bold",
                      }}
                    >
                      {votesCount} vote{votesCount === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 34 }}>
        <b style={{ color: "#888" }}>
          {votingEnabled
            ? "Voting phase: Results update in real time!"
            : "Guesses: Color turns green if correct, red if not."}
        </b>
      </div>
    </div>
  );
}

export default HomePage;
