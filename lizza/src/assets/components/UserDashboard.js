import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { Container, Row, Col, Card, Spinner, Button, Alert, Badge } from 'react-bootstrap';
// Added LogIn and LogOut to the imports here
import { ShieldCheck, MapPin, MapIcon, AlertTriangle, KeyRound, EyeOff, WifiOff, RefreshCw, LogIn, LogOut } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useUser } from './UserContext'; 
import { LocalNotifications } from '@capacitor/local-notifications';

const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";
const isApp = Capacitor.isNativePlatform();

const calculateDistance = (lat1, lon1, lat2, lon2) => { 
    const R = 6371000; 
    const toRad = (deg) => (deg * Math.PI) / 180; 
    const dLat = toRad(lat2 - lat1); 
    const dLon = toRad(lon2 - lon1); 
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2; 
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
};

const UserDashboard = () => {
  const navigate = useNavigate(); 
  const { user: contextUser, loading: contextLoading } = useUser();

  const [dbUser, setDbUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: 'info', msg: 'Initializing...', code: 'off_duty' });
  const [showPassModal, setShowPassModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);

  const triggerNotification = async (title, body) => {
    if (!isApp) return;
    try {
        await LocalNotifications.requestPermissions();
        await LocalNotifications.schedule({
            notifications: [{
                title: title,
                body: body,
                id: Math.floor(Math.random() * 1000), 
                schedule: { at: new Date(Date.now() + 1000) },
                smallIcon: 'ic_stat_icon_config_sample' 
            }]
        });
    } catch (e) {
        console.error("Notification failed:", e);
    }
  };
  
  const [checkedIn, setCheckedIn] = useState(() => localStorage.getItem('local_checked_in') === 'true');
  const [currentSite, setCurrentSite] = useState(() => {
    const cached = localStorage.getItem('local_current_site');
    return cached ? JSON.parse(cached) : null;
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // FIXED: Restored pendingOfflineActions state
  const [pendingOfflineActions, setPendingOfflineActions] = useState(0);
  
  const userEmail = localStorage.getItem('userEmail');
  const checkedInRef = useRef(checkedIn);
  const currentSiteRef = useRef(currentSite);
  const isProcessingRef = useRef(false);

  useEffect(() => { checkedInRef.current = checkedIn; }, [checkedIn]);
  useEffect(() => { currentSiteRef.current = currentSite; }, [currentSite]);

  // FIXED: Renamed to match the variable
  const updateQueueCounts = useCallback(() => {
    if (!isApp) return; 
    const pings = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
    const actions = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    setPendingOfflineActions(pings.length + actions.length);
  }, []);

  const fetchData = useCallback(async () => {
    if (!userEmail || !navigator.onLine) return;
    setIsSyncing(true);
    
    const [profRes, locRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}`),
        fetch(`${API_BASE_URL}/api/admin/locations`)
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
    setIsSyncing(false);
  }, [userEmail]);

  const processOfflineQueues = useCallback(async () => {
    if (!isOnline || !isApp) return;

    const offlineLocations = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
    if (offlineLocations.length > 0) {
      const res = await fetch(`${API_BASE_URL}/api/user/sync-offline-locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, locations: offlineLocations })
      });
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
      });
      if (!res || !res.ok) failedActions.push(action);
    }
    
    localStorage.setItem('offlineAttendanceQueue', JSON.stringify(failedActions));
    updateQueueCounts();
    fetchData();
  }, [isOnline, userEmail, fetchData, updateQueueCounts]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); if (isApp) processOfflineQueues(); };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    fetchData(); 
    if (isApp) { updateQueueCounts(); if (navigator.onLine) processOfflineQueues(); }

    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [processOfflineQueues, updateQueueCounts, fetchData]);

  useEffect(() => {
    if (!contextLoading && contextUser) {
      if (contextUser.user_type === 'field_officer') return navigate('/field-operations', { replace: true });
      if (contextUser.user_type === 'manager') return navigate('/manager', { replace: true });
      if (contextUser.user_type === 'admin') return navigate('/admin', { replace: true });
      if (contextUser.user_type === 'hr') return navigate('/hr-panel', { replace: true });
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
            updateQueueCounts();
        }
    } else {
        const endpoint = actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${endpoint}`, { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) 
        });
        
        if (res && res.ok) {
          setCheckedIn(actionType === 'CHECK_IN');
          localStorage.setItem('local_checked_in', actionType === 'CHECK_IN');

          if (actionType === 'CHECK_IN') {
              setCurrentSite(targetSite);
              if (targetSite) localStorage.setItem('local_current_site', JSON.stringify(targetSite));
              setStatus({ type: 'success', msg: `Checked In at ${targetSite?.name || 'site'}`, code: 'inside' });
              triggerNotification("Attendance Marked", `Welcome! You are checked in at ${targetSite?.name || 'the site'}.`);
          } else {
              if (targetSite) localStorage.removeItem(`normal_entry_time_${targetSite.id}`);
              setCurrentSite(null);
              localStorage.removeItem('local_current_site');
              setStatus({ type: 'secondary', msg: 'Checked Out', code: 'off_duty' });
              triggerNotification("Check-Out Successful", "You have been checked out. Have a great day!");
          }
        }
    }
    
    setActionLoading(false);
    isProcessingRef.current = false;
  };

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

  // Passive Tracking Engine for Automated Geofence Check-Out
  // Passive Tracking Engine for Automated Geofence Check-Out & Live Map Sync
  useEffect(() => {
    if (!userEmail || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude: lat, longitude: lon } = position.coords;

            // 1. SILENT BACKGROUND SYNC FOR ADMIN LIVE MAP
            // Only send if online, don't queue this if offline to save space.
            if (navigator.onLine && checkedInRef.current) {
                fetch(`${API_BASE_URL}/api/user/native-webhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail, lat: lat, lon: lon })
                }).catch(() => {}); // Catch and ignore drops, it's just a passive ping
            }

            // 2. GEOFENCE AUTO-CHECKOUT PROTOCOL
            if (isProcessingRef.current || !checkedInRef.current || !currentSiteRef.current) return;
            
            const separationDistance = calculateDistance(lat, lon, currentSiteRef.current.lat, currentSiteRef.current.lon);
            const activeRadius = currentSiteRef.current.radius || 200;
            const checkoutThreshold = activeRadius + 30; // +30 meter buffer outside the perimeter
            
            if (separationDistance > checkoutThreshold) {
                handleAction('CHECK_OUT', currentSiteRef.current, lat, lon);
                triggerNotification("Auto Checkout Activated", `Exceeded ${checkoutThreshold}m perimeter of ${currentSiteRef.current.name}.`);
            }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [userEmail]);

  const isOnDuty = checkedIn;
  const dutyLabel = isOnDuty ? 'ON DUTY' : 'OFF DUTY (Privacy Active)';
  const dutyDotClass = isOnDuty ? 'bg-success' : 'bg-secondary';

  if (loading || contextLoading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  // Extract first name for greeting
  const rawName = dbUser?.full_name || userEmail;
  const displayName = rawName ? rawName.split('@')[0].split('.')[0].charAt(0).toUpperCase() + rawName.split('@')[0].split('.')[0].slice(1) : "Staff";

  return (
    <>
      <style>
        {`
          .mobile-ui-container { background-color: #f8fafc; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow-x: hidden; padding-bottom: 40px; }
          .glass-card { background: #ffffff; border-radius: 24px; border: none; box-shadow: 0 8px 24px rgba(149, 157, 165, 0.08); overflow: hidden; margin-bottom: 24px; transition: transform 0.2s, box-shadow 0.2s; }
          .active-scale:active { transform: scale(0.96); transition: transform 0.1s; }
          .fade-in { animation: fadeInAnim 0.6s ease-in-out forwards; }
          @keyframes fadeInAnim { from { opacity: 0; } to { opacity: 1; } }
          .slide-up { animation: slideUpAnim 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
          @keyframes slideUpAnim { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .btn-premium { border-radius: 100px; padding: 16px 28px; font-weight: 600; font-size: 16px; transition: all 0.2s; }
        `}
      </style>

      <div className="mobile-ui-container pt-4 fade-in">
        <Container fluid="xl" className="px-3 px-md-4">
          
          <div className="d-flex justify-content-between align-items-center mb-4 px-2">
            <div>
              <h4 className="fw-bold m-0 text-dark">Welcome, {displayName}</h4>
              <p className="text-muted small mb-0">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <Button variant="light" size="sm" className="rounded-circle shadow-sm p-2 active-scale" onClick={fetchData} disabled={isSyncing}>
               <RefreshCw size={20} className={isSyncing ? "text-muted" : "text-primary"} />
            </Button>
          </div>

          <Row className="justify-content-center">
            <Col xs={12} md={8} lg={6} className="slide-up" style={{animationDelay: '0.1s'}}>
              
              {(!isOnline || pendingOfflineActions > 0) && isApp && (
                  <Alert variant="warning" className="d-flex justify-content-between align-items-center mb-3 py-3 shadow-sm rounded-4 small fw-bold border-0">
                      <span className="d-flex align-items-center">
                          {isOnline ? <RefreshCw size={18} className="me-2 text-warning" /> : <WifiOff size={18} className="me-2 text-danger" />}
                          {isOnline ? 'Syncing Data...' : 'Offline Mode Active'}
                      </span>
                      <Badge bg="danger" className="rounded-pill px-3 py-2">{pendingOfflineActions} pending</Badge>
                  </Alert>
              )}

              <Card className={`glass-card ${status.code === 'warning' ? 'border border-danger border-2' : ''}`}>
                <div className={`p-4 text-white text-center position-relative ${status.code === 'warning' ? 'bg-danger' : isOnDuty ? 'bg-success' : 'bg-dark'}`} style={{ transition: 'background-color 0.3s ease' }}>
                  <Badge bg="light" text="dark" className="position-absolute top-0 start-0 m-3 p-2 px-3 shadow-sm rounded-pill d-flex align-items-center"><ShieldCheck size={14} className="me-1" /> ID: {dbUser?.blockchain_id || "PENDING"}</Badge>
                  <h3 className="fw-bold mb-1 mt-4 pt-3">Field Attendance</h3>
                  <div className="opacity-75 small">Secure Perimeter Access</div>
                </div>
                
                <Card.Body className="p-4 p-md-5 text-center">
                  
                  {isSyncing ? (
                      <div className="py-5">
                          <Spinner animation="grow" variant="primary" className="mb-3"/>
                          <div className="text-primary fw-bold">Synchronizing Perimeter...</div>
                      </div>
                  ) : (
                      <>
                          <Alert variant={status.type === 'secondary' ? 'light' : status.type} className="mb-4 small fw-bold py-3 text-start d-flex align-items-center rounded-4 border">
                            {status.code === 'warning' || status.code === 'offline' ? <AlertTriangle size={20} className="me-2" /> : 
                             status.code === 'off_duty' ? <EyeOff size={20} className="me-2 text-muted" /> : 
                             <MapIcon size={20} className="me-2" />} 
                            {status.msg}
                          </Alert>

                          <div className="bg-light p-4 rounded-4 mb-4 border text-start shadow-sm">
                            <span className="small text-muted d-block mb-1 text-uppercase fw-bold tracking-wide" style={{fontSize: '11px'}}>Current Active Site</span>
                            <div className="fw-bolder fs-5 text-dark">{currentSite ? currentSite.name : 'Awaiting GPS Auto-Ping'}</div>
                          </div>

                          <div className="bg-light p-4 rounded-4 mb-5 border shadow-sm">
                            <span className="small text-muted d-block mb-2 text-uppercase fw-bold tracking-wide" style={{fontSize: '11px'}}>Tracking Status</span>
                            <div className="d-flex align-items-center justify-content-center">
                              <div className={`rounded-circle ${dutyDotClass} me-2`} style={{width: 10, height: 10}}></div>
                              <span className={`fw-bolder fs-5 ${isOnDuty ? 'text-success' : 'text-secondary'}`}>{dutyLabel}</span>
                            </div>
                          </div>

                          <div className="d-flex flex-column gap-3">
                            <Button variant={checkedIn ? "light" : "primary"} className={`btn-premium shadow-sm w-100 d-flex align-items-center justify-content-center active-scale ${checkedIn ? 'text-muted border' : ''}`} onClick={() => handleManualAction('CHECK_IN')} disabled={checkedIn || actionLoading}>
                              {actionLoading && !checkedIn ? <Spinner animation="border" size="sm" className="me-2" /> : <LogIn size={20} className="me-2" />}
                              {checkedIn ? 'Check-In Confirmed' : 'Force Entry Scan'}
                            </Button>
                            
                            <Button variant={!checkedIn ? "light" : "danger"} className={`btn-premium shadow-sm w-100 d-flex align-items-center justify-content-center active-scale ${!checkedIn ? 'text-muted border' : ''}`} onClick={() => handleManualAction('CHECK_OUT')} disabled={!checkedIn || actionLoading}>
                              {actionLoading && checkedIn ? <Spinner animation="border" size="sm" className="me-2" /> : <LogOut size={20} className="me-2" />}
                              {!checkedIn ? 'Check-Out Locked' : 'Conclude Duty & Exit'}
                            </Button>
                          </div>
                      </>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    </>
  );
};

export default UserDashboard;