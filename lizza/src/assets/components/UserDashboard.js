import React, { useEffect, useState, useCallback } from 'react';
import { Container, Row, Col, Card, Spinner, Button, Alert, Badge, ProgressBar, Modal, Form } from 'react-bootstrap';
import { ShieldCheck, MapPin, Map as MapIcon, Clock, AlertTriangle, KeyRound } from 'lucide-react';

const UserDashboard = () => {
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Status State
  const [status, setStatus] = useState({ 
    type: 'info', 
    msg: 'Initializing...', 
    code: 'normal' 
  });
  
  // Timers State
  const [violationTime, setViolationTime] = useState(null); 
  const [checkInTimeLeft, setCheckInTimeLeft] = useState(null); 
  
  // --- NEW: Password Change State ---
  const [showPassModal, setShowPassModal] = useState(false);
  const [isForceChange, setIsForceChange] = useState(false);
  const [passForm, setPassForm] = useState({ oldPass: '', newPass: '', confirmPass: '' });
  const [passError, setPassError] = useState('');
  
  const userEmail = localStorage.getItem('userEmail');

  // --- 1. Load User Profile & Check Force Password Change ---
  useEffect(() => {
    // Check if login flagged a forced password change
    if (localStorage.getItem('forcePasswordChange') === 'true') {
      setIsForceChange(true);
      setShowPassModal(true);
    }

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

  // --- 2. Calculate Check-In Timer ---
  useEffect(() => {
    if (!dbUser) return;
    
    const interval = setInterval(() => {
      const [h, m] = dbUser.shift_start.split(':');
      const now = new Date();
      const shiftStart = new Date();
      shiftStart.setHours(parseInt(h), parseInt(m), 0);
      
      const graceEnd = new Date(shiftStart.getTime() + 15 * 60000); 
      const diff = graceEnd - now;
      
      if (diff > 0 && diff < 15 * 60000) {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setCheckInTimeLeft(`${mins}m ${secs}s`);
      } else {
        setCheckInTimeLeft(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [dbUser]);

  // --- 3. Sync Location & Handle Alerts ---
  const syncLocation = useCallback((isManual = false) => {
    if (!navigator.geolocation) {
         setStatus({ type: 'danger', msg: 'GPS not supported', code: 'error' });
         return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;

        fetch(`/api/user/update-location?email=${userEmail}&lat=${latitude}&lon=${longitude}`, { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            if (data.status === 'warning') {
              setViolationTime(data.warning_seconds);
              setStatus({ type: 'danger', msg: `OUT OF BOUNDS! Return in ${data.warning_seconds}s`, code: 'warning' });
            } 
            else if (data.status === 'violation') {
              setViolationTime(0);
              setStatus({ type: 'danger', msg: 'MARKED ABSENT: Geofence Timeout', code: 'violation' });
            }
            else if (data.is_inside) {
              setViolationTime(null);
              setStatus({ type: 'success', msg: data.message || 'You are Inside Geofence', code: 'inside' });
            } 
            else {
              setViolationTime(null);
              setStatus({ type: 'warning', msg: 'Outside Geofence', code: 'outside' });
            }
          })
          .catch(() => setStatus({ type: 'danger', msg: 'Sync Error', code: 'error' }));
      },
      (err) => {
          console.error("Loc Error", err);
          setStatus({ type: 'danger', msg: 'Location blocked. Enable GPS.', code: 'gps_error' });
      },
      { enableHighAccuracy: true }
    );
  }, [userEmail]);

  useEffect(() => {
    if (!dbUser) return;
    syncLocation();
    const interval = setInterval(syncLocation, 10000);
    return () => clearInterval(interval);
  }, [dbUser, syncLocation]);

  // --- 4. NEW: Handle Password Submit ---
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPassError('');

    if (passForm.newPass !== passForm.confirmPass) {
        return setPassError("New passwords do not match.");
    }
    if (passForm.newPass.length < 8) {
        return setPassError("Password must be at least 8 characters long.");
    }

    try {
        const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: userEmail,
                old_password: passForm.oldPass,
                new_password: passForm.newPass
            })
        });

        const data = await res.json();

        if (res.ok) {
            alert("Password updated successfully!");
            localStorage.removeItem('forcePasswordChange');
            setIsForceChange(false);
            setShowPassModal(false);
            setPassForm({ oldPass: '', newPass: '', confirmPass: '' });
        } else {
            setPassError(data.detail || "Failed to update password");
        }
    } catch (err) {
        setPassError("Network error. Please try again.");
    }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card className={`border-0 shadow-lg overflow-hidden ${status.code === 'warning' ? 'border-danger border-5' : ''}`}>
            
            {/* --- HEADER --- */}
            <div className={`p-4 text-white text-center position-relative ${status.code === 'warning' ? 'bg-danger' : 'bg-dark'}`}>
              
              {/* Change Password Button in Top Right */}
              <Button 
                variant="outline-light" 
                size="sm" 
                className="position-absolute top-0 end-0 m-3 d-flex align-items-center"
                onClick={() => setShowPassModal(true)}
              >
                <KeyRound size={14} className="me-1" /> Security
              </Button>

              <h2 className="fw-bold mb-1 mt-3">
                 {status.code === 'warning' ? '⚠️ RETURN TO OFFICE' : 'Shift Duty Status'}
              </h2>
              <Badge bg="light" text="dark" className="p-2 px-3 mb-2 shadow-sm">
                <ShieldCheck size={14} className="me-1" /> ID: {dbUser?.blockchain_id || "PENDING"}
              </Badge>
              <div className="opacity-75 small">{dbUser?.full_name} • {userEmail}</div>
            </div>
            
            <Card.Body className="p-4 text-center">
              
              {/* --- 5 MINUTE VIOLATION ALERT --- */}
              {violationTime !== null && (
                <div className="mb-4">
                    <h1 className="display-4 fw-bold text-danger">{violationTime}s</h1>
                    <ProgressBar animated variant="danger" now={(violationTime / 300) * 100} className="mb-2" style={{height: '10px'}} />
                    <small className="text-danger fw-bold">If this reaches 0, you will be marked ABSENT.</small>
                </div>
              )}

              {/* --- STATUS ALERT --- */}
              <Alert variant={status.type} className="mb-4 small fw-bold py-3 text-start d-flex align-items-center justify-content-center">
                {status.code === 'warning' ? <AlertTriangle size={18} className="me-2" /> : <MapIcon size={18} className="me-2" />} 
                {status.msg}
              </Alert>

              {/* --- SHIFT TIMES --- */}
              <div className="d-flex justify-content-center gap-5 mb-4">
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

              {/* --- 15 MIN CHECK-IN TIMER --- */}
              {checkInTimeLeft && status.code !== 'violation' && (
                  <div className="mb-4 p-2 bg-warning bg-opacity-10 rounded border border-warning">
                      <div className="d-flex align-items-center justify-content-center text-warning fw-bold">
                          <Clock size={16} className="me-2"/>
                          Time remaining to mark Present:
                      </div>
                      <h4 className="fw-bold text-dark mt-1">{checkInTimeLeft}</h4>
                  </div>
              )}

              {/* --- DUTY INDICATOR --- */}
              <div className="p-3 bg-light rounded-3 border mb-4">
                <p className="small text-muted mb-2">Duty Status</p>
                <div className="d-flex align-items-center justify-content-center gap-2">
                  <div className={`rounded-circle ${status.code === 'inside' ? 'bg-success' : 'bg-secondary'}`} style={{width: 10, height: 10}}></div>
                  <span className="fw-bold">
                      {status.code === 'inside' ? "ON DUTY" : (status.code === 'violation' ? "ABSENT (VIOLATION)" : "OFF DUTY / OUTSIDE")}
                  </span>
                </div>
              </div>

              {/* --- MANUAL SYNC BUTTON --- */}
              <Button variant="danger" className="mb-4 fw-bold w-100 py-3 shadow-sm" onClick={() => syncLocation(true)}>
                <MapPin size={18} className="me-2" /> Manual Sync & Check-In
              </Button>

              <div className="text-muted small">
                 Secured via Blockchain Ledger System
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* --- PASSWORD CHANGE MODAL --- */}
      <Modal 
        show={showPassModal} 
        onHide={() => !isForceChange && setShowPassModal(false)} 
        backdrop={isForceChange ? 'static' : true}
        keyboard={!isForceChange}
        centered
      >
        <Modal.Header closeButton={!isForceChange} className="border-0 bg-light">
          <Modal.Title className="fw-bold h5 d-flex align-items-center">
            <KeyRound className="me-2 text-danger" size={20}/> 
            {isForceChange ? 'Mandatory Security Update' : 'Change Password'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {isForceChange && (
            <Alert variant="warning" className="small">
              For your security, you must change your initial password before accessing the dashboard.
            </Alert>
          )}
          
          {passError && <Alert variant="danger" className="small">{passError}</Alert>}

          <Form onSubmit={handlePasswordSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">Current Password</Form.Label>
              <Form.Control 
                type="password" 
                required 
                placeholder={isForceChange ? "Enter your DOB (DDMMYYYY)" : "Current password"}
                value={passForm.oldPass}
                onChange={e => setPassForm({...passForm, oldPass: e.target.value})} 
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">New Password</Form.Label>
              <Form.Control 
                type="password" 
                required 
                placeholder="At least 8 characters"
                value={passForm.newPass}
                onChange={e => setPassForm({...passForm, newPass: e.target.value})} 
              />
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label className="small fw-bold">Confirm New Password</Form.Label>
              <Form.Control 
                type="password" 
                required 
                placeholder="Type new password again"
                value={passForm.confirmPass}
                onChange={e => setPassForm({...passForm, confirmPass: e.target.value})} 
              />
            </Form.Group>

            <div className="d-flex justify-content-end gap-2">
              {!isForceChange && (
                <Button variant="light" onClick={() => setShowPassModal(false)}>Cancel</Button>
              )}
              <Button type="submit" variant="danger" className="fw-bold px-4">
                Update Password
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

    </Container>
  );
};

export default UserDashboard;