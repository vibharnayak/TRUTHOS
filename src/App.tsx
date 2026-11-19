import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { ClaimIntelligencePage } from './pages/ClaimIntelligencePage';
import { DashboardPage } from './pages/DashboardPage';
import { DecayMonitorPage } from './pages/DecayMonitorPage';
import { EvidenceExplorerPage } from './pages/EvidenceExplorerPage';
import { HistoryPage } from './pages/HistoryPage';
import { KnowledgeGraphPage } from './pages/KnowledgeGraphPage';
import { LandingPage } from './pages/LandingPage';
import { MonitoringCenterPage } from './pages/MonitoringCenterPage';
import { MultiAgentAnalysisPage } from './pages/MultiAgentAnalysisPage';
import { SelfHealingMemoryPage } from './pages/SelfHealingMemoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { VerificationStudioPage } from './pages/VerificationStudioPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0C0E] text-zinc-300 flex items-center justify-center text-sm">
        Loading TRUTHOS workspace...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/studio"
            element={
              <ProtectedRoute>
                <VerificationStudioPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/claims"
            element={
              <ProtectedRoute>
                <ClaimIntelligencePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/claims/:id"
            element={
              <ProtectedRoute>
                <ClaimIntelligencePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agents"
            element={
              <ProtectedRoute>
                <MultiAgentAnalysisPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/graph"
            element={
              <ProtectedRoute>
                <KnowledgeGraphPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/decay"
            element={
              <ProtectedRoute>
                <DecayMonitorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/memory"
            element={
              <ProtectedRoute>
                <SelfHealingMemoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/evidence"
            element={
              <ProtectedRoute>
                <EvidenceExplorerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitoring"
            element={
              <ProtectedRoute>
                <MonitoringCenterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
