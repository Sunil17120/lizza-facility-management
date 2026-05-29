import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Card, Row, Col, Badge, Form, Button, Alert, Spinner, Table } from 'react-bootstrap';
import { MapPin, Camera, Navigation, UserPlus, CheckCircle, FileText, Map as MapIcon, LogIn, LogOut } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm'; 

import { registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

const compressImage = async (file, maxWidth = 1000, quality = 0.7) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }));
        }, 'image/jpeg', quality);
      };
    };
  });
};

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
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
  const [checkinTime, setCheckinTime] = useState(null);
  const [checkoutTime, setCheckoutTime] = useState(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photo, setPhoto] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const fileInputRef = useRef(null);
  const userEmail = localStorage.getItem('userEmail');

  // --- 1. FCM PUSH NOTIFICATION REGISTRATION ---
  const registerFCM = async (email) => {
      try {
          console.log("Checking push permissions...");
          let status = await PushNotifications.checkPermissions();
          if (status.receive !== 'granted') {
              status = await PushNotifications.requestPermissions();
          }

          if (status.receive === 'granted') {
              await PushNotifications.register();
              PushNotifications.addListener('registration', async (token) => {
                  console.log("FCM Token Generated: ", token.value);
                  await fetch('/api/user/update-fcm-token', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: email, fcm_token: token.value })
                  });
              });
          } else {
              console.error("User denied notification permissions.");
          }
      } catch (e) {
          console.error("FCM Registration Error:", e);
      }
  };

  useEffect(() => {
      if (userEmail) {
          registerFCM(userEmail);
      }
  }, [userEmail]);

  // --- 2. DATA FETCHING ---
  const fetchData = useCallback(async () => {
    const [locRes, histRes, profileRes] = await Promise.all([
      fetch(`/api/admin/locations`),
      fetch(`/api/field-officer/my-visits?email=${userEmail}`),
      fetch(`/api/user/profile?email=${userEmail}`)
    ]);
    
    if (locRes.ok) {
      const locData = await locRes.json();
      setLocations(locData);
      localStorage.setItem('cached_sites', JSON.stringify(locData));
    }
    
    if (histRes.ok) setVisitHistory(await histRes.json());
    
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      setCheckedIn(Boolean(profileData.checked_in));
    }
  }, [userEmail]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- 3. OFFLINE SYNC HANDLER ---
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const offlineLocations = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
      if (offlineLocations.length > 0) {
        const res = await fetch('/api/user/sync-offline-locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              email: userEmail, 
              locations: offlineLocations || [] 
          })
        });
        if (res.ok) {
          localStorage.removeItem('offlineLocations');
        }
      }

      const pendingAutoCheckout = localStorage.getItem(`pendingAutoCheckout:${userEmail}`);
      if (pendingAutoCheckout && checkedIn) {
        const checkoutData = JSON.parse(pendingAutoCheckout);
        const res = await fetch('/api/user/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checkoutData)
        });
        if (res.ok) {
          localStorage.removeItem(`pendingAutoCheckout:${userEmail}`);
          setCheckedIn(false);
          setCheckoutTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          setAlertMsg({ type: 'warning', text: '⏱️ Offline checkout synced successfully.' });
          fetchData();
        }
      }
    };
    
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userEmail, checkedIn, fetchData]);

  // --- 4. LOCATION PROCESSING ---
  const processNewLocation = useCallback((lat, lon) => {
    setMyLoc({ lat, lon });

    const cachedSitesStr = localStorage.getItem('cached_sites');
    const sitesToEval = cachedSitesStr ? JSON.parse(cachedSitesStr) : locations;

    let insideSite = null;
    const sitesWithDistance = sitesToEval.map(site => {
        const dist = getDistance(lat, lon, site.lat, site.lon);
        if (dist <= (site.radius || 200)) {
            insideSite = site;
        }
        return { ...site, distance: dist };
    });

    sitesWithDistance.sort((a, b) => a.distance - b.distance);
    setNearbySites(sitesWithDistance);
    setActiveSite(insideSite);
    
    if (userEmail) {
      const locData = { lat, lon, timestamp: new Date().toISOString() };
      
      if (!isOnline) {
        const offlineLocations = JSON.parse(localStorage.getItem('offlineLocations') || '[]');
        offlineLocations.push(locData);
        localStorage.setItem('offlineLocations', JSON.stringify(offlineLocations));
      } else {
        fetch(`/api/user/update-location?email=${userEmail}&lat=${lat}&lon=${lon}`, { method: 'POST' });
      }
    }
  }, [locations, userEmail, isOnline]);

  useEffect(() => {
    if (!userEmail) return;

    const startTracking = async () => {
      await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: "Lizza is tracking your site visits for attendance.",
          backgroundTitle: "Field Operations Active",
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
          interval: 300000, 
          allowBackgroundLocationUpdates: true,
          autoSync: true,
          stopOnTerminate: false, 
          startOnBoot: true 
        },
        (location, error) => {
          if (error) return;
          if (location) {
            processNewLocation(location.latitude, location.longitude);
          }
        }
      );
    };

    startTracking();

    return () => {
      BackgroundGeolocation.removeWatcher();
    };
  }, [userEmail, processNewLocation]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      const pingLocation = () => {
        navigator.geolocation.getCurrentPosition(
          (position) => processNewLocation(position.coords.latitude, position.coords.longitude),
          () => {},
          { enableHighAccuracy: true }
        );
      };
      pingLocation();
      const intervalId = setInterval(pingLocation, 300000);
      return () => clearInterval(intervalId);
    }
  }, [processNewLocation]);

  // --- 5. ACTIONS (CHECK-IN / CHECK-OUT / LOG VISIT) ---
  const handleCheckIn = async () => {
    if (!activeSite || !myLoc) return alert("Geofence error: You must be inside the site boundary.");
    setIsSubmitting(true);
    
    const formattedLocalTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const res = await fetch('/api/user/checkin', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ email: userEmail, lat: myLoc.lat, lon: myLoc.lon }) 
    });
    const data = await res.json();
    
    if (res.ok) {
      setAlertMsg({ type: 'success', text: `Successfully Checked In at ${formattedLocalTime}` });
      setCheckedIn(true);
      setCheckinTime(formattedLocalTime);
      setReportSubmitted(false);
      setCheckoutTime(null);
    } else {
      setAlertMsg({ type: 'danger', text: data.detail || 'Failed to check in.' });
    }
    
    setIsSubmitting(false);
  };

  const handleCheckOut = async () => {
    if (!myLoc) return alert("Waiting for GPS signal...");
    setIsSubmitting(true);
    
    const formattedLocalTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const res = await fetch('/api/user/checkout', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ email: userEmail, lat: myLoc.lat, lon: myLoc.lon }) 
    });
    const data = await res.json();
    
    if (res.ok) {
      setAlertMsg({ type: 'success', text: `Successfully Checked Out at ${formattedLocalTime}` });
      setCheckedIn(false);
      setCheckoutTime(formattedLocalTime);
      setReportSubmitted(false);
      fetchData();
    } else {
      setAlertMsg({ type: 'danger', text: data.detail || 'Failed to check out.' });
    }
    
    setIsSubmitting(false);
  };

  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    if (!photo) return alert("You must capture a geotagged photo to log the visit.");
    if (!activeSite || !myLoc) return alert("Geofence error: You must be inside the site boundary.");

    setIsSubmitting(true);
    
    const compressedPhoto = await compressImage(photo);
    const exactTimestamp = new Date().toISOString();

    const formData = new FormData();
    formData.append('email', userEmail);
    formData.append('location_id', activeSite.id);
    formData.append('purpose', purpose);
    formData.append('remarks', remarks);
    formData.append('lat', myLoc.lat);
    formData.append('lon', myLoc.lon);
    formData.append('timestamp', exactTimestamp);
    formData.append('photo', compressedPhoto);

    const res = await fetch('/api/field-officer/log-visit', { method: 'POST', body: formData });
    const data = await res.json();
    
    if (res.ok) {
      setAlertMsg({ type: 'success', text: 'Visit logged successfully!' });
      setPurpose(''); setRemarks(''); setPhoto(null);
      setReportSubmitted(true);
      if(fileInputRef.current) fileInputRef.current.value = "";
      fetchData();
    } else {
      setAlertMsg({ type: 'danger', text: data.detail || 'Failed to log visit.' });
    }
    
    setIsSubmitting(false);
  };

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><Navigation className="text-primary me-2" />Field Operations</h2>
        <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus className="me-2" size={18}/>Onboard Staff</Button>
      </div>

      <Row className="g-4 mb-4">
        {/* MAP SECTION */}
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

        {/* STATUS & ACTIONS SECTION */}
        <Col lg={4}>
          <div className="d-flex flex-column gap-3 h-100">
            <Card className="border-0 shadow-sm">
              <Card.Body>
                <h5 className="fw-bold mb-3 d-flex align-items-center">
                  <MapPin className="me-2 text-danger"/> Current Status
                </h5>
                {alertMsg && (
                  <Alert variant={alertMsg.type} className="mb-3 small d-flex align-items-center">
                    {alertMsg.text}
                  </Alert>
                )}
                
                {activeSite ? (
                  <Alert variant="success" className="d-flex align-items-center fw-bold mb-3">
                    <CheckCircle className="me-2"/> At Site: {activeSite.name}
                  </Alert>
                ) : (
                  <Alert variant="warning" className="mb-3">Searching for nearby sites... Drive to a geofence to check in.</Alert>
                )}

                <div className="d-flex gap-2 mb-3">
                  {!checkedIn && activeSite && (
                    <Button variant="success" className="w-100 fw-bold d-flex align-items-center justify-content-center" disabled={isSubmitting} onClick={handleCheckIn}>
                      <LogIn className="me-2" size={16}/> Manual Check In
                    </Button>
                  )}
                  
                  {checkedIn && (
                    <Button variant="danger" className="w-100 fw-bold d-flex align-items-center justify-content-center" disabled={isSubmitting} onClick={handleCheckOut}>
                      <LogOut className="me-2" size={16}/> Manual Check Out
                    </Button>
                  )}
                </div>

                <div className="small text-muted mb-2">
                  {checkedIn ? `Checked in at: ${checkinTime || 'Pending...'}` : 'Not checked in yet.'}
                  {checkoutTime ? ` | Last checkout at: ${checkoutTime}` : ''}
                </div>

                {activeSite && checkedIn && !reportSubmitted && (
                  <Form onSubmit={handleVisitSubmit} className="mt-2 border-top pt-3">
                    <h6 className="fw-bold mb-3"><FileText className="me-2" size={18}/>Log Visit Report</h6>
                    
                    <Form.Group className="mb-2">
                      <Form.Select size="sm" value={purpose} onChange={e => setPurpose(e.target.value)} required>
                        <option value="">Select Purpose...</option>
                        <option value="Site visit">Site visit</option>
                        <option value="Training">Training</option>
                        <option value="Client Meeting">Client Meeting</option>
                        <option value="Attendance">Attendance</option>
                        <option value="Bill Submission">Bill Submission</option>
                      </Form.Select>
                    </Form.Group>

                    <Form.Group className="mb-2">
                      <Form.Control size="sm" as="textarea" rows={2} placeholder="Visit remarks/findings..." value={remarks} onChange={e => setRemarks(e.target.value)} />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold"><Camera size={14} className="me-1"/> Live Photo (Required)</Form.Label>
                      <Form.Control 
                          type="file" 
                          size="sm" 
                          accept="image/*" 
                          capture="environment" 
                          ref={fileInputRef}
                          onChange={e => setPhoto(e.target.files[0])} 
                          required 
                      />
                      <Form.Text className="text-muted" style={{fontSize: '0.7rem'}}>
                          *Photo will be optimized and geotagged.
                      </Form.Text>
                    </Form.Group>

                    <Button type="submit" variant="primary" className="w-100 fw-bold" disabled={isSubmitting}>
                      {isSubmitting ? <Spinner size="sm" /> : "SUBMIT REPORT"}
                    </Button>
                  </Form>
                )}
                
                {checkedIn && reportSubmitted && (
                  <Alert variant="info" className="mt-3 mb-0 small">
                    Report uploaded successfully. Don't forget to Check Out when leaving!
                  </Alert>
                )}
              </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm flex-grow-1 d-flex flex-column">
              <Card.Header className="bg-white py-3 border-bottom-0">
                <h6 className="fw-bold m-0 d-flex align-items-center">
                  <MapIcon className="me-2 text-primary" size={18} /> 
                  Nearby Sites Directory
                </h6>
              </Card.Header>
              <Card.Body className="p-0 overflow-auto" style={{ maxHeight: '250px' }}>
                <Table hover responsive className="mb-0 align-middle">
                  <tbody>
                    {nearbySites.length === 0 ? (
                      <tr><td className="text-center py-4 text-muted small">No sites available or waiting for GPS...</td></tr>
                    ) : (
                      nearbySites.map(site => (
                        <tr key={site.id}>
                          <td className="ps-3 border-0 border-bottom">
                            <div className="fw-bold">{site.name}</div>
                            <div className="text-muted small">
                              {site.distance < 1000 
                                ? `${Math.round(site.distance)} m away` 
                                : `${(site.distance / 1000).toFixed(1)} km away`}
                            </div>
                          </td>
                          <td className="text-end pe-3 border-0 border-bottom">
                            <Button 
                              variant="outline-primary" 
                              size="sm" 
                              className="rounded-pill px-3 fw-bold"
                              style={{fontSize: '0.8rem'}}
                              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=$${site.lat},${site.lon}`, '_blank')}
                            >
                              Directions
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </div>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm mt-4">
        <Card.Header className="bg-white py-3"><h6 className="fw-bold m-0">My Recent Visits</h6></Card.Header>
        <Table responsive hover className="align-middle mb-0 small">
          <thead className="table-light">
            <tr><th>Date & Time</th><th>Site</th><th>Purpose</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {visitHistory.length === 0 ? (
                <tr><td colSpan="4" className="text-center py-4 text-muted">No visits logged yet.</td></tr>
            ) : (
                visitHistory.map((v, i) => (
                    <tr key={i}>
                        <td className="fw-bold">{v.visit_time}</td>
                        <td>{v.site_name}</td>
                        <td><Badge bg="info">{v.purpose}</Badge></td>
                        <td className="text-truncate" style={{maxWidth: '200px'}}>{v.remarks || '-'}</td>
                    </tr>
                ))
            )}
          </tbody>
        </Table>
      </Card>

      {showAddEmp && (
          <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50" style={{zIndex: 1050, overflowY: 'auto'}}>
              <Container className="py-5">
                  <Card className="border-0 shadow">
                      <Card.Header className="d-flex justify-content-between align-items-center bg-light">
                          <h5 className="fw-bold m-0">Onboard Staff</h5>
                          <Button variant="close" onClick={() => setShowAddEmp(false)}></Button>
                      </Card.Header>
                      <Card.Body>
                          <EmployeeOnboardForm locations={locations} onCancel={() => setShowAddEmp(false)} onSuccess={() => setShowAddEmp(false)} />
                      </Card.Body>
                  </Card>
              </Container>
          </div>
      )}
    </Container>
  );
};

export default FieldOfficerDashboard;