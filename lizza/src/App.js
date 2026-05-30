import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';

// Capgo Updater & Capacitor
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { App as CapacitorApp } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';

// Component Imports
import Header from './assets/components/Header';
import Hero from './assets/components/Hero';
import About from './assets/components/About';
import Services from './assets/components/Services';
import Auth from './assets/components/Auth'; 
import AdminDashboard from './assets/components/AdminDashboard'; 
import UserDashboard from './assets/components/UserDashboard'; 
import ManagerDashboard from './assets/components/ManagerDashboard'; 
import FieldOfficerDashboard from './assets/components/FieldOfficerDashboard'; 
import Footer from './assets/components/Footer'; 
import { UserProvider, useUser } from './assets/components/UserContext';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const RoleRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useUser();

  if (loading) return (
    <div className="text-center py-5">
      <div className="spinner-border text-danger" role="status"></div>
      <p className="mt-2">Verifying Permissions...</p>
    </div>
  );
  
  if (!user) return <Navigate to="/auth" replace />;
  
  return allowedRoles.includes(user.user_type.toLowerCase()) ? children : <Navigate to="/dashboard" replace />;
};

const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('userName');
  return isAuthenticated ? children : <Navigate to="/auth" replace />;
};

function AppContent() {
  const { user } = useUser();

  useEffect(() => {
    AOS.init({ duration: 1200 });

    // 1. Notify that the app is ready to clear the splash/boot verification
    CapacitorUpdater.notifyAppReady();

    // 2. Clear background update check executed when app returns to focus
    CapacitorApp.addListener('appStateChange', async (state) => {
      if (state.isActive) {
        const latest = await CapacitorUpdater.download();
        if (latest) {
          await CapacitorUpdater.set({ id: latest.id });
        }
      }
    });

    // 3. Native Background Geolocation Tracking
    if (user && user.user_type === 'field_officer') {
      BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "Tracking duty status and geofence safety.",
          backgroundTitle: "Lizza Duty Tracking Active",
          requestPermissions: true,
          stale: false,
          distanceFilter: 20 
        },
        (location) => {
          const email = localStorage.getItem('userEmail');
          if (location && email) {
            fetch('https://lizza-facility-management.vercel.app/api/user/update-location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, lat: location.latitude, lon: location.longitude })
            });
          }
        }
      ).then((watcher_id) => localStorage.setItem('geo_watcher_id', watcher_id));
    }
  }, [user]);

  return (
    <div className="App d-flex flex-column min-vh-100">
      <Header />
      <div className="flex-grow-1">
        <Routes>
          <Route path="/" element={<><Hero /><About /><Services /></>} />
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