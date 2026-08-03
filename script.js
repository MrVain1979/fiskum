document.documentElement.classList.add("js");

function initInteractions() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#primary-nav");
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
  };

  toggle?.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  nav?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) setMenu(false);
  });

  const contactForm = document.querySelector(".contact-form");
  const query = new URLSearchParams(window.location.search);
  const formStatus = contactForm?.querySelector(".form-status");
  const showFormStatus = (message, isError = false) => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.classList.toggle("is-error", isError);
    formStatus.hidden = false;
    formStatus.setAttribute("role", isError ? "alert" : "status");
  };

  if (contactForm && query.get("sendt") === "1") {
    showFormStatus("Takk! Forespørselen er sendt. Vi tar kontakt så snart vi kan.");
    window.history.replaceState({}, "", window.location.pathname);
  }

  contactForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = contactForm.querySelector('button[type="submit"]');
    const originalLabel = button?.textContent || "Send forespørsel";
    const endpoint = contactForm.action.replace("formsubmit.co/", "formsubmit.co/ajax/");

    if (button) {
      button.disabled = true;
      button.textContent = "Sender ...";
    }
    if (formStatus) formStatus.hidden = true;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: new FormData(contactForm),
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === "false" || result.success === false) {
        throw new Error("Form submission failed");
      }

      contactForm.reset();
      showFormStatus("Takk! Forespørselen er sendt. Vi tar kontakt så snart vi kan.");
    } catch {
      showFormStatus(
        "Beklager, skjemaet kunne ikke sendes akkurat nå. Prøv igjen, eller send e-post til post@fiskum-sveis.no.",
        true,
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const heroSlides = Array.from(document.querySelectorAll(".hero-slide"));
  const heroDots = Array.from(document.querySelectorAll(".hero-dots button"));
  let heroIndex = 0;
  let heroTimer;

  const hydrateHeroSlide = (index) => {
    const image = heroSlides[index]?.querySelector("img[data-src]");
    if (!image) return;
    image.src = image.dataset.src;
    image.removeAttribute("data-src");
  };

  const updateHeroMotion = () => {
    const activeImage = document.querySelector(".hero-slide.is-active img");
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
      if (slideIndex !== heroIndex) slide.querySelector("img")?.style.removeProperty("transform");
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
    dot.addEventListener("click", () => {
      setHeroSlide(index);
      startHeroSlider();
    });
  });

  if (heroSlides.length) {
    setHeroSlide(0);
    startHeroSlider();
    window.setTimeout(() => hydrateHeroSlide(1), 900);
  }

  if (heroSlides.length && !reduceMotion) {
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
          ticking = false;
          updateHeroMotion();
        });
      },
      { passive: true },
    );
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
    ".gallery img",
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initInteractions);
} else {
  initInteractions();
}
