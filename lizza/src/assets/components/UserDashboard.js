import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { Container, Row, Col, Card, Spinner, Button, Alert, Badge, Modal, Form } from 'react-bootstrap';
import { ShieldCheck, MapPin, MapIcon, AlertTriangle, KeyRound, EyeOff, WifiOff } from 'lucide-react';

// IMPORT CAPACITOR TO DETECT PLATFORM
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useUser } from './UserContext'; 

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const API_BASE_URL = 'https://lizza-facility-management.vercel.app';

// Detect if running natively on a phone or just in a web browser
const isApp = Capacitor.isNativePlatform();

const UserDashboard = () => {
  const navigate = useNavigate(); 
  const { user: contextUser, loading: contextLoading } = useUser();

  const [dbUser, setDbUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: 'info', msg: 'Initializing...', code: 'off_duty' });
  const [showPassModal, setShowPassModal] = useState(false);
  
  const [checkedIn, setCheckedIn] = useState(false);
  const [currentSite, setCurrentSite] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Offline UI Trackers
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  
  const userEmail = localStorage.getItem('userEmail');

  const updatePendingCount = useCallback(() => {
    if (!isApp) return; // Website doesn't use queues
    const pings = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
    const actions = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    setPendingSyncCount(pings.length + actions.length);
  }, []);

  const fetchProfileState = useCallback(async () => {
    if (!userEmail || !navigator.onLine) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}`);
      if (res.ok) {
        const data = await res.json();
        setCheckedIn(Boolean(data.checked_in));
        if (!data.checked_in && status.code !== 'warning') {
            setStatus(prev => ({ ...prev, code: 'off_duty', msg: 'Shift Completed' }));
        }
      }
    } catch (error) {
      console.error("Failed to sync profile state:", error);
    }
  }, [userEmail, status.code]);

  // --- OFFLINE SYNC PROCESSOR (APP ONLY) ---
  const processOfflineQueues = useCallback(async () => {
    if (!isOnline || !isApp) return; // Only process on mobile app

    // 1. Sync Background Pings
    const offlineLocations = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
    if (offlineLocations.length > 0) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/user/sync-offline-locations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, locations: offlineLocations })
        });
        if (res.ok) localStorage.removeItem('offlineLocations');
      } catch (e) { console.error("Failed to sync pings:", e); }
    }

    // 2. Sync Manual Check-Ins / Check-Outs sequentially
    let attendanceQueue = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    let failedActions = [];

    for (let action of attendanceQueue) {
      try {
        const endpoint = action.actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: action.email, lat: action.lat, lon: action.lon, timestamp: action.timestamp })
        });
        if (!res.ok) failedActions.push(action);
      } catch (e) {
        failedActions.push(action); 
      }
    }
    
    localStorage.setItem('offlineAttendanceQueue', JSON.stringify(failedActions));
    updatePendingCount();
    fetchProfileState();
  }, [isOnline, userEmail, fetchProfileState, updatePendingCount]);

  // Track network state globally
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (isApp) processOfflineQueues();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (isApp) {
      updatePendingCount();
      if (navigator.onLine) processOfflineQueues();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processOfflineQueues, updatePendingCount]);


  useEffect(() => {
    if (!contextLoading && contextUser) {
      if (contextUser.user_type === 'field_officer') return navigate('/field-operations', { replace: true });
      if (contextUser.user_type === 'manager') return navigate('/manager', { replace: true });
      if (contextUser.user_type === 'admin') return navigate('/admin', { replace: true });
      
      setDbUser(contextUser); 
      setCheckedIn(Boolean(contextUser.checked_in));
      setLoading(false); 
    } else if (!contextLoading && !contextUser) {
      navigate('/auth', { replace: true });
    }
  }, [contextUser, contextLoading, navigate]);

  const syncLocation = useCallback(async (lat, lon) => {
    if (!navigator.onLine) {
      if (!isApp) return; // Do nothing if offline on website
      const locData = { lat, lon, timestamp: new Date().toISOString() };
      const offlineLocations = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
      offlineLocations.push(locData);
      localStorage.setItem('offlineLocations', JSON.stringify(offlineLocations));
      setStatus({ type: 'warning', msg: 'Offline - Location queued locally', code: 'offline' });
      updatePendingCount();
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/user/update-location?email=${userEmail}&lat=${lat}&lon=${lon}`, { method: 'POST' });
      const data = await res.json();
      if (data.is_inside) {
        setCurrentSite(data.site_name || null);
        setStatus({ type: 'success', msg: data.message || 'Inside Geofence', code: 'inside' });
      } else {
        setCurrentSite(null);
        setStatus({ type: 'warning', msg: data.message || 'Outside Geofence', code: 'outside' });
      }
    } catch (e) {
      console.error("Location sync failed:", e);
    }
  }, [userEmail, updatePendingCount]);

  // WEB GEOLOCATION TRACKER: ONLY START ON WEBSITE
  useEffect(() => {
    if (!dbUser || isApp || !navigator.geolocation) return; // Website only
    
    // Get initial location
    navigator.geolocation.getCurrentPosition(
      (pos) => syncLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        console.error("Initial web geolocation failed:", err);
        setStatus({ type: 'warning', msg: 'Location permission required. Please enable location access.', code: 'outside' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Watch for continuous location updates
    const watchId = navigator.geolocation.watchPosition(
      (pos) => syncLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => console.error("Web geolocation watch failed:", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      if (navigator.geolocation && watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [dbUser, syncLocation]);

  // BACKGROUND TRACKER: ONLY START ON MOBILE APP
  useEffect(() => {
    if (!dbUser || !isApp) return; // Skip on Website
    const startBackgroundTracking = async () => {
      await BackgroundGeolocation.addWatcher(
        { 
          backgroundMessage: "Tracking duty status and geofence safety.", 
          backgroundTitle: "Lizza Duty Tracking Active", 
          requestPermissions: true, stale: false, interval: 300000, distanceFilter: 20,
          allowBackgroundLocationUpdates: true, autoSync: true, stopOnTerminate: false, startOnBoot: true       
        },
        (location) => { if (location) syncLocation(location.latitude, location.longitude); }
      );
    };
    startBackgroundTracking();
    return () => { BackgroundGeolocation.removeWatcher(); };
  }, [dbUser, syncLocation]);

  // --- ACTIONS (SPLIT LOGIC FOR APP vs WEBSITE) ---
  const handleAction = async (actionType) => {
    if (actionLoading || (actionType === 'CHECK_IN' && status.code !== 'inside' && isApp)) return;
    setActionLoading(true);
    
    if (!navigator.geolocation) {
        alert("Location services are required.");
        return setActionLoading(false);
    }
    
    const coords = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords), () => resolve(null), { enableHighAccuracy: true }
      );
    });

    if (coords) {
      const payload = {
        email: userEmail, lat: coords.latitude, lon: coords.longitude, 
        timestamp: new Date().toISOString(), actionType
      };

      if (!isOnline) {
        // PLATFORM SPLIT
        if (isApp) {
            // MOBILE APP: Queue Offline Action
            const queue = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
            queue.push(payload);
            localStorage.setItem('offlineAttendanceQueue', JSON.stringify(queue));
            
            setCheckedIn(actionType === 'CHECK_IN');
            setStatus({ type: 'warning', msg: `Offline ${actionType === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} queued`, code: 'offline' });
            updatePendingCount();
        } else {
            // WEBSITE: Hard Error
            setStatus({ type: 'danger', msg: "Network error. Please connect to the internet to perform this action.", code: 'error' });
        }
        setActionLoading(false);
        return;
      }

      // Online Execution (Both App and Website)
      try {
          const endpoint = actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
          const res = await fetch(`${API_BASE_URL}${endpoint}`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) 
          });
          const data = await res.json();
          
          if (res.ok) {
            setCheckedIn(actionType === 'CHECK_IN');
            if (actionType === 'CHECK_IN') {
                setCurrentSite(data.site_name || currentSite);
                setStatus({ type: 'success', msg: `Checked In at ${data.site_name || 'site'}`, code: 'inside' });
            } else {
                setCurrentSite(null);
                setStatus({ type: 'secondary', msg: 'Checked Out', code: 'off_duty' });
            }
            if (data.updated_user) setDbUser(data.updated_user);
          } else {
            setStatus({ type: 'danger', msg: data.detail || 'Action failed', code: 'error' });
          }
      } catch (err) {
          setStatus({ type: 'danger', msg: "Server communication failed.", code: 'error' });
      }
    }
    setActionLoading(false);
  };

  const isOnDuty = checkedIn && (status.code === 'inside' || status.code === 'offline');
  const dutyLabel = isOnDuty ? 'ON DUTY' : (!checkedIn && status.code === 'inside') ? 'READY TO CHECK IN' : status.code === 'off_duty' ? 'OFF DUTY (Privacy Active)' : status.code === 'error' ? 'ERROR' : 'OFF DUTY / OUTSIDE';
  const dutyDotClass = isOnDuty ? 'bg-success' : 'bg-secondary';

  if (loading || contextLoading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card className={`border-0 shadow-lg overflow-hidden ${status.code === 'warning' ? 'border-danger border-5' : ''}`}>
            
            {/* ONLY SHOW OFFLINE BANNER ON MOBILE APP */}
            {!isOnline && isApp && (
                <div className="bg-warning text-dark text-center py-2 small fw-bold d-flex align-items-center justify-content-center">
                    <WifiOff size={16} className="me-2" /> Offline Mode Active - {pendingSyncCount} pending syncs
                </div>
            )}

            <div className={`p-4 text-white text-center position-relative ${status.code === 'warning' ? 'bg-danger' : status.code === 'off_duty' ? 'bg-secondary' : 'bg-dark'}`}>
              <Button variant="outline-light" size="sm" className="position-absolute top-0 end-0 m-3 d-flex align-items-center" onClick={() => setShowPassModal(true)}><KeyRound size={14} className="me-1" /> Security</Button>
              <h2 className="fw-bold mb-1 mt-3">Shift Duty Status</h2>
              <Badge bg="light" text="dark" className="p-2 px-3 mb-2 shadow-sm"><ShieldCheck size={14} className="me-1" /> ID: {dbUser?.blockchain_id || "PENDING"}</Badge>
            </div>
            
            <Card.Body className="p-4 text-center">
              <Alert variant={status.type} className="mb-4 small fw-bold py-3 text-start d-flex align-items-center justify-content-center">
                {status.code === 'warning' || status.code === 'offline' ? <AlertTriangle size={18} className="me-2" /> : 
                 status.code === 'off_duty' ? <EyeOff size={18} className="me-2 text-secondary" /> : 
                 <MapIcon size={18} className="me-2" />} 
                {status.msg}
              </Alert>

              <div className="p-3 bg-light rounded-3 border mb-4 text-start">
                <p className="small text-muted mb-2">Current Site</p>
                <div className="fw-bold">{currentSite || (status.code === 'inside' ? 'Inside geofence area' : 'Outside geofence')}</div>
              </div>

              <div className="p-3 bg-light rounded-3 border mb-4">
                <p className="small text-muted mb-2">Duty Status</p>
                <div className="d-flex align-items-center justify-content-center gap-2">
                  <div className={`rounded-circle ${dutyDotClass}`} style={{width: 10, height: 10}}></div>
                  <span className="fw-bold">{dutyLabel}</span>
                </div>
              </div>

              <div className="d-flex gap-2 mb-3">
                <Button variant="success" className="fw-bold flex-fill d-flex align-items-center justify-content-center" onClick={() => handleAction('CHECK_IN')} disabled={(!isApp && !isOnline) || (isApp && status.code !== 'inside' && status.code !== 'offline') || checkedIn || actionLoading}>
                  {actionLoading && <Spinner animation="border" size="sm" className="me-2" />}<MapPin size={16} className="me-2" />{checkedIn ? 'Checked In' : 'Check In'}
                </Button>
                <Button variant="outline-danger" className="fw-bold flex-fill d-flex align-items-center justify-content-center" onClick={() => handleAction('CHECK_OUT')} disabled={!checkedIn || actionLoading}>
                  {actionLoading && <Spinner animation="border" size="sm" className="me-2" /> }Check Out
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};
export default UserDashboard;