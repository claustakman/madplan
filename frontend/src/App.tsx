import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Shopping from './pages/Shopping';
import MealPlan from './pages/MealPlan';
import Recipes from './pages/Recipes';
import Archive from './pages/Archive';
import Profile from './pages/Profile';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontSize: 32 }}>🍽️</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontSize: 32 }}>🍽️</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/indkobsliste" replace /> : <Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Navigate to="/indkobsliste" replace />} />
        <Route path="/indkobsliste" element={<Shopping />} />
        <Route path="/madplan" element={<MealPlan />} />
        <Route path="/opskrifter" element={<Recipes />} />
        <Route path="/arkiv" element={<Archive />} />
        <Route path="/profil" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
