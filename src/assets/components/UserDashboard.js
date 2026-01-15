import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Badge, Spinner, Alert } from 'react-bootstrap';
import { User, Shield, CheckCircle, AlertCircle } from 'lucide-react';

const UserDashboard = () => {
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userName = localStorage.getItem('userName');
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (userEmail) {
      setLoading(true);
      // Fetching the full employee list to find the current user's role
      fetch(`/api/admin/employees?admin_email=${userEmail}`)
        .then(res => {
          if (!res.ok) throw new Error("Unauthorized or Not Found");
          return res.json();
        })
        .then(data => {
          const currentUser = data.find(emp => emp.email === userEmail);
          setDbUser(currentUser);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Dashboard verify error:", err);
          setLoading(false);
        });
    }
  }, [userEmail]);

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" variant="danger" />
        <p className="mt-2 text-muted">Loading your profile...</p>
      </Container>
    );
  }

  return (
    <Container className="py-5">
      <h2 className="fw-bold mb-4">User Dashboard</h2>
      <Row>
        <Col md={4}>
          <Card className="border-0 shadow-sm p-3 text-center mb-4">
            <Card.Body>
              <div className="bg-light rounded-circle d-inline-block p-3 mb-3">
                <User size={40} className="text-danger" />
              </div>
              <h4 className="fw-bold">{userName || 'User'}</h4>
              <p className="text-muted small">{userEmail}</p>
              
              <Badge bg={dbUser?.user_type?.toLowerCase() === 'admin' ? 'danger' : 'primary'} className="px-3 py-2">
                {dbUser?.user_type?.toUpperCase() || 'EMPLOYEE'}
              </Badge>
            </Card.Body>
          </Card>
        </Col>
        <Col md={8}>
          <Card className="border-0 shadow-sm p-4">
            <h5 className="fw-bold mb-3 d-flex align-items-center">
              <Shield size={20} className="me-2 text-success" /> 
              Account Status: Active
            </h5>
            <p className="text-muted">
              Welcome to the LIZZA Facility Management portal. Your current access level is 
              set to <strong>{dbUser?.user_type || 'Employee'}</strong>.
            </p>
            
            {dbUser?.user_type?.toLowerCase() === 'admin' && (
              <Alert variant="info" className="mt-3 border-0 shadow-sm">
                <AlertCircle size={18} className="me-2" />
                You have Administrative privileges. 
                <a href="/admin" className="ms-2 fw-bold text-decoration-none">Go to Admin Console →</a>
              </Alert>
            )}

            <div className="mt-4 p-3 bg-light rounded">
              <div className="d-flex align-items-center mb-2">
                <CheckCircle size={16} className="text-success me-2" />
                <span>Verified Personnel</span>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default UserDashboard;