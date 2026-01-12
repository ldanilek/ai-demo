import { Routes, Route } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { Home } from "./pages/Home";
import { DemoView } from "./pages/DemoView";
import { Login } from "./pages/Login";
import "./App.css";

function App() {
  const { isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/:demoId" element={<DemoView />} />
    </Routes>
  );
}

export default App;
