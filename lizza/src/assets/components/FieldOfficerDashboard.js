import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner, Table, Badge, Tabs, Tab } from 'react-bootstrap';
import { MapPin, Navigation, CheckCircle, FileText, Map as MapIcon, LogIn, LogOut, WifiOff, RefreshCw, Clock, Coffee, Activity, AlertTriangle, CheckSquare, Camera } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";
const isApp = Capacitor.isNativePlatform();
const LizzaTracker = registerPlugin('LizzaTracker');

const fileToBase64 = (file) => new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); });
const base64ToFile = (base64String, filename) => { const arr = base64String.split(','); const mime = arr[0].match(/:(.*?);/)[1]; const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n); while(n--){ u8arr[n] = bstr.charCodeAt(n); } return new File([u8arr], filename, {type:mime}); };
const compressImage = async (file, maxWidth = 1000, quality = 0.7) => { return new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = (event) => { const img = new Image(); img.src = event.target.result; img.onload = () => { const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); canvas.toBlob((blob) => { resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })); }, 'image/jpeg', quality); }; }; }); };
const calculateDistance = (lat1, lon1, lat2, lon2) => { const R = 6371000; const toRad = (deg) => (deg * Math.PI) / 180; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };

const getFormattedDateStr = (date = new Date()) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = date.getDate().toString().padStart(2, '0');
    const m = months[date.getMonth()];
    const y = date.getFullYear();
    return `${d}-${m}-${y}`; 
};

const FieldOfficerDashboard = () => {
  const userEmail = localStorage.getItem('userEmail');

  const [dutyStatus, setDutyStatus] = useState(() => localStorage.getItem('lastStatus') || 'OFF_DUTY');
  const [shiftData, setShiftData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [visitHistory, setVisitHistory] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]); 
  
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
  const [activeTaskForm, setActiveTaskForm] = useState({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [pendingOfflineActions, setPendingOfflineActions] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Performance & Logic Memory Refs (Prevents Android Freezing & GPS Loops)
  const isFetchingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const checkedInRef = useRef(false);
  const checkedInSiteRef = useRef(null);
  const dutyStatusRef = useRef('OFF_DUTY');
  const lastSentPositionRef = useRef(null);
  const recentlyCheckedOutSiteRef = useRef(null);
  
  const locationsRef = useRef([]);
  const assignedTasksRef = useRef([]);

  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { assignedTasksRef.current = assignedTasks; }, [assignedTasks]);
  useEffect(() => { checkedInRef.current = checkedIn; }, [checkedIn]);
  useEffect(() => { checkedInSiteRef.current = checkedInSite; }, [checkedInSite]);
  useEffect(() => { dutyStatusRef.current = dutyStatus; localStorage.setItem('lastStatus', dutyStatus); }, [dutyStatus]);

  const resetIdleWarningTimer = async () => {
    if (!isApp) return;
    const permissionStatus = await LocalNotifications.checkPermissions();
    if (permissionStatus.display !== 'granted') await LocalNotifications.requestPermissions();
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
      const t = JSON.parse(localStorage.getItem('offlineTaskQueue') || '[]').length;
      const a = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]').length;
      const s = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]').length;
      const l = JSON.parse(localStorage.getItem('offlineLocationQueue') || '[]').length;
      setPendingOfflineActions(v + t + a + s + l);
  }, []);

  const fetchData = useCallback(async () => {
    if (isFetchingRef.current || !navigator.onLine) return;
    isFetchingRef.current = true;
    const t = Date.now();
    
    const [locRes, histRes, profRes, shiftRes, tasksRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/locations?_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/field-officer/my-visits?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/shift/current?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/tasks?email=${userEmail}&role=field_officer&_t=${t}`).catch(() => ({ ok: false }))
    ]);
    
    let loadedLocs = [];
    if (locRes && locRes.ok) { loadedLocs = await locRes.json(); setLocations(loadedLocs); }
    
    let parsedVisits = [];
    if (histRes && histRes.ok) { parsedVisits = await histRes.json(); setVisitHistory(parsedVisits); }
    
    if (tasksRes && tasksRes.ok) setAssignedTasks(await tasksRes.json());

    if (profRes && profRes.ok) {
        const prof = await profRes.json();
        setCheckedIn(Boolean(prof.checked_in));
        
        if (prof.checked_in && prof.active_location_id) {
            const site = loadedLocs.find(l => Number(l.id) === Number(prof.active_location_id));
            setCheckedInSite(site || null);
            
            const todayFormatted = getFormattedDateStr();
            const hasReport = parsedVisits.some(v => v.site_name === (site?.name) && v.visit_time.includes(todayFormatted));
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
            setDutyStatus('OFF_DUTY'); setShiftData(null); setTravelHours(0);
            if (isApp) LizzaTracker.stopTracking();
        }
    }
    isFetchingRef.current = false;
  }, [userEmail]);

  useEffect(() => {
    if (dutyStatus === 'OFF_DUTY' || !shiftData || !shiftData.login_time) { setDutyHours(0); setTravelHours(0); return; }
    let currentTravelSec = shiftData.travel_seconds || 0;
    const loginTime = new Date(shiftData.login_time).getTime();
    const breakStartTime = shiftData.break_start_time ? new Date(shiftData.break_start_time).getTime() : null;

    const interval = setInterval(() => {
        const now = Date.now();
        let elapsedMs = now - loginTime;
        let breakMs = (shiftData.total_break_seconds || 0) * 1000;
        if (dutyStatus === 'ON_BREAK' && breakStartTime) breakMs += (now - breakStartTime);
        let activeDutyMs = Math.max(0, elapsedMs - breakMs);
        setDutyHours(activeDutyMs / (1000 * 60 * 60));

        if (dutyStatus === 'ON_DUTY' && !checkedInRef.current) currentTravelSec += 1;
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
        const locRes = await fetch(`${API_BASE_URL}/api/user/sync-offline-locations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail, locations: locQ }) }).catch(() => ({ ok: false }));
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

    await syncQueue('offlineTaskQueue', '/api/field-officer/submit-task', (taskObj) => {
        const formData = new FormData();
        formData.append('task_id', taskObj.task_id);
        formData.append('completion_data', JSON.stringify(taskObj.completion_data));
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
    isProcessingRef.current = true; setIsSubmitting(true);
    
    // INSTANT STATE UPDATE (Prevents GPS Jitter/Loops)
    if (type === 'CHECK_IN') {
        checkedInRef.current = true;
        checkedInSiteRef.current = targetSite;
        setCheckedIn(true);
        setCheckedInSite(targetSite);
    } else {
        checkedInRef.current = false;
        checkedInSiteRef.current = null;
        setCheckedIn(false);
        setCheckedInSite(null);
    }

    let exactTime = new Date().toISOString();
    if (type === 'CHECK_IN' && targetSite) {
        const savedGeofenceEntryTime = localStorage.getItem(`entry_time_${targetSite.id}`);
        if (savedGeofenceEntryTime) exactTime = savedGeofenceEntryTime;
    }
    
    if (type === 'CHECK_OUT' && targetSite) {
        recentlyCheckedOutSiteRef.current = targetSite.id;
    }

    const payload = { email: userEmail, lat: loc.lat, lon: loc.lon, timestamp: exactTime, actionType: type, location_id: targetSite?.id || null };

    if (!isOnline && isApp) {
        const q = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
        q.push(payload); localStorage.setItem('offlineAttendanceQueue', JSON.stringify(q));
        if (type === 'CHECK_IN') setHasSubmittedReport(false);
        if (type === 'CHECK_OUT' && targetSite) localStorage.removeItem(`entry_time_${targetSite.id}`);
        updateQueueCounts(); isProcessingRef.current = false; setIsSubmitting(false);
    } else {
        const ep = type === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
        const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => ({ ok: false }));
        if (res && res.ok) {
            setAlertMsg({ type: 'success', text: `Successfully ${type === 'CHECK_IN' ? 'Checked In' : 'Checked Out'}` });
            if (type === 'CHECK_IN') setHasSubmittedReport(false);
            if (type === 'CHECK_OUT' && targetSite) localStorage.removeItem(`entry_time_${targetSite.id}`);
            await fetchData();
        }
        setIsSubmitting(false); isProcessingRef.current = false;
    }
  };

  const hasCompletedSiteToday = (siteId) => {
      const site = locationsRef.current.find(l => l.id === siteId);
      if (!site) return false;
      const todayStr = getFormattedDateStr();
      return visitHistory.some(v => v.site_name === site.name && v.visit_time.includes(todayStr));
  };

  // DEPENDENCY OPTIMIZED: Uses Refs to prevent continuous Android GPS destroying/rebuilding
  const processNewLocation = useCallback(async (lat, lon, accuracy, timestamp, speedMetersPerSec) => {
    if (accuracy > 100) return; 
    let speedKmh = 0;
    if (speedMetersPerSec !== null && speedMetersPerSec !== undefined && speedMetersPerSec >= 0) speedKmh = speedMetersPerSec * 3.6;
    else if (lastSentPositionRef.current && lastSentPositionRef.current.timestamp) {
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
        const payload = { email: userEmail, lat, lon, accuracy, timestamp, activity_state: 'TRAVELING', speed: parseFloat(speedKmh.toFixed(2)), activity_type: inferredActivity };
        if (userEmail && dutyStatusRef.current === 'ON_DUTY') {
            if (navigator.onLine) fetch(`${API_BASE_URL}/api/location/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(()=>{});
            else if (isApp) {
                const q = JSON.parse(localStorage.getItem('offlineLocationQueue') || '[]');
                q.push(payload); localStorage.setItem('offlineLocationQueue', JSON.stringify(q)); updateQueueCounts();
            }
        }
    }
    setMyLoc({ lat, lon });

    const todayStr = new Date().toISOString().split('T')[0];
    const pendingSitesToday = assignedTasksRef.current.filter(t => t.date === todayStr && t.status === 'PENDING').map(t => Number(t.site_id));
    
    const sitesWithDistance = locationsRef.current.map(site => ({ 
        ...site, 
        distance: calculateDistance(lat, lon, site.lat, site.lon),
        hasTaskToday: pendingSitesToday.includes(Number(site.id))
    }));
    
    sitesWithDistance.sort((a, b) => {
        if (a.hasTaskToday && !b.hasTaskToday) return -1;
        if (!a.hasTaskToday && b.hasTaskToday) return 1;
        return a.distance - b.distance;
    });
    
    setNearbySites(sitesWithDistance);
    const insideSite = sitesWithDistance[0] && sitesWithDistance[0].distance <= (sitesWithDistance[0].radius || 200) ? sitesWithDistance[0] : null;
    
    if (insideSite) {
        if (!localStorage.getItem(`entry_time_${insideSite.id}`)) {
            localStorage.setItem(`entry_time_${insideSite.id}`, timestamp);
        }
    }
    setProximateSite(insideSite);

    if (dutyStatusRef.current === 'ON_DUTY' && !isProcessingRef.current) {
        // 1. Loop-Proof Check-In Logic
        if (insideSite && !checkedInRef.current) {
            // Check in if they didn't just check out, AND they haven't finished this site today
            if (recentlyCheckedOutSiteRef.current !== insideSite.id && !hasCompletedSiteToday(insideSite.id)) {
                handleAttendance('CHECK_IN', insideSite, { lat, lon });
            }
        }
        
        // 2. Anti-Bounce Loop Prevention
        if (!insideSite && recentlyCheckedOutSiteRef.current) {
            const rSite = locationsRef.current.find(l => l.id === recentlyCheckedOutSiteRef.current);
            if (rSite) {
                // Must drive 150m away before memory clears (stops 50m checkout -> 49m checkin loops)
                if (calculateDistance(lat, lon, rSite.lat, rSite.lon) > 150) {
                    recentlyCheckedOutSiteRef.current = null;
                }
            } else {
                recentlyCheckedOutSiteRef.current = null;
            }
        }

        // 3. Strict 50-Meter Auto Check-Out
        if (checkedInRef.current && checkedInSiteRef.current) {
            const distToActive = calculateDistance(lat, lon, checkedInSiteRef.current.lat, checkedInSiteRef.current.lon);
            if (distToActive > 50) {
                handleAttendance('CHECK_OUT', checkedInSiteRef.current, { lat, lon }).then(() => {
                    setAlertMsg({ type: 'warning', text: 'You exceeded the 50-meter perimeter. Checked out automatically.' });
                });
            }
        }
    }
  }, [userEmail]); // Minimal dependencies prevents Android Location Service freezing

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
        q.push(payload); localStorage.setItem('offlineShiftQueue', JSON.stringify(q));
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

  const updateTaskForm = (taskId, key, val) => {
      setActiveTaskForm(prev => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), [key]: val, id: taskId } }));
  };

  const submitTaskChecklist = async (e, targetSite, activeTask) => {
      e.preventDefault();
      setIsSubmitting(true);
      
      const completionDataArray = [];
      for (const t of activeTask.tasks) {
          const st = activeTaskForm[t.id];
          if (!st || st.is_done === undefined) {
              setIsSubmitting(false);
              return alert(`Please select Done/Not Done for: ${t.description}`);
          }
          if (st.is_done && !st.photo) {
              setIsSubmitting(false);
              return alert(`Photo is required for completed task: ${t.description}`);
          }
          
          let compressedPhotoBase64 = null;
          if (st.is_done && st.photo) {
              const comp = await compressImage(st.photo);
              compressedPhotoBase64 = await fileToBase64(comp);
          }
          
          completionDataArray.push({
              id: t.id,
              description: t.description,
              is_done: st.is_done,
              remarks: st.remarks || '',
              photoBase64: compressedPhotoBase64
          });
      }

      if (!isOnline && isApp) {
          const q = JSON.parse(localStorage.getItem('offlineTaskQueue') || '[]');
          q.push({ task_id: activeTask.task_id, completion_data: completionDataArray });
          localStorage.setItem('offlineTaskQueue', JSON.stringify(q));
          setAlertMsg({ type: 'warning', text: 'Offline. Checklist safely queued.' });
          setHasSubmittedReport(true); updateQueueCounts();
      } else {
          const formData = new FormData();
          formData.append('task_id', activeTask.task_id);
          formData.append('completion_data', JSON.stringify(completionDataArray));
          
          const res = await fetch(`${API_BASE_URL}/api/field-officer/submit-task`, { method: 'POST', body: formData }).catch(() => ({ ok: false }));
          if (res && res.ok) {
              setAlertMsg({ type: 'success', text: 'Task Checklist Logged!' });
              setHasSubmittedReport(true); fetchData();
          } else { alert("Failed to log task list. Try again."); }
      }
      setIsSubmitting(false);
  };

  const handleGenericSubmit = async (e, targetSite) => {
    e.preventDefault();
    if (!checkedIn) return alert("Wait! The system has not confirmed your check-in yet.");
    if (!targetSite || !myLoc) return alert("You must be officially checked into a site to log a visit.");
    
    const validEntries = visitEntries.filter(entry => entry.photo !== null);
    if (validEntries.length === 0) return alert("Photo required.");
    setIsSubmitting(true);
    const detailsArray = []; const compressedPhotos = [];
    for (let i = 0; i < validEntries.length; i++) { compressedPhotos.push(await compressImage(validEntries[i].photo)); detailsArray.push(validEntries[i].details); }
    
    if (!isOnline && isApp) {
        const base64Strings = await Promise.all(compressedPhotos.map(p => fileToBase64(p)));
        const q = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
        q.push({ email: userEmail, location_id: targetSite.id, purpose, photo_details: JSON.stringify(detailsArray), lat: myLoc.lat, lon: myLoc.lon, timestamp: new Date().toISOString(), photosBase64: base64Strings });
        localStorage.setItem('offlineVisitQueue', JSON.stringify(q));
        setAlertMsg({ type: 'warning', text: 'Offline. Visit queued.' });
        setPurpose(''); setVisitEntries([{ photo: null, details: '' }]); setHasSubmittedReport(true); updateQueueCounts();
    } else {
        const formData = new FormData();
        formData.append('email', userEmail); formData.append('location_id', targetSite.id); formData.append('purpose', purpose); formData.append('photo_details', JSON.stringify(detailsArray)); formData.append('lat', myLoc.lat); formData.append('lon', myLoc.lon); formData.append('timestamp', new Date().toISOString()); 
        compressedPhotos.forEach((p) => { formData.append('photos', p); });
        const res = await fetch(`${API_BASE_URL}/api/field-officer/log-visit`, { method: 'POST', body: formData }).catch(() => ({ ok: false }));
        if (res && res.ok) { setAlertMsg({ type: 'success', text: 'Visit logged successfully!' }); setPurpose(''); setVisitEntries([{ photo: null, details: '' }]); setHasSubmittedReport(true); fetchData(); } 
        else { alert("Failed to log visit."); }
    }
    setIsSubmitting(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const activeTaskObj = (checkedInSite || proximateSite) ? assignedTasks.find(t => Number(t.site_id) === Number((checkedInSite || proximateSite).id) && t.date === todayStr && t.status === 'PENDING') : null;

  const pendingTasks = assignedTasks.filter(t => t.status === 'PENDING');
  const completedTasks = assignedTasks.filter(t => t.status === 'COMPLETED');

  // If alertMsg is shown, automatically clear it after 8 seconds
  useEffect(() => {
    if (alertMsg) {
        const timer = setTimeout(() => setAlertMsg(null), 8000);
        return () => clearTimeout(timer);
    }
  }, [alertMsg]);

  return (
    <>
      <style>
        {`
          .mobile-ui-container { background-color: #f4f6f9; min-height: 100vh; padding-bottom: 80px; }
          .android-card { border-radius: 16px; border: none; box-shadow: 0 4px 20px rgba(0,0,0,0.06); overflow: hidden; background: #fff; }
          .pulse-btn { animation: pulseAnim 2s infinite; }
          @keyframes pulseAnim {
              0% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.4); }
              70% { box-shadow: 0 0 0 15px rgba(40, 167, 69, 0); }
              100% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0); }
          }
          .slide-up { animation: slideUpAnim 0.5s ease-out forwards; }
          @keyframes slideUpAnim {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
          }
          .custom-pill-tabs .nav-link { border-radius: 20px; color: #6c757d; font-weight: 600; padding: 10px 20px; margin: 0 5px; background: #f8f9fa; border: 1px solid #dee2e6; }
          .custom-pill-tabs .nav-link.active { background: #0d6efd; color: white; border-color: #0d6efd; box-shadow: 0 4px 10px rgba(13,110,253,0.3); }
          .form-floating-label { font-size: 0.85rem; font-weight: 600; color: #495057; }
        `}
      </style>

      <div className="mobile-ui-container pt-3">
        <Container fluid="md">
          
          <div className="d-flex justify-content-between align-items-center mb-3 px-2">
            <h4 className="fw-bold m-0 text-dark d-flex align-items-center"><Navigation className="text-primary me-2" size={24}/>Operations</h4>
          </div>

          {(!isOnline || pendingOfflineActions > 0) && isApp && (
            <Alert variant="warning" className="d-flex justify-content-between align-items-center mb-3 py-2 shadow-sm rounded-pill small slide-up">
                <span>
                    {isOnline ? <RefreshCw size={16} className="me-2 text-primary" /> : <WifiOff size={16} className="me-2 text-danger" />}
                    <strong className="me-1">{isOnline ? 'Syncing Data...' : 'Offline Mode'}</strong> {pendingOfflineActions} action(s) waiting.
                </span>
            </Alert>
          )}

          {alertMsg && (
            <Alert variant={alertMsg.type} className="mb-3 shadow-sm rounded-4 small fw-bold slide-up border-0 d-flex justify-content-between">
                {alertMsg.text}
                <button type="button" className="btn-close" style={{fontSize: '10px'}} onClick={() => setAlertMsg(null)}></button>
            </Alert>
          )}

          {/* MASTER SHIFT CARD */}
          <Card className="android-card slide-up mb-3">
              <Card.Body className="p-4 d-flex flex-column gap-3">
                  <div>
                      <h5 className="fw-bold mb-1 d-flex align-items-center text-dark"><Clock className="me-2 text-primary" size={20}/> Day Shift Protocol</h5>
                      <div className="text-muted small">
                          {dutyStatus === 'OFF_DUTY' ? "Start your shift to activate live GPS tracking and tasks." : 
                           dutyStatus === 'ON_BREAK' ? "Shift paused. Location tracking is disabled." : 
                           <div className="d-flex align-items-center flex-wrap mt-2 bg-light p-2 rounded-3 border">
                               <span className="me-3"><strong>Duty:</strong> <span className="text-primary">{Math.floor(dutyHours)}h {Math.floor((dutyHours % 1) * 60)}m</span></span>
                               <span><Activity size={14} className="text-success ms-1 me-1"/> <strong>Travel:</strong> {Math.floor(travelHours)}h {Math.floor((travelHours % 1) * 60)}m</span>
                           </div>}
                      </div>
                  </div>
                  <div className="d-flex gap-2 mt-1">
                      {dutyStatus === 'OFF_DUTY' && <Button variant="primary" size="lg" className="fw-bold flex-grow-1 rounded-pill shadow-sm" onClick={() => handleDayShiftAction('START')} disabled={isSubmitting}>Start Shift</Button>}
                      {dutyStatus === 'ON_DUTY' && <Button variant="warning" size="lg" className="fw-bold text-dark flex-grow-1 rounded-pill shadow-sm" onClick={() => handleDayShiftAction('BREAK')} disabled={isSubmitting}><Coffee size={18} className="me-1"/> Break</Button>}
                      {dutyStatus === 'ON_BREAK' && <Button variant="success" size="lg" className="fw-bold flex-grow-1 rounded-pill shadow-sm" onClick={() => handleDayShiftAction('RESUME')} disabled={isSubmitting}>Resume Duty</Button>}
                      {dutyStatus !== 'OFF_DUTY' && <Button variant="danger" size="lg" className="fw-bold flex-grow-1 rounded-pill shadow-sm" onClick={() => handleDayShiftAction('END')} disabled={isSubmitting}>End Shift</Button>}
                  </div>
              </Card.Body>
          </Card>

          {dutyStatus !== 'OFF_DUTY' && dutyStatus !== 'ON_BREAK' && (
            <Row className="g-3 mb-4 slide-up" style={{animationDelay: '0.1s'}}>
              
              <Col lg={6}>
                <Card className="android-card h-100 border-top border-4 border-success">
                  <Card.Body className="p-4">
                    <h5 className="fw-bold mb-3 d-flex align-items-center text-dark"><MapPin className="me-2 text-danger"/> Geofence Protocol</h5>
                    
                    {checkedIn ? (
                      <div className="bg-success bg-opacity-10 border border-success border-2 rounded-4 p-4 mb-4 text-center shadow-sm">
                          <CheckCircle className="text-success mb-2" size={40}/>
                          <h5 className="text-success fw-bold mb-1">ACTIVE CHECK-IN</h5>
                          <div className="text-dark fs-5 fw-bolder mt-2">{checkedInSite?.name || proximateSite?.name || 'Verifying...'}</div>
                      </div>
                    ) : proximateSite ? (
                      <div className="bg-info bg-opacity-10 border border-info border-2 rounded-4 p-4 mb-4 text-center shadow-sm">
                          <h6 className="text-info fw-bold mb-1">PROXIMITY DETECTED</h6>
                          <div className="text-dark fs-6 fw-bold mt-2">{proximateSite.name}</div>
                          <div className="text-muted small mt-1">You are inside the perimeter.</div>
                      </div>
                    ) : (
                      <div className="bg-light border rounded-4 p-4 mb-4 text-center">
                          <MapIcon size={30} className="text-muted opacity-50 mb-2"/>
                          <div className="text-muted fw-bold">Searching for perimeter...</div>
                          <small className="text-secondary">Drive to an assigned site.</small>
                      </div>
                    )}

                    <div className="d-flex flex-column gap-2 mb-2">
                      {!checkedIn && proximateSite && (
                        <Button variant="success" size="lg" className="w-100 fw-bold shadow pulse-btn rounded-pill" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_IN', proximateSite, myLoc)}>
                            <LogIn className="me-2" size={20}/> Check In Here
                        </Button>
                      )}
                      
                      {checkedIn && hasSubmittedReport && (
                        <Button variant="danger" size="lg" className="w-100 fw-bold shadow rounded-pill" disabled={isSubmitting} onClick={() => handleAttendance('CHECK_OUT', checkedInSite || proximateSite, myLoc)}>
                            <LogOut className="me-2" size={20}/> Complete & Check Out
                        </Button>
                      )}
                      
                      {checkedIn && !hasSubmittedReport && (
                        <Alert variant="warning" className="text-center small fw-bold mb-0 border-0 rounded-pill bg-warning bg-opacity-25 text-dark">
                            <AlertTriangle size={16} className="me-1 mb-1"/> Please submit report to unlock Check-Out
                        </Alert>
                      )}
                    </div>

                    {/* REPORTING FORMS */}
                    {checkedIn && !hasSubmittedReport && (
                      <div className="mt-4 pt-3 border-top border-2 border-dashed">
                          {activeTaskObj ? (
                              <Form onSubmit={(e) => submitTaskChecklist(e, checkedInSite || proximateSite, activeTaskObj)}>
                                  <div className="d-flex align-items-center mb-3 bg-primary bg-opacity-10 p-2 rounded-pill">
                                      <CheckSquare className="me-2 text-primary ms-2" size={20}/>
                                      <h6 className="fw-bold mb-0 text-primary">Required Checklist</h6>
                                  </div>
                                  
                                  {activeTaskObj.tasks.map((t, idx) => (
                                      <div key={t.id} className="mb-3 p-3 bg-light border rounded-4 shadow-sm position-relative">
                                          <Badge bg="dark" className="position-absolute top-0 start-0 translate-middle ms-3 mt-1 rounded-circle">{idx+1}</Badge>
                                          <div className="fw-bold text-dark mb-3 mt-1 ps-2">{t.description}</div>
                                          
                                          <div className="d-flex gap-3 mb-3 bg-white p-2 rounded-pill border justify-content-center">
                                             <Form.Check type="radio" label={<span className="text-success fw-bold small">Done</span>} name={`status_${t.id}`} onChange={() => updateTaskForm(t.id, 'is_done', true)} required/>
                                             <Form.Check type="radio" label={<span className="text-danger fw-bold small">Not Done</span>} name={`status_${t.id}`} onChange={() => updateTaskForm(t.id, 'is_done', false)} required/>
                                          </div>

                                          {activeTaskForm[t.id]?.is_done && (
                                              <Form.Group className="mb-3 bg-white p-2 rounded-3 border">
                                                  <Form.Label className="form-floating-label mb-1"><Camera size={14} className="me-1"/> Take Photo <span className="text-danger">*</span></Form.Label>
                                                  <Form.Control size="sm" type="file" accept="image/*" capture="environment" className="border-0 bg-light rounded" onChange={e => updateTaskForm(t.id, 'photo', e.target.files[0])} required />
                                              </Form.Group>
                                          )}
                                          <Form.Group>
                                              <Form.Control size="sm" as="textarea" rows={2} className="rounded-3 border-light bg-white shadow-sm" placeholder="Add remarks..." onChange={e => updateTaskForm(t.id, 'remarks', e.target.value)} />
                                          </Form.Group>
                                      </div>
                                  ))}
                                  <Button type="submit" variant="primary" size="lg" className="w-100 fw-bold shadow-sm rounded-pill mt-3" disabled={isSubmitting}>
                                      {isSubmitting ? <Spinner size="sm"/> : "Submit Checklist & Complete"}
                                  </Button>
                              </Form>
                          ) : (
                              <Form onSubmit={(e) => handleGenericSubmit(e, checkedInSite || proximateSite)}>
                                <div className="d-flex align-items-center mb-3 bg-dark bg-opacity-10 p-2 rounded-pill">
                                    <FileText className="me-2 text-dark ms-2" size={20}/>
                                    <h6 className="fw-bold mb-0 text-dark">Standard Site Report</h6>
                                </div>
                                <Form.Select className="mb-3 py-3 rounded-pill bg-light border-0 shadow-sm fw-bold text-muted" value={purpose} onChange={e => setPurpose(e.target.value)} required>
                                    <option value="">Select Visit Purpose...</option><option value="Routine Inspection">Routine Inspection</option><option value="Client Meeting">Client Meeting</option><option value="Issue Resolution">Issue Resolution</option><option value="Training">Training</option><option value="Bill Submission">Bill Submission</option>
                                </Form.Select>
                                
                                <div className="bg-light p-2 rounded-4 mb-3">
                                    {visitEntries.map((entry, idx) => (
                                        <div key={idx} className="mb-2 p-3 bg-white border rounded-4 shadow-sm">
                                            <div className="fw-bold text-dark small mb-2 d-flex justify-content-between align-items-center">
                                                <span><Camera size={14} className="me-1"/> Photo {idx + 1}</span>
                                                {visitEntries.length > 1 && (
                                                    <Badge bg="danger" style={{cursor: 'pointer'}} onClick={() => { const n = [...visitEntries]; n.splice(idx, 1); setVisitEntries(n); }}>Remove</Badge>
                                                )}
                                            </div>
                                            <Form.Control type="file" accept="image/*" capture="environment" className="mb-3 bg-light border-0 rounded" onChange={(e) => { const n = [...visitEntries]; n[idx].photo = e.target.files[0]; setVisitEntries(n); }} required />
                                            <Form.Control as="textarea" rows={2} className="rounded-3 border-light bg-light" placeholder="Detailed observations..." value={entry.details} onChange={(e) => { const n = [...visitEntries]; n[idx].details = e.target.value; setVisitEntries(n); }} required />
                                        </div>
                                    ))}
                                    <Button variant="outline-primary" size="sm" className="w-100 fw-bold border-dashed mb-3 rounded-pill" onClick={() => setVisitEntries([...visitEntries, { photo: null, details: '' }])}>
                                        + Add Another Photo
                                    </Button>
                                </div>
                                <Button type="submit" variant="dark" size="lg" className="w-100 fw-bold shadow rounded-pill" disabled={isSubmitting}>
                                    {isSubmitting ? <Spinner size="sm" /> : "Upload Report"}
                                </Button>
                              </Form>
                          )}
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={6}>
                <Card className="android-card h-100">
                    <Card.Body className="p-0 position-relative">
                        <div className="position-absolute top-0 start-0 w-100 p-2 z-1">
                            <div className="bg-white px-3 py-2 rounded-pill shadow-sm d-inline-block fw-bold small text-primary"><MapPin size={14} className="me-1"/>Live GPS Tracking</div>
                        </div>
                        <MapContainer center={[12.9716, 77.5946]} zoom={13} style={{ height: '300px', width: '100%', borderRadius: '16px' }} zoomControl={false}>
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          {locations.map(site => (
                            <Circle key={site.id} center={[site.lat, site.lon]} radius={site.radius || 200} pathOptions={{ color: '#0d6efd', fillOpacity: 0.15, weight: 2 }}>
                              <Popup>{site.name}</Popup>
                            </Circle>
                          ))}
                          {myLoc && (
                            <Marker position={[myLoc.lat, myLoc.lon]}>
                              <Popup>You</Popup>
                            </Marker>
                          )}
                        </MapContainer>
                    </Card.Body>
                </Card>
              </Col>
            </Row>
          )}

          {/* TASK CENTER & PRIORITY SITES */}
          <div className="slide-up" style={{animationDelay: '0.2s'}}>
              <Tabs defaultActiveKey="tasks" className="custom-pill-tabs mb-3 border-0 justify-content-center">
                  
                  <Tab eventKey="tasks" title="My Tasks">
                      <Card className="android-card bg-transparent shadow-none">
                          <Card.Body className="p-0">
                              <h6 className="fw-bold mb-3 px-1 text-dark">Pending Execution ({pendingTasks.length})</h6>
                              {pendingTasks.length === 0 ? <div className="text-center text-muted p-4 bg-white rounded-4 shadow-sm">All clear! No tasks waiting.</div> : (
                                  <div className="d-flex flex-column gap-2">
                                      {pendingTasks.map((t, i) => (
                                          <div key={i} className="bg-white p-3 rounded-4 shadow-sm border-start border-4 border-danger d-flex justify-content-between align-items-center">
                                              <div>
                                                  <div className="fw-bold text-dark">{t.site_name}</div>
                                                  <div className="text-muted small mt-1"><CheckSquare size={12} className="me-1"/>{t.tasks?.length || 0} checklist items</div>
                                              </div>
                                              <Badge bg="danger" className="rounded-pill px-3 py-2 shadow-sm">Drive to Site</Badge>
                                          </div>
                                      ))}
                                  </div>
                              )}

                              <h6 className="fw-bold mb-3 mt-4 px-1 text-success">Cleared Today ({completedTasks.length})</h6>
                              <div className="d-flex flex-column gap-2">
                                  {completedTasks.length === 0 ? <div className="text-center text-muted p-3">None yet.</div> : (
                                      completedTasks.map((t, i) => (
                                          <div key={i} className="bg-white p-3 rounded-4 shadow-sm border-start border-4 border-success d-flex justify-content-between align-items-center opacity-75">
                                              <div>
                                                  <div className="fw-bold text-dark text-decoration-line-through">{t.site_name}</div>
                                                  <div className="text-muted small mt-1">{t.date}</div>
                                              </div>
                                              <CheckCircle size={24} className="text-success"/>
                                          </div>
                                      ))
                                  )}
                              </div>
                          </Card.Body>
                      </Card>
                  </Tab>
                  
                  <Tab eventKey="directory" title="Sites Directory">
                      <Card className="android-card">
                          <Card.Body className="p-0">
                            <Table hover responsive className="mb-0 align-middle small border-0">
                              <tbody>
                                {nearbySites.map(site => (
                                    <tr key={site.id}>
                                      <td className="ps-4 border-0 border-bottom py-3">
                                        <div className="fw-bold text-dark d-flex align-items-center">
                                            {site.name} 
                                            {site.hasTaskToday && <Badge bg="danger" className="ms-2 rounded-pill"><CheckSquare size={10} className="me-1"/>Task</Badge>}
                                        </div>
                                        <div className="text-muted mt-1 fw-bold">{site.distance < 1000 ? `${Math.round(site.distance)}m away` : `${(site.distance / 1000).toFixed(1)}km away`}</div>
                                      </td>
                                    </tr>
                                ))}
                                {nearbySites.length === 0 && <tr><td className="text-center text-muted py-5">No sites found in database.</td></tr>}
                              </tbody>
                            </Table>
                          </Card.Body>
                      </Card>
                  </Tab>
              </Tabs>
          </div>

        </Container>
      </div>
    </>
  );
};

export default FieldOfficerDashboard;