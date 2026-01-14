import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  
  // AI Demo - the main entity a user creates
  aiDemos: defineTable({
    userId: v.id("users"),
    prompt: v.string(),
    createdAt: v.number(),
    archived: v.optional(v.boolean()),
    selectedModels: v.optional(v.array(v.string())), // Models to display for this demo
    // Map of model id -> selected outputId for version navigation
    selectedOutputs: v.optional(v.record(v.string(), v.id("modelOutputs"))),
  }).index("by_user", ["userId"]),
  
  // Individual model outputs for a demo
  modelOutputs: defineTable({
    demoId: v.id("aiDemos"),
    model: v.string(), // e.g. "gpt-4o", "claude-3-opus", etc.
    html: v.string(),
    css: v.string(),
    status: v.union(v.literal("pending"), v.literal("generating"), v.literal("complete"), v.literal("error")),
    error: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_demo", ["demoId"]),
});
