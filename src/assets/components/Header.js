import React, { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Button, Dropdown } from 'react-bootstrap';
import { Phone, Mail, Clock, UserCheck, LogOut, Settings } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import logoImg from './logo.png'; 

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation(); // Used to trigger re-renders on navigation
  const [user, setUser] = useState({ name: null, type: null });

  // Function to pull latest data from storage
  const syncUser = () => {
    const storedName = localStorage.getItem('userName');
    const storedType = localStorage.getItem('userType');
    setUser({ name: storedName, type: storedType?.toLowerCase() });
  };

  useEffect(() => {
    syncUser();
    // Listen for storage changes in other tabs/windows
    window.addEventListener('storage', syncUser);
    return () => window.removeEventListener('storage', syncUser);
  }, [location]); // Re-sync whenever the URL route changes

  const handleLogout = () => {
    localStorage.clear();
    setUser({ name: null, type: null });
    navigate('/');
  };

  return (
    <header>
      {/* ... (Top bar remains same) ... */}
      <Navbar bg="white" expand="lg" sticky="top" className="shadow-sm py-3">
        <Container>
          <Navbar.Brand onClick={() => navigate('/')} style={{cursor: 'pointer'}} className="d-flex align-items-center">
            <img src={logoImg} height="50" className="me-2" alt="Lizza Logo" />
            <div className="lh-1">
              <span className="fw-bold fs-4 text-black">LIZZA</span><br/>
              <span className="small text-red fw-bold" style={{letterSpacing: '1px'}}>FACILITY MANAGEMENT</span>
            </div>
          </Navbar.Brand>
          
          <Navbar.Toggle aria-controls="main-nav" />
          <Navbar.Collapse id="main-nav">
            <Nav className="ms-auto me-4 fw-semibold custom-nav">
              <Nav.Link onClick={() => navigate('/')}>Home</Nav.Link>
              <Nav.Link href="#about">About</Nav.Link>
              <Nav.Link href="#services">Services</Nav.Link>
            </Nav>
            
            {user.name ? (
              <Dropdown align="end">
                <Dropdown.Toggle variant="light" className="d-flex align-items-center fw-bold text-red border-0">
                  <UserCheck size={18} className="me-2" />
                  Welcome, {user.name.split(' ')[0]}
                </Dropdown.Toggle>
                <Dropdown.Menu className="shadow border-0">
                  {/* FIX: Improved check for admin type */}
                  {user.type === 'admin' && (
                    <Dropdown.Item onClick={() => navigate('/admin')}>
                      <Settings size={14} className="me-2" /> Admin Panel
                    </Dropdown.Item>
                  )}
                  <Dropdown.Item onClick={() => navigate('/dashboard')}>My Dashboard</Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={handleLogout} className="text-danger">
                    <LogOut size={14} className="me-2" /> Logout
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            ) : (
              <Button className="btn-red px-4 py-2 fw-bold shadow-sm" onClick={() => navigate('/auth')}>
                LOGIN 
              </Button>
            )}
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </header>
  );
};

export default Header;