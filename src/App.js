import React, { useEffect } from 'react';
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
import AdminDashboard from './assets/components/AdminDashboard'; // Ensure you create this file
import { Container, Row, Col } from 'react-bootstrap';

// Protected Route Component for Admin
const AdminRoute = ({ children }) => {
  const userType = localStorage.getItem('userType');
  const isAuthenticated = localStorage.getItem('userName');
  
  // If not an admin, redirect back to home or login
  if (!isAuthenticated || userType !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  useEffect(() => {
    AOS.init({
      duration: 1200,
      easing: 'ease-in-out-back',
      once: false,
      mirror: true,
    });
  }, []);

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Main Website Route */}
          <Route path="/" element={
            <>
              <Header />
              <Hero />
              
              {/* Stats Section */}
              <section className="bg-red py-5 text-white overflow-hidden">
                <Container>
                  <Row className="text-center g-4">
                    <Col md={3} sm={6} data-aos="flip-left" data-aos-delay="100">
                      <div className="stat-item p-3">
                        <h2 className="fw-bold display-5 mb-0">500+</h2>
                        <p className="text-uppercase small fw-bold mt-2">Verified Staff</p>
                      </div>
                    </Col>
                    <Col md={3} sm={6} data-aos="flip-left" data-aos-delay="300">
                      <div className="stat-item p-3">
                        <h2 className="fw-bold display-5 mb-0">150+</h2>
                        <p className="text-uppercase small fw-bold mt-2">Active Sites</p>
                      </div>
                    </Col>
                    <Col md={3} sm={6} data-aos="flip-left" data-aos-delay="500">
                      <div className="stat-item p-3">
                        <h2 className="fw-bold display-5 mb-0">10+</h2>
                        <p className="text-uppercase small fw-bold mt-2">Years Experience</p>
                      </div>
                    </Col>
                    <Col md={3} sm={6} data-aos="flip-left" data-aos-delay="700">
                      <div className="stat-item p-3">
                        <h2 className="fw-bold display-5 mb-0">100%</h2>
                        <p className="text-uppercase small fw-bold mt-2">Compliance</p>
                      </div>
                    </Col>
                  </Row>
                </Container>
              </section>

              <div className="section-separator"></div>
              <About />
              <Services />

              {/* Footer Section */}
              <footer className="bg-black text-white py-4 text-center border-top border-secondary">
                <Container>
                  <p className="mb-0 small opacity-50">
                    &copy; {new Date().getFullYear()} LIZZA FACILITY MANAGEMENT PVT. LTD.
                  </p>
                </Container>
              </footer>
            </>
          } />

          {/* Login/Signup Route */}
          <Route path="/auth" element={<Auth />} />

          {/* Admin Dashboard - Protected */}
          <Route 
            path="/admin" 
            element={
              <AdminRoute>
                <Header />
                <AdminDashboard />
              </AdminRoute>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;