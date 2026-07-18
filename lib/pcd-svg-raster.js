// Client-only helpers for turning the design tool's on-screen views into images
// for the PDF export. The plan and elevations are SVG, so we rasterise them; the
// 3D view is WebGL, captured separately from its canvas.
//
// The one subtlety is real-finish mode: those SVGs reference the colour tiles by
// URL (<image href="https://…supabase…">). Drawing an SVG that pulls a
// cross-origin image onto a canvas taints the canvas and makes toDataURL throw,
// so we first fetch every referenced tile and inline it as a data URI. Public
// Supabase objects send permissive CORS, so the fetch succeeds; if one doesn't,
// we leave it and let the caller fall back.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Replace every external <image href> in the SVG clone with a data URI so the
// rasterised canvas stays untainted.
async function inlineSvgImages(root) {
  const XLINK = "http://www.w3.org/1999/xlink";
  const nodes = Array.from(root.querySelectorAll("image"));
  await Promise.all(
    nodes.map(async (node) => {
      const href = node.getAttribute("href") || node.getAttributeNS(XLINK, "href");
      if (!href || href.startsWith("data:")) return;
      try {
        const res = await fetch(href, { mode: "cors", cache: "force-cache" });
        const dataUrl = await blobToDataUrl(await res.blob());
        node.setAttribute("href", dataUrl);
        node.removeAttributeNS(XLINK, "href");
      } catch {
        /* leave external; caller handles a possible taint */
      }
    })
  );
}

// Rasterise an <svg> element to a JPEG data URL at `scale`× its viewBox size.
// Falls back to painting a white backdrop so transparent areas don't come out
// black in the JPEG.
export async function rasterizeSvg(svgEl, { scale = 2, background = "#ffffff", quality = 0.92 } = {}) {
  if (!svgEl) return null;
  const vb = svgEl.viewBox?.baseVal;
  const w = vb?.width || svgEl.clientWidth || 1100;
  const h = vb?.height || svgEl.clientHeight || 720;

  const clone = svgEl.cloneNode(true);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  await inlineSvgImages(clone);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Fetch a single tile image and return it as a JPEG data URL, sized to a small
// square swatch for the finish-palette page. Returns null if it can't load.
export async function tileToSwatchDataUrl(src, size = 160) {
  if (!src) return null;
  try {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    // Cover-fit the tile into the square.
    const s = Math.max(size / img.width, size / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return null;
  }
}
