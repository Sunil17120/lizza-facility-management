import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import AOS from 'aos';
import 'aos/dist/aos.css';

// Component Imports
import Header from './assets/components/Header';
import Hero from './assets/components/Hero';
import About from './assets/components/About';
import Services from './assets/components/Services';
import Auth from './assets/components/Auth'; 
import AdminDashboard from './assets/components/AdminDashboard'; 
import UserDashboard from './assets/components/UserDashboard'; 
import Footer from './assets/components/Footer'; // Import your new Footer

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
        if (currentUser && currentUser.user_type.toLowerCase() === 'admin') {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      })
      .catch(() => setIsAdmin(false));
  }, [userEmail]);

  if (isAdmin === null) return <div className="text-center py-5">Verifying Permissions...</div>;
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
};

// Protected Route for Users
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
      <div className="App d-flex flex-column min-vh-100">
        {/* HEADER: Placed here so it shows on ALL pages */}
        <Header />

        <div className="flex-grow-1">
          <Routes>
            {/* HOME PAGE: Includes Hero, About, and Services */}
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
        </div>

        {/* FOOTER: Placed here so it shows on ALL pages */}
        <Footer />
      </div>
    </Router>
  );
}

export default App;