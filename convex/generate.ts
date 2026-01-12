"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const xai = createXai({
  apiKey: process.env.XAI_API_KEY,
});

function getModelProvider(modelName: string) {
  if (modelName.startsWith("gpt")) {
    return openai(modelName);
  } else if (modelName.startsWith("claude")) {
    return anthropic(modelName);
  } else if (modelName.startsWith("gemini")) {
    return google(modelName);
  } else if (modelName.startsWith("grok")) {
    return xai(modelName);
  }
  throw new Error(`Unknown model: ${modelName}`);
}

const SYSTEM_PROMPT = `You are a creative HTML/CSS/JavaScript generator. Given a user's description, generate beautiful, functional, interactive code.

IMPORTANT RULES:
1. Return ONLY valid HTML, CSS, and optionally JavaScript
2. The HTML should be a complete snippet that can be rendered inside a container div
3. Do NOT include <html>, <head>, or <body> tags - just the content
4. Use modern CSS with flexbox/grid for layouts
5. Make it visually appealing with good typography and spacing
6. Keep the code concise but impressive
7. Use CSS animations and transitions for visual effects
8. Use JavaScript for interactivity, real-time updates (like clocks), user input handling, etc.
9. All styles should be in a <style> tag at the beginning
10. All scripts should be in a <script> tag at the end

Format your response EXACTLY like this:
<style>
/* Your CSS here */
</style>
<div class="container">
  <!-- Your HTML here -->
</div>
<script>
// Your JavaScript here (optional)
</script>`;

export const generateForDemo = action({
  args: { demoId: v.id("aiDemos") },
  handler: async (ctx, args) => {
    const demo = await ctx.runQuery(api.demos.getDemo, { demoId: args.demoId });
    if (!demo) throw new Error("Demo not found");
    
    // Run all model generations in parallel, don't fail if one fails
    const promises = demo.outputs.map((output) =>
      ctx.runAction(internal.generate.generateSingleModel, {
        outputId: output._id,
        prompt: demo.prompt,
        model: output.model,
      })
    );
    
    await Promise.allSettled(promises);
  },
});

export const regenerateSingleModel = action({
  args: { demoId: v.id("aiDemos"), model: v.string() },
  handler: async (ctx, args) => {
    const demo = await ctx.runQuery(api.demos.getDemo, { demoId: args.demoId });
    if (!demo) throw new Error("Demo not found");
    
    // Create a new output for this model
    const outputId = await ctx.runMutation(api.demos.createSingleModelOutput, {
      demoId: args.demoId,
      model: args.model,
    });
    
    // Generate for this single model
    await ctx.runAction(internal.generate.generateSingleModel, {
      outputId,
      prompt: demo.prompt,
      model: args.model,
    });
  },
});

// Generate for an existing output (called after creating the output from frontend)
export const generateForOutput = action({
  args: { 
    outputId: v.id("modelOutputs"),
    prompt: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.generate.generateSingleModel, {
      outputId: args.outputId,
      prompt: args.prompt,
      model: args.model,
    });
  },
});

export const generateSingleModel = internalAction({
  args: {
    outputId: v.id("modelOutputs"),
    prompt: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    // Mark as generating
    await ctx.runMutation(api.demos.updateModelOutput, {
      outputId: args.outputId,
      status: "generating",
    });
    
    const modelProvider = getModelProvider(args.model);
    
    const generate = async () => {
      const result = await generateText({
        model: modelProvider,
        system: SYSTEM_PROMPT,
        prompt: args.prompt,
      });
      
      let content = result.text;
      
      // Strip markdown code fences if present (some models wrap output in ```html ... ```)
      content = content.replace(/^```(?:html|css|javascript|js)?\n?/i, "").replace(/\n?```$/,"");
      
      // Parse CSS and HTML from response
      const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/);
      const css = styleMatch ? styleMatch[1].trim() : "";
      const html = content.replace(/<style>[\s\S]*?<\/style>/, "").trim();
      
      await ctx.runMutation(api.demos.updateModelOutput, {
        outputId: args.outputId,
        html,
        css,
        status: "complete",
      });
    };
    
    await generate().catch(async (err: Error) => {
      await ctx.runMutation(api.demos.updateModelOutput, {
        outputId: args.outputId,
        status: "error",
        error: err.message,
      });
    });
  },
});
