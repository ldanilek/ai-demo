import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// All available models with default enabled state
export const ALL_MODELS = [
  { id: "gpt-4o", defaultEnabled: true },
  { id: "gpt-4o-mini", defaultEnabled: false },
  { id: "gpt-5.2", defaultEnabled: true },
  { id: "claude-opus-4-5-20251101", defaultEnabled: true },
  { id: "claude-opus-4-1-20250805", defaultEnabled: false },
  { id: "claude-sonnet-4-20250514", defaultEnabled: true },
  { id: "claude-3-5-haiku-latest", defaultEnabled: true },
  { id: "claude-haiku-4-5-20251001", defaultEnabled: false },
  { id: "claude-sonnet-4-5-20250929", defaultEnabled: false },
  { id: "gemini-2.5-flash", defaultEnabled: true },
  { id: "gemini-3-flash-preview", defaultEnabled: true },
  { id: "gemini-3-pro-preview", defaultEnabled: false },
  { id: "grok-4", defaultEnabled: true },
] as const;

// Legacy export for backward compatibility
export const MODELS = ALL_MODELS.map(m => m.id);

export const getDemo = query({
  args: { demoId: v.id("aiDemos") },
  handler: async (ctx, args) => {
    const demo = await ctx.db.get(args.demoId);
    if (!demo) return null;
    
    const allOutputs = await ctx.db
      .query("modelOutputs")
      .withIndex("by_demo", (q) => q.eq("demoId", args.demoId))
      .collect();
    
    // Group by model and keep only the latest output per model
    const latestByModel = new Map<string, typeof allOutputs[0]>();
    for (const output of allOutputs) {
      const existing = latestByModel.get(output.model);
      if (!existing || output.createdAt > existing.createdAt) {
        latestByModel.set(output.model, output);
      }
    }
    
    // Return outputs in consistent model order
    const outputs = MODELS
      .map((model) => latestByModel.get(model))
      .filter((o): o is NonNullable<typeof o> => o !== undefined);
    
    // For old demos without selectedModels, use default enabled models
    const selectedModels = demo.selectedModels ?? ALL_MODELS.filter(m => m.defaultEnabled).map(m => m.id);
    
    return { ...demo, outputs, selectedModels };
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
    
    // Create pending outputs for default-enabled models
    for (const model of defaultModels) {
      await ctx.db.insert("modelOutputs", {
        demoId,
        model,
        html: "",
        css: "",
        status: "pending",
        createdAt: Date.now(),
      });
    }
    
    return demoId;
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
    // Create new pending outputs for each specified model
    for (const model of args.models) {
      await ctx.db.insert("modelOutputs", {
        demoId: args.demoId,
        model,
        html: "",
        css: "",
        status: "pending",
        createdAt: Date.now(),
      });
    }
  },
});

export const createSingleModelOutput = mutation({
  args: { demoId: v.id("aiDemos"), model: v.string() },
  handler: async (ctx, args) => {
    const outputId = await ctx.db.insert("modelOutputs", {
      demoId: args.demoId,
      model: args.model,
      html: "",
      css: "",
      status: "pending",
      createdAt: Date.now(),
    });
    return outputId;
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
