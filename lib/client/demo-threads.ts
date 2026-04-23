import type { StoredMessage, Thread } from "./threads";
import type { ArtifactAttachment } from "./chat-types";

/**
 * Pre-built demo conversations, seeded into an empty localStorage the first
 * time a browser hits the app. Each demo is a real Thread — it renders with
 * the same components as a live conversation, so reviewers can scroll through
 * answers, click citations to open the source viewer, and pop out artifacts
 * into the right pane without an API key.
 *
 * Four demos, each showcasing a different artifact kind:
 *   1. Safe-envelope calculator        — kind="react"          (complex, parametric)
 *   2. Thermal-protection troubleshoot — kind="flowchart"      (decision tree)
 *   3. MIG setup walkthrough           — kind="procedure"      (step-by-step)
 *   4. Front-panel annotations         — kind="image-labeling" (pinned overlay)
 *
 * Seeding happens once per browser: a sibling flag in localStorage records
 * that the seed ran, so if a user deletes a demo it stays deleted.
 */

const DAY = 86_400_000;

function msg(
  partial: Partial<StoredMessage> & {
    id: string;
    role: "user" | "assistant";
    content: string;
    ts: number;
  },
): StoredMessage {
  return {
    toolChips: [],
    sources: [],
    artifactGroups: [],
    ...partial,
  };
}

function ownerSourceUrl(page: number): string {
  return `/sources/owner-manual/p-${String(page).padStart(3, "0")}.png`;
}

// ════════════════════════════════════════════════════════════════════════════
// Demo 1 — Safe-envelope calculator (kind="react")
// ════════════════════════════════════════════════════════════════════════════
//
// A parametric tool: two sliders (voltage, wire-feed speed), a live XY chart
// showing the safe operating envelope for 3/16" mild steel T-joints on MIG /
// 240V, a color-shifting status banner, and three reference bead illustrations
// (cold / good / hot).

const ENVELOPE_ARTIFACT: ArtifactAttachment = {
  group_id: "demo-artifact-envelope",
  current_version: 1,
  versions: [
    {
      id: "demo-a1-v1",
      kind: "react",
      title: "Safe operating envelope — 3/16″ mild steel MIG · 240V",
      version: 1,
      ts: Date.now() - 6 * DAY,
      code: String.raw`import React, { useMemo, useState } from "react";

// Chart + envelope parameters for 3/16-inch mild steel T-joint, solid wire MIG
// on 240V input. Taken from the operating chart on p.27 of the owner's manual:
// the safe envelope is a diagonal band where wire-feed-speed scales with
// voltage (higher V needs higher WFS to keep the arc short).

const V_MIN = 14, V_MAX = 24, V_DEFAULT = 19;
const W_MIN = 200, W_MAX = 500, W_DEFAULT = 340;
const CENTER = (v: number) => 18 * v;   // center line of the envelope
const BAND = 40;                         // ± ipm tolerance around the center

type State = "cold" | "good" | "warm" | "hot";
type Status = { state: State; label: string; advice: string };

function statusFor(v: number, w: number): Status {
  const delta = w - CENTER(v);
  if (Math.abs(delta) <= BAND)
    return { state: "good", label: "In the pocket", advice: "Stable arc, clean bead profile, sound fusion." };
  if (delta > BAND && delta <= BAND * 2)
    return { state: "warm", label: "Running a bit hot", advice: "Arc will feel harsh; watch for burn-through on thin sections." };
  if (delta > BAND * 2)
    return { state: "hot", label: "Too hot — outside envelope", advice: "Wire outrunning the arc; expect burnback and wide, flat bead." };
  if (delta < -BAND && delta >= -BAND * 2)
    return { state: "cold", label: "Running a bit cold", advice: "Increase WFS or drop voltage; edges may not fuse." };
  return { state: "cold", label: "Too cold — outside envelope", advice: "Bead will sit on top of the metal. Fusion risk." };
}

const STATE_COLORS: Record<State, { bg: string; fg: string; dot: string }> = {
  good: { bg: "rgba(34,197,94,0.12)",  fg: "#86efac", dot: "#22c55e" },
  warm: { bg: "rgba(234,179,8,0.12)",  fg: "#fde68a", dot: "#eab308" },
  cold: { bg: "rgba(59,130,246,0.14)", fg: "#bfdbfe", dot: "#3b82f6" },
  hot:  { bg: "rgba(239,68,68,0.14)",  fg: "#fecaca", dot: "#ef4444" },
};

// ─── Chart geometry ──────────────────────────────────────────────────────
const CW = 320, CH = 200, PAD_L = 44, PAD_R = 14, PAD_T = 14, PAD_B = 36;
const IW = CW - PAD_L - PAD_R;
const IH = CH - PAD_T - PAD_B;
const xOf = (v: number) => PAD_L + ((v - V_MIN) / (V_MAX - V_MIN)) * IW;
const yOf = (w: number) => PAD_T + IH - ((w - W_MIN) / (W_MAX - W_MIN)) * IH;

function envelopePath() {
  const topL = { x: xOf(V_MIN), y: yOf(Math.min(CENTER(V_MIN) + BAND, W_MAX)) };
  const topR = { x: xOf(V_MAX), y: yOf(Math.min(CENTER(V_MAX) + BAND, W_MAX)) };
  const botR = { x: xOf(V_MAX), y: yOf(Math.max(CENTER(V_MAX) - BAND, W_MIN)) };
  const botL = { x: xOf(V_MIN), y: yOf(Math.max(CENTER(V_MIN) - BAND, W_MIN)) };
  return [
    "M", topL.x, topL.y,
    "L", topR.x, topR.y,
    "L", botR.x, botR.y,
    "L", botL.x, botL.y,
    "Z",
  ].join(" ");
}

// ─── Bead reference illustrations ────────────────────────────────────────

function BeadSvg({ state, active }: { state: State; active: boolean }) {
  // A stylized cross-section of the weld bead for each operating regime.
  const paths: Record<State, React.ReactNode> = {
    cold: (
      // Tall narrow bead, poor wetting — looks like a ball sitting on top
      <g>
        <path d="M 10 44 L 90 44" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <path d="M 36 44 Q 50 12, 64 44 Z" fill="rgba(147,197,253,0.5)" stroke="#93c5fd" strokeWidth="1.5" />
        <path d="M 40 44 L 45 50 M 55 50 L 60 44" stroke="#93c5fd" strokeWidth="1" fill="none" />
      </g>
    ),
    good: (
      // Even convex bead with good wetting to the base metal
      <g>
        <path d="M 10 44 L 90 44" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <path d="M 26 44 Q 50 22, 74 44 Z" fill="rgba(134,239,172,0.45)" stroke="#86efac" strokeWidth="1.5" />
      </g>
    ),
    warm: (
      // Wider and flatter than good, mild undercut starting
      <g>
        <path d="M 10 44 L 90 44" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
        <path d="M 20 44 Q 50 28, 80 44 Z" fill="rgba(253,230,138,0.4)" stroke="#fde68a" strokeWidth="1.5" />
      </g>
    ),
    hot: (
      // Very wide flat bead with undercut (grooves into the base metal)
      <g>
        <path d="M 10 44 L 14 44 L 18 48 L 22 44 L 78 44 L 82 48 L 86 44 L 90 44" stroke="rgba(255,255,255,0.25)" strokeWidth="2" fill="none" />
        <path d="M 22 44 Q 50 34, 78 44 Z" fill="rgba(254,202,202,0.4)" stroke="#fecaca" strokeWidth="1.5" />
      </g>
    ),
  };
  return (
    <div
      className={
        "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition-all " +
        (active
          ? "border-white/25 bg-white/[0.06]"
          : "border-white/8 bg-transparent opacity-60")
      }
    >
      <svg width="100" height="56" viewBox="0 0 100 56" className="rounded">
        {paths[state]}
      </svg>
      <div
        className="font-mono text-[10px] uppercase tracking-[0.1em]"
        style={{ color: STATE_COLORS[state].dot }}
      >
        {state === "warm" ? "too hot (mild)" : state === "hot" ? "too hot" : state === "cold" ? "too cold" : "good"}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────

export default function EnvelopeCalculator() {
  const [v, setV] = useState(V_DEFAULT);
  const [w, setW] = useState(W_DEFAULT);
  const status = useMemo(() => statusFor(v, w), [v, w]);
  const color = STATE_COLORS[status.state];

  const citations =
    status.state === "good"
      ? "owner's manual p.27 · operating chart for MIG / 0.035″ / 3/16″ mild steel"
      : status.state === "cold"
      ? "below envelope — see p.27 boundary: WFS must climb with voltage"
      : status.state === "hot"
      ? "above envelope — see p.27 note on burnback and wire overrun"
      : "at the edge of the envelope — see p.27";

  return (
    <div className="mx-auto max-w-[520px] rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-zinc-100">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-300/90">
          Settings configurator
        </div>
        <div className="font-mono text-[10px] text-zinc-500">
          MIG · 3/16″ mild steel · 240 V
        </div>
      </div>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">
        Are we inside the safe envelope?
      </h1>

      {/* Sliders */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className="text-[12px] text-zinc-400">Voltage</label>
            <div className="font-mono text-[13px] text-zinc-200">
              {v.toFixed(1)} <span className="text-zinc-500">V</span>
            </div>
          </div>
          <input
            type="range"
            min={V_MIN}
            max={V_MAX}
            step={0.1}
            value={v}
            onChange={(e) => setV(parseFloat(e.target.value))}
            className="w-full accent-orange-400"
          />
          <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-zinc-500">
            <span>{V_MIN} V</span>
            <span>{V_MAX} V</span>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className="text-[12px] text-zinc-400">Wire feed</label>
            <div className="font-mono text-[13px] text-zinc-200">
              {w.toFixed(0)} <span className="text-zinc-500">ipm</span>
            </div>
          </div>
          <input
            type="range"
            min={W_MIN}
            max={W_MAX}
            step={5}
            value={w}
            onChange={(e) => setW(parseFloat(e.target.value))}
            className="w-full accent-orange-400"
          />
          <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-zinc-500">
            <span>{W_MIN}</span>
            <span>{W_MAX}</span>
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div
        className="mt-4 flex items-center gap-3 rounded-xl border px-3 py-2.5"
        style={{
          backgroundColor: color.bg,
          borderColor: color.dot + "55",
        }}
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color.dot }}
        />
        <div className="flex-1">
          <div className="text-[13px] font-medium" style={{ color: color.fg }}>
            {status.label}
          </div>
          <div className="text-[11.5px] text-zinc-400">{status.advice}</div>
        </div>
      </div>

      {/* XY chart */}
      <div className="mt-4 rounded-xl border border-white/8 bg-zinc-950/40 p-3">
        <svg viewBox={"0 0 " + CW + " " + CH} width="100%">
          {/* frame */}
          <rect
            x={PAD_L - 0.5}
            y={PAD_T - 0.5}
            width={IW}
            height={IH}
            fill="transparent"
            stroke="rgba(255,255,255,0.06)"
          />
          {/* axis labels */}
          <text x={PAD_L - 6} y={PAD_T + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="ui-monospace, monospace">
            {W_MAX}
          </text>
          <text x={PAD_L - 6} y={PAD_T + IH + 2} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="ui-monospace, monospace">
            {W_MIN}
          </text>
          <text x={PAD_L - 30} y={PAD_T + IH / 2} transform={"rotate(-90 " + (PAD_L - 30) + " " + (PAD_T + IH / 2) + ")"} fontSize={10} fill="rgba(255,255,255,0.5)" textAnchor="middle">
            WFS (ipm)
          </text>
          <text x={PAD_L} y={PAD_T + IH + 22} fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="ui-monospace, monospace">
            {V_MIN}
          </text>
          <text x={PAD_L + IW} y={PAD_T + IH + 22} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="ui-monospace, monospace">
            {V_MAX}
          </text>
          <text x={PAD_L + IW / 2} y={PAD_T + IH + 26} fontSize={10} fill="rgba(255,255,255,0.5)" textAnchor="middle">
            Voltage (V)
          </text>

          {/* Safe envelope */}
          <path d={envelopePath()} fill="rgba(34,197,94,0.15)" stroke="rgba(34,197,94,0.6)" strokeWidth={1} />
          <text
            x={xOf((V_MIN + V_MAX) / 2)}
            y={yOf(CENTER((V_MIN + V_MAX) / 2)) - 4}
            textAnchor="middle"
            fontSize={10}
            fill="rgba(134,239,172,0.85)"
            fontFamily="ui-monospace, monospace"
            letterSpacing="0.04em"
          >
            SAFE
          </text>

          {/* Current operating point */}
          <circle
            cx={xOf(v)}
            cy={yOf(w)}
            r={7}
            fill={color.dot}
            fillOpacity={0.9}
            stroke="white"
            strokeWidth={1.5}
          />
          <circle
            cx={xOf(v)}
            cy={yOf(w)}
            r={14}
            fill={color.dot}
            fillOpacity={0.12}
            stroke={color.dot}
            strokeOpacity={0.4}
          />
        </svg>
        <div className="mt-1 font-mono text-[10px] text-zinc-500">{citations}</div>
      </div>

      {/* Reference beads */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-zinc-500">
          What each regime looks like in the bead
        </div>
        <div className="grid grid-cols-4 gap-2">
          <BeadSvg state="cold" active={status.state === "cold"} />
          <BeadSvg state="good" active={status.state === "good"} />
          <BeadSvg state="warm" active={status.state === "warm"} />
          <BeadSvg state="hot"  active={status.state === "hot"} />
        </div>
      </div>
    </div>
  );
}`,
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// Demo 2 — Thermal protection troubleshooting (kind="flowchart")
// ════════════════════════════════════════════════════════════════════════════

const THERMAL_ARTIFACT: ArtifactAttachment = {
  group_id: "demo-artifact-thermal",
  current_version: 1,
  versions: [
    {
      id: "demo-a2-v1",
      kind: "flowchart",
      title: "Thermal-protection trip — diagnosis",
      version: 1,
      ts: Date.now() - 4 * DAY,
      code: JSON.stringify(
        {
          title: "Thermal-protection trip — diagnosis",
          subtitle:
            "Mid-weld thermal cut-out on the OmniPro 220, ~5 minutes of continuous work at 160 A on 240 V input.",
          start: "led",
          nodes: {
            led: {
              kind: "question",
              title: "How is the thermal-overload LED behaving?",
              detail:
                "The amber OL indicator on the front panel tells you the current state of the overheat sensor.",
              citation: "p.22",
              branches: [
                { label: "Solid on — machine shut down completely", next: "fan" },
                { label: "Blinking — machine reducing output", next: "duty" },
                { label: "Off now, but tripped twice already", next: "duty" },
              ],
            },
            fan: {
              kind: "question",
              title: "Is the cooling fan running when the LED is on?",
              detail:
                "Put your hand behind the machine. The fan should be pulling a noticeable stream of air through the case whenever the machine is on.",
              branches: [
                { label: "Fan running — still tripping", next: "airflow" },
                { label: "Fan not running at all", next: "fan_dead" },
                { label: "Fan runs in short bursts only", next: "thermistor" },
              ],
            },
            duty: {
              kind: "question",
              title: "What's your actual duty cycle at 160 A / 240 V?",
              detail:
                "Roughly — minutes of arc time per 10-minute cycle. At 160 A the manual's rated duty cycle on 240 V input is 40%, so 4 minutes on / 6 off.",
              citation: "p.23 — rated duty cycle chart",
              branches: [
                { label: "Under 40% — 3–4 min arc then rest", next: "inputs" },
                { label: "Close to 50% — about 5 min arc", next: "exceeded" },
                { label: "More than 50% — running almost continuous", next: "exceeded" },
              ],
            },
            airflow: {
              kind: "action",
              title: "Clear the vents and confirm airflow",
              detail:
                "Shut the machine off and pull the power. Blow out the rear intake grille and the side vents with compressed air; metal dust and grinding chips from the shop build up on the radiator fins and choke the cooling path. Leave at least 12 inches of clearance behind the machine before you power it back up.",
              citation: "p.22 — ventilation requirements",
              next: "retest",
            },
            fan_dead: {
              kind: "terminal",
              title: "Cooling fan has failed",
              detail:
                "The fan runs whenever the machine is on; if it's dead, the thermistor will trip within minutes at any meaningful current. Fan replacement is a serviceable part — contact Harbor Freight support with the machine's serial number.",
              outcome: "Service / replace fan",
              citation: "p.22",
              warning:
                "Do not keep welding with a dead fan — you will melt the output transistors, which is not a covered repair.",
            },
            thermistor: {
              kind: "terminal",
              title: "Likely thermistor or control-board fault",
              detail:
                "A fan that cycles on and off in short bursts while the machine is idle points at the thermistor misreading the case temperature, or a loose connection on the control board. Beyond garage-level diagnosis.",
              outcome: "Contact support",
            },
            inputs: {
              kind: "question",
              title: "Which input voltage are you actually on?",
              detail:
                "On 120 V input the OmniPro 220 is derated heavily — duty cycle at 160 A is much lower than the 240 V figure. The LCD shows the detected input voltage on boot.",
              citation: "p.8 — input requirements",
              branches: [
                { label: "240 V", next: "extension" },
                { label: "120 V — household outlet", next: "switch_240" },
              ],
            },
            extension: {
              kind: "question",
              title: "Running through an extension cord?",
              detail:
                "A long or undersized extension sags voltage under load. The machine then pulls more current from the wall to maintain output, and the input transistors warm up faster than the fan can cool them.",
              branches: [
                { label: "No — plugged directly into the outlet", next: "service" },
                { label: "Yes — any extension", next: "extension_fix" },
              ],
            },
            extension_fix: {
              kind: "terminal",
              title: "Remove the extension or upgrade gauge",
              detail:
                "On 240 V, use 10 AWG minimum for runs under 25 ft and 8 AWG for longer runs, and never daisy-chain a second extension. If you must run long, a 6 AWG welder extension is the correct answer.",
              outcome: "Fixed by input fix",
              citation: "p.8",
            },
            exceeded: {
              kind: "terminal",
              title: "You're past rated duty cycle",
              detail:
                "At 160 A on 240 V the rated duty cycle is 40%. Running closer to 50–60% is above spec, and thermal protection will trip by design. Either back off to the rated pattern (4 min on / 6 min off), drop amps, or accept the cool-down intervals.",
              outcome: "Expected behaviour",
              citation: "p.23",
            },
            switch_240: {
              kind: "terminal",
              title: "Move to a 240 V outlet if you can",
              detail:
                "On 120 V the rated duty cycle at 160 A is significantly lower, and the thermal cut-out will trip early almost regardless of what else you fix. If a 240 V dryer outlet is available with the correct adapter, the trips will likely stop.",
              outcome: "Upgrade input",
              citation: "p.8",
            },
            service: {
              kind: "terminal",
              title: "Persistent trip with good input — contact support",
              detail:
                "Good input, good airflow, within duty-cycle spec, and still tripping — past garage-level diagnosis. Capture the LCD readout and call support.",
              outcome: "Contact support",
            },
            retest: {
              kind: "question",
              title: "After clearing vents, does it still trip?",
              branches: [
                { label: "No — fixed", next: "fixed" },
                { label: "Yes — same behaviour", next: "service" },
              ],
            },
            fixed: {
              kind: "terminal",
              title: "Airflow was the issue",
              detail:
                "Keep the shop vent routine on your maintenance checklist — monthly on a working machine, weekly if you're grinding near it.",
              outcome: "Fixed",
            },
          },
          citations: ["p.8", "p.22", "p.23"],
        },
        null,
        2,
      ),
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// Demo 3 — MIG setup walkthrough (kind="procedure")
// ════════════════════════════════════════════════════════════════════════════

const MIG_SETUP_ARTIFACT: ArtifactAttachment = {
  group_id: "demo-artifact-mig-setup",
  current_version: 1,
  versions: [
    {
      id: "demo-a3-v1",
      kind: "procedure",
      title: "MIG setup — 1/8″ mild steel T-joint on 240 V",
      version: 1,
      ts: Date.now() - 2 * DAY,
      code: JSON.stringify(
        {
          title: "MIG setup — 1/8″ mild steel T-joint on 240 V",
          subtitle: "First-time setup for a solid-wire MIG weld on this machine.",
          steps: [
            {
              title: "Confirm your input voltage",
              markdown:
                "Plug the OmniPro 220 into a **240 V** outlet if you have one. The machine auto-detects input voltage and the LCD will show `240V` on boot. On 120 V everything still runs, but duty cycle at 160 A drops dramatically, and thermal protection will trip early.\n\n- If you only have a 120 V outlet: stick to thinner material (≤ 1/8″) and plan for rest intervals.\n- Never run through a cheap extension cord.",
              imageUrl: ownerSourceUrl(8),
              imageCaption: "Input-voltage confirmation on the LCD",
              citation: "p.8",
            },
            {
              title: "Mount the spool",
              markdown:
                "Open the wire-compartment door. Slide the 0.035″ solid-wire spool onto the hub so the **wire pays off the bottom** — the pull goes under the spool and up into the drive rolls. Tighten the spool-tension knob until the spool stops with a half-turn of inertia — too loose, it birds-nests; too tight, the motor stalls.",
              imageUrl: ownerSourceUrl(11),
              imageCaption: "Spool mounted on the hub, tension set",
              citation: "p.11",
              warning: "Unplug the machine or switch it off before opening the drive compartment.",
            },
            {
              title: "Thread the wire through the drive rolls",
              markdown:
                "Open the drive-roll pressure arm. Feed the wire:\n\n1. Through the inlet guide.\n2. Between the drive rolls (make sure you're in the groove matched to 0.035″ — the wheel usually has two grooves; pick the correct one).\n3. Into the gun liner.\n\nClose the pressure arm to the middle setting for steel. Press the gun trigger to feed wire until it emerges from the tip.",
              imageUrl: ownerSourceUrl(12),
              imageCaption: "Drive rolls and tension arm",
              citation: "p.12",
            },
            {
              title: "Connect shielding gas",
              markdown:
                "Use **75/25 Ar/CO₂** for mild steel. Connect the regulator to the cylinder (CGA-580 fitting), crack the valve slowly, and set flow to **20–25 CFH** at the regulator. The hose from the machine takes a 5/8-18 UNF fitting at the back of the OmniPro 220.\n\nStraight CO₂ works too and is cheaper, but gives a harsher arc and more spatter.",
              imageUrl: ownerSourceUrl(9),
              imageCaption: "Gas regulator and flowmeter",
              citation: "p.9",
              warning:
                "Leak-check at the cylinder valve and hose fittings. Argon is an asphyxiant — good ventilation is mandatory.",
            },
            {
              title: "Set polarity to DCEP",
              markdown:
                "For solid-wire MIG, the **torch goes to output +** (DCEP) and the ground clamp goes to **output −**. Inside the wire compartment there is a pair of paddle connectors — make sure they're configured for MIG, not flux-cored.\n\nIf your last session was FCAW self-shielded, the leads will be reversed. This is the single most common cause of \"my machine started welding badly out of nowhere\".",
              imageUrl: ownerSourceUrl(13),
              imageCaption: "Polarity paddles set for DCEP (MIG)",
              citation: "p.13",
              warning:
                "Flux-cored self-shielded wire runs on DCEN. Mixing them up causes bad fusion and porosity, not sparks.",
            },
            {
              title: "Dial voltage and wire-feed speed",
              markdown:
                "For **1/8″ mild steel on 240 V with 0.035″ wire**, start at:\n\n- **Voltage: 18.5 V**\n- **Wire-feed speed: 340 ipm**\n\nThe synergic LCD shows both. These will get you a stable arc on a T-joint; fine-tune ± 0.5 V and ± 20 ipm based on the sound and the bead after a practice run.\n\nListen for a steady *frying-bacon* hum. A popping or sputtering arc means voltage is too low or WFS too high; a harsh, spattery arc means the opposite.",
              imageUrl: ownerSourceUrl(27),
              imageCaption: "Operating chart — 0.035″ MIG on mild steel",
              citation: "p.27",
            },
            {
              title: "Lay a practice bead on scrap",
              markdown:
                "Before touching the joint:\n\n- Gun angle: **drag / pull** at 10–15° off vertical. MIG can be push or drag; drag gives deeper penetration on steel.\n- Stick-out: **3/8 inch** — if the contact tip is buried in the nozzle, pull it out 1/4 inch.\n- Travel: slow steady pace, roughly half an inch per second.\n\nRun a 3-inch bead on a piece of scrap 1/8″ plate. The bead should be a uniform convex hump with clean wetting to both sides, not sitting on top like a rope.",
              imageUrl: ownerSourceUrl(37),
              imageCaption: "Weld-quality reference — good vs cold vs hot",
              citation: "p.37",
            },
            {
              title: "Tack and weld the T-joint",
              markdown:
                "With the settings proven on scrap:\n\n1. Clamp the joint clean and square.\n2. Tack each end of the joint (1-second pulse on the trigger).\n3. Verify the tacks aren't pulling the joint out of square; tap it back if it did.\n4. Weld the joint with a slow steady drag, aiming the wire at the bottom corner of the T — **65/35 bias** toward the bottom plate carries the heat where it's needed.\n\nLet the joint cool to room temperature before inspecting the bead.",
              imageUrl: ownerSourceUrl(22),
              imageCaption: "T-joint technique — gun angle and bead placement",
              citation: "p.22",
            },
          ],
          citations: ["p.8", "p.9", "p.11", "p.12", "p.13", "p.22", "p.27", "p.37"],
        },
        null,
        2,
      ),
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// Demo 4 — Front-panel annotations (kind="image-labeling")
// ════════════════════════════════════════════════════════════════════════════
//
// Uses the real p.8 PNG — the owner's manual's "Front Panel Controls" page,
// where the labelled diagram lives. Labels below match the callouts on that
// page one-for-one (LCD, Home/Back buttons, three knobs, power switch, the
// four sockets/outlets, wire-feed cable, storage). Pin positions are
// percentages of the page image so they overlay responsively.

const PANEL_ARTIFACT: ArtifactAttachment = {
  group_id: "demo-artifact-panel-labels",
  current_version: 1,
  versions: [
    {
      id: "demo-a4-v1",
      kind: "image-labeling",
      title: "OmniPro 220 front panel — every control",
      version: 1,
      ts: Date.now() - 1 * DAY,
      code: JSON.stringify(
        {
          title: "OmniPro 220 front panel — every control",
          subtitle: "Click a pin or a row to see what each control does.",
          imageUrl: ownerSourceUrl(8),
          imageAlt: "OmniPro 220 front panel, owner's manual page 8",
          labels: [
            {
              id: "home",
              x: 42,
              y: 34,
              title: "Home Button",
              description:
                "Small push-button to the left of the LCD (labelled HOME). Returns you to the main process-select screen from any submenu.",
              citation: "p.8",
            },
            {
              id: "lcd",
              x: 56,
              y: 33,
              title: "LCD Display",
              description:
                "Central display — shows the selected process, wire diameter, live voltage, live wire-feed speed, and the detected input voltage on every boot. The active function above each knob updates as you move through menus.",
              citation: "p.8",
            },
            {
              id: "back",
              x: 69,
              y: 34,
              title: "Back Button",
              description:
                "Small push-button to the right of the LCD. Steps one level up in the menu — bail out of a parameter screen without committing a change.",
              citation: "p.8",
            },
            {
              id: "left_knob",
              x: 44,
              y: 45,
              title: "Left Knob",
              description:
                "Continuous dial whose meaning depends on the current screen — typically voltage on the main screen and the first parameter value in submenus. The LCD labels each knob's active function live.",
              citation: "p.8",
            },
            {
              id: "control_knob",
              x: 54,
              y: 45,
              title: "Control Knob",
              description:
                "The larger central rotary with the arrow indicator. Used to scroll through menu items and confirm selections (push-to-click). Primary navigator for the synergic UI.",
              citation: "p.8",
            },
            {
              id: "right_knob",
              x: 64,
              y: 45,
              title: "Right Knob",
              description:
                "Continuous dial paired with the Left Knob — typically wire-feed speed on the main screen. Together with voltage it sets your operating point in the chart on p.27.",
              citation: "p.8",
            },
            {
              id: "power",
              x: 47,
              y: 58,
              title: "Power Switch",
              description:
                "Rocker on/off in the middle of the faceplate, just below the VULCAN band. The machine re-detects input voltage (120 V or 240 V) on every power-on — watch for the voltage chip on the LCD.",
              citation: "p.8",
            },
            {
              id: "storage",
              x: 64,
              y: 62,
              title: "Storage Compartment",
              description:
                "Vented panel on the right side of the faceplate — holds spare contact tips, a nozzle cleaner, a drive-roll spanner, or whatever you reach for every five minutes.",
              citation: "p.8",
            },
            {
              id: "mig_socket",
              x: 36,
              y: 64,
              title: "MIG Gun / Spool Gun Cable Socket",
              description:
                "Large Euro-style round connector on the left of the mid-section. Carries welding current, trigger pilot, and shielding gas to the gun in one plug. Used for both the standard MIG gun and the optional Spool Gun.",
              citation: "p.8",
            },
            {
              id: "spool_gas",
              x: 24,
              y: 76,
              title: "Spool Gun Gas Outlet",
              description:
                "Smaller round fitting on the far left of the lower socket row. Separate gas port for the optional Spool Gun (sold separately) — its gas hose connects here instead of through the main gun socket.",
              citation: "p.8",
            },
            {
              id: "socket_neg",
              x: 47,
              y: 77,
              title: "Negative Socket",
              description:
                "DCEN output — the socket marked with the negative symbol. Ground clamp here for MIG / Stick (inverse of positive); torch here for flux-cored self-shielded and DC TIG. See the polarity setup on p.13.",
              citation: "p.8",
            },
            {
              id: "socket_pos",
              x: 68,
              y: 77,
              title: "Positive Socket",
              description:
                "DCEP output — the socket marked with the plus symbol on the lower right. Torch here for MIG and most Stick rods; ground clamp here for flux-cored self-shielded and DC TIG. See the polarity setup on p.13.",
              citation: "p.8",
            },
            {
              id: "wire_feed_cable",
              x: 57,
              y: 80,
              title: "Wire Feed Power Cable",
              description:
                "Small connector between the negative and positive sockets at the bottom of the faceplate. Runs internally to the wire-feed drive rolls in the wire compartment.",
              citation: "p.8",
            },
          ],
          citations: ["p.8"],
        },
        null,
        2,
      ),
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// Thread builders
// ════════════════════════════════════════════════════════════════════════════

function envelopeCalculatorDemo(): Thread {
  const baseTs = Date.now() - 6 * DAY;
  const messages: StoredMessage[] = [
    msg({
      id: "demo-1-u1",
      role: "user",
      ts: baseTs,
      content:
        "I want to weld 3/16-inch mild steel T-joints on 240V with MIG. Build me a settings configurator — I slide voltage and wire-feed-speed and you tell me whether I'm in the safe envelope per the manual's chart, cite the page at the boundary conditions, and show me what a good bead at those settings looks like versus too cold and too hot.",
    }),
    msg({
      id: "demo-1-a1",
      role: "assistant",
      ts: baseTs + 22_000,
      toolChips: [
        {
          id: "demo-1-tc1",
          name: "search",
          status: "done",
          summary: "operating chart · p.27 top hit",
          input: {
            queries: [
              "MIG 3/16 mild steel voltage wire speed envelope",
              "operating chart 0.035 wire 240V",
              "selection chart T-joint settings",
              "fillet weld voltage WFS range",
            ],
          },
        },
        {
          id: "demo-1-tc2",
          name: "open_page",
          status: "done",
          summary: "owner-manual p.27 loaded as image",
          input: { doc: "owner-manual", page: 27 },
        },
        {
          id: "demo-1-tc3",
          name: "crop_region",
          status: "done",
          summary: "cropped to 3/16 / 240V cell",
          input: { page: 27, query: "3/16 inch mild steel column at 240V input" },
        },
        {
          id: "demo-1-tc4",
          name: "emit_artifact",
          status: "done",
          summary: "react · parametric envelope calculator",
          input: { kind: "react", title: "Safe operating envelope" },
        },
      ],
      sources: [
        {
          doc: "owner-manual",
          doc_title: "OmniPro 220 owner's manual",
          page: 27,
          url: ownerSourceUrl(27),
          caption: "Operating chart — voltage × wire-feed-speed envelope for MIG on mild steel",
        },
      ],
      artifactGroups: [ENVELOPE_ARTIFACT.group_id],
      content: `The artifact on the right reads the operating chart from **p.27** — for 3/16″ mild steel MIG on 240V input with 0.035″ wire, the safe envelope is a diagonal band:

- Voltage **17–21 V** paired with wire-feed **290–380 ipm**, with WFS scaling roughly as \`WFS ≈ 18 × V\`.
- The **green region** on the chart is the safe envelope. Drag either slider and the blob marking your current settings will move — the status banner above flips to yellow at the edge of the envelope and red once you're clearly outside.

What the four bead states look like in real life (bottom of the artifact panel, with the manual's weld-quality references on p.37 as the ground truth):

- **Too cold** — bead sits on top of the parent metal like a rope; the edges don't wet in. Caused by WFS too low for the voltage. Fusion risk — the bead looks fine cosmetically and pops off on the first hammer tap.
- **Good** — even convex profile, clean wetting, consistent ripples. Stable *frying-bacon* arc sound.
- **Running hot (mild)** — bead gets flatter, ripples stretch out. Arc is harsher but the weld is still sound; usually an accepted operating point if you need a bit more penetration.
- **Too hot** — wide, flat bead with undercut along the toes, occasional burnback popping at the tip. Caused by WFS too high for the voltage — wire is outrunning the arc.

A reasonable **starting point** for this joint is **18.5 V / 340 ipm** — straight in the centre of the envelope per p.27. Run a 3-inch bead on scrap first, then fine-tune ± 0.5 V / ± 20 ipm based on the sound and the profile.`,
    }),
  ];
  return {
    id: "demo-envelope",
    title: "Demo · Safe-envelope calculator",
    createdAt: baseTs,
    updatedAt: baseTs + 22_000,
    messages,
    artifacts: { [ENVELOPE_ARTIFACT.group_id]: ENVELOPE_ARTIFACT },
  };
}

function thermalTroubleshootDemo(): Thread {
  const baseTs = Date.now() - 4 * DAY;
  const messages: StoredMessage[] = [
    msg({
      id: "demo-2-u1",
      role: "user",
      ts: baseTs,
      content:
        "My OmniPro 220 keeps tripping thermal protection mid-weld. I've been doing ~5 minutes of continuous weld at 160A on 240V. Walk me through every plausible cause as a decision tree I can actually follow in the garage — branch on what the LCD is showing and what the fan is doing.",
    }),
    msg({
      id: "demo-2-a1",
      role: "assistant",
      ts: baseTs + 19_000,
      toolChips: [
        {
          id: "demo-2-tc1",
          name: "search",
          status: "done",
          summary: "thermal / duty / airflow · 3 pages",
          input: {
            queries: [
              "thermal overload LED OmniPro",
              "duty cycle 160A 240V rated",
              "fan ventilation requirements",
              "extension cord voltage drop welder",
            ],
          },
        },
        {
          id: "demo-2-tc2",
          name: "open_page",
          status: "done",
          summary: "owner-manual p.22 (ventilation + LED)",
          input: { doc: "owner-manual", page: 22 },
        },
        {
          id: "demo-2-tc3",
          name: "open_page",
          status: "done",
          summary: "owner-manual p.23 (duty cycle chart)",
          input: { doc: "owner-manual", page: 23 },
        },
        {
          id: "demo-2-tc4",
          name: "open_page",
          status: "done",
          summary: "owner-manual p.8 (input requirements)",
          input: { doc: "owner-manual", page: 8 },
        },
        {
          id: "demo-2-tc5",
          name: "emit_artifact",
          status: "done",
          summary: "flowchart · 12 nodes · branches on LCD + fan",
          input: { kind: "flowchart", title: "Thermal-protection diagnosis" },
        },
      ],
      sources: [
        {
          doc: "owner-manual",
          doc_title: "OmniPro 220 owner's manual",
          page: 22,
          url: ownerSourceUrl(22),
          caption: "Thermal-overload LED behaviour and ventilation requirements",
        },
        {
          doc: "owner-manual",
          doc_title: "OmniPro 220 owner's manual",
          page: 23,
          url: ownerSourceUrl(23),
          cropUrl: "/crops/owner-manual/p-023-00cb6ef830.png",
          bbox: [120, 340, 760, 280],
          caption: "Duty-cycle cell at 160 A · 240 V — 40% rated",
        },
      ],
      artifactGroups: [THERMAL_ARTIFACT.group_id],
      content: `5 minutes continuous at 160A on 240V is right at the edge of the rated duty cycle for this machine — **40% at 160A on 240V input per p.23**, i.e. 4 minutes on / 6 minutes off. So your first question is "am I past spec, or is something actually wrong?"

Pop the flowchart open in the artifact panel and walk down it — the first branch is on the **thermal-overload LED** on the front panel:

- **Solid on** means the machine has cut output completely (cooling issue). The tree then asks about the fan: running but still tripping → clear the vents; not running → fan has failed.
- **Blinking** means the machine is reducing output (duty-cycle issue). The tree asks what your actual duty cycle has been, whether you're on 240V or 120V input, and whether you're running through an extension cord.
- **Tripped twice already but off now** branches the same way as blinking — the behaviour is the same, just caught on the back of the trip.

The three terminal outcomes you'll most likely land on:

- *"You're past rated duty cycle"* — back off to 4 min on / 6 off, or drop amps. This is expected behaviour, not a fault.
- *"Airflow was the issue"* — the OL LED trips because radiator fins clog fast in a dusty shop. Cleared in two minutes with compressed air. See **p.22** for the vent spec.
- *"Remove the extension cord"* — if you're running through any extension, the input voltage sags, current climbs, and thermal protection trips even when you're inside the duty-cycle spec. **p.8** calls out 10 AWG minimum on 240V, with 6 AWG for longer runs.

Every leaf on the tree cites the manual page — click any of them to jump to the source viewer.`,
    }),
  ];
  return {
    id: "demo-thermal",
    title: "Demo · Thermal-protection diagnosis",
    createdAt: baseTs,
    updatedAt: baseTs + 19_000,
    messages,
    artifacts: { [THERMAL_ARTIFACT.group_id]: THERMAL_ARTIFACT },
  };
}

function migSetupDemo(): Thread {
  const baseTs = Date.now() - 2 * DAY;
  const messages: StoredMessage[] = [
    msg({
      id: "demo-3-u1",
      role: "user",
      ts: baseTs,
      content:
        "I'm brand new to this machine. Walk me through MIG setup end-to-end for 1/8-inch mild steel T-joints on 240V — every step, from unboxing the spool to the first practice bead, including what to check and the common mistakes I'd make. Show me what to look for on each manual page you're working from.",
    }),
    msg({
      id: "demo-3-a1",
      role: "assistant",
      ts: baseTs + 26_000,
      toolChips: [
        {
          id: "demo-3-tc1",
          name: "search",
          status: "done",
          summary: "MIG setup · 8 pages across the manual",
          input: {
            queries: [
              "MIG setup mild steel solid wire",
              "mount spool thread wire drive rolls",
              "polarity DCEP MIG torch ground",
              "shielding gas argon CO2 flow rate",
              "voltage wire speed starting settings mild steel",
            ],
          },
        },
        {
          id: "demo-3-tc2",
          name: "open_page",
          status: "done",
          summary: "p.8, p.9, p.11, p.12, p.13, p.22, p.27, p.37 loaded",
          input: { doc: "owner-manual", pages: [8, 9, 11, 12, 13, 22, 27, 37] },
        },
        {
          id: "demo-3-tc3",
          name: "emit_artifact",
          status: "done",
          summary: "procedure · 8 steps with inline page figures",
          input: { kind: "procedure", title: "MIG setup — 1/8″ mild steel on 240V" },
        },
      ],
      sources: [
        {
          doc: "owner-manual",
          doc_title: "OmniPro 220 owner's manual",
          page: 11,
          url: ownerSourceUrl(11),
          caption: "Spool mounting and tension setting",
        },
        {
          doc: "owner-manual",
          doc_title: "OmniPro 220 owner's manual",
          page: 13,
          url: ownerSourceUrl(13),
          cropUrl: "/crops/owner-manual/p-013-485d30a56d.png",
          bbox: [240, 420, 540, 340],
          caption: "Polarity paddle configuration — DCEP for MIG",
        },
      ],
      artifactGroups: [MIG_SETUP_ARTIFACT.group_id],
      content: `There are eight discrete steps to getting a first practice bead down — the walkthrough on the right steps through each one with a figure from the manual and the common mistakes flagged in yellow.

The shape of it:

1. **Confirm input voltage** (p.8) — on 120V the machine still runs but thermal trips early; 240V is the target.
2. **Mount the spool** (p.11) — 0.035″ solid wire, tension set with a half-turn of inertia on release.
3. **Thread through drive rolls** (p.12) — watch that the groove matches your wire diameter; it's the #1 new-owner mistake.
4. **Connect shielding gas** (p.9) — 75/25 Ar/CO₂ at 20–25 CFH for clean arcs on mild steel.
5. **Set polarity to DCEP** (p.13) — torch to output +, ground to output −. If your last session was FCAW, the leads are wired the wrong way round.
6. **Dial voltage and wire-feed speed** (p.27) — 18.5V / 340 ipm as the starting point for 1/8″ steel with 0.035″ wire.
7. **Lay a practice bead on scrap** (p.37) — 10–15° drag angle, 3/8″ stick-out, listen for the frying-bacon sound.
8. **Tack and weld the T-joint** (p.22) — 65/35 bias toward the bottom plate so heat goes where you need it.

Each step in the walkthrough has its page image inline on the right — click the citation chips at the bottom of each step to jump to the full page in the source viewer.`,
    }),
  ];
  return {
    id: "demo-mig-setup",
    title: "Demo · MIG setup walkthrough",
    createdAt: baseTs,
    updatedAt: baseTs + 26_000,
    messages,
    artifacts: { [MIG_SETUP_ARTIFACT.group_id]: MIG_SETUP_ARTIFACT },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Demo 5 — Weld-photo diagnosis (multimodal image input)
// ════════════════════════════════════════════════════════════════════════════
//
// Showcases the composer's image attachment: the user drops in a photo of
// their own bad weld and asks what went wrong. The assistant reads the image
// with vision, diagnoses the pattern (porosity), and cites the manual pages
// that cover the fix.

function weldDiagnosisDemo(): Thread {
  const baseTs = Date.now() - 3 * 3600_000;
  const messages: StoredMessage[] = [
    msg({
      id: "demo-5-u1",
      role: "user",
      ts: baseTs,
      content: "Why is my weld coming out like this?",
      attachments: [
        {
          id: "demo-5-att-1",
          src: "/demo/porosity.png",
          mediaType: "image/png",
          name: "porosity.png",
        },
      ],
    }),
    msg({
      id: "demo-5-a1",
      role: "assistant",
      ts: baseTs + 17_000,
      toolChips: [
        {
          id: "demo-5-tc1",
          name: "search",
          status: "done",
          summary: "porosity causes · shielding · p.37 top hit",
          input: {
            queries: [
              "porosity MIG weld holes pinholes",
              "shielding gas flow rate CFH",
              "contamination rust paint base metal",
              "drafty environment wind MIG",
              "gas nozzle cleaning spatter",
            ],
          },
        },
        {
          id: "demo-5-tc2",
          name: "open_page",
          status: "done",
          summary: "owner-manual p.37 (weld-defect photos)",
          input: { doc: "owner-manual", page: 37 },
        },
        {
          id: "demo-5-tc3",
          name: "open_page",
          status: "done",
          summary: "owner-manual p.36 (shielding gas setup)",
          input: { doc: "owner-manual", page: 36 },
        },
      ],
      sources: [
        {
          doc: "owner-manual",
          doc_title: "OmniPro 220 owner's manual",
          page: 37,
          url: ownerSourceUrl(37),
          caption: "Weld defect reference — porosity, undercut, cold lap",
        },
        {
          doc: "owner-manual",
          doc_title: "OmniPro 220 owner's manual",
          page: 36,
          url: ownerSourceUrl(36),
          caption: "Shielding gas flow settings and regulator troubleshooting",
        },
      ],
      content: `What you're looking at is **classic gas porosity**. The surface of the bead is pitted with small round holes where atmospheric gas (nitrogen / oxygen / water vapour) got into the molten puddle before it had time to solidify — see the defect photo on **p.37** of the owner's manual, which shows exactly this pattern and labels it *porosity*.

Five causes in order of likelihood for what I can see in your photo:

1. **Not enough shielding gas at the puddle.** On a 75/25 Ar/CO₂ setup for MIG, **p.36** calls for 20–25 CFH at the regulator for still-air conditions. Check the flowmeter ball is sitting in that band *during* the weld, not at idle — a collapsed ball on arc-start means a regulator or hose issue.
2. **Wind or a fan blowing across the puddle.** Even a gentle breeze across the nozzle strips the gas shield clean off the weld. If you're in an open garage, shut the door, move the weld 10 feet from any fan, or tent it.
3. **Contaminated base metal.** Rust, mill scale, oil, paint, galvanising — all of these boil off as gas under the arc and end up trapped in the bead. Hit the joint with a flap disc or wire brush down to bright metal about ½″ either side of the seam before you strike the arc again.
4. **Spattered gas nozzle.** A nozzle caked with spatter has a turbulent gas flow that doesn't shield properly. Ream it out with a nozzle cleaner and touch up with anti-spatter spray.
5. **Gas hose or O-ring leak.** Pinhole leaks in the torch hose or a cracked O-ring at the regulator pulls air into the shielding gas inline with the flow. Swap the hose or spray the fittings with soapy water and look for bubbles with the valve open.

Work through those in order — the fix is usually #1, #2, or #3. If the bead still looks like the photo after a fresh grind, fresh gas check, and no draft, then it's worth pulling the torch apart to inspect the liner and O-rings.

After each change, lay a 2-inch practice bead on clean scrap and look for the bubbles. A clean bead under the same settings means the last thing you changed was the culprit.`,
    }),
  ];
  return {
    id: "demo-weld-diagnosis",
    title: "Demo · Diagnose a bad weld from a photo",
    createdAt: baseTs,
    updatedAt: baseTs + 17_000,
    messages,
    artifacts: {},
  };
}

function panelLabelsDemo(): Thread {
  const baseTs = Date.now() - 1 * DAY;
  const messages: StoredMessage[] = [
    msg({
      id: "demo-4-u1",
      role: "user",
      ts: baseTs,
      content:
        "Label every control on the front panel of the OmniPro 220 — knobs, sockets, display, power switch. I'm holding the machine in front of me and I want numbered pins on a real photo, with a short description of what each one does.",
    }),
    msg({
      id: "demo-4-a1",
      role: "assistant",
      ts: baseTs + 14_000,
      toolChips: [
        {
          id: "demo-4-tc1",
          name: "search",
          status: "done",
          summary: "front panel controls · p.8 top hit",
          input: {
            queries: [
              "front panel controls knobs LCD",
              "OmniPro 220 home back button power switch",
              "negative positive socket MIG gun cable",
              "spool gun gas outlet storage compartment",
            ],
          },
        },
        {
          id: "demo-4-tc2",
          name: "open_page",
          status: "done",
          summary: "owner-manual p.8 loaded as image",
          input: { doc: "owner-manual", page: 8 },
        },
        {
          id: "demo-4-tc3",
          name: "emit_artifact",
          status: "done",
          summary: "image-labeling · 13 pins on p.8",
          input: { kind: "image-labeling", title: "Front-panel controls" },
        },
      ],
      sources: [
        {
          doc: "owner-manual",
          doc_title: "OmniPro 220 owner's manual",
          page: 8,
          url: ownerSourceUrl(8),
          caption: "Front Panel Controls — labelled diagram of every knob, button, and socket",
        },
      ],
      artifactGroups: [PANEL_ARTIFACT.group_id],
      content: `The artifact on the right overlays 13 numbered pins on the real front-panel diagram from **p.8** — one per callout on the manual's Front Panel Controls page. Hover a pin or a description to highlight the counterpart.

The controls, grouped by region:

- **LCD Display** — the single source of truth for what the machine is about to do. Shows the selected process, wire diameter, live voltage, live wire-feed speed, and the detected input voltage (120 V or 240 V) on every boot. The active function above each knob updates live as you move through menus.
- **Home Button** and **Back Button** — menu navigation. Home returns you to the main process-select screen; Back steps one level up in whichever submenu you're in.
- **Left Knob**, **Control Knob**, and **Right Knob** — three dials whose meaning depends on the current screen. On the main screen, typically voltage and wire-feed speed on the outer knobs; inside submenus, parameter values. The Control Knob in the middle doubles as a push-to-click confirm.
- **Power Switch** — rocker on the upper right of the faceplate. The machine re-detects input voltage on every power-on.
- **Negative Socket** and **Positive Socket** — DCEN and DCEP output terminals. Which one your torch vs. ground clamp plug into depends on the process; the polarity setup lives on **p.13**. The single most common "my machine suddenly welds badly" cause is forgetting to swap these after a process change.
- **MIG Gun / Spool Gun Cable Socket** — one Euro-style plug carries welding current, trigger pilot, and shielding gas to the gun. Used for both the standard MIG gun and the optional Spool Gun.
- **Spool Gun Gas Outlet** — separate gas port that the optional Spool Gun's gas hose connects to when you're running with it.
- **Wire Feed Power Cable** — internal power cable running from the control board to the wire-feed drive rolls. Exits the faceplate on the left.
- **Storage Compartment** — recessed cubby on the lower right for spare tips, a nozzle cleaner, a drive-roll spanner — the small things you reach for every five minutes.

Click any row in the description list to flash the matching pin on the image.`,
    }),
  ];
  return {
    id: "demo-panel-labels",
    title: "Demo · Front-panel annotations",
    createdAt: baseTs,
    updatedAt: baseTs + 14_000,
    messages,
    artifacts: { [PANEL_ARTIFACT.group_id]: PANEL_ARTIFACT },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════════════════════

/**
 * Marker in localStorage that tells us demo seeding has already run once on
 * this browser. Deleting threads does NOT re-seed — we want deletion to stick.
 * Bump the suffix if you ever reshape the demo content and want to force a
 * reseed on return visits.
 */
export const DEMO_SEEDED_KEY = "manual-copilot:threads:seeded:v7";

export function buildDemoThreads(): Thread[] {
  // Order matters — most-recent first so the sidebar lists them top-down.
  // The weld-photo diagnosis is the newest thread and showcases multimodal
  // image input, so it lands as the active thread on first mount.
  return [
    weldDiagnosisDemo(),
    envelopeCalculatorDemo(),
    thermalTroubleshootDemo(),
    migSetupDemo(),
    panelLabelsDemo(),
  ];
}
