import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "../sanity-studio/node_modules/jsdom/lib/api.js";
import { documentBody } from "../lib/render-content.mjs";
import { testSettings, testImage } from "./support/fixtures.mjs";
const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const html = (count) =>
  documentBody(
    {
      settings: testSettings,
      document: {
        _type: "homePage",
        title: "Forsiden",
        sections: [
          {
            _type: "heroCarousel",
            _key: "hero",
            title: "Bildetopp",
            images: Array.from({ length: count }, (_, index) => ({
              ...testImage,
              _key: "photo-" + index,
            })),
          },
        ],
      },
      services: [],
    },
    "/",
  );
const flush = () => new Promise((resolve) => setTimeout(resolve, 25));
for (const reduceMotion of [true, false])
  test(`whole-root404 recovery restores interactions and reveal visibility (reduced motion: ${reduceMotion})`, async () => {
    const dom = new JSDOM(
      '<!doctype html><body><div id="site-root">' + html(3) + "</div></body>",
      {
        runScripts: "outside-only",
        pretendToBeVisual: true,
        url: "https://example.test",
      },
    );
    const { window } = dom;
    const observers = [];
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      constructor(...args) {
        super(...args);
        observers.push(this);
      }
    };
    window.matchMedia = () => ({ matches: reduceMotion });
    const revealed = [];
    window.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(target) {
        revealed.push(target);
        this.callback([{ target, isIntersecting: true }]);
      }
      unobserve() {}
      disconnect() {}
    };
    const errors = [];
    window.addEventListener("error", (event) => errors.push(event.error));
    window.eval(source);
    try {
      await flush();
      window.document.querySelectorAll(".hero-dots button")[2].click();
      assert.equal(
        window.document
          .querySelectorAll(".hero-slide")[2]
          .classList.contains("is-active"),
        true,
      );
      window.document.querySelector(".menu-toggle").click();
      assert.equal(window.document.body.classList.contains("menu-open"), true);
      const fallback = window.document.createElement("main");
      fallback.id = "temporary-404";
      window.document.getElementById("site-root").replaceWith(fallback);
      await flush();
      assert.equal(window.document.body.classList.contains("menu-open"), false);
      for (const count of [1, 0, 2]) {
        const root = window.document.createElement("div");
        root.id = "site-root";
        root.innerHTML = html(count);
        (window.document.getElementById("site-root") || fallback).replaceWith(
          root,
        );
        await flush();
        const heading = root.querySelector(".hero-copy h1");
        assert.ok(heading.classList.contains("is-visible"));
        if (!reduceMotion) assert.ok(revealed.includes(heading));
        const dots = root.querySelectorAll(".hero-dots button");
        if (dots.length) {
          dots[dots.length - 1].click();
          assert.equal(
            root
              .querySelectorAll(".hero-slide")
              [dots.length - 1].classList.contains("is-active"),
            true,
          );
        }
        root.append(window.document.createElement("span"));
        await flush();
        root.querySelector(".menu-toggle").click();
        assert.equal(
          window.document.body.classList.contains("menu-open"),
          true,
        );
        root.querySelector(".menu-toggle").click();
        assert.equal(
          window.document.body.classList.contains("menu-open"),
          false,
        );
      }
      assert.deepEqual(errors, []);
    } finally {
      for (const observer of observers) observer.disconnect();
      window.close();
    }
  });
