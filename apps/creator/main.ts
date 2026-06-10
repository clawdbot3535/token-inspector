import { createApp } from "vue";
import ui from "@nuxt/ui/vue-plugin";
import Creator from "./Creator.vue";
import "../../src/app/style.css";

const app = createApp(Creator);
app.use(ui);
app.mount("#creator");
