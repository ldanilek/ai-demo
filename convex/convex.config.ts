import { defineApp } from "convex/server";
import actionRetrier from "@convex-dev/action-retrier/convex.config.js";
import presence from "@convex-dev/presence/convex.config.js";

const app = defineApp();
app.use(actionRetrier);
app.use(presence);

export default app;
