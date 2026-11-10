// What a site measure is for: rooms, counts and the kind of job.
// See lib/pcd-site-measure-scope.js.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isJobType,
  jobTypeLabel,
  normalizeMeasureRooms,
  roomCountWords,
  roomsWords,
  scopeWords,
  siteMeasureTitle,
  totalRooms,
} from "../lib/pcd-site-measure-scope.js";

const ALLOWED = ["Kitchen", "Laundry", "Bathroom", "Ensuite", "Other"];

test("rooms off the list are dropped, counts are held, and the list order wins", () => {
  const rooms = normalizeMeasureRooms(
    [
      { room: "Bathroom", count: 2 },
      { room: "Spaceship", count: 1 },
      { room: "Kitchen", count: 1 },
      { room: "Laundry", count: 0 },
      { room: "Ensuite", count: 99 },
    ],
    ALLOWED
  );
  assert.deepEqual(rooms, [
    { room: "Kitchen", count: 1 },
    { room: "Bathroom", count: 2 },
    { room: "Ensuite", count: 20 },
  ]);
  assert.equal(totalRooms(rooms), 23);
});

test("a stored booking reads back even after its room is retired", () => {
  assert.deepEqual(normalizeMeasureRooms([{ room: "Scullery", count: 1 }]), [{ room: "Scullery", count: 1 }]);
  assert.deepEqual(normalizeMeasureRooms(null), []);
});

test("the words are the same everywhere they are shown", () => {
  const rooms = [{ room: "Kitchen", count: 1 }, { room: "Bathroom", count: 2 }];
  assert.equal(roomsWords(rooms), "Kitchen, Bathroom x2");
  assert.equal(roomCountWords(rooms), "3 rooms");
  assert.equal(roomCountWords([{ room: "Kitchen", count: 1 }]), "1 room");
  assert.equal(siteMeasureTitle("Jane Smith", rooms), "Site measure, Jane Smith, 3 rooms");
  assert.equal(siteMeasureTitle("Jane Smith", []), "Site measure, Jane Smith", "an office booking has no count");
  assert.equal(scopeWords({ rooms, jobType: "cabinetry" }), "Kitchen, Bathroom x2 (3 rooms). New cabinetry");
});

test("job type is one of three, and nothing else", () => {
  assert.equal(isJobType("doors"), true);
  assert.equal(isJobType("whole house"), false);
  assert.equal(jobTypeLabel("unsure"), "Not sure yet");
});

test("the booking route refuses a booking with no rooms or no job type", () => {
  const route = readFileSync(new URL("../app/api/public/site-measure/book/route.js", import.meta.url), "utf8");
  assert.match(route, /if \(!rooms\.length\) missing\.push/);
  assert.match(route, /if \(!isJobType\(jobType\)\) missing\.push/);
});

test("rooms reach the calendar event, both emails and the stored booking", () => {
  const booking = readFileSync(new URL("../lib/pcd-site-measure-booking.js", import.meta.url), "utf8");
  const emails = readFileSync(new URL("../lib/pcd-site-measure-emails.js", import.meta.url), "utf8");
  const store = readFileSync(new URL("../lib/pcd-booking-store.js", import.meta.url), "utf8");
  assert.match(booking, /title: siteMeasureTitle\(/);
  assert.match(booking, /Measuring: /);
  assert.match(emails, /\["What we are measuring"/);
  assert.match(emails, /\["Measuring"/);
  assert.match(emails, /\["Job"/);
  assert.match(store, /measure_rooms: customer\.rooms/);
});
