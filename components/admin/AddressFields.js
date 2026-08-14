"use client";

// The three address boxes, for every admin screen that asks for one.
//
// WHY THIS EXISTS. Acceptance asked the customer for street, suburb and
// postcode; every admin screen asked for one free text line. The same address
// typed by a staff member and by the customer produced two different records,
// and a delivery run planned by suburb could only see the half that came in
// through acceptance. Now every screen asks the same three questions, in the
// same order, with the same labels, from one definition.
//
// The labels and order come from ADDRESS_FIELDS, which the public quote page
// renders from as well, so the two cannot drift apart.

import { ADDRESS_FIELDS } from "../../lib/pcd-contact-details";

const LABEL = "flex flex-col gap-1 text-[11px] font-medium text-[#5a5a52]";
const INPUT =
  "h-[34px] w-full border border-[#dbd8cc] rounded-[6px] px-3 text-[13px] text-[#1a1a18] bg-white focus:outline-none focus:border-[#6b9e61]";

// Rendered as three plain siblings so the screen's own grid lays them out.
// Street takes the full width where there is a grid to span, because a street
// address is longer than the other two put together.
export default function AddressFields({
  value,
  onChange,
  onBlur,
  disabled = false,
  labelClassName = LABEL,
  inputClassName = INPUT,
  streetClassName = "md:col-span-2",
}) {
  return (
    <>
      {ADDRESS_FIELDS.map((field) => (
        <label
          key={field.key}
          className={`${labelClassName} ${field.key === "street" ? streetClassName : ""}`}
        >
          {field.label}
          <input
            className={inputClassName}
            value={value?.[field.key] || ""}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            inputMode={field.inputMode}
            disabled={disabled}
            onChange={(event) => onChange(field.key, event.target.value)}
            onBlur={onBlur ? () => onBlur(field.key) : undefined}
          />
        </label>
      ))}
    </>
  );
}
