import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { Container, Row, Col, Card, Spinner, Button, Alert, Badge, Modal, Form } from 'react-bootstrap';
import { ShieldCheck, MapPin, MapIcon, AlertTriangle, KeyRound, EyeOff, WifiOff } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useUser } from './UserContext'; 

// REPLACE THIS:
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

// WITH THIS (Your actual Hugging Face backend URL):
const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";
const isApp = Capacitor.isNativePlatform();

const calculateDistance = (lat1, lon1, lat2, lon2) => { const R = 6371000; const toRad = (deg) => (deg * Math.PI) / 180; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };

const UserDashboard = () => {
  const navigate = useNavigate(); 
  const { user: contextUser, loading: contextLoading } = useUser();

  const [dbUser, setDbUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: 'info', msg: 'Initializing...', code: 'off_duty' });
  const [showPassModal, setShowPassModal] = useState(false);
  
  const [checkedIn, setCheckedIn] = useState(() => localStorage.getItem('local_checked_in') === 'true');
  const [currentSite, setCurrentSite] = useState(() => {
    const cached = localStorage.getItem('local_current_site');
    return cached ? JSON.parse(cached) : null;
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  
  const userEmail = localStorage.getItem('userEmail');
  const checkedInRef = useRef(checkedIn);
  const currentSiteRef = useRef(currentSite);
  const isProcessingRef = useRef(false);

  useEffect(() => { checkedInRef.current = checkedIn; }, [checkedIn]);
  useEffect(() => { currentSiteRef.current = currentSite; }, [currentSite]);

  const updatePendingCount = useCallback(() => {
    if (!isApp) return; 
    const pings = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
    const actions = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    setPendingSyncCount(pings.length + actions.length);
  }, []);

  const fetchData = useCallback(async () => {
    if (!userEmail || !navigator.onLine) return;
    
    const [profRes, locRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}`).catch(() => ({ok: false})),
        fetch(`${API_BASE_URL}/api/admin/locations`).catch(() => ({ok: false}))
    ]);

    let loadedLocs = [];
    if (locRes && locRes.ok) {
        loadedLocs = await locRes.json();
        setLocations(loadedLocs);
    }

    if (profRes && profRes.ok) {
      const data = await profRes.json();
      setCheckedIn(Boolean(data.checked_in));
      
      if (data.checked_in && data.active_location_id) {
          localStorage.setItem('local_checked_in', 'true');
          const site = loadedLocs.find(l => l.id === data.active_location_id);
          if (site) {
              setCurrentSite(site);
              localStorage.setItem('local_current_site', JSON.stringify(site));
              setStatus({ type: 'success', msg: `Inside Geofence: ${site.name}`, code: 'inside' });
          }
      } else {
          localStorage.setItem('local_checked_in', 'false');
          localStorage.removeItem('local_current_site');
          setCurrentSite(null);
          setStatus({ type: 'secondary', code: 'off_duty', msg: 'Ready to Check In' });
      }
    }
  }, [userEmail]);

  const processOfflineQueues = useCallback(async () => {
    if (!isOnline || !isApp) return;

    const offlineLocations = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
    if (offlineLocations.length > 0) {
      const res = await fetch(`${API_BASE_URL}/api/user/sync-offline-locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, locations: offlineLocations })
      }).catch(()=>{});
      if (res && res.ok) localStorage.removeItem('offlineLocations');
    }

    let attendanceQueue = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    let failedActions = [];

    for (let action of attendanceQueue) {
      const endpoint = action.actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      }).catch(()=>{});
      if (!res || !res.ok) failedActions.push(action);
    }
    
    localStorage.setItem('offlineAttendanceQueue', JSON.stringify(failedActions));
    updatePendingCount();
    fetchData();
  }, [isOnline, userEmail, fetchData, updatePendingCount]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); if (isApp) processOfflineQueues(); };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    fetchData(); 
    if (isApp) { updatePendingCount(); if (navigator.onLine) processOfflineQueues(); }

    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [processOfflineQueues, updatePendingCount, fetchData]);

  useEffect(() => {
    if (!contextLoading && contextUser) {
      if (contextUser.user_type === 'field_officer') return navigate('/field-operations', { replace: true });
      if (contextUser.user_type === 'manager') return navigate('/manager', { replace: true });
      if (contextUser.user_type === 'admin') return navigate('/admin', { replace: true });
      setDbUser(contextUser); 
      setLoading(false); 
    } else if (!contextLoading && !contextUser) {
      navigate('/auth', { replace: true });
    }
  }, [contextUser, contextLoading, navigate]);

  const handleAction = async (actionType, targetSite, triggerLat, triggerLon) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setActionLoading(true);
    
    let exactTime = new Date().toISOString();
    if (actionType === 'CHECK_IN' && targetSite) {
        const savedTime = localStorage.getItem(`normal_entry_time_${targetSite.id}`);
        if (savedTime) exactTime = savedTime;
    }

    const payload = {
      email: userEmail, lat: triggerLat || 0, lon: triggerLon || 0, 
      timestamp: exactTime, actionType, location_id: targetSite?.id || null
    };

    if (!isOnline) {
        if (isApp) {
            const queue = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
            queue.push(payload);
            localStorage.setItem('offlineAttendanceQueue', JSON.stringify(queue));
            
            setCheckedIn(actionType === 'CHECK_IN');
            localStorage.setItem('local_checked_in', actionType === 'CHECK_IN');
            
            if (actionType === 'CHECK_IN') {
                setCurrentSite(targetSite);
                if (targetSite) localStorage.setItem('local_current_site', JSON.stringify(targetSite));
            } else {
                if (targetSite) localStorage.removeItem(`normal_entry_time_${targetSite.id}`);
                setCurrentSite(null);
                localStorage.removeItem('local_current_site');
            }
            setStatus({ type: 'warning', msg: `Offline ${actionType === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} queued`, code: 'offline' });
            updatePendingCount();
        }
    } else {
        const endpoint = actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${endpoint}`, { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) 
        }).catch(() => ({ok: false}));
        
        if (res && res.ok) {
          setCheckedIn(actionType === 'CHECK_IN');
          localStorage.setItem('local_checked_in', actionType === 'CHECK_IN');

          if (actionType === 'CHECK_IN') {
              setCurrentSite(targetSite);
              if (targetSite) localStorage.setItem('local_current_site', JSON.stringify(targetSite));
              setStatus({ type: 'success', msg: `Checked In at ${targetSite?.name || 'site'}`, code: 'inside' });
          } else {
              if (targetSite) localStorage.removeItem(`normal_entry_time_${targetSite.id}`);
              setCurrentSite(null);
              localStorage.removeItem('local_current_site');
              setStatus({ type: 'secondary', msg: 'Checked Out', code: 'off_duty' });
          }
        }
    }
    setActionLoading(false);
    isProcessingRef.current = false;
  };

  const processLocationTick = useCallback(async (lat, lon) => {
    // 1. Send Ping to Backend (so Admin can see them on live map)
    if (navigator.onLine && dbUser) {
      fetch(`${API_BASE_URL}/api/user/update-location?email=${userEmail}&lat=${lat}&lon=${lon}`, { method: 'POST' }).catch(()=>{});
    } else if (!navigator.onLine && isApp) {
      const q = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
      q.push({ lat, lon, timestamp: new Date().toISOString() });
      localStorage.setItem('offlineLocations', JSON.stringify(q));
      updatePendingCount();
    }

    // 2. Client-Side Geofence Logic for 30-min Auto Check-in/out
    if (!locations.length) return;

    const sitesWithDistance = locations.map(site => ({ ...site, distance: calculateDistance(lat, lon, site.lat, site.lon) }));
    sitesWithDistance.sort((a, b) => a.distance - b.distance);
    const insideSite = sitesWithDistance[0] && sitesWithDistance[0].distance <= (sitesWithDistance[0].radius || 200) ? sitesWithDistance[0] : null;

    if (insideSite) {
        if (!localStorage.getItem(`normal_entry_time_${insideSite.id}`)) {
            localStorage.setItem(`normal_entry_time_${insideSite.id}`, new Date().toISOString());
        }
    }

    if (!isProcessingRef.current) {
        if (insideSite && !checkedInRef.current) {
            handleAction('CHECK_IN', insideSite, lat, lon);
        } 
        else if (checkedInRef.current && currentSiteRef.current) {
            // THE CROSS-SITE AUTO SWAP LOGIC
            if (insideSite && insideSite.id !== currentSiteRef.current.id) {
                handleAction('CHECK_OUT', currentSiteRef.current, lat, lon).then(() => {
                    setTimeout(() => handleAction('CHECK_IN', insideSite, lat, lon), 2000); // 2 sec buffer to safely swap
                });
            } else if (!insideSite) {
                const distToActive = calculateDistance(lat, lon, currentSiteRef.current.lat, currentSiteRef.current.lon);
                if (distToActive > 300) {
                    handleAction('CHECK_OUT', currentSiteRef.current, lat, lon);
                }
            }
        }
    }
  }, [locations, userEmail, dbUser, updatePendingCount]);

  useEffect(() => {
    if (!dbUser || !navigator.geolocation) return; 
    
    const pingInterval = 1800000; // Exact 30 Minutes

    const syncTask = () => {
        navigator.geolocation.getCurrentPosition(
            (pos) => processLocationTick(pos.coords.latitude, pos.coords.longitude),
            (err) => console.warn("Location check failed:", err),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    syncTask();
    const intervalId = setInterval(syncTask, pingInterval);

    return () => clearInterval(intervalId);
  }, [dbUser, processLocationTick]);

  const handleManualAction = async (actionType) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            
            let targetSite = null;
            if (actionType === 'CHECK_IN') {
                const sitesWithDistance = locations.map(site => ({ ...site, distance: calculateDistance(lat, lon, site.lat, site.lon) }));
                sitesWithDistance.sort((a, b) => a.distance - b.distance);
                targetSite = sitesWithDistance[0] && sitesWithDistance[0].distance <= (sitesWithDistance[0].radius || 200) ? sitesWithDistance[0] : null;
            } else {
                targetSite = currentSite;
            }
            
            handleAction(actionType, targetSite, lat, lon);
        },
        () => alert("Unable to get high-accuracy GPS for manual action."),
        { enableHighAccuracy: true }
    );
  };

  const isOnDuty = checkedIn;
  const dutyLabel = isOnDuty ? 'ON DUTY' : 'OFF DUTY (Privacy Active)';
  const dutyDotClass = isOnDuty ? 'bg-success' : 'bg-secondary';

  if (loading || contextLoading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card className={`border-0 shadow-lg overflow-hidden ${status.code === 'warning' ? 'border-danger border-5' : ''}`}>
            
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
              <Alert variant={status.type} className="mb-4 small fw-bold py-3 text-start d-flex align-items-center justify-content-between flex-wrap">
                <div className="d-flex align-items-center mb-2 mb-md-0">
                    {status.code === 'warning' || status.code === 'offline' ? <AlertTriangle size={18} className="me-2" /> : 
                     status.code === 'off_duty' ? <EyeOff size={18} className="me-2 text-secondary" /> : 
                     <MapIcon size={18} className="me-2" />} 
                    {status.msg}
                </div>
              </Alert>

              <div className="p-3 bg-light rounded-3 border mb-4 text-start">
                <p className="small text-muted mb-2">Current Assigned Site</p>
                <div className="fw-bold">{currentSite ? currentSite.name : 'Awaiting 30-min Auto Ping or Manual Entry'}</div>
              </div>

              <div className="p-3 bg-light rounded-3 border mb-4">
                <p className="small text-muted mb-2">Duty Status</p>
                <div className="d-flex align-items-center justify-content-center gap-2">
                  <div className={`rounded-circle ${dutyDotClass}`} style={{width: 10, height: 10}}></div>
                  <span className="fw-bold">{dutyLabel}</span>
                </div>
              </div>

              <div className="d-flex gap-2 mb-3">
                <Button variant="success" className="fw-bold flex-fill d-flex align-items-center justify-content-center" onClick={() => handleManualAction('CHECK_IN')} disabled={checkedIn || actionLoading}>
                  {actionLoading && <Spinner animation="border" size="sm" className="me-2" />}<MapPin size={16} className="me-2" />{checkedIn ? 'Checked In' : 'Force Check-In'}
                </Button>
                <Button variant="outline-danger" className="fw-bold flex-fill d-flex align-items-center justify-content-center" onClick={() => handleManualAction('CHECK_OUT')} disabled={!checkedIn || actionLoading}>
                  {actionLoading && <Spinner animation="border" size="sm" className="me-2" /> }Force Check-Out
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