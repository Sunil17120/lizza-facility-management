import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import { MapPin, Navigation, CheckCircle, FileText, Map as MapIcon, LogIn, LogOut, WifiOff, RefreshCw, Clock, Coffee, Activity } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { Capacitor, registerPlugin } from '@capacitor/core';

const API_BASE_URL = 'https://lizza-facility-management.vercel.app';
const isApp = Capacitor.isNativePlatform();
const LizzaTracker = registerPlugin('LizzaTracker');

const fileToBase64 = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
});

const base64ToFile = (base64String, filename) => {
  const arr = base64String.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--){ u8arr[n] = bstr.charCodeAt(n); }
  return new File([u8arr], filename, {type:mime});
};

const compressImage = async (file, maxWidth = 1000, quality = 0.7) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width; let height = img.height;
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', quality);
      };
    };
  });
};

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180; const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const FieldOfficerDashboard = () => {
  const userEmail = localStorage.getItem('userEmail');

  const [dutyStatus, setDutyStatus] = useState(() => localStorage.getItem('lastStatus') || 'OFF_DUTY');
  const [shiftData, setShiftData] = useState(() => {
    const cached = localStorage.getItem('cached_shift');
    return cached ? JSON.parse(cached) : null;
  });
  const [locations, setLocations] = useState(() => {
    const cached = localStorage.getItem('cached_sites');
    return cached ? JSON.parse(cached) : [];
  });
  const [visitHistory, setVisitHistory] = useState(() => {
    const cached = localStorage.getItem('cached_history');
    return cached ? JSON.parse(cached) : [];
  });

  const [myLoc, setMyLoc] = useState(null);
  const [activeSite, setActiveSite] = useState(null);
  const [nearbySites, setNearbySites] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [dutyHours, setDutyHours] = useState(0);
  const [travelHours, setTravelHours] = useState(0); // Added for UI
  const [checkedIn, setCheckedIn] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [visitEntries, setVisitEntries] = useState([{ photo: null, details: '' }]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [pendingOfflineActions, setPendingOfflineActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const isFetchingRef = useRef(false);
  const activeSiteRef = useRef(null);
  const checkedInRef = useRef(false);
  const dutyStatusRef = useRef('OFF_DUTY');
  const isProcessingRef = useRef(false);

  useEffect(() => { activeSiteRef.current = activeSite; }, [activeSite]);
  useEffect(() => { checkedInRef.current = checkedIn; }, [checkedIn]);
  useEffect(() => { dutyStatusRef.current = dutyStatus; }, [dutyStatus]);

  useEffect(() => {
      localStorage.setItem('lastStatus', dutyStatus);
      if (shiftData) localStorage.setItem('cached_shift', JSON.stringify(shiftData));
      else localStorage.removeItem('cached_shift');
  }, [dutyStatus, shiftData]);

  const updateQueueCounts = useCallback(() => {
      if (!isApp) return;
      const queuedReports = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
      const queuedAttendance = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
      const queuedShifts = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]');
      setPendingOfflineActions(queuedReports.length + queuedAttendance.length + queuedShifts.length);
  }, []);

  const fetchData = useCallback(async (isSilentRefresh = false) => {
    if (isFetchingRef.current || !navigator.onLine) return;
    isFetchingRef.current = true;
    
    // CACHE BUSTER: Forces Vercel to bypass edge caching and fetch fresh DB data
    const t = Date.now();
    
    const [locRes, histRes, profileRes, shiftRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/locations?_t=${t}`),
        fetch(`${API_BASE_URL}/api/field-officer/my-visits?email=${userEmail}&_t=${t}`),
        fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}&_t=${t}`),
        fetch(`${API_BASE_URL}/api/shift/current?email=${userEmail}&_t=${t}`)
    ]);
    
    const locs = locRes.ok ? await locRes.json() : [];
    const hist = histRes.ok ? await histRes.json() : [];
    const prof = profileRes.ok ? await profileRes.json() : null;
    const shift = shiftRes.ok ? await shiftRes.json() : null;

    if (locRes.ok) {
        setLocations(locs);
        localStorage.setItem('cached_sites', JSON.stringify(locs));
    }
    
    if (profileRes.ok && prof) {
        setCheckedIn(Boolean(prof.checked_in));
        if (prof.checked_in && prof.active_location_id) {
            const site = locs.find(l => l.id === prof.active_location_id);
            setActiveSite(site || null);
        } else {
            setActiveSite(null);
        }
    }
    
    if (histRes.ok) {
        setVisitHistory(hist);
        localStorage.setItem('cached_history', JSON.stringify(hist));
    }

    if (shiftRes.ok && shift) {
        if (shift.is_active) {
            setDutyStatus(shift.is_on_break ? 'ON_BREAK' : 'ON_DUTY');
            setShiftData(shift);
            setTravelHours(shift.travel_hours || 0); 
            if (!shift.is_on_break && isApp) LizzaTracker.startTracking({ email: userEmail });
        } else {
            setDutyStatus('OFF_DUTY');
            setShiftData(null);
            setTravelHours(0);
            if (isApp) LizzaTracker.stopTracking();
        }
    }
    
    isFetchingRef.current = false;
  }, [userEmail]);

  useEffect(() => {
    if (dutyStatus === 'OFF_DUTY' || !shiftData || !shiftData.login_time) {
        setDutyHours(0);
        return;
    }
    const interval = setInterval(() => {
        const now = new Date();
        const login = new Date(shiftData.login_time);
        
        let elapsedMs = now - login;
        let breakMs = (shiftData.total_break_seconds || 0) * 1000;
        
        if (dutyStatus === 'ON_BREAK' && shiftData.break_start_time) {
            const breakStart = new Date(shiftData.break_start_time);
            breakMs += (now - breakStart);
        }
        
        let activeDutyMs = Math.max(0, elapsedMs - breakMs);
        setDutyHours(activeDutyMs / (1000 * 60 * 60));
    }, 1000);
    return () => clearInterval(interval);
  }, [dutyStatus, shiftData]);

  const syncOfflineData = useCallback(async () => {
    if (!navigator.onLine || isSyncing || !isApp) return;
    setIsSyncing(true);

    const shiftQueue = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]');
    let failedShifts = [];
    for (let s of shiftQueue) {
        const res = await fetch(`${API_BASE_URL}/api/shift/day-action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
        if (!res.ok) failedShifts.push(s);
    }
    localStorage.setItem('offlineShiftQueue', JSON.stringify(failedShifts));

    const pings = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
    if (pings.length > 0) {
        await fetch(`${API_BASE_URL}/api/user/sync-offline-locations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail, locations: pings }) });
        localStorage.removeItem('offlineLocations');
    }

    const attendanceQueue = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    let failedAtt = [];
    for (let act of attendanceQueue) {
        const ep = act.actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(act) });
        if (!res.ok) failedAtt.push(act);
    }
    localStorage.setItem('offlineAttendanceQueue', JSON.stringify(failedAtt));

    let visitQueue = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
    let failedVisits = [];
    for (let visit of visitQueue) {
        const formData = new FormData();
        formData.append('email', visit.email);
        formData.append('location_id', visit.location_id);
        formData.append('purpose', visit.purpose);
        formData.append('photo_details', visit.photo_details);
        formData.append('lat', visit.lat);
        formData.append('lon', visit.lon);
        formData.append('timestamp', visit.timestamp);
        
        const photoFiles = visit.photosBase64.map((b64, i) => base64ToFile(b64, `offline_capture_${i}_${Date.now()}.jpg`));
        photoFiles.forEach(f => formData.append('photos', f));

        const res = await fetch(`${API_BASE_URL}/api/field-officer/log-visit`, { method: 'POST', body: formData });
        if (!res.ok) failedVisits.push(visit);
    }
    localStorage.setItem('offlineVisitQueue', JSON.stringify(failedVisits));

    updateQueueCounts();
    setIsSyncing(false);
    fetchData(true);
  }, [isSyncing, userEmail, fetchData, updateQueueCounts]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); if (isApp) syncOfflineData(); };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    fetchData(); 
    if (isApp) {
      updateQueueCounts();
      if (navigator.onLine) syncOfflineData();
    }
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [fetchData, syncOfflineData, updateQueueCounts]);

  const handleAttendance = async (type, overrideSite = activeSiteRef.current, overrideLoc = myLoc) => {
    if (isProcessingRef.current) return;
    
    if (type === 'CHECK_IN' && (!overrideSite || !overrideLoc)) return alert("You must be inside the site boundary.");
    if (!overrideLoc) return alert("Current location unavailable.");
    if (dutyStatusRef.current !== 'ON_DUTY') return alert("You must Start Day Duty first and not be on a break.");
    
    isProcessingRef.current = true;
    setIsSubmitting(true);

    checkedInRef.current = (type === 'CHECK_IN');
    activeSiteRef.current = (type === 'CHECK_IN' ? overrideSite : null);

    const payload = { email: userEmail, lat: overrideLoc.lat, lon: overrideLoc.lon, timestamp: new Date().toISOString(), actionType: type };

    if (!isOnline && isApp) {
        const q = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
        q.push(payload);
        localStorage.setItem('offlineAttendanceQueue', JSON.stringify(q));
        setCheckedIn(type === 'CHECK_IN');
        setAlertMsg({ type: 'warning', text: `Offline ${type === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} queued.` });
        updateQueueCounts();
    } else {
        const ep = type === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            setCheckedIn(type === 'CHECK_IN');
            setAlertMsg({ type: 'success', text: `Successfully ${type === 'CHECK_IN' ? 'Checked In' : 'Checked Out'}` });
            await fetchData(true);
        } else {
            checkedInRef.current = !checkedInRef.current;
        }
    }
    
    setIsSubmitting(false);
    isProcessingRef.current = false;
  };

  const processNewLocation = useCallback(async (lat, lon, accuracy, timestamp) => {
    setMyLoc({ lat, lon });
    if (accuracy > 100) return;

    const sitesToEval = locations;
    let insideSite = null;
    
    const sitesWithDistance = sitesToEval.map(site => {
        const dist = getDistance(lat, lon, site.lat, site.lon);
        if (dist <= (site.radius || 200)) insideSite = site;
        return { ...site, distance: dist };
    });

    sitesWithDistance.sort((a, b) => a.distance - b.distance);
    setNearbySites(sitesWithDistance);
    
    const currentActiveSite = activeSiteRef.current;
    const isCheckedIn = checkedInRef.current;
    const currentDuty = dutyStatusRef.current;

    if (insideSite && !currentActiveSite && currentDuty === 'ON_DUTY' && !isCheckedIn) {
        if (!isProcessingRef.current) {
            handleAttendance('CHECK_IN', insideSite, { lat, lon });
            setActiveSite(insideSite);
        }
    } else if (currentActiveSite && isCheckedIn) {
        const distToActive = getDistance(lat, lon, currentActiveSite.lat, currentActiveSite.lon);
        if (distToActive > 500) {
            if (!isProcessingRef.current) {
                handleAttendance('CHECK_OUT', currentActiveSite, { lat, lon });
                setActiveSite(null);
            }
        } else {
            setActiveSite(currentActiveSite); 
        }
    } else if (!isCheckedIn) {
        setActiveSite(insideSite);
    }

    if (userEmail && currentDuty === 'ON_DUTY') {
        if (!navigator.onLine && isApp) {
            const q = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
            q.push({ lat, lon, accuracy, timestamp });
            localStorage.setItem('offlineLocations', JSON.stringify(q));
        } else if (navigator.onLine) {
            await fetch(`${API_BASE_URL}/api/location/ping`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: userEmail,
                    lat: lat,
                    lon: lon,
                    accuracy: accuracy,
                    timestamp: timestamp,
                    activity_state: 'TRAVELING'
                }),
            });
        }
    }
  }, [locations, userEmail, isApp]);

  useEffect(() => {
    if (!userEmail || !navigator.geolocation) return;
    
    const geoOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    let watchId;
    
    const handlePosition = (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const timestamp = new Date(position.timestamp).toISOString();
        processNewLocation(lat, lon, accuracy, timestamp); 
    };

    watchId = navigator.geolocation.watchPosition(
        handlePosition, 
        () => {}, 
        geoOptions
    );
    
    const intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(handlePosition, () => {}, geoOptions);
    }, 60000); 
    
    return () => {
        navigator.geolocation.clearWatch(watchId);
        clearInterval(intervalId);
    };
  }, [userEmail, processNewLocation]);

  const handleDayShiftAction = async (action) => {
    setIsSubmitting(true);
    const timestamp = new Date().toISOString();
    const payload = { email: userEmail, action: action, timestamp: timestamp };

    if (!isOnline && isApp) {
        const q = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]');
        q.push(payload);
        localStorage.setItem('offlineShiftQueue', JSON.stringify(q));
        
        if (action === 'START' || action === 'RESUME') {
            setDutyStatus('ON_DUTY');
            LizzaTracker.startTracking({ email: userEmail });
        } else if (action === 'BREAK') {
            setDutyStatus('ON_BREAK');
            LizzaTracker.stopTracking();
        } else if (action === 'END') {
            setDutyStatus('OFF_DUTY');
            LizzaTracker.stopTracking();
        }
        updateQueueCounts();
    } else {
        const res = await fetch(`${API_BASE_URL}/api/shift/day-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            await fetchData(true); 
            if (action === 'START' || action === 'RESUME') {
                setDutyStatus('ON_DUTY');
                if (isApp) LizzaTracker.startTracking({ email: userEmail });
            } else if (action === 'BREAK') {
                setDutyStatus('ON_BREAK');
                if (isApp) LizzaTracker.stopTracking();
            } else if (action === 'END') {
                setDutyStatus('OFF_DUTY');
                if (isApp) LizzaTracker.stopTracking();
            }
        }
    }
    setIsSubmitting(false);
  };

  const handleAddPhotoEntry = () => setVisitEntries([...visitEntries, { photo: null, details: '' }]);
  const handleRemovePhotoEntry = (index) => {
      const newEntries = [...visitEntries];
      newEntries.splice(index, 1);
      setVisitEntries(newEntries);
  };
  const handlePhotoChange = (index, file) => {
      const newEntries = [...visitEntries];
      newEntries[index].photo = file;
      setVisitEntries(newEntries);
  };
  const handleDetailsChange = (index, text) => {
      const newEntries = [...visitEntries];
      newEntries[index].details = text;
      setVisitEntries(newEntries);
  };

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    if (!activeSite || !myLoc) return alert("Geofence error.");
    
    const validEntries = visitEntries.filter(entry => entry.photo !== null);
    if (validEntries.length === 0) return alert("At least one photo with details is required.");

    setIsSubmitting(true);
    const detailsArray = [];
    const compressedPhotos = [];
    
    for (let i = 0; i < validEntries.length; i++) {
        const compressed = await compressImage(validEntries[i].photo);
        compressedPhotos.push(compressed);
        detailsArray.push(validEntries[i].details);
    }
    
    const timestamp = new Date().toISOString();

    if (!isOnline && isApp) {
        const base64Strings = await Promise.all(compressedPhotos.map(p => fileToBase64(p)));
        const offlinePayload = {
            email: userEmail, location_id: activeSite.id, purpose, 
            photo_details: JSON.stringify(detailsArray),
            lat: myLoc.lat, lon: myLoc.lon, timestamp, photosBase64: base64Strings
        };
        const q = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
        q.push(offlinePayload);
        localStorage.setItem('offlineVisitQueue', JSON.stringify(q));
        setAlertMsg({ type: 'warning', text: 'No internet. Visit report safely queued.' });
        setPurpose(''); setVisitEntries([{ photo: null, details: '' }]);
        updateQueueCounts();
    } else {
        const formData = new FormData();
        formData.append('email', userEmail); 
        formData.append('location_id', activeSite.id);
        formData.append('purpose', purpose); 
        formData.append('photo_details', JSON.stringify(detailsArray));
        formData.append('lat', myLoc.lat); 
        formData.append('lon', myLoc.lon);
        formData.append('timestamp', timestamp); 
        compressedPhotos.forEach((p) => { formData.append('photos', p); });

        const res = await fetch(`${API_BASE_URL}/api/field-officer/log-visit`, { method: 'POST', body: formData });
        if (res.ok) {
            setAlertMsg({ type: 'success', text: 'Visit logged successfully!' });
            setPurpose(''); setVisitEntries([{ photo: null, details: '' }]);
            fetchData(true); 
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
                  {dutyStatus === 'OFF_DUTY' && (
                      <Button variant="primary" className="fw-bold px-4" onClick={() => handleDayShiftAction('START')} disabled={isSubmitting}>Start Day Shift</Button>
                  )}
                  {dutyStatus === 'ON_DUTY' && (
                      <Button variant="warning" className="fw-bold text-dark" onClick={() => handleDayShiftAction('BREAK')} disabled={isSubmitting}><Coffee size={16} className="me-1"/> Take Break</Button>
                  )}
                  {dutyStatus === 'ON_BREAK' && (
                      <Button variant="success" className="fw-bold px-4" onClick={() => handleDayShiftAction('RESUME')} disabled={isSubmitting}>Resume Duty</Button>
                  )}
                  {dutyStatus !== 'OFF_DUTY' && (
                      <Button variant="danger" className="fw-bold" onClick={() => handleDayShiftAction('END')} disabled={isSubmitting || dutyHours < 8}>
                          End Day Shift {dutyHours < 8 && `(${Math.ceil(8 - dutyHours)}h left)`}
                      </Button>
                  )}
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
                        {activeSite ? (
                          <Alert variant="success" className="d-flex align-items-center fw-bold mb-3"><CheckCircle className="me-2"/> At Site: {activeSite.name}</Alert>
                        ) : (
                          <Alert variant="secondary" className="mb-3">Drive to a geofence to check in.</Alert>
                        )}

                        <div className="d-flex gap-2 mb-3">
                          {!checkedIn && activeSite && (
                            <Button variant="success" className="w-100 fw-bold" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_IN')}><LogIn className="me-2" size={16}/> Manual Check In</Button>
                          )}
                          {checkedIn && (
                            <Button variant="danger" className="w-100 fw-bold" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_OUT')}><LogOut className="me-2" size={16}/> Manual Check Out</Button>
                          )}
                        </div>

                        {activeSite && checkedIn && (
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
                                                <Badge bg="danger" style={{cursor: 'pointer'}} onClick={() => handleRemovePhotoEntry(idx)}>Remove</Badge>
                                            )}
                                        </div>
                                        <Form.Control type="file" size="sm" accept="image/*" capture="environment" className="mb-2" onChange={(e) => handlePhotoChange(idx, e.target.files[0])} required />
                                        <Form.Control size="sm" as="textarea" rows={2} placeholder="Description/Remarks..." value={entry.details} onChange={(e) => handleDetailsChange(idx, e.target.value)} required />
                                    </div>
                                ))}
                                <Button variant="outline-primary" size="sm" className="w-100 fw-bold border-dashed" onClick={handleAddPhotoEntry}>+ Add Another Photo</Button>
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