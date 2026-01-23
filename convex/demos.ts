import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { retrier } from "./retrier";
import { ALL_MODELS } from "./models";

// Model ID list for ordering outputs (widened to string[] for indexOf with dynamic model IDs)
const MODEL_IDS: string[] = ALL_MODELS.map(m => m.id);

export const getDemo = query({
  args: { demoId: v.id("aiDemos") },
  handler: async (ctx, args) => {
    const demo = await ctx.db.get(args.demoId);
    if (!demo) return null;
    
    const userId = await auth.getUserId(ctx);
    const isOwner = userId !== null && userId === demo.userId;
    
    const allOutputs = await ctx.db
      .query("modelOutputs")
      .withIndex("by_demo", (q) => q.eq("demoId", args.demoId))
      .collect();
    
    // Group outputs by model, sorted by createdAt ascending (oldest first)
    const outputsByModel = new Map<string, typeof allOutputs>();
    for (const output of allOutputs) {
      const list = outputsByModel.get(output.model) ?? [];
      list.push(output);
      outputsByModel.set(output.model, list);
    }
    // Sort each model's outputs by createdAt ascending
    for (const list of outputsByModel.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt);
    }
    
    // Build outputs with version info for all models that have data
    // (handles client-server version skew - unknown models still get returned)
    const outputs = Array.from(outputsByModel.entries())
      .map(([model, versions]) => {
        // Determine which output to show
        const selectedOutputId = demo.selectedOutputs?.[model];
        let selectedIndex = versions.length - 1; // Default to latest
        if (selectedOutputId) {
          const idx = versions.findIndex(o => o._id === selectedOutputId);
          if (idx !== -1) selectedIndex = idx;
        }
        
        const output = versions[selectedIndex];
        return {
          ...output,
          versionIndex: selectedIndex + 1, // 1-based for display
          versionCount: versions.length,
        };
      })
      // Sort by MODEL_IDS order, unknown models go to end
      .sort((a, b) => {
        const aIndex = MODEL_IDS.indexOf(a.model);
        const bIndex = MODEL_IDS.indexOf(b.model);
        // Unknown models (-1) go to the end
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    
    // For old demos without selectedModels, use default enabled models
    const selectedModels = demo.selectedModels ?? ALL_MODELS.filter(m => m.defaultEnabled).map(m => m.id);
    
    return { ...demo, outputs, selectedModels, isOwner };
  },
});

export const listMyDemos = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    
    const demos = await ctx.db
      .query("aiDemos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    
    return demos.filter((demo) => !demo.archived);
  },
});

export const createDemo = mutation({
  args: { prompt: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    // Get default-enabled models
    const defaultModels = ALL_MODELS.filter(m => m.defaultEnabled).map(m => m.id);
    
    const demoId = await ctx.db.insert("aiDemos", {
      userId,
      prompt: args.prompt,
      createdAt: Date.now(),
      selectedModels: defaultModels,
    });
    
    // Create pending outputs for default-enabled models and schedule AI generation
    // for each. Uses the action retrier to retry on transient failures (network
    // errors, API rate limits, etc.) with exponential backoff.
    for (const model of defaultModels) {
      const outputId = await ctx.db.insert("modelOutputs", {
        demoId,
        model,
        html: "",
        css: "",
        status: "pending",
        createdAt: Date.now(),
      });

      await retrier.run(ctx, internal.generate.generateSingleModel, {
        outputId,
        prompt: args.prompt,
        model,
      });
    }
    
    return demoId;
  },
});

export const updatePrompt = mutation({
  args: { demoId: v.id("aiDemos"), prompt: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    const demo = await ctx.db.get(args.demoId);
    if (!demo) throw new Error("Demo not found");
    if (demo.userId !== userId) throw new Error("Not authorized");
    
    await ctx.db.patch(args.demoId, { prompt: args.prompt });
  },
});

export const archiveDemo = mutation({
  args: { demoId: v.id("aiDemos") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    const demo = await ctx.db.get(args.demoId);
    if (!demo) throw new Error("Demo not found");
    if (demo.userId !== userId) throw new Error("Not authorized");
    
    await ctx.db.patch(args.demoId, { archived: true });
  },
});

export const updateSelectedModels = mutation({
  args: { demoId: v.id("aiDemos"), selectedModels: v.array(v.string()) },
  handler: async (ctx, args) => {
    const demo = await ctx.db.get(args.demoId);
    if (!demo) throw new Error("Demo not found");
    
    await ctx.db.patch(args.demoId, { selectedModels: args.selectedModels });
  },
});

export const createNewOutputs = mutation({
  args: { demoId: v.id("aiDemos"), models: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    const demo = await ctx.db.get(args.demoId);
    if (!demo) throw new Error("Demo not found");
    if (demo.userId !== userId) throw new Error("Not authorized");

    // Clear selected versions for regenerated models so they default to latest
    if (demo.selectedOutputs) {
      const updatedSelectedOutputs = { ...demo.selectedOutputs };
      for (const model of args.models) {
        delete updatedSelectedOutputs[model];
      }
      await ctx.db.patch(args.demoId, { selectedOutputs: updatedSelectedOutputs });
    }

    // Create new pending outputs and schedule AI generation for each model.
    // Uses the action retrier to retry on transient failures with exponential backoff.
    for (const model of args.models) {
      const outputId = await ctx.db.insert("modelOutputs", {
        demoId: args.demoId,
        model,
        html: "",
        css: "",
        status: "pending",
        createdAt: Date.now(),
      });

      await retrier.run(ctx, internal.generate.generateSingleModel, {
        outputId,
        prompt: demo.prompt,
        model,
      });
    }
  },
});

export const createSingleModelOutput = mutation({
  args: { demoId: v.id("aiDemos"), model: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    const demo = await ctx.db.get(args.demoId);
    if (!demo) throw new Error("Demo not found");
    if (demo.userId !== userId) throw new Error("Not authorized");

    // Clear selected version for this model so it defaults to the new (latest) one
    if (demo.selectedOutputs?.[args.model]) {
      const updatedSelectedOutputs = { ...demo.selectedOutputs };
      delete updatedSelectedOutputs[args.model];
      await ctx.db.patch(args.demoId, { selectedOutputs: updatedSelectedOutputs });
    }

    const outputId = await ctx.db.insert("modelOutputs", {
      demoId: args.demoId,
      model: args.model,
      html: "",
      css: "",
      status: "pending",
      createdAt: Date.now(),
    });

    // Schedule AI generation with retries on transient failures (network errors,
    // API rate limits, etc.) via the action retrier.
    await retrier.run(ctx, internal.generate.generateSingleModel, {
      outputId,
      prompt: demo.prompt,
      model: args.model,
    });

    return outputId;
  },
});

export const navigateModelVersion = mutation({
  args: { 
    demoId: v.id("aiDemos"), 
    model: v.string(),
    direction: v.union(v.literal("prev"), v.literal("next")),
  },
  handler: async (ctx, args) => {
    const demo = await ctx.db.get(args.demoId);
    if (!demo) throw new Error("Demo not found");
    
    // Get all outputs for this model, sorted by createdAt ascending
    const allOutputs = await ctx.db
      .query("modelOutputs")
      .withIndex("by_demo", (q) => q.eq("demoId", args.demoId))
      .collect();
    
    const versions = allOutputs
      .filter(o => o.model === args.model)
      .sort((a, b) => a.createdAt - b.createdAt);
    
    if (versions.length <= 1) return; // Nothing to navigate
    
    // Find current selected index
    const currentSelectedId = demo.selectedOutputs?.[args.model];
    let currentIndex = versions.length - 1; // Default to latest
    if (currentSelectedId) {
      const idx = versions.findIndex(o => o._id === currentSelectedId);
      if (idx !== -1) currentIndex = idx;
    }
    
    // Calculate new index
    const newIndex = args.direction === "prev" 
      ? Math.max(0, currentIndex - 1)
      : Math.min(versions.length - 1, currentIndex + 1);
    
    if (newIndex === currentIndex) return; // Already at boundary
    
    // Update selectedOutputs
    const selectedOutputs = { ...demo.selectedOutputs, [args.model]: versions[newIndex]._id };
    await ctx.db.patch(args.demoId, { selectedOutputs });
  },
});

export const updateModelOutput = mutation({
  args: {
    outputId: v.id("modelOutputs"),
    html: v.optional(v.string()),
    css: v.optional(v.string()),
    status: v.optional(v.union(v.literal("pending"), v.literal("generating"), v.literal("complete"), v.literal("error"))),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { outputId, ...updates } = args;
    const filteredUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    await ctx.db.patch(outputId, filteredUpdates);
  },
});
