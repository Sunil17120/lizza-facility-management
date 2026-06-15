import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Alert } from 'react-bootstrap'; // Removed ProgressBar
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';

import { Capacitor } from '@capacitor/core';
// 1. IMPORT THE APP PLUGIN
import { App as CapacitorApp } from '@capacitor/app';

import Header from './assets/components/Header';
import Auth from './assets/components/Auth'; 
import AdminDashboard from './assets/components/AdminDashboard'; 
import UserDashboard from './assets/components/UserDashboard'; 
import ManagerDashboard from './assets/components/ManagerDashboard'; 
import FieldOfficerDashboard from './assets/components/FieldOfficerDashboard'; 
import Footer from './assets/components/Footer'; 
import { UserProvider, useUser } from './assets/components/UserContext';

const RoleRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useUser();
  if (loading) return <div className="text-center py-5">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return (user.user_type && allowedRoles.includes(user.user_type.toLowerCase())) ? children : <Navigate to="/dashboard" replace />;
};

const PrivateRoute = ({ children }) => {
  const { user, loading } = useUser();
  if (loading) return <div className="text-center py-5">Loading...</div>;
  return user ? children : <Navigate to="/auth" replace />;
};

function AppContent() {
  const { pushMessage, pushMessageType } = useUser();

  useEffect(() => {
    AOS.init({ duration: 1200 });

    const checkLiveUpdates = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // 2. FETCH WITH NO-STORE TO PREVENT CACHING
          const response = await fetch('https://lizza-facility-management.vercel.app/updates/version.json', { cache: 'no-store' });
          const latestUpdate = await response.json();
          
          // 3. READ THE REAL VERSION FROM ANDROID
          const appInfo = await CapacitorApp.getInfo();
          const currentVersion = appInfo.version;

          // 4. COMPARE AND PROMPT
          if (latestUpdate.version !== currentVersion) {
            const shouldUpdate = window.confirm(`A new version (${latestUpdate.version}) is available! Click OK to download the update.`);
            if (shouldUpdate) {
              // Ensure this matches the key in your version.json (using .url here)
              window.open(latestUpdate.url, '_system'); 
            }
          }
        } catch (error) {
          console.error("Update check failed:", error);
        }
      }
    };

    checkLiveUpdates();
  }, []);

  return (
    <div className="App d-flex flex-column min-vh-100">
      {pushMessage && (
        <Alert variant={pushMessageType} className="text-center m-0 w-100" style={{ zIndex: 9998 }}>
          {pushMessage}
        </Alert>
      )}
      <Header />
      <div className="flex-grow-1">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<PrivateRoute><UserDashboard /></PrivateRoute>} />
          <Route path="/manager" element={<RoleRoute allowedRoles={['manager']}><ManagerDashboard /></RoleRoute>} />
          <Route path="/field-operations" element={<RoleRoute allowedRoles={['field_officer']}><FieldOfficerDashboard /></RoleRoute>} />
          <Route path="/admin" element={<RoleRoute allowedRoles={['admin']}><AdminDashboard /></RoleRoute>} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <UserProvider>
      <Router>
        <AppContent />
      </Router>
    </UserProvider>
  );
}

export default App;