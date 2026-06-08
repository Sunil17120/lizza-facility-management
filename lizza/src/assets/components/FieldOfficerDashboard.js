import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import { MapPin, Camera, Navigation, CheckCircle, FileText, Map as MapIcon, LogIn, LogOut, WifiOff, RefreshCw, Clock, Coffee } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AppLauncher } from '@capacitor/app-launcher';

const API_BASE_URL = 'https://lizza-facility-management.vercel.app';
const isApp = Capacitor.isNativePlatform();
const LizzaTracker = registerPlugin('LizzaTracker');

const fileToBase64 = (file) => new Promise((resolve, reject) => {
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
}

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
  const [locations, setLocations] = useState(() => {
    const cached = localStorage.getItem('cached_sites');
    return cached ? JSON.parse(cached) : [];
  });
  
  const [myLoc, setMyLoc] = useState(null);
  const [activeSite, setActiveSite] = useState(null);
  const [visitHistory, setVisitHistory] = useState([]);
  const [nearbySites, setNearbySites] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [dutyStatus, setDutyStatus] = useState('OFF_DUTY'); 
  const [shiftData, setShiftData] = useState(null);
  const [dutyHours, setDutyHours] = useState(0);

  const [checkedIn, setCheckedIn] = useState(false);
  
  const [purpose, setPurpose] = useState('');
  const [visitEntries, setVisitEntries] = useState([{ photo: null, details: '' }]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [pendingOfflineActions, setPendingOfflineActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const userEmail = localStorage.getItem('userEmail');

  const openNotificationSettings = async () => {
    if (isApp) await AppLauncher.openSettings();
  };

  const updateQueueCounts = useCallback(() => {
      if (!isApp) return;
      const queuedReports = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
      const queuedAttendance = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
      setPendingOfflineActions(queuedReports.length + queuedAttendance.length);
  }, []);

  const fetchData = useCallback(async () => {
    if (!navigator.onLine) return;
    
    const [locRes, histRes, profileRes, shiftRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/locations`),
      fetch(`${API_BASE_URL}/api/field-officer/my-visits?email=${userEmail}`),
      fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}`),
      fetch(`${API_BASE_URL}/api/shift/current?email=${userEmail}`)
    ]);
    
    if (locRes.ok) {
      const fetchedLocations = await locRes.json();
      setLocations(fetchedLocations);
      
      if (isApp) localStorage.setItem('cached_sites', JSON.stringify(fetchedLocations));
    }
    
    if (histRes.ok) setVisitHistory(await histRes.json());
    
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      setCheckedIn(Boolean(profileData.checked_in));
      if (profileData.checked_in && profileData.active_location_id) {
       const fetchedLocations = await locRes.json();

setLocations(fetchedLocations);

if (profileData.checked_in && profileData.active_location_id) {
    const site = fetchedLocations.find(
       l => l.id === profileData.active_location_id
    );

    if(site) setActiveSite(site);
}
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
          if (isApp) LizzaTracker.stopTracking();
      }
    }
  }, [userEmail]);

  useEffect(() => {
    if (dutyStatus === 'OFF_DUTY' || !shiftData) return;
    const interval = setInterval(() => {
        const now = new Date();
        const login = new Date(shiftData.login_time);
        let elapsedSeconds = (now - login) / 1000;
        elapsedSeconds -= (shiftData.total_break_seconds || 0);
        
        if (dutyStatus === 'ON_BREAK' && shiftData.break_start_time) {
            const breakStart = new Date(shiftData.break_start_time);
            elapsedSeconds -= ((now - breakStart) / 1000);
        }
        setDutyHours(elapsedSeconds / 3600);
    }, 1000);
    return () => clearInterval(interval);
  }, [dutyStatus, shiftData]);

  const syncOfflineData = useCallback(async () => {
    if (!navigator.onLine || isSyncing || !isApp) return;
    setIsSyncing(true);

    const pings = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
    if (pings.length > 0) {
      await fetch(`${API_BASE_URL}/api/user/sync-offline-locations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail, locations: pings }) });
      localStorage.removeItem('offlineLocations');
    }

    const attendanceQueue = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    let failedAtt = [];
    let lastSuccessfulAction = null;
    
    for (let act of attendanceQueue) {
      const ep = act.actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
      const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(act) });
      if (res.ok) lastSuccessfulAction = act;
      else failedAtt.push(act);
    }
    if (lastSuccessfulAction) setCheckedIn(lastSuccessfulAction.actionType === 'CHECK_IN');
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
    fetchData(); 
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

  const processNewLocation = useCallback((lat, lon) => {
    setMyLoc({ lat, lon });
    const cachedSitesStr = localStorage.getItem('cached_sites');
    const sitesToEval = (cachedSitesStr && isApp) ? JSON.parse(cachedSitesStr) : locations;

    let insideSite = null;
    const sitesWithDistance = sitesToEval.map(site => {
        const dist = getDistance(lat, lon, site.lat, site.lon);
        if (dist <= (site.radius || 200)) insideSite = site;
        return { ...site, distance: dist };
    });

    sitesWithDistance.sort((a, b) => a.distance - b.distance);
    setNearbySites(sitesWithDistance);
    setActiveSite(insideSite);
    
    if (userEmail && dutyStatus === 'ON_DUTY') {
      if (!navigator.onLine && isApp) {
        const q = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
        q.push({ lat, lon, timestamp: new Date().toISOString() });
        localStorage.setItem('offlineLocations', JSON.stringify(q));
      } else if (navigator.onLine) {
        fetch(`${API_BASE_URL}/api/user/update-location?email=${userEmail}&lat=${lat}&lon=${lon}`, { method: 'POST' });
        if (isApp && !isSyncing) {
          const qLoc = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
          if (qLoc.length) syncOfflineData();
        }
      }
    }
  }, [locations, userEmail, isApp, isSyncing, syncOfflineData, dutyStatus]);

  useEffect(() => {
    if (!userEmail || !navigator.geolocation) return;
    const handlePosition = (position) => { processNewLocation(position.coords.latitude, position.coords.longitude); };
    navigator.geolocation.getCurrentPosition(handlePosition, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    const intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(handlePosition, () => {}, { enableHighAccuracy: true, timeout: 60000 });
    }, 60000); 
    return () => clearInterval(intervalId);
  }, [userEmail, processNewLocation]);

  const handleDayShiftAction = async (action) => {
    setIsSubmitting(true);
    const res = await fetch(`${API_BASE_URL}/api/shift/day-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, action: action, timestamp: new Date().toISOString() })
    });
    
    const data = await res.json();
    if (action === 'START') {
        setDutyStatus('ON_DUTY');
        if (isApp) LizzaTracker.startTracking({ email: userEmail });
    } else if (action === 'BREAK') {
        setDutyStatus('ON_BREAK');
        if (isApp) LizzaTracker.stopTracking();
    } else if (action === 'RESUME') {
        setDutyStatus('ON_DUTY');
        if (isApp) LizzaTracker.startTracking({ email: userEmail });
    } else if (action === 'END') {
        setDutyStatus('OFF_DUTY');
        if (isApp) LizzaTracker.stopTracking();
    }
    fetchData();
    setIsSubmitting(false);
  };

  const handleAttendance = async (type) => {
    if (type === 'CHECK_IN' && (!activeSite || !myLoc)) return alert("You must be inside the site boundary.");
    if (!myLoc) return alert("Current location unavailable.");
    if (dutyStatus !== 'ON_DUTY') return alert("You must Start Day Duty first and not be on a break.");
    
    setIsSubmitting(true);
    const payload = { email: userEmail, lat: myLoc.lat, lon: myLoc.lon, timestamp: new Date().toISOString(), actionType: type };

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
      }
    }
    setIsSubmitting(false);
  };

  const handleAddPhotoEntry = () => {
      setVisitEntries([...visitEntries, { photo: null, details: '' }]);
  };

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
            fetchData();
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
        <Alert variant="warning" className="d-flex justify-content-between align-items-center mb-4 py-2">
            <span>
                {isOnline ? <RefreshCw size={18} className="me-2 text-primary" /> : <WifiOff size={18} className="me-2 text-danger" />}
                <strong className="me-2">{isOnline ? 'Syncing Backlog...' : 'Offline Mode'}</strong> 
                {pendingOfflineActions} pending offline action{pendingOfflineActions === 1 ? '' : 's'} saved on device.
            </span>
        </Alert>
      )}

      <Card className="border-0 shadow-sm mb-4 bg-light">
          <Card.Body className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div>
                  <h5 className="fw-bold mb-1"><Clock className="me-2 text-info"/> Daily Master Shift</h5>
                  <div className="text-muted small">
                      {dutyStatus === 'OFF_DUTY' ? "Start your day to enable GPS path tracking." : 
                       dutyStatus === 'ON_BREAK' ? "Tracking paused during break." : 
                       `Duty Hours: ${Math.floor(dutyHours)}h ${Math.floor((dutyHours % 1) * 60)}m (Breaks excluded)`}
                  </div>
              </div>
              <div className="d-flex gap-2">
                  {dutyStatus === 'OFF_DUTY' && (
                      <Button variant="primary" className="fw-bold" onClick={() => handleDayShiftAction('START')} disabled={isSubmitting}>Day Check-In</Button>
                  )}
                  {dutyStatus === 'ON_DUTY' && (
                      <Button variant="warning" className="fw-bold" onClick={() => handleDayShiftAction('BREAK')} disabled={isSubmitting}><Coffee size={16} className="me-1"/> Take Break</Button>
                  )}
                  {dutyStatus === 'ON_BREAK' && (
                      <Button variant="success" className="fw-bold" onClick={() => handleDayShiftAction('RESUME')} disabled={isSubmitting}>Resume Duty</Button>
                  )}
                  {dutyStatus !== 'OFF_DUTY' && (
                      <Button variant="danger" className="fw-bold" onClick={() => handleDayShiftAction('END')} disabled={isSubmitting || dutyHours < 8}>
                          Day Check-Out {dutyHours < 8 && `(${Math.ceil(8 - dutyHours)}h left)`}
                      </Button>
                  )}
              </div>
          </Card.Body>
      </Card>

      <Row className="g-4 mb-4">
        <Col lg={8}>
          <Card className="border-0 shadow-sm overflow-hidden" style={{ height: '600px' }}>
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
          </Card>
        </Col>

        <Col lg={4}>
          <div className="d-flex flex-column gap-3 h-100">
            <Card className="border-0 shadow-sm">
              <Card.Body>
                <h5 className="fw-bold mb-3 d-flex align-items-center"><MapPin className="me-2 text-danger"/> Site Attendance</h5>
                
                {alertMsg && <Alert variant={alertMsg.type} className="mb-3 small">{alertMsg.text}</Alert>}
                
                {activeSite ? (
                  <Alert variant="success" className="d-flex align-items-center fw-bold mb-3"><CheckCircle className="me-2"/> At Site: {activeSite.name}</Alert>
                ) : (
                  <Alert variant="secondary" className="mb-3">Drive to a geofence to check in.</Alert>
                )}

                <div className="d-flex gap-2 mb-3">
                  {!checkedIn && activeSite && (
                    <Button variant="success" className="w-100 fw-bold" disabled={isSubmitting || dutyStatus !== 'ON_DUTY'} onClick={() => handleAttendance('CHECK_IN')}><LogIn className="me-2" size={16}/> Site Check In</Button>
                  )}
                  {checkedIn && (
                    <Button variant="danger" className="w-100 fw-bold" disabled={isSubmitting || dutyStatus !== 'ON_DUTY'} onClick={() => handleAttendance('CHECK_OUT')}><LogOut className="me-2" size={16}/> Site Check Out</Button>
                  )}
                </div>

                {activeSite && checkedIn && dutyStatus === 'ON_DUTY' && (
                  <Form onSubmit={handleVisitSubmit} className="mt-2 border-top pt-3">
                    <h6 className="fw-bold mb-3"><FileText className="me-2" size={18}/>Log Visit Report</h6>
                    <Form.Select size="sm" className="mb-2" value={purpose} onChange={e => setPurpose(e.target.value)} required>
                        <option value="">Select Purpose...</option>
                        <option value="Site visit">Site visit</option>
                        <option value="Training">Training</option>
                        <option value="Client Meeting">Client Meeting</option>
                        <option value="Attendance">Attendance</option>
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
                                <Form.Control size="sm" as="textarea" rows={2} placeholder="Specific details for this photo..." value={entry.details} onChange={(e) => handleDetailsChange(idx, e.target.value)} required />
                            </div>
                        ))}
                        <Button variant="outline-primary" size="sm" className="w-100 fw-bold border-dashed" onClick={handleAddPhotoEntry}>+ Add Another Photo & Detail</Button>
                    </div>

                    <Button type="submit" variant="primary" className="w-100 fw-bold" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner size="sm" /> : "SUBMIT FULL REPORT"}
                    </Button>
                  </Form>
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
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </div>
        </Col>
      </Row>
    </Container>
  );
};
export default FieldOfficerDashboard;