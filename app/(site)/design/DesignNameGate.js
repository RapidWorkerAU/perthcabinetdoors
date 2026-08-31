"use client";

import Link from "next/link";
import { useState } from "react";
import DesignNameField from "./DesignNameField";
import { isUsableDesignName } from "../../../lib/pcd-design-name";

// THE FIRST SCREEN OF THE PLANNER.
//
// ── WHY IT IS A SCREEN AND NOT A PROMPT LATER ────────────────────────────────
//
// It was asked for at the end, effectively, by never being asked at all: the
// design was created as "My design" and stayed that way, because once somebody
// is drawing cabinets they are not going to stop and title anything. So it is
// asked once, first, when it costs one line of typing.
//
// ── AND WHY NOTHING EXISTS UNTIL IT IS ANSWERED ──────────────────────────────
//
// No row is created until this screen is answered, so somebody who opens the
// planner out of curiosity and leaves leaves nothing behind. It also means the
// count of design sessions on the dashboard is people who actually started one,
// rather than everybody who ever loaded the page.

const C = {
  edge: "#e4dfd4", ink: "#2a2925", soft: "#7a766c", green: "#1f6f4a", stage: "#eceae3",
};

export default function DesignNameGate({ onStart, busy = false, resuming = false }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const ready = isUsableDesignName(name);

  async function start() {
    if (!ready || busy) return;
    setError("");
    const result = await onStart(name);
    if (result && result.ok === false) setError(result.error || "Could not start your design.");
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1, background: C.stage,
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}
    >
      <div style={{ flexShrink: 0, padding: "16px 20px" }}>
        <Link href="/" style={{ color: C.ink, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
          Perth Cabinet Doors
        </Link>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 20px 48px" }}>
        <div
          style={{
            width: "min(460px, 100%)", background: "#fff", border: `1px solid ${C.edge}`,
            borderRadius: 16, padding: "26px 24px 24px",
            boxShadow: "0 18px 48px rgba(42,41,37,0.10)",
          }}
        >
          {/* TWO REASONS TO BE HERE, and they need different words. Somebody
              coming back to work they already did must not be told we are
              starting something, or they will think it has been lost. */}
          <h1 style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 700, color: C.ink, lineHeight: 1.25 }}>
            {resuming ? "What should we call this design?" : "Let’s start your design"}
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.55, color: C.soft }}>
            {resuming
              ? "Your design is here and nothing has changed in it. It just does not have a name yet, and without one we cannot tell it apart from everybody else's when you send it to us."
              : "Give it a name first so you can find it again, and so we know which one you mean when you send it to us."}
          </p>

          <DesignNameField
            value={name}
            onChange={(next) => { setName(next); if (error) setError(""); }}
            onSubmit={start}
            autoFocus
            disabled={busy}
            // The heading already asks the question when we are naming
            // something that exists, so the field just labels itself.
            label={resuming ? "Design name" : "What should we call this design?"}
            hint="Your street, the room, whatever helps you tell it apart later. You can change it any time."
          />

          {error && (
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#b4442f", lineHeight: 1.5 }}>{error}</p>
          )}

          <button
            type="button"
            onClick={start}
            disabled={!ready || busy}
            style={{
              marginTop: 18, width: "100%", padding: "13px 16px", borderRadius: 10,
              border: `1px solid ${ready && !busy ? C.green : C.edge}`,
              backgroundColor: ready && !busy ? C.green : "#f1efe8",
              color: ready && !busy ? "#fff" : C.soft,
              font: "inherit", fontSize: 15, fontWeight: 700,
              cursor: ready && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy
              ? (resuming ? "Saving" : "Setting up your room")
              : (resuming ? "Save and carry on" : "Start designing")}
          </button>

          <p style={{ margin: "16px 0 0", fontSize: 12.5, lineHeight: 1.55, color: C.soft }}>
            {resuming
              ? "Everything you have drawn is still there, waiting."
              : "Free, and no account needed. Nothing is sent to us until you choose to send it."}
          </p>
        </div>
      </div>
    </div>
  );
}
