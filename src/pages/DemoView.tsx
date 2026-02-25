import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import usePresence from "@convex-dev/presence/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ALL_MODELS,
  getModelName,
  getModelProvider,
  isKnownModel,
  isModelGeneratable,
} from "../models";

// Get provider key for CSS class (e.g., "openai", "anthropic")
function getProviderKey(modelId: string): string {
  const provider = getModelProvider(modelId);
  if (!provider) return "unknown";
  return provider.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Get provider display name (e.g., "OpenAI", "Anthropic")
function getProviderName(modelId: string): string {
  return getModelProvider(modelId);
}

const PRESENCE_COLORS = [
  "#00f5d4",
  "#9b5de5",
  "#f15bb5",
  "#4285f4",
  "#10a37f",
  "#e53e3e",
  "#ff8a00",
];

function getPresenceColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

function getInitials(name: string | undefined): string {
  if (!name) return "";
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);

  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

const ANONYMOUS_VIEWER_PREFIX = "anonymous:";
const ANONYMOUS_VIEWER_STORAGE_KEY = "ai-demo-anonymous-viewer-id";

function createAnonymousViewerId(): string {
  const randomToken = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${ANONYMOUS_VIEWER_PREFIX}${randomToken}`;
}

function getAnonymousViewerId(): string {
  const storedId = window.localStorage.getItem(ANONYMOUS_VIEWER_STORAGE_KEY);
  if (storedId && storedId.startsWith(ANONYMOUS_VIEWER_PREFIX)) {
    return storedId;
  }

  const newAnonymousId = createAnonymousViewerId();
  window.localStorage.setItem(ANONYMOUS_VIEWER_STORAGE_KEY, newAnonymousId);
  return newAnonymousId;
}

function copyLinkToClipboard(link: string): boolean {
  const existingSelection = document.getSelection();
  const selectionRanges: Range[] = [];
  if (existingSelection) {
    for (let index = 0; index < existingSelection.rangeCount; index += 1) {
      selectionRanges.push(existingSelection.getRangeAt(index).cloneRange());
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = link;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (existingSelection) {
    existingSelection.removeAllRanges();
    selectionRanges.forEach((range) => existingSelection.addRange(range));
  }

  return copied;
}

async function copyLink(link: string): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText === "function") {
    return navigator.clipboard.writeText(link).then(
      () => true,
      () => copyLinkToClipboard(link),
    );
  }

  return copyLinkToClipboard(link);
}

export function DemoView() {
  const { demoId } = useParams<{ demoId: string }>();
  const { isAuthenticated } = useConvexAuth();
  const [anonymousViewerId] = useState(() => getAnonymousViewerId());
  const currentViewer = useQuery(
    api.presence.currentViewer,
    isAuthenticated ? {} : "skip",
  );
  const viewerId = isAuthenticated
    ? (currentViewer?.userId ?? "viewer:loading")
    : anonymousViewerId;
  const presenceState = usePresence(
    api.presence,
    demoId ? `demo:${demoId}` : "demo:loading",
    viewerId,
    5000,
  );
  const demo = useQuery(api.demos.getDemo, { 
    demoId: demoId as Id<"aiDemos"> 
  });
  const updateSelectedModels = useMutation(api.demos.updateSelectedModels).withOptimisticUpdate(
    (localStore, args) => {
      const currentDemo = localStore.getQuery(api.demos.getDemo, { demoId: args.demoId });
      if (currentDemo) {
        localStore.setQuery(api.demos.getDemo, { demoId: args.demoId }, {
          ...currentDemo,
          selectedModels: args.selectedModels,
        });
      }
    }
  );
  const createNewOutputs = useMutation(api.demos.createNewOutputs).withOptimisticUpdate(
    (localStore, args) => {
      const currentDemo = localStore.getQuery(api.demos.getDemo, { demoId: args.demoId });
      if (!currentDemo) return;
      
      // Add pending outputs for each model being regenerated
      const existingOutputs = currentDemo.outputs.filter(o => !args.models.includes(o.model));
      const pendingOutputs = args.models.map(model => ({
        _id: `pending-${model}` as Id<"modelOutputs">,
        _creationTime: 0,
        demoId: args.demoId,
        model,
        html: "",
        css: "",
        status: "pending" as const,
        createdAt: 0,
        versionIndex: 1,
        versionCount: 1,
      }));
      
      localStore.setQuery(api.demos.getDemo, { demoId: args.demoId }, {
        ...currentDemo,
        outputs: [...existingOutputs, ...pendingOutputs],
      });
    }
  );
  const createSingleModelOutput = useMutation(api.demos.createSingleModelOutput).withOptimisticUpdate(
    (localStore, args) => {
      const currentDemo = localStore.getQuery(api.demos.getDemo, { demoId: args.demoId });
      if (!currentDemo) return;
      
      // Replace existing output for this model with pending, or add new pending output
      const existingOutputs = currentDemo.outputs.filter(o => o.model !== args.model);
      const pendingOutput = {
        _id: `pending-${args.model}` as Id<"modelOutputs">,
        _creationTime: 0,
        demoId: args.demoId,
        model: args.model,
        html: "",
        css: "",
        status: "pending" as const,
        createdAt: 0,
        versionIndex: 1,
        versionCount: 1,
      };
      
      localStore.setQuery(api.demos.getDemo, { demoId: args.demoId }, {
        ...currentDemo,
        outputs: [...existingOutputs, pendingOutput],
      });
    }
  );
  const navigateModelVersion = useMutation(api.demos.navigateModelVersion);
  const [viewingSource, setViewingSource] = useState<{ model: string; css: string; html: string } | null>(null);
  const [fullscreenOutput, setFullscreenOutput] = useState<{ model: string; css: string; html: string } | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    window.matchMedia("(max-width: 768px)").matches,
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const shareCopiedTimeoutRef = useRef<number | null>(null);
  const updatePrompt = useMutation(api.demos.updatePrompt);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showModelPicker) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModelPicker]);

  useEffect(() => {
    const mediaQueryList = window.matchMedia("(max-width: 768px)");
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    mediaQueryList.addEventListener("change", handleViewportChange);
    return () => mediaQueryList.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    return () => {
      if (shareCopiedTimeoutRef.current !== null) {
        window.clearTimeout(shareCopiedTimeoutRef.current);
      }
    };
  }, []);

  // Use selectedModels from Convex
  const selectedModels = Array.from(new Set(demo?.selectedModels ?? []));
  const selectedModelSet = new Set(selectedModels);
  const selectedGeneratableModels = selectedModels.filter(isModelGeneratable);
  const activeViewers = (presenceState ?? []).filter((viewer) => viewer.online);
  const maxVisiblePresenceAvatars = isMobileViewport ? 3 : 7;
  const overflowViewerCount = Math.max(
    activeViewers.length - maxVisiblePresenceAvatars,
    0,
  );
  const legacySelectedModels = selectedModels.filter(
    modelId => !isModelGeneratable(modelId) && isKnownModel(modelId)
  );

  const toggleModel = async (modelId: string) => {
    if (!demoId || !demo) return;
    const newSelected = new Set(selectedModels);
    if (newSelected.has(modelId)) {
      newSelected.delete(modelId);
    } else {
      newSelected.add(modelId);
    }
    await updateSelectedModels({ 
      demoId: demoId as Id<"aiDemos">, 
      selectedModels: Array.from(newSelected) 
    });
  };

  const handleRegenerate = async () => {
    if (!demoId || selectedGeneratableModels.length === 0) return;
    // createNewOutputs creates the output records and schedules AI generation
    // for each one internally (via ctx.scheduler.runAfter) — no separate
    // action call needed from the client.
    await createNewOutputs({
      demoId: demoId as Id<"aiDemos">,
      models: selectedGeneratableModels,
    });
  };

  const handleGenerateSingleModel = async (model: string) => {
    if (!demoId || !isModelGeneratable(model)) return;
    // createSingleModelOutput creates the output record and schedules AI
    // generation internally — no separate action call needed.
    await createSingleModelOutput({ 
      demoId: demoId as Id<"aiDemos">, 
      model 
    });
  };

  const openPromptModal = () => {
    if (!demo) return;
    setEditingPrompt(demo.prompt);
    setIsEditMode(false);
    setShowPromptModal(true);
  };

  const handleSavePrompt = async () => {
    if (!demoId || !editingPrompt.trim()) return;
    await updatePrompt({ demoId: demoId as Id<"aiDemos">, prompt: editingPrompt.trim() });
    setShowPromptModal(false);
    setIsEditMode(false);
  };

  if (demo === undefined) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
      </div>
    );
  }

  if (demo === null) {
    return (
      <div className="error-page">
        <h1>Demo not found</h1>
        <Link to="/" className="btn btn-primary">Go Home</Link>
      </div>
    );
  }

  // Create a map of model -> output for quick lookup (now includes versionIndex/versionCount)
  const outputsByModel = new Map(demo.outputs.map(o => [o.model, o]));

  // Get tiles to render: selected models, including legacy view-only models.
  const tilesToRender = selectedModels.map(modelId => ({
    model: modelId,
    output: outputsByModel.get(modelId) ?? null,
  }));

  const handleVersionNav = async (model: string, direction: "prev" | "next") => {
    if (!demoId) return;
    await navigateModelVersion({ demoId: demoId as Id<"aiDemos">, model, direction });
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareData = {
      title: "AI Demo Arena",
      url: shareUrl,
    };

    if (
      !isMobileViewport &&
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(shareData))
    ) {
      await navigator.share(shareData);
      return;
    }

    const copied = await copyLink(shareUrl);
    if (copied) {
      if (shareCopiedTimeoutRef.current !== null) {
        window.clearTimeout(shareCopiedTimeoutRef.current);
      }
      setShareCopied(true);
      shareCopiedTimeoutRef.current = window.setTimeout(() => {
        setShareCopied(false);
        shareCopiedTimeoutRef.current = null;
      }, 2000);
    }
  };

  return (
    <div className="demo-view-page">
      {/* Backdrop to close dropdown when clicking anywhere */}
      {showModelPicker && (
        <div className="dropdown-backdrop" onClick={() => setShowModelPicker(false)} />
      )}
      <header className="header">
        <Link to="/" className="logo">AI Demo Arena</Link>
        <button className="demo-prompt-header" onClick={openPromptModal}>
          <span className="prompt-label">Prompt:</span>
          <span className="prompt-text">{demo.prompt}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="prompt-expand-icon">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
        <div className="header-actions">
          {activeViewers.length > 0 && (
            <div className="presence-indicator">
              <div className="presence-avatars">
                {activeViewers.slice(0, maxVisiblePresenceAvatars).map((viewer, index) => {
                  const initials = getInitials(viewer.name);
                  const hoverLabel = viewer.name?.trim() || viewer.userId;
                  return (
                    <div
                      key={viewer.userId}
                      className="presence-avatar"
                      data-presence-label={hoverLabel}
                      aria-label={hoverLabel}
                      style={{
                        backgroundColor: getPresenceColor(viewer.userId),
                        zIndex: activeViewers.length - index,
                      }}
                    >
                      {initials || (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      )}
                    </div>
                  );
                })}
                {overflowViewerCount > 0 && (
                  <div
                    className="presence-avatar presence-avatar-more"
                    title={`${overflowViewerCount} more viewers`}
                  >
                    +{overflowViewerCount}
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            onClick={() => void handleShare()}
            className={`btn btn-secondary btn-share${shareCopied ? " is-copied" : ""}`}
            title={shareCopied ? "Link copied" : isMobileViewport ? "Copy link" : "Share demo"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span className="btn-label">
              {shareCopied ? "Link Copied" : isMobileViewport ? "Copy Link" : "Share"}
            </span>
            {shareCopied && (
              <span className="share-copy-feedback" role="status" aria-live="polite">
                Copied link
              </span>
            )}
          </button>
          <div className="models-dropdown-container" ref={dropdownRef}>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="btn btn-secondary btn-models"
              title={`Models (${selectedModels.length})`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span className="btn-label">Models ({selectedModels.length})</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`chevron ${showModelPicker ? 'open' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showModelPicker && (
              <div className="models-dropdown">
                <div className="models-dropdown-scroll">
                  {ALL_MODELS.map((model) => (
                    <label key={model.id} className="model-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedModelSet.has(model.id)}
                        onChange={() => toggleModel(model.id)}
                      />
                      <span className="model-checkbox-label">{model.name}</span>
                    </label>
                  ))}
                  {legacySelectedModels.map((modelId) => (
                    <label key={modelId} className="model-checkbox">
                      <input
                        type="checkbox"
                        checked={true}
                        disabled={true}
                        readOnly={true}
                      />
                      <span className="model-checkbox-label">{getModelName(modelId)} (legacy)</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {demo.isOwner && (
            <button
              onClick={handleRegenerate}
              className="btn btn-primary btn-regenerate"
              disabled={selectedGeneratableModels.length === 0}
              title="Regenerate"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
              <span className="btn-label">Regenerate</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="tiles-container">
        {tilesToRender.length === 0 ? (
          <div className="no-models-message">
            <p>No models selected. Click "Models" to select which models to display.</p>
          </div>
        ) : (
          tilesToRender.map(({ model, output }) => (
            <div key={model} className="tile">
              <div className={`tile-header provider-${getProviderKey(model)}`} data-provider={getProviderName(model)}>
                <div className="tile-header-left">
                  <span className="model-name">{getModelName(model)}</span>
                  {output && output.versionCount > 1 && (
                    <div className="version-nav">
                      <div className="version-nav-buttons">
                        <button
                          className="btn-version-nav"
                          onClick={() => handleVersionNav(model, "prev")}
                          disabled={output.versionIndex === 1}
                          title="Previous version"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                          </svg>
                        </button>
                        <button
                          className="btn-version-nav"
                          onClick={() => handleVersionNav(model, "next")}
                          disabled={output.versionIndex === output.versionCount}
                          title="Next version"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      </div>
                      <span className="version-indicator">
                        v{output.versionIndex}/{output.versionCount}
                      </span>
                    </div>
                  )}
                </div>
                {output?.status === "complete" ? (
                  <div className="tile-header-actions">
                    <button
                      className="btn-tile-action"
                      onClick={() => setFullscreenOutput({ model, css: output.css, html: output.html })}
                      title="Fullscreen"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    </button>
                    <button
                      className="btn-tile-action"
                      onClick={() => setViewingSource({ model, css: output.css, html: output.html })}
                      title="View Source"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                    </button>
                    {demo.isOwner && isModelGeneratable(model) && (
                      <button
                        className="btn-tile-action"
                        onClick={() => handleGenerateSingleModel(model)}
                        title="Regenerate"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 2v6h-6" />
                          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                          <path d="M3 22v-6h6" />
                          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ) : output ? (
                  <span className={`status status-${output.status}`}>
                    {output.status}
                  </span>
                ) : null}
              </div>
              
              <div className="tile-content">
                {!output && (
                  <div className="tile-empty">
                    <p>Not generated yet</p>
                    {demo.isOwner && isModelGeneratable(model) && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleGenerateSingleModel(model)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Generate
                      </button>
                    )}
                  </div>
                )}

                {output?.status === "pending" && (
                  <div className="tile-loading">
                    <div className="loader small"></div>
                    <span>Waiting...</span>
                  </div>
                )}
                
                {output?.status === "generating" && (
                  <div className="tile-loading">
                    <div className="loader small"></div>
                    <span>Generating...</span>
                  </div>
                )}
                
                {output?.status === "error" && (
                  <div className="tile-error">
                    <span>Error: {output.error}</span>
                    {demo.isOwner && isModelGeneratable(model) && (
                      <button
                        className="btn btn-retry"
                        onClick={() => handleGenerateSingleModel(model)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 2v6h-6" />
                          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                          <path d="M3 22v-6h6" />
                          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                        Retry
                      </button>
                    )}
                  </div>
                )}
                
                {output?.status === "complete" && (
                  <iframe
                    srcDoc={`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <style>
                            * { margin: 0; padding: 0; box-sizing: border-box; }
                            body { 
                              display: flex; 
                              justify-content: center; 
                              align-items: center; 
                              min-height: 100vh;
                              font-family: system-ui, sans-serif;
                              background: #1a1a2e;
                              color: white;
                            }
                            ${output.css}
                          </style>
                        </head>
                        <body>
                          ${output.html}
                        </body>
                      </html>
                    `}
                    sandbox="allow-scripts"
                    title={`${model} output`}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </main>

      {viewingSource && (
        <div className="source-modal-overlay" onClick={() => setViewingSource(null)}>
          <div className="source-modal" onClick={(e) => e.stopPropagation()}>
            <div className="source-modal-header">
              <h3>{getModelName(viewingSource.model)} - Source Code</h3>
              <button className="source-modal-close" onClick={() => setViewingSource(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="source-modal-content">
              <pre><code>{`<style>\n${viewingSource.css}\n</style>\n\n${viewingSource.html}`}</code></pre>
            </div>
          </div>
        </div>
      )}

      {fullscreenOutput && (
        <div className="fullscreen-modal-overlay" onClick={() => setFullscreenOutput(null)}>
          <div className="fullscreen-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fullscreen-modal-header">
              <span className="model-name">{getModelName(fullscreenOutput.model)}</span>
              <button className="source-modal-close" onClick={() => setFullscreenOutput(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <iframe
              srcDoc={`
                <!DOCTYPE html>
                <html>
                  <head>
                    <style>
                      * { margin: 0; padding: 0; box-sizing: border-box; }
                      body { 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        min-height: 100vh;
                        font-family: system-ui, sans-serif;
                        background: #1a1a2e;
                        color: white;
                      }
                      ${fullscreenOutput.css}
                    </style>
                  </head>
                  <body>
                    ${fullscreenOutput.html}
                  </body>
                </html>
              `}
              sandbox="allow-scripts"
              title={`${fullscreenOutput.model} fullscreen`}
            />
          </div>
        </div>
      )}

      {showPromptModal && demo && (
        <div className="source-modal-overlay" onClick={() => setShowPromptModal(false)}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="source-modal-header">
              <h3>Prompt</h3>
              <div className="prompt-modal-actions">
                {demo.isOwner && !isEditMode && (
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsEditMode(true)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit
                  </button>
                )}
                <button className="source-modal-close" onClick={() => setShowPromptModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="prompt-modal-content">
              {isEditMode ? (
                <>
                  <textarea
                    value={editingPrompt}
                    onChange={(e) => setEditingPrompt(e.target.value)}
                    className="prompt-edit-textarea"
                    rows={6}
                    autoFocus
                  />
                  <div className="prompt-edit-buttons">
                    <button 
                      className="btn btn-secondary"
                      onClick={() => {
                        setIsEditMode(false);
                        setEditingPrompt(demo.prompt);
                      }}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn btn-primary"
                      onClick={handleSavePrompt}
                      disabled={!editingPrompt.trim()}
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <p className="prompt-display">{demo.prompt}</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
