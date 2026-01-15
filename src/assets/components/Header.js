import React, { useState, useEffect } from 'react';
import { Navbar, Nav, Container, Button, Dropdown, Spinner } from 'react-bootstrap';
import { Phone, Mail, Clock, UserCheck, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoImg from './logo.png'; 

const Header = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState({ name: null, email: null });
  const [dbRole, setDbRole] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    const storedEmail = localStorage.getItem('userEmail');
    
    if (storedName && storedEmail) {
      setUser({ name: storedName, email: storedEmail });
      setLoading(true);
      
      // Fetch role from DB instead of localStorage
      fetch(`/api/admin/employees?admin_email=${storedEmail}`)
        .then(res => res.json())
        .then(data => {
          const currentUser = data.find(emp => emp.email === storedEmail);
          if (currentUser) setDbRole(currentUser.user_type.toLowerCase());
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setUser({ name: null, email: null });
    setDbRole(null);
    navigate('/');
  };

  return (
    <header>
      <div className="bg-black text-white py-2 d-none d-md-block">
        <Container className="d-flex justify-content-between align-items-center small">
          <div>
            <span className="me-4"><Phone size={14} className="me-1 text-red"/> +91 9731343937</span>
            <span><Mail size={14} className="me-1 text-red"/> infolizza@lizzafacility.com</span>
          </div>
          <div><Clock size={14} className="me-1 text-red"/> 24/support</div>
        </Container>
      </div>

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
                  {loading ? <Spinner animation="border" size="sm" className="me-2"/> : `Hi, ${user.name.split(' ')[0]}`}
                </Dropdown.Toggle>
                <Dropdown.Menu className="shadow border-0">
                  {/* DYNAMIC CHECK: Only show if DB confirms admin */}
                  {dbRole === 'admin' && (
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