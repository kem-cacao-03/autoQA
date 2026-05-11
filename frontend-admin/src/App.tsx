import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AdminRoute from "@/components/AdminRoute";
import LoginPage from "@/pages/LoginPage";
import UsersPage from "@/pages/UsersPage";

export default function App() {
  const { admin } = useAuth();

  return (
    <Routes>
      <Route
        path="/users"
        element={
          <AdminRoute>
            <UsersPage />
          </AdminRoute>
        }
      />
      <Route
        path="/login"
        element={admin ? <Navigate to="/users" replace /> : <LoginPage />}
      />
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}
