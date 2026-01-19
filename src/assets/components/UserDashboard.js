import React, { useEffect, useState, useCallback } from 'react';
import { Container, Row, Col, Card, Spinner, Button, Alert, Badge } from 'react-bootstrap';
import { ShieldCheck, MapPin, Map as MapIcon } from 'lucide-react'; // Removed Navigation and Clock

const UserDashboard = () => {
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: 'info', msg: 'Checking Geofence...' });
  const [isCurrentlyOnShift, setIsCurrentlyOnShift] = useState(false);
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (userEmail) {
      // Profile includes blockchain_id and shift details
      fetch(`/api/user/profile?email=${userEmail}`)
        .then(res => res.json())
        .then(data => { 
          setDbUser(data); 
          setLoading(false); 
        })
        .catch(() => setLoading(false));
    }
  }, [userEmail]);

  const syncLocation = useCallback((isManual = false) => {
    if (!navigator.geolocation) {
      setStatus({ type: 'danger', msg: 'GPS not supported.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Use 24H format for comparison
        const now = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });

        if (dbUser) {
          const { shift_start: s, shift_end: e } = dbUser;
          // Logic for shift hours including midnight crossing
          const onShift = s <= e ? (now >= s && now <= e) : (now >= s || now <= e);
          setIsCurrentlyOnShift(onShift);

          // Update backend with location and check geofence
          fetch(`/api/user/update-location?email=${userEmail}&lat=${latitude}&lon=${longitude}`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
              if (data.is_inside) {
                setStatus({ 
                  type: data.is_present ? 'success' : 'warning', 
                  msg: data.is_present ? `Inside Geofence: Present (${now})` : `Inside Geofence: Shift starts at ${s}`
                });
              } else {
                setStatus({ type: 'danger', msg: `Outside Geofence! Attendance restricted. (${now})` });
              }
            });
        }
      },
      () => setStatus({ type: 'danger', msg: 'Location blocked. Enable GPS.' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [dbUser, userEmail]);

  useEffect(() => {
    if (!dbUser) return;
    syncLocation(false);
    const interval = setInterval(() => syncLocation(false), 60000);
    return () => clearInterval(interval);
  }, [dbUser, syncLocation]);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8}>
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-dark p-4 text-white text-center">
              <h2 className="fw-bold mb-1">Shift Duty Status</h2>
              <Badge bg="danger" className="p-2 px-3 mb-2">
                <ShieldCheck size={14} className="me-1" /> ID: {dbUser?.blockchain_id || "PENDING"}
              </Badge>
              <p className="opacity-75 mb-0 small">{userEmail}</p>
            </div>
            
            <Card.Body className="p-5 text-center">
              <Alert variant={status.type} className="mb-4 small fw-bold py-3 text-start d-flex align-items-center">
                <MapIcon size={18} className="me-3" /> {status.msg}
              </Alert>

              <div className="d-flex justify-content-center gap-4 mb-4">
                <div className="text-center">
                  <p className="text-muted small fw-bold mb-1">SHIFT START</p>
                  <h3 className="fw-bold text-dark">{dbUser?.shift_start}</h3>
                </div>
                <div className="vr"></div>
                <div className="text-center">
                  <p className="text-muted small fw-bold mb-1">SHIFT END</p>
                  <h3 className="fw-bold text-dark">{dbUser?.shift_end}</h3>
                </div>
              </div>

              <div className="p-3 bg-light rounded-3 border mb-4">
                <p className="small text-muted mb-2">Duty Status</p>
                <div className="d-flex align-items-center justify-content-center gap-2">
                  <div className={`rounded-circle ${isCurrentlyOnShift ? 'bg-success' : 'bg-secondary'}`} style={{width: 10, height: 10}}></div>
                  <span className="fw-bold">{isCurrentlyOnShift ? "ON DUTY" : "OFF DUTY"}</span>
                </div>
              </div>

              <Button variant="danger" className="mb-4 fw-bold px-5 py-2 shadow-sm" onClick={() => syncLocation(true)}>
                <MapPin size={18} className="me-2" /> Manual Sync & Check-In
              </Button>

              <div className="text-muted d-flex align-items-center justify-content-center gap-1 small">
                 Secured via Blockchain Ledger System
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default UserDashboard;