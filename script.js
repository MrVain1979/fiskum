document.documentElement.classList.add("js");

let cleanupInteractions = () => {};
function initInteractions() {
  cleanupInteractions();
  const interactionAbort = new AbortController();
  const signal = interactionAbort.signal;
  const disposers = [];
  const listen = (target, event, handler, options = {}) =>
    target?.addEventListener(event, handler, { ...options, signal });
  cleanupInteractions = () => {
    interactionAbort.abort();
    document.body.classList.remove("menu-open");
    disposers.forEach((dispose) => dispose());
  };
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#primary-nav");
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
  };

  listen(toggle, "click", () =>
    setMenu(!document.body.classList.contains("menu-open")),
  );
  listen(nav, "click", (event) => {
    if (event.target instanceof HTMLAnchorElement) setMenu(false);
  });

  for (const contactForm of document.querySelectorAll(".contact-form")) {
    const query = new URLSearchParams(window.location.search);
    const formStatus = contactForm?.querySelector(".form-status");
    let pendingSubmission;
    const showFormStatus = (message, isError = false) => {
      if (!formStatus) return;
      formStatus.textContent = message;
      formStatus.classList.toggle("is-error", isError);
      formStatus.hidden = false;
      formStatus.setAttribute("role", isError ? "alert" : "status");
    };

    if (contactForm && query.get("sendt") === "1") {
      showFormStatus(
        contactForm.dataset.successMessage ||
          "Takk! Forespørselen er mottatt. Vi tar kontakt så snart vi kan.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    }

    listen(contactForm, "submit", async (event) => {
      event.preventDefault();
      if (contactForm.dataset.previewDisabled) return;
      const button = contactForm.querySelector('button[type="submit"]');
      const originalLabel = button?.textContent || "Send forespørsel";
      const endpoint = contactForm.action;

      if (button) {
        button.disabled = true;
        button.textContent = "Sender ...";
      }
      if (formStatus) formStatus.hidden = true;

      try {
        const payload = new FormData(contactForm);
        const snapshot = JSON.stringify([...payload]);
        if (!pendingSubmission || pendingSubmission.snapshot !== snapshot)
          pendingSubmission = { snapshot, id: crypto.randomUUID() };
        payload.set("submissionId", pendingSubmission.id);
        const response = await fetch(endpoint, {
          method: "POST",
          body: payload,
          headers: { Accept: "application/json" },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success !== true) {
          throw new Error(
            result.message || "Skjemaet kunne ikke sendes akkurat nå.",
          );
        }

        contactForm.reset();
        pendingSubmission = null;
        showFormStatus(
          contactForm.dataset.successMessage ||
            "Takk! Forespørselen er mottatt. Vi tar kontakt så snart vi kan.",
        );
      } catch (error) {
        showFormStatus(
          error.message ||
            "Skjemaet kunne ikke sendes akkurat nå. Prøv igjen, eller send e-post til post@fiskum-sveis.no.",
          true,
        );
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }
    });
  }
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  for (const hero of document.querySelectorAll(".hero")) {
    const heroSlides = Array.from(hero.querySelectorAll(".hero-slide"));
    const heroDots = Array.from(hero.querySelectorAll(".hero-dots button"));
    let heroIndex = 0;
    let heroTimer;
    disposers.push(() => window.clearInterval(heroTimer));

    const hydrateHeroSlide = (index) => {
      const image = heroSlides[index]?.querySelector("img[data-src]");
      if (!image) return;
      image.src = image.dataset.src;
      image.removeAttribute("data-src");
      if (image.dataset.srcset) {
        image.srcset = image.dataset.srcset;
        image.removeAttribute("data-srcset");
      }
    };

    const updateHeroMotion = () => {
      const activeImage = hero.querySelector(".hero-slide.is-active img");
      if (!activeImage || reduceMotion || window.innerWidth < 720) return;
      const offset = Math.min(window.scrollY * 0.05, 28);
      activeImage.style.transform = `scale(1.06) translateY(${offset}px)`;
    };

    const setHeroSlide = (index) => {
      if (!heroSlides.length) return;
      heroIndex = (index + heroSlides.length) % heroSlides.length;
      hydrateHeroSlide(heroIndex);

      heroSlides.forEach((slide, slideIndex) => {
        slide.classList.toggle("is-active", slideIndex === heroIndex);
        if (slideIndex !== heroIndex)
          slide.querySelector("img")?.style.removeProperty("transform");
      });

      heroDots.forEach((dot, dotIndex) => {
        const active = dotIndex === heroIndex;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-current", active ? "true" : "false");
      });

      updateHeroMotion();
    };

    const startHeroSlider = () => {
      if (reduceMotion || heroSlides.length < 2) return;
      window.clearInterval(heroTimer);
      heroTimer = window.setInterval(() => setHeroSlide(heroIndex + 1), 5600);
    };

    heroDots.forEach((dot, index) => {
      listen(dot, "click", () => {
        setHeroSlide(index);
        startHeroSlider();
      });
    });

    if (heroSlides.length) {
      setHeroSlide(0);
      startHeroSlider();
      const hydrateTimer = window.setTimeout(() => hydrateHeroSlide(1), 900);
      disposers.push(() => window.clearTimeout(hydrateTimer));
    }

    if (heroSlides.length && !reduceMotion) {
      let ticking = false;
      listen(
        window,
        "scroll",
        () => {
          if (ticking) return;
          ticking = true;
          window.requestAnimationFrame(() => {
            ticking = false;
            updateHeroMotion();
          });
        },
        { passive: true, signal },
      );
    }
  }

  const galleries = Array.from(document.querySelectorAll(".gallery"));
  if (galleries.length) {
    const lightbox = document.createElement("dialog");
    lightbox.className = "gallery-lightbox";
    lightbox.setAttribute("aria-label", "Bildevisning");
    lightbox.innerHTML = `
      <button class="gallery-lightbox__close" type="button" aria-label="Lukk bildevisning" title="Lukk">&times;</button>
      <div class="gallery-lightbox__stage">
        <button class="gallery-lightbox__nav gallery-lightbox__prev" type="button" aria-label="Forrige bilde" title="Forrige bilde">&#8249;</button>
        <figure class="gallery-lightbox__figure">
          <img class="gallery-lightbox__image" alt="">
          <figcaption class="gallery-lightbox__meta">
            <span class="gallery-lightbox__caption"></span>
            <span class="gallery-lightbox__count" aria-live="polite"></span>
          </figcaption>
        </figure>
        <button class="gallery-lightbox__nav gallery-lightbox__next" type="button" aria-label="Neste bilde" title="Neste bilde">&#8250;</button>
      </div>`;
    document.body.append(lightbox);
    disposers.push(() => lightbox.remove());

    const lightboxImage = lightbox.querySelector(".gallery-lightbox__image");
    const caption = lightbox.querySelector(".gallery-lightbox__caption");
    const count = lightbox.querySelector(".gallery-lightbox__count");
    const previous = lightbox.querySelector(".gallery-lightbox__prev");
    const next = lightbox.querySelector(".gallery-lightbox__next");
    const close = lightbox.querySelector(".gallery-lightbox__close");
    let activeItems = [];
    let activeIndex = 0;
    let opener = null;
    let touchStartX = null;
    let changeTimer;
    disposers.push(() => window.clearTimeout(changeTimer));

    const preloadNeighbours = () => {
      if (activeItems.length < 2) return;
      [-1, 1].forEach((offset) => {
        const item =
          activeItems[
            (activeIndex + offset + activeItems.length) % activeItems.length
          ];
        const src = item?.dataset.gallerySrc;
        if (src) new Image().src = src;
      });
    };

    const updateLightbox = (index, animate = true) => {
      if (!activeItems.length) return;
      activeIndex = (index + activeItems.length) % activeItems.length;
      const item = activeItems[activeIndex];
      const src =
        item.dataset.gallerySrc || item.querySelector("img")?.currentSrc || "";
      const alt = item.dataset.galleryAlt || "";
      const captionText = item.dataset.galleryCaption || "";

      window.clearTimeout(changeTimer);
      if (animate && !reduceMotion) lightboxImage.classList.add("is-changing");
      changeTimer = window.setTimeout(
        () => {
          lightboxImage.src = src;
          lightboxImage.alt = alt;
          caption.textContent = captionText;
          caption.hidden = !captionText;
          count.textContent = `${activeIndex + 1} / ${activeItems.length}`;
          previous.hidden = activeItems.length < 2;
          next.hidden = activeItems.length < 2;
          lightboxImage.classList.remove("is-changing");
          preloadNeighbours();
        },
        animate && !reduceMotion ? 110 : 0,
      );
    };

    const closeLightbox = () => {
      if (lightbox.open) lightbox.close();
    };
    const showPrevious = () => updateLightbox(activeIndex - 1);
    const showNext = () => updateLightbox(activeIndex + 1);

    listen(
      document,
      "click",
      (event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest("[data-gallery-item]")
            : null;
        const gallery = target?.closest(".gallery");
        if (!target || !gallery) return;

        activeItems = Array.from(
          gallery.querySelectorAll("[data-gallery-item]"),
        );
        opener = target;
        if (!lightbox.isConnected) document.body.append(lightbox);
        updateLightbox(activeItems.indexOf(target), false);
        lightbox.showModal();
        document.body.classList.add("gallery-lightbox-open");
        close.focus();
      },
      { signal },
    );

    listen(previous, "click", showPrevious);
    listen(next, "click", showNext);
    listen(close, "click", closeLightbox);
    listen(lightbox, "click", (event) => {
      if (
        event.target === lightbox ||
        event.target === lightbox.querySelector(".gallery-lightbox__stage") ||
        event.target === lightbox.querySelector(".gallery-lightbox__figure")
      ) {
        closeLightbox();
      }
    });
    listen(lightbox, "close", () => {
      window.clearTimeout(changeTimer);
      document.body.classList.remove("gallery-lightbox-open");
      lightboxImage.removeAttribute("src");
      opener?.focus();
    });
    listen(lightbox, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      }
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    });
    listen(lightbox, "pointerdown", (event) => {
      if (event.pointerType === "touch") touchStartX = event.clientX;
    });
    listen(lightbox, "pointerup", (event) => {
      if (event.pointerType !== "touch" || touchStartX === null) return;
      const distance = event.clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(distance) < 50) return;
      if (distance > 0) showPrevious();
      else showNext();
    });
  }

  const revealSelectors = [
    ".page-hero > *",
    ".hero-copy > *",
    ".section > *",
    ".services .service-card",
    ".page-grid > *",
    ".page-card",
    ".feature-card",
    ".reference-card",
    ".news-card",
    ".news-list-item",
    ".gallery figure",
    ".footer-brand",
    ".footer-columns > *",
    ".footer-bottom",
    ".pdf-downloads",
  ].join(",");
  const items = Array.from(document.querySelectorAll(revealSelectors));
  items.forEach((item) => item.classList.add("reveal"));

  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  items.forEach((item) => observer.observe(item));
  disposers.push(() => observer.disconnect());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initInteractions);
} else {
  initInteractions();
}

const observeRoot = () => {
  let root = document.getElementById("site-root"),
    pending;
  const observer = new MutationObserver((records) => {
    const next = document.getElementById("site-root");
    if (
      next === root &&
      !records.some((record) => root && record.target === root)
    )
      return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      root = document.getElementById("site-root");
      if (root) initInteractions();
      else cleanupInteractions();
    }, 0);
  });
  // Native not-found recovery replaces the entire keyed subtree, including this node.
  observer.observe(document.body, { childList: true, subtree: true });
};
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", observeRoot);
else observeRoot();
