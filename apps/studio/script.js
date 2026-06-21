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

revealItems.forEach((item, index) => {
  item.classList.add("reveal");
  item.style.setProperty("--reveal-delay", `${Math.min(index % 8, 7) * 55}ms`);
});

if (reduceMotion) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const heroImage = document.querySelector(".hero-media img");
let ticking = false;

function updateHeroMotion() {
  ticking = false;
  if (!heroImage || reduceMotion || window.innerWidth < 720) return;
  const offset = Math.min(window.scrollY * 0.05, 28);
  heroImage.style.transform = `scale(1.06) translateY(${offset}px)`;
}

if (heroImage && !reduceMotion) {
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

document.querySelector(".contact-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  if (button) {
    button.textContent = "Takk, forespørselen er klar";
    button.setAttribute("disabled", "");
  }
});
