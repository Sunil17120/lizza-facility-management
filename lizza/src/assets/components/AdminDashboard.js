import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Table, Button, Badge, Alert, Tabs, Tab, Spinner } from 'react-bootstrap';
import { Users, Map as MapIcon, Navigation, FileText, Printer, Trash2, ShieldAlert } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm'; // Ensure this file exists in the same directory

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveTracking, setLiveTracking] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const adminEmail = localStorage.getItem('userEmail');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [empRes, locRes, trackRes, visitRes] = await Promise.all([
        fetch(`/api/admin/employees?admin_email=${adminEmail}`),
        fetch(`/api/admin/locations`),
        fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`),
        // Fetching current month visits as default
        fetch(`/api/admin/reports/monthly-field-visits?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`)
      ]);

      if (empRes.ok) setEmployees(await empRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (trackRes.ok) setLiveTracking(await trackRes.json());
      if (visitRes.ok) setVisits(await visitRes.json());
    } catch (error) {
      console.error("Error fetching admin data:", error);
      setAlertMsg({ type: 'danger', text: 'Failed to load dashboard data. Check server connection.' });
    } finally {
      setLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => {
    fetchData();
    // Refresh live tracking every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDeleteEmployee = async (userId, userType) => {
    if (userType === 'admin') {
      return alert("Security Protocol: You cannot delete the Super Admin account.");
    }
    if (!window.confirm("Are you sure you want to permanently delete this employee and all their records?")) return;

    try {
      const res = await fetch(`/api/admin/delete-employee/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setAlertMsg({ type: 'success', text: 'Employee deleted successfully.' });
        fetchData();
      } else {
        const data = await res.json();
        setAlertMsg({ type: 'danger', text: data.detail || 'Failed to delete employee.' });
      }
    } catch (err) {
      setAlertMsg({ type: 'danger', text: 'Server error during deletion.' });
    }
  };

  // --- THE SECURE DOSSIER PRINT FUNCTION ---
  const handlePrintDossier = async (userId) => {
    try {
      // Fetch the completely unencrypted data from the secure route
      const response = await fetch(`/api/admin/employee-dossier/${userId}?admin_email=${adminEmail}`);
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.detail || "Failed to load dossier data");
        return;
      }

      const emp = result.data;

      // Build the HTML for the print window using the unencrypted (_raw) fields
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Employee Dossier - ${emp.full_name}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
              .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
              .section { margin-bottom: 20px; }
              .section-title { background: #f0f0f0; padding: 8px; font-weight: bold; border-left: 4px solid #0d6efd; margin-bottom: 10px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              td { padding: 8px; border: 1px solid #ddd; }
              .label { font-weight: bold; width: 30%; background: #f9f9f9; }
              .photo-container { text-align: center; margin-bottom: 20px; }
              img.profile-pic { width: 150px; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid #ccc; }
              .confidential-tag { color: red; font-weight: bold; border: 1px solid red; padding: 2px 5px; display: inline-block; margin-bottom: 10px; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>LIZZA FACILITY MANAGEMENT</h2>
              <h4>OFFICIAL EMPLOYEE DOSSIER</h4>
              <div class="confidential-tag">HIGHLY CONFIDENTIAL - ADMIN EYES ONLY</div>
            </div>
            
            <div class="photo-container">
              ${emp.profile_photo_path ? `<img src="${emp.profile_photo_path}" class="profile-pic" />` : '<div class="profile-pic" style="line-height:150px;background:#eee;margin:0 auto;">No Photo</div>'}
              <h3>${emp.full_name}</h3>
              <p>ID: ${emp.blockchain_id || 'Pending Validation'}</p>
            </div>

            <div class="section">
              <div class="section-title">Personal & Contact Information</div>
              <table>
                <tr><td class="label">Full Name</td><td>${emp.full_name}</td><td class="label">DOB</td><td>${emp.dob || 'N/A'}</td></tr>
                <tr><td class="label">Primary Phone</td><td>${emp.phone_number || 'N/A'}</td><td class="label">Blood Group</td><td>${emp.blood_group || 'N/A'}</td></tr>
                <tr><td class="label">Official Email</td><td>${emp.email}</td><td class="label">Personal Email</td><td>${emp.personal_email || 'N/A'}</td></tr>
                <tr><td class="label">Father's Name</td><td>${emp.father_name || 'N/A'}</td><td class="label">Mother's Name</td><td>${emp.mother_name || 'N/A'}</td></tr>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Confidential Identity Details (DECRYPTED)</div>
              <table>
                <tr><td class="label">Aadhaar Number</td><td style="color:red; font-weight:bold;">${emp.aadhar_raw !== 'N/A' ? emp.aadhar_raw : 'Not Provided'}</td></tr>
                <tr><td class="label">PAN Number</td><td style="font-weight:bold;">${emp.pan_raw !== 'N/A' ? emp.pan_raw : 'Not Provided'}</td></tr>
                <tr><td class="label">Voter ID</td><td>${emp.voter_id_raw !== 'N/A' ? emp.voter_id_raw : 'Not Provided'}</td></tr>
                <tr><td class="label">Driving Licence</td><td>${emp.dl_raw !== 'N/A' ? emp.dl_raw : 'Not Provided'}</td></tr>
                <tr><td class="label">Passport Number</td><td>${emp.passport_raw !== 'N/A' ? emp.passport_raw : 'Not Provided'}</td></tr>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Banking Details (DECRYPTED)</div>
              <table>
                <tr><td class="label">Bank Name</td><td>${emp.bank_name || 'N/A'}</td></tr>
                <tr><td class="label">Account Number</td><td style="color:green; font-weight:bold;">${emp.account_number_raw !== 'N/A' ? emp.account_number_raw : 'Not Provided'}</td></tr>
                <tr><td class="label">IFSC Code</td><td>${emp.ifsc_code || 'N/A'}</td></tr>
              </table>
            </div>

            <div class="section" style="margin-top: 50px; font-size: 12px; color: #666; text-align: justify; border-top: 1px solid #ccc; padding-top: 10px;">
              <strong>Terms and Conditions:</strong><br/>
              By accepting employment with Lizza Facility Management, the employee agrees to abide by all company policies, including data confidentiality, strict adherence to site geofencing protocols, and maintaining professional conduct. This dossier is an internal confidential document and must not be distributed outside the organization.
            </div>
          </body>
        </html>
      `);
      
      printWindow.document.close();
      
      // Wait slightly for images/styles to process before triggering the print prompt
      setTimeout(() => {
        printWindow.print();
      }, 500);

    } catch (error) {
      console.error("Error generating dossier:", error);
      alert("An error occurred while communicating with the secure endpoint.");
    }
  };

  if (loading && employees.length === 0) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  return (
    <Container fluid className="py-4 px-4 bg-light min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold m-0 text-dark"><ShieldAlert className="me-2 text-danger" /> Admin Command Center</h2>
          <p className="text-muted m-0">System Overview & Master Control</p>
        </div>
        <Button variant="primary" size="lg" className="fw-bold shadow-sm" onClick={() => setShowAddEmp(true)}>
          <Users className="me-2" size={20} /> Onboard New Staff
        </Button>
      </div>

      {alertMsg && (
        <Alert variant={alertMsg.type} dismissible onClose={() => setAlertMsg(null)}>
          {alertMsg.text}
        </Alert>
      )}

      <Tabs defaultActiveKey="map" className="mb-4 bg-white shadow-sm rounded">
        
        {/* TAB 1: LIVE MAP & TRACKING */}
        <Tab eventKey="map" title={<><Navigation size={18} className="me-2"/>Live Tracking</>}>
          <Card className="border-0 shadow-sm overflow-hidden mb-4" style={{ height: '600px' }}>
            <MapContainer center={[12.9716, 77.5946]} zoom={11} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              
              {/* Render Geofences */}
              {locations.map(site => (
                <Circle key={`loc-${site.id}`} center={[site.lat, site.lon]} radius={site.radius || 200} pathOptions={{ color: 'blue', fillOpacity: 0.2 }}>
                  <Popup><strong>{site.name}</strong><br/>Radius: {site.radius}m</Popup>
                </Circle>
              ))}

              {/* Render Live Employees */}
              {liveTracking.map((user, idx) => {
                if (!user.lat || !user.lon) return null;
                return (
                  <Marker key={`user-${idx}`} position={[user.lat, user.lon]}>
                    <Popup>
                      <strong>{user.name}</strong><br/>
                      <Badge bg={user.present ? "success" : "warning"}>{user.present ? "On Duty" : "Off Duty"}</Badge><br/>
                      <small className="text-muted">Last Ping: {user.last_ping ? new Date(user.last_ping).toLocaleTimeString() : 'N/A'}</small>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </Card>
        </Tab>

        {/* TAB 2: EMPLOYEE DIRECTORY */}
        <Tab eventKey="employees" title={<><Users size={18} className="me-2"/>Employee Directory</>}>
          <Card className="border-0 shadow-sm mb-4">
            <Card.Body className="p-0">
              <Table hover responsive className="align-middle mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="px-4 py-3">ID / Name</th>
                    <th>Role</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th className="text-end px-4">Admin Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id}>
                      <td className="px-4">
                        <div className="fw-bold text-dark">{emp.full_name}</div>
                        <div className="text-muted small">{emp.blockchain_id || 'Pending ID'}</div>
                      </td>
                      <td><Badge bg="secondary" className="text-capitalize">{emp.user_type.replace('_', ' ')}</Badge></td>
                      <td>
                        <div className="small">{emp.email}</div>
                        <div className="small text-muted">{emp.phone_number}</div>
                      </td>
                      <td>
                        {emp.is_verified 
                          ? <Badge bg="success">Verified</Badge> 
                          : <Badge bg="warning" text="dark">Pending Verif.</Badge>}
                      </td>
                      <td className="text-end px-4">
                        <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handlePrintDossier(emp.id)}>
                          <Printer size={16} /> Print Dossier
                        </Button>
                        <Button variant="outline-danger" size="sm" onClick={() => handleDeleteEmployee(emp.id, emp.user_type)}>
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Tab>

        {/* TAB 3: SITE LOCATIONS */}
        <Tab eventKey="locations" title={<><MapIcon size={18} className="me-2"/>Site Locations</>}>
          <Card className="border-0 shadow-sm mb-4">
            <Card.Body className="p-0">
              <Table hover responsive className="align-middle mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="px-4 py-3">Site Name</th>
                    <th>Coordinates</th>
                    <th>Geofence Radius</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.length === 0 ? (
                    <tr><td colSpan="3" className="text-center py-4 text-muted">No locations configured yet.</td></tr>
                  ) : (
                    locations.map(loc => (
                      <tr key={loc.id}>
                        <td className="px-4 fw-bold">{loc.name}</td>
                        <td className="font-monospace small">{loc.lat.toFixed(5)}, {loc.lon.toFixed(5)}</td>
                        <td>{loc.radius} meters</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Tab>

        {/* TAB 4: FIELD REPORTS */}
        <Tab eventKey="reports" title={<><FileText size={18} className="me-2"/>Recent Field Visits</>}>
          <Card className="border-0 shadow-sm mb-4">
            <Card.Body className="p-0">
              <Table hover responsive className="align-middle mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="px-4 py-3">Date & Time</th>
                    <th>Officer</th>
                    <th>Site</th>
                    <th>Purpose / Remarks</th>
                    <th className="text-center">Photo Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-4 text-muted">No visits logged for this month.</td></tr>
                  ) : (
                    visits.map((visit, idx) => (
                      <tr key={idx}>
                        <td className="px-4">
                          <div className="fw-bold">{visit.date}</div>
                          <div className="text-muted small">{visit.time}</div>
                        </td>
                        <td>{visit.officer_name}</td>
                        <td>{visit.site_name}</td>
                        <td>
                          <Badge bg="info" className="mb-1">{visit.purpose}</Badge>
                          <div className="small text-truncate" style={{maxWidth: '250px'}} title={visit.remarks}>{visit.remarks || '-'}</div>
                        </td>
                        <td className="text-center">
                          {visit.photo ? (
                            <a href={visit.photo} target="_blank" rel="noreferrer">
                              <img src={visit.photo} alt="Visit" style={{width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px'}} />
                            </a>
                          ) : (
                            <span className="text-muted small">No Photo</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Tab>

      </Tabs>

      {/* ONBOARDING MODAL */}
      {showAddEmp && (
        <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50" style={{zIndex: 1050, overflowY: 'auto'}}>
          <Container className="py-5">
            <Card className="border-0 shadow-lg">
              <Card.Header className="d-flex justify-content-between align-items-center bg-white py-3">
                <h5 className="fw-bold m-0">Onboard New Employee</h5>
                <Button variant="close" onClick={() => setShowAddEmp(false)}></Button>
              </Card.Header>
              <Card.Body className="bg-light">
                <EmployeeOnboardForm 
                  locations={locations} 
                  onCancel={() => setShowAddEmp(false)} 
                  onSuccess={() => {
                    setShowAddEmp(false);
                    fetchData();
                    setAlertMsg({ type: 'success', text: 'Employee successfully onboarded.' });
                  }} 
                />
              </Card.Body>
            </Card>
          </Container>
        </div>
      )}
    </Container>
  );
};

export default AdminDashboard;