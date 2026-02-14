(() => {
  const toggle = document.querySelector(".nav-toggle");
  const overlay = document.querySelector(".nav-overlay");
  const closeButton = document.querySelector(".nav-close");
  const panel = document.querySelector(".nav-overlay-panel");

  if (!toggle || !overlay || !closeButton || !panel) {
    return;
  }

  const setOpen = (isOpen) => {
    overlay.classList.toggle("is-open", isOpen);
    document.body.classList.toggle("menu-open", isOpen);
    overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  toggle.addEventListener("click", () => {
    const isOpen = overlay.classList.contains("is-open");
    setOpen(!isOpen);
  });

  closeButton.addEventListener("click", () => setOpen(false));

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      setOpen(false);
    }
  });

  overlay.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
    }
  });
})();
