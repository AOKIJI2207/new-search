import { bootPlatform } from "./platform.js";

bootPlatform().catch((error) => {
  document.querySelector("#app").innerHTML = `
    <main class="app-shell">
      <article class="panel empty-state">${error.message}</article>
    </main>
  `;
});
