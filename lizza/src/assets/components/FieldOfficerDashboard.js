import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import { MapPin, Navigation, CheckCircle, FileText, Map as MapIcon, LogIn, LogOut, WifiOff, RefreshCw, Clock, Coffee, Activity, AlertTriangle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const API_BASE_URL = 'https://lizza-facility-management.vercel.app';
const isApp = Capacitor.isNativePlatform();
const LizzaTracker = registerPlugin('LizzaTracker');

const fileToBase64 = (file) => new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); });
const base64ToFile = (base64String, filename) => { const arr = base64String.split(','); const mime = arr[0].match(/:(.*?);/)[1]; const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n); while(n--){ u8arr[n] = bstr.charCodeAt(n); } return new File([u8arr], filename, {type:mime}); };
const compressImage = async (file, maxWidth = 1000, quality = 0.7) => { return new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = (event) => { const img = new Image(); img.src = event.target.result; img.onload = () => { const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); canvas.toBlob((blob) => { resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })); }, 'image/jpeg', quality); }; }; }); };
const calculateDistance = (lat1, lon1, lat2, lon2) => { const R = 6371000; const toRad = (deg) => (deg * Math.PI) / 180; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };

const FieldOfficerDashboard = () => {
  const userEmail = localStorage.getItem('userEmail');

  const [dutyStatus, setDutyStatus] = useState(() => localStorage.getItem('lastStatus') || 'OFF_DUTY');
  const [shiftData, setShiftData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [visitHistory, setVisitHistory] = useState([]);
  const [myLoc, setMyLoc] = useState(null);
  const [nearbySites, setNearbySites] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [proximateSite, setProximateSite] = useState(null); 
  const [checkedInSite, setCheckedInSite] = useState(null); 
  const [checkedIn, setCheckedIn] = useState(false);
  const [hasSubmittedReport, setHasSubmittedReport] = useState(false);
  
  const [dutyHours, setDutyHours] = useState(0);
  const [travelHours, setTravelHours] = useState(0);
  const [purpose, setPurpose] = useState('');
  const [visitEntries, setVisitEntries] = useState([{ photo: null, details: '' }]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [pendingOfflineActions, setPendingOfflineActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const isFetchingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const checkedInRef = useRef(false);
  const checkedInSiteRef = useRef(null);
  const dutyStatusRef = useRef('OFF_DUTY');
  const lastSentPositionRef = useRef(null);

  useEffect(() => { checkedInRef.current = checkedIn; }, [checkedIn]);
  useEffect(() => { checkedInSiteRef.current = checkedInSite; }, [checkedInSite]);
  useEffect(() => { dutyStatusRef.current = dutyStatus; localStorage.setItem('lastStatus', dutyStatus); }, [dutyStatus]);

  const resetIdleWarningTimer = async () => {
    if (!isApp) return;
    const permissionStatus = await LocalNotifications.checkPermissions();
    if (permissionStatus.display !== 'granted') {
        await LocalNotifications.requestPermissions();
    }
    await LocalNotifications.cancel({ notifications: [{ id: 999 }] });
    await LocalNotifications.schedule({
        notifications: [{
            title: "⚠️ Tracking Paused",
            body: "No location update in 30 minutes. Please open Lizza.",
            id: 999,
            schedule: { at: new Date(Date.now() + 30 * 60 * 1000) },
            smallIcon: "ic_stat_icon_config_sample",
        }]
    });
  };

  const updateQueueCounts = useCallback(() => {
      if (!isApp) return;
      const v = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]').length;
      const a = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]').length;
      const s = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]').length;
      const l = JSON.parse(localStorage.getItem('offlineLocationQueue') || '[]').length;
      setPendingOfflineActions(v + a + s + l);
  }, []);

  const fetchData = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current || !navigator.onLine) return;
    isFetchingRef.current = true;
    const t = Date.now();
    
    const [locRes, histRes, profRes, shiftRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/locations?_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/field-officer/my-visits?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/shift/current?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false }))
    ]);
    
    let loadedLocs = [];
    if (locRes && locRes.ok) {
        loadedLocs = await locRes.json();
        setLocations(loadedLocs);
    }
    
    let parsedVisits = [];
    if (histRes && histRes.ok) {
        parsedVisits = await histRes.json();
        setVisitHistory(parsedVisits);
    }
    
    if (profRes && profRes.ok) {
        const prof = await profRes.json();
        setCheckedIn(Boolean(prof.checked_in));
        if (prof.checked_in && prof.active_location_id) {
            const site = loadedLocs.find(l => Number(l.id) === Number(prof.active_location_id));
            setCheckedInSite(site || null);
            
            const todayStr = new Date().toISOString().split('T')[0];
            const hasReport = parsedVisits.some(v => v.site_name === (site?.name) && v.visit_time.includes(todayStr));
            setHasSubmittedReport(hasReport);
        } else {
            setCheckedInSite(null);
            setHasSubmittedReport(false);
        }
    }
    
    if (shiftRes && shiftRes.ok) {
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
    isFetchingRef.current = false;
  }, [userEmail]);

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

        if (dutyStatus === 'ON_DUTY' && !checkedInRef.current) {
            currentTravelSec += 1;
        }
        setTravelHours(currentTravelSec / 3600);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [dutyStatus, shiftData]); 

  const syncOfflineData = useCallback(async () => {
    if (!navigator.onLine || isSyncing || !isApp) return;
    setIsSyncing(true);

    const syncQueue = async (storageKey, endpoint, mapFunc) => {
        let queue = JSON.parse(localStorage.getItem(storageKey) || '[]');
        let failed = [];
        for (let item of queue) {
            const req = mapFunc ? mapFunc(item) : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) };
            const res = await fetch(`${API_BASE_URL}${endpoint}`, req).catch(() => ({ ok: false }));
            if (!res || !res.ok) failed.push(item);
        }
        localStorage.setItem(storageKey, JSON.stringify(failed));
    };

    await syncQueue('offlineShiftQueue', '/api/shift/day-action');

    let locQ = JSON.parse(localStorage.getItem('offlineLocationQueue') || '[]');
    if (locQ.length > 0) {
        const locRes = await fetch(`${API_BASE_URL}/api/user/sync-offline-locations`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, locations: locQ })
        }).catch(() => ({ ok: false }));
        if (locRes && locRes.ok) localStorage.setItem('offlineLocationQueue', '[]');
    }
    
    let attQ = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    let fAtt = [];
    for (let act of attQ) {
        const ep = act.actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(act) }).catch(() => ({ ok: false }));
        if (!res || !res.ok) fAtt.push(act);
    }
    localStorage.setItem('offlineAttendanceQueue', JSON.stringify(fAtt));

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
  }, [isSyncing, fetchData, updateQueueCounts, userEmail]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); if (isApp) syncOfflineData(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    fetchData(); 
    if (isApp) { updateQueueCounts(); if (navigator.onLine) syncOfflineData(); }
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [fetchData, syncOfflineData, updateQueueCounts]);

  const handleAttendance = async (type, targetSite, loc) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsSubmitting(true);

    let exactTime = new Date().toISOString();
    if (type === 'CHECK_IN' && targetSite) {
        const savedGeofenceEntryTime = localStorage.getItem(`entry_time_${targetSite.id}`);
        if (savedGeofenceEntryTime) exactTime = savedGeofenceEntryTime;
    }

    const payload = { 
        email: userEmail, lat: loc.lat, lon: loc.lon, timestamp: exactTime, actionType: type,
        location_id: targetSite?.id || null 
    };

    if (!isOnline && isApp) {
        const q = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
        q.push(payload);
        localStorage.setItem('offlineAttendanceQueue', JSON.stringify(q));
        
        setCheckedIn(type === 'CHECK_IN');
        setCheckedInSite(type === 'CHECK_IN' ? targetSite : null);
        if (type === 'CHECK_IN') setHasSubmittedReport(false);
        if (type === 'CHECK_OUT' && targetSite) localStorage.removeItem(`entry_time_${targetSite.id}`);
        updateQueueCounts();
        
        isProcessingRef.current = false; 
        setIsSubmitting(false);
    } else {
        const ep = type === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => ({ ok: false }));
        if (res && res.ok) {
            setAlertMsg({ type: 'success', text: `Successfully ${type === 'CHECK_IN' ? 'Checked In' : 'Checked Out'}` });
            if (type === 'CHECK_IN') setHasSubmittedReport(false);
            if (type === 'CHECK_OUT' && targetSite) localStorage.removeItem(`entry_time_${targetSite.id}`);
            await fetchData();
        }
        setIsSubmitting(false);
        isProcessingRef.current = false;
    }
  };

  const processNewLocation = useCallback(async (lat, lon, accuracy, timestamp, speedMetersPerSec) => {
    if (accuracy > 100) return; 

    let speedKmh = 0;
    if (speedMetersPerSec !== null && speedMetersPerSec !== undefined && speedMetersPerSec >= 0) {
        speedKmh = speedMetersPerSec * 3.6;
    } else if (lastSentPositionRef.current && lastSentPositionRef.current.timestamp) {
        const distMeters = calculateDistance(lastSentPositionRef.current.lat, lastSentPositionRef.current.lon, lat, lon);
        const timeDiffSec = (new Date(timestamp).getTime() - new Date(lastSentPositionRef.current.timestamp).getTime()) / 1000;
        if (timeDiffSec > 0) speedKmh = (distMeters / timeDiffSec) * 3.6;
    }

    let inferredActivity = 'STILL';
    if (speedKmh > 30) inferredActivity = 'IN_VEHICLE';
    else if (speedKmh > 12) inferredActivity = 'ON_BICYCLE';
    else if (speedKmh > 2) inferredActivity = 'WALKING';

    const lastPing = localStorage.getItem('last_ping_time');
    if (!lastPing || (Date.now() - parseInt(lastPing)) >= 30000) {
        localStorage.setItem('last_ping_time', Date.now().toString());
        resetIdleWarningTimer(); 
        
        const payload = { 
            email: userEmail, lat, lon, accuracy, timestamp, 
            activity_state: 'TRAVELING',
            speed: parseFloat(speedKmh.toFixed(2)),
            activity_type: inferredActivity
        };

        if (userEmail && dutyStatusRef.current === 'ON_DUTY') {
            if (navigator.onLine) {
                fetch(`${API_BASE_URL}/api/location/ping`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }).catch(()=>{});
            } else if (isApp) {
                const q = JSON.parse(localStorage.getItem('offlineLocationQueue') || '[]');
                q.push(payload);
                localStorage.setItem('offlineLocationQueue', JSON.stringify(q));
                updateQueueCounts();
            }
        }
    }
    
    setMyLoc({ lat, lon });

    const sitesWithDistance = locations.map(site => ({ ...site, distance: calculateDistance(lat, lon, site.lat, site.lon) }));
    sitesWithDistance.sort((a, b) => a.distance - b.distance);
    setNearbySites(sitesWithDistance);

    const insideSite = sitesWithDistance[0] && sitesWithDistance[0].distance <= (sitesWithDistance[0].radius || 200) ? sitesWithDistance[0] : null;
    
    if (insideSite) {
        if (!localStorage.getItem(`entry_time_${insideSite.id}`)) {
            localStorage.setItem(`entry_time_${insideSite.id}`, timestamp);
        }
    }

    setProximateSite(insideSite);

    if (dutyStatusRef.current === 'ON_DUTY' && !isProcessingRef.current) {
        if (insideSite && !checkedInRef.current) {
            handleAttendance('CHECK_IN', insideSite, { lat, lon });
        } 
        else if (checkedInRef.current && checkedInSiteRef.current) {
            // --- THE CROSS-SITE AUTO SWAP LOGIC ---
            // If inside a new site but checked into an old site
            if (insideSite && insideSite.id !== checkedInSiteRef.current.id) {
                handleAttendance('CHECK_OUT', checkedInSiteRef.current, { lat, lon }).then(() => {
                    // The next GPS tick will cleanly check them into the new site.
                });
            } 
            // If they just left the old site and are in empty space (>300m away)
            else if (!insideSite) {
                const distToActive = calculateDistance(lat, lon, checkedInSiteRef.current.lat, checkedInSiteRef.current.lon);
                if (distToActive > 300) {
                    handleAttendance('CHECK_OUT', checkedInSiteRef.current, { lat, lon });
                }
            }
        }
    }
  }, [locations, userEmail]);

  useEffect(() => {
    if (locations.length > 0 && myLoc) {
      const sitesWithDistance = locations.map(site => ({ 
        ...site, 
        distance: calculateDistance(myLoc.lat, myLoc.lon, site.lat, site.lon) 
      }));
      
      sitesWithDistance.sort((a, b) => a.distance - b.distance);
      setNearbySites(sitesWithDistance);
      const insideSite = sitesWithDistance[0] && sitesWithDistance[0].distance <= (sitesWithDistance[0].radius || 200) ? sitesWithDistance[0] : null;
      setProximateSite(insideSite);
    }
  }, [locations, myLoc]); 

  useEffect(() => {
    if (!userEmail || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            if (isProcessingRef.current) return;
            const { latitude: lat, longitude: lon, accuracy, speed } = position.coords;
            const timestamp = new Date(position.timestamp).toISOString();
            
            let shouldUpdate = false;
            if (!lastSentPositionRef.current) {
                shouldUpdate = true;
            } else {
                const dist = calculateDistance(lastSentPositionRef.current.lat, lastSentPositionRef.current.lon, lat, lon);
                const timePassed = (new Date(timestamp).getTime() - new Date(lastSentPositionRef.current.timestamp).getTime()) / 1000;
                if (dist > 5 || timePassed > 120) shouldUpdate = true;
            }

            if (shouldUpdate) {
                lastSentPositionRef.current = { lat, lon, timestamp };
                processNewLocation(lat, lon, accuracy, timestamp, speed); 
            }
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
        const res = await fetch(`${API_BASE_URL}/api/shift/day-action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => ({ ok: false }));
        if (res && res.ok) {
            await fetchData(); 
            if (action === 'START' || action === 'RESUME') { if (isApp) LizzaTracker.startTracking({ email: userEmail }); } 
            else { if (isApp) LizzaTracker.stopTracking(); }
        } else {
            const errData = await res.json();
            alert(errData.detail || "Action blocked by server.");
        }
    }
    setIsSubmitting(false);
  };

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    if (!checkedIn) return alert("Wait! The system has not confirmed your check-in yet.");
    
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
        setHasSubmittedReport(true); 
        updateQueueCounts();
    } else {
        const formData = new FormData();
        formData.append('email', userEmail); formData.append('location_id', targetSiteForVisit.id);
        formData.append('purpose', purpose); formData.append('photo_details', JSON.stringify(detailsArray));
        formData.append('lat', myLoc.lat); formData.append('lon', myLoc.lon); formData.append('timestamp', timestamp); 
        compressedPhotos.forEach((p) => { formData.append('photos', p); });

        const res = await fetch(`${API_BASE_URL}/api/field-officer/log-visit`, { method: 'POST', body: formData }).catch(() => ({ ok: false, json: async () => ({ detail: "Network error" }) }));
        if (res && res.ok) {
            setAlertMsg({ type: 'success', text: 'Visit logged successfully!' });
            setPurpose(''); setVisitEntries([{ photo: null, details: '' }]);
            setHasSubmittedReport(true);
            fetchData(); 
        } else {
            const errData = await res.json();
            alert(errData.detail || "Failed to log visit. Make sure you are inside the site geofence.");
        }
    }
    setIsSubmitting(false);
  };

  return (
    <Container fluid="md" className="py-3 py-md-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="fw-bold m-0"><Navigation className="text-primary me-2" size={24}/>Field Operations</h3>
      </div>

      {(!isOnline || pendingOfflineActions > 0) && isApp && (
        <Alert variant="warning" className="d-flex justify-content-between align-items-center mb-3 py-2 shadow-sm border-warning small">
            <span>
                {isOnline ? <RefreshCw size={16} className="me-2 text-primary" /> : <WifiOff size={16} className="me-2 text-danger" />}
                <strong className="me-1">{isOnline ? 'Syncing...' : 'Offline Mode'}</strong> 
                {pendingOfflineActions} pending action{pendingOfflineActions === 1 ? '' : 's'}.
            </span>
        </Alert>
      )}

      <Card className="border-0 shadow-sm mb-4 bg-light border-start border-5 border-primary">
          <Card.Body className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
              <div>
                  <h5 className="fw-bold mb-1"><Clock className="me-2 text-primary" size={20}/> Master Day Shift</h5>
                  <div className="text-muted small">
                      {dutyStatus === 'OFF_DUTY' ? "Start your day shift to enable location tracking and site check-ins." : 
                       dutyStatus === 'ON_BREAK' ? "Shift paused. Location tracking is currently disabled." : 
                       <div className="d-flex align-items-center flex-wrap mt-1">
                           <span className="me-3"><strong>Duty:</strong> {Math.floor(dutyHours)}h {Math.floor((dutyHours % 1) * 60)}m</span>
                           <span><Activity size={14} className="text-success ms-1 me-1"/> <strong>Travel:</strong> {Math.floor(travelHours)}h {Math.floor((travelHours % 1) * 60)}m</span>
                       </div>}
                  </div>
              </div>
              <div className="d-flex gap-2">
                  {dutyStatus === 'OFF_DUTY' && <Button variant="primary" className="fw-bold flex-grow-1" onClick={() => handleDayShiftAction('START')} disabled={isSubmitting}>Start Shift</Button>}
                  {dutyStatus === 'ON_DUTY' && <Button variant="warning" className="fw-bold text-dark flex-grow-1" onClick={() => handleDayShiftAction('BREAK')} disabled={isSubmitting}><Coffee size={16} className="me-1"/> Break</Button>}
                  {dutyStatus === 'ON_BREAK' && <Button variant="success" className="fw-bold flex-grow-1" onClick={() => handleDayShiftAction('RESUME')} disabled={isSubmitting}>Resume Duty</Button>}
                  {dutyStatus !== 'OFF_DUTY' && <Button variant="danger" className="fw-bold flex-grow-1" onClick={() => handleDayShiftAction('END')} disabled={isSubmitting}>End Shift</Button>}
              </div>
          </Card.Body>
      </Card>

      <Row className="g-3 mb-4">
        <Col lg={4} className="order-1 order-lg-2">
          <div className="d-flex flex-column gap-3 h-100">
            <Card className="border-0 shadow-sm">
              <Card.Body>
                <h5 className="fw-bold mb-3 d-flex align-items-center"><MapPin className="me-2 text-danger"/> Site Attendance</h5>
                
                {alertMsg && <Alert variant={alertMsg.type} className="mb-3 small fw-bold">{alertMsg.text}</Alert>}
                
                {dutyStatus === 'OFF_DUTY' ? (
                    <Alert variant="secondary" className="text-center mb-0">
                        <span className="d-block mb-1 fw-bold">Shift Inactive</span>
                        <small className="text-muted">You must be On-Duty to check into a site.</small>
                    </Alert>
                ) : dutyStatus === 'ON_BREAK' ? (
                     <Alert variant="warning" className="text-center mb-0">
                        <span className="d-block mb-1 fw-bold">On Break</span>
                        <small className="text-muted">Resume duty to access site actions.</small>
                    </Alert>
                ) : (
                    <>
                        {checkedIn ? (
                          <div className="bg-success bg-opacity-10 border border-success border-2 rounded p-3 mb-3 text-center shadow-sm">
                              <CheckCircle className="text-success mb-2" size={36}/>
                              <h5 className="text-success fw-bold mb-1">ACTIVE CHECK-IN</h5>
                              <div className="text-dark fs-5 fw-bolder mt-2">{checkedInSite?.name || proximateSite?.name || 'Verifying Site...'}</div>
                          </div>
                        ) : proximateSite ? (
                          <Alert variant="info" className="mb-3 text-center border-info border-2">
                              You are currently near <br/><strong className="fs-6">{proximateSite.name}</strong>
                          </Alert>
                        ) : (
                          <Alert variant="secondary" className="mb-3 text-center">Drive to a geofence to check in.</Alert>
                        )}

                        <div className="d-flex flex-column gap-2 mb-3">
                          {!checkedIn && proximateSite && (
                            <Button variant="success" size="lg" className="w-100 fw-bold shadow-sm" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_IN', proximateSite, myLoc)}>
                                <LogIn className="me-2" size={20}/> Check In Here
                            </Button>
                          )}
                          
                          {checkedIn && hasSubmittedReport && (
                            <Button variant="danger" size="lg" className="w-100 fw-bold shadow-sm" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_OUT', checkedInSite || proximateSite, myLoc)}>
                                <LogOut className="me-2" size={20}/> Check Out
                            </Button>
                          )}
                          {checkedIn && !hasSubmittedReport && (
                            <Alert variant="warning" className="text-center small fw-bold mb-0">
                                <AlertTriangle size={16} className="me-1 mb-1"/> Evidence Upload Required to Check Out
                            </Alert>
                          )}
                        </div>

                        {checkedIn && (
                          <Form onSubmit={handleVisitSubmit} className="mt-4 border-top pt-3">
                            <h6 className="fw-bold mb-3 text-primary"><FileText className="me-2" size={18}/>Submit Site Report</h6>
                            
                            <Form.Select className="mb-3 py-2" value={purpose} onChange={e => setPurpose(e.target.value)} required>
                                <option value="">Select Purpose of Visit...</option>
                                <option value="Routine Inspection">Routine Inspection</option>
                                <option value="Client Meeting">Client Meeting</option>
                                <option value="Issue Resolution">Issue Resolution</option>
                                <option value="Training">Training</option>
                                <option value="Bill Submission">Bill Submission</option>
                            </Form.Select>

                            <div className="bg-light p-2 rounded mb-3" style={{maxHeight: '350px', overflowY: 'auto'}}>
                                {visitEntries.map((entry, idx) => (
                                    <div key={idx} className="mb-3 p-3 bg-white border rounded shadow-sm">
                                        <div className="d-flex justify-content-between align-items-center mb-3">
                                            <small className="fw-bold text-primary">Evidence #{idx + 1}</small>
                                            {visitEntries.length > 1 && (
                                                <Badge bg="danger" style={{cursor: 'pointer', padding: '6px 10px'}} onClick={() => { const n = [...visitEntries]; n.splice(idx, 1); setVisitEntries(n); }}>Remove</Badge>
                                            )}
                                        </div>
                                        <Form.Control type="file" accept="image/*" capture="environment" className="mb-3" onChange={(e) => { const n = [...visitEntries]; n[idx].photo = e.target.files[0]; setVisitEntries(n); }} required />
                                        <Form.Control as="textarea" rows={3} placeholder="Add detailed remarks or observations here..." value={entry.details} onChange={(e) => { const n = [...visitEntries]; n[idx].details = e.target.value; setVisitEntries(n); }} required />
                                    </div>
                                ))}
                                <Button variant="outline-primary" className="w-100 fw-bold py-2 border-dashed" onClick={() => setVisitEntries([...visitEntries, { photo: null, details: '' }])}>+ Add Another Photo</Button>
                            </div>

                            <Button type="submit" variant="primary" size="lg" className="w-100 fw-bold shadow-sm mt-2" disabled={isSubmitting}>
                              {isSubmitting ? <Spinner size="sm" /> : "SUBMIT FULL REPORT"}
                            </Button>
                          </Form>
                        )}
                    </>
                )}
              </Card.Body>
            </Card>
          </div>
        </Col>

        <Col lg={8} className="order-2 order-lg-1">
          <Card className="border-0 shadow-sm overflow-hidden h-100" style={{ minHeight: '350px' }}>
            {dutyStatus === 'OFF_DUTY' ? (
                <div className="h-100 d-flex flex-column align-items-center justify-content-center bg-light text-muted p-4 text-center">
                    <MapIcon size={48} className="mb-3 text-secondary opacity-50"/>
                    <h5 className="fw-bold text-dark">Map Offline</h5>
                    <p className="small mb-0">Start your Master Day Shift to view assignments and enable live GPS tracking.</p>
                </div>
            ) : (
                <MapContainer center={[12.9716, 77.5946]} zoom={11} style={{ height: '100%', minHeight: '350px' }}>
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
      </Row>

      <Row className="g-3 mb-4">
        <Col lg={4}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Header className="bg-white py-3 border-bottom-0"><h6 className="fw-bold m-0"><MapIcon className="me-2 text-primary" size={18} /> Nearby Sites Directory</h6></Card.Header>
              <Card.Body className="p-0 overflow-auto" style={{ maxHeight: '300px' }}>
                <Table hover responsive className="mb-0 align-middle small">
                  <tbody>
                    {nearbySites.map(site => (
                        <tr key={site.id}>
                          <td className="ps-4 border-0 border-bottom py-3">
                            <div className="fw-bold text-dark">{site.name}</div>
                            <div className="text-muted mt-1">{site.distance < 1000 ? `${Math.round(site.distance)}m away` : `${(site.distance / 1000).toFixed(1)}km away`}</div>
                          </td>
                        </tr>
                    ))}
                    {nearbySites.length === 0 && <tr><td className="text-center text-muted py-5">No sites detected nearby.</td></tr>}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
        </Col>

        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white py-3 border-bottom-0 d-flex justify-content-between align-items-center">
              <h6 className="fw-bold m-0"><FileText className="me-2 text-primary" size={18} /> My Recent Site Visit Reports</h6>
              <Button variant="outline-primary" size="sm" onClick={() => fetchData(true)} disabled={isFetchingRef.current}><RefreshCw size={14} className="me-1"/> Refresh</Button>
            </Card.Header>
            <Card.Body className="p-0 overflow-auto" style={{ maxHeight: '300px' }}>
               <Table hover responsive className="mb-0 align-middle small text-nowrap">
                   <thead className="table-light">
                       <tr>
                           <th className="ps-4 py-3">Date & Time</th>
                           <th className="py-3">Site Name</th>
                           <th className="py-3">Purpose</th>
                           <th className="py-3">Remarks</th>
                           <th className="py-3 pe-4">Evidence</th>
                       </tr>
                   </thead>
                   <tbody>
                       {visitHistory.length === 0 ? (
                           <tr>
                               <td colSpan="5" className="text-center text-muted py-5">No recent site visits recorded.</td>
                           </tr>
                       ) : (
                           visitHistory.map((v, i) => (
                               <tr key={i}>
                                   <td className="ps-4 fw-bold">{v.visit_time}</td>
                                   <td><MapPin size={14} className="text-danger me-1"/> {v.site_name}</td>
                                   <td><Badge bg="dark" className="px-2 py-1">{v.purpose}</Badge></td>
                                   <td style={{ maxWidth: '200px' }} className="text-truncate" title={v.remarks}>{v.remarks}</td>
                                   <td className="pe-4">
                                       {v.photo_url ? (
                                           <a href={v.photo_url.split(',')[0]} target="_blank" rel="noreferrer">
                                              <Badge bg="info" className="px-2 py-1 text-decoration-none">View Photo</Badge>
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