import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";

export function Home() {
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  
  const myDemos = useQuery(api.demos.listMyDemos) ?? [];
  const createDemo = useMutation(api.demos.createDemo);
  const archiveDemo = useMutation(api.demos.archiveDemo);

  if (!isAuthenticated) {
    return (
      <div className="home-page">
        <header className="header">
          <h1 className="logo">AI Demo Arena</h1>
          <button onClick={() => navigate("/login")} className="btn btn-primary">
            Sign In
          </button>
        </header>
        
        <main className="hero">
          <h2>Compare AI Model Outputs</h2>
          <p>
            Create a prompt, and watch multiple AI models generate HTML/CSS in real-time.
            Compare GPT-4, Claude, and more side by side.
          </p>
          <button onClick={() => navigate("/login")} className="btn btn-large btn-primary">
            Get Started
          </button>
        </main>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isCreating) return;
    
    setIsCreating(true);
    // createDemo inserts output records and schedules AI generation
    // for each model internally — no separate action call needed.
    const demoId = await createDemo({ prompt: prompt.trim() });
    navigate(`/${demoId}`);
  };

  return (
    <div className="home-page">
      <header className="header">
        <h1 className="logo">AI Demo Arena</h1>
        <button onClick={() => signOut()} className="btn btn-secondary">
          Sign Out
        </button>
      </header>
      
      <main className="main-content">
        <section className="create-section">
          <h2>Create New Demo</h2>
          <form onSubmit={handleCreate} className="create-form">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to see... e.g., 'an analog clock', 'a simple 4-function calculator', 'a pelican riding a bicycle'"
              rows={4}
            />
            <button type="submit" disabled={!prompt.trim() || isCreating} className="btn btn-primary">
              {isCreating ? "Creating..." : "Generate with All Models"}
            </button>
          </form>
        </section>
        
        {myDemos.length > 0 && (
          <section className="demos-section">
            <h2>Your Demos</h2>
            <div className="demos-grid">
              {myDemos.map((demo) => (
                <div key={demo._id} className="demo-card-wrapper">
                  <button
                    onClick={() => navigate(`/${demo._id}`)}
                    className="demo-card"
                  >
                    <p className="demo-prompt">{demo.prompt}</p>
                    <span className="demo-date">
                      {new Date(demo.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveDemo({ demoId: demo._id });
                    }}
                    className="demo-archive-btn"
                    title="Archive demo"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
