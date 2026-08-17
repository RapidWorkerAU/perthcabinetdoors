"use client";

// The loading state for an admin page.
//
// Every page used to say its own line of grey text somewhere near the top left
// ("Loading orders...", "Loading quote..."), which reads as a page that has
// half rendered rather than one that is working. This is the same cabinet the
// design tools build while they start up, so waiting looks the same wherever
// you are in the product.
//
// It fills the shell's content area and centres in it both ways. min-h-full
// resolves against <main>, which the shell gives a definite height, and the
// padding is the floor for the cases where it does not (inside a card, or on a
// page that has not been given a height of its own).

import PcdLoader from "../public/PcdLoader";

export default function AdminLoading({
  steps = ["Loading", "Almost there"],
  label = "Loading",
  className = "",
}) {
  return (
    <div className={`flex min-h-full w-full flex-1 items-center justify-center px-6 py-20 ${className}`}>
      <PcdLoader variant="content" steps={steps} label={label} />
    </div>
  );
}
