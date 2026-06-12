import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Alert, ProgressBar } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';

// FIX: Updated import to match the current Capgo library
import { CapacitorUpdater } from '@capgo/capacitor-updater';

// Component Imports
import Header from './assets/components/Header';
import Auth from './assets/components/Auth'; 
import AdminDashboard from './assets/components/AdminDashboard'; 
import UserDashboard from './assets/components/UserDashboard'; 
import ManagerDashboard from './assets/components/ManagerDashboard'; 
import FieldOfficerDashboard from './assets/components/FieldOfficerDashboard'; 
import Footer from './assets/components/Footer'; 
import { UserProvider, useUser } from './assets/components/UserContext';

// --- ROUTING COMPONENTS ---
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

// --- APP CONTENT ---
function AppContent() {
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);
  const { pushMessage, pushMessageType } = useUser();

  useEffect(() => {
    AOS.init({ duration: 1200 });

    // AUTOMATIC LIVE UPDATE LOGIC
    const checkLiveUpdates = async () => {
      try {
        // 1. Check for updates
        const update = await CapacitorUpdater.check();
        
        if (update && update.url) {
          setUpdateStatus('Downloading update...');
          setUpdateProgress(20);
          
          // 2. Download the bundle
          const download = await CapacitorUpdater.download({ 
            version: update.version, 
            url: update.url 
          });

          if (download) {
            setUpdateStatus('Applying update...');
            setUpdateProgress(80);
            // 3. Apply and reload
            await CapacitorUpdater.set({ version: update.version });
            setUpdateProgress(100);
            await CapacitorUpdater.reload();
          }
        }
      } catch (e) { 
        console.log("No update available or network error"); 
      }
    };

    checkLiveUpdates();
  }, []);

  return (
    <div className="App d-flex flex-column min-vh-100">
      {updateStatus && (
        <div className="alert alert-info text-center m-0 fixed-top" style={{ zIndex: 9999 }}>
          {updateStatus}
          {updateProgress > 0 && updateProgress < 100 && (
            <ProgressBar
              now={updateProgress}
              animated
              striped
              variant="info"
              className="mt-2"
              style={{ height: '6px' }}
            />
          )}
        </div>
      )}
      {pushMessage && (
        <Alert variant={pushMessageType} className="text-center m-0 w-100" style={{ zIndex: 9998 }}>
          {pushMessage}
        </Alert>
      )}
      <Header />
      <div className="flex-grow-1">
        <Routes>
          {/* Automatically redirect the root path to the dashboard/login */}
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

// --- MAIN APP ENTRY ---
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