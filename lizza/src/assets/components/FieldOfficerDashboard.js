import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Spinner, Table, Badge, Tabs, Tab, Modal } from 'react-bootstrap';
import { MapPin, Navigation, CheckCircle, FileText, Map as MapIcon, LogIn, LogOut, WifiOff, RefreshCw, Clock, Coffee, Activity, AlertTriangle, CheckSquare, Camera, XCircle, Users, ChevronRight, Plus, Shirt } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import EmployeeOnboardForm from './EmployeeOnboardForm';

const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";
const isApp = Capacitor.isNativePlatform();
const LizzaTracker = registerPlugin('LizzaTracker');

const fileToBase64 = (file) => new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); });
const base64ToFile = (base64String, filename) => { const arr = base64String.split(','); const mime = arr[0].match(/:(.*?);/)[1]; const bstr = atob(arr[1]); let n = bstr.length; const u8arr = new Uint8Array(n); while(n--){ u8arr[n] = bstr.charCodeAt(n); } return new File([u8arr], filename, {type:mime}); };
const compressImage = async (file, maxWidth = 1000, quality = 0.7) => { return new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = (event) => { const img = new Image(); img.src = event.target.result; img.onload = () => { const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, width, height); canvas.toBlob((blob) => { resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })); }, 'image/jpeg', quality); }; }; }); };
const calculateDistance = (lat1, lon1, lat2, lon2) => { const R = 6371000; const toRad = (deg) => (deg * Math.PI) / 180; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };


const getFormattedDateStr = (date = new Date()) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = date.getDate().toString().padStart(2, '0');
    const m = months[date.getMonth()];
    const y = date.getFullYear();
    return `${d}-${m}-${y}`; 
};

const OfficerMap = React.memo(({ locations, myLoc }) => (
    <MapContainer center={[12.9716, 77.5946]} zoom={13} style={{ height: '100%', minHeight: '350px', width: '100%', borderRadius: '24px' }} zoomControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {locations.map(site => (
        <Circle key={site.id} center={[site.lat, site.lon]} radius={site.radius || 200} pathOptions={{ color: '#3b82f6', fillOpacity: 0.15, weight: 2 }}>
          <Popup>{site.name}</Popup>
        </Circle>
      ))}
      {myLoc && (
        <Marker position={[myLoc.lat, myLoc.lon]}>
          <Popup>You</Popup>
        </Marker>
      )}
    </MapContainer>
), (prevProps, nextProps) => {
    return prevProps.locations.length === nextProps.locations.length && 
           prevProps.myLoc?.lat === nextProps.myLoc?.lat && 
           prevProps.myLoc?.lon === nextProps.myLoc?.lon;
});

const FieldOfficerDashboard = () => {
  const userEmail = localStorage.getItem('userEmail');

  const [dbUser, setDbUser] = useState(null);
  const [dutyStatus, setDutyStatus] = useState(() => localStorage.getItem('lastStatus') || 'OFF_DUTY');
  const [shiftData, setShiftData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [visitHistory, setVisitHistory] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]); 
  const [onboardedCount, setOnboardedCount] = useState(0);
  const locationBatchQueueRef = useRef([]);
  const [myLoc, setMyLoc] = useState(null);
  const [nearbySites, setNearbySites] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [proximateSite, setProximateSite] = useState(null); 
  const [checkedInSite, setCheckedInSite] = useState(null); 
  const [checkedIn, setCheckedIn] = useState(false);
  const [hasSubmittedReport, setHasSubmittedReport] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  
  const [dutyTimeStr, setDutyTimeStr] = useState("0h 0m");
  const [travelTimeStr, setTravelTimeStr] = useState("0h 0m");
  const timeStrRef = useRef({ duty: "0h 0m", travel: "0h 0m" });
  
  const [purpose, setPurpose] = useState('');
  const [visitEntries, setVisitEntries] = useState([{ photo: null, details: '' }]);
  const [activeTaskForm, setActiveTaskForm] = useState({});

  const [alertMsg, setAlertMsg] = useState(null);
  const [pendingOfflineActions, setPendingOfflineActions] = useState(0);

  // --- New Modals State ---
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [showUniformModal, setShowUniformModal] = useState(false);
 const [uniformReqForm, setUniformReqForm] = useState({ 
      target_user_id: '', 
      shirtSize: '', 
      pantSize: '', 
      shoeSize: '', 
      otherShirt: '', 
      otherPant: '', 
      otherShoe: '' 
  });
  const [teamMembers, setTeamMembers] = useState([]);

  // Safely filter recruits INSIDE the component
  const myRecruits = teamMembers.filter(m => m.onboarded_by_email === userEmail);

  const isFetchingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const checkedInRef = useRef(false);
  const checkedInSiteRef = useRef(null);
  const dutyStatusRef = useRef('OFF_DUTY');
  const lastSentPositionRef = useRef(null);
  const recentlyCheckedOutSiteRef = useRef(null);
  const localCompletedSitesRef = useRef([]); 

  const locationsRef = useRef([]);
  const assignedTasksRef = useRef([]);

  useEffect(() => { locationsRef.current = locations; }, [locations]);
  useEffect(() => { assignedTasksRef.current = assignedTasks; }, [assignedTasks]);
  useEffect(() => { checkedInRef.current = checkedIn; }, [checkedIn]);
  useEffect(() => { checkedInSiteRef.current = checkedInSite; }, [checkedInSite]);
  useEffect(() => { dutyStatusRef.current = dutyStatus; localStorage.setItem('lastStatus', dutyStatus); }, [dutyStatus]);

  const triggerLocalNotification = async (title, body) => {
    if (!isApp) return; 
    try {
      const perms = await LocalNotifications.checkPermissions();
      if (perms.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
      await LocalNotifications.schedule({
        notifications: [{
          title: title, body: body, id: Math.floor(Date.now() / 10000), 
          schedule: { at: new Date(Date.now() + 100) }, sound: null, attachments: null, actionTypeId: "", extra: null
        }]
      });
    } catch (error) {
      console.error("Local Notification Failed:", error);
    }
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
    setIsSyncing(true);
    const t = Date.now();
    
    const [locRes, histRes, profRes, shiftRes, tasksRes, statsRes, adminEmpRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/locations?_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/field-officer/my-visits?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/user/profile?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/shift/current?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/tasks?email=${userEmail}&role=field_officer&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/field-officer/onboard-stats?email=${userEmail}&_t=${t}`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/admin/employees?admin_email=null`).catch(() => ({ ok: false })) // Open route to fetch all users for drop down
    ]);
    
    let loadedLocs = [];
    if (locRes && locRes.ok) { 
        loadedLocs = await locRes.json(); 
        setLocations(loadedLocs); 
        setNearbySites(loadedLocs.map(site => ({ ...site, distance: null })));
    }
    
    let parsedVisits = [];
    if (histRes && histRes.ok) { parsedVisits = await histRes.json(); setVisitHistory(parsedVisits); }
    if (tasksRes && tasksRes.ok) setAssignedTasks(await tasksRes.json());
    if (statsRes && statsRes.ok) { const stats = await statsRes.json(); setOnboardedCount(stats.onboarded_count); }
    if (adminEmpRes && adminEmpRes.ok) { 
        const allEmps = await adminEmpRes.json();
        setTeamMembers(allEmps.filter(e => e.user_type === 'employee')); 
    }

    if (profRes && profRes.ok) {
        const prof = await profRes.json();
        setDbUser(prof);
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
            setDutyStatus('OFF_DUTY'); setShiftData(null); 
            setDutyTimeStr("0h 0m"); setTravelTimeStr("0h 0m");
            if (isApp) LizzaTracker.stopTracking();
        }
    }
    setIsSyncing(false);
    isFetchingRef.current = false;
  }, [userEmail]);

  useEffect(() => {
    if (dutyStatus === 'OFF_DUTY' || !shiftData || !shiftData.login_time) { 
        setDutyTimeStr("0h 0m"); setTravelTimeStr("0h 0m"); 
        return; 
    }
    let currentTravelSec = shiftData.travel_seconds || 0;
    const loginTime = new Date(shiftData.login_time).getTime();
    const breakStartTime = shiftData.break_start_time ? new Date(shiftData.break_start_time).getTime() : null;

    const interval = setInterval(() => {
        const now = Date.now();
        let elapsedMs = now - loginTime;
        let breakMs = (shiftData.total_break_seconds || 0) * 1000;
        if (dutyStatus === 'ON_BREAK' && breakStartTime) breakMs += (now - breakStartTime);
        
        let activeDutyMs = Math.max(0, elapsedMs - breakMs);
        const dH = activeDutyMs / (1000 * 60 * 60);
        const dStr = `${Math.floor(dH)}h ${Math.floor((dH % 1) * 60)}m`;

        if (dutyStatus === 'ON_DUTY' && !checkedInRef.current) currentTravelSec += 1;
        const tH = currentTravelSec / 3600;
        const tStr = `${Math.floor(tH)}h ${Math.floor((tH % 1) * 60)}m`;

        if (timeStrRef.current.duty !== dStr || timeStrRef.current.travel !== tStr) {
            timeStrRef.current = { duty: dStr, travel: tStr };
            setDutyTimeStr(dStr);
            setTravelTimeStr(tStr);
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [dutyStatus, shiftData]); 

const syncOfflineData = useCallback(async () => {
    if (!navigator.onLine || !isApp || isProcessingRef.current) return;
    isProcessingRef.current = true;
    
    const syncQueue = async (storageKey, endpoint, mapFunc) => {
        let queue = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (queue.length === 0) return;

        let itemsToKeep = [];
        for (let item of queue) {
            const req = mapFunc ? mapFunc(item) : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) };
            const res = await fetch(`${API_BASE_URL}${endpoint}`, req).catch(() => null);
            
            // Only keep if network fails or server 500s. Drop 400 bad requests.
            if (!res || res.status >= 500) {
                itemsToKeep.push(item);
            }
        }

        // Prevent race conditions where user added data during the sync
        let freshQueue = JSON.parse(localStorage.getItem(storageKey) || '[]');
        let newlyAddedItems = freshQueue.slice(queue.length);
        localStorage.setItem(storageKey, JSON.stringify(itemsToKeep.concat(newlyAddedItems)));
    };

    await syncQueue('offlineShiftQueue', '/api/shift/day-action');
    
    let attQ = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
    if (attQ.length > 0) {
        let fAtt = [];
        for (let act of attQ) {
            const ep = act.actionType === 'CHECK_IN' ? '/api/user/checkin' : '/api/user/checkout';
            const res = await fetch(`${API_BASE_URL}${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(act) }).catch(() => null);
            if (!res || res.status >= 500) {
                fAtt.push(act);
            }
        }
        let freshAtt = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
        let newAtt = freshAtt.slice(attQ.length);
        localStorage.setItem('offlineAttendanceQueue', JSON.stringify(fAtt.concat(newAtt)));
    }

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
    isProcessingRef.current = false;
}, [updateQueueCounts, userEmail]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); if (isApp) syncOfflineData(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    fetchData(); 
    if (isApp) { updateQueueCounts(); if (navigator.onLine) syncOfflineData(); }
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, [fetchData, syncOfflineData, updateQueueCounts]);

  const hasCompletedSiteToday = useCallback((siteId) => {
      if (!siteId) return false;
      if (localCompletedSitesRef.current.includes(Number(siteId))) return true;
      const site = locations.find(l => Number(l.id) === Number(siteId));
      if (!site) return false;
      const todayStr = getFormattedDateStr();
      return visitHistory.some(v => v.site_name === site.name && v.visit_time.includes(todayStr));
  }, [locations, visitHistory]);

  const handleAttendance = (type, targetSite, loc) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true; 
    
    if (type === 'CHECK_IN') {
        checkedInRef.current = true;
        checkedInSiteRef.current = targetSite;
        setCheckedIn(true);
        setCheckedInSite(targetSite);
        setHasSubmittedReport(false);
        triggerLocalNotification("Location Reached", `Successfully checked into ${targetSite?.name || 'Site'}`);
    } else {
        checkedInRef.current = false;
        checkedInSiteRef.current = null;
        setCheckedIn(false);
        setCheckedInSite(null);
        if (targetSite) recentlyCheckedOutSiteRef.current = Number(targetSite.id);
        triggerLocalNotification("Check-Out Complete", `You have officially checked out of ${targetSite?.name || 'Site'}`);
    }
    setAlertMsg({ type: 'success', text: `Successfully ${type === 'CHECK_IN' ? 'Checked In' : 'Checked Out'}` });

    let exactTime = new Date().toISOString();
    if (type === 'CHECK_IN' && targetSite) {
        const savedGeofenceEntryTime = localStorage.getItem(`entry_time_${targetSite.id}`);
        if (savedGeofenceEntryTime) exactTime = savedGeofenceEntryTime;
    }

    Promise.resolve().then(() => {
        const payload = { email: userEmail, lat: loc.lat, lon: loc.lon, timestamp: exactTime, actionType: type, location_id: targetSite?.id || null };
        const q = JSON.parse(localStorage.getItem('offlineAttendanceQueue') || '[]');
        q.push(payload);
        localStorage.setItem('offlineAttendanceQueue', JSON.stringify(q));
        updateQueueCounts();
        if (navigator.onLine) syncOfflineData();
        if (type === 'CHECK_OUT' && targetSite) localStorage.removeItem(`entry_time_${targetSite.id}`);
        isProcessingRef.current = false;
    });
  };

  const processNewLocation = useCallback((lat, lon, accuracy, timestamp) => {
    if (accuracy > 100) return; 
    
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
        if (insideSite && !checkedInRef.current) {
            const isRecentlyCheckedOut = recentlyCheckedOutSiteRef.current !== null && Number(recentlyCheckedOutSiteRef.current) === Number(insideSite.id);
            const isFinishedToday = localCompletedSitesRef.current.includes(Number(insideSite.id));
            if (!isRecentlyCheckedOut && !isFinishedToday) {
                handleAttendance('CHECK_IN', insideSite, { lat, lon });
            }
        }
        
        if (!insideSite && recentlyCheckedOutSiteRef.current !== null) {
            const rSite = locationsRef.current.find(l => Number(l.id) === Number(recentlyCheckedOutSiteRef.current));
            if (rSite) {
                if (calculateDistance(lat, lon, rSite.lat, rSite.lon) > 150) {
                    recentlyCheckedOutSiteRef.current = null;
                }
            } else {
                recentlyCheckedOutSiteRef.current = null;
            }
        }

        if (checkedInRef.current && checkedInSiteRef.current) {
            const distToActive = calculateDistance(lat, lon, checkedInSiteRef.current.lat, checkedInSiteRef.current.lon);
            const activeRadius = checkedInSiteRef.current.radius || 200;
            const checkoutThreshold = activeRadius + 30; // 30 meter buffer outside the perimeter
            
            if (distToActive > checkoutThreshold) {
                handleAttendance('CHECK_OUT', checkedInSiteRef.current, { lat, lon });
                setAlertMsg({ type: 'warning', text: `You exceeded the ${checkoutThreshold}-meter perimeter. Checked out automatically.` });
            }
        }
    }
  }, [userEmail]);

 useEffect(() => {
    if (!userEmail || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            if (isProcessingRef.current) return;
            const { latitude: lat, longitude: lon, accuracy } = position.coords;
            const timestamp = new Date(position.timestamp).toISOString();
            lastSentPositionRef.current = { lat, lon, timestamp };
            
            // Local Geofence processing
            processNewLocation(lat, lon, accuracy, timestamp); 
            
            // Queue GPS ping instead of instantly fetching
            if (dutyStatusRef.current === 'ON_DUTY') {
                locationBatchQueueRef.current.push({
                    lat: lat,
                    lon: lon,
                    timestamp: timestamp,
                    activity_state: "ON_DUTY"
                });
            }
        }, 
        () => {}, 
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    const batchInterval = setInterval(() => {
        const currentBatch = [...locationBatchQueueRef.current];
        
        if (currentBatch.length > 0 && navigator.onLine) {
            fetch(`${API_BASE_URL}/api/user/bulk-native-webhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: userEmail, 
                    locations: currentBatch 
                })
            })
            .then(res => {
                if (res.ok) {
                    locationBatchQueueRef.current = locationBatchQueueRef.current.slice(currentBatch.length);
                }
            })
            .catch(() => console.log("Bulk sync failed, will retry"));
        }
    }, 30000); // 30 second cycle

    return () => {
        navigator.geolocation.clearWatch(watchId);
        clearInterval(batchInterval);
    };
}, [userEmail, processNewLocation]);

 const handleDayShiftAction = async (action) => {
    const payload = { email: userEmail, action: action, timestamp: new Date().toISOString() };

    if (navigator.onLine) {
        const res = await fetch(`${API_BASE_URL}/api/shift/day-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(() => null);
        
        // Block UI change if the server explicitly rejects it (e.g. duplicate shift)
        if (res && !res.ok && res.status < 500) {
            const errorData = await res.json();
            alert(errorData.detail || "Action rejected by server.");
            return; 
        }
        
        // Push to offline queue if network died or server crashed
        if (!res || res.status >= 500) {
            const q = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]');
            q.push(payload);
            localStorage.setItem('offlineShiftQueue', JSON.stringify(q));
            updateQueueCounts();
        }
    } else {
        const q = JSON.parse(localStorage.getItem('offlineShiftQueue') || '[]');
        q.push(payload);
        localStorage.setItem('offlineShiftQueue', JSON.stringify(q));
        updateQueueCounts();
    }

    // Only update the UI state if we didn't return early from a 400 error
    if (action === 'START' || action === 'RESUME') { 
        setDutyStatus('ON_DUTY'); 
        if (isApp) LizzaTracker.startTracking({ email: userEmail });
        triggerLocalNotification(action === 'START' ? "Shift Started" : "Duty Resumed", "Live GPS tracking is now active.");
    } else { 
        setDutyStatus(action === 'BREAK' ? 'ON_BREAK' : 'OFF_DUTY'); 
        if (isApp) LizzaTracker.stopTracking(); 
        triggerLocalNotification(action === 'BREAK' ? "Break Started" : "Shift Ended", "Location tracking has been paused.");
    }
};

  const updateTaskForm = (taskId, key, val) => {
      setActiveTaskForm(prev => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), [key]: val, id: taskId } }));
  };

  const submitTaskChecklist = (e, targetSite, activeTask) => {
      e.preventDefault();
      
      for (const t of activeTask.tasks) {
          const st = activeTaskForm[t.id];
          if (!st || st.is_done === undefined) return alert(`Please select Done/Not Done for: ${t.description}`);
          if (st.is_done && !st.photo) return alert(`Photo is required for completed task: ${t.description}`);
      }

      localCompletedSitesRef.current.push(Number(targetSite.id));
      setHasSubmittedReport(true);
      setAlertMsg({ type: 'success', text: 'Task Checklist captured! Syncing in background...' });

      Promise.resolve().then(async () => {
          const completionDataArray = [];
          for (const t of activeTask.tasks) {
              const st = activeTaskForm[t.id];
              let compressedPhotoBase64 = null;
              if (st.is_done && st.photo) {
                  const comp = await compressImage(st.photo);
                  compressedPhotoBase64 = await fileToBase64(comp);
              }
              completionDataArray.push({ id: t.id, description: t.description, is_done: st.is_done, remarks: st.remarks || '', photoBase64: compressedPhotoBase64 });
          }
          const q = JSON.parse(localStorage.getItem('offlineTaskQueue') || '[]');
          q.push({ task_id: activeTask.task_id, completion_data: completionDataArray });
          localStorage.setItem('offlineTaskQueue', JSON.stringify(q));
          updateQueueCounts();
          if (navigator.onLine) syncOfflineData();
      });
  };

  const handleGenericSubmit = (e, targetSite) => {
    e.preventDefault();
    if (!checkedIn) return alert("Wait! The system has not confirmed your check-in yet.");
    if (!targetSite || !myLoc) return alert("You must be officially checked into a site to log a visit.");
    
    const validEntries = visitEntries.filter(entry => entry.photo !== null);
    if (validEntries.length === 0) return alert("At least one photo is required.");

    setPurpose(''); 
    setVisitEntries([{ photo: null, details: '' }]); 
    setHasSubmittedReport(true);
    localCompletedSitesRef.current.push(Number(targetSite.id));
    setAlertMsg({ type: 'success', text: 'Report captured! Uploading silently in background...' });

    Promise.resolve().then(async () => {
        const detailsArray = []; 
        const compressedPhotos = [];
        for (let i = 0; i < validEntries.length; i++) { 
            compressedPhotos.push(await compressImage(validEntries[i].photo)); 
            detailsArray.push(validEntries[i].details); 
        }
        const base64Strings = await Promise.all(compressedPhotos.map(p => fileToBase64(p)));
        const q = JSON.parse(localStorage.getItem('offlineVisitQueue') || '[]');
        q.push({ email: userEmail, location_id: targetSite.id, purpose, photo_details: JSON.stringify(detailsArray), lat: myLoc.lat, lon: myLoc.lon, timestamp: new Date().toISOString(), photosBase64: base64Strings });
        localStorage.setItem('offlineVisitQueue', JSON.stringify(q));
        updateQueueCounts();
        if (navigator.onLine) syncOfflineData();
    });
  };

  const addPhotoEntry = () => setVisitEntries(prev => [...prev, { photo: null, details: '' }]);
  const removePhotoEntry = (idx) => setVisitEntries(prev => prev.filter((_, i) => i !== idx));
  const updatePhotoEntry = (idx, field, val) => {
      setVisitEntries(prev => {
          const arr = [...prev];
          arr[idx][field] = val;
          return arr;
      });
  };

  // --- Handle Uniform Request ---
 // --- Handle Uniform Request ---
 // --- Handle Uniform Request ---
// --- Handle Uniform Request ---
  const handleUniformRequestSubmit = async (e) => {
    e.preventDefault();
    
    const finalShirt = uniformReqForm.shirtSize === 'Other' ? uniformReqForm.otherShirt : uniformReqForm.shirtSize;
    const finalPant = uniformReqForm.pantSize === 'Other' ? uniformReqForm.otherPant : uniformReqForm.pantSize;
    const finalShoe = uniformReqForm.shoeSize === 'Other' ? uniformReqForm.otherShoe : uniformReqForm.shoeSize;
    
    if (!uniformReqForm.target_user_id) {
        return alert("Please select an employee.");
    }

    if (!finalShirt && !finalPant && !finalShoe) {
        return alert("Please select a size for at least one item (Shirt, Pant, or Shoe).");
    }
    
    const detailsArray = [];
    if (finalShirt) detailsArray.push(`Shirt: ${finalShirt}`);
    if (finalPant) detailsArray.push(`Pant: ${finalPant}`);
    if (finalShoe) detailsArray.push(`Shoe: ${finalShoe}`);
    const combinedItemDetails = detailsArray.join(', ');
    
    const res = await fetch(`${API_BASE_URL}/api/uniform/request-adhoc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            target_user_id: uniformReqForm.target_user_id,
            requester_email: userEmail,
            item_details: combinedItemDetails,
            fo_email: userEmail
        })
    });
    
    if (res.ok) {
        alert("Uniform request successfully submitted to Admin/HR!");
        setShowUniformModal(false);
        setUniformReqForm({ 
            target_user_id: '', shirtSize: '', pantSize: '', shoeSize: '', otherShirt: '', otherPant: '', otherShoe: '' 
        });
    } else {
        alert("Failed to submit uniform request.");
    }
  };
  const todayStr = new Date().toISOString().split('T')[0];
  const activeTaskObj = (checkedInSite || proximateSite) ? assignedTasks.find(t => Number(t.site_id) === Number((checkedInSite || proximateSite).id) && t.date === todayStr && t.status === 'PENDING') : null;

  const pendingTasks = assignedTasks.filter(t => t.status === 'PENDING');
  const completedTasks = assignedTasks.filter(t => t.status === 'COMPLETED');

  useEffect(() => {
    if (alertMsg) {
        const timer = setTimeout(() => setAlertMsg(null), 8000);
        return () => clearTimeout(timer);
    }
  }, [alertMsg]);

  const rawName = dbUser?.full_name || userEmail;
  const displayName = rawName ? rawName.split('@')[0].split('.')[0].charAt(0).toUpperCase() + rawName.split('@')[0].split('.')[0].slice(1) : "Officer";

  return (
    <>
      <style>
        {`
          .mobile-ui-container { background-color: #f8fafc; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow-x: hidden; padding-bottom: 40px; }
          .glass-card { background: #ffffff; border-radius: 24px; border: none; box-shadow: 0 8px 24px rgba(149, 157, 165, 0.08); overflow: hidden; margin-bottom: 24px; transition: transform 0.2s, box-shadow 0.2s; }
          .glass-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(149, 157, 165, 0.12); }
          .active-scale:active { transform: scale(0.96); transition: transform 0.1s; }
          
          .pulse-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; animation: pulseAnim 2s infinite; }
          .pulse-dot.duty-on { background-color: #10b981; }
          .pulse-dot.duty-off { background-color: #ef4444; animation: none; }
          .pulse-dot.duty-break { background-color: #f59e0b; animation: none; }

          @keyframes pulseAnim {
              0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
              70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
              100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }
          
          .fade-in { animation: fadeInAnim 0.6s ease-in-out forwards; }
          @keyframes fadeInAnim { from { opacity: 0; } to { opacity: 1; } }
          
          .slide-up { animation: slideUpAnim 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
          @keyframes slideUpAnim {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
          }
          
          .custom-pill-tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 10px; border-bottom: none; gap: 8px; }
          .custom-pill-tabs::-webkit-scrollbar { display: none; }
          .custom-pill-tabs .nav-link { border-radius: 20px; color: #64748b; font-weight: 600; padding: 12px 24px; background: #f1f5f9; border: none; white-space: nowrap; transition: all 0.2s ease; }
          .custom-pill-tabs .nav-link.active { background: #fb0606; color: white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
          .custom-input { border-radius: 12px; background-color: #f8fafc; border: 1.5px solid #e2e8f0; padding: 12px 16px; font-size: 14px; transition: all 0.2s; }
          .custom-input:focus { background-color: #fff; border-color: #ec0606; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); outline: none; }
          
          .stat-widget { background: linear-gradient(135deg, #f80202 0%, #ed0c1b 100%); color: white; border-radius: 24px; padding: 24px; box-shadow: 0 8px 20px rgba(59, 130, 246, 0.2); }
          .btn-premium { border-radius: 100px; padding: 14px 28px; font-weight: 600; transition: all 0.2s; }
        `}
      </style>

      <div className="mobile-ui-container pt-4 fade-in">
        <Container fluid="xl" className="px-3 px-md-4">
          
          {/* Dashboard Header */}
          <div className="d-flex justify-content-between align-items-center mb-4 px-2">
            <div>
              <h4 className="fw-bold m-0 text-dark">Welcome, {displayName}</h4>
              <p className="text-muted small mb-0">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="d-flex gap-2">
              <Button variant="light" size="sm" className="rounded-circle shadow-sm p-2 active-scale" onClick={fetchData} disabled={isSyncing}>
                 <RefreshCw size={20} className={isSyncing ? "text-muted" : "text-primary"} />
              </Button>
              <Button variant="danger" className="rounded-pill shadow-sm fw-bold active-scale d-none d-md-flex align-items-center px-4" onClick={() => setShowAddEmp(true)}>
                  <Plus className="me-1" size={18}/> Onboard Staff
              </Button>
              <Button variant="outline-danger" className="rounded-pill shadow-sm fw-bold active-scale d-none d-md-flex align-items-center px-4" onClick={() => setShowUniformModal(true)}>
                  <Shirt className="me-1" size={18}/> Request Uniform
              </Button>
            </div>
          </div>

          <div className="d-md-none mb-4 px-2 d-flex gap-2">
              <Button variant="danger" className="w-100 rounded-pill shadow-sm fw-bold active-scale d-flex align-items-center justify-content-center py-2" onClick={() => setShowAddEmp(true)}>
                  <Plus className="me-2" size={18}/> Onboard
              </Button>
              <Button variant="outline-danger" className="w-100 rounded-pill shadow-sm fw-bold active-scale d-flex align-items-center justify-content-center py-2" onClick={() => setShowUniformModal(true)}>
                  <Shirt className="me-2" size={18}/> Uniforms
              </Button>
          </div>

          {/* Alerts / Offline Notices */}
          {(!isOnline || pendingOfflineActions > 0) && isApp && (
            <Alert variant="warning" className="d-flex justify-content-between align-items-center mb-3 py-3 shadow-sm rounded-pill small slide-up border-0 font-weight-bold" style={{animationDelay: '0.1s'}}>
                <span>
                    {isOnline ? <RefreshCw size={16} className="me-2 text-primary" /> : <WifiOff size={16} className="me-2 text-danger" />}
                    <strong className="me-1">{isOnline ? 'Syncing Data...' : 'Offline Mode'}</strong> {pendingOfflineActions} action(s) waiting.
                </span>
            </Alert>
          )}

          {alertMsg && (
            <Alert variant={alertMsg.type} className="mb-3 shadow-sm rounded-4 small fw-bold slide-up border-0 d-flex justify-content-between align-items-center p-3">
                {alertMsg.text}
                <XCircle size={18} className="opacity-50" onClick={() => setAlertMsg(null)} style={{cursor: 'pointer'}} />
            </Alert>
          )}

          {/* Top Row: Duty Protocol & Stats */}
          <Row className="g-4 mb-4">
            <Col xs={12} lg={8} className="slide-up" style={{animationDelay: '0.1s'}}>
              <Card className="glass-card h-100">
                  <Card.Body className="p-4 d-flex flex-column justify-content-center">
                      <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                        <div>
                          <h5 className="fw-bold mb-1 d-flex align-items-center text-dark">
                            <span className={`pulse-dot me-2 ${dutyStatus === 'ON_DUTY' ? 'duty-on' : dutyStatus === 'ON_BREAK' ? 'duty-break' : 'duty-off'}`}></span>
                            Shift Protocol
                          </h5>
                          <div className="text-muted small">
                              {dutyStatus === 'OFF_DUTY' ? "Start your shift to activate live GPS tracking and tasks." : 
                               dutyStatus === 'ON_BREAK' ? "Shift paused. Location tracking is disabled." : "Location tracking active."}
                          </div>
                        </div>
                        {dutyStatus !== 'OFF_DUTY' && (
                          <div className="d-flex gap-3 bg-light px-3 py-2 rounded-pill">
                              <span className="small"><strong>Duty:</strong> <span className="text-primary">{dutyTimeStr}</span></span>
                              <span className="small"><Activity size={14} className="text-success ms-1 me-1"/> <strong>Travel:</strong> {travelTimeStr}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="d-flex gap-2 mt-auto pt-2">
                          {dutyStatus === 'OFF_DUTY' && <Button variant="primary" className="btn-premium flex-grow-1 shadow-sm active-scale" onClick={() => handleDayShiftAction('START')}>Start Shift</Button>}
                          {dutyStatus === 'ON_DUTY' && <Button variant="warning" className="btn-premium text-dark flex-grow-1 shadow-sm active-scale" onClick={() => handleDayShiftAction('BREAK')}><Coffee size={18} className="me-1"/> Break</Button>}
                          {dutyStatus === 'ON_BREAK' && <Button variant="success" className="btn-premium flex-grow-1 shadow-sm active-scale" onClick={() => handleDayShiftAction('RESUME')}>Resume Duty</Button>}
                          {dutyStatus !== 'OFF_DUTY' && <Button variant="danger" className="btn-premium flex-grow-1 shadow-sm active-scale" onClick={() => handleDayShiftAction('END')}>End Shift</Button>}
                      </div>
                  </Card.Body>
              </Card>
            </Col>

            <Col xs={12} lg={4} className="slide-up" style={{animationDelay: '0.2s'}}>
                <div className="stat-widget h-100 d-flex flex-column justify-content-between">
                    <div className="d-flex align-items-center mb-3 opacity-75">
                        <Users size={20} className="me-2"/>
                        <span className="fw-bold text-uppercase small tracking-wide">Recruitment Impact</span>
                    </div>
                    <div>
                        <h1 className="display-4 fw-bolder mb-0">{onboardedCount}</h1>
                        <p className="mb-0 opacity-75 small">Total staff onboarded to the network</p>
                    </div>
                </div>
            </Col>
          </Row>

          {/* Middle Row: Map & Geofence (Only visible when On Duty) */}
          {dutyStatus !== 'OFF_DUTY' && dutyStatus !== 'ON_BREAK' && (
            <Row className="g-4 mb-4">
              
              <Col xs={12} lg={6} className="slide-up" style={{animationDelay: '0.3s'}}>
                <Card className="glass-card h-100 border-top border-4 border-success">
                  <Card.Body className="p-4 d-flex flex-column">
                    <h5 className="fw-bold mb-3 d-flex align-items-center text-dark">
                        <MapPin className="me-2 text-danger" size={20}/> Perimeter Protocol
                    </h5>
                    
                    {isSyncing ? (
                        <div className="bg-light rounded-4 p-4 my-auto text-center border-0">
                            <Spinner animation="border" variant="primary" className="mb-2"/>
                            <div className="text-muted fw-bold">Syncing Position...</div>
                        </div>
                    ) : checkedIn ? (
                      <div className="bg-success bg-opacity-10 border border-success border-2 rounded-4 p-4 mb-4 text-center shadow-sm">
                          <CheckCircle className="text-success mb-2" size={40}/>
                          <h5 className="text-success fw-bold mb-1">ACTIVE CHECK-IN</h5>
                          <div className="text-dark fs-5 fw-bolder mt-2">{checkedInSite?.name || proximateSite?.name || 'Verifying...'}</div>
                      </div>
                    ) : proximateSite && !hasCompletedSiteToday(proximateSite.id) ? (
                      <div className="bg-info bg-opacity-10 border border-info border-2 rounded-4 p-4 mb-4 text-center shadow-sm">
                          <h6 className="text-info fw-bold mb-1">PROXIMITY DETECTED</h6>
                          <div className="text-dark fs-6 fw-bold mt-2">{proximateSite.name}</div>
                          <div className="text-muted small mt-1">You are inside the perimeter.</div>
                      </div>
                    ) : proximateSite && hasCompletedSiteToday(proximateSite.id) ? (
                      <Alert variant="success" className="text-center rounded-4 border-0 shadow-sm p-4 mb-4">
                          <CheckCircle size={28} className="mb-2 text-success"/><br/>
                          <strong className="fs-5 text-dark">Site Completed</strong><br/>
                          <span className="text-muted small">Operations concluded here for today.</span>
                      </Alert>
                    ) : (
                      <div className="bg-light rounded-4 p-4 mb-4 text-center my-auto border-0">
                          <MapIcon size={30} className="text-muted opacity-50 mb-2"/>
                          <div className="text-muted fw-bold">Searching for perimeter...</div>
                          <small className="text-secondary">Drive to an assigned site.</small>
                      </div>
                    )}

                    <div className="d-flex flex-column gap-2 mt-auto">
                      {!checkedIn && proximateSite && !hasCompletedSiteToday(proximateSite.id) && (
                        <Button variant="success" className="w-100 btn-premium shadow-sm active-scale" onClick={() => handleAttendance('CHECK_IN', proximateSite, myLoc)}>
                            <LogIn className="me-2" size={20}/> Check In Here
                        </Button>
                      )}
                      
                      {checkedIn && hasSubmittedReport && (
                        <Button variant="danger" className="w-100 btn-premium shadow-sm active-scale" onClick={() => handleAttendance('CHECK_OUT', checkedInSite || proximateSite, myLoc)}>
                            <LogOut className="me-2" size={20}/> Complete & Check Out
                        </Button>
                      )}
                      
                      {checkedIn && !hasSubmittedReport && (
                        <Alert variant="warning" className="text-center small fw-bold mb-0 border-0 rounded-pill bg-warning bg-opacity-25 text-dark">
                            <AlertTriangle size={16} className="me-1 mb-1"/> Submit report to unlock Check-Out
                        </Alert>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              </Col>

              <Col xs={12} lg={6} className="slide-up" style={{animationDelay: '0.4s'}}>
                <Card className="glass-card h-100 p-2">
                    <Card.Body className="p-0 position-relative rounded-4 overflow-hidden h-100">
                        <div className="position-absolute top-0 start-0 w-100 p-3 z-1" style={{pointerEvents: 'none'}}>
                            <div className="bg-white px-3 py-2 rounded-pill shadow-sm d-inline-flex align-items-center fw-bold small text-primary">
                                <span className="pulse-dot duty-on me-2" style={{width:8, height:8}}></span> Live GPS Active
                            </div>
                        </div>
                        <OfficerMap locations={locations} myLoc={myLoc} />
                    </Card.Body>
                </Card>
              </Col>

            </Row>
          )}

          {/* Checklist & Reporting Section (Only visible when Checked In) */}
          {dutyStatus !== 'OFF_DUTY' && dutyStatus !== 'ON_BREAK' && checkedIn && !hasSubmittedReport && (
            <Row className="mb-4 slide-up" style={{animationDelay: '0.5s'}}>
                <Col xs={12}>
                    <Card className="glass-card">
                        <Card.Body className="p-4">
                            {activeTaskObj ? (
                                <Form onSubmit={(e) => submitTaskChecklist(e, checkedInSite || proximateSite, activeTaskObj)}>
                                    <div className="d-flex align-items-center mb-4 bg-primary bg-opacity-10 p-3 rounded-4">
                                        <CheckSquare className="me-3 text-primary" size={24}/>
                                        <div>
                                            <h6 className="fw-bold mb-0 text-primary">Required Task Checklist</h6>
                                            <small className="text-muted">Complete all assigned tasks for {checkedInSite?.name}</small>
                                        </div>
                                    </div>
                                    
                                    <Row className="g-3">
                                        {activeTaskObj.tasks.map((t, idx) => (
                                            <Col xs={12} lg={6} key={t.id}>
                                                <div className="p-4 bg-light border-0 rounded-4 shadow-sm position-relative h-100 d-flex flex-column">
                                                    <Badge bg="dark" className="position-absolute top-0 end-0 m-3 rounded-circle px-2 py-1">{idx+1}</Badge>
                                                    <div className="fw-bold text-dark mb-3 pe-4">{t.description}</div>
                                                    
                                                    <div className="d-flex gap-3 mb-3 bg-white p-2 rounded-pill shadow-sm border justify-content-center mt-auto">
                                                        <Form.Check type="radio" label={<span className="text-success fw-bold small">Done</span>} name={`status_${t.id}`} onChange={() => updateTaskForm(t.id, 'is_done', true)} required/>
                                                        <Form.Check type="radio" label={<span className="text-danger fw-bold small">Not Done</span>} name={`status_${t.id}`} onChange={() => updateTaskForm(t.id, 'is_done', false)} required/>
                                                    </div>

                                                    {activeTaskForm[t.id]?.is_done && (
                                                        <Form.Group className="mb-3 bg-white p-3 rounded-4 border shadow-sm">
                                                            <Form.Label className="small fw-bold mb-2 text-primary d-flex align-items-center"><Camera size={14} className="me-2"/> Evidence Photo *</Form.Label>
                                                            <Form.Control type="file" accept="image/*" capture="environment" className="border-0 bg-light rounded custom-input" onChange={e => updateTaskForm(t.id, 'photo', e.target.files[0])} required />
                                                        </Form.Group>
                                                    )}
                                                    <Form.Control as="textarea" rows={2} className="custom-input border-0 shadow-sm" placeholder="Optional remarks..." onChange={e => updateTaskForm(t.id, 'remarks', e.target.value)} />
                                                </div>
                                            </Col>
                                        ))}
                                    </Row>
                                    <Button type="submit" variant="primary" className="w-100 btn-premium shadow-sm mt-4 active-scale">
                                        Submit Checklist & Conclude Site Visit
                                    </Button>
                                </Form>
                            ) : (
                                <Form onSubmit={(e) => handleGenericSubmit(e, checkedInSite || proximateSite)}>
                                  <div className="d-flex align-items-center mb-4 bg-dark bg-opacity-10 p-3 rounded-4">
                                      <FileText className="me-3 text-dark" size={24}/>
                                      <div>
                                          <h6 className="fw-bold mb-0 text-dark">Standard Site Report</h6>
                                          <small className="text-muted">Log details for {checkedInSite?.name}</small>
                                      </div>
                                  </div>

                                  <Row>
                                      <Col xs={12} lg={4}>
                                          <Form.Select className="mb-4 py-3 rounded-4 bg-light border-0 shadow-sm fw-bold text-dark" value={purpose} onChange={e => setPurpose(e.target.value)} required>
                                              <option value="">Select Visit Purpose...</option><option value="Routine Inspection">Routine Inspection</option><option value="Client Meeting">Client Meeting</option><option value="Issue Resolution">Issue Resolution</option><option value="Training">Training</option><option value="Bill Submission">Bill Submission</option>
                                          </Form.Select>
                                      </Col>
                                      <Col xs={12} lg={8}>
                                          <div className="bg-light p-3 rounded-4 mb-4">
                                              {visitEntries.map((entry, idx) => (
                                                  <div key={idx} className="mb-3 p-4 bg-white border-0 rounded-4 shadow-sm">
                                                      <div className="fw-bold text-primary small mb-3 d-flex justify-content-between align-items-center">
                                                          <span><Camera size={16} className="me-2"/> Capture Evidence {idx + 1}</span>
                                                          {visitEntries.length > 1 && (
                                                              <Badge bg="danger" className="rounded-pill p-2" style={{cursor: 'pointer'}} onClick={() => removePhotoEntry(idx)}>Remove</Badge>
                                                          )}
                                                      </div>
                                                      <Form.Control type="file" accept="image/*" capture="environment" className="mb-3 custom-input border-0 bg-light" onChange={(e) => updatePhotoEntry(idx, 'photo', e.target.files[0])} required />
                                                      <Form.Control as="textarea" rows={3} className="custom-input border-0 bg-light" placeholder="Detailed observations..." value={entry.details} onChange={(e) => updatePhotoEntry(idx, 'details', e.target.value)} required />
                                                  </div>
                                              ))}
                                              <Button variant="outline-primary" className="w-100 fw-bold border-2 border-dashed rounded-pill mt-2 active-scale py-3 bg-white" onClick={addPhotoEntry}>
                                                  + Add Another Photo Evidence
                                              </Button>
                                          </div>
                                      </Col>
                                  </Row>
                                  <Button type="submit" variant="dark" className="w-100 btn-premium shadow-sm active-scale">
                                      Upload Final Report
                                  </Button>
                                </Form>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
          )}

          {/* Bottom Tabs: Pending Tasks & Directory */}
          <div className="slide-up" style={{animationDelay: '0.6s'}}>
              <Tabs defaultActiveKey="tasks" className="custom-pill-tabs mb-4 border-0 justify-content-center">
                  
                  <Tab eventKey="tasks" title="My Tasks">
                      <Card className="glass-card shadow-sm border-0 mt-3">
                          <Card.Body className="p-4">
                              <h6 className="fw-bold mb-3 text-dark fs-5">Pending Execution ({pendingTasks.length})</h6>
                              {pendingTasks.length === 0 ? <div className="text-center text-muted p-5 bg-light rounded-4 border-0">🎉 All clear! No tasks waiting.</div> : (
                                  <Row className="g-3">
                                      {pendingTasks.map((t, i) => (
                                          <Col xs={12} lg={6} key={i}>
                                              <div className="bg-light p-4 rounded-4 shadow-sm border-start border-5 border-danger d-flex justify-content-between align-items-center h-100">
                                                  <div>
                                                      <div className="fw-bold text-dark fs-5 mb-1">{t.site_name}</div>
                                                      <div className="text-muted small d-flex align-items-center"><CheckSquare size={14} className="me-1"/>{t.tasks?.length || 0} items to complete</div>
                                                  </div>
                                                  <ChevronRight size={20} className="text-muted"/>
                                              </div>
                                          </Col>
                                      ))}
                                  </Row>
                              )}

                              <h6 className="fw-bold mb-3 mt-5 text-success fs-5">Cleared Today ({completedTasks.length})</h6>
                              <Row className="g-3">
                                  {completedTasks.length === 0 ? <Col xs={12}><div className="text-center text-muted p-4 bg-light rounded-4">None yet.</div></Col> : (
                                      completedTasks.map((t, i) => (
                                          <Col xs={12} lg={6} key={i}>
                                              <div className="bg-light p-4 rounded-4 shadow-sm border-start border-5 border-success d-flex justify-content-between align-items-center opacity-75 h-100">
                                                  <div>
                                                      <div className="fw-bold text-dark text-decoration-line-through fs-5 mb-1">{t.site_name}</div>
                                                      <div className="text-muted small">{t.date}</div>
                                                  </div>
                                                  <CheckCircle size={28} className="text-success"/>
                                              </div>
                                          </Col>
                                      ))
                                  )}
                              </Row>
                          </Card.Body>
                      </Card>
                  </Tab>
                  
                  <Tab eventKey="directory" title="Sites Directory">
                      <Card className="glass-card shadow-sm mt-3">
                          <Card.Body className="p-0">
                            <Table hover responsive className="mb-0 align-middle border-0">
                              <tbody>
                                {nearbySites.map(site => (
                                    <tr key={site.id}>
                                      <td className="ps-4 border-0 border-bottom py-4">
                                        <div className="fw-bold text-dark d-flex align-items-center fs-5">
                                            {site.name} 
                                            {site.hasTaskToday && <Badge bg="danger" className="ms-3 rounded-pill fs-6 px-3"><CheckSquare size={12} className="me-1"/>Task</Badge>}
                                        </div>
                                        <div className="text-muted mt-2 fw-bold small">
                                            {site.distance !== null && site.distance !== undefined 
                                                ? (site.distance < 1000 ? `${Math.round(site.distance)}m away` : `${(site.distance / 1000).toFixed(1)}km away`) 
                                                : 'Calculating distance...'}
                                        </div>
                                      </td>
                                      <td className="pe-4 text-end border-0 border-bottom">
                                        <Button variant="light" className="rounded-circle p-2 shadow-sm"><Navigation size={18} className="text-primary"/></Button>
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

          {/* --- NEW MODALS --- */}
          <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered backdrop="static">
              <Modal.Header closeButton className="border-0"><Modal.Title className="fw-bold fs-5 text-primary ms-2 mt-2">Onboard Direct Staff</Modal.Title></Modal.Header>
              <Modal.Body className="p-0">
                  <EmployeeOnboardForm 
                      locations={locations} 
                      onCancel={() => setShowAddEmp(false)} 
                      onSuccess={() => { setShowAddEmp(false); fetchData(); }} 
                  />
              </Modal.Body>
          </Modal>
<Modal show={showUniformModal} onHide={() => setShowUniformModal(false)} centered backdrop="static">
              <Modal.Header closeButton className="border-0 bg-danger text-white">
                  <Modal.Title className="fw-bold fs-5 d-flex align-items-center">
                      <Shirt size={20} className="me-2"/> Request Uniform Kit
                  </Modal.Title>
              </Modal.Header>
              <Modal.Body className="bg-light p-4 rounded-bottom">
                  <Form onSubmit={handleUniformRequestSubmit}>
                      <Form.Group className="mb-4">
                          <Form.Label className="small fw-bold text-danger ps-1">Select Employee (Your Recruits Only)</Form.Label>
                          <Form.Select className="custom-input border-danger border-opacity-50 bg-danger bg-opacity-10 shadow-sm fw-bold text-dark" value={uniformReqForm.target_user_id} onChange={(e) => setUniformReqForm({...uniformReqForm, target_user_id: e.target.value})} required>
                              <option value="">Choose your staff member...</option>
                              {myRecruits.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.blockchain_id || 'Pending ID'})</option>)}
                          </Form.Select>
                          {myRecruits.length === 0 && <small className="text-muted mt-1 d-block">You have not onboarded any staff yet.</small>}
                      </Form.Group>

                      <Row className="g-3 mb-4">
                          <Col xs={12} md={4}>
                              <Form.Group>
                                  <Form.Label className="small fw-bold text-muted ps-1">Shirt Size</Form.Label>
                                  <Form.Select className="custom-input border-0 shadow-sm" value={uniformReqForm.shirtSize} onChange={(e) => setUniformReqForm({...uniformReqForm, shirtSize: e.target.value})}>
                                      <option value="">Select...</option>
                                      {['32', '34', '36', '38', '40', '42', '44', '46', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
                                  </Form.Select>
                                  {uniformReqForm.shirtSize === 'Other' && (
                                      <Form.Control className="custom-input border-danger border-2 shadow-sm mt-2 fade-in" placeholder="Specify size" value={uniformReqForm.otherShirt} onChange={(e) => setUniformReqForm({...uniformReqForm, otherShirt: e.target.value})} />
                                  )}
                              </Form.Group>
                          </Col>
                          
                          <Col xs={12} md={4}>
                              <Form.Group>
                                  <Form.Label className="small fw-bold text-muted ps-1">Pant Size</Form.Label>
                                  <Form.Select className="custom-input border-0 shadow-sm" value={uniformReqForm.pantSize} onChange={(e) => setUniformReqForm({...uniformReqForm, pantSize: e.target.value})}>
                                      <option value="">Select...</option>
                                      {['28', '30', '32', '34', '36', '38', '40', '42', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
                                  </Form.Select>
                                  {uniformReqForm.pantSize === 'Other' && (
                                      <Form.Control className="custom-input border-danger border-2 shadow-sm mt-2 fade-in" placeholder="Specify size" value={uniformReqForm.otherPant} onChange={(e) => setUniformReqForm({...uniformReqForm, otherPant: e.target.value})} />
                                  )}
                              </Form.Group>
                          </Col>
                          
                          <Col xs={12} md={4}>
                              <Form.Group>
                                  <Form.Label className="small fw-bold text-muted ps-1">Shoe Size (UK)</Form.Label>
                                  <Form.Select className="custom-input border-0 shadow-sm" value={uniformReqForm.shoeSize} onChange={(e) => setUniformReqForm({...uniformReqForm, shoeSize: e.target.value})}>
                                      <option value="">Select...</option>
                                      {['6', '7', '8', '9', '10', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
                                  </Form.Select>
                                  {uniformReqForm.shoeSize === 'Other' && (
                                      <Form.Control className="custom-input border-danger border-2 shadow-sm mt-2 fade-in" placeholder="Specify size" value={uniformReqForm.otherShoe} onChange={(e) => setUniformReqForm({...uniformReqForm, otherShoe: e.target.value})} />
                                  )}
                              </Form.Group>
                          </Col>
                      </Row>

                      <Button type="submit" variant="danger" className="w-100 btn-premium shadow-sm active-scale fw-bold" disabled={myRecruits.length === 0}>
                          Submit Request to Admin
                      </Button>
                  </Form>
              </Modal.Body>
          </Modal>

        </Container>
      </div>
    </>
  );
};

export default FieldOfficerDashboard;