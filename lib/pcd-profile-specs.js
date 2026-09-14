// WHAT POLYTEC SAYS ABOUT EACH PROFILE.
//
// Transcribed from "Thermolaminated Doors & Panels, Minimum Sizes", issue of
// May 2026, and the profile styles from the Thermolaminated brochure. This is
// the manufacturer's own data, not something measured off a photograph, and
// where the two disagree this wins.
//
// ── WHAT EACH COLUMN IS ──────────────────────────────────────────────────────
//
//   style          1 Minimal, 2 Soft, 3 Sharp, 4 Detailed, 5 Detailed 21mm
//                  only, 6 Fluted. It decides what the FACE of the door is.
//   minHeightMm    the smallest we can have it pressed. Height before width,
//   minWidthMm     the same way round as everything else here.
//   railStartMm    how far in from the edge of the door the routed border
//                  begins. Absent on a door with no border to begin.
//   routeWidthMm   how wide that border is, so railStart + routeWidth is where
//                  the flat panel starts.
//   routeDepthMm   how deep it is cut. Not drawn, but it is what makes one
//                  profile read as sharp and another as soft.
//
// ── WHY THIS IS BETTER THAN OUR MEASUREMENTS ─────────────────────────────────
//
// lib/pcd-profile-geometry.js holds line positions measured off the Polytec
// photographs. Checked against this table, sixty eight of the seventy four we
// could compare landed within 5mm of the published rail start, which is what
// says those measurements are reading real routed lines rather than lighting.
//
// It also found what measurement could not. STYLE 1 IS A FLAT FACE: no rail
// start, no route width, no route depth, because there is nothing routed into
// it at all. We had measured lines on eight of them. Those lines are the EDGE
// MOULD, which is a shape on the edge and not a line on the face, and drawing
// them put a border on a door that has none.
//
// ── WHAT IS NOT HERE ─────────────────────────────────────────────────────────
//
// The arch. Every Style 2 and Style 4 cathedral door has a rail start and a
// route width in this table and no hint anywhere in it that the border curves.
// That still has to be measured.
//
// ── KNOWN FAULTS IN THE SOURCE, LEFT AS PRINTED ──────────────────────────────
//
// "Chfiely" is Chifley. Gerroa lists a 21mm minimum width against a 40mm rail
// start, and Calcutta an 80mm minimum width against a 70mm rail start, both of
// which are impossible. Transcribed as printed rather than corrected, so that
// this file can be checked against the document it came from.

const PROFILE_SPECS = {
  "albury": { name: "Albury", style: 2, minHeightMm: 184, minWidthMm: 184, railStartMm: 60, routeWidthMm: 22, routeDepthMm: 7 },
  "allandale-(21mm)": { name: "Allandale (21mm)", style: 5, minHeightMm: 200, minWidthMm: 227, railStartMm: 65, routeDepthMm: 12 },
  "amsterdam": { name: "Amsterdam", style: 3, minHeightMm: 228, minWidthMm: 228, railStartMm: 60, routeWidthMm: 44, routeDepthMm: 10 },
  "argentina": { name: "Argentina", style: 3, minHeightMm: 235, minWidthMm: 235, railStartMm: 60, routeWidthMm: 47, routeDepthMm: 9 },
  "arizona": { name: "Arizona", style: 2, minHeightMm: 240, minWidthMm: 230, railStartMm: 60, routeWidthMm: 30, routeDepthMm: 8 },
  "ascot": { name: "Ascot", style: 4, minHeightMm: 140, minWidthMm: 140, railStartMm: 40, routeWidthMm: 1, routeDepthMm: 4 },
  "atlanta": { name: "Atlanta", style: 3, minHeightMm: 232, minWidthMm: 232, railStartMm: 60, routeWidthMm: 46, routeDepthMm: 7 },
  "auckland": { name: "Auckland", style: 2, minHeightMm: 184, minWidthMm: 184, railStartMm: 60, routeWidthMm: 4, routeDepthMm: 2 },
  "bali": { name: "Bali", style: 3, minHeightMm: 222, minWidthMm: 232, railStartMm: 60, routeWidthMm: 31, routeDepthMm: 8 },
  "ballarat": { name: "Ballarat", style: 4, minHeightMm: 175, minWidthMm: 175, railStartMm: 60, routeDepthMm: 9 },
  "bangkok": { name: "Bangkok", style: 2, minHeightMm: 202, minWidthMm: 202, railStartMm: 60, routeWidthMm: 31, routeDepthMm: 8 },
  "bankstown": { name: "Bankstown", style: 2, minHeightMm: 202, minWidthMm: 300, railStartMm: 60, routeWidthMm: 15, routeDepthMm: 6 },
  "bari": { name: "Bari", style: 3, minHeightMm: 121, minWidthMm: 121, railStartMm: 16, routeWidthMm: 15, routeDepthMm: 3 },
  "bathurst": { name: "Bathurst", style: 2, minHeightMm: 220, minWidthMm: 230, railStartMm: 60, routeWidthMm: 30, routeDepthMm: 8 },
  "bayswater": { name: "Bayswater", style: 4, minHeightMm: 177, minWidthMm: 177, railStartMm: 60, routeDepthMm: 10 },
  "bega": { name: "Bega", style: 2, minHeightMm: 234, minWidthMm: 244, railStartMm: 60, routeWidthMm: 37, routeDepthMm: 7 },
  "beirut": { name: "Beirut", style: 3, minHeightMm: 202, minWidthMm: 202, railStartMm: 60, routeWidthMm: 30, routeDepthMm: 8 },
  "bendigo": { name: "Bendigo", style: 2, minHeightMm: 204, minWidthMm: 204, railStartMm: 60, routeWidthMm: 32, routeDepthMm: 7 },
  "berrilee": { name: "Berrilee", style: 4, minHeightMm: 160, minWidthMm: 160, railStartMm: 60, routeDepthMm: 4 },
  "berrima": { name: "Berrima", style: 4, minHeightMm: 161, minWidthMm: 161, railStartMm: 40, routeDepthMm: 6 },
  "bologna": { name: "Bologna", style: 3, minHeightMm: 250, minWidthMm: 260, railStartMm: 60, routeWidthMm: 45, routeDepthMm: 9 },
  "bondi": { name: "Bondi", style: 3, minHeightMm: 230, minWidthMm: 170, railStartMm: 60, routeWidthMm: 38, routeDepthMm: 10 },
  "bourke": { name: "Bourke", style: 2, minHeightMm: 170, minWidthMm: 170, railStartMm: 62, routeWidthMm: 8, routeDepthMm: 3 },
  "bowral": { name: "Bowral", style: 4, minHeightMm: 174, minWidthMm: 205, railStartMm: 62, routeDepthMm: 2 },
  "branxton-(21mm)": { name: "Branxton (21mm)", style: 5, minHeightMm: 200, minWidthMm: 200, railStartMm: 65, routeWidthMm: 29, routeDepthMm: 13 },
  "briar-(21mm)": { name: "Briar (21mm)", style: 5, minHeightMm: 210, minWidthMm: 210, railStartMm: 65, routeWidthMm: 29, routeDepthMm: 13 },
  "broadway": { name: "Broadway", style: 3, minHeightMm: 168, minWidthMm: 168, railStartMm: 60, routeWidthMm: 14, routeDepthMm: 2 },
  "bronte-(all)": { name: "Bronte (All)", style: 2, minHeightMm: 121, minWidthMm: 121 },
  "brooklyn": { name: "Brooklyn", style: 4, minHeightMm: 160, minWidthMm: 160, railStartMm: 60, routeDepthMm: 7 },
  "broome": { name: "Broome", style: 4, minHeightMm: 174, minWidthMm: 174, railStartMm: 62, routeDepthMm: 9 },
  "brunswick": { name: "Brunswick", style: 3, minHeightMm: 220, minWidthMm: 226, railStartMm: 60, routeWidthMm: 43, routeDepthMm: 8 },
  "brussels": { name: "Brussels", style: 1, minHeightMm: 35, minWidthMm: 35 },
  "cairo": { name: "Cairo", style: 2, minHeightMm: 248, minWidthMm: 258, railStartMm: 60, routeWidthMm: 44, routeDepthMm: 9 },
  "calcutta": { name: "Calcutta", style: 2, minHeightMm: 35, minWidthMm: 80, railStartMm: 70, routeDepthMm: 3 },
  "calcutta-10": { name: "Calcutta 10", style: 4, minHeightMm: 35, minWidthMm: 50, routeWidthMm: 6, routeDepthMm: 3 },
  "calcutta-25": { name: "Calcutta 25", style: 4, minHeightMm: 35, minWidthMm: 70, routeDepthMm: 3 },
  "calcutta-35": { name: "Calcutta 35", style: 3, minHeightMm: 35, minWidthMm: 80, routeDepthMm: 3 },
  "calcutta-100": { name: "Calcutta 100", style: 2, minHeightMm: 121, minWidthMm: 200, railStartMm: 100, routeWidthMm: 7, routeDepthMm: 3 },
  "cambridge": { name: "Cambridge", style: 3, minHeightMm: 256, minWidthMm: 266, railStartMm: 60, routeWidthMm: 48, routeDepthMm: 10 },
  "cammeray": { name: "Cammeray", style: 4, minHeightMm: 160, minWidthMm: 160, railStartMm: 60, routeDepthMm: 3 },
  "carlton": { name: "Carlton", style: 3, minHeightMm: 240, minWidthMm: 240, railStartMm: 60, routeWidthMm: 50, routeDepthMm: 9 },
  "casino": { name: "Casino", style: 4, minHeightMm: 163, minWidthMm: 163, railStartMm: 57, routeDepthMm: 5 },
  "chesterfield": { name: "Chesterfield", style: 3, minHeightMm: 200, minWidthMm: 200, railStartMm: 60, routeWidthMm: 29, routeDepthMm: 6 },
  "chfiely": { name: "Chfiely", style: 4, minHeightMm: 140, minWidthMm: 140, railStartMm: 6, routeWidthMm: 1, routeDepthMm: 2 },
  "chiswick-6": { name: "Chiswick 6", style: 5, minHeightMm: 140, minWidthMm: 140, railStartMm: 6, routeDepthMm: 3 },
  "chiswick-12": { name: "Chiswick 12", style: 5, minHeightMm: 140, minWidthMm: 140, railStartMm: 12, routeDepthMm: 7 },
  "christchurch": { name: "Christchurch", style: 3, minHeightMm: 232, minWidthMm: 232, railStartMm: 60, routeWidthMm: 46, routeDepthMm: 9 },
  "cielo": { name: "Cielo", style: 3, minHeightMm: 230, minWidthMm: 230, railStartMm: 60, routeWidthMm: 45, routeDepthMm: 8 },
  "classic-bevel-iconic-30": { name: "Classic Bevel Iconic 30", style: 4, minHeightMm: 395, minWidthMm: 110, railStartMm: 30 },
  "classic-square": { name: "Classic Square", style: 4, minHeightMm: 185, minWidthMm: 185, railStartMm: 60, routeDepthMm: 7 },
  "classic-square-iconic-30": { name: "Classic Square Iconic 30", style: 4, minHeightMm: 395, minWidthMm: 120, railStartMm: 30 },
  "cleveland": { name: "Cleveland", style: 2, minHeightMm: 206, minWidthMm: 216, railStartMm: 60, routeWidthMm: 23, routeDepthMm: 7 },
  "clovelly-(all)": { name: "Clovelly (All)", style: 2, minHeightMm: 121, minWidthMm: 121 },
  "colombo": { name: "Colombo", style: 3, minHeightMm: 238, minWidthMm: 238, railStartMm: 60, routeWidthMm: 48, routeDepthMm: 10 },
  "contour": { name: "Contour", style: 3, minHeightMm: 140, minWidthMm: 180, railStartMm: 63, routeWidthMm: 5, routeDepthMm: 4 },
  "cooma": { name: "Cooma", style: 2, minHeightMm: 204, minWidthMm: 214, railStartMm: 60, routeWidthMm: 22, routeDepthMm: 7 },
  "copenhagen": { name: "Copenhagen", style: 3, minHeightMm: 204, minWidthMm: 204, railStartMm: 60, routeWidthMm: 32, routeDepthMm: 8 },
  "corfu": { name: "Corfu", style: 3, minHeightMm: 235, minWidthMm: 235, railStartMm: 60, routeWidthMm: 47, routeDepthMm: 9 },
  "country-square": { name: "Country square", style: 4, minHeightMm: 185, minWidthMm: 185, railStartMm: 60, routeDepthMm: 7 },
  "cove-25": { name: "Cove 25", style: 6, minHeightMm: 150, minWidthMm: 150, routeDepthMm: 4 },
  "cove-50": { name: "Cove 50", style: 6, minHeightMm: 150, minWidthMm: 150, routeDepthMm: 4 },
  "croydon": { name: "Croydon", style: 2, minHeightMm: 150, minWidthMm: 190, railStartMm: 62, routeWidthMm: 4, routeDepthMm: 2 },
  "denmark": { name: "Denmark", style: 2, minHeightMm: 164, minWidthMm: 164, railStartMm: 60, routeWidthMm: 12, routeDepthMm: 3 },
  "denver": { name: "Denver", style: 2, minHeightMm: 216, minWidthMm: 226, railStartMm: 60, routeWidthMm: 28, routeDepthMm: 5 },
  "doric": { name: "Doric", style: 2, minHeightMm: 220, minWidthMm: 100 },
  "dorset": { name: "Dorset", style: 4, minHeightMm: 152, minWidthMm: 200, railStartMm: 18, routeDepthMm: 3 },
  "dorrigo": { name: "Dorrigo", style: 2, minHeightMm: 150, minWidthMm: 150, railStartMm: 60, routeWidthMm: 5, routeDepthMm: 2 },
  "dublin": { name: "Dublin", style: 2, minHeightMm: 214, minWidthMm: 214, railStartMm: 60, routeWidthMm: 36, routeDepthMm: 8 },
  "dural": { name: "Dural", style: 4, minHeightMm: 175, minWidthMm: 175, railStartMm: 65, routeDepthMm: 3 },
  "edinburgh": { name: "Edinburgh", style: 3, minHeightMm: 226, minWidthMm: 226, railStartMm: 60, routeWidthMm: 43, routeDepthMm: 10 },
  "farmhouse": { name: "Farmhouse", style: 4, minHeightMm: 185, minWidthMm: 255, railStartMm: 60, routeDepthMm: 7 },
  "farnborough": { name: "Farnborough", style: 4, minHeightMm: 185, minWidthMm: 255, railStartMm: 60, routeDepthMm: 7 },
  "federation": { name: "Federation", style: 4, minHeightMm: 185, minWidthMm: 185, railStartMm: 60, routeDepthMm: 7 },
  "galston": { name: "Galston", style: 4, minHeightMm: 160, minWidthMm: 160, railStartMm: 60, routeDepthMm: 7 },
  "geelong": { name: "Geelong", style: 2, minHeightMm: 238, minWidthMm: 238, railStartMm: 60, routeWidthMm: 49, routeDepthMm: 13 },
  "gerroa": { name: "Gerroa", style: 4, minHeightMm: 121, minWidthMm: 21, railStartMm: 40, routeDepthMm: 3 },
  "grafton": { name: "Grafton", style: 4, minHeightMm: 174, minWidthMm: 205, railStartMm: 60, routeDepthMm: 9 },
  "guilford": { name: "Guilford", style: 1, minHeightMm: 35, minWidthMm: 35 },
  "gunnedah": { name: "Gunnedah", style: 2, minHeightMm: 214, minWidthMm: 214, railStartMm: 60, routeWidthMm: 37, routeDepthMm: 7 },
  "hamilton": { name: "Hamilton", style: 1, minHeightMm: 80, minWidthMm: 80 },
  "hampton": { name: "Hampton", style: 4, minHeightMm: 140, minWidthMm: 140, railStartMm: 50, routeWidthMm: 1, routeDepthMm: 4 },
  "hampton-iconic-20": { name: "Hampton Iconic 20", style: 4, minHeightMm: 395, minWidthMm: 90, railStartMm: 20 },
  "hampton-iconic-30": { name: "Hampton Iconic 30", style: 4, minHeightMm: 395, minWidthMm: 100, railStartMm: 30 },
  "hanoi": { name: "Hanoi", style: 2, minHeightMm: 186, minWidthMm: 186, railStartMm: 60, routeWidthMm: 23, routeDepthMm: 7 },
  "houston": { name: "Houston", style: 3, minHeightMm: 228, minWidthMm: 228, railStartMm: 60, routeWidthMm: 47, routeDepthMm: 9 },
  "iconic-block": { name: "Iconic Block", style: 2, minHeightMm: 395, minWidthMm: 100 },
  "iconic-capped": { name: "Iconic Capped", style: 2, minHeightMm: 395, minWidthMm: 100 },
  "iconic-smooth": { name: "Iconic Smooth", style: 2, minHeightMm: 395, minWidthMm: 100 },
  "iconic-tall": { name: "Iconic Tall", style: 2, minHeightMm: 395, minWidthMm: 100 },
  "iconic-top": { name: "Iconic Top", style: 2, minHeightMm: 395, minWidthMm: 100 },
  "jersey": { name: "Jersey", style: 4, minHeightMm: 200, minWidthMm: 200, railStartMm: 80, routeDepthMm: 2 },
  "keimbah-(21mm)": { name: "Keimbah (21mm)", style: 5, minHeightMm: 200, minWidthMm: 200, railStartMm: 65, routeDepthMm: 12 },
  "kempsey": { name: "Kempsey", style: 2, minHeightMm: 174, minWidthMm: 174, railStartMm: 60, routeWidthMm: 18, routeDepthMm: 5 },
  "kiama": { name: "Kiama", style: 1, minHeightMm: 35, minWidthMm: 35 },
  "kingsford": { name: "Kingsford", style: 2, minHeightMm: 121, minWidthMm: 121, railStartMm: 60 },
  "kunda": { name: "Kunda", style: 1, minHeightMm: 35, minWidthMm: 35 },
  "leon": { name: "Leon", style: 3, minHeightMm: 164, minWidthMm: 164, railStartMm: 60, routeWidthMm: 12, routeDepthMm: 2 },
  "lima": { name: "Lima", style: 3, minHeightMm: 236, minWidthMm: 246, railStartMm: 60, routeWidthMm: 36, routeDepthMm: 8 },
  "lismore": { name: "Lismore", style: 4, minHeightMm: 177, minWidthMm: 177, railStartMm: 60, routeDepthMm: 9 },
  "lithgow": { name: "Lithgow", style: 2, minHeightMm: 224, minWidthMm: 234, railStartMm: 60, routeWidthMm: 32, routeDepthMm: 7 },
  "longreach": { name: "Longreach", style: 2, minHeightMm: 190, minWidthMm: 200, railStartMm: 60, routeWidthMm: 4, routeDepthMm: 2 },
  "macquarie": { name: "Macquarie", style: 4, minHeightMm: 185, minWidthMm: 210, railStartMm: 65, routeDepthMm: 2 },
  "madrid": { name: "Madrid", style: 2, minHeightMm: 121, minWidthMm: 134, railStartMm: 32, routeWidthMm: 4, routeDepthMm: 2 },
  "malabar": { name: "Malabar", style: 5, minHeightMm: 130, minWidthMm: 130 },
  "mallee": { name: "Mallee", style: 4, minHeightMm: 140, minWidthMm: 200, railStartMm: 40, routeWidthMm: 7, routeDepthMm: 3 },
  "manchester": { name: "Manchester", style: 1, minHeightMm: 35, minWidthMm: 35 },
  "manhattan": { name: "Manhattan", style: 4, minHeightMm: 200, minWidthMm: 200, railStartMm: 80, routeDepthMm: 2 },
  "manila": { name: "Manila", style: 2, minHeightMm: 184, minWidthMm: 194, railStartMm: 60, routeWidthMm: 12, routeDepthMm: 3 },
  "maroochydore": { name: "Maroochydore", style: 2, minHeightMm: 175, minWidthMm: 175, railStartMm: 60, routeWidthMm: 17, routeDepthMm: 2 },
  "mildura": { name: "Mildura", style: 2, minHeightMm: 198, minWidthMm: 198, railStartMm: 60, routeWidthMm: 2, routeDepthMm: 5 },
  "milperra": { name: "Milperra", style: 2, minHeightMm: 160, minWidthMm: 160, railStartMm: 34, routeWidthMm: 36, routeDepthMm: 5 },
  "molong": { name: "Molong", style: 2, minHeightMm: 156, minWidthMm: 156, railStartMm: 60, routeWidthMm: 8, routeDepthMm: 3 },
  "mona-vale": { name: "Mona Vale", style: 2, minHeightMm: 145, minWidthMm: 145, railStartMm: 60, routeWidthMm: 4, routeDepthMm: 2 },
  "monterey": { name: "Monterey", style: 2, minHeightMm: 121, minWidthMm: 121, railStartMm: 5, routeWidthMm: 4, routeDepthMm: 2 },
  "montreal": { name: "Montreal", style: 2, minHeightMm: 200, minWidthMm: 200, railStartMm: 60, routeWidthMm: 26, routeDepthMm: 2 },
  "moscow": { name: "Moscow", style: 2, minHeightMm: 214, minWidthMm: 214, railStartMm: 60, routeWidthMm: 36, routeDepthMm: 11 },
  "mudgee": { name: "Mudgee", style: 2, minHeightMm: 150, minWidthMm: 190, railStartMm: 64, routeWidthMm: 8, routeDepthMm: 3 },
  "munich": { name: "Munich", style: 1, minHeightMm: 80, minWidthMm: 80 },
  "napoli": { name: "Napoli", style: 1, minHeightMm: 35, minWidthMm: 35 },
  "newcastle": { name: "Newcastle", style: 2, minHeightMm: 170, minWidthMm: 170, railStartMm: 64, routeWidthMm: 8, routeDepthMm: 3 },
  "oberon": { name: "Oberon", style: 4, minHeightMm: 163, minWidthMm: 163, railStartMm: 60, routeDepthMm: 3 },
  "oceanic-3mm": { name: "Oceanic 3mm", style: 4, minHeightMm: 180, minWidthMm: 200, railStartMm: 60, routeDepthMm: 3 },
  "oceanic-7mm": { name: "Oceanic 7mm", style: 4, minHeightMm: 170, minWidthMm: 170, railStartMm: 60, routeDepthMm: 7 },
  "parkes": { name: "Parkes", style: 2, minHeightMm: 150, minWidthMm: 150, railStartMm: 62, routeWidthMm: 4, routeDepthMm: 2 },
  "paterson": { name: "Paterson", style: 1, minHeightMm: 50, minWidthMm: 50 },
  "patonga": { name: "Patonga", style: 4, minHeightMm: 185, minWidthMm: 225, railStartMm: 60, routeDepthMm: 9 },
  "peak": { name: "Peak", style: 6, minHeightMm: 150, minWidthMm: 150, routeWidthMm: 35, routeDepthMm: 7 },
  "pokolbin-(21mm)": { name: "Pokolbin (21mm)", style: 5, minHeightMm: 246, minWidthMm: 246, railStartMm: 65, routeWidthMm: 48, routeDepthMm: 12 },
  "portsea": { name: "Portsea", style: 2, minHeightMm: 121, minWidthMm: 150 },
  "prague": { name: "Prague", style: 3, minHeightMm: 184, minWidthMm: 184, railStartMm: 60, routeWidthMm: 22, routeDepthMm: 7 },
  "preston": { name: "Preston", style: 2, minHeightMm: 170, minWidthMm: 170, railStartMm: 60, routeWidthMm: 15, routeDepthMm: 6 },
  "rio": { name: "Rio", style: 3, minHeightMm: 222, minWidthMm: 222, railStartMm: 60, routeWidthMm: 41, routeDepthMm: 10 },
  "rockhampton": { name: "Rockhampton", style: 3, minHeightMm: 214, minWidthMm: 214, railStartMm: 60, routeWidthMm: 35, routeDepthMm: 8 },
  "rothbury-(21mm)": { name: "Rothbury (21mm)", style: 5, minHeightMm: 246, minWidthMm: 246, railStartMm: 65, routeDepthMm: 12 },
  "sanda": { name: "Sanda", style: 1, minHeightMm: 35, minWidthMm: 35 },
  "seattle": { name: "Seattle", style: 3, minHeightMm: 250, minWidthMm: 260, railStartMm: 60, routeWidthMm: 46, routeDepthMm: 7 },
  "seoul": { name: "Seoul", style: 3, minHeightMm: 242, minWidthMm: 252, railStartMm: 60, routeWidthMm: 41, routeDepthMm: 10 },
  "sharknose": { name: "Sharknose", style: 1, minHeightMm: 50, minWidthMm: 50 },
  "small-step-bevel": { name: "Small Step Bevel", style: 1, minHeightMm: 50, minWidthMm: 50 },
  "softline": { name: "Softline", style: 1, minHeightMm: 80, minWidthMm: 80 },
  "somersby": { name: "Somersby", style: 3, minHeightMm: 153, minWidthMm: 153, railStartMm: 57, routeWidthMm: 18, routeDepthMm: 3 },
  "somerset": { name: "Somerset", style: 4, minHeightMm: 140, minWidthMm: 200, railStartMm: 6, routeDepthMm: 3 },
  "stratford": { name: "Stratford", style: 4, minHeightMm: 175, minWidthMm: 175, railStartMm: 60, routeDepthMm: 8 },
  "sussex": { name: "Sussex", style: 4, minHeightMm: 121, minWidthMm: 121, railStartMm: 15, routeDepthMm: 3 },
  "swan": { name: "Swan", style: 2, minHeightMm: 220, minWidthMm: 220, railStartMm: 60, routeWidthMm: 40, routeDepthMm: 12 },
  "tamworth": { name: "Tamworth", style: 4, minHeightMm: 177, minWidthMm: 205, railStartMm: 60, routeDepthMm: 9 },
  "taree": { name: "Taree", style: 2, minHeightMm: 240, minWidthMm: 255, railStartMm: 60, routeWidthMm: 40, routeDepthMm: 9 },
  "teralba": { name: "Teralba", style: 2, minHeightMm: 150, minWidthMm: 190, railStartMm: 60, routeWidthMm: 4, routeDepthMm: 2 },
  "tokyo": { name: "Tokyo", style: 3, minHeightMm: 226, minWidthMm: 236, railStartMm: 60, routeWidthMm: 32, routeDepthMm: 8 },
  "torino": { name: "Torino", style: 2, minHeightMm: 121, minWidthMm: 121, railStartMm: 20, routeWidthMm: 11, routeDepthMm: 2 },
  "toronto": { name: "Toronto", style: 2, minHeightMm: 180, minWidthMm: 180, railStartMm: 40, routeWidthMm: 11, routeDepthMm: 2 },
  "townsville": { name: "Townsville", style: 3, minHeightMm: 224, minWidthMm: 275, railStartMm: 60, routeWidthMm: 35, routeDepthMm: 8 },
  "tuscan": { name: "Tuscan", style: 2, minHeightMm: 220, minWidthMm: 100 },
  "valencia": { name: "Valencia", style: 3, minHeightMm: 222, minWidthMm: 222, railStartMm: 60, routeWidthMm: 40, routeDepthMm: 9 },
  "valla": { name: "Valla", style: 4, minHeightMm: 121, minWidthMm: 121, railStartMm: 40, routeDepthMm: 3 },
  "vienna": { name: "Vienna", style: 1, minHeightMm: 35, minWidthMm: 35 },
  "washington": { name: "Washington", style: 3, minHeightMm: 248, minWidthMm: 258, railStartMm: 60, routeWidthMm: 42, routeDepthMm: 10 },
  "waverley": { name: "Waverley", style: 2, minHeightMm: 121, minWidthMm: 121 },
  "wellington": { name: "Wellington", style: 2, minHeightMm: 230, minWidthMm: 230, railStartMm: 60, routeWidthMm: 44, routeDepthMm: 9 },
  "wells": { name: "Wells", style: 3, minHeightMm: 164, minWidthMm: 206, railStartMm: 60, routeWidthMm: 12, routeDepthMm: 3 },
  "woongarrah": { name: "Woongarrah", style: 4, minHeightMm: 185, minWidthMm: 185, railStartMm: 60, routeDepthMm: 9 },
  "yass": { name: "Yass", style: 2, minHeightMm: 200, minWidthMm: 200, railStartMm: 60, routeWidthMm: 30, routeDepthMm: 8 },
};

const key = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, "-");

/** Everything the manufacturer publishes about one profile, or null. */
export function profileSpec(name) {
  return PROFILE_SPECS[key(name)] || null;
}

/**
 * Is anything routed into the FACE of this door?
 *
 * Style 1 is the minimal range: Brussels, Guilford, Vienna and the rest. They
 * are a board with a shape on the edge and nothing on the face. Drawing a
 * border on one is drawing a different door, and it is the mistake this answers.
 */
export function hasRoutedFace(name) {
  const spec = profileSpec(name);
  if (!spec) return true;
  return spec.style !== 1;
}

/** A reeded face rather than a border: Style 6, and the Calcutta run. */
export function isFlutedStyle(name) {
  const spec = profileSpec(name);
  return spec ? spec.style === 6 : false;
}

/**
 * The smallest we can press this profile.
 *
 * Height before width. Null where the manufacturer publishes none, which is
 * better than a number we invented: a made up minimum refuses an order we could
 * actually have made.
 */
export function profileMinimumSize(name) {
  const spec = profileSpec(name);
  if (!spec || !spec.minHeightMm || !spec.minWidthMm) return null;
  return { minHeightMm: spec.minHeightMm, minWidthMm: spec.minWidthMm };
}

/**
 * Where the routed border sits, from the manufacturer rather than from a
 * photograph: it starts railStartMm in from the edge and is routeWidthMm wide.
 *
 * This is the pair of lines that decide whether a door reads as the right door.
 * Everything our own measurements add sits between them.
 */
export function profileBorder(name) {
  const spec = profileSpec(name);
  if (!spec || spec.style === 1 || !spec.railStartMm) return null;
  const outerMm = spec.railStartMm;
  const innerMm = spec.routeWidthMm ? spec.railStartMm + spec.routeWidthMm : null;
  return { outerMm, innerMm };
}

/** Every profile the manufacturer publishes, for tests and for tooling. */
export function allProfileSpecs() {
  return Object.values(PROFILE_SPECS);
}
