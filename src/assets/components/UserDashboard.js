import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Badge, Spinner } from 'react-bootstrap';
import { User, Shield, Clock, MapPin } from 'lucide-react';

const UserDashboard = () => {
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userEmail = localStorage.getItem('userEmail');
  const userName = localStorage.getItem('userName');

  useEffect(() => {
    if (userEmail) {
      setLoading(true);
      fetch(`/api/user/profile?email=${userEmail}`)
        .then(res => res.json())
        .then(data => {
          setDbUser(data); 
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [userEmail]);

  // Location Tracking Logic (Every 2 minutes)
  useEffect(() => {
    const sendLocation = () => {
      if ("geolocation" in navigator && userEmail && dbUser) {
        const now = new Date().toTimeString().slice(0, 5);
        // Only ping if within shift hours
        if (now >= dbUser.shift_start && now <= dbUser.shift_end) {
          navigator.geolocation.getCurrentPosition((pos) => {
            fetch(`/api/user/update-location?email=${userEmail}&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, { method: 'POST' });
          });
        }
      }
    };

    const interval = setInterval(sendLocation, 120000); // 2 minutes
    return () => clearInterval(interval);
  }, [userEmail, dbUser]);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="g-4">
        <Col md={5}>
          <Card className="border-0 shadow-lg text-center p-4 h-100">
            <div className="bg-light rounded-circle d-inline-block p-3 mx-auto mb-3">
              <User size={48} className="text-danger" />
            </div>
            <h3 className="fw-bold">{userName}</h3>
            <p className="text-muted">{userEmail}</p>
            <Badge bg="danger" className="fs-6 px-4 py-2 mb-3">
              {dbUser?.user_type?.toUpperCase()}
            </Badge>
            <Card className="bg-light border-0 p-3">
              <div className="d-flex align-items-center justify-content-center gap-2">
                <Shield size={18} className="text-success" />
                <span className="fw-bold small">Database Verified Account</span>
              </div>
            </Card>
          </Card>
        </Col>

        <Col md={7}>
          <Card className="border-0 shadow-lg p-4 h-100 bg-dark text-white">
            <div className="d-flex align-items-center gap-3 mb-4">
              <Clock size={32} className="text-danger" />
              <div>
                <h4 className="mb-0 fw-bold">Active Shift Hours</h4>
                <p className="text-muted small mb-0">Location tracking is enabled during this window</p>
              </div>
            </div>
            <div className="display-4 fw-bold mb-4">
              {dbUser?.shift_start} - {dbUser?.shift_end} <span className="fs-4 text-muted">HRS</span>
            </div>
            <hr className="opacity-25" />
            <div className="d-flex align-items-center gap-2 text-success">
              <MapPin size={18} />
              <span className="small fw-bold">Live Tracking Status: {loading ? 'Checking...' : 'Active (In-Shift Only)'}</span>
            </div>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default UserDashboard;