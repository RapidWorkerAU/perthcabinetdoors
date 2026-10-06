// THE PRIVACY POLICY, IN WORDS.
//
// Kept here rather than typed into the page, the same way the cancellation
// policy is (lib/pcd-cancellation-policy.js), so a test can hold the lines that
// must never quietly disappear: that a person approves every email Alfred
// drafts, and that card details never reach us.
//
// Plain words, no legal claims we cannot stand behind. Have it read by somebody
// who advises the business before relying on it for anything more than telling
// customers honestly what happens to their details.

export const PRIVACY_POLICY_PATH = "/privacy";
export const PRIVACY_POLICY_UPDATED = "6 October 2026";

/** The sentence about AI drafting, decided with Alfred. Tested. */
export const AI_DRAFTING_LINE =
  "We use an AI service to help our team draft replies. A person reads and approves every email before it is sent.";

export function privacyPolicySections({ salesEmail, tradingName, legalEntity }) {
  return [
    {
      key: "who",
      heading: "Who we are",
      paragraphs: [
        `${tradingName} is a trading name of ${legalEntity}. This policy explains what personal information we collect, why, and what we do with it. If anything here is unclear, email us at ${salesEmail}.`,
      ],
    },
    {
      key: "collect",
      heading: "What we collect",
      bullets: [
        "Your name, email address and phone number.",
        "Your delivery or site address, when we need it for a measure, a delivery or an installation.",
        "The details of your project: sizes, colours, drawings, photos and anything else you send us.",
        "Our emails and messages with you, and the quotes, orders, invoices and payments that go with them.",
        "A count of which pages of this website are viewed. This uses no cookies and nothing that identifies you.",
      ],
    },
    {
      key: "why",
      heading: "Why we use it",
      bullets: [
        "To quote, make, deliver and install your order.",
        "To keep you updated about your order and answer your questions.",
        "To take payments and keep the records the law asks us to keep.",
        "After a job is finished, to ask once whether you would review us. Every one of those emails has a link to stop them.",
      ],
      paragraphs: ["We do not sell your information, and we do not send marketing emails."],
    },
    {
      key: "ai",
      heading: "AI drafting",
      paragraphs: [
        AI_DRAFTING_LINE,
        "The service sees the details it needs to draft that reply, such as your name, your order's progress and your message. It does not send anything itself.",
      ],
    },
    {
      key: "share",
      heading: "Who else sees it",
      paragraphs: [
        "Only the services that help us run the business, and only what each one needs:",
      ],
      bullets: [
        "our website and database hosting",
        "our email services, which send and store our emails",
        "Stripe, which takes card payments. Your card details go straight to Stripe and never reach us.",
        "the AI drafting service described above",
        "suppliers and couriers, when they need a name or address to make or deliver your order",
      ],
    },
    {
      key: "where",
      heading: "Where it is kept",
      paragraphs: [
        "Some of these services store or process information outside Australia, including in the United States. We use established providers and keep access to our own systems limited to our staff.",
      ],
    },
    {
      key: "access",
      heading: "Seeing or correcting your information",
      paragraphs: [
        `Email ${salesEmail} to ask for a copy of what we hold about you, to correct it, or to ask us to delete what we do not need to keep. We will reply within 30 days. If you are unhappy with how we have handled your information, tell us first and we will try to put it right.`,
      ],
    },
  ];
}
