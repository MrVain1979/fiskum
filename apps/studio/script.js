const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#primary-nav");

function setMenu(open) {
  document.body.classList.toggle("menu-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
}

toggle?.addEventListener("click", () => {
  setMenu(!document.body.classList.contains("menu-open"));
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

document.querySelector(".contact-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  if (button) {
    button.textContent = "Takk, forespørselen er klar";
    button.setAttribute("disabled", "");
  }
});
