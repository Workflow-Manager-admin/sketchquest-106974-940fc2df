import React, { useRef, useEffect } from "react";

// PUBLIC_INTERFACE
// Wheel/Spinner component: animated topic selection
function SpinningWheelPanel({
  topics,
  topicSpin,
  onSpin,
  selectedTopic,
  disabled,
}) {
  const radius = 120;
  const canvasRef = useRef();

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, 2 * radius, 2 * radius);
    const anglePer = (2 * Math.PI) / topics.length;
    for (let i = 0; i < topics.length; i++) {
      ctx.beginPath();
      ctx.moveTo(radius, radius);
      ctx.arc(
        radius,
        radius,
        radius,
        anglePer * i + (topicSpin.angle * Math.PI) / 180,
        anglePer * (i + 1) + (topicSpin.angle * Math.PI) / 180
      );
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? "#f59e42" : "#3b82f6";
      ctx.globalAlpha = 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(radius, radius);
      ctx.rotate(anglePer * (i + 0.5) + (topicSpin.angle * Math.PI) / 180);
      ctx.textAlign = "right";
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(topics[i], radius - 18, 7);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(radius, 10);
    ctx.lineTo(radius - 15, 35);
    ctx.lineTo(radius + 15, 35);
    ctx.closePath();
    ctx.fillStyle = "#da2222";
    ctx.fill();
  }, [topics, topicSpin, radius]);

  return (
    <div className="app-center" style={{ minHeight: "100vh" }}>
      <div
        className="card"
        style={{
          padding: 30,
          borderRadius: 18,
          background: "#fcfdfd",
          margin: "0 auto",
        }}
      >
        <h2 style={{ color: "#3b82f6" }}>Spin to Pick a Drawing Topic!</h2>
        <div className="spinner-box" style={{ margin: "44px auto" }}>
          <canvas
            ref={canvasRef}
            width={2 * radius}
            height={2 * radius}
            style={{
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 2px 14px 0 #e0e0e0",
            }}
            aria-label="Spinning Wheel"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          {selectedTopic && (
            <div
              style={{
                fontSize: 26,
                margin: "14px 0",
                color: "#f59e42",
                fontFamily: "Comic Sans MS, Comic Sans, cursive",
                letterSpacing: 2,
              }}
            >
              Topic: {selectedTopic}
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
          disabled={topicSpin.spinning || disabled}
        >
          {topicSpin.spinning ? "Spinning..." : "Spin & Start!"}
        </button>
      </div>
    </div>
  );
}

export default SpinningWheelPanel;
