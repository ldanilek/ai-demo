import { useQuery, useMutation, useAction } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ALL_MODELS, getModelName } from "../models";

export function DemoView() {
  const { demoId } = useParams<{ demoId: string }>();
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
  const createNewOutputs = useMutation(api.demos.createNewOutputs);
  const generateForDemo = useAction(api.generate.generateForDemo);
  const createSingleModelOutput = useMutation(api.demos.createSingleModelOutput);
  const generateForOutput = useAction(api.generate.generateForOutput);
  const [viewingSource, setViewingSource] = useState<{ model: string; css: string; html: string } | null>(null);
  const [fullscreenOutput, setFullscreenOutput] = useState<{ model: string; css: string; html: string } | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Use selectedModels from Convex
  const selectedModels = new Set(demo?.selectedModels ?? []);

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
    if (!demoId || selectedModels.size === 0) return;
    await createNewOutputs({ demoId: demoId as Id<"aiDemos">, models: Array.from(selectedModels) });
    generateForDemo({ demoId: demoId as Id<"aiDemos"> });
  };

  const handleGenerateSingleModel = async (model: string) => {
    if (!demoId || !demo) return;
    // Create output first for immediate UI feedback
    const outputId = await createSingleModelOutput({ 
      demoId: demoId as Id<"aiDemos">, 
      model 
    });
    // Then trigger generation
    generateForOutput({ outputId, prompt: demo.prompt, model });
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

  // Create a map of model -> output for quick lookup
  const outputsByModel = new Map(demo.outputs.map(o => [o.model, o]));

  // Get tiles to render: only selected models
  const tilesToRender = ALL_MODELS
    .filter(m => selectedModels.has(m.id))
    .map(m => ({
      model: m.id,
      output: outputsByModel.get(m.id) ?? null,
    }));

  return (
    <div className="demo-view-page">
      {/* Backdrop to close dropdown when clicking anywhere */}
      {showModelPicker && (
        <div className="dropdown-backdrop" onClick={() => setShowModelPicker(false)} />
      )}
      <header className="header">
        <Link to="/" className="logo">AI Demo Arena</Link>
        <div className="demo-prompt-header">
          <span className="prompt-label">Prompt:</span>
          <span className="prompt-text">{demo.prompt}</span>
        </div>
        <div className="header-actions">
          <div className="models-dropdown-container" ref={dropdownRef}>
            <button onClick={() => setShowModelPicker(!showModelPicker)} className="btn btn-secondary btn-models">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              Models ({selectedModels.size})
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
                        checked={selectedModels.has(model.id)}
                        onChange={() => toggleModel(model.id)}
                      />
                      <span className="model-checkbox-label">{model.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={handleRegenerate} className="btn btn-primary btn-regenerate" disabled={selectedModels.size === 0}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            Regenerate
          </button>
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
              <div className="tile-header">
                <span className="model-name">{getModelName(model)}</span>
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
                    <button
                      className="btn btn-primary"
                      onClick={() => handleGenerateSingleModel(model)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Generate
                    </button>
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

    </div>
  );
}
