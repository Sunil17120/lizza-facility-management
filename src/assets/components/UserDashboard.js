import React, { useEffect, useState, useCallback } from 'react'; // Added useCallback
import { Container, Row, Col, Card, Spinner, Button, Alert } from 'react-bootstrap';
import { Clock, ShieldCheck, MapPin, Navigation } from 'lucide-react';

const UserDashboard = () => {
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: 'info', msg: 'System standby' });
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

  // FIX: Wrap syncLocation in useCallback to satisfy ESLint
  const syncLocation = useCallback((isManual = false) => {
    if (!navigator.geolocation) {
      setStatus({ type: 'danger', msg: 'GPS not supported by this browser.' });
      return;
    }

    if (isManual) setStatus({ type: 'warning', msg: 'Syncing GPS...' });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = new Date().toTimeString().slice(0, 5);

        // Check shift hours logic
        if (dbUser && (now >= dbUser.shift_start && now <= dbUser.shift_end)) {
          fetch(`/api/user/update-location?email=${userEmail}&lat=${latitude}&lon=${longitude}`, { method: 'POST' })
            .then(res => res.json())
            .then(() => {
              setStatus({ type: 'success', msg: `Live Tracking Active (Last sync: ${now})` });
            })
            .catch(() => setStatus({ type: 'danger', msg: 'Server sync failed.' }));
        } else if (isManual) {
          setStatus({ type: 'info', msg: `GPS Working, but you are currently Off-Shift.` });
        }
      },
      (err) => {
        setStatus({ type: 'danger', msg: 'Location blocked. Please allow GPS in settings.' });
        if (isManual) alert("Please enable Location/GPS permissions in your browser settings.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [dbUser, userEmail]);

  useEffect(() => {
    if (!dbUser) return;
    
    // Initial sync
    syncLocation(false);
    
    // Auto-sync every 2 minutes
    const interval = setInterval(() => syncLocation(false), 120000);
    return () => clearInterval(interval);
  }, [dbUser, syncLocation]); // syncLocation is now a stable dependency

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8}>
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-danger p-4 text-white text-center">
              <h2 className="fw-bold mb-0">Shift Duty Status</h2>
              <p className="opacity-75 mb-0">{userEmail}</p>
            </div>
            <Card.Body className="p-5 text-center">
              
              <Alert variant={status.type} className="mb-4 small fw-bold py-2 text-start">
                <Navigation size={14} className="me-2" /> {status.msg}
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

              <Button 
                variant="danger" 
                className="mb-4 fw-bold px-4 shadow-sm"
                onClick={() => syncLocation(true)}
              >
                <MapPin size={18} className="me-2" /> Manual Check-In
              </Button>

              <div className="bg-light p-3 rounded-3 d-flex align-items-center justify-content-center gap-2 mb-4">
                <Clock className="text-danger" size={20} />
                <span className="fw-bold">Tracking active during duty hours.</span>
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