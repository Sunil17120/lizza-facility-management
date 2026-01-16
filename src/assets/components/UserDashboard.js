import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Badge, Spinner } from 'react-bootstrap';
import { Clock, MapPin, ShieldCheck } from 'lucide-react';

const UserDashboard = () => {
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (userEmail) {
      fetch(`/api/user/profile?email=${userEmail}`)
        .then(res => res.json())
        .then(data => {
          setDbUser(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [userEmail]);

  // Location Tracking logic remains untouched
  useEffect(() => {
    const sendLocation = () => {
      if ("geolocation" in navigator && userEmail && dbUser) {
        const now = new Date().toTimeString().slice(0, 5);
        if (now >= dbUser.shift_start && now <= dbUser.shift_end) {
          navigator.geolocation.getCurrentPosition((pos) => {
            fetch(`/api/user/update-location?email=${userEmail}&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, { method: 'POST' });
          });
        }
      }
    };
    const interval = setInterval(sendLocation, 120000);
    return () => clearInterval(interval);
  }, [userEmail, dbUser]);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8}>
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-danger p-4 text-white text-center">
              <h2 className="fw-bold mb-0">Shift Duty Status</h2>
              <p className="opacity-75 mb-0">Employee ID: {userEmail}</p>
            </div>
            <Card.Body className="p-5 text-center">
              <div className="d-flex justify-content-center gap-4 mb-4">
                <div className="text-center">
                  <p className="text-muted small fw-bold mb-1">SHIFT START</p>
                  <h3 className="fw-bold text-dark">{dbUser?.shift_start || "09:00"}</h3>
                </div>
                <div className="vr"></div>
                <div className="text-center">
                  <p className="text-muted small fw-bold mb-1">SHIFT END</p>
                  <h3 className="fw-bold text-dark">{dbUser?.shift_end || "18:00"}</h3>
                </div>
              </div>

              <div className="bg-light p-3 rounded-3 d-flex align-items-center justify-content-center gap-2 mb-4">
                <Clock className="text-danger" size={20} />
                <span className="fw-bold">Tracking Active: {dbUser?.shift_start} - {dbUser?.shift_end}</span>
              </div>

              <div className="text-success d-flex align-items-center justify-content-center gap-1 small">
                <ShieldCheck size={16} /> Verified Security Personnel
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default UserDashboard;