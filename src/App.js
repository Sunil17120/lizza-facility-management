import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';

import Header from './assets/components/Header';
import Hero from './assets/components/Hero';
import About from './assets/components/About';
import Services from './assets/components/Services';
import Auth from './assets/components/Auth'; 
import AdminDashboard from './assets/components/AdminDashboard'; 
import UserDashboard from './assets/components/UserDashboard'; 

// Protected Route for Admin - FETCHES FROM DB
const AdminRoute = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(null);
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!userEmail) {
      setIsAdmin(false);
      return;
    }

    fetch(`/api/admin/employees?admin_email=${userEmail}`)
      .then(res => res.json())
      .then(data => {
        const currentUser = data.find(emp => emp.email === userEmail);
        // Direct DB Check
        if (currentUser && currentUser.user_type.toLowerCase() === 'admin') {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      })
      .catch(() => setIsAdmin(false));
  }, [userEmail]);

  if (isAdmin === null) return <div className="text-center py-5">Verifying Admin Permissions...</div>;
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
};

const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('userName');
  return isAuthenticated ? children : <Navigate to="/auth" replace />;
};

function App() {
  useEffect(() => {
    AOS.init({ duration: 1200 });
  }, []);

  return (
    <Router>
      <div className="App">
        {/* Header moved OUTSIDE Routes so it always shows on every page */}
        <Header /> 
        
        <Routes>
          <Route path="/" element={
            <>
              <Hero />
              <About />
              <Services />
            </>
          } />

          <Route path="/auth" element={<Auth />} />

          <Route 
            path="/dashboard" 
            element={
              <PrivateRoute>
                <UserDashboard />
              </PrivateRoute>
            } 
          />

          <Route 
            path="/admin" 
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            } 
          />
        </Routes>
        
        {/* If you have a Footer component, place it here: <Footer /> */}
      </div>
    </Router>
  );
}

export default App;