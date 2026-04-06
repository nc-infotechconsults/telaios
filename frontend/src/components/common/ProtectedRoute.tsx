import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <span className="text-default-400 text-sm animate-pulse">Loading…</span>
      </div>
    );
  }

  if (!user && !DEMO) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
