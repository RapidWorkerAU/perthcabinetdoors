"use client";

// One part of a cabinet, configured completely.
//
// The sidebar already chose the part, so this window's left menu is that part's
// own config areas — how far it runs, its board, thickness, profile, edge and
// colour — not another copy of the parts list. Pick an area on the left, set it
// on the right.
//
// Areas unlock in order, so a colour cannot be chosen before the board it has
// to exist in, and every list comes from the live colour library rather than a
// hard-coded catalogue. That is what makes an impossible combination
// unreachable rather than something caught later on save.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { materialLabelForType } from "../../../lib/pcd-colour-library";
import { panelProfile, panelReach, withPanelOption } from "../../../lib/pcd-panel-options";
import { profileImageSrc, edgeImageSrc, edgeSectionPath, PROFILE_IMAGE_ASPECT, EDGE_IMAGE_ASPECT } from "../../../lib/pcd-profile-images";
import { profilesForSupplier } from "../../../lib/pcd-supplier-selection";
import { asSelectionRows } from "../../../lib/use-profile-library";
import {
  areasForPart,
  supplierFromBoard,
  boardsInStock,
  canProfile,
  brandsInStock,
  coloursInStockForBrand,
  edgesFor,
  profileNamesInStock,
  profileNeeds21,
  profileTypesInStock,
  partAllowsBoard,
  boardsNotOffered,
  partSpecsInUse,
  publicPartDef,
  readPartBoard,
  thicknessesInStock,
  BOARD_NOTES,
} from "../../../lib/pcd-public-config";

const C = { edge: "#e4dfd4", ink: "#2a2925", soft: "#7a766c", green: "#1f6f4a", open: "#f7f5ef" };

// The library is the same list the colour chooser loads, so it is cached once
// per page rather than fetched again every time a part is opened.
let ROWS_CACHE = null;
async function loadRows() {
  if (ROWS_CACHE) return ROWS_CACHE;
  try {
    const res = await fetch("/api/colour-library?items=1");
    const data = await res.json();
    ROWS_CACHE = Array.isArray(data?.items) ? data.items : [];
  } catch {
    ROWS_CACHE = [];
  }
  return ROWS_CACHE;
}

// The profile catalogue, for the one question this screen asks of it: does
// this brand make edge profiles at all? Laminex does not, and showing them
// Polytec's shapes would offer a door nobody can make.
//
// Read rather than written down here, so adding a brand is adding rows.
let PROFILE_ROWS_CACHE = null;
async function loadProfileRows() {
  if (PROFILE_ROWS_CACHE) return PROFILE_ROWS_CACHE;
  try {
    const res = await fetch("/api/profile-library");
    const data = await res.json();
    // null, not []: an empty list would read as "no brand makes anything" and
    // quietly empty the profile and edge steps for everybody.
    if (!res.ok || !data?.ok) return null;
    PROFILE_ROWS_CACHE = data.profiles || [];
  } catch {
    return null;
  }
  return PROFILE_ROWS_CACHE;
}

const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const sameBrand = sameText;

const btn = { padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.edge}`, backgroundColor: "#fff", cursor: "pointer", font: "inherit", fontSize: 13.5, color: C.ink };

export default function PartConfigWindow({ item, items = [], partKey, onClose, onUpdate, renderBuild }) {
  const [rows, setRows] = useState(ROWS_CACHE || []);
  // null until we know. Not [], which would mean "nobody makes anything".
  const [profileRows, setProfileRows] = useState(PROFILE_ROWS_CACHE);
  const [loading, setLoading] = useState(!ROWS_CACHE);
  const [openArea, setOpenArea] = useState(null);
  const [search, setSearch] = useState("");
  const [finish, setFinish] = useState("all");
  // "all" is the whole library; "used" is only what this design already has.
  // The match view, which the button below toggles — the same shape as the
  // admin chooser's "Select from existing colours".
  // Which profile range is being browsed. Not part of the saved spec — it only
  // decides which list of shapes is on screen.
  const [range, setRange] = useState(null);

  useEffect(() => {
    let live = true;
    loadRows().then((r) => { if (live) { setRows(r); setLoading(false); } });
    loadProfileRows().then((found) => { if (live && found) setProfileRows(found); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { setOpenArea(null); setSearch(""); setRange(null); setFinish("all"); }, [partKey]);

  const def = publicPartDef(partKey);
  const board = readPartBoard(item, partKey);
  const materialLabel = board.material ? materialLabelForType(board.material) : "";
  const thicknessMm = Number(board.thickness_mm) || null;
  // Whose range this part comes from. Everything below it narrows by it.
  // Read through supplierFromBoard so a shelf or a board saved before the brand
  // step reached it shows the brand its colour already implies, rather than
  // asking again for something we can work out.
  const supplier = supplierFromBoard(rows, board);
  // Until the catalogue has loaded, both steps stay as they were. Hiding one on
  // a failed read would look like the step had vanished, with nothing to say why.
  const brandMakesEdges =
    !supplier || !profileRows
      ? true
      : profileRows.some((row) => row.kind === "edge" && sameBrand(row.supplier, supplier));

  // Which steps are locked, and what by, comes from areasForPart with the order
  // it belongs to. All that is left here is the sentence to show for it.
  const areas = useMemo(
    () =>
      areasForPart(item, partKey, rows).map((a) => ({
        ...a,
        why: a.blockedBy ? `Choose ${a.blockedBy.toLowerCase()} first` : "",
      })),
    [item, partKey, rows]
  );

  // Every part in the design that is already finished, this one excluded — it
  // is not a candidate for copying onto itself.
  const allOthers = useMemo(
    () => partSpecsInUse(items && items.length ? items : [item], rows, { excludeItemId: item?.id, excludePartKey: partKey }),
    [items, item, rows, partKey]
  );
  // Copying is the one route that could otherwise put a part on a board the
  // board list refuses, so it applies the same rule rather than trusting it.
  const others = useMemo(() => allOthers.filter((u) => partAllowsBoard(partKey, u.materialLabel)), [allOthers, partKey]);
  const hiddenCopies = allOthers.length - others.length;

  if (typeof document === "undefined" || !def) return null;

  const current = areas.find((a) => a.id === openArea && !a.locked)
    || areas.find((a) => !a.locked && !a.answered)
    || areas[0];

  // WHAT COMES NEXT, read off the order in areasForPart rather than restated
  // here. Each area names the one it waits for, so the step that waits on this
  // one is the step to open. Restating the order is what sent a shelf from the
  // board straight to the thickness, past the brand step it now has.
  const nextAfter = (id, fallback) => areas.find((a) => a.needs === id)?.id || fallback;

  // A finish, a search and a range chip belong to the list they were set on.
  // Carried across a change of board or brand they quietly hide most of the new
  // one, and a Polytec range chip over a Laminex list matches nothing at all,
  // because the two brands do not share a single range name.
  const clearListFilters = () => { setFinish("all"); setSearch(""); setRange(null); };

  // ---- writing ----
  const setBoard = (patch) => onUpdate(writeBoard(item, partKey, patch));
  const setPanelOpt = (patch) => onUpdate({ panel_options: withPanelOption(item, def.panelKey, patch) });

  function chooseBoard(label) {
    // Anything the new board cannot make goes with it. Keeping a profile that
    // cannot be routed into this board is the one thing that produces a line we
    // cannot build.
    // No thickness is chosen here any more. Which ones exist depends on the
    // brand, and that has not been asked yet, so picking one now would be
    // picking from the wrong list. The brand step is next and the thickness
    // follows it.
    const next = { material: label, thickness_mm: null, colour: "", finish: "", supplier: "" };
    const patch = writeBoard(item, partKey, next, { clearProfile: true, clearEdge: true });
    onUpdate(patch);
    if (def.panelKey) setPanelOpt({ profile_type: "", profile: "" });
    clearListFilters();
    setOpenArea(nextAfter("board", "thickness"));
  }

  // One click finishes the part: board, thickness, profile, edge and colour all
  // come across together. Anything less would leave the profile and the edge
  // still to set, which is most of the work.
  function copyFrom(u) {
    onUpdate(writeBoard(item, partKey, {
      material: u.material,
      finish: u.finish,
      colour: u.colour,
      thickness_mm: u.thicknessMm || null,
      supplier: u.supplier || "",
      colour_library_id: u.colour_library_id || null,
      edge_mould: u.edge_mould || "",
      // writeBoard drops these for a panel, which keeps panel_options the one
      // place a panel's profile lives.
      profile_type: u.profile_type || "",
      profile: u.profile || "",
    }));
    // A part that can't take the copied profile doesn't get one: a kickboard
    // has no shaped face, and a flat board cannot be routed.
    const keepsProfile = def.profileable && BOARDS_WITH_PROFILES.has(u.materialLabel);
    if (def.panelKey) {
      setPanelOpt({
        profile_type: keepsProfile ? (u.profile_type || "") : "",
        profile: keepsProfile ? (u.profile || "") : "",
      });
    }
    setOpenArea("colour");
  }

  // WHOSE BOARD IS THIS. Asked before the profile, the edge and the colour,
  // because it decides all three: the two ranges cannot be mixed, and Laminex
  // makes no edge profiles at all.
  //
  // Changing it clears them rather than leaving one brand's shape sitting on
  // another brand's board. That is the one combination nobody can build, and
  // it is invisible afterwards: both halves are real, they just do not go
  // together.
  function chooseBrand(name) {
    if (sameBrand(supplier, name)) {
      // Already this brand. It may only be IMPLIED by the colour on an older
      // part, so record it rather than leaving it as something we work out
      // every time, and keep everything chosen under it: nothing has changed.
      if (!sameBrand(board.supplier, name)) onUpdate(writeBoard(item, partKey, { supplier: name }));
      setOpenArea(nextAfter("brand", "thickness"));
      return;
    }
    // The thickness goes too if the new brand does not stock it. Left behind,
    // it would sit on the part with an empty colour list under it and nothing
    // on screen to say why.
    const stocked = thicknessesInStock(rows, materialLabel, name);
    const keepsThickness = thicknessMm && stocked.includes(thicknessMm);
    const patch = writeBoard(item, partKey, {
      supplier: name,
      colour: "",
      finish: "",
      colour_library_id: null,
      ...(keepsThickness ? {} : { thickness_mm: null }),
    }, { clearProfile: true, clearEdge: true });
    onUpdate(patch);
    // A panel keeps its profile in panel_options, which writeBoard does not
    // reach into, so it is cleared here or it survives the brand change.
    if (def.panelKey) setPanelOpt({ profile_type: "", profile: "" });
    clearListFilters();
    setOpenArea(nextAfter("brand", "thickness"));
  }

  function chooseColour(r) {
    setBoard({
      material: r.material, finish: r.finish, colour: r.colour,
      thickness_mm: Number(r.thicknessMm) || thicknessMm || null,
      supplier: r.supplier || supplier, colour_library_id: r.id || null,
    });
  }

  // WHICH TILE IS THE CHOSEN ONE.
  //
  // The library row, wherever both sides have one. A colour NAME is not unique:
  // Laminex sells Blackbutt in Absolute Grain and again in Natural, two real
  // boards at two prices, and matching on the name alone lit both of them up as
  // though the part were somehow in each.
  //
  // The name, the finish and the thickness together are the fallback, for a
  // colour chosen before the library id was recorded against it.
  const isChosenColour = (r) => {
    const savedId = String(board.colour_library_id || "").trim();
    if (savedId && r.id) return savedId === String(r.id);
    return (
      sameText(board.colour, r.colour) &&
      sameText(board.finish, r.finish) &&
      (!thicknessMm || !r.thicknessMm || Number(r.thicknessMm) === thicknessMm)
    );
  };

  const profile = def.panelKey ? panelProfile(item, def.panelKey) : { profile_type: board.profile_type || "", profile: board.profile || "" };
  function chooseProfile(type, name) {
    const needs21 = name && profileNeeds21(type, name);
    if (def.panelKey) setPanelOpt({ profile_type: type || "", profile: name || "" });
    else setBoard({ profile_type: type || "", profile: name || "" });
    if (needs21) setBoard({ thickness_mm: 21, colour: "" });
    setOpenArea(nextAfter("profile", "edge"));
  }

  const reach = def.panelKey ? panelReach(item, def.panelKey) : { toFloor: false, toCeiling: false };

  // ---- the areas ----
  function areaBody(a) {
    if (a.build) {
      const body = renderBuild ? renderBuild(a.id) : null;
      return body || <Minor>Nothing to set here.</Minor>;
    }
    if (a.id === "copy") {
      if (!others.length) {
        return (
          <Minor style={{ marginTop: 0 }}>
            {hiddenCopies
              ? `${boardsNotOffered(partKey)} The parts you have finished so far are all on a board this one cannot be made from, so there is nothing to copy here.`
              : "Nothing else in your design is finished yet. Once one part has a board and a colour, you can copy it onto the next one in a single click instead of setting all of it again."}
          </Minor>
        );
      }
      return (
        <>
          <Minor style={{ marginTop: 0, marginBottom: 12 }}>
            Every part you have already finished. Click one to make the {String(def.label).toLowerCase()} exactly the
            same — board, thickness, profile, edge and colour all at once.
          </Minor>
          <div style={tileGrid()}>
            {others.map((u, i) => (
              <button key={i} type="button" title={`Used on ${u.usedOn.join(", ")}`}
                onClick={() => copyFrom(u)}
                style={{ ...tileBtn, ...(sameSpec(board, profile, u) ? tileOn : null) }}>
                <span style={aspectBox(1)}>
                  <span style={{ position: "absolute", inset: 0,
                    backgroundColor: "#d9d4c8",
                    ...(u.src ? { backgroundImage: `url(${u.src})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" } : null) }} />
                </span>
                {/* The whole spec on the tile, so it is obvious what is about to
                    be copied rather than only which colour it is. */}
                <span style={{ display: "block", padding: "7px 8px 9px" }}>
                  <b style={{ display: "block", fontSize: 11.5, fontWeight: 600, lineHeight: 1.25, ...oneLine }}>{u.colour}</b>
                  <span style={specLine}>{[u.materialLabel, u.thicknessMm ? `${u.thicknessMm}mm` : ""].filter(Boolean).join(" ")}</span>
                  <span style={specLine}>{[u.finish, u.supplier].filter(Boolean).join(" · ")}</span>
                  <span style={specLine}>{u.profile ? `${u.profile_type} · ${u.profile}` : "No profile"}</span>
                  <span style={specLine}>{u.edge_mould || "No edge"}</span>
                </span>
              </button>
            ))}
          </div>
          {hiddenCopies > 0 && (
            <Minor>
              {hiddenCopies} other finished part{hiddenCopies === 1 ? " is" : "s are"} not shown here.{" "}
              {boardsNotOffered(partKey)}
            </Minor>
          )}
        </>
      );
    }
    if (a.id === "reach") {
      return (
        <>
          <Toggle label="Run down to the floor" checked={reach.toFloor} onChange={(v) => setPanelOpt({ to_floor: v })} />
          <Toggle label="Run up to the ceiling" checked={reach.toCeiling} onChange={(v) => setPanelOpt({ to_ceiling: v })} />
          <Minor>
            Asked of <strong>this panel only</strong>. An exposed end can run to the floor while the end beside a
            dishwasher stops at the cabinet.
          </Minor>
        </>
      );
    }
    if (a.id === "benchtop_note") {
      return (
        <div style={noteBox}>
          <strong>We don&apos;t supply benchtops.</strong> This one is here so your kitchen looks right while you plan
          it. It is never quoted or made, and it will not appear on the list you send us.
        </div>
      );
    }
    if (a.id === "board") {
      // Stock AND suitability: a board we do not make this part from is not
      // offered, with a line saying why rather than an unexplained absence.
      const boards = boardsInStock(rows).filter((b) => partAllowsBoard(partKey, b));
      const why = boardsNotOffered(partKey);
      if (loading) return <Minor>Loading the colour library…</Minor>;
      return (
        <div style={{ display: "grid", gap: 8 }}>
          {boards.map((b) => (
            <button key={b} type="button" onClick={() => chooseBoard(b)} style={{ ...cardBtn, ...(materialLabel === b ? cardOn : null) }}>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{b}</b>
                <span style={{ display: "block", fontSize: 11.5, color: C.soft, lineHeight: 1.45, marginTop: 2 }}>
                  {BOARD_NOTES[b] || ""}
                </span>
                <span style={{ ...tag, ...(b === "Thermolaminate" && def.profileable ? tagOn : null) }}>
                  {b === "Thermolaminate" ? (def.profileable ? "Profiles available" : "Profiles not used here") : "Flat faces only"}
                </span>
              </span>
            </button>
          ))}
          {why && <Minor>{why}</Minor>}
        </div>
      );
    }
    if (a.id === "thickness") {
      const opts = thicknessesInStock(rows, materialLabel, supplier);
      const forced = profile.profile && profileNeeds21(profile.profile_type, profile.profile);
      return (
        <>
          <Seg
            value={String(thicknessMm || "")}
            options={opts.map((t) => ({ v: String(t), label: `${t}mm`, disabled: forced && t !== 21 }))}
            onChange={(v) => { setBoard({ thickness_mm: Number(v), colour: "" }); setOpenArea(nextAfter("thickness", "edge")); }}
          />
          <Minor>
            {forced
              ? `${profile.profile} is only made in 21mm, so this is set for you.`
              : "Only the thicknesses we stock this board in are offered."}
          </Minor>
        </>
      );
    }
    if (a.id === "brand") {
      const brands = brandsInStock(rows, materialLabel);
      if (!brands.length) {
        return <Minor>Choose a board first, and the brands we stock it in will show here.</Minor>;
      }
      return (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {brands.map((name) => {
              const on = supplier.toLowerCase() === name.toLowerCase();
              // The brand's whole range, NOT narrowed by the thickness. The
              // thickness is chosen after this and follows from it, so counting
              // against one already set would show 0 beside a brand with plenty,
              // and brandsInStock deliberately ignores it for the same reason.
              const count = coloursInStockForBrand(rows, materialLabel, null, name).length;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => chooseBrand(name)}
                  style={{
                    ...btn,
                    borderColor: on ? C.green : C.edge,
                    boxShadow: on ? `inset 0 0 0 1px ${C.green}` : "none",
                    color: on ? C.green : C.ink,
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "block", fontWeight: 600 }}>{name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C.soft }}>
                    {count} colour{count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
          <Minor>
            A door is one brand&rsquo;s colour pressed onto that brand&rsquo;s shape, so the ranges cannot be mixed.
            Choosing here decides which profiles, edges and colours you see below.
            {supplier ? " Changing it clears them, because the new brand does not make the same ones." : ""}
          </Minor>
        </>
      );
    }
    if (a.id === "profile") {
      if (!canProfile(item, partKey, materialLabel)) {
        return <Minor>{materialLabel} is a flat board. A profile can only be routed into Thermolaminate, so change the board if you want a shaped face.</Minor>;
      }
      if (profile.profile) {
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.edge}`, borderRadius: 10, padding: "10px 12px" }}>
            <span style={{ minWidth: 0 }}>
              <b style={{ display: "block", fontSize: 13 }}>{profile.profile}</b>
              <span style={{ fontSize: 11.5, color: C.soft }}>{profile.profile_type} range</span>
            </span>
            <button type="button" style={{ ...btn, marginLeft: "auto", padding: "5px 10px", fontSize: 12 }}
              onClick={() => { chooseProfile("", ""); setRange(null); setOpenArea("profile"); }}>Change</button>
          </div>
        );
      }
      // THE SHAPES THIS BRAND MAKES, READ OFF THE PROFILE LIBRARY.
      //
      // This used to be Polytec's hardcoded list with the brand's own names
      // filtered out of it, and a filter can only ever subtract. Of Laminex's 27
      // shapes exactly one shares a name with a Polytec one, so a Laminex board
      // would have offered that single shape, under a Polytec range chip, with a
      // Polytec photo. The library carries the brand, the range, the photo and
      // the board it can be routed into on every row, so it is read from there.
      //
      // The hardcoded list stays as the fallback for a library we could not
      // read. That is the one case where narrowing would be guessing, and it is
      // the same reason profileRows starts as null rather than [].
      //
      // Every shape across every range, so someone who knows the name can find
      // it without guessing which range it belongs to. The chips narrow it.
      const all = profileRows
        ? profilesForSupplier(asSelectionRows(profileRows), {
            supplier,
            thickness: thicknessMm ? `${thicknessMm}mm` : "",
          }).map((row) => ({
            type: row.category,
            name: row.name,
            src: row.image_url || profileImageSrc(row.category, row.name),
            needs21: row.available_18mm === false && row.available_21mm !== false,
          }))
        : profileTypesInStock(rows, materialLabel, thicknessMm).flatMap((t) =>
            profileNamesInStock(rows, t, materialLabel, thicknessMm).map((n) => ({
              type: t,
              name: n,
              src: profileImageSrc(t, n),
              needs21: profileNeeds21(t, n),
            }))
          );
      // The range chips are whatever ranges this brand's shapes fall into, in
      // the order the rows arrive: Polytec's five families, or Laminex's series.
      const types = [];
      all.forEach((entry) => {
        if (entry.type && !types.includes(entry.type)) types.push(entry.type);
      });
      // A brand with no shapes at all is a different answer from a search that
      // found nothing, and the range chips below would be an empty row of
      // buttons rather than a choice.
      if (!all.length) {
        return (
          <Minor>
            {supplier
              ? `${supplier} does not make a shaped face on this board, so there is nothing to choose here. Change the brand above if you want one.`
              : "Choose a brand first."}
          </Minor>
        );
      }
      const q = search.trim().toLowerCase();
      const shown = all
        .filter((e) => (!range || e.type === range) && (!q || e.name.toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name));
      return (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            <Chip on={!range} onClick={() => { setRange(null); setSearch(""); }}>All shapes</Chip>
            {types.map((t) => (
              <Chip key={t} on={range === t} onClick={() => { setRange(t); setSearch(""); }} title={PROFILE_BLURB[t]}>{t}</Chip>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shapes by name" style={input} />
          <div style={{ ...tileGrid(), marginTop: 10 }}>
            {shown.map((e) => (
              <ImageTile
                key={`${e.type}-${e.name}`}
                src={e.src}
                alt={`${e.name} door profile`}
                title={e.name}
                subtitle={e.type}
                badge={e.needs21 ? "21mm" : null}
                aspect={PROFILE_IMAGE_ASPECT}
                onClick={() => chooseProfile(e.type, e.name)}
              />
            ))}
            {!shown.length && <Minor>No shape matches that search.</Minor>}
          </div>
          <Minor>
            A <strong>21mm</strong> tag means that shape is only made in 21mm board, which sets the thickness and
            shortens the colour list. Shapes with no photo yet are drawn instead.
          </Minor>
        </>
      );
    }
    if (a.id === "edge") {
      const edges = brandMakesEdges ? edgesFor(materialLabel) : [];
      if (!edges.length) {
        return (
          <Minor>
            {materialLabel === "Compact Laminate"
              ? "Compact laminate is solid all the way through, so the board is its own edge. Nothing to choose."
              : !supplier
                ? "Choose a brand first."
                : !brandMakesEdges
                  ? `${supplier} does not make edge profiles, so there is nothing to choose here. Your ${String(materialLabel).toLowerCase()} is edged in matching tape.`
                  : "Choose a board first."}
          </Minor>
        );
      }
      const chosen = board.edge_mould || "";
      return (
        <>
          {/* Wide columns: an edge shot is a long, shallow strip, so a tile
              sized for the portrait profile photos would shrink it to a sliver. */}
          <div style={tileGrid()}>
            {edges.slice().sort().map((e) => (
              <ImageTile
                key={e}
                src={edgeImageSrc(e)}
                alt={`${e} edge`}
                title={e}
                on={chosen === e}
                aspect={EDGE_IMAGE_ASPECT}
                fallback={<EdgeSection name={e} />}
                onClick={() => { setBoard({ edge_mould: e }); setOpenArea("colour"); }}
              />
            ))}
          </div>
          <Minor>
            {materialLabel === "Thermolaminate"
              ? <>If you are not sure, <strong>EM1 6mm Pencil Round</strong> is what most kitchens get.</>
              : <>Decorative board is edged with 1mm tape. <strong>1mm Square Edge</strong> is the standard.</>}
          </Minor>
        </>
      );
    }
    if (a.id === "colour") {
      const all = coloursInStockForBrand(rows, materialLabel, thicknessMm, supplier);
      const q = search.trim().toLowerCase();
      const distinct = (list, key) => [...new Set(list.map((r) => r[key]).filter(Boolean))].sort((x, y) => String(x).localeCompare(String(y)));
      // `all` is already this brand's colours only, from the Brand step above,
      // so finishes follow from it without a second brand control here.
      const finishes = distinct(all, "finish");
      const shown = all.filter((r) =>
        (finish === "all" || r.finish === finish) &&
        (!q || String(r.colour).toLowerCase().includes(q))
      );
      return (
        <>
          <div style={{ ...noteBox, background: C.open, border: `1px solid ${C.edge}`, borderLeft: `3px solid ${C.green}`, color: C.ink }}>
            Showing <strong>{materialLabel} {thicknessMm}mm</strong> only, the board you chose for this part.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <label style={filterLab}>
              Finish
              <select value={finish} style={select} onChange={(e) => setFinish(e.target.value)}>
                <option value="all">All finishes</option>
                {finishes.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label style={{ ...filterLab, flex: "2 1 180px" }}>
              Search
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Oak, White" style={input} />
            </label>
          </div>
          <div style={{ fontSize: 11, color: C.soft, marginTop: 8 }}>
            {shown.length} colour{shown.length === 1 ? "" : "s"}
            {(finish !== "all" || q) && (
              <button type="button" onClick={() => { setFinish("all"); setSearch(""); }}
                style={{ marginLeft: 8, font: "inherit", fontSize: 11, color: C.green, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
                Clear filters
              </button>
            )}
          </div>
          <div style={{ ...tileGrid(), marginTop: 10 }}>
            {shown.map((r) => (
              <button key={r.id || `${r.colour}-${r.thicknessMm}`} type="button" onClick={() => chooseColour(r)}
                title={`${r.colour} · ${r.finish}`}
                style={{ ...tileBtn, ...(isChosenColour(r) ? tileOn : null) }}>
                <span style={aspectBox(1)}>
                  <span style={{ position: "absolute", inset: 0,
                    background: r.src ? `center/cover no-repeat url(${r.src})` : "#d9d4c8" }} />
                </span>
                <span style={{ display: "block", padding: "6px 8px 8px" }}>
                  <b style={{ display: "block", fontSize: 11.5, fontWeight: 600, ...oneLine }}>{r.colour}</b>
                  <span style={{ display: "block", fontSize: 10, color: C.soft, ...oneLine }}>{r.finish} · {r.supplier}</span>
                </span>
              </button>
            ))}
            {!shown.length && <Minor>No colours match. Try another finish, or clear the filters.</Minor>}
          </div>
          <Minor>Prices are never shown here — we work them out when we quote.</Minor>
        </>
      );
    }
    return null;
  }

  function areaValue(a) {
    if (a.id === "reach") return reach.toFloor && reach.toCeiling ? "Floor and ceiling" : reach.toFloor ? "To the floor" : reach.toCeiling ? "To the ceiling" : "Cabinet height";
    if (a.id === "benchtop_note") return "Drawing only";
    // Not a setting, an action. Without a line of its own it read "Not set",
    // as though something had been missed.
    if (a.id === "copy") return others.length ? `${others.length} finished part${others.length === 1 ? "" : "s"}` : "Nothing to copy yet";
    if (a.id === "board") return materialLabel || "";
    // The brand had no line here at all, so it read "Not set" however clearly
    // it had been chosen.
    if (a.id === "brand") return supplier || "";
    if (a.id === "thickness") return thicknessMm ? `${thicknessMm}mm` : "";
    if (a.id === "profile") return profile.profile ? `${profile.profile_type} · ${profile.profile}` : (canProfile(item, partKey, materialLabel) ? "" : "Not on this board");
    if (a.id === "edge") return edgesFor(materialLabel).length ? (board.edge_mould || "") : (materialLabel ? "Not applicable" : "");
    // With the finish, because the name on its own does not say which board it
    // is: Blackbutt Absolute Grain and Blackbutt Natural are two of them.
    if (a.id === "colour") return [board.colour, board.finish].filter(Boolean).join(" · ");
    return "";
  }

  const groups = [];
  areas.forEach((a) => { if (!groups.includes(a.group)) groups.push(a.group); });
  const left = areas.filter((a) => !a.answered && !a.locked && !a.build && a.id !== "reach" && a.id !== "benchtop_note").length;

  return createPortal(
    <div style={scrim} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={win} role="dialog" aria-modal="true">
        <div style={winHead}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{def.label}</h3>
          <span style={{ fontSize: 12, color: C.soft }}>{item?.label || "This cabinet"}</span>
          <button type="button" onClick={onClose} style={{ ...btn, marginLeft: "auto" }}>Done</button>
        </div>
        <div style={winCols}>
          <div style={winMenu}>
            {groups.map((g) => (
              <div key={g}>
                <div style={groupLab}>{g}</div>
                {areas.filter((a) => a.group === g).map((a) => (
                  <button key={a.id} type="button" disabled={a.locked}
                    onClick={() => { setOpenArea(a.id); setSearch(""); }}
                    style={{ ...menuItem, ...(current && current.id === a.id ? menuOn : null), ...(a.locked ? menuLocked : null) }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>{a.label}</b>
                      <span style={{ display: "block", fontSize: 10.5, color: C.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {/* A step that is answered and simply has nothing to
                            show, an optional edge for instance, reads as blank
                            rather than as something missed. The space keeps the
                            rows the same height. */}
                        {a.locked ? a.why : (areaValue(a) || (a.answered ? "\u00a0" : "Not set"))}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
            <p style={{ ...minorStyle, padding: "0 9px" }}>
              Everything about the {String(def.label).toLowerCase()}. Other parts are in the list on the right of the planner.
            </p>
          </div>
          <div style={winBody}>
            {current && (
              <>
                <h4 style={{ margin: "0 0 3px", fontSize: 16, fontWeight: 800 }}>{current.label}</h4>
                <p style={{ ...minorStyle, margin: "0 0 14px" }}>
                  {current.group === "This part" ? "How this part is built." : "What this part is made of."}
                </p>
                {areaBody(current)}
              </>
            )}
          </div>
        </div>
        <div style={winFoot}>
          <span>{left ? `${left} thing${left === 1 ? "" : "s"} still to set on this part` : "This part is fully configured"}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// A part's board is written wherever that part actually keeps it, and anything
// the new board cannot make is cleared with it.
function writeBoard(item, partKey, patch, opts = {}) {
  const def = publicPartDef(partKey);
  const next = { ...patch };
  if (opts.clearProfile) { next.profile_type = ""; next.profile = ""; }
  if (opts.clearEdge) next.edge_mould = "";
  // The brand and the library row go with the rest of the board. They were the
  // two fields these two parts dropped, which is what left a shelf with no brand
  // on it and its cost matched back by colour name alone.
  if (def?.shelves) {
    return {
      ...(next.material !== undefined ? { shelf_material: next.material } : {}),
      ...(next.finish !== undefined ? { shelf_finish: next.finish } : {}),
      ...(next.colour !== undefined ? { shelf_colour: next.colour } : {}),
      ...(next.thickness_mm !== undefined ? { shelf_thickness_mm: next.thickness_mm } : {}),
      ...(next.supplier !== undefined ? { shelf_supplier_name: next.supplier } : {}),
      ...(next.colour_library_id !== undefined ? { shelf_colour_library_id: next.colour_library_id } : {}),
    };
  }
  if (def?.body) {
    return {
      ...(next.material !== undefined ? { material: next.material } : {}),
      ...(next.finish !== undefined ? { finish: next.finish } : {}),
      ...(next.colour !== undefined ? { colour: next.colour } : {}),
      ...(next.supplier !== undefined ? { supplier_name: next.supplier } : {}),
      ...(next.colour_library_id !== undefined ? { colour_library_id: next.colour_library_id } : {}),
      ...(item?.item_type === "panel" && next.thickness_mm !== undefined ? { panel_thickness_mm: next.thickness_mm } : {}),
    };
  }
  const patched = { ...(item?.[def.styleKey] || {}), ...next };
  // A profile on a PANEL lives in panel_options, so it is not duplicated onto
  // the style where the two could then disagree.
  if (def?.panelKey) { delete patched.profile_type; delete patched.profile; }
  return { [def.styleKey]: patched };
}

// A picture of the actual routed door or edge, falling back to a drawn shape
// where there is no photo yet — the 21mm-only profiles and decorative board's
// two tape edges. Handled on load error as well as up front, so dropping a
// photo into the folder is the only step needed to light it up.
function ImageTile({ src, alt, title, subtitle, badge, on, aspect = 1, fallback = null, onClick }) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <button type="button" onClick={onClick}
      title={title}
      style={{ ...tileBtn, ...(on ? tileOn : null) }}>
      <span style={{ ...aspectBox(aspect), background: "#f7f5ef" }}>
        {show ? (
          // contain, never cover: the whole routed shape has to be visible or
          // there is nothing to compare between one tile and the next.
          <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        ) : (
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "8%" }}>
            {fallback || (
              <svg viewBox="0 0 62 28" width="70%" height="52" aria-hidden="true">
                <path d="M2 26 L2 12 Q2 9 5 9 L57 9 Q60 9 60 12 L60 26" fill="#efece4" stroke="#5c574e" strokeWidth="1.4" />
                <path d="M9 26 L9 15 L53 15 L53 26" fill="none" stroke="#5c574e" strokeWidth="1" />
              </svg>
            )}
          </span>
        )}
        {badge && (
          <span style={{ position: "absolute", top: 6, right: 6, fontSize: 9.5, fontWeight: 700, color: "#7a5c1e",
            background: "#fdf6e7", border: "1px solid #e8d9b0", borderRadius: 5, padding: "1px 5px" }}>{badge}</span>
        )}
      </span>
      <span style={{ display: "block", padding: "6px 8px 8px" }}>
        <b style={{ display: "block", fontSize: 11.5, fontWeight: 600, lineHeight: 1.25, ...oneLine }}>{title}</b>
        {subtitle && <span style={{ display: "block", fontSize: 10, color: C.soft, ...oneLine }}>{subtitle}</span>}
      </span>
    </button>
  );
}

// A range is a filter on the shapes, not the thing being chosen, so it reads as
// a chip rather than a card the size of the shapes themselves.
// The edge in section, for the two tape edges that have no photo. Drawing the
// same generic shape for both is how "square" and "bevel" ended up looking
// identical.
function EdgeSection({ name }) {
  return (
    <svg viewBox="0 0 52 28" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={`M4 6 ${edgeSectionPath(name)} L4 22 Z`} fill="#efece4" stroke="#5c574e" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function Chip({ on, onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ font: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 999,
        cursor: "pointer", border: `1px solid ${on ? C.green : C.edge}`,
        background: on ? C.green : "#fff", color: on ? "#fff" : C.ink }}>
      {children}
    </button>
  );
}

// Four across, so a name fits on one line. auto-fill with a small minimum
// packed six or seven narrow tiles into a row and wrapped every two-word colour
// name, which is what made the grid read as ragged. Two across on a phone,
// where four would be unreadably small.
const tileGrid = (gap = 10) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(max(112px, (100% - 3 * " + gap + "px) / 4), 1fr))",
  gap,
});

// Which boards a profile can be routed into, so a match onto a flat board
// clears one rather than carrying an impossible combination across.
const BOARDS_WITH_PROFILES = new Set(["Thermolaminate"]);

// Whether the part is already on exactly this board, so the tile it came from
// reads as selected.
function sameSpec(board, profile, u) {
  const n = (v) => String(v || "").trim().toLowerCase();
  return n(board.colour) === n(u.colour)
    && n(board.finish) === n(u.finish)
    && (Number(board.thickness_mm) || null) === (u.thicknessMm || null)
    && n(profile?.profile) === n(u.profile)
    && n(board.edge_mould) === n(u.edge_mould);
}

// One line each, always. A wrapped spec line is what made one tile taller than
// the one beside it; the full text is on the tile's hover title.
const oneLine = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const specLine = { display: "block", fontSize: 10, color: "#7a766c", lineHeight: 1.35, ...oneLine };

const PROFILE_BLURB = {
  Minimal: "A shallow shadow line.",
  Soft: "Rounded shoulders.",
  Sharp: "Crisp square shoulders.",
  Detailed: "Traditional stepped shapes.",
  Fluted: "Vertical ribs across the face.",
};

// ---- small pieces, matching the planner's own ----
const minorStyle = { fontSize: 11.5, color: C.soft, lineHeight: 1.5, margin: "10px 0 0" };
function Minor({ children, style }) { return <p style={{ ...minorStyle, ...style }}>{children}</p>; }
function SubLab({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "#a29d92", margin: "0 0 7px" }}>{children}</div>;
}
function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0", cursor: "pointer", fontSize: 13, color: C.ink }}>
      <span>{label}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.green, cursor: "pointer" }} />
    </label>
  );
}
function Seg({ value, options, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${C.edge}`, borderRadius: 8, overflow: "hidden", flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o.v} type="button" disabled={o.disabled} onClick={() => onChange(o.v)}
          style={{ font: "inherit", fontSize: 12.5, padding: "7px 12px", border: "none", cursor: o.disabled ? "not-allowed" : "pointer",
            background: value === o.v ? C.green : "#fff", color: o.disabled ? "#b9b5ab" : value === o.v ? "#fff" : C.ink, fontWeight: value === o.v ? 600 : 400 }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const scrim = { position: "fixed", inset: 0, background: "rgba(24,24,22,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, zIndex: 60 };
const win = { background: "#fff", color: C.ink, borderRadius: 14, width: "min(1020px,100%)", height: "min(700px,92vh)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" };
const winHead = { display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid #eae6dc" };
const winCols = { flex: 1, display: "flex", minHeight: 0 };
const winMenu = { width: 248, flexShrink: 0, borderRight: "1px solid #eae6dc", overflowY: "auto", padding: 12, background: "#fcfbf8" };
const winBody = { flex: 1, minWidth: 0, overflowY: "auto", padding: "18px 20px" };
const winFoot = { borderTop: "1px solid #eae6dc", padding: "11px 18px", fontSize: 12, color: C.soft };
const groupLab = { fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "#a29d92", margin: "10px 0 5px 9px" };
const menuItem = { display: "flex", alignItems: "center", gap: 9, width: "100%", border: "1px solid transparent", borderRadius: 9, background: "transparent", padding: "7px 9px", cursor: "pointer", font: "inherit", textAlign: "left", color: C.ink, marginBottom: 2 };
const menuOn = { background: "#fff", border: `1px solid ${C.green}`, boxShadow: `0 0 0 1px ${C.green} inset` };
const menuLocked = { cursor: "not-allowed", opacity: 0.55 };
// A picture tile: a block button whose image fills the width. Deliberately NOT
// cardBtn, which is a flex row — a block child of a flex row with no width
// collapses to nothing, which is how the colour swatches came out invisible.
// A box of a fixed shape whose contents are painted inside it. The ratio lives
// on the box and the paint is absolute, so nothing outside can stretch it.
const aspectBox = (ratio) => ({
  position: "relative", display: "block", width: "100%", aspectRatio: String(ratio),
});

const tileBtn = {
  display: "block", width: "100%", padding: 0, overflow: "hidden",
  border: `1px solid ${C.edge}`, borderRadius: 10, background: "#fff",
  cursor: "pointer", font: "inherit", textAlign: "left", color: C.ink,
};
const tileOn = { border: `1px solid ${C.green}`, boxShadow: `0 0 0 1px ${C.green} inset` };

const cardBtn = { border: `1px solid ${C.edge}`, borderRadius: 11, background: "#fff", padding: "10px 11px", cursor: "pointer", font: "inherit", textAlign: "left", color: C.ink, display: "flex", gap: 10, alignItems: "flex-start" };
const cardOn = { border: `1px solid ${C.green}`, boxShadow: `0 0 0 1px ${C.green} inset`, background: "#f6faf7" };
const tag = { display: "inline-block", marginTop: 5, fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", borderRadius: 5, padding: "1px 6px", border: `1px solid ${C.edge}`, background: C.open, color: C.soft };
const tagOn = { border: "1px solid #b9d8c7", background: "#f4faf6", color: C.green };
const pill = { fontStyle: "normal", marginLeft: "auto", fontSize: 9.5, fontWeight: 700, color: "#7a5c1e", background: "#fdf6e7", border: "1px solid #e8d9b0", borderRadius: 5, padding: "1px 5px" };
const noteBox = { background: "#fdf6e7", border: "1px solid #e8d9b0", color: "#7a5c1e", borderRadius: 9, padding: "9px 11px", fontSize: 11.5, lineHeight: 1.5 };
const input = { width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid #d5d0c6", background: "#fff", font: "inherit", fontSize: 13, color: "#33322e" };
const select = { ...input, cursor: "pointer" };
const filterLab = { display: "flex", flexDirection: "column", gap: 5, flex: "1 1 130px", minWidth: 0, fontSize: 11, fontWeight: 600, color: C.soft };
