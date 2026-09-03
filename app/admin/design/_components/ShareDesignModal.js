"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { VIEW_ONLY, EDITABLE } from "../../../../lib/pcd-design-share-mode";

// SENDING A DESIGN WE DREW TO THE PERSON IT IS FOR.
//
// The link opens the public planner, which renders any project from its code in
// plan, elevation and 3D. What this decides is whether the person opening it
// can change what they see.
//
// ── VIEW IS PRESELECTED, AND THAT IS THE POINT ───────────────────────────────
//
// Most of the time a draft goes out to be looked at and agreed to. If it could
// be edited by the person approving it, the thing they agreed to and the thing
// we drew would stop being the same drawing, with nothing saying which moved.
// Editable is still one click away, for when you actually want them to play.
//
// ── THE LINK EXISTS WHETHER OR NOT THE EMAIL DOES ────────────────────────────
//
// Sharing turns the link on and hands it back. Emailing is a separate, optional
// step: leave the address blank and you get a link to paste into a message
// yourself. A refused email must therefore not read as a failed share, because
// the design IS shared at that point.

export default function ShareDesignModal({ project, onClose, onShared }) {
  const [mode, setMode] = useState(VIEW_ONLY);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const sharing = Boolean(project?.is_public);
  const currentMode = project?.share_mode || EDITABLE;

  async function call(method, body) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/design/projects/${project.id}/share`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not share the design.");
        return null;
      }
      onShared?.(data.share);
      return data;
    } catch (thrown) {
      setError(thrown?.message || "Could not share the design.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const data = await call("POST", { mode, email: email.trim(), name: name.trim() });
    if (data) setResult(data);
  }

  async function stopSharing() {
    const data = await call("DELETE");
    if (data) {
      setResult(null);
      onClose();
    }
  }

  function copy() {
    if (!result?.share?.shareUrl) return;
    navigator.clipboard?.writeText(result.share.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Modal open onClose={onClose} title="Share this design">
      <div className="flex flex-col gap-4 text-[13px] text-[#1a1a18]">
        {sharing && !result && (
          <p className="rounded-[8px] border border-[#e8d68f] bg-[#fffdf0] px-3 py-2 text-[12.5px] text-[#8a6d0b]">
            This design is already shared, {currentMode === VIEW_ONLY ? "to view only" : "with editing allowed"}
            {project?.shared_to ? `, last sent to ${project.shared_to}` : ""}. Sharing again keeps the same link
            and applies whatever you choose below.
          </p>
        )}

        {!result && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8b8a81]">
                What can they do
              </span>
              <Choice
                checked={mode === VIEW_ONLY}
                onChange={() => setMode(VIEW_ONLY)}
                title="Look at it only"
                detail="They can open the plan, the elevations and the 3D view, and change nothing. Use this for a draft you want agreed to."
              />
              <Choice
                checked={mode === EDITABLE}
                onChange={() => setMode(EDITABLE)}
                title="Look at it and change it"
                detail="They can move and reconfigure cabinets, and what they change is this design, not a copy of it."
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8b8a81]">
                Email it to them (optional)
              </span>
              <input
                className="min-h-[38px] rounded-[8px] border border-[#dbd8cc] px-3 text-[13px]"
                placeholder="Their name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="min-h-[38px] rounded-[8px] border border-[#dbd8cc] px-3 text-[13px]"
                placeholder="their@email.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="text-[12px] text-[#8b8a81]">
                Leave blank to just get the link and send it yourself.
              </span>
            </div>
          </>
        )}

        {result && (
          <div className="flex flex-col gap-3">
            <p className="rounded-[8px] border border-[#cbe0c4] bg-[#f4faf3] px-3 py-2 text-[12.5px] text-[#2d5e28]">
              Shared {result.share.share_mode === VIEW_ONLY ? "to view only" : "with editing allowed"}
              {result.emailed ? `, and emailed to ${result.share.shared_to}` : ""}.
            </p>
            {result.emailError && (
              <p className="rounded-[8px] border border-[#e8d68f] bg-[#fffdf0] px-3 py-2 text-[12.5px] text-[#8a6d0b]">
                {result.emailError} The link below works either way.
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={result.share.shareUrl}
                onFocus={(e) => e.target.select()}
                className="min-h-[38px] flex-1 rounded-[8px] border border-[#dbd8cc] px-3 font-mono text-[12px]"
              />
              <Button size="sm" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-[8px] border border-[#f0cec6] bg-[#fdf3f1] px-3 py-2 text-[12.5px] text-[#a3311f]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[#e9e7df] pt-3">
          {!result && (
            <Button onClick={share} disabled={busy || !project?.id}>
              {busy ? "Sharing" : sharing ? "Update the link" : "Share it"}
            </Button>
          )}
          {sharing && (
            <Button variant="secondary" onClick={stopSharing} disabled={busy}>
              Stop sharing
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {result ? "Done" : "Cancel"}
          </Button>
        </div>

        {sharing && (
          <p className="text-[12px] leading-[1.5] text-[#8b8a81]">
            Stopping sharing turns the link off straight away. It keeps its code, so turning it back on later gives
            the same link rather than a new one.
          </p>
        )}
      </div>
    </Modal>
  );
}

function Choice({ checked, onChange, title, detail }) {
  return (
    <label
      className={[
        "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-[10px] rounded-[8px] border px-3 py-[10px]",
        checked ? "border-[#2d5e28] bg-[#f4faf3]" : "border-[#dbd8cc] bg-white",
      ].join(" ")}
    >
      <input type="radio" checked={checked} onChange={onChange} className="mt-[3px] accent-[#2d5e28]" />
      <span>
        <b className="block text-[13px]">{title}</b>
        <span className="text-[12px] leading-[1.5] text-[#5a5a52]">{detail}</span>
      </span>
    </label>
  );
}
