import { useState, useEffect, useRef, useCallback } from "react";

const MODES = {
  pomodoro: { label: "Focus",       duration: 25 * 60, color: "#C75B3A" },
  short:    { label: "Short Break", duration: 5 * 60,  color: "#4A7C6F" },
  long:     { label: "Long Break",  duration: 15 * 60, color: "#3A5FA0" },
};

const TICK_COUNT = 60;

function pad(n) { return String(n).padStart(2, "0"); }
function formatTime(s) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

function useBreakpoint() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return isMobile;
}

function ClockFace({ progress, pulse, color, timeLeft, label, size }) {
  const cx = size / 2, cy = size / 2;
  const r  = size * 0.405;

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const angle   = (i / TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
    const filled  = i / TICK_COUNT <= progress;
    const isMajor = i % 5 === 0;
    const inner   = r - (isMajor ? size * 0.056 : size * 0.031);
    return {
      x1: cx + Math.cos(angle) * inner, y1: cy + Math.sin(angle) * inner,
      x2: cx + Math.cos(angle) * r,     y2: cy + Math.sin(angle) * r,
      filled, isMajor,
    };
  });

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{
        filter: pulse ? `drop-shadow(0 0 ${size * 0.09}px ${color})` : "none",
        transition: "filter 0.5s ease",
      }}>
        <circle cx={cx} cy={cy} r={r + size * 0.025} fill="#0D0A05" />
        <circle cx={cx} cy={cy} r={r - size * 0.069} fill="#131008" />
        <circle cx={cx} cy={cy} r={r + size * 0.025} fill="none" stroke="#2A2015" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r - size * 0.069} fill="none" stroke="#2A2015" strokeWidth="1" />
        {ticks.map((t, i) => (
          <line key={i}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.filled ? color : "#2A2015"}
            strokeWidth={t.isMajor ? 3 : 1.5}
            strokeLinecap="round"
            style={{ transition: "stroke 0.3s ease" }}
          />
        ))}
        <circle cx={cx} cy={cy} r={size * 0.012} fill={color} />
      </svg>
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)", textAlign: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          fontSize: size * 0.19, fontWeight: "normal",
          color: "#F5E8D0", letterSpacing: "-2px",
          fontFamily: "'Georgia', serif", lineHeight: 1,
          textShadow: `0 0 40px ${color}66`, whiteSpace: "nowrap",
        }}>
          {formatTime(timeLeft)}
        </div>
        <div style={{
          fontSize: size * 0.035, letterSpacing: "3px",
          color: color, marginTop: "8px", textTransform: "uppercase",
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export default function PomodoroApp() {
  const [mode, setMode]                = useState("pomodoro");
  const [timeLeft, setTimeLeft]        = useState(MODES.pomodoro.duration);
  const [running, setRunning]          = useState(false);
  const [completedPomos, setCompleted] = useState(0);
  const [pulse, setPulse]              = useState(false);
  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const isMobile    = useBreakpoint();

  const currentMode   = MODES[mode];
  const totalDuration = currentMode.duration;
  const progress      = (totalDuration - timeLeft) / totalDuration;
  const pct           = Math.round(progress * 100);

  const clockSize = isMobile
    ? Math.min(window.innerWidth * 0.82, 320)
    : Math.min(window.innerWidth * 0.40, 500);

  const getAudioCtx = () => {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtxRef.current;
  };

  const playTick = useCallback(() => {
    try {
      const ctx  = getAudioCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.05);
    } catch { /* AudioContext unavailable */ }
  }, []);

  const playDone = useCallback(() => {
    try {
      const ctx = getAudioCtx();
      [0, 0.2, 0.4].forEach((delay, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = [523, 659, 784][i];
        gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.4);
      });
    } catch { /* AudioContext unavailable */ }
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false); playDone();
            if (mode === "pomodoro") setCompleted((c) => c + 1);
            setPulse(true); setTimeout(() => setPulse(false), 1000);
            return 0;
          }
          playTick(); return t - 1;
        });
      }, 1000);
    } else { clearInterval(intervalRef.current); }
    return () => clearInterval(intervalRef.current);
  }, [running, mode, playTick, playDone]);

  const switchMode = (m) => { setMode(m); setTimeLeft(MODES[m].duration); setRunning(false); };
  const reset      = () => { setTimeLeft(currentMode.duration); setRunning(false); };
  const toggle     = () => setRunning((r) => !r);

  const statusText = running ? "Focusing…" : timeLeft === totalDuration ? "Ready when you are." : "Paused.";

  const ModeTabs = (
    <div style={{
      display: "flex", gap: "2px",
      background: "#100D06", borderRadius: "4px", padding: "3px",
      border: "1px solid #2A2015",
    }}>
      {Object.entries(MODES).map(([key, val]) => (
        <button key={key} onClick={() => switchMode(key)} style={{
          padding: isMobile ? "9px 13px" : "10px 22px",
          background: mode === key ? val.color : "transparent",
          color: mode === key ? "#FFF8F0" : "#7A6A50",
          border: "none", borderRadius: "3px",
          fontFamily: "'Georgia', serif",
          fontSize: isMobile ? "12px" : "13px",
          cursor: "pointer", transition: "all 0.3s ease",
        }}>
          {val.label}
        </button>
      ))}
    </div>
  );

  const ProgressBar = (
    <div style={{ width: "100%" }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: "10px", letterSpacing: "3px", color: "#5A4A35",
        textTransform: "uppercase", marginBottom: "8px",
      }}>
        <span>Progress</span><span>{pct}%</span>
      </div>
      <div style={{ height: "2px", background: "#2A2015", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: currentMode.color,
          transition: "width 1s linear, background 1s ease",
          borderRadius: "2px",
        }} />
      </div>
    </div>
  );

  const SessionDots = (
    <div>
      <div style={{
        fontSize: "10px", letterSpacing: "3px", color: "#5A4A35",
        textTransform: "uppercase", marginBottom: "10px",
      }}>
        Sessions — {completedPomos} total
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{
            width: isMobile ? "10px" : "12px",
            height: isMobile ? "10px" : "12px",
            borderRadius: "50%",
            background: i < completedPomos % 4 ? currentMode.color : "#1E180E",
            border: `1px solid ${i < completedPomos % 4 ? currentMode.color : "#3A3025"}`,
            transition: "all 0.3s ease",
          }} />
        ))}
      </div>
    </div>
  );

  const Controls = (
    <div style={{ display: "flex", gap: isMobile ? "20px" : "16px", alignItems: "center" }}>
      <button onClick={reset} style={{
        width: isMobile ? "52px" : "52px",
        height: isMobile ? "52px" : "52px",
        borderRadius: "50%",
        background: "transparent", border: "1px solid #2A2015",
        color: "#7A6A50", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "20px", transition: "all 0.2s ease",
      }}>↺</button>

      <button onClick={toggle} style={{
        width: isMobile ? "80px" : "88px",
        height: isMobile ? "80px" : "88px",
        borderRadius: "50%",
        background: currentMode.color, border: "none",
        color: "#FFF8F0", cursor: "pointer",
        fontSize: isMobile ? "24px" : "26px",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 40px ${currentMode.color}44`,
        transition: "all 0.3s ease",
        transform: running ? "scale(0.95)" : "scale(1)",
      }}>
        {running ? "⏸" : "▶"}
      </button>

      {isMobile ? (
        <div style={{
          width: "52px", height: "52px", borderRadius: "50%",
          border: "1px solid #2A2015", color: "#5A4A35",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: "2px",
        }}>
          <span style={{ fontSize: "14px", color: "#7A6A50" }}>{completedPomos}</span>
          <span style={{ fontSize: "8px", letterSpacing: "1px" }}>done</span>
        </div>
      ) : (
        <div style={{
          fontSize: "11px", letterSpacing: "2px",
          color: "#5A4A35", textTransform: "uppercase",
        }}>
          {statusText}
        </div>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        body { background: #1A1209; }
        button:hover { opacity: 0.88; }
      `}</style>

      <div style={{
        minHeight: "100vh", width: "100%",
        background: "#1A1209",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Georgia', serif",
        position: "relative", overflow: "hidden",
      }}>
        {/* Grain */}
        <div style={{
          position: "fixed", inset: 0, opacity: 0.04, pointerEvents: "none", zIndex: 100,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }} />
        {/* Ambient glow */}
        <div style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: isMobile ? "360px" : "800px",
          height: isMobile ? "360px" : "800px",
          background: `radial-gradient(circle, ${currentMode.color}18 0%, transparent 70%)`,
          transition: "background 1s ease", pointerEvents: "none",
        }} />

        {/* ══════════ DESKTOP ══════════ */}
        {!isMobile ? (
          <div style={{
            width: "100%", maxWidth: "1280px",
            padding: "48px 80px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "80px",
            alignItems: "center",
          }}>
            {/* Left — clock */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <ClockFace
                progress={progress} pulse={pulse}
                color={currentMode.color} timeLeft={timeLeft}
                label={currentMode.label} size={clockSize}
              />
            </div>

            {/* Right — content */}
            <div style={{
              display: "flex", flexDirection: "column", gap: "36px",
              justifyContent: "center",
            }}>
              <div>
                <div style={{
                  fontSize: "10px", letterSpacing: "7px", textTransform: "uppercase",
                  color: "#5A4A35", marginBottom: "14px",
                }}>
                  Time Keeper
                </div>
                <div style={{
                  fontSize: "clamp(28px, 2.6vw, 44px)",
                  color: "#F5E8D0", fontWeight: "normal", lineHeight: 1.15,
                }}>
                  {running ? "Stay in the zone." : timeLeft === totalDuration ? "Ready when you are." : "Paused."}
                </div>
              </div>

              {ModeTabs}
              {ProgressBar}
              {SessionDots}
              {Controls}

              <div style={{
                fontSize: "10px", letterSpacing: "3px",
                color: "#2A2015", textTransform: "uppercase",
              }}>
                Stay focused · Rest well
              </div>
            </div>
          </div>
        ) : (
          /* ══════════ MOBILE ══════════ */
          <div style={{
            width: "100%", minHeight: "100vh",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "36px 20px",
            gap: "26px",
          }}>
            {/* Header */}
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: "10px", letterSpacing: "6px", textTransform: "uppercase",
                color: "#5A4A35", marginBottom: "12px",
              }}>
                Time Keeper
              </div>
              {SessionDots}
            </div>

            {ModeTabs}

            <ClockFace
              progress={progress} pulse={pulse}
              color={currentMode.color} timeLeft={timeLeft}
              label={currentMode.label} size={clockSize}
            />

            <div style={{ width: "100%", maxWidth: "320px" }}>
              {ProgressBar}
            </div>

            {Controls}

            <div style={{
              fontSize: "10px", letterSpacing: "3px",
              color: "#2A2015", textTransform: "uppercase",
            }}>
              Stay focused · Rest well
            </div>
          </div>
        )}
      </div>
    </>
  );
}