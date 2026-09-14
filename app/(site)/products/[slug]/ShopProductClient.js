"use client";

// THE SHOP'S PRODUCT PAGE. THE SAME CONFIGURATOR AS THE QUOTE BUILDER.
//
// The design chosen on 8 September 2026: a split stage, the door drawn live on
// the left and numbered questions on the right, colour picked as a finish and
// then a tile, and the price card under the questions where the quote builder
// puts its amber "priced by hand". Every question is the quote builder's own
// component from app/(site)/_builder, reading a line of exactly the builder's
// shape, so the two pages cannot drift into looking like two websites.
//
// What only the shop does: it has a price, it asks whether to supply the
// hinges, and it adds to a cart rather than a list. The price is worked out on
// the server (lib/pcd-shop-pricing.js) from the quote's own arithmetic, so no
// rate is ever in this page.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import DoorDrawing from "@/components/public/DoorDrawing";
import { hingeCount } from "@/lib/pcd-hinges";
import { readQuoteDraft, writeQuoteLines } from "@/lib/pcd-quote-draft";
import {
  SHOP_BRAND,
  SHOP_MATERIAL,
  SHOP_PANEL_USES,
  boringForHinge,
  describeProblems,
  hingeLabel,
  hingeQtyForHeight,
  money,
  newShopLine,
  shopLineProblems,
  shopLineSpec,
  shopLineTitle,
  shopSizeProblems,
} from "@/lib/pcd-shop";
import { readShopCart, saveCartLine, useShopCart } from "@/lib/pcd-shop-cart";
import styles from "../../contact/contact.module.css";
import Tabs from "../../_builder/Tabs";
import ColourTiles from "../../_builder/ColourTiles";
import SizeFields from "../../_builder/SizeFields";
import BandedEdgesField from "../../_builder/BandedEdgesField";
import HingeFields from "../../_builder/HingeFields";
import QtyStepper from "../../_builder/QtyStepper";
import { cupsForDrawing } from "../../_builder/builder-utils";

const FINISH_FIRST = "Matt";

/** The catalogue's colours as finish groups of tiles, one tile per colour name. */
function colourGroups(colours) {
  const byFinish = new Map();
  for (const row of colours) {
    if (!byFinish.has(row.finish)) byFinish.set(row.finish, new Map());
    const names = byFinish.get(row.finish);
    const existing = names.get(row.colour);
    names.set(row.colour, {
      key: `${row.finish}|${row.colour}`,
      name: row.colour,
      src: existing?.src || row.src,
      priced: Boolean(existing?.priced) || row.priced,
    });
  }
  return [...byFinish.entries()]
    .sort(([a], [b]) => (a === FINISH_FIRST ? -1 : b === FINISH_FIRST ? 1 : a.localeCompare(b)))
    .map(([label, names]) => ({
      label,
      colours: [...names.values()].map((colour) => ({ ...colour, badge: colour.priced ? "" : "Quote only" })),
    }));
}

/** The line as the server wants it: no price snapshot, no display-only fields. */
function lineForPricing(line) {
  const { price, colour, finish, colourSrc, material, supplierName, type, hingeQtyTouched, ...rest } = line;
  return rest;
}

export default function ShopProductClient({ product, catalogue }) {
  const router = useRouter();
  const cart = useShopCart();
  const defaultHinge = useMemo(
    () => catalogue.hinges.find((hinge) => boringForHinge(hinge) === "Blum Inserta") || catalogue.hinges[0] || null,
    [catalogue.hinges]
  );
  const [line, setLine] = useState(() => newShopLine(product, { hinge: defaultHinge }));
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(null);
  const [pricing, setPricing] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [flash, setFlash] = useState(null);
  const [tried, setTried] = useState(false);

  // ?edit=ID is Change on the cart. It opens that line here, and the next Add
  // replaces it rather than making a second one.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current || !cart.ready) return;
    loadedRef.current = true;
    const wanted = new URLSearchParams(window.location.search).get("edit");
    const found = wanted ? readShopCart().lines.find((entry) => entry.id === wanted && entry.product === product.slug) : null;
    if (found) {
      setLine({ ...newShopLine(product), ...found });
      setEditing(true);
    }
  }, [cart.ready, product]);

  const groups = useMemo(() => colourGroups(catalogue.colours), [catalogue.colours]);
  const colourRows = catalogue.colours.filter((row) => row.finish === line.finish && row.colour === line.colour);
  const thicknesses = [...new Set(colourRows.map((row) => row.thickness))].sort();
  const colourRow = catalogue.colours.find((row) => row.id === line.colourLibraryId) || null;
  const hinge = catalogue.hinges.find((entry) => entry.id === line.hingeHardwareId) || null;
  const chosenTile = groups.find((group) => group.label === line.finish)?.colours.find((colour) => colour.name === line.colour);
  const unpriced = Boolean(chosenTile && !chosenTile.priced) || Boolean(colourRow && !colourRow.priced);
  const problems = shopLineProblems(line, { limit: catalogue.limit, colour: colourRow, hinge });
  const sizeErrors = shopSizeProblems(line, catalogue.limit);

  function update(patch) {
    setFlash(null);
    setLine((current) => {
      const next = { ...current, ...patch };

      // A colour is a finish and a name; the board behind it is that and a
      // thickness. Resolved together, so the line always names one real row.
      if ("colour" in patch || "finish" in patch || "thickness" in patch) {
        const rows = catalogue.colours.filter((row) => row.finish === next.finish && row.colour === next.colour);
        const offered = [...new Set(rows.map((row) => row.thickness))];
        if (!offered.includes(next.thickness)) next.thickness = offered.length === 1 ? offered[0] : "";
        const row = rows.find((entry) => entry.thickness === next.thickness);
        next.colourLibraryId = row?.id || "";
        next.colourSrc = row?.src || rows[0]?.src || "";
      }

      // How many hinges follows the height until somebody chooses.
      if (("height" in patch || "preDrill" in patch) && !next.hingeQtyTouched) {
        next.hingeQty = next.preDrill ? hingeQtyForHeight(next.height) : "";
      }

      // CHOOSING A HINGE SETS THE BORING. An Inserta hinge will not go into a
      // bare 35mm cup, so the two are never left to disagree.
      if ("hingeHardwareId" in patch) {
        const chosen = catalogue.hinges.find((entry) => entry.id === next.hingeHardwareId);
        if (chosen) next.holeType = boringForHinge(chosen);
      }
      return next;
    });
  }

  // ── THE PRICE, FROM THE SERVER ─────────────────────────────────────────────
  //
  // Asked only once the line is complete, and a moment after the last change so
  // typing a height is not a request a keystroke.
  const pricingKey = problems.length ? "" : JSON.stringify(lineForPricing(line));
  useEffect(() => {
    if (!pricingKey) {
      setPrice(null);
      setPriceError("");
      setPricing(false);
      return undefined;
    }
    let cancelled = false;
    setPricing(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/shop/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: [JSON.parse(pricingKey)] }),
        });
        const payload = await response.json();
        if (cancelled) return;
        const entry = payload?.lines?.[0];
        if (!response.ok || !payload.ok || !entry) throw new Error(payload?.error || "We could not price that just now.");
        setPrice(entry.ok ? entry : null);
        setPriceError(entry.ok ? "" : `Still needs ${describeProblems(entry.problems)}.`);
      } catch (error) {
        if (!cancelled) {
          setPrice(null);
          setPriceError(error.message || "We could not price that just now.");
        }
      } finally {
        if (!cancelled) setPricing(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setPricing(false);
    };
  }, [pricingKey]);

  function addToCart() {
    setTried(true);
    if (problems.length || !price || pricing) return;
    // The hinge's name travels with the line, so the cart can say which hinge
    // without a second read of the catalogue.
    const replaced = saveCartLine({ ...line, price, hingeName: line.supplyHinges && hinge ? hingeLabel(hinge) : "" });
    setFlash({ replaced, title: shopLineTitle(line), qty: price.qty, height: line.height, width: line.width });
    // The configuration stays, because the next door is usually the same door
    // in a different size. It becomes a new line from here.
    setEditing(false);
    setLine((current) => ({ ...current, id: newShopLine(product).id }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // A colour we hold no live price on. Everything they set up here goes
  // across to a quote list, sizes and hinge positions and all, rather than
  // being retyped into another form.
  function moveToQuoteList() {
    const moved = {
      id: `shop-${Date.now().toString(36)}`,
      type: product.type,
      panelUse: line.panelUse || "",
      material: SHOP_MATERIAL,
      supplierName: SHOP_BRAND,
      thickness: line.thickness,
      finish: line.finish,
      colour: line.colour,
      colourSrc: line.colourSrc,
      colourLibraryId: line.colourLibraryId,
      height: line.height,
      width: line.width,
      qty: line.qty,
      bandedEdges: line.bandedEdges,
      preDrill: product.type === "Door" && line.preDrill,
      holeType: line.holeType,
      hingeQty: line.hingeQty,
      hingeSide: line.hingeSide,
      hingeFromBottomMm: line.hingeFromBottomMm,
      hingeFromTopMm: line.hingeFromTopMm,
      hingeMiddlesMm: line.hingeMiddlesMm,
      hingeMiddlesTouched: line.hingeMiddlesTouched,
      edgeMould: "",
      profileType: "",
      profile: "",
      cabinetBrand: "",
      hardwareId: "",
      hardwareName: "",
      note: [
        "Set up on the shop.",
        line.supplyHinges && hinge ? `Would like ${hingeLabel(hinge)} hinges supplied.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
    writeQuoteLines([...readQuoteDraft().lines, moved]);
    router.push("/request-quote/list");
  }

  const steps = [
    product.type === "Panel" ? { key: "panelUse", title: "What kind of panel" } : null,
    { key: "colour", title: "Colour and finish" },
    { key: "thickness", title: "Thickness" },
    { key: "size", title: "Size" },
    { key: "edges", title: "Which edges are banded" },
    product.type === "Door" ? { key: "hinges", title: "Hinges" } : null,
    { key: "qty", title: "How many" },
  ].filter(Boolean);

  function stepBody(key) {
    if (key === "panelUse") {
      return (
        <>
          <Tabs
            options={SHOP_PANEL_USES.map((use) => ({ value: use, label: use || "Panel" }))}
            value={line.panelUse || ""}
            cols={4}
            onChoose={(panelUse) => update({ panelUse })}
          />
          <p className={styles.fieldHint}>So the workshop knows what it is cutting. They are all priced the same way.</p>
        </>
      );
    }

    if (key === "colour") {
      return (
        <ColourTiles
          groups={groups}
          finish={line.finish}
          colourKey={line.finish && line.colour ? `${line.finish}|${line.colour}` : ""}
          invalid={tried && !line.colour}
          onFinish={(finish) => update({ finish, colour: "", colourLibraryId: "", colourSrc: "" })}
          onColour={(colour, group) => update({ finish: group.label, colour: colour.name })}
        />
      );
    }

    if (key === "thickness") {
      if (!line.colour) return <span className={styles.notApplicable}>Choose a colour first</span>;
      return (
        <>
          <Tabs
            options={thicknesses}
            value={line.thickness}
            cols={Math.max(1, thicknesses.length)}
            invalid={tried && !line.thickness}
            onChoose={(thickness) => update({ thickness })}
          />
          {thicknesses.length === 1 ? (
            <p className={styles.fieldHint}>
              {line.colour} {line.finish} comes in {thicknesses[0]} only.
            </p>
          ) : null}
        </>
      );
    }

    if (key === "size") {
      return (
        <>
          <SizeFields
            item={line}
            limit={catalogue.limit}
            range={{
              height: `${catalogue.limit.minHeightMm} to ${catalogue.limit.maxHeightMm}`,
              width: `${catalogue.limit.minWidthMm} to ${catalogue.limit.maxWidthMm}`,
            }}
            errors={sizeErrors}
            invalid={{ height: tried && !line.height, width: tried && !line.width }}
            onChange={update}
          />
          {!sizeErrors.height && !sizeErrors.width ? (
            <p className={styles.fieldHint}>Height first. Measure the door you have, not the hole it sits in.</p>
          ) : null}
        </>
      );
    }

    if (key === "edges") {
      return (
        <BandedEdgesField
          value={line.bandedEdges}
          hint="Tap an edge to leave it raw. An edge against a wall or another door is often left raw. The banding is worked out from what you tick and is already in the price."
          onChange={(bandedEdges) => update({ bandedEdges })}
        />
      );
    }

    if (key === "hinges") {
      const suggested = hingeQtyForHeight(line.height);
      return (
        <>
          <HingeFields
            item={line}
            onChange={update}
            countHint={
              line.height && suggested && !line.hingeQtyTouched
                ? `A ${line.height}mm door is normally hung on ${suggested}.`
                : ""
            }
          />
          {line.preDrill ? (
            <div className={styles.hingeSupply}>
              <label className={line.supplyHinges ? `${styles.checkCard} ${styles.checkCardOn}` : styles.checkCard}>
                <input
                  type="checkbox"
                  checked={Boolean(line.supplyHinges)}
                  onChange={(event) =>
                    update({
                      supplyHinges: event.target.checked,
                      ...(event.target.checked && !line.hingeHardwareId && defaultHinge
                        ? { hingeHardwareId: defaultHinge.id }
                        : {}),
                    })
                  }
                />
                <span>
                  <strong>Supply the hinges as well</strong>
                  <span>Priced separately from the holes. Untick if you already have them.</span>
                </span>
              </label>
              {line.supplyHinges ? (
                <>
                  <span className={styles.fieldLabel}>Which hinge</span>
                  <div className={styles.hingeTiles}>
                    {catalogue.hinges.map((entry) => {
                      const on = entry.id === line.hingeHardwareId;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          aria-pressed={on}
                          className={on ? `${styles.hingeTile} ${styles.hingeTileOn}` : styles.hingeTile}
                          onClick={() => update({ hingeHardwareId: entry.id })}
                        >
                          <span className={styles.hingeTileImg}>
                            {entry.imageUrl ? <img alt="" src={entry.imageUrl} loading="lazy" /> : null}
                          </span>
                          <strong>{hingeLabel(entry)}</strong>
                          <span>{entry.description || boringForHinge(entry)}</span>
                          <em>{money(entry.priceExGst)} each ex GST</em>
                        </button>
                      );
                    })}
                  </div>
                  {hinge && boringForHinge(hinge) === "Blum Inserta" ? (
                    <p className={styles.hingeNote}>
                      An Inserta hinge knocks into a cup with two dowels beside it, so the holes above have been set to
                      match. It will not go into a bare 35mm cup.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      );
    }

    if (key === "qty") {
      return (
        <QtyStepper
          value={line.qty}
          hint={`All the same size, colour and drilling. Add a different ${product.name.toLowerCase()} as a second item.`}
          onChange={(qty) => update({ qty: Number(qty) || qty })}
        />
      );
    }
    return null;
  }

  const spec = shopLineSpec(line, { hinge });
  const qty = Math.max(1, Math.round(Number(line.qty) || 1));
  const gst = price ? Math.round((price.totalIncGst - price.totalExGst) * 100) / 100 : 0;
  const readiness = problems.length
    ? `Still needs ${describeProblems(problems)}.`
    : pricing
      ? "Working out the price..."
      : priceError || "";
  // Pressable while something is missing, so pressing it marks what is missing
  // on the questions themselves. Held only while a complete line is being
  // priced, because a price we have not got is not one we can add.
  const waiting = !problems.length && (!price || pricing);
  const buttonLabel = editing ? "Update this line" : "Add to cart";

  return (
    <div className={styles.quoteFormTable}>
      {flash ? (
        <div className={styles.builderStrip}>
          <div>
            <strong>{flash.replaced ? "Cart line updated" : "Added to your cart"}</strong>
            <span>
              {flash.qty} x {flash.title}, {flash.height} x {flash.width} mm
            </span>
          </div>
          <div className={styles.shopFlashActions}>
            <Link className={styles.builderStripBtn} href="/cart">
              View cart
            </Link>
            <button type="button" className={styles.shopFlashKeep} onClick={() => setFlash(null)}>
              Keep going
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.builder}>
        <div className={styles.builderStage}>
          <DoorDrawing
            styles={styles}
            id={`shop-${product.slug}`}
            heightMm={line.height}
            widthMm={line.width}
            material={SHOP_MATERIAL}
            colourTile={line.colourSrc}
            colourName={line.colour}
            bandedEdges={line.bandedEdges}
            hingeHoles={product.type === "Door" && line.preDrill}
            hingeCount={hingeCount(line.hingeQty)}
            cupsMm={cupsForDrawing(line)}
            hingeSide={line.hingeSide}
            holeType={line.holeType}
          />
        </div>

        <div className={styles.builderPanel}>
          <div className={styles.builderHead}>
            <span className={styles.sectionLabel}>{editing ? "Changing a cart line" : "Made to measure"}</span>
            <h2>{product.name}</h2>
            <p className={styles.builderLede}>
              Polytec decorative board, cut and edged to the millimetre. The price updates as you answer.
            </p>
          </div>

          {unpriced ? (
            <div className={styles.shopUnpriced}>
              <strong>{line.colour} is quote only</strong>
              <p>
                We have not got a live price on this colour yet. Set it up here and we will carry the whole thing across
                to a quote list, sizes and hinge positions and all, and price it by hand.
              </p>
              <button type="button" className={styles.shopUnpricedBtn} onClick={moveToQuoteList}>
                Move this to my quote list
              </button>
            </div>
          ) : null}

          <div className={styles.builderCard}>
            {steps.map((step, index) => (
              <section key={step.key} className={index ? styles.stepRuled : undefined}>
                <div className={styles.stepHead}>
                  <span className={styles.stepNum}>{index + 1}</span>
                  <h3>{step.title}</h3>
                </div>
                {stepBody(step.key)}
              </section>
            ))}
          </div>

          {/* WHAT THEY HAVE CHOSEN, THEN WHAT IT COSTS. One card: the spec
              first, so the price lines under it can be short. The quote
              builder's card in the same place says "Priced by hand" in amber;
              this one says a figure in green. */}
          <div className={styles.specCard}>
            <div className={styles.specRows}>
              <span className={styles.sectionLabel}>Your {product.name.toLowerCase()}</span>
              {spec.map(([label, value]) => (
                <div className={styles.specRow} key={label}>
                  <span>{label}</span>
                  <span>{value}</span>
                </div>
              ))}
              {qty > 1 ? (
                <div className={styles.specRow}>
                  <span>Quantity</span>
                  <span>{qty}</span>
                </div>
              ) : null}
            </div>

            {price ? (
              <div className={styles.shopParts}>
                {price.parts.map((part) => (
                  <div className={styles.shopPart} key={part.label}>
                    <span>{part.label}</span>
                    <span>{money(part.exGst)}</span>
                  </div>
                ))}
                <div className={`${styles.shopPart} ${styles.shopPartRule}`}>
                  <span>
                    {price.qty} {price.qty === 1 ? product.name.toLowerCase() : product.plural}, ex GST
                  </span>
                  <span>{money(price.totalExGst)}</span>
                </div>
                <div className={styles.shopPart}>
                  <span>GST</span>
                  <span>{money(gst)}</span>
                </div>
              </div>
            ) : null}

            <div className={styles.shopPrice}>
              <div className={styles.shopPriceHead}>
                <span>Total inc GST</span>
                {price ? (
                  <strong>{money(price.totalIncGst)}</strong>
                ) : (
                  <em className={styles.shopPriceWaiting}>{pricing ? "Working it out..." : "Appears as you answer"}</em>
                )}
              </div>
              {price && price.qty > 1 ? <p className={styles.shopPriceEach}>{money(price.unitIncGst)} each inc GST</p> : null}
              {readiness ? <p className={styles.shopReady}>{readiness}</p> : null}
              <button type="button" className={styles.shopAddBtn} disabled={waiting} onClick={addToCart}>
                {buttonLabel}
              </button>
              <p className={styles.shopPriceFoot}>Made in Perth &middot; about 10 working days &middot; delivered Perth metro</p>
            </div>
          </div>
        </div>
      </div>

      {/* THE BAR THAT FOLLOWS THEM DOWN THE PAGE. The price and the button are
          never more than a glance away, however far down the questions go. */}
      <div className={styles.shopBar}>
        <div className={styles.shopBarInner}>
          <div className={styles.shopBarPrice}>
            <span>{price ? `${price.qty} x ${money(price.unitIncGst)} each inc GST` : "Price appears as you answer"}</span>
            <strong>{price ? money(price.totalIncGst) : " "}</strong>
          </div>
          <button type="button" className={styles.shopBarBtn} disabled={waiting} onClick={addToCart}>
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
