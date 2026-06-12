import React, { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Button, Dropdown, Spinner } from 'react-bootstrap';
import { UserCheck, LogOut, Settings, LayoutDashboard, Users } from 'lucide-react'; // Added Users icon
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from './UserContext';
import logoImg from './logo.png'; 

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, logoutUser } = useUser();
  const [dbRole, setDbRole] = useState(null);

  useEffect(() => {
    if (user && user.user_type) {
      setDbRole(user.user_type.toLowerCase());
    } else {
      setDbRole(null);
    }
  }, [user]);

  const handleNavClick = (sectionId) => {
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleLogout = async () => {
    try {
      if (logoutUser) await logoutUser();
    } catch (e) {
      console.warn('logout error', e);
    }
    navigate('/');
  };

  return (
    <Navbar bg="white" expand="lg" sticky="top" className="shadow-sm py-3">
      <Container>
        <Navbar.Brand onClick={() => navigate('/')} style={{cursor: 'pointer'}}>
          <img src={logoImg} height="50" alt="Lizza Logo" />
        </Navbar.Brand>
        
        <Navbar.Toggle aria-controls="main-nav" />
        
        <Navbar.Collapse id="main-nav">
          <Nav className="ms-auto me-4 fw-semibold custom-nav text-dark">
            
          </Nav>

          {user && user.full_name ? (
            <Dropdown align="end">
              <Dropdown.Toggle variant="light" className="fw-bold text-danger border-0">
                <UserCheck size={18} className="me-2" />
                {loading ? <Spinner size="sm"/> : `Hi, ${user.full_name.split(' ')[0]}`}
              </Dropdown.Toggle>
              <Dropdown.Menu className="shadow border-0">
                {dbRole === 'admin' && (
                  <Dropdown.Item onClick={() => navigate('/admin')}>
                    <Settings size={14} className="me-2" /> Admin Panel
                  </Dropdown.Item>
                )}
                {/* NEW: Added Manager Panel link for users with manager role */}
                {dbRole === 'manager' && (
                  <Dropdown.Item onClick={() => navigate('/manager')}>
                    <Users size={14} className="me-2" /> Manager Panel
                  </Dropdown.Item>
                )}
                <Dropdown.Item onClick={() => navigate('/dashboard')}>
                  <LayoutDashboard size={14} className="me-2" /> My Dashboard
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={handleLogout} className="text-danger fw-bold">
                  <LogOut size={14} className="me-2" /> Logout
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          ) : (
            <Button variant="danger" className="fw-bold px-4" onClick={() => navigate('/auth')}>
              LOGIN
            </Button>
          )}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Header;