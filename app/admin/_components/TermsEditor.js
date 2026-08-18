"use client";

// A small formatted-text box: bold, italic, underline, bulleted and numbered
// lists. Nothing else.
//
// WHY NO EDITOR LIBRARY. The whole feature is five commands over a subset of
// HTML that is already pinned down in lib/pcd-terms-html.js, and every one of
// them is a browser built-in. A ProseMirror or Lexical dependency would be
// larger than the thing it is editing, and would still need the same sanitiser
// on the way out, because what protects the customer's quote page is the
// whitelist on save and not the editor that produced the markup.
//
// execCommand is deprecated and has no replacement for exactly this job. It is
// implemented in every browser, it is not going anywhere while the web is full
// of editors built on it, and the alternative is hand-writing selection and
// range surgery. styleWithCSS is turned off so it produces <b>/<i>/<u> tags
// rather than styled spans, which is what the sanitiser keeps.

import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeTermsHtml, toTermsHtml } from "../../../lib/pcd-terms-html";

const TOOLS = [
  { command: "bold", label: "B", title: "Bold", className: "font-bold" },
  { command: "italic", label: "I", title: "Italic", className: "italic font-serif" },
  { command: "underline", label: "U", title: "Underline", className: "underline" },
  { command: "insertUnorderedList", label: "• List", title: "Bulleted list", className: "" },
  { command: "insertOrderedList", label: "1. List", title: "Numbered list", className: "" },
];

export default function TermsEditor({ value, onChange, placeholder = "", height = 160, ariaLabel = "Terms" }) {
  const ref = useRef(null);
  const [active, setActive] = useState({});
  // The last markup this box sent OUT. See the effect below: this is what tells
  // a value coming back in from React apart from one that came from somewhere
  // else, and it is the whole fix for the caret jumping to the front.
  const lastEmitted = useRef(null);

  // React must not own what is inside a contenteditable while somebody is
  // typing in it. Writing innerHTML puts the caret back at the start, so it may
  // only happen when the text genuinely came from elsewhere.
  //
  // THE BUG THIS FIXES. Typing "H" emitted "H", which came back as `value`.
  // toTermsHtml turned that into "<p>H</p>", which never equals the "H" in the
  // box, so the effect rewrote the DOM and reset the caret on EVERY keystroke.
  // From the second character on, everything was typed in front of the first.
  //
  // Comparing against what this box last emitted, rather than against the
  // normalised markup, is what makes the difference: our own text coming back
  // is ignored, and an insertion from outside still lands.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (value === lastEmitted.current) return;
    const next = toTermsHtml(value);
    if (node.innerHTML !== next) node.innerHTML = next;
  }, [value]);

  const readBack = useCallback(() => {
    const node = ref.current;
    if (!node || !onChange) return;
    const html = node.innerHTML;
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  const refreshActive = useCallback(() => {
    if (typeof document === "undefined") return;
    const state = {};
    for (const tool of TOOLS) {
      try {
        state[tool.command] = document.queryCommandState(tool.command);
      } catch {
        state[tool.command] = false;
      }
    }
    setActive(state);
  }, []);

  const run = (command) => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    try {
      document.execCommand("styleWithCSS", false, false);
    } catch {
      // Firefox throws when the document is not editable yet. The command below
      // still works; it just may produce a styled span, which the sanitiser
      // drops back to plain text rather than letting through.
    }
    document.execCommand(command, false, undefined);
    readBack();
    refreshActive();
  };

  const isEmpty = !toTermsHtml(value).trim();

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-1 rounded-t-[6px] border border-b-0 border-[#dbd8cc] bg-[#f5f8f4] px-2 py-[6px]">
        {TOOLS.map((tool) => (
          <button
            key={tool.command}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            aria-pressed={Boolean(active[tool.command])}
            // The toolbar sits inside the quote's form, so mousedown has to be
            // stopped or the button steals focus and the selection it is meant
            // to act on is gone by the time it runs.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(tool.command)}
            className={`h-[26px] min-w-[28px] rounded-[4px] border px-2 text-[12px] leading-none ${tool.className} ${
              active[tool.command]
                ? "border-[#6b9e61] bg-white text-[#1c2b1e]"
                : "border-transparent text-[#5a5a52] hover:border-[#dbd8cc] hover:bg-white"
            }`}
          >
            {tool.label}
          </button>
        ))}
      </div>

      <div className="relative">
        {isEmpty && placeholder ? (
          <span className="pointer-events-none absolute left-3 top-2 text-[13px] text-[#a8a69c]">{placeholder}</span>
        ) : null}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable
          suppressContentEditableWarning
          onInput={readBack}
          // Cleaned on the way out of the box rather than on every keystroke:
          // rewriting the markup mid-sentence moves the caret. The server
          // sanitises again on save, which is the guarantee that matters.
          onBlur={() => {
            const node = ref.current;
            if (!node) return;
            const cleaned = sanitizeTermsHtml(node.innerHTML);
            if (cleaned !== node.innerHTML) node.innerHTML = cleaned;
            lastEmitted.current = cleaned;
            if (onChange) onChange(cleaned);
          }}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          // Behaves like the textareas beside it: a fixed starting height that
          // scrolls once the wording outgrows it, and a drag handle to make it
          // taller. A contenteditable does neither by default — it just keeps
          // growing, which pushed the Save button off the bottom of a long set
          // of terms.
          //
          // resize needs overflow to be anything but visible, so the two go
          // together: without overflow-y-auto the drag handle does not appear
          // at all.
          className="w-full resize-y overflow-y-auto rounded-b-[6px] border border-[#dbd8cc] bg-white px-3 py-2 text-[13px] leading-relaxed text-[#1a1a18] outline-none focus:border-[#6b9e61] [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
          // height is the starting size; the minHeight below is the floor you
          // cannot drag past, so the box can never be shrunk to a sliver.
          style={{ height, minHeight: 64 }}
        />
      </div>
    </div>
  );
}
