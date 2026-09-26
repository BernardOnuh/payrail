import type { CSSProperties } from "react";

// Static ambient washes — color depth only, no wandering. Reads as calm liquidity.
const AMBIENT = [
  { left: "-14%", top: "-20%", size: "min(66vw, 820px)", light: [15, 122, 92], dark: [79, 214, 163], alpha: 0.16 },
  { left: "44%", top: "-8%", size: "min(54vw, 680px)", light: [15, 122, 92], dark: [79, 214, 163], alpha: 0.12 },
  { left: "66%", top: "28%", size: "min(62vw, 780px)", light: [43, 185, 138], dark: [111, 230, 187], alpha: 0.11 },
  { left: "-20%", top: "44%", size: "min(60vw, 760px)", light: [154, 107, 31], dark: [227, 161, 88], alpha: 0.09 },
  { left: "18%", top: "64%", size: "min(64vw, 820px)", light: [15, 122, 92], dark: [79, 214, 163], alpha: 0.14 },
];

// One-way streaming bands — each travels left → right and loops off-screen.
const STREAMS = [
  { top: "4%", width: "46vw", height: "44vh", light: [15, 122, 92], dark: [79, 214, 163], alpha: 0.2, dur: 17, delay: 0 },
  { top: "26%", width: "60vw", height: "30vh", light: [43, 185, 138], dark: [111, 230, 187], alpha: 0.16, dur: 22, delay: -8 },
  { top: "48%", width: "40vw", height: "24vh", light: [15, 122, 92], dark: [79, 214, 163], alpha: 0.14, dur: 14, delay: -5 },
  { top: "64%", width: "52vw", height: "34vh", light: [154, 107, 31], dark: [227, 161, 88], alpha: 0.12, dur: 19, delay: -13 },
  { top: "84%", width: "44vw", height: "26vh", light: [15, 122, 92], dark: [79, 214, 163], alpha: 0.16, dur: 16, delay: -10 },
];

function stops([r, g, b]: number[], alpha: number) {
  return { light: `rgba(${r},${g},${b},${alpha}) 0%, rgba(${r},${g},${b},0) 68%`, dark: `rgba(${r},${g},${b},${alpha + 0.08}) 0%, rgba(${r},${g},${b},0) 64%` };
}

export function Aura() {
  return (
    <div className="aura" aria-hidden="true">
      <div className="aura-flow">
        {AMBIENT.map((b, i) => {
          const s = stops(b.light, b.alpha);
          const style = {
            left: b.left,
            top: b.top,
            width: b.size,
            height: b.size,
            ["--blob-stops"]: s.light,
            ["--blob-stops-dark"]: s.dark,
          } as CSSProperties;
          return <span key={i} className="aura-blob" style={style} />;
        })}

        {STREAMS.map((b, i) => {
          const s = stops(b.light, b.alpha);
          const style = {
            top: b.top,
            width: b.width,
            height: b.height,
            ["--blob-stops"]: s.light,
            ["--blob-stops-dark"]: s.dark,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
          } as CSSProperties;
          return <span key={`s${i}`} className="aura-band" style={style} />;
        })}
      </div>
      <span className="aura-grain" />
    </div>
  );
}