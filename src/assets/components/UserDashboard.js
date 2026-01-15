import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Badge, Spinner } from 'react-bootstrap';
import { User, Shield } from 'lucide-react';

const UserDashboard = () => {
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userName = localStorage.getItem('userName');
  const userEmail = localStorage.getItem('userEmail');

// Inside UserDashboard.js
useEffect(() => {
  if (userEmail) {
    setLoading(true);
    // Use the NEW endpoint that doesn't require admin rights
    fetch(`/api/user/profile?email=${userEmail}`)
      .then(res => {
        if (!res.ok) throw new Error("User not found");
        return res.json();
      })
      .then(data => {
        // data is now a single user object: { user_type: "guard", ... }
        setDbUser(data); 
        setLoading(false);
      })
      .catch((err) => {
        console.error("Profile fetch error:", err);
        setLoading(false);
      });
  }
}, [userEmail]);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={6}>
          <Card className="border-0 shadow-lg text-center p-4">
            <div className="bg-light rounded-circle d-inline-block p-3 mx-auto mb-3">
              <User size={48} className="text-danger" />
            </div>
            <h3 className="fw-bold">{userName}</h3>
            <p className="text-muted">{userEmail}</p>
            
            <div className="my-4">
              <h6 className="text-uppercase text-muted small fw-bold">Current Designation</h6>
              {/* This displays the EXACT string from the database (e.g., GUARD, OFFICIAL STAFF) */}
              <Badge bg="dark" className="fs-6 px-4 py-2">
                {dbUser?.user_type ? dbUser.user_type.toUpperCase() : "UNASSIGNED"}
              </Badge>
            </div>

            <Card className="bg-light border-0 p-3">
              <div className="d-flex align-items-center justify-content-center gap-2">
                <Shield size={18} className="text-success" />
                <span className="fw-bold">Database Verified Account</span>
              </div>
            </Card>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default UserDashboard;