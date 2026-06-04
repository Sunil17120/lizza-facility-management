import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner, Table } from 'react-bootstrap';
import { MapPin, Camera, Navigation, CheckCircle, FileText, Map as MapIcon, LogIn, LogOut, WifiOff, RefreshCw } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';

import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capacitor-community/background-geolocation';

const API_BASE_URL = 'https://lizza-facility-management.vercel.app';
const isApp = Capacitor.isNativePlatform();

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
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
  const [locations, setLocations] = useState([]);
  const [myLoc, setMyLoc] = useState(null);
  const [activeSite, setActiveSite] = useState(null);
  const [visitHistory, setVisitHistory] = useState([]);
  const [nearbySites, setNearbySites] = useState([]);
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [checkedIn, setCheckedIn] = useState(false);
  
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photo, setPhoto] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  
  const [pendingOfflineActions, setPendingOfflineActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [offlineSyncMsg, setOfflineSyncMsg] = useState(null);

  const fileInputRef = useRef(null);
  const userEmail = localStorage.getItem('userEmail');

  const updateQueueCounts = useCallback(() => {
      if (!isApp) return;
      const queuedReports = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
      const queuedAttendance = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
      setPendingOfflineActions(queuedReports.length + queuedAttendance.length);
  }, []);

  const fetchData = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const [locRes, histRes, profileRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/locations`),
        fetch(`${API_BASE_URL}/api/field-officer/my-visits?email=${userEmail}`),
        fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}`)
      ]);
      
      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(locData);
        if (isApp) localStorage.setItem('cached_sites', JSON.stringify(locData));
      }
      if (histRes.ok) setVisitHistory(await histRes.json());
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setCheckedIn(Boolean(profileData.checked_in));
      }
    } catch (error) { console.error("Fetch Data Error:", error); }
  }, [userEmail]);

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
      try {
        const ep = act.actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: act.email, lat: act.lat, lon: act.lon, timestamp: act.timestamp }) });
        if (res.ok) {
          lastSuccessfulAction = act;
        } else {
          failedAtt.push(act);
        }
      } catch (e) { failedAtt.push(act); }
    }
    if (lastSuccessfulAction) {
      setCheckedIn(lastSuccessfulAction.actionType === 'CHECK_IN');
    }
    localStorage.setItem('offlineAttendanceQueue', JSON.stringify(failedAtt));

    let visitQueue = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
    let failedVisits = [];

    for (let visit of visitQueue) {
        try {
            const formData = new FormData();
            formData.append('email', visit.email);
            formData.append('location_id', visit.location_id);
            formData.append('purpose', visit.purpose);
            formData.append('remarks', visit.remarks);
            formData.append('lat', visit.lat);
            formData.append('lon', visit.lon);
            formData.append('timestamp', visit.timestamp);
            
            const photoFile = base64ToFile(visit.photoBase64, `offline_capture_${Date.now()}.jpg`);
            formData.append('photo', photoFile);

            const res = await fetch(`${API_BASE_URL}/api/field-officer/log-visit`, { method: 'POST', body: formData });
            if (!res.ok) failedVisits.push(visit);
        } catch (e) {
            failedVisits.push(visit);
        }
    }
    
    localStorage.setItem('offlineVisitQueue', JSON.stringify(failedVisits));
    updateQueueCounts();
    setIsSyncing(false);

    if (pings.length + attendanceQueue.length + visitQueue.length > 0) {
      if (failedAtt.length === 0 && failedVisits.length === 0) {
        setOfflineSyncMsg('Offline data synced successfully. Attendance and visits are up to date.');
      } else {
        setOfflineSyncMsg('Offline sync completed with some failures. Please retry or check connectivity.');
      }
    }
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
    
    if (userEmail) {
      if (!navigator.onLine && isApp) {
        const q = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
        q.push({ lat, lon, timestamp: new Date().toISOString() });
        localStorage.setItem('offlineLocations', JSON.stringify(q));
      } else if (navigator.onLine) {
        fetch(`${API_BASE_URL}/api/user/update-location?email=${userEmail}&lat=${lat}&lon=${lon}`, { method: 'POST' });

        if (isApp && !isSyncing) {
          const queuedLocations = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
          const queuedAttendance = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
          const queuedVisit = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
          if (queuedLocations.length || queuedAttendance.length || queuedVisit.length) {
            syncOfflineData();
          }
        }
      }
    }
  }, [locations, userEmail, isApp, isSyncing, syncOfflineData]);

  // FREE CAP-GO NATIVE TRACKER
  useEffect(() => {
    if (!userEmail || !isApp) return;
    let watcherId = null;

    const startTracking = async () => {
      try {
        watcherId = await BackgroundGeolocation.addWatcher(
          { 
            backgroundMessage: "Lizza tracking is active. Site visits are being recorded.", 
            backgroundTitle: "Field Officer Tracking Active",
            requestPermissions: true, 
            stale: true, // Crucial for reliable tracking inside buildings
            distanceFilter: 15,
            stopOnTerminate: false, // Don't kill when swiped away
            startForeground: true // Pin sticky notification to lock screen
          },
          (location, error) => { 
            if (error) {
              console.error("Background Location Error:", error);
              return;
            }
            if (location) processNewLocation(location.latitude, location.longitude); 
          }
        );

        // Tell Cap-go to send the email with the webhook
        await BackgroundGeolocation.setConfig({
          headers: { "x-user-email": userEmail }
        });

        // Register the native webhook to bypass Doze mode
        await BackgroundGeolocation.setupGeofencing({
          url: `${API_BASE_URL}/api/user/native-webhook`,
          backgroundLocation: true,
        });

      } catch (err) {
        console.error("Failed to start Background Geolocation:", err);
      }
    };

    startTracking();

    return () => { 
      if (watcherId) {
        BackgroundGeolocation.removeWatcher({ id: watcherId }); 
      }
    };
  }, [userEmail, processNewLocation]);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !userEmail || !navigator.geolocation) return;

    const handlePosition = (position) => {
      processNewLocation(position.coords.latitude, position.coords.longitude);
    };
    const handleError = (error) => {
      console.error('Browser geolocation failed:', error);
    };

    navigator.geolocation.getCurrentPosition(handlePosition, handleError, { enableHighAccuracy: true, timeout: 10000 });
    const id = navigator.geolocation.watchPosition(handlePosition, handleError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });

    return () => {
      if (navigator.geolocation && id !== null) {
        navigator.geolocation.clearWatch(id);
      }
    };
  }, [userEmail, processNewLocation]);

  const handleAttendance = async (type) => {
    if (type === 'CHECK_IN' && (!activeSite || !myLoc)) {
      return alert("You must be inside the site boundary.");
    }
    if (!myLoc) {
      return alert("Current location unavailable. Please retry when location is available.");
    }
    setIsSubmitting(true);
    
    const payload = { email: userEmail, lat: myLoc.lat, lon: myLoc.lon, timestamp: new Date().toISOString(), actionType: type };

    if (!isOnline) {
      if (isApp) {
        if (type === 'CHECK_IN' && !activeSite) {
          setAlertMsg({ type: 'danger', text: 'You must be inside the site boundary to check in.' });
          setIsSubmitting(false);
          return;
        }
        if (!myLoc) {
          setAlertMsg({ type: 'danger', text: 'Current location unavailable. Please retry when location is available.' });
          setIsSubmitting(false);
          return;
        }
        const q = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
        q.push(payload);
        localStorage.setItem('offlineAttendanceQueue', JSON.stringify(q));
        setCheckedIn(type === 'CHECK_IN');
        setAlertMsg({ type: 'warning', text: `Offline ${type === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} queued.` });
        updateQueueCounts();
      } else {
        setAlertMsg({ type: 'danger', text: 'Network connection lost. Action failed.' });
      }
    } else {
      try {
        const ep = type === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
          setCheckedIn(type === 'CHECK_IN');
          setAlertMsg({ type: 'success', text: `Successfully ${type === 'CHECK_IN' ? 'Checked In' : 'Checked Out'}` });
        } else {
          const errorData = await res.json().catch(() => null);
          setAlertMsg({ type: 'danger', text: errorData?.detail || 'Action failed.' });
        }
      } catch (err) {
        setAlertMsg({ type: 'danger', text: 'Server communication failed.' });
      }
    }
    setIsSubmitting(false);
  };

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    if (!photo) return alert("Photo required.");
    if (!activeSite || !myLoc) return alert("Geofence error.");

    setIsSubmitting(true);
    const compressedPhoto = await compressImage(photo);
    const timestamp = new Date().toISOString();

    if (!isOnline) {
        if (isApp) {
            try {
                const base64String = await fileToBase64(compressedPhoto);
                const offlinePayload = {
                    email: userEmail, location_id: activeSite.id, purpose, remarks,
                    lat: myLoc.lat, lon: myLoc.lon, timestamp, photoBase64: base64String
                };
                
                const q = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
                q.push(offlinePayload);
                localStorage.setItem('offlineVisitQueue', JSON.stringify(q));
                
                setAlertMsg({ type: 'warning', text: 'No internet. Visit report safely queued for upload.' });
                setPurpose(''); setRemarks(''); setPhoto(null);
                if(fileInputRef.current) fileInputRef.current.value = "";
                updateQueueCounts();
            } catch(err) {
                alert("Failed to store image offline. Please clear storage space.");
            }
        } else {
            setAlertMsg({ type: 'danger', text: 'Network connection required to submit report.' });
        }
    } else {
        try {
            const formData = new FormData();
            formData.append('email', userEmail); formData.append('location_id', activeSite.id);
            formData.append('purpose', purpose); formData.append('remarks', remarks);
            formData.append('lat', myLoc.lat); formData.append('lon', myLoc.lon);
            formData.append('timestamp', timestamp); formData.append('photo', compressedPhoto);

            const res = await fetch(`${API_BASE_URL}/api/field-officer/log-visit`, { method: 'POST', body: formData });
            if (res.ok) {
                setAlertMsg({ type: 'success', text: 'Visit logged successfully!' });
                setPurpose(''); setRemarks(''); setPhoto(null);
                if(fileInputRef.current) fileInputRef.current.value = "";
                fetchData();
            }
        } catch (err) {
            setAlertMsg({ type: 'danger', text: 'Network connection failed.' });
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
            {isOnline && pendingOfflineActions > 0 && (
                <Button size="sm" variant="outline-dark" onClick={syncOfflineData} disabled={isSyncing}>
                    {isSyncing ? 'Syncing...' : 'Force Sync'}
                </Button>
            )}
        </Alert>
      )}

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
                <h5 className="fw-bold mb-3 d-flex align-items-center"><MapPin className="me-2 text-danger"/> Current Status</h5>
                
                {alertMsg && <Alert variant={alertMsg.type} className="mb-3 small">{alertMsg.text}</Alert>}
                {offlineSyncMsg && <Alert variant="success" className="mb-3 small">{offlineSyncMsg}</Alert>}
                
                {activeSite ? (
                  <Alert variant="success" className="d-flex align-items-center fw-bold mb-3"><CheckCircle className="me-2"/> At Site: {activeSite.name}</Alert>
                ) : (
                  <Alert variant="secondary" className="mb-3">Drive to a geofence to check in.</Alert>
                )}

                <div className="d-flex gap-2 mb-3">
                  {!checkedIn && activeSite && (
                    <Button variant="success" className="w-100 fw-bold" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_IN')}><LogIn className="me-2" size={16}/> Check In</Button>
                  )}
                  {checkedIn && (
                    <Button variant="danger" className="w-100 fw-bold" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_OUT')}><LogOut className="me-2" size={16}/> Check Out</Button>
                  )}
                </div>

                {activeSite && checkedIn && (
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
                    <Form.Control size="sm" as="textarea" rows={2} className="mb-2" placeholder="Remarks..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold"><Camera size={14} className="me-1"/> Live Photo</Form.Label>
                      <Form.Control type="file" size="sm" accept="image/*" capture="environment" ref={fileInputRef} onChange={e => setPhoto(e.target.files[0])} required />
                    </Form.Group>
                    <Button type="submit" variant="primary" className="w-100 fw-bold" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner size="sm" /> : "SUBMIT REPORT"}
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

      <Row className="mt-4">
        <Col>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white py-3 border-bottom-0">
              <h6 className="fw-bold m-0"><MapPin className="me-2 text-primary" size={18} />Recent Visit History</h6>
            </Card.Header>
            <Card.Body className="p-3">
              {visitHistory.length === 0 ? (
                <div className="text-center text-muted py-4">No visit records available yet.</div>
              ) : (
                <Table responsive hover className="mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Date</th>
                      <th>Site</th>
                      <th>Purpose</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitHistory.map((visit, idx) => (
                      <tr key={`${idx}-${visit.visit_time}`}>
                        <td>{visit.visit_time || 'N/A'}</td>
                        <td>{visit.site_name || 'N/A'}</td>
                        <td>{visit.purpose || 'N/A'}</td>
                        <td>{visit.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};
export default FieldOfficerDashboard;