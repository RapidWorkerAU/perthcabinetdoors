document.addEventListener("DOMContentLoaded", () => {
  const overlayButtons = document.querySelectorAll("[data-overlay-open]");
  if (!overlayButtons.length) {
    return;
  }

  const overlays = document.querySelectorAll(".overlay");
  const body = document.body;

  const openOverlay = (id) => {
    const overlay = document.getElementById(id);
    if (!overlay) {
      return;
    }
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    body.classList.add("overlay-open");
  };

  const closeOverlay = (overlay) => {
    if (!overlay) {
      return;
    }
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    body.classList.remove("overlay-open");
  };

  overlayButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openOverlay(button.dataset.overlayOpen);
    });
  });

  overlays.forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeOverlay(overlay);
      }
    });

    overlay.querySelectorAll("[data-overlay-close]").forEach((button) => {
      button.addEventListener("click", () => closeOverlay(overlay));
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const activeOverlay = document.querySelector(".overlay.is-open");
      if (activeOverlay) {
        closeOverlay(activeOverlay);
      }
    }
  });

  const titleCase = (value) =>
    value
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ");

  const displayName = (filename) =>
    titleCase(filename.replace(/\.[^/.]+$/, "").replace(/-/g, " "));

  const createTile = (src, caption, className) => {
    const figure = document.createElement("figure");
    figure.className = `overlay-tile${className ? ` ${className}` : ""}`;
    figure.dataset.previewSrc = src;
    figure.dataset.previewCaption = caption;

    const img = document.createElement("img");
    img.src = src;
    img.alt = caption;

    const figcaption = document.createElement("figcaption");
    figcaption.textContent = caption;

    figure.append(img, figcaption);
    return figure;
  };

  const createSection = (title, items, basePath, tileClass) => {
    const section = document.createElement("section");
    section.className = "overlay-section";

    const header = document.createElement("div");
    header.className = "overlay-section-header";

    const heading = document.createElement("h3");
    heading.textContent = title;
    header.append(heading);

    const grid = document.createElement("div");
    grid.className = "overlay-grid";

    items.forEach((item) => {
      const src = `${basePath}/${item}`;
      const caption = displayName(item);
      grid.append(createTile(src, caption, tileClass));
    });

    section.append(header, grid);
    return section;
  };

  const colourGroups = [
    {
      label: "Gloss",
      folder: "gloss",
      items: [
        "alabaster.jpg",
        "amaro.jpg",
        "classic-white-gloss.jpg",
        "malt-gloss.jpg",
        "new-antique-white.jpg",
        "porcelain.jpg",
        "regal-white-pearl.jpg",
        "silver-metallic.jpg",
        "stone-grey.jpg",
        "ultra-white.jpg",
        "vittoria-pearl.jpg",
      ],
    },
    {
      label: "Ravine",
      folder: "ravine",
      items: ["chateau-oak.jpg", "light-oak.jpg"],
    },
    {
      label: "Smooth",
      folder: "smooth",
      items: [
        "adriatic.jpg",
        "agave.jpg",
        "alabaster.jpg",
        "amaro.jpg",
        "aston-white.jpg",
        "black.jpg",
        "blossom-white.jpg",
        "botanic.jpg",
        "cafe-cream-smooth.jpg",
        "canterbury-grey.jpg",
        "cinder.jpg",
        "elemental-grey.jpg",
        "ferro.jpg",
        "forage.jpg",
        "gossamer-white.jpg",
        "greige.jpg",
        "habitat.jpg",
        "malt.jpg",
        "mercurio-grey.jpg",
        "nouveau-grey.jpg",
        "oasis.jpg",
        "oyster-grey.jpg",
        "pallido.jpg",
        "porcelain.jpg",
        "stone-grey.jpg",
        "strata-grey.jpg",
        "taupe.jpg",
        "topiary.jpg",
        "verdelho.jpg",
      ],
    },
    {
      label: "Texture",
      folder: "texture",
      items: [
        "classic-white-texture.jpg",
        "designer-white.jpg",
        "malt-texture.jpg",
        "new-antique-white.jpg",
        "porcelain.jpg",
        "ultra-white.jpg",
      ],
    },
    {
      label: "Woodmatt",
      folder: "woodmatt",
      items: [
        "blackened-oak.jpg",
        "blonde-oak.jpg",
        "boston-oak.jpg",
        "botany-oak.jpg",
        "bottega-oak.jpg",
        "bronzed-oak.jpg",
        "coastal-oak.jpg",
        "district-oak.jpg",
        "ecru-oak.jpg",
        "estella-oak.jpg",
        "florentine-walnut.jpg",
        "hazel-oak.jpg",
        "laurel-oak.jpg",
        "ligurian-walnut.jpg",
        "manor-oak.jpg",
        "prime-oak.jpg",
        "rubra-oak.jpg",
        "society-oak.jpg",
        "tasmanian-oak.jpg",
      ],
    },
  ];

  const coloursTarget = document.querySelector(
    '[data-overlay-content="colours"]'
  );
  if (coloursTarget) {
    colourGroups.forEach((group) => {
      const section = createSection(
        group.label,
        group.items,
        `images/colours/thermolaminate_mirror/${group.folder}`
      );
      const header = section.querySelector(".overlay-section-header");
      if (header) {
        const helper = document.createElement("p");
        helper.className = "overlay-help";
        helper.textContent = "Click a colour to enlarge.";
        header.append(helper);
      }
      section.dataset.category = group.folder;
      coloursTarget.append(section);
    });
  }

  const profileGroups = [
    {
      label: "Soft",
      folder: "soft",
      items: [
        "albury.jpg",
        "auckland.jpg",
        "bathurst.jpg",
        "bega.jpg",
        "bendigo.jpg",
        "calcutta.jpg",
        "cleveland.jpg",
        "cooma.jpg",
        "croydon.jpg",
        "dorrigo.jpg",
        "hanoi.jpg",
        "lithgow.jpg",
        "longreach.jpg",
        "madrid.jpg",
        "maroochydore.jpg",
        "mildura.jpg",
        "molong.jpg",
        "mona-vale.jpg",
        "monterey.jpg",
        "mudgee.jpg",
        "parkes.jpg",
        "portsea.jpg",
        "preston.jpg",
        "swan.jpg",
        "teralba.jpg",
        "torino.jpg",
        "wellington.jpg",
        "yass.jpg",
      ],
    },
    {
      label: "Sharp",
      folder: "sharp",
      items: [
        "amsterdam.jpg",
        "argentina.jpg",
        "atlanta.jpg",
        "bali.jpg",
        "bari.jpg",
        "beirut.jpg",
        "broadway.jpg",
        "calcutta-35.jpg",
        "cambridge.jpg",
        "carlton.jpg",
        "chesterfield.jpg",
        "christchurch.jpg",
        "colombo.jpg",
        "copenhagen.jpg",
        "dublin.jpg",
        "edinburgh.jpg",
        "leon.jpg",
        "lima.jpg",
        "prague.jpg",
        "rio.jpg",
        "seoul.jpg",
        "tokyo.jpg",
        "valencia.jpg",
        "washington.jpg",
      ],
    },
    {
      label: "Minimal",
      folder: "minimal",
      items: [
        "brussels.jpg",
        "guilford.jpg",
        "hamilton.jpg",
        "kiama.jpg",
        "kunda.jpg",
        "manchester.jpg",
        "munich.jpg",
        "napoli.jpg",
        "paterson.jpg",
        "sanda.jpg",
        "softline.jpg",
        "vienna.jpg",
      ],
    },
    {
      label: "Detailed",
      folder: "detailed",
      items: [
        "ascot.jpg",
        "ballarat.jpg",
        "bayswater.jpg",
        "berrilee.jpg",
        "berrima.jpg",
        "bowral.jpg",
        "broome.jpg",
        "calcutta-10.jpg",
        "calcutta-25.jpg",
        "cammeray.jpg",
        "casino.jpg",
        "chifley.jpg",
        "classic-square.jpg",
        "country-square.jpg",
        "dural.jpg",
        "farmhouse.jpg",
        "farnborough.jpg",
        "federation.jpg",
        "gerroa.jpg",
        "grafton.jpg",
        "hampton.jpg",
        "jersey.jpg",
        "lismore.jpg",
        "macquarie.jpg",
        "mallee.jpg",
        "manhattan.jpg",
        "oberon.jpg",
        "patonga.jpg",
        "stratford.jpg",
        "sussex.jpg",
        "tamworth.jpg",
        "valla.jpg",
        "woongarrah.jpg",
      ],
    },
  ];

  const profilesTarget = document.querySelector(
    '[data-overlay-content="profiles"]'
  );
  if (profilesTarget) {
    profileGroups.forEach((group) => {
      const section = createSection(
        group.label,
        group.items,
        `images/profiles/${group.folder}`
      );
      const header = section.querySelector(".overlay-section-header");
      if (header) {
        const helper = document.createElement("p");
        helper.className = "overlay-help";
        helper.textContent = "Click a profile to enlarge.";
        header.append(helper);
      }
      section.dataset.category = group.folder;
      profilesTarget.append(section);
    });
  }

  const edgesTarget = document.querySelector('[data-overlay-content="edges"]');
  if (edgesTarget) {
    edgesTarget.append(
      createSection(
        "Edge profiles",
        [
          "em0-square.png",
          "em12-small-chamfer.png",
          "em1-6mm-pencil-round.png",
          "em2-thumb-mould.png",
          "em3-large-bevel.png",
          "em4-step-pencil-round.png",
          "em5-step-bevel.png",
          "em6-roman.png",
          "em7-small-bevel.png",
          "em8-softline.png",
          "em9-3mm-pencil-round.png",
        ],
        "images/edges",
        "tile-edge"
      )
    );
  }

  const profileFilterGroup = document.querySelector("[data-profile-filter]");
  if (profileFilterGroup && profilesTarget) {
    const pills = Array.from(profileFilterGroup.querySelectorAll(".pill"));
    const updateFilter = (value) => {
      profilesTarget.querySelectorAll(".overlay-section").forEach((section) => {
        const matches = section.dataset.category === value;
        section.style.display = matches ? "" : "none";
      });
    };

    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        pills.forEach((item) => item.classList.remove("is-active"));
        pill.classList.add("is-active");
        updateFilter(pill.dataset.value);
      });
    });

    const activePill =
      profileFilterGroup.querySelector(".pill.is-active") || pills[0];
    if (activePill) {
      pills.forEach((item) => item.classList.remove("is-active"));
      activePill.classList.add("is-active");
      updateFilter(activePill.dataset.value);
    }
  }

  const colourFilterGroup = document.querySelector("[data-colour-filter]");
  if (colourFilterGroup && coloursTarget) {
    const pills = Array.from(colourFilterGroup.querySelectorAll(".pill"));
    const updateFilter = (value) => {
      coloursTarget.querySelectorAll(".overlay-section").forEach((section) => {
        const matches = section.dataset.category === value;
        section.style.display = matches ? "" : "none";
      });
    };

    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        pills.forEach((item) => item.classList.remove("is-active"));
        pill.classList.add("is-active");
        updateFilter(pill.dataset.value);
      });
    });

    const activePill =
      colourFilterGroup.querySelector(".pill.is-active") || pills[0];
    if (activePill) {
      pills.forEach((item) => item.classList.remove("is-active"));
      activePill.classList.add("is-active");
      updateFilter(activePill.dataset.value);
    }
  }

  const previewOverlay = document.getElementById("overlay-preview");
  if (previewOverlay) {
    const previewImg = previewOverlay.querySelector("img");
    const previewCaption = previewOverlay.querySelector("figcaption");

    document
      .querySelectorAll('[data-overlay-content="colours"] .overlay-tile')
      .forEach((tile) => {
        tile.addEventListener("click", () => {
          const src = tile.dataset.previewSrc;
          const caption = tile.dataset.previewCaption;
          if (!src || !previewImg || !previewCaption) {
            return;
          }
          previewOverlay.classList.remove("is-profile");
          previewImg.src = src;
          previewImg.alt = caption;
          previewCaption.textContent = caption;
          openOverlay("overlay-preview");
        });
      });

    document
      .querySelectorAll('[data-overlay-content="profiles"] .overlay-tile')
      .forEach((tile) => {
        tile.addEventListener("click", () => {
          const src = tile.dataset.previewSrc;
          const caption = tile.dataset.previewCaption;
          if (!src || !previewImg || !previewCaption) {
            return;
          }
          previewOverlay.classList.add("is-profile");
          previewOverlay.classList.remove("is-edge");
          previewImg.src = src;
          previewImg.alt = caption;
          previewCaption.textContent = caption;
          openOverlay("overlay-preview");
        });
      });

    document
      .querySelectorAll('[data-overlay-content="edges"] .overlay-tile')
      .forEach((tile) => {
        tile.addEventListener("click", () => {
          const src = tile.dataset.previewSrc;
          const caption = tile.dataset.previewCaption;
          if (!src || !previewImg || !previewCaption) {
            return;
          }
          previewOverlay.classList.remove("is-profile");
          previewOverlay.classList.add("is-edge");
          previewImg.src = src;
          previewImg.alt = caption;
          previewCaption.textContent = caption;
          openOverlay("overlay-preview");
        });
      });
  }
});
