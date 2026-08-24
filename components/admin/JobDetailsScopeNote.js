"use client";

import Link from "next/link";

/**
 * "These details belong to this job."
 *
 * WHY IT IS ALWAYS THERE RATHER THAN A TOAST. A toast tells somebody after they
 * have done it, once, and only if they read it. This is the rule the whole
 * arrangement rests on:
 *
 *   The CUSTOMER RECORD is who somebody is, and it is what prefills every new
 *   quote. Change it there and you are asked whether their jobs should follow.
 *
 *   The QUOTE and the ORDER each carry their own COPY, and it is allowed to
 *   differ. A second kitchen at an investment property is a real job at an
 *   address that is not where the customer lives, so correcting a home address
 *   must never quietly redirect a delivery.
 *
 * Somebody who has read this line once knows where to go the next time, which a
 * toast never manages. It is quiet on purpose: it is a standing fact about the
 * screen, not a warning about what you just did.
 */
export default function JobDetailsScopeNote({ customerId, what = "job" }) {
  return (
    <p className="mt-3 rounded-[6px] border border-[#dbd8cc] bg-[#f5f8f4] px-3 py-[9px] text-[11.5px] leading-[1.55] text-[#5a5a52]">
      <b className="font-semibold text-[#1a1a18]">These details belong to this {what}.</b>{" "}
      Changing them here changes this {what} only, which is how a job at a different address stays right.
      {customerId ? (
        <>
          {" "}
          To change the customer everywhere, edit{" "}
          <Link
            href={`/admin/customers/${customerId}`}
            className="font-semibold text-[#2d5e28] underline"
          >
            their customer record
          </Link>
          , and you will be asked whether their other jobs should follow.
        </>
      ) : (
        <> To change the customer everywhere, edit their customer record.</>
      )}
    </p>
  );
}
