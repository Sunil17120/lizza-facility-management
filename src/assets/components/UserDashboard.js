import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Badge, Spinner } from 'react-bootstrap';
import { User, Shield, CheckCircle } from 'lucide-react';

const UserDashboard = () => {
  const [dbRole, setDbRole] = useState(null);
  const userName = localStorage.getItem('userName');
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (userEmail) {
      fetch(`/api/admin/employees?admin_email=${userEmail}`)
        .then(res => res.json())
        .then(data => {
          const currentUser = data.find(emp => emp.email === userEmail);
          setDbRole(currentUser ? currentUser.user_type : 'employee');
        })
        .catch(() => setDbRole('employee'));
    }
  }, [userEmail]);

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
              
              {/* FIX: Shows spinner until DB responds, preventing 'UNDEFINED' badge */}
              {!dbRole ? (
                <Spinner animation="border" size="sm" variant="danger" />
              ) : (
                <Badge bg={dbRole.toLowerCase() === 'admin' ? 'danger' : 'primary'} className="px-3 py-2">
                  {dbRole.toUpperCase()}
                </Badge>
              )}
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
              Welcome to the Lizza Facility Management portal. From here, you can view your profile 
              details based on your <strong>{dbRole || '...'}</strong> role.
            </p>
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