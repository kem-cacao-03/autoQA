import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { ReactNode } from "react";

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        Loading…
      </div>
    );
  }

  return admin ? <>{children}</> : <Navigate to="/login" replace />;
}
