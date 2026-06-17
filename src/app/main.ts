import { createApp } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import ui from "@nuxt/ui/vue-plugin";
import App from "./App.vue";
import "./style.css";

const app = createApp(App);
// Nuxt UI's router-link-based components (e.g. NavigationMenu) require a router to
// provide the route-location injection. The inspector has no real routes, so a
// memory-history router with an empty route set satisfies the dependency.
app.use(createRouter({ history: createMemoryHistory(), routes: [] }));
app.use(ui);
app.mount("#app");
