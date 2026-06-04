"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function QuoteAccessClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter your access code.");
      return;
    }
    const normalized = trimmed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/quote/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "We could not validate that code.");
        return;
      }

      router.push("/quote/view");
    } catch {
      setError("We could not validate that code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="quote-access">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Access your quote</h1>
        <p className="text-sm text-slate-600">
          Enter the access code provided by HSES to view your proposal.
        </p>
      </div>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700">
          Access code
          <input
            className="qb-input mt-2"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. Q8X3-9F2L"
            autoComplete="one-time-code"
          />
        </label>
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <button type="submit" className="qb-btn qb-btn--dark w-full" disabled={isSubmitting}>
          {isSubmitting ? "Checking..." : "View quote"}
        </button>
      </form>
    </div>
  );
}
