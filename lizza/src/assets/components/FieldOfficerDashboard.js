import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import { MapPin, Navigation, CheckCircle, FileText, Map as MapIcon, LogIn, LogOut, WifiOff, RefreshCw, Clock, Coffee, Activity } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { Capacitor, registerPlugin } from '@capacitor/core';

const API_BASE_URL = 'https://lizza-facility-management.vercel.app';
const isApp = Capacitor.isNativePlatform();
const LizzaTracker = registerPlugin('LizzaTracker');

// --- Helper Functions ---
const fileToBase64 = (file) => new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); });
const base64ToFile = (base64String, filename) => { const arr = base64String.split(','); const mime = arr[0].match(/:(.*?);/)[1]; const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n); while(n--){ u8arr[n] = bstr.charCodeAt(n); } return new File([u8arr], filename, {type:mime}); };
const compressImage = async (file, maxWidth = 1000, quality = 0.7) => { return new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = (event) => { const img = new Image(); img.src = event.target.result; img.onload = () => { const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); canvas.toBlob((blob) => { resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })); }, 'image/jpeg', quality); }; }; }); };
const calculateDistance = (lat1, lon1, lat2, lon2) => { const R = 6371000; const toRad = (deg) => (deg * Math.PI) / 180; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };

const FieldOfficerDashboard = () => {
  const userEmail = localStorage.getItem('userEmail');

  // Core Data States
  const [dutyStatus, setDutyStatus] = useState(() => localStorage.getItem('lastStatus') || 'OFF_DUTY');
  const [shiftData, setShiftData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [visitHistory, setVisitHistory] = useState([]);
  const [myLoc, setMyLoc] = useState(null);
  const [nearbySites, setNearbySites] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Separation of Truth (Fixes UI Traps & Flickering)
  const [proximateSite, setProximateSite] = useState(null); // Physical GPS proximity
  const [checkedInSite, setCheckedInSite] = useState(null); // Logical DB status
  const [checkedIn, setCheckedIn] = useState(false);
  
  // Metrics & Forms
  const [dutyHours, setDutyHours] = useState(0);
  const [travelHours, setTravelHours] = useState(0);
  const [purpose, setPurpose] = useState('');
  const [visitEntries, setVisitEntries] = useState([{ photo: null, details: '' }]);
  
  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [pendingOfflineActions, setPendingOfflineActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Synchronization Locks
  const isFetchingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const checkedInRef = useRef(false);
  const checkedInSiteRef = useRef(null);
  const dutyStatusRef = useRef('OFF_DUTY');
  const lastSentPositionRef = useRef(null);

  useEffect(() => { checkedInRef.current = checkedIn; }, [checkedIn]);
  useEffect(() => { checkedInSiteRef.current = checkedInSite; }, [checkedInSite]);
  useEffect(() => { dutyStatusRef.current = dutyStatus; localStorage.setItem('lastStatus', dutyStatus); }, [dutyStatus]);

  const updateQueueCounts = useCallback(() => {
      if (!isApp) return;
      const v = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]').length;
      const a = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]').length;
      const s = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]').length;
      setPendingOfflineActions(v + a + s);
  }, []);

  const fetchData = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current || !navigator.onLine) return;
    isFetchingRef.current = true;
    const t = Date.now();
    
    try {
        const [locRes, histRes, profRes, shiftRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/admin/locations?_t=${t}`),
            fetch(`${API_BASE_URL}/api/field-officer/my-visits?email=${userEmail}&_t=${t}`),
            fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}&_t=${t}`),
            fetch(`${API_BASE_URL}/api/shift/current?email=${userEmail}&_t=${t}`)
        ]);
        
        let loadedLocs = [];
        if (locRes.ok) {
            loadedLocs = await locRes.json();
            setLocations(loadedLocs);
        }
        if (histRes.ok) setVisitHistory(await histRes.json());
        
        if (profRes.ok) {
            const prof = await profRes.json();
            setCheckedIn(Boolean(prof.checked_in));
            if (prof.checked_in && prof.active_location_id) {
                const site = loadedLocs.find(l => Number(l.id) === Number(prof.active_location_id));
                setCheckedInSite(site || null);
            } else {
                setCheckedInSite(null);
            }
        }
        
        if (shiftRes.ok) {
            const shift = await shiftRes.json();
            if (shift.is_active) {
                setDutyStatus(shift.is_on_break ? 'ON_BREAK' : 'ON_DUTY');
                setShiftData(shift);
                if (!shift.is_on_break && isApp) LizzaTracker.startTracking({ email: userEmail });
            } else {
                setDutyStatus('OFF_DUTY');
                setShiftData(null);
                setTravelHours(0);
                if (isApp) LizzaTracker.stopTracking();
            }
        }
    } finally {
        isFetchingRef.current = false;
    }
  }, [userEmail]);

  // LIVE TICKING CLOCKS (Duty & Perfect Travel Time)
  useEffect(() => {
    if (dutyStatus === 'OFF_DUTY' || !shiftData || !shiftData.login_time) {
        setDutyHours(0); setTravelHours(0); return;
    }

    let currentTravelSec = shiftData.travel_seconds || 0;
    const loginTime = new Date(shiftData.login_time).getTime();
    const breakStartTime = shiftData.break_start_time ? new Date(shiftData.break_start_time).getTime() : null;

    const interval = setInterval(() => {
        const now = Date.now();
        let elapsedMs = now - loginTime;
        let breakMs = (shiftData.total_break_seconds || 0) * 1000;
        
        if (dutyStatus === 'ON_BREAK' && breakStartTime) {
            breakMs += (now - breakStartTime);
        }
        
        let activeDutyMs = Math.max(0, elapsedMs - breakMs);
        setDutyHours(activeDutyMs / (1000 * 60 * 60));

        // Increment travel time by 1 sec ONLY if driving and not checked in
        if (dutyStatus === 'ON_DUTY' && !checkedInRef.current) {
            currentTravelSec += 1;
        }
        setTravelHours(currentTravelSec / 3600);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [dutyStatus, shiftData]); 

  // OFFLINE SYNC LOGIC
  const syncOfflineData = useCallback(async () => {
    if (!navigator.onLine || isSyncing || !isApp) return;
    setIsSyncing(true);

    const syncQueue = async (storageKey, endpoint, mapFunc) => {
        let queue = JSON.parse(localStorage.getItem(storageKey) || '[]');
        let failed = [];
        for (let item of queue) {
            const req = mapFunc ? mapFunc(item) : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) };
            try {
                const res = await fetch(`${API_BASE_URL}${endpoint}`, req);
                if (!res.ok) failed.push(item);
            } catch { failed.push(item); }
        }
        localStorage.setItem(storageKey, JSON.stringify(failed));
    };

    await syncQueue('offlineShiftQueue', '/api/shift/day-action');
    
    // Sync Attendance
    let attQ = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    let fAtt = [];
    for (let act of attQ) {
        const ep = act.actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        try {
            const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(act) });
            if (!res.ok) fAtt.push(act);
        } catch { fAtt.push(act); }
    }
    localStorage.setItem('offlineAttendanceQueue', JSON.stringify(fAtt));

    // Sync Visits
    await syncQueue('offlineVisitQueue', '/api/field-officer/log-visit', (visit) => {
        const formData = new FormData();
        formData.append('email', visit.email); formData.append('location_id', visit.location_id); formData.append('purpose', visit.purpose);
        formData.append('photo_details', visit.photo_details); formData.append('lat', visit.lat); formData.append('lon', visit.lon); formData.append('timestamp', visit.timestamp);
        visit.photosBase64.forEach((b64, i) => formData.append('photos', base64ToFile(b64, `offline_capture_${i}_${Date.now()}.jpg`)));
        return { method: 'POST', body: formData };
    });

    updateQueueCounts();
    setIsSyncing(false);
    fetchData();
  }, [isSyncing, fetchData, updateQueueCounts]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); if (isApp) syncOfflineData(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    fetchData(); 
    if (isApp) { updateQueueCounts(); if (navigator.onLine) syncOfflineData(); }
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [fetchData, syncOfflineData, updateQueueCounts]);

  // CORE ATTENDANCE HANDLER
  const handleAttendance = async (type, targetSite, loc) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsSubmitting(true);

    const payload = { 
        email: userEmail, lat: loc.lat, lon: loc.lon, timestamp: new Date().toISOString(), actionType: type,
        location_id: targetSite?.id || null 
    };

    if (!isOnline && isApp) {
        const q = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
        q.push(payload);
        localStorage.setItem('offlineAttendanceQueue', JSON.stringify(q));
        
        setCheckedIn(type === 'CHECK_IN');
        setCheckedInSite(type === 'CHECK_IN' ? targetSite : null);
        updateQueueCounts();
        
        isProcessingRef.current = false; 
        setIsSubmitting(false);
    } else {
        const ep = type === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        try {
            const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (res.ok) {
                setAlertMsg({ type: 'success', text: `Successfully ${type === 'CHECK_IN' ? 'Checked In' : 'Checked Out'}` });
                await fetchData();
            }
        } catch (err) {
            console.error("Attendance Request Failed:", err);
        } finally {
            setIsSubmitting(false);
            isProcessingRef.current = false;
        }
    }
  };

  // CORE GPS GEOFENCE PROCESSOR
  const processNewLocation = useCallback(async (lat, lon, accuracy, timestamp) => {
    if (accuracy > 100) return; // Ignore terrible GPS noise
    
    // Throttle API pings to max 1 per 30 seconds
    const lastPing = localStorage.getItem('last_ping_time');
    if (!lastPing || (Date.now() - parseInt(lastPing)) >= 30000) {
        localStorage.setItem('last_ping_time', Date.now().toString());
        if (userEmail && dutyStatusRef.current === 'ON_DUTY' && navigator.onLine) {
            fetch(`${API_BASE_URL}/api/location/ping`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: userEmail, lat, lon, accuracy, timestamp, activity_state: 'TRAVELING' })
            }).catch(()=>{});
        }
    }
    setMyLoc({ lat, lon });

    // Calculate Distances
    const sitesWithDistance = locations.map(site => ({ ...site, distance: calculateDistance(lat, lon, site.lat, site.lon) }));
    sitesWithDistance.sort((a, b) => a.distance - b.distance);
    setNearbySites(sitesWithDistance);

    const insideSite = sitesWithDistance[0] && sitesWithDistance[0].distance <= (sitesWithDistance[0].radius || 200) ? sitesWithDistance[0] : null;
    setProximateSite(insideSite);

    // Auto-Geofence Actions (Trigger Check-in/out if not locked)
    if (dutyStatusRef.current === 'ON_DUTY' && !isProcessingRef.current) {
        if (insideSite && !checkedInRef.current) {
            // Entered Geofence -> Auto Check In
            handleAttendance('CHECK_IN', insideSite, { lat, lon });
        } 
        else if (!insideSite && checkedInRef.current && checkedInSiteRef.current) {
            const distToActive = calculateDistance(lat, lon, checkedInSiteRef.current.lat, checkedInSiteRef.current.lon);
            // 300m threshold: Prevents accidental checkouts due to slight GPS drift
            if (distToActive > 300) {
                // Left Geofence -> Auto Check Out
                handleAttendance('CHECK_OUT', checkedInSiteRef.current, { lat, lon });
            }
        }
    }
  }, [locations, userEmail]);

  useEffect(() => {
    if (!userEmail || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            if (isProcessingRef.current) return;
            const { latitude: lat, longitude: lon, accuracy } = position.coords;
            
            // Debounce tiny 5m movements to save processing
            if (lastSentPositionRef.current && calculateDistance(lastSentPositionRef.current.lat, lastSentPositionRef.current.lon, lat, lon) < 5) return;
            lastSentPositionRef.current = { lat, lon };
            
            processNewLocation(lat, lon, accuracy, new Date(position.timestamp).toISOString()); 
        }, 
        () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [userEmail, processNewLocation]);

  const handleDayShiftAction = async (action) => {
    setIsSubmitting(true);
    const payload = { email: userEmail, action: action, timestamp: new Date().toISOString() };

    if (!isOnline && isApp) {
        const q = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]');
        q.push(payload);
        localStorage.setItem('offlineShiftQueue', JSON.stringify(q));
        if (action === 'START' || action === 'RESUME') { setDutyStatus('ON_DUTY'); LizzaTracker.startTracking({ email: userEmail }); } 
        else { setDutyStatus(action === 'BREAK' ? 'ON_BREAK' : 'OFF_DUTY'); LizzaTracker.stopTracking(); }
        updateQueueCounts();
    } else {
        const res = await fetch(`${API_BASE_URL}/api/shift/day-action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            await fetchData(); 
            if (action === 'START' || action === 'RESUME') { if (isApp) LizzaTracker.startTracking({ email: userEmail }); } 
            else { if (isApp) LizzaTracker.stopTracking(); }
        }
    }
    setIsSubmitting(false);
  };

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    
    // SAFEGUARD: Use checkedInSite first, fallback to proximateSite if GPS drifts
    const targetSiteForVisit = checkedInSite || proximateSite || (nearbySites.length > 0 ? nearbySites[0] : null);
    
    if (!targetSiteForVisit || !myLoc) return alert("You must be officially checked into a site to log a visit.");
    
    const validEntries = visitEntries.filter(entry => entry.photo !== null);
    if (validEntries.length === 0) return alert("At least one photo with details is required.");

    setIsSubmitting(true);
    const detailsArray = [];
    const compressedPhotos = [];
    
    for (let i = 0; i < validEntries.length; i++) {
        compressedPhotos.push(await compressImage(validEntries[i].photo));
        detailsArray.push(validEntries[i].details);
    }
    
    const timestamp = new Date().toISOString();

    if (!isOnline && isApp) {
        const base64Strings = await Promise.all(compressedPhotos.map(p => fileToBase64(p)));
        const q = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
        q.push({ email: userEmail, location_id: targetSiteForVisit.id, purpose, photo_details: JSON.stringify(detailsArray), lat: myLoc.lat, lon: myLoc.lon, timestamp, photosBase64: base64Strings });
        localStorage.setItem('offlineVisitQueue', JSON.stringify(q));
        setAlertMsg({ type: 'warning', text: 'No internet. Visit report safely queued.' });
        setPurpose(''); setVisitEntries([{ photo: null, details: '' }]);
        updateQueueCounts();
    } else {
        const formData = new FormData();
        formData.append('email', userEmail); formData.append('location_id', targetSiteForVisit.id);
        formData.append('purpose', purpose); formData.append('photo_details', JSON.stringify(detailsArray));
        formData.append('lat', myLoc.lat); formData.append('lon', myLoc.lon); formData.append('timestamp', timestamp); 
        compressedPhotos.forEach((p) => { formData.append('photos', p); });

        const res = await fetch(`${API_BASE_URL}/api/field-officer/log-visit`, { method: 'POST', body: formData });
        if (res.ok) {
            setAlertMsg({ type: 'success', text: 'Visit logged successfully!' });
            setPurpose(''); setVisitEntries([{ photo: null, details: '' }]);
            fetchData(); 
        } else {
            const errData = await res.json();
            alert(errData.detail || "Failed to log visit. Make sure you are inside the site geofence.");
        }
    }
    setIsSubmitting(false);
  };

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="fw-bold m-0"><Navigation className="text-primary me-2" />Field Operations</h2>
      </div>

      {(!isOnline || pendingOfflineActions > 0) && isApp && (
        <Alert variant="warning" className="d-flex justify-content-between align-items-center mb-4 py-2 shadow-sm border-warning">
            <span>
                {isOnline ? <RefreshCw size={18} className="me-2 text-primary" /> : <WifiOff size={18} className="me-2 text-danger" />}
                <strong className="me-2">{isOnline ? 'Syncing Backlog...' : 'Offline Mode'}</strong> 
                {pendingOfflineActions} pending offline action{pendingOfflineActions === 1 ? '' : 's'} safely stored on device.
            </span>
        </Alert>
      )}

      <Card className="border-0 shadow-sm mb-4 bg-light border-start border-5 border-primary">
          <Card.Body className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                  <h5 className="fw-bold mb-1"><Clock className="me-2 text-primary"/> Master Day Shift</h5>
                  <div className="text-muted small">
                      {dutyStatus === 'OFF_DUTY' ? "Start your day shift to enable location tracking and site check-ins." : 
                       dutyStatus === 'ON_BREAK' ? "Shift paused. Location tracking is currently disabled." : 
                       <>Duty Hours: {Math.floor(dutyHours)}h {Math.floor((dutyHours % 1) * 60)}m &nbsp;|&nbsp; <Activity size={14} className="text-success ms-1 me-1"/> Travel Time: {Math.floor(travelHours)}h {Math.floor((travelHours % 1) * 60)}m</>}
                  </div>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                  {dutyStatus === 'OFF_DUTY' && <Button variant="primary" className="fw-bold px-4" onClick={() => handleDayShiftAction('START')} disabled={isSubmitting}>Start Day Shift</Button>}
                  {dutyStatus === 'ON_DUTY' && <Button variant="warning" className="fw-bold text-dark" onClick={() => handleDayShiftAction('BREAK')} disabled={isSubmitting}><Coffee size={16} className="me-1"/> Take Break</Button>}
                  {dutyStatus === 'ON_BREAK' && <Button variant="success" className="fw-bold px-4" onClick={() => handleDayShiftAction('RESUME')} disabled={isSubmitting}>Resume Duty</Button>}
                  {dutyStatus !== 'OFF_DUTY' && <Button variant="danger" className="fw-bold" onClick={() => handleDayShiftAction('END')} disabled={isSubmitting || dutyHours < 8}>End Day Shift</Button>}
              </div>
          </Card.Body>
      </Card>

      <Row className="g-4 mb-4">
        <Col lg={8}>
          <Card className="border-0 shadow-sm overflow-hidden" style={{ height: '600px' }}>
            {dutyStatus === 'OFF_DUTY' ? (
                <div className="h-100 d-flex flex-column align-items-center justify-content-center bg-light text-muted">
                    <MapIcon size={48} className="mb-3 text-secondary"/>
                    <h5>Map Unavailable</h5>
                    <p>Start your Master Day Shift to view assignments and enable live tracking.</p>
                </div>
            ) : (
                <MapContainer center={[12.9716, 77.5946]} zoom={11} style={{ height: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {locations.map(site => (
                    <Circle key={site.id} center={[site.lat, site.lon]} radius={site.radius || 200} pathOptions={{ color: 'blue', fillOpacity: 0.2 }}>
                      <Popup>{site.name}</Popup>
                    </Circle>
                  ))}
                  {myLoc && (
                    <Marker position={[myLoc.lat, myLoc.lon]}>
                      <Popup>Your Live Location</Popup>
                    </Marker>
                  )}
                </MapContainer>
            )}
          </Card>
        </Col>

        <Col lg={4}>
          <div className="d-flex flex-column gap-3 h-100">
            <Card className="border-0 shadow-sm">
              <Card.Body>
                <h5 className="fw-bold mb-3 d-flex align-items-center"><MapPin className="me-2 text-danger"/> Site Attendance</h5>
                
                {alertMsg && <Alert variant={alertMsg.type} className="mb-3 small fw-bold">{alertMsg.text}</Alert>}
                
                {dutyStatus === 'OFF_DUTY' ? (
                    <Alert variant="secondary" className="text-center mb-0">
                        <span className="d-block mb-1">Shift Inactive</span>
                        <small className="text-muted">You must be On-Duty to check into a site.</small>
                    </Alert>
                ) : dutyStatus === 'ON_BREAK' ? (
                     <Alert variant="warning" className="text-center mb-0">
                        <span className="d-block mb-1">On Break</span>
                        <small className="text-muted">Resume duty to access site actions.</small>
                    </Alert>
                ) : (
                    <>
                        {checkedIn ? (
                          <Alert variant="success" className="d-flex align-items-center fw-bold mb-3">
                              <CheckCircle className="me-2"/> Checked In {checkedInSite ? `at ${checkedInSite.name}` : ''}
                          </Alert>
                        ) : proximateSite ? (
                          <Alert variant="info" className="mb-3">You are near <b>{proximateSite.name}</b></Alert>
                        ) : (
                          <Alert variant="secondary" className="mb-3">Drive to a geofence to check in.</Alert>
                        )}

                        <div className="d-flex gap-2 mb-3">
                          {/* Only show Manual Check In if NOT checked in and physically near a site */}
                          {!checkedIn && proximateSite && (
                            <Button variant="success" className="w-100 fw-bold" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_IN', proximateSite, myLoc)}>
                                <LogIn className="me-2" size={16}/> Manual Check In
                            </Button>
                          )}
                          {/* ALWAYS show Manual Check Out if checked in, regardless of proximity */}
                          {checkedIn && (
                            <Button variant="danger" className="w-100 fw-bold" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_OUT', checkedInSite || proximateSite, myLoc)}>
                                <LogOut className="me-2" size={16}/> Manual Check Out
                            </Button>
                          )}
                        </div>

                        {/* ALWAYS show Visit form if checked in, preventing the ghost-trap bug */}
                        {checkedIn && (
                          <Form onSubmit={handleVisitSubmit} className="mt-2 border-top pt-3">
                            <h6 className="fw-bold mb-3"><FileText className="me-2" size={18}/>Log Visit Report</h6>
                            <Form.Select size="sm" className="mb-2" value={purpose} onChange={e => setPurpose(e.target.value)} required>
                                <option value="">Select Purpose...</option>
                                <option value="Routine Inspection">Routine Inspection</option>
                                <option value="Client Meeting">Client Meeting</option>
                                <option value="Issue Resolution">Issue Resolution</option>
                                <option value="Training">Training</option>
                                <option value="Bill Submission">Bill Submission</option>
                            </Form.Select>

                            <div className="bg-light p-2 rounded mb-3" style={{maxHeight: '300px', overflowY: 'auto'}}>
                                {visitEntries.map((entry, idx) => (
                                    <div key={idx} className="mb-3 p-2 bg-white border rounded shadow-sm">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <small className="fw-bold text-primary">Evidence #{idx + 1}</small>
                                            {visitEntries.length > 1 && (
                                                <Badge bg="danger" style={{cursor: 'pointer'}} onClick={() => { const n = [...visitEntries]; n.splice(idx, 1); setVisitEntries(n); }}>Remove</Badge>
                                            )}
                                        </div>
                                        <Form.Control type="file" size="sm" accept="image/*" capture="environment" className="mb-2" onChange={(e) => { const n = [...visitEntries]; n[idx].photo = e.target.files[0]; setVisitEntries(n); }} required />
                                        <Form.Control size="sm" as="textarea" rows={2} placeholder="Description/Remarks..." value={entry.details} onChange={(e) => { const n = [...visitEntries]; n[idx].details = e.target.value; setVisitEntries(n); }} required />
                                    </div>
                                ))}
                                <Button variant="outline-primary" size="sm" className="w-100 fw-bold border-dashed" onClick={() => setVisitEntries([...visitEntries, { photo: null, details: '' }])}>+ Add Another Photo</Button>
                            </div>

                            <Button type="submit" variant="primary" className="w-100 fw-bold" disabled={isSubmitting}>
                              {isSubmitting ? <Spinner size="sm" /> : "SUBMIT FULL REPORT"}
                            </Button>
                          </Form>
                        )}
                    </>
                )}
              </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm flex-grow-1 d-flex flex-column">
              <Card.Header className="bg-white py-3 border-bottom-0"><h6 className="fw-bold m-0"><MapIcon className="me-2 text-primary" size={18} /> Nearby Sites Directory</h6></Card.Header>
              <Card.Body className="p-0 overflow-auto" style={{ maxHeight: '250px' }}>
                <Table hover responsive className="mb-0 align-middle small">
                  <tbody>
                    {nearbySites.map(site => (
                        <tr key={site.id}>
                          <td className="ps-3 border-0 border-bottom">
                            <div className="fw-bold">{site.name}</div>
                            <div className="text-muted">{site.distance < 1000 ? `${Math.round(site.distance)}m` : `${(site.distance / 1000).toFixed(1)}km`}</div>
                          </td>
                        </tr>
                    ))}
                    {nearbySites.length === 0 && <tr><td className="text-center text-muted py-4">No sites detected nearby.</td></tr>}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </div>
        </Col>
      </Row>

      <Row className="g-4 mb-4">
        <Col xs={12}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white py-3 border-bottom-0 d-flex justify-content-between align-items-center">
              <h6 className="fw-bold m-0"><FileText className="me-2 text-primary" size={18} /> My Recent Site Visit Reports</h6>
              <Button variant="outline-primary" size="sm" onClick={() => fetchData(true)} disabled={isFetchingRef.current}><RefreshCw size={14} className="me-1"/> Refresh Logs</Button>
            </Card.Header>
            <Card.Body className="p-0 overflow-auto" style={{ maxHeight: '400px' }}>
               <Table hover responsive className="mb-0 align-middle small">
                   <thead className="table-light">
                       <tr>
                           <th className="ps-4">Date & Time</th>
                           <th>Site Name</th>
                           <th>Purpose</th>
                           <th>Remarks / Details</th>
                           <th>Evidence</th>
                       </tr>
                   </thead>
                   <tbody>
                       {visitHistory.length === 0 ? (
                           <tr>
                               <td colSpan="5" className="text-center text-muted py-4">No recent site visits recorded.</td>
                           </tr>
                       ) : (
                           visitHistory.map((v, i) => (
                               <tr key={i}>
                                   <td className="ps-4 fw-bold">{v.visit_time}</td>
                                   <td><MapPin size={12} className="text-danger me-1"/> {v.site_name}</td>
                                   <td><Badge bg="dark">{v.purpose}</Badge></td>
                                   <td style={{ maxWidth: '250px' }} className="text-truncate" title={v.remarks}>{v.remarks}</td>
                                   <td>
                                       {v.photo_url ? (
                                           <a href={v.photo_url.split(',')[0]} target="_blank" rel="noreferrer">
                                              <Badge bg="info">View Photo</Badge>
                                           </a>
                                       ) : (
                                           <span className="text-muted">None</span>
                                       )}
                                   </td>
                               </tr>
                           ))
                       )}
                   </tbody>
               </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};
export default FieldOfficerDashboard;