import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  checkPrompt,
  checkSite,
  finalizeSiteCheck,
  weeklyCronJob,
} from "@/inngest/functions/check-site";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [checkSite, checkPrompt, finalizeSiteCheck, weeklyCronJob],
});
