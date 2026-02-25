import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

const presence = new Presence(components.presence);
const ANONYMOUS_VIEWER_PREFIX = "anonymous:";
const ANONYMOUS_VIEWER_ID_PATTERN = /^anonymous:[a-z0-9]{8,32}$/;

type ViewerProfile = {
  name?: string;
  email?: string;
  image?: string;
} | null;

function getViewerName(
  user: ViewerProfile,
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

function isAnonymousViewerId(userId: string): boolean {
  return ANONYMOUS_VIEWER_ID_PATTERN.test(userId);
}

function getAnonymousViewerName(userId: string): string {
  const shortId = userId
    .slice(ANONYMOUS_VIEWER_PREFIX.length)
    .slice(-6)
    .toUpperCase();
  return `Anonymous ${shortId}`;
}

function getPresenceUserId(
  authenticatedUserId: Id<"users"> | null,
  requestedUserId: string,
): string | null {
  if (authenticatedUserId) {
    return authenticatedUserId;
  }
  return isAnonymousViewerId(requestedUserId) ? requestedUserId : null;
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
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    const authenticatedUserId = await auth.getUserId(ctx);
    const presenceUserId = getPresenceUserId(authenticatedUserId, userId);
    if (!presenceUserId) {
      return { roomToken: "", sessionToken: "" };
    }

    return await presence.heartbeat(
      ctx,
      roomId,
      presenceUserId,
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
    const roomPresence = await presence.list(ctx, args.roomToken, 24);
    const namedPresence = await Promise.all(
      roomPresence.map(async (entry) => {
        if (isAnonymousViewerId(entry.userId)) {
          return {
            ...entry,
            name: getAnonymousViewerName(entry.userId),
          };
        }

        const user = await ctx.db.get(entry.userId as Id<"users">);
        return {
          ...entry,
          name: getViewerName(user, entry.userId),
          image: user?.image,
        };
      }),
    );
    return namedPresence;
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await presence.disconnect(ctx, args.sessionToken);
  },
});
