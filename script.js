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
    let inFlight = false;
    const successMessage = contactForm.dataset.successMessage?.trim() ||
      "Takk! Forespørselen er mottatt. Vi tar kontakt så snart vi kan.";
    const showFormStatus = (message, isError = false) => {
      if (!formStatus) return;
      formStatus.textContent = message;
      formStatus.classList.toggle("is-error", isError);
      formStatus.hidden = false;
      formStatus.setAttribute("role", isError ? "alert" : "status");
      formStatus.tabIndex = -1;
      formStatus.focus({preventScroll: true});
      formStatus.scrollIntoView({block: 'center', behavior: 'auto'});
    };

    if (contactForm && query.get("sendt") === "1") {
      showFormStatus(successMessage);
      window.history.replaceState({}, "", window.location.pathname);
    }

    listen(contactForm, "submit", async (event) => {
      event.preventDefault();
      if (contactForm.dataset.previewDisabled || inFlight) return;
      inFlight = true;
      const button = contactForm.querySelector('button[type="submit"]');
      const originalLabel = button?.textContent || "Send forespørsel";

      if (button) {
        button.disabled = true;
        button.textContent = "Sender ...";
      }
      if (formStatus) formStatus.hidden = true;

      try {
        const endpoint = new URL(contactForm.action, window.location.href);
        if (endpoint.origin !== window.location.origin || endpoint.username || endpoint.password || !['/api/forms/contact', '/api/forms/newsletter'].includes(endpoint.pathname) || endpoint.search || endpoint.hash) throw new Error(FORM_SAVE_ERROR);
        const payload = new FormData(contactForm);
        pendingSubmission = submissionIdentity(payload, pendingSubmission);
        payload.set("submissionId", pendingSubmission.id);
        const response = await fetch(endpoint.href, {
          method: "POST",
          body: payload,
          headers: { Accept: "application/json" },
          credentials: 'same-origin', redirect: 'error',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success !== true) {
          throw new Error(
            result.message || "Skjemaet kunne ikke sendes akkurat nå.",
          );
        }

        // Newsletter requests are deliberately stored in the CMS only.
        if (endpoint.pathname === '/api/forms/newsletter') {
          if (result.delivery !== 'stored_only') throw new Error(FORM_STORED_MESSAGE);
          showFormStatus('Forespørselen om nyhetsbrev er lagret. Ingen e-post sendes fra dette skjemaet.');
          return;
        }
        const delivery = await submitFormHandoff(result, [...payload.keys()].filter((name) => !name.startsWith('_') && name !== 'submissionId'));
        if (delivery === 'stored_only') {
          showFormStatus(FORM_STORED_MESSAGE);
          return;
        }

        contactForm.reset();
        pendingSubmission = null;
        showFormStatus(successMessage);
      } catch (error) {
        showFormStatus(
          error.message ||
            "Skjemaet kunne ikke sendes akkurat nå. Prøv igjen, eller send e-post til post@fiskum-sveis.no.",
          true,
        );
      } finally {
        inFlight = false;
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
// FORM_HANDOFF_START
const FORM_SAVE_ERROR = 'Meldingen kunne ikke sendes. Pr\u00f8v igjen, eller kontakt oss direkte.';
const FORM_STORED_MESSAGE = 'Henvendelsen er lagret, men sendingen kunne ikke bekreftes. Kontakt oss direkte ved behov.';

/** Keep retries of identical values on the same private CMS receipt. */
function submissionIdentity(payload, previous, createId = () => crypto.randomUUID()) {
  const fields = [...payload].filter(([name]) => name !== 'submissionId');
  if (fields.some(([, value]) => typeof value !== 'string')) throw new Error(FORM_SAVE_ERROR);
  const snapshot = JSON.stringify(fields);
  return previous?.snapshot === snapshot ? previous : {snapshot, id: createId()};
}

function validateFormHandoff(handoff, allowedFields, origin) {
  if (!handoff || handoff.method !== 'POST' || typeof handoff.action !== 'string') throw new Error(FORM_STORED_MESSAGE);
  const action = new URL(handoff.action);
  const recipient = decodeURIComponent(action.pathname.slice(1));
  if (action.origin !== 'https://formsubmit.co' || action.username || action.password || action.port || action.search || action.hash ||
      !(/^[^\s@<>/\\]+@[^\s@<>/\\]+\.[^\s@<>/\\]+$/.test(recipient) || /^[a-f0-9]{32}$/i.test(recipient))) throw new Error(FORM_STORED_MESSAGE);
  if (!handoff.fields || typeof handoff.fields !== 'object' || Array.isArray(handoff.fields)) throw new Error(FORM_STORED_MESSAGE);
  const fields = Object.entries(handoff.fields);
  const allowed = new Set([...allowedFields, 'email', '_subject', '_url', '_next', '_template', '_captcha', '_cc']);
  if (!fields.length || fields.length > 100) throw new Error(FORM_STORED_MESSAGE);
  for (const [name, value] of fields) {
    if (!allowed.has(name) || ['__proto__', 'constructor', 'prototype'].includes(name) || typeof value !== 'string' || value.length > 10000 || value.includes('\0')) throw new Error(FORM_STORED_MESSAGE);
  }
  for (const name of ['_next', '_url']) {
    if (typeof handoff.fields[name] !== 'string') throw new Error(FORM_STORED_MESSAGE);
    const url = new URL(handoff.fields[name]);
    if (url.origin !== origin || url.username || url.password) throw new Error(FORM_STORED_MESSAGE);
  }
  if (handoff.fields._captcha !== 'false' || handoff.fields._template !== 'table') throw new Error(FORM_STORED_MESSAGE);
  // The server owns the recipient, CC, subject and values; only the documented
  // browser AJAX path differs from the validated native handoff destination.
  return {url: `${action.origin}/ajax${action.pathname}`, fields: Object.fromEntries(fields)};
}

async function submitFormHandoff(result, allowedFields, origin = window.location.origin, fetchRequest = globalThis.fetch) {
  if (!result || result.success !== true) throw new Error(FORM_SAVE_ERROR);
  if (result.delivery === 'stored_only') return 'stored_only';
  try {
    if (result.delivery !== 'handoff_required') throw new Error(FORM_STORED_MESSAGE);
    const handoff = validateFormHandoff(result.handoff, allowedFields, origin);
    const response = await fetchRequest(handoff.url, {
      method: 'POST', headers: {Accept: 'application/json'},
      body: new URLSearchParams(handoff.fields), credentials: 'omit', redirect: 'error',
    });
    const provider = await response.json();
    if (!response.ok || (provider?.success !== true && provider?.success !== 'true')) throw new Error(FORM_STORED_MESSAGE);
    return 'sent';
  } catch { throw new Error(FORM_STORED_MESSAGE); }
}
// FORM_HANDOFF_END
