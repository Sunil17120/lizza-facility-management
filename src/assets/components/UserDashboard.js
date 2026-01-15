import React from 'react';
import { Container, Row, Col, Card, Badge } from 'react-bootstrap';
import { User, Shield, CheckCircle } from 'lucide-react';

const UserDashboard = () => {
  const userName = localStorage.getItem('userName');
  const userType = localStorage.getItem('userType');
  const userEmail = localStorage.getItem('userEmail');

  // Normalize type for UI display
  const displayType = userType ? userType.toUpperCase() : 'EMPLOYEE';

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
              {/* FIX: Use displayType to avoid 'UNDEFINED' badge */}
              <Badge bg={userType?.toLowerCase() === 'admin' ? 'danger' : 'primary'} className="px-3 py-2">
                {displayType}
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
              Welcome to the Lizza Facility Management portal. From here, you can view your profile 
              details and access specific department tools based on your <strong>{displayType.toLowerCase()}</strong> role.
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