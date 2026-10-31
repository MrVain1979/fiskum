import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.nativeRefreshFixture = { refreshes: 0, sdkProps: null };
const installedClient = new URL("../node_modules/next-sanity/dist/VisualEditing.js", import.meta.url).href;
const react = new URL("../node_modules/react/index.js", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    let source;
    if (specifier === "next/navigation")
      source = `const router={refresh:()=>globalThis.nativeRefreshFixture.refreshes++,push:()=>{},replace:()=>{},back:()=>{}};export const useRouter=()=>router;export const usePathname=()=>'/fixture/';export const useSearchParams=()=>new URLSearchParams();`;
    if (specifier === "next-sanity/visual-editing/server-actions")
      source = `export const perspectiveChangeAction=async()=>{};export const variantChangeAction=async()=>{};`;
    // Resolve Next's dynamic loading boundary directly for this Node SSR adapter;
    // the installed SDK's actual client refresh/history implementation still runs.
    if (specifier === "next-sanity/visual-editing/client-component")
      source = `export {default as VisualEditing} from ${JSON.stringify(installedClient)};`;
    if (specifier === "@sanity/visual-editing/react")
      source = `import {createElement} from ${JSON.stringify(react)};export function VisualEditing(props){globalThis.nativeRefreshFixture.sdkProps=props;return createElement('span',{'data-native-sdk':'mounted'})}`;
    return source === undefined ? next(specifier, context) : { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
  },
  load(url, context, next) {
    if (!url.endsWith("/app/components/NativeVisualEditing.tsx")) return next(url, context);
    return { format: "module", source: transpileModule(readFileSync(new URL(url), "utf8"), { compilerOptions: { module: ModuleKind.ESNext, jsx: JsxEmit.ReactJSX } }).outputText, shortCircuit: true };
  },
});
const { default: NativeVisualEditing } = await import("../app/components/NativeVisualEditing.tsx");
const { VisualEditing } = await import("next-sanity/visual-editing");

test("installed SDK default ignores mutations, while the compiled native wrapper refreshes manual and mutation events", async () => {
  renderToStaticMarkup(createElement(VisualEditing));
  const originalDebug = console.debug;
  console.debug = () => {};
  try {
    assert.equal(globalThis.nativeRefreshFixture.sdkProps.refresh({ source: "mutation" }), false);
    assert.equal(globalThis.nativeRefreshFixture.refreshes, 0);
  } finally {
    console.debug = originalDebug;
  }
  const html = renderToStaticMarkup(createElement(NativeVisualEditing));
  assert.match(html, /data-native-sdk="mounted"/);
  const props = globalThis.nativeRefreshFixture.sdkProps;
  assert.equal(typeof props.onPerspectiveChange, "function", "Native SDK perspective actions remain installed");
  assert.equal(typeof props.onVariantChange, "function");
  for (const source of ["mutation", "manual"]) {
    const before = globalThis.nativeRefreshFixture.refreshes;
    const completion = props.refresh({ source });
    assert.ok(completion instanceof Promise, `${source} supplies the SDK completion promise`);
    assert.equal(globalThis.nativeRefreshFixture.refreshes, before + 1);
    await completion;
  }
});
