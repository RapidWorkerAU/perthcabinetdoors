document.addEventListener("DOMContentLoaded", () => {
  const gallery = document.querySelector(".product-gallery");
  if (!gallery) {
    return;
  }

  const mainImage = gallery.querySelector(".gallery-main img");
  const thumbButtons = gallery.querySelectorAll(".gallery-thumb");

  thumbButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const fullSrc = button.dataset.full;
      const thumbImg = button.querySelector("img");

      if (!fullSrc || !mainImage || !thumbImg) {
        return;
      }

      mainImage.src = fullSrc;
      mainImage.alt = thumbImg.alt || "Product image";

      thumbButtons.forEach((btn) => btn.classList.remove("is-active"));
      button.classList.add("is-active");
    });
  });
});
