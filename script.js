document.documentElement.classList.add("js");

const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#primary-nav");

function setMenu(open) {
  document.body.classList.toggle("menu-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
}

toggle?.addEventListener("click", () => {
  setMenu(!document.body.classList.contains("menu-open"));
});

document.addEventListener("click", (event) => {
  const isOpen = document.body.classList.contains("menu-open");
  const target = event.target;
  if (!isOpen || !(target instanceof Node)) return;
  if (nav?.contains(target) || toggle?.contains(target)) return;
  setMenu(false);
});

nav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    setMenu(false);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenu(false);
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 920) {
    setMenu(false);
  }
});

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealSelectors = [
  ".page-hero > *",
  ".hero-copy > *",
  ".hero-strip a",
  ".intro > *",
  ".services article",
  ".split > *",
  ".process-grid > *",
  ".check-list li",
  ".news-grid > *",
  ".news-list-item",
  ".quote-grid > *",
  ".contact > *",
  ".footer-brand",
  ".footer-columns > *",
  ".footer-bottom",
  ".page-grid > *",
  ".page-card",
  ".reference-card",
  ".gallery img",
].join(",");

const revealItems = Array.from(document.querySelectorAll(revealSelectors));
const firstSectionAfterHero = document.querySelector(".hero + .section");
const immediateRevealItems = revealItems.filter((item) => firstSectionAfterHero?.contains(item));
const standardRevealItems = revealItems.filter((item) => !firstSectionAfterHero?.contains(item));

revealItems.forEach((item) => {
  item.classList.add("reveal");
});

standardRevealItems.forEach((item, index) => {
  item.style.setProperty("--reveal-delay", `${Math.min(index % 8, 7) * 55}ms`);
});

immediateRevealItems.forEach((item) => {
  item.style.setProperty("--reveal-delay", "0ms");
});

if (reduceMotion) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else if ("IntersectionObserver" in window) {
  const revealVisible = (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  };

  const standardObserver = new IntersectionObserver(
    (entries, observer) => revealVisible(entries, observer),
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  const immediateObserver = new IntersectionObserver(
    (entries, observer) => revealVisible(entries, observer),
    { rootMargin: "0px", threshold: 0 }
  );

  standardRevealItems.forEach((item) => standardObserver.observe(item));
  immediateRevealItems.forEach((item) => immediateObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const heroSlides = Array.from(document.querySelectorAll(".hero-slide"));
const heroDots = Array.from(document.querySelectorAll(".hero-dots button"));
let heroIndex = 0;
let heroTimer;

function hydrateHeroSlide(index) {
  const image = heroSlides[index]?.querySelector("img[data-src]");
  if (!image) return;
  image.src = image.dataset.src;
  image.removeAttribute("data-src");
}

function setHeroSlide(index) {
  if (!heroSlides.length) return;
  heroIndex = (index + heroSlides.length) % heroSlides.length;
  hydrateHeroSlide(heroIndex);

  heroSlides.forEach((slide, slideIndex) => {
    slide.classList.toggle("is-active", slideIndex === heroIndex);
    if (slideIndex !== heroIndex) {
      slide.querySelector("img")?.style.removeProperty("transform");
    }
  });

  heroDots.forEach((dot, dotIndex) => {
    const active = dotIndex === heroIndex;
    dot.classList.toggle("is-active", active);
    dot.setAttribute("aria-current", active ? "true" : "false");
  });

  updateHeroMotion();
}

function startHeroSlider() {
  if (reduceMotion || heroSlides.length < 2) return;
  window.clearInterval(heroTimer);
  heroTimer = window.setInterval(() => setHeroSlide(heroIndex + 1), 5600);
}

heroDots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    setHeroSlide(index);
    startHeroSlider();
  });
});

let ticking = false;

function updateHeroMotion() {
  ticking = false;
  const activeImage = document.querySelector(".hero-slide.is-active img");
  if (!activeImage || reduceMotion || window.innerWidth < 720) return;
  const offset = Math.min(window.scrollY * 0.05, 28);
  activeImage.style.transform = `scale(1.06) translateY(${offset}px)`;
}

if (heroSlides.length) {
  setHeroSlide(0);
  startHeroSlider();
  window.setTimeout(() => {
    hydrateHeroSlide(1);
  }, 900);
}

if (heroSlides.length && !reduceMotion) {
  updateHeroMotion();
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateHeroMotion);
    },
    { passive: true }
  );
}

document.addEventListener("submit", (event) => {
  if (!(event.target instanceof HTMLFormElement) || !event.target.matches(".contact-form")) return;
  if (event.target.action) return;
  event.preventDefault();
  alert("Skjemaet er ikke konfigurert for sending enda.");
});
