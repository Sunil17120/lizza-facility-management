// Build trigger IST 2026-04-10
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { Container, Row, Col, Card, Spinner, Button, Alert, Badge, ProgressBar, Modal, Form } from 'react-bootstrap';
import { ShieldCheck, MapPin, Map as MapIcon, Clock, AlertTriangle, KeyRound, EyeOff } from 'lucide-react';
import { registerPlugin } from '@capacitor/core';
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const UserDashboard = () => {
  const navigate = useNavigate(); 
  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: 'info', msg: 'Initializing...', code: 'normal' });
  const [violationTime, setViolationTime] = useState(null);
  const [showPassModal, setShowPassModal] = useState(false);
  const [isForceChange, setIsForceChange] = useState(false);
  const [passForm, setPassForm] = useState({ oldPass: '', newPass: '', confirmPass: '' });
  const [passError, setPassError] = useState('');
  const [checkedIn, setCheckedIn] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (localStorage.getItem('forcePasswordChange') === 'true') { setIsForceChange(true); setShowPassModal(true); }

    if (userEmail) {
      fetch(`/api/user/profile?email=${userEmail}`)
        .then(res => res.json())
        .then(data => { 
          if (data.user_type === 'field_officer') return navigate('/field-operations', { replace: true });
          if (data.user_type === 'manager') return navigate('/manager', { replace: true });
          if (data.user_type === 'admin') return navigate('/admin', { replace: true });
          setDbUser(data); 
          setCheckedIn(Boolean(data.checked_in));
          setLoading(false); 
        })
        .catch(() => setLoading(false));
    }
  }, [userEmail, navigate]);

  const syncLocation = useCallback(async (lat, lon) => {
    try {
      const res = await fetch(`/api/user/update-location?email=${userEmail}&lat=${lat}&lon=${lon}`, { method: 'POST' });
      const data = await res.json();

      if (data.is_inside) {
        setViolationTime(null);
        setStatus({ type: 'success', msg: data.message || 'Inside Geofence', code: 'inside' });
      } else {
        setViolationTime(null);
        setStatus({ type: 'warning', msg: 'Outside Geofence', code: 'outside' });
      }
    } catch (err) {
      setStatus({ type: 'danger', msg: 'Sync Error', code: 'error' });
    }
  }, [userEmail]);

  const handleCheckIn = async () => {
    if (actionLoading || status.code !== 'inside') return;
    setActionLoading(true);
    try {
      if (!navigator.geolocation) throw new Error('Location access is required for geofence validation.');
      const coords = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: true }
        );
      });

      const res = await fetch('/api/user/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail, lat: coords.latitude, lon: coords.longitude }) });
      const data = await res.json();
      if (res.ok) {
        setCheckedIn(true);
        setStatus({ type: 'success', msg: data.message || 'Checked In', code: 'inside' });
        if (data.updated_user) setDbUser(data.updated_user);
      } else {
        setStatus({ type: 'danger', msg: data.detail || data.message || 'Check-in failed', code: 'error' });
      }
    } catch (err) {
      const msg = err?.message || 'Network error during check-in';
      setStatus({ type: 'danger', msg, code: 'error' });
    } finally { setActionLoading(false); }
  };

  const handleCheckOut = async () => {
    if (actionLoading || status.code !== 'inside') return;
    setActionLoading(true);
    try {
      if (!navigator.geolocation) throw new Error('Location access is required for geofence validation.');
      const coords = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: true }
        );
      });

      const res = await fetch('/api/user/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail, lat: coords.latitude, lon: coords.longitude }) });
      const data = await res.json();
      if (res.ok) {
        setCheckedIn(false);
        setStatus({ type: 'secondary', msg: data.message || 'Checked Out', code: 'outside' });
        if (data.updated_user) setDbUser(data.updated_user);
      } else {
        setStatus({ type: 'danger', msg: data.detail || data.message || 'Check-out failed', code: 'error' });
      }
    } catch (err) {
      const msg = err?.message || 'Network error during check-out';
      setStatus({ type: 'danger', msg, code: 'error' });
    } finally { setActionLoading(false); }
  };

  useEffect(() => {
    if (!dbUser) return;
    const startBackgroundTracking = async () => {
      try {
        await BackgroundGeolocation.addWatcher(
          { backgroundMessage: "Tracking duty status and geofence safety.", backgroundTitle: "Lizza Duty Tracking Active", requestPermissions: true, stale: false, interval: 300000, distanceFilter: 0 },
          (location, error) => {
            if (error) return console.error(error);
            if (location) syncLocation(location.latitude, location.longitude);
          }
        );
      } catch (err) { console.warn("Native tracking skipped (running on web)."); }
    };
    startBackgroundTracking();
    return () => { try { BackgroundGeolocation.removeWatcher(); } catch (e) {} };
  }, [dbUser, syncLocation]);

  useEffect(() => {
    if (!dbUser) return;
    const pingLocation = () => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => syncLocation(pos.coords.latitude, pos.coords.longitude),
          (err) => console.error("Web GPS Error. Please allow location access:", err),
          { enableHighAccuracy: true }
        );
      }
    };
    pingLocation();
    const intervalId = setInterval(pingLocation, 60000); 
    return () => clearInterval(intervalId);
  }, [dbUser, syncLocation]);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault(); setPassError('');
    if (passForm.newPass !== passForm.confirmPass) return setPassError("Passwords do not match.");
    if (passForm.newPass.length < 8) return setPassError("At least 8 characters long.");
    try {
        const res = await fetch('/api/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail, old_password: passForm.oldPass, new_password: passForm.newPass }) });
        const data = await res.json();
        if (res.ok) { alert("Password updated!"); localStorage.removeItem('forcePasswordChange'); setIsForceChange(false); setShowPassModal(false); setPassForm({ oldPass: '', newPass: '', confirmPass: '' }); } 
        else setPassError(data.detail || "Failed to update");
    } catch (err) { setPassError("Network error."); }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card className={`border-0 shadow-lg overflow-hidden ${status.code === 'warning' ? 'border-danger border-5' : ''}`}>
            {/* Dynamic Header Background based on status */}
            <div className={`p-4 text-white text-center position-relative ${status.code === 'warning' ? 'bg-danger' : status.code === 'off_duty' ? 'bg-secondary' : 'bg-dark'}`}>
              <Button variant="outline-light" size="sm" className="position-absolute top-0 end-0 m-3 d-flex align-items-center" onClick={() => setShowPassModal(true)}><KeyRound size={14} className="me-1" /> Security</Button>
              <h2 className="fw-bold mb-1 mt-3">
                {status.code === 'warning' ? '⚠️ RETURN TO OFFICE' : status.code === 'off_duty' ? 'Shift Completed' : 'Shift Duty Status'}
              </h2>
              <Badge bg="light" text="dark" className="p-2 px-3 mb-2 shadow-sm"><ShieldCheck size={14} className="me-1" /> ID: {dbUser?.blockchain_id || "PENDING"}</Badge>
              <div className="opacity-75 small">{dbUser?.full_name} • {userEmail}</div>
            </div>
            
            <Card.Body className="p-4 text-center">
              {violationTime !== null && (
                <div className="mb-4">
                  <h1 className="display-4 fw-bold text-danger">{violationTime}s</h1>
                  <ProgressBar animated variant="danger" now={(violationTime / 300) * 100} className="mb-2" style={{height: '10px'}} />
                  <small className="text-danger fw-bold">If this reaches 0, you will be marked ABSENT.</small>
                </div>
              )}
              
              <Alert variant={status.type} className="mb-4 small fw-bold py-3 text-start d-flex align-items-center justify-content-center">
                {status.code === 'warning' ? <AlertTriangle size={18} className="me-2" /> : 
                 status.code === 'off_duty' ? <EyeOff size={18} className="me-2 text-secondary" /> : 
                 <MapIcon size={18} className="me-2" />} 
                {status.msg}
              </Alert>

              <div className="p-3 bg-light rounded-3 border mb-4">
                <p className="small text-muted mb-2">Duty Status</p>
                <div className="d-flex align-items-center justify-content-center gap-2">
                  <div className={`rounded-circle ${status.code === 'inside' ? 'bg-success' : status.code === 'off_duty' ? 'bg-secondary' : 'bg-secondary'}`} style={{width: 10, height: 10}}></div>
                  <span className="fw-bold">
                    {status.code === 'inside' ? "ON DUTY" : 
                     status.code === 'off_duty' ? "OFF DUTY (Privacy Active)" : 
                     (status.code === 'violation' ? "ABSENT (VIOLATION)" : "OFF DUTY / OUTSIDE")}
                  </span>
                </div>
              </div>

                    <div className="d-flex gap-2 mb-3">
                <Button variant="success" className="fw-bold flex-fill d-flex align-items-center justify-content-center" onClick={handleCheckIn} disabled={status.code !== 'inside' || checkedIn || actionLoading}>
                  {actionLoading && <Spinner animation="border" size="sm" className="me-2" />}<MapPin size={16} className="me-2" />{checkedIn ? 'Checked In' : 'Check In'}
                </Button>
                <Button variant="outline-danger" className="fw-bold flex-fill d-flex align-items-center justify-content-center" onClick={handleCheckOut} disabled={status.code !== 'inside' || !checkedIn || actionLoading}>
                  {actionLoading && <Spinner animation="border" size="sm" className="me-2" /> }Check Out
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Password Modal */}
      <Modal show={showPassModal} onHide={() => !isForceChange && setShowPassModal(false)} backdrop={isForceChange ? 'static' : true} keyboard={!isForceChange} centered>
        <Modal.Header closeButton={!isForceChange} className="border-0 bg-light"><Modal.Title className="fw-bold h5 d-flex align-items-center"><KeyRound className="me-2 text-danger" size={20}/> {isForceChange ? 'Mandatory Security Update' : 'Change Password'}</Modal.Title></Modal.Header>
        <Modal.Body className="p-4">
          {isForceChange && <Alert variant="warning" className="small">Please change your initial password before accessing the dashboard.</Alert>}
          {passError && <Alert variant="danger" className="small">{passError}</Alert>}
          <Form onSubmit={handlePasswordSubmit}>
            <Form.Group className="mb-3"><Form.Label className="small fw-bold">Current Password</Form.Label><Form.Control type="password" required placeholder={isForceChange ? "Enter your DOB (DDMMYYYY)" : "Current password"} value={passForm.oldPass} onChange={e => setPassForm({...passForm, oldPass: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label className="small fw-bold">New Password</Form.Label><Form.Control type="password" required placeholder="At least 8 characters" value={passForm.newPass} onChange={e => setPassForm({...passForm, newPass: e.target.value})} /></Form.Group>
            <Form.Group className="mb-4"><Form.Label className="small fw-bold">Confirm New Password</Form.Label><Form.Control type="password" required placeholder="Type new password again" value={passForm.confirmPass} onChange={e => setPassForm({...passForm, confirmPass: e.target.value})} /></Form.Group>
            <div className="d-flex justify-content-end gap-2">{!isForceChange && <Button variant="light" onClick={() => setShowPassModal(false)}>Cancel</Button>}<Button type="submit" variant="danger" className="fw-bold px-4">Update Password</Button></div>
          </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default UserDashboard;