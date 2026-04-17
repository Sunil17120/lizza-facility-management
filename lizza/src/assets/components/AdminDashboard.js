import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, Tabs, Tab } from 'react-bootstrap';
import { UserCog, Building2, MapPin, Trash2, Users, UserCheck, UserX, Save, Search, Plus, Bell, Edit2, Calendar, Download, Image as ImageIcon, FileText, Briefcase, Filter, Eye } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm'; 
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const getStatusIcon = (isPresent) => {
  return L.divIcon({
    html: `<div style="
      background-color: ${isPresent ? '#28a745' : '#dc3545'}; 
      width: 16px; 
      height: 16px; 
      border-radius: 50%; 
      border: 2px solid white; 
      box-shadow: 0 0 5px rgba(0,0,0,0.3);
    "></div>`,
    className: 'custom-status-marker',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

// Safe JSON parser for the dynamic arrays
const safeParseJSON = (jsonStr) => {
    try {
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : (typeof parsed === 'object' ? [parsed] : []);
    } catch (e) {
        return [];
    }
};

const AdminDashboard = () => {
  const [mainTab, setMainTab] = useState('overview');
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showNotif, setShowNotif] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', lat: '', lon: '', radius: 200 });
  const [editLocModal, setEditLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [filterOfficer, setFilterOfficer] = useState('');
  const [filterSite, setFilterSite] = useState('');
  
  const [fieldReports, setFieldReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  
  const adminEmail = localStorage.getItem('userEmail');

  const fetchBaseData = useCallback(async () => {
    try {
      const [empRes, locRes, liveRes] = await Promise.all([
        fetch(`/api/admin/employees?admin_email=${adminEmail}`),
        fetch(`/api/admin/locations`),
        fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`)
      ]);
      if (empRes.ok && locRes.ok) {
        setEmployees(await empRes.json());
        setLocations(await locRes.json());
        if (liveRes.ok) setLiveLocations(await liveRes.json());
      }
      setLoading(false);
    } catch (err) { setLoading(false); }
  }, [adminEmail]);

  useEffect(() => { fetchBaseData(); }, [fetchBaseData]);

  const fetchReportsData = useCallback(async () => {
    if (mainTab !== 'reports') return;
    setReportsLoading(true);
    try {
      let url = `/api/admin/reports/monthly-field-visits?month=${reportMonth}&year=${reportYear}`;
      if (filterOfficer) url += `&officer_id=${filterOfficer}`;
      if (filterSite) url += `&location_id=${filterSite}`;
      
      const res = await fetch(url);
      if (res.ok) setFieldReports(await res.json());
    } catch (err) { console.error("Report fetch error", err); }
    setReportsLoading(false);
  }, [reportMonth, reportYear, filterOfficer, filterSite, mainTab]);

  useEffect(() => { fetchReportsData(); }, [fetchReportsData]);

  const handleVerify = async (email) => {
      const res = await fetch(`/api/admin/verify-employee?target_email=${email}&admin_email=${adminEmail}`, { method: 'POST' });
      if (res.ok) { alert("Verified!"); setSelectedStaff(null); fetchBaseData(); }
  };

  const handleInlineSave = async (emp) => {
    const res = await fetch('/api/admin/update-employee-inline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp)
    });
    if (res.ok) alert("Settings saved for " + emp.full_name);
  };

  const handleDeleteEmp = async (id) => {
    if(window.confirm("Permanently delete this employee?")) {
        await fetch(`/api/admin/delete-employee/${id}`, { method: 'DELETE' });
        fetchBaseData();
    }
  };

  const handleAddBranch = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/add-location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newLoc) });
    setNewLoc({ name: '', lat: '', lon: '', radius: 200 });
    fetchBaseData();
  };

  const handleUpdateBranch = async (e) => {
    e.preventDefault();
    await fetch(`/api/admin/update-location/${editingLoc.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingLoc.name, lat: parseFloat(editingLoc.lat), lon: parseFloat(editingLoc.lon), radius: parseInt(editingLoc.radius) })
    });
    setEditLocModal(false); setEditingLoc(null); fetchBaseData();
  };

  const deleteLoc = async (id) => {
    if(window.confirm("Delete Branch?")) {
        await fetch(`/api/admin/delete-location/${id}`, { method: 'DELETE' });
        fetchBaseData();
    }
  };

  const downloadExcelWithPhotos = () => {
    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"></head><body>
      <table border="1">
        <thead>
          <tr style="background-color: #f2f2f2; font-weight: bold;">
            <th>Date</th><th>Photo Time</th><th>Officer ID</th><th>Officer Name</th><th>Site Name</th>
            <th>Site Entry</th><th>Site Exit</th><th>Total Duration</th>
            <th>Purpose</th><th>Remarks</th><th>Geotagged Photo</th>
          </tr>
        </thead>
        <tbody>
    `;

    fieldReports.forEach(r => {
      const imgTag = r.photo ? `<img src="${r.photo}" width="120" height="120" style="object-fit: contain;" />` : 'No Photo';
      tableHtml += `
        <tr>
          <td>${r.date}</td>
          <td>${r.time}</td>
          <td>${r.officer_id}</td>
          <td>${r.officer_name}</td>
          <td>${r.site_name}</td>
          <td>${r.entry_time}</td>
          <td>${r.exit_time}</td>
          <td>${r.duration}</td>
          <td>${r.purpose}</td>
          <td>${r.remarks || ''}</td>
          <td style="height: 130px; text-align: center; vertical-align: middle;">${imgTag}</td>
        </tr>
      `;
    });

    tableHtml += `</tbody></table></body></html>`;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Field_Visits_${reportMonth}_${reportYear}.xls`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pending = employees.filter(e => !e.is_verified && e.user_type !== 'admin');
  const verified = employees.filter(e => e.is_verified);
  const fieldOfficers = verified.filter(e => e.user_type === 'field_officer');
  
  const groupedReports = fieldReports.reduce((acc, visit) => {
    if (!acc[visit.date]) acc[visit.date] = [];
    acc[visit.date].push(visit);
    return acc;
  }, {});

  const managerStats = verified.filter(e => e.user_type === 'manager').map(mgr => {
    const teamSize = verified.filter(emp => emp.manager_id === mgr.id).length;
    return { ...mgr, teamSize };
  });

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-4">
      {/* --- HEADER --- */}
      <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
        <h2 className="fw-bold m-0 d-flex align-items-center"><UserCog className="text-danger me-3" size={32} />System Administration</h2>
        <div className="d-flex gap-2">
            <Button variant="light" className="position-relative border shadow-sm" onClick={() => setShowNotif(true)}>
                <Bell size={24} />
                {pending.length > 0 && <Badge bg="danger" pill className="position-absolute top-0 start-100 translate-middle">{pending.length}</Badge>}
            </Button>
            <Button variant="danger" onClick={() => setShowAddEmp(true)}><Plus className="me-2"/>Onboard Staff</Button>
        </div>
      </div>

      <Tabs activeKey={mainTab} onSelect={(k) => setMainTab(k)} className="mb-4 shadow-sm bg-white rounded">
        {/* ========================================== */}
        {/* TAB 1: SYSTEM OVERVIEW                     */}
        {/* ========================================== */}
        <Tab eventKey="overview" title={<span className="fw-bold px-3">System Overview</span>}>
          
          {/* STATS CARDS */}
          <Row className="mb-4 text-center">
            <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small">TOTAL STAFF</div><h4 className="fw-bold"><Users size={20} className="me-2"/>{employees.length}</h4></Card></Col>
            <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-primary">ASSIGNED SITES</div><h4 className="fw-bold text-primary"><MapPin size={20} className="me-2"/>{locations.length}</h4></Card></Col>
            <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-success">PRESENT</div><h4 className="fw-bold text-success"><UserCheck size={20} className="me-2"/>{employees.filter(e => e.is_present).length}</h4></Card></Col>
            <Col md={3}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-danger">ABSENT</div><h4 className="fw-bold text-danger"><UserX size={20} className="me-2"/>{employees.filter(e => !e.is_present).length}</h4></Card></Col>
          </Row>

          <Row>
            <Col md={4}>
              <Card className="border-0 shadow-sm p-3 mb-4">
                <h6 className="fw-bold mb-3"><Building2 size={18} className="me-2 text-danger"/>Office Branches</h6>
                <Form onSubmit={handleAddBranch} className="mb-3">
                  <Form.Control size="sm" className="mb-2" placeholder="Branch Name" value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} required />
                  <div className="d-flex gap-2">
                    <Form.Control size="sm" placeholder="Lat" value={newLoc.lat} onChange={e => setNewLoc({...newLoc, lat: e.target.value})} required />
                    <Form.Control size="sm" placeholder="Lon" value={newLoc.lon} onChange={e => setNewLoc({...newLoc, lon: e.target.value})} required />
                  </div>
                  <Button type="submit" variant="outline-danger" size="sm" className="w-100 mt-2 fw-bold">ADD BRANCH</Button>
                </Form>
                <div style={{maxHeight: '180px', overflowY: 'auto'}}>
                    {locations.map(loc => (
                        <div key={loc.id} className="d-flex justify-content-between align-items-center p-2 border-bottom small">
                            <span>{loc.name}</span>
                            <div>
                                <Edit2 size={14} className="text-primary me-2" onClick={() => { setEditingLoc(loc); setEditLocModal(true); }} style={{cursor: 'pointer'}}/>
                                <Trash2 size={14} className="text-danger" onClick={() => deleteLoc(loc.id)} style={{cursor: 'pointer'}}/>
                            </div>
                        </div>
                    ))}
                </div>
              </Card>
            </Col>

            <Col md={8}>
              <Card className="border-0 shadow-sm overflow-hidden mb-4" style={{ height: '380px' }}>
                <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  
                  {liveLocations.map(loc => (loc.lat && loc.lon) && (
                    <Marker 
                        key={loc.email} 
                        position={[loc.lat, loc.lon]}
                        icon={getStatusIcon(loc.present)}
                    >
                      <Popup>
                        <div className="text-center">
                            <strong className="d-block">{loc.name}</strong>
                            <Badge bg={loc.present ? "success" : "danger"} className="mt-1">
                                {loc.present ? "In Geofence" : "Outside"}
                            </Badge>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  
                  {locations.map(office => (
                    <Circle key={office.id} center={[office.lat, office.lon]} radius={office.radius} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.1 }}>
                      <Popup>{office.name} Geofence ({office.radius}m)</Popup>
                    </Circle>
                  ))}
                </MapContainer>
              </Card>
            </Col>
          </Row>

          <Card className="border-0 shadow-sm">
            <Table responsive hover className="align-middle mb-0 small">
              <thead className="table-light text-uppercase">
                <tr><th>Full Name</th><th>Email</th><th>Branch</th><th>Manager</th><th>Shift & Role</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {verified.map(emp => (
                  <tr key={emp.id}>
                    <td><div className="fw-bold">{emp.full_name}</div><Badge bg="light" text="dark">{emp.blockchain_id || 'Pending'}</Badge></td>
                    <td className="text-muted">{emp.email}</td>
                    
                    <td>
                      <Form.Select size="sm" value={emp.location_id || ''} onChange={e => {
                          const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                          if (target) { target.location_id = parseInt(e.target.value); setEmployees(updated); }
                      }}>
                        <option value="">Select Site...</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </Form.Select>
                    </td>

                    <td>
                      <Form.Select size="sm" value={emp.manager_id || ''} onChange={e => {
                          const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                          if (target) { target.manager_id = e.target.value ? parseInt(e.target.value) : null; setEmployees(updated); }
                      }}>
                        <option value="">No Manager</option>
                        {employees.filter(m => m.user_type === 'manager').map(mgr => (
                          <option key={mgr.id} value={mgr.id}>{mgr.full_name}</option>
                        ))}
                      </Form.Select>
                    </td>

                    <td>
                        <div className="d-flex gap-1 mb-1">
                            <Form.Control size="sm" type="time" value={emp.shift_start || ''} onChange={e => {
                                const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                                if (target) { target.shift_start = e.target.value; setEmployees(updated); }
                            }} disabled={emp.user_type === 'field_officer'} />
                            <Form.Control size="sm" type="time" value={emp.shift_end || ''} onChange={e => {
                                const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                                if (target) { target.shift_end = e.target.value; setEmployees(updated); }
                            }} disabled={emp.user_type === 'field_officer'} />
                        </div>
                        <Form.Select size="sm" value={emp.user_type} onChange={e => {
                            const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                            if (target) { target.user_type = e.target.value; setEmployees(updated); }
                        }}>
                            <option value="employee">Employee</option>
                            <option value="field_officer">Field Officer</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                        </Form.Select>
                    </td>

                    <td><Badge bg={emp.is_present ? "success" : "secondary"}>{emp.is_present ? "Present" : "Absent"}</Badge></td>
                    <td>
                        <div className="d-flex gap-1">
                            <Button variant="info" size="sm" onClick={() => setSelectedStaff(emp)} title="View Full Profile"><Eye size={14}/></Button>
                            <Button variant="danger" size="sm" onClick={() => handleInlineSave(emp)} title="Save Updates"><Save size={14}/></Button>
                            <Button variant="outline-dark" size="sm" onClick={() => handleDeleteEmp(emp.id)}><Trash2 size={14}/></Button>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Tab>

        {/* ========================================== */}
        {/* TAB 2: REPORTS & FIELD OPERATIONS          */}
        {/* ========================================== */}
        <Tab eventKey="reports" title={<span className="fw-bold px-3">Reports & Field Operations</span>}>
            
            <div className="p-3 bg-light border-bottom d-flex flex-wrap gap-4 align-items-center">
              <h5 className="mb-0 fw-bold d-flex align-items-center text-primary"><Filter className="me-2" /> Report Filters</h5>
              
              <div className="d-flex gap-2 align-items-center border-start ps-4">
                <span className="small fw-bold text-muted text-uppercase">Month/Year:</span>
                <Form.Select size="sm" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{width: '130px'}}>
                  {[...Array(12)].map((_, i) => (
                    <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('en', { month: 'long' })}</option>
                  ))}
                </Form.Select>
                <Form.Select size="sm" value={reportYear} onChange={e => setReportYear(e.target.value)} style={{width: '90px'}}>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </Form.Select>
              </div>

              <div className="d-flex gap-2 align-items-center border-start ps-4">
                <span className="small fw-bold text-muted text-uppercase">Specific Data:</span>
                <Form.Select size="sm" value={filterOfficer} onChange={e => setFilterOfficer(e.target.value)} style={{width: '150px'}}>
                  <option value="">All Officers</option>
                  {fieldOfficers.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                </Form.Select>
                <Form.Select size="sm" value={filterSite} onChange={e => setFilterSite(e.target.value)} style={{width: '150px'}}>
                  <option value="">All Sites</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </Form.Select>
              </div>
            </div>

            <div className="p-4">
                <Row className="mb-4">
                  <Col md={12}>
                    <Card className="border-0 shadow-sm">
                      <Card.Header className="bg-white py-3"><h6 className="m-0 fw-bold d-flex align-items-center"><Briefcase size={18} className="me-2 text-warning"/> Manager Team Summaries</h6></Card.Header>
                      <Table responsive hover className="align-middle mb-0 small">
                        <thead className="table-light"><tr><th>Manager Name</th><th>Department</th><th>Total Employees Managed</th><th>Live Presence</th></tr></thead>
                        <tbody>
                          {managerStats.length === 0 ? <tr><td colSpan="4" className="text-center py-3 text-muted">No managers found.</td></tr> :
                           managerStats.map(mgr => (
                             <tr key={mgr.id}>
                               <td className="fw-bold">{mgr.full_name}</td>
                               <td><Badge bg="secondary">{mgr.department || 'General'}</Badge></td>
                               <td><h5 className="m-0 fw-bold">{mgr.teamSize} <Users size={16} className="ms-1 text-muted"/></h5></td>
                               <td><Badge bg={mgr.is_present ? "success" : "danger"}>{mgr.is_present ? "On Duty" : "Offline"}</Badge></td>
                             </tr>
                           ))}
                        </tbody>
                      </Table>
                    </Card>
                  </Col>
                </Row>

                <Card className="border-0 shadow-sm mb-4">
                  <Card.Header className="bg-dark text-white p-3 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0 fw-bold d-flex align-items-center"><MapPin className="me-2 text-danger" size={18}/> Field Officer Site Visits</h6>
                    <Button variant="light" size="sm" className="fw-bold text-dark d-flex align-items-center" onClick={downloadExcelWithPhotos} disabled={fieldReports.length === 0}>
                      <Download size={14} className="me-2 text-success"/> Download Excel (With Photos)
                    </Button>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {reportsLoading ? (
                      <div className="text-center py-5"><Spinner variant="primary" animation="border" /></div>
                    ) : fieldReports.length === 0 ? (
                      <div className="text-center py-5 text-muted">No field visits recorded matching these filters.</div>
                    ) : (
                      <div className="accordion accordion-flush" id="reportAccordion">
                        {Object.keys(groupedReports).map((dateStr, index) => (
                          <div className="accordion-item border-bottom" key={dateStr}>
                            <h2 className="accordion-header">
                              <button className="accordion-button bg-light fw-bold" type="button" data-bs-toggle="collapse" data-bs-target={`#collapse${index}`}>
                                <Calendar size={16} className="me-2 text-primary"/>
                                {new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                <Badge bg="primary" className="ms-3">{groupedReports[dateStr].length} Visits</Badge>
                              </button>
                            </h2>
                            <div id={`collapse${index}`} className="accordion-collapse collapse show">
                              <div className="accordion-body p-0">
                                <Table hover responsive className="mb-0 align-middle small">
                                  <thead className="table-secondary">
                                    <tr>
                                      <th>Photo Time</th><th>Officer</th><th>Site</th><th>Entry</th><th>Exit</th>
                                      <th>Duration</th><th>Purpose</th><th>Remarks</th><th>Evidence</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {groupedReports[dateStr].map(visit => (
                                      <tr key={visit.visit_id}>
                                        <td className="fw-bold text-nowrap">{visit.time}</td>
                                        <td><span className="text-muted d-block" style={{fontSize:'0.7rem'}}>{visit.officer_id}</span>{visit.officer_name}</td>
                                        <td><MapPin size={12} className="me-1 text-danger"/>{visit.site_name}</td>
                                        <td className="text-success fw-bold text-nowrap">{visit.entry_time}</td>
                                        <td className={visit.exit_time === 'Active' ? 'text-primary fw-bold text-nowrap' : 'text-danger fw-bold text-nowrap'}>{visit.exit_time}</td>
                                        <td>
                                          <Badge bg={visit.duration === 'In Progress' ? 'primary' : 'secondary'} className="text-nowrap">{visit.duration}</Badge>
                                        </td>
                                        <td><Badge bg="dark">{visit.purpose}</Badge></td>
                                        <td style={{ maxWidth: '200px' }} className="text-truncate" title={visit.remarks}>{visit.remarks || '-'}</td>
                                        <td>
                                          <Button variant="outline-secondary" size="sm" onClick={() => setPhotoPreview(visit.photo)}>
                                            <ImageIcon size={14} className="me-1"/> View Photo
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </Table>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card.Body>
                </Card>
            </div>
        </Tab>
      </Tabs>

      {/* --- MODALS --- */}

      {/* Pending Verifications Notif */}
      <Modal show={showNotif} onHide={() => setShowNotif(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Pending Approval</Modal.Title></Modal.Header>
        <Modal.Body className="p-0">
          {pending.length === 0 ? <div className="p-4 text-center text-muted">No pending approvals.</div> : 
           pending.map(p => (
            <div key={p.id} className="p-3 border-bottom d-flex justify-content-between align-items-center bg-white">
              <div><h6 className="mb-0 fw-bold">{p.full_name}</h6><small className="text-muted">{p.personal_email}</small></div>
              <Button variant="danger" size="sm" onClick={() => { setSelectedStaff(p); setShowNotif(false); }}>REVIEW</Button>
            </div>
          ))}
        </Modal.Body>
      </Modal>

      {/* COMPREHENSIVE EMPLOYEE PROFILE MODAL */}
      <Modal show={!!selectedStaff} onHide={() => setSelectedStaff(null)} size="xl" centered>
        <Modal.Header closeButton className="bg-dark text-white d-flex justify-content-between align-items-center w-100">
          <Modal.Title className="h6 mb-0">Employee Profile: {selectedStaff?.full_name}</Modal.Title>
          <Button variant="outline-light" size="sm" className="fw-bold ms-auto me-3 d-flex align-items-center" onClick={() => {
              const printWindow = window.open('', '_blank');
              printWindow.document.write(`
                <html><head><title>Profile_${selectedStaff?.full_name}</title>
                  <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
                    h2 { text-align: center; border-bottom: 2px solid #dc3545; padding-bottom: 10px; }
                    .flex-row { display: flex; justify-content: space-between; margin-top: 30px; }
                    .photo { width: 150px; height: 150px; border-radius: 8px; object-fit: cover; border: 2px solid #ccc; }
                    .details { flex-grow: 1; padding-left: 30px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    td, th { padding: 10px; border: 1px solid #ddd; text-align: left; }
                    th { background-color: #f8f9fa; width: 30%; }
                  </style>
                </head><body>
                  <h2>Lizza - Employee Profile Report</h2>
                  <div class="flex-row">
                    <div><img src="${selectedStaff?.profile_photo_path}" class="photo" alt="Profile" /></div>
                    <div class="details">
                      <table>
                        <tr><th>Full Name</th><td>${selectedStaff?.full_name}</td></tr>
                        <tr><th>Email</th><td>${selectedStaff?.personal_email}</td></tr>
                        <tr><th>Mobile</th><td>${selectedStaff?.phone_number}</td></tr>
                        <tr><th>Date of Birth</th><td>${selectedStaff?.dob}</td></tr>
                        <tr><th>Designation</th><td>${selectedStaff?.designation}</td></tr>
                        <tr><th>Department</th><td>${selectedStaff?.department}</td></tr>
                      </table>
                    </div>
                  </div>
                  <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
                </body></html>
              `);
              printWindow.document.close();
          }}>
            <FileText size={16} className="me-2"/> Print Summary
          </Button>
        </Modal.Header>
        
        <Modal.Body className="bg-light p-4">
          <Row>
            {/* Left Sidebar Profile Info */}
            <Col md={3}>
              <Card className="p-3 shadow-sm border-0 mb-3 text-center">
                <img src={selectedStaff?.profile_photo_path || "https://via.placeholder.com/150"} alt="Profile" className="img-fluid rounded-circle mb-3 mx-auto" style={{width: '130px', height: '130px', objectFit: 'cover', border: '3px solid #0d6efd'}} />
                <h5 className="fw-bold mb-1">{selectedStaff?.full_name}</h5>
                <Badge bg="primary" className="mb-3">{selectedStaff?.designation}</Badge>
                
                <div className="text-start small mb-4">
                    <p className="mb-1"><strong className="text-muted">Phone:</strong> {selectedStaff?.phone_number}</p>
                    <p className="mb-1"><strong className="text-muted">DOB:</strong> {selectedStaff?.dob}</p>
                    <p className="mb-1"><strong className="text-muted">Email:</strong> {selectedStaff?.personal_email}</p>
                    <p className="mb-1"><strong className="text-muted">Blood:</strong> <Badge bg="danger">{selectedStaff?.blood_group || 'N/A'}</Badge></p>
                </div>
                
                {/* Conditionally render Action Button based on status */}
                {!selectedStaff?.is_verified && (
                    <Button variant="success" className="w-100 fw-bold shadow-sm" onClick={() => handleVerify(selectedStaff.email)}>APPROVE & ACTIVATE</Button>
                )}
                {selectedStaff?.is_verified && (
                    <Badge bg="success" className="w-100 p-2 shadow-sm"><CheckCircle size={14} className="me-1"/> ACTIVE EMPLOYEE</Badge>
                )}
              </Card>
            </Col>
            
            {/* Right Detailed Tabs */}
            <Col md={9}>
              <Card className="border-0 shadow-sm p-3 h-100 overflow-auto">
                 <Tabs defaultActiveKey="identity" className="mb-4">
                    
                    {/* TAB: IDENTITY */}
                    <Tab eventKey="identity" title="Identity">
                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary mt-2">Personal Information</h6>
                        <Row>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Gender</small><span>{selectedStaff?.gender || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Marital Status</small><span>{selectedStaff?.marital_status || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Identity Mark</small><span>{selectedStaff?.identity_mark || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Father's Name</small><span>{selectedStaff?.father_name || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Mother's Name</small><span>{selectedStaff?.mother_name || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Nationality</small><span>{selectedStaff?.nationality || 'N/A'}</span></Col>
                        </Row>
                        
                        <h6 className="fw-bold border-bottom pb-2 mb-3 mt-3 text-primary">Medical & Demographics</h6>
                        <Row>
                            <Col sm={3} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Height (cm)</small><span>{selectedStaff?.height || 'N/A'}</span></Col>
                            <Col sm={3} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Caste</small><span>{selectedStaff?.caste || 'N/A'}</span></Col>
                            <Col sm={3} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Category</small><span>{selectedStaff?.category || 'N/A'}</span></Col>
                            <Col sm={3} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Religion</small><span>{selectedStaff?.religion || 'N/A'}</span></Col>
                            <Col sm={12} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Medical Remarks</small><span>{selectedStaff?.medical_remarks || 'None'}</span></Col>
                        </Row>
                    </Tab>

                    {/* TAB: ADDRESS */}
                    <Tab eventKey="address" title="Addresses">
                        <Row className="mt-2">
                            <Col md={6}>
                                <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Permanent Address</h6>
                                <p className="mb-1"><small className="text-muted fw-bold">Address:</small> {selectedStaff?.perm_address || 'N/A'}</p>
                                <p className="mb-1"><small className="text-muted fw-bold">State:</small> {selectedStaff?.perm_state || 'N/A'}</p>
                                <p className="mb-1"><small className="text-muted fw-bold">PIN Code:</small> {selectedStaff?.perm_pin || 'N/A'}</p>
                                <p className="mb-1"><small className="text-muted fw-bold">Alt Mobile:</small> {selectedStaff?.perm_mobile || 'N/A'}</p>
                            </Col>
                            <Col md={6}>
                                <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Temporary Address</h6>
                                <p className="mb-1"><small className="text-muted fw-bold">Address:</small> {selectedStaff?.temp_address || 'N/A'}</p>
                                <p className="mb-1"><small className="text-muted fw-bold">State:</small> {selectedStaff?.temp_state || 'N/A'}</p>
                                <p className="mb-1"><small className="text-muted fw-bold">PIN Code:</small> {selectedStaff?.temp_pin || 'N/A'}</p>
                                <p className="mb-1"><small className="text-muted fw-bold">Local Mobile:</small> {selectedStaff?.temp_mobile || 'N/A'}</p>
                            </Col>
                        </Row>
                    </Tab>

                    {/* TAB: WORK & BANK */}
                    <Tab eventKey="work" title="Work & Bank">
                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary mt-2">Work Allocation</h6>
                        <Row>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">System Role</small><Badge bg="dark">{selectedStaff?.user_type}</Badge></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Department</small><span>{selectedStaff?.department || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Unit / Site</small><span>{selectedStaff?.unit_name || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Shift Timings</small><span>{selectedStaff?.shift_start ? `${selectedStaff.shift_start} to ${selectedStaff.shift_end}` : 'Dynamic/N/A'}</span></Col>
                        </Row>
                        
                        <h6 className="fw-bold border-bottom pb-2 mb-3 mt-3 text-primary">Bank & Financial Details</h6>
                        <Row>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Bank Name</small><span>{selectedStaff?.bank_name || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">IFSC Code</small><span>{selectedStaff?.ifsc_code || 'N/A'}</span></Col>
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">Account Number</small>
                                <span className={selectedStaff?.account_number_enc ? "fw-bold text-success" : "text-muted"}>{selectedStaff?.account_number_enc ? "[Encrypted in DB]" : "N/A"}</span>
                            </Col>
                        </Row>
                    </Tab>

                    {/* TAB: BACKGROUND (JSON ARRAYS) */}
                    <Tab eventKey="background" title="Background Data">
                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary mt-2">Education History</h6>
                        <Table size="sm" bordered hover className="mb-4 small">
                            <thead className="table-light"><tr><th>Qualification</th><th>Institute</th><th>Year</th><th>Marks</th></tr></thead>
                            <tbody>
                                {safeParseJSON(selectedStaff?.education_json).map((edu, i) => (
                                    <tr key={i}><td>{edu.qualification || '-'}</td><td>{edu.institute || '-'}</td><td>{edu.year || '-'}</td><td>{edu.marks || '-'}</td></tr>
                                ))}
                            </tbody>
                        </Table>

                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Work Experience</h6>
                        <Table size="sm" bordered hover className="mb-4 small">
                            <thead className="table-light"><tr><th>Company</th><th>Designation</th><th>Period</th></tr></thead>
                            <tbody>
                                {safeParseJSON(selectedStaff?.experience_json).map((exp, i) => (
                                    <tr key={i}><td>{exp.company || '-'}</td><td>{exp.designation || '-'}</td><td>{exp.period || '-'}</td></tr>
                                ))}
                            </tbody>
                        </Table>

                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Family Details</h6>
                        <Table size="sm" bordered hover className="mb-0 small">
                            <thead className="table-light"><tr><th>Name</th><th>Relation</th><th>DOB</th></tr></thead>
                            <tbody>
                                {safeParseJSON(selectedStaff?.family_json).map((fam, i) => (
                                    <tr key={i}><td>{fam.name || '-'}</td><td>{fam.relation || '-'}</td><td>{fam.dob || '-'}</td></tr>
                                ))}
                            </tbody>
                        </Table>
                    </Tab>

                    {/* TAB: DOCUMENTS & KYC */}
                    <Tab eventKey="documents" title="KYC Documents">
                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary mt-2">Government IDs</h6>
                        <Row className="mb-4">
                            <Col sm={6} className="mb-3">
                                <small className="text-muted d-block text-uppercase fw-bold">Gov ID (UID)</small>
                                <span className={selectedStaff?.aadhar_enc ? "text-danger fw-bold" : "text-muted"}>
                                    {selectedStaff?.aadhar_enc ? "[Aadhaar Redacted]" : "N/A"}
                                </span>
                            </Col>
                            <Col sm={6} className="mb-3">
                                <small className="text-muted d-block text-uppercase fw-bold">PAN Card Number</small>
                                <span className={selectedStaff?.pan_enc ? "text-success fw-bold" : "text-muted"}>{selectedStaff?.pan_enc ? "[Encrypted in DB]" : "N/A"}</span>
                            </Col>
                            <Col sm={6} className="mb-3">
                                <small className="text-muted d-block text-uppercase fw-bold">Voter ID</small>
                                <span className={selectedStaff?.voter_id_enc ? "text-success fw-bold" : "text-muted"}>{selectedStaff?.voter_id_enc ? "[Encrypted in DB]" : "N/A"}</span>
                            </Col>
                            <Col sm={6} className="mb-3">
                                <small className="text-muted d-block text-uppercase fw-bold">Driving Licence</small>
                                <span className={selectedStaff?.driving_licence_enc ? "text-success fw-bold" : "text-muted"}>{selectedStaff?.driving_licence_enc ? "[Encrypted in DB]" : "N/A"}</span>
                            </Col>
                        </Row>

                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Uploaded Evidence Gallery</h6>
                        <Row>
                            {selectedStaff?.aadhar_photo_path && (
                                <Col md={6} className="mb-3 text-center">
                                    <small className="text-muted fw-bold d-block mb-1">Aadhaar Document</small>
                                    <img src={selectedStaff.aadhar_photo_path} alt="Aadhaar" className="img-thumbnail" style={{maxHeight: '180px'}} />
                                </Col>
                            )}
                            {selectedStaff?.bank_passbook_path && (
                                <Col md={6} className="mb-3 text-center">
                                    <small className="text-muted fw-bold d-block mb-1">Bank Passbook / Cheque</small>
                                    <img src={selectedStaff.bank_passbook_path} alt="Bank" className="img-thumbnail" style={{maxHeight: '180px'}} />
                                </Col>
                            )}
                            {selectedStaff?.pan_photo_path && (
                                <Col md={6} className="mb-3 text-center">
                                    <small className="text-muted fw-bold d-block mb-1">PAN Card</small>
                                    <img src={selectedStaff.pan_photo_path} alt="PAN" className="img-thumbnail" style={{maxHeight: '180px'}} />
                                </Col>
                            )}
                            {selectedStaff?.voter_photo_path && (
                                <Col md={6} className="mb-3 text-center">
                                    <small className="text-muted fw-bold d-block mb-1">Voter ID</small>
                                    <img src={selectedStaff.voter_photo_path} alt="Voter ID" className="img-thumbnail" style={{maxHeight: '180px'}} />
                                </Col>
                            )}
                            {selectedStaff?.fingerprints_left_path && (
                                <Col md={6} className="mb-3 text-center">
                                    <small className="text-muted fw-bold d-block mb-1">Left Hand Fingerprints</small>
                                    <img src={selectedStaff.fingerprints_left_path} alt="Left FP" className="img-thumbnail" style={{maxHeight: '180px'}} />
                                </Col>
                            )}
                            {selectedStaff?.fingerprints_right_path && (
                                <Col md={6} className="mb-3 text-center">
                                    <small className="text-muted fw-bold d-block mb-1">Right Hand Fingerprints</small>
                                    <img src={selectedStaff.fingerprints_right_path} alt="Right FP" className="img-thumbnail" style={{maxHeight: '180px'}} />
                                </Col>
                            )}
                        </Row>
                    </Tab>

                 </Tabs>
              </Card>
            </Col>
          </Row>
        </Modal.Body>
      </Modal>

      {/* Onboarding Modal */}
      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
          <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Onboard New Employee</Modal.Title></Modal.Header>
          <Modal.Body className="p-4">
              <EmployeeOnboardForm locations={locations} onCancel={() => setShowAddEmp(false)} onSuccess={() => { setShowAddEmp(false); fetchBaseData(); }} />
          </Modal.Body>
      </Modal>

      {/* Edit Branch Modal */}
      <Modal show={editLocModal} onHide={() => setEditLocModal(false)} centered>
          <Modal.Header closeButton><Modal.Title className="h6 fw-bold">Edit Branch Location</Modal.Title></Modal.Header>
          <Modal.Body>
              {editingLoc && (
                  <Form onSubmit={handleUpdateBranch}>
                      <Form.Group className="mb-2"><Form.Label className="small fw-bold">Branch Name</Form.Label><Form.Control size="sm" value={editingLoc.name} onChange={e => setEditingLoc({...editingLoc, name: e.target.value})} required /></Form.Group>
                      <Row>
                          <Col><Form.Group className="mb-2"><Form.Label className="small fw-bold">Latitude</Form.Label><Form.Control size="sm" value={editingLoc.lat} onChange={e => setEditingLoc({...editingLoc, lat: e.target.value})} required /></Form.Group></Col>
                          <Col><Form.Group className="mb-2"><Form.Label className="small fw-bold">Longitude</Form.Label><Form.Control size="sm" value={editingLoc.lon} onChange={e => setEditingLoc({...editingLoc, lon: e.target.value})} required /></Form.Group></Col>
                      </Row>
                      <Form.Group className="mb-4"><Form.Label className="small fw-bold">Radius (meters)</Form.Label><Form.Control size="sm" type="number" value={editingLoc.radius} onChange={e => setEditingLoc({...editingLoc, radius: e.target.value})} required /></Form.Group>
                      <Button type="submit" variant="primary" size="sm" className="w-100 fw-bold">UPDATE BRANCH</Button>
                  </Form>
              )}
          </Modal.Body>
      </Modal>

      {/* Geotag Photo Viewer */}
      <Modal show={!!photoPreview} onHide={() => setPhotoPreview(null)} centered size="lg">
        <Modal.Header closeButton className="bg-dark text-white border-0"><Modal.Title className="h6 fw-bold">Geotagged Evidence</Modal.Title></Modal.Header>
        <Modal.Body className="p-0 text-center bg-dark">
            <img src={photoPreview} alt="Geotagged Visit" style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
        </Modal.Body>
      </Modal>

    </Container>
  );
};

export default AdminDashboard;