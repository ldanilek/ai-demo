import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

const presence = new Presence(components.presence);

function getViewerName(
  user: { name?: string; email?: string } | null,
  fallbackId: string,
): string {
  const trimmedName = user?.name?.trim();
  if (trimmedName) {
    return trimmedName;
  }
  const emailAlias = user?.email?.split("@")[0]?.trim();
  if (emailAlias) {
    return emailAlias;
  }
  return `Guest ${fallbackId.slice(-4)}`;
}

export const currentViewer = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.string(),
      name: v.string(),
      image: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    return {
      userId,
      name: getViewerName(user, userId),
      image: user?.image,
    };
  },
});

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({
    roomToken: v.string(),
    sessionToken: v.string(),
  }),
  handler: async (ctx, { roomId, sessionId, interval }) => {
    const authenticatedUserId = await auth.getUserId(ctx);
    if (!authenticatedUserId) {
      return { roomToken: "", sessionToken: "" };
    }

    return await presence.heartbeat(
      ctx,
      roomId,
      authenticatedUserId,
      sessionId,
      interval,
    );
  },
});

export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(
    v.object({
      userId: v.string(),
      online: v.boolean(),
      lastDisconnected: v.number(),
      data: v.optional(v.any()),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const authenticatedUserId = await auth.getUserId(ctx);
    if (!authenticatedUserId) {
      return [];
    }

    const roomPresence = await presence.list(ctx, args.roomToken, 24);
    return await Promise.all(
      roomPresence.map(async (entry) => {
        const user = await ctx.db.get(entry.userId as Id<"users">);
        return {
          ...entry,
          name: getViewerName(user, entry.userId),
          image: user?.image,
        };
      }),
    );
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await presence.disconnect(ctx, args.sessionToken);
  },
});
