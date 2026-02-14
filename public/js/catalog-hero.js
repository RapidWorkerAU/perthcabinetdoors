(() => {
  const text = document.querySelector("[data-catalog-hero-text]");
  const toggle = document.querySelector("[data-catalog-hero-toggle]");

  if (!text || !toggle) {
    return;
  }

  const media = window.matchMedia("(max-width: 700px)");

  const setCollapsedState = (shouldCollapse) => {
    if (!shouldCollapse) {
      text.classList.remove("is-collapsed", "is-expanded");
      toggle.style.display = "none";
      toggle.setAttribute("aria-expanded", "true");
      return;
    }

    text.classList.add("is-collapsed");
    text.classList.remove("is-expanded");
    toggle.style.display = "";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Read more";
  };

  setCollapsedState(media.matches);

  media.addEventListener("change", (event) => {
    setCollapsedState(event.matches);
  });

  toggle.addEventListener("click", () => {
    const isExpanded = text.classList.contains("is-expanded");
    text.classList.toggle("is-expanded", !isExpanded);
    text.classList.toggle("is-collapsed", isExpanded);
    toggle.textContent = isExpanded ? "Read more" : "Read less";
    toggle.setAttribute("aria-expanded", isExpanded ? "false" : "true");
  });
})();
