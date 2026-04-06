import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, Tabs, Tab } from 'react-bootstrap';
import { UserCog, Building2, MapPin, Trash2, Users, UserCheck, UserX, Save, Search, Plus, Bell, Edit2, Calendar, Download, Image as ImageIcon, FileText, Briefcase, Filter, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm'; 
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

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
  const [geofenceLogs, setGeofenceLogs] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [trackUser, setTrackUser] = useState(null);
  
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
      const filterStr = `month=${reportMonth}&year=${reportYear}${filterOfficer ? `&officer_id=${filterOfficer}` : ''}${filterSite ? `&location_id=${filterSite}` : ''}`;
      const [visitRes, geoRes] = await Promise.all([
        fetch(`/api/admin/reports/monthly-field-visits?${filterStr}`),
        fetch(`/api/admin/reports/geofence-logs?${filterStr}`)
      ]);
      if (visitRes.ok) setFieldReports(await visitRes.json());
      if (geoRes.ok) setGeofenceLogs(await geoRes.json());
    } catch (err) { console.error(err); }
    setReportsLoading(false);
  }, [reportMonth, reportYear, filterOfficer, filterSite, mainTab]);

  useEffect(() => { fetchReportsData(); }, [fetchReportsData]);

  const handleVerify = async (email) => {
      const res = await fetch(`/api/admin/verify-employee?target_email=${email}&admin_email=${adminEmail}`, { method: 'POST' });
      if (res.ok) { alert("Verified!"); setSelectedStaff(null); fetchBaseData(); }
  };

  const handleInlineSave = async (emp) => {
    const res = await fetch('/api/admin/update-employee-inline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emp)
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
    if(window.confirm("Delete Branch?")) { await fetch(`/api/admin/delete-location/${id}`, { method: 'DELETE' }); fetchBaseData(); }
  };

  const handleViewLiveLocation = (email, name) => {
    const userLocation = liveLocations.find(l => l.email === email);
    if (userLocation && userLocation.lat && userLocation.lon) setTrackUser(userLocation);
    else alert(`${name} is currently offline or their GPS signal is unavailable.`);
  };

  const downloadUnifiedExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Comprehensive Field Report');

      ws.columns = [
        { header: 'Log Type', key: 'type', width: 18 }, { header: 'Date', key: 'date', width: 15 },
        { header: 'Officer ID', key: 'officer_id', width: 20 }, { header: 'Officer Name', key: 'officer_name', width: 25 },
        { header: 'Site Name', key: 'site_name', width: 25 }, { header: 'Entry Time', key: 'entry_time', width: 15 },
        { header: 'Exit Time', key: 'exit_time', width: 15 }, { header: 'Duration (Mins)', key: 'duration', width: 18 },
        { header: 'Purpose', key: 'purpose', width: 20 }, { header: 'Remarks', key: 'remarks', width: 40 },
        { header: 'Officer Monthly Visits', key: 'officer_total', width: 22 }, { header: 'Site Monthly Visits', key: 'site_total', width: 22 },
        { header: 'Photo Evidence', key: 'photo', width: 25 }
      ];
      ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

      const officerTotals = {}; const siteTotals = {};
      fieldReports.forEach(r => { officerTotals[r.officer_name] = (officerTotals[r.officer_name] || 0) + 1; siteTotals[r.site_name] = (siteTotals[r.site_name] || 0) + 1; });
      geofenceLogs.forEach(r => { officerTotals[r.officer_name] = (officerTotals[r.officer_name] || 0) + 1; siteTotals[r.site_name] = (siteTotals[r.site_name] || 0) + 1; });

      const combinedData = [];
      fieldReports.forEach(r => combinedData.push({ type: 'Manual Log', date: r.date, officer_id: r.officer_id, officer_name: r.officer_name, site_name: r.site_name, entry_time: r.time, exit_time: '-', duration: '-', purpose: r.purpose, remarks: r.remarks || '', officer_total: officerTotals[r.officer_name], site_total: siteTotals[r.site_name], photoRaw: r.photo }));
      geofenceLogs.forEach(r => combinedData.push({ type: 'Auto Geofence', date: r.date, officer_id: r.officer_id, officer_name: r.officer_name, site_name: r.site_name, entry_time: r.entry_time, exit_time: r.exit_time, duration: r.duration_mins, purpose: 'Tracking', remarks: '-', officer_total: officerTotals[r.officer_name], site_total: siteTotals[r.site_name], photoRaw: null }));

      combinedData.sort((a, b) => new Date(b.date + ' ' + b.entry_time) - new Date(a.date + ' ' + a.entry_time));

      let rowIndex = 2;
      for (const row of combinedData) {
          ws.addRow({ type: row.type, date: row.date, officer_id: row.officer_id, officer_name: row.officer_name, site_name: row.site_name, entry_time: row.entry_time, exit_time: row.exit_time, duration: row.duration, purpose: row.purpose, remarks: row.remarks, officer_total: row.officer_total, site_total: row.site_total });
          ws.getRow(rowIndex).height = row.photoRaw ? 110 : 25; ws.getRow(rowIndex).alignment = { vertical: 'middle', wrapText: true };
          if (row.photoRaw) {
              let base64DataRaw = row.photoRaw;
              if (row.photoRaw.startsWith('http')) {
                  try { const res = await fetch(`/api/admin/proxy-image?url=${encodeURIComponent(row.photoRaw)}`); base64DataRaw = (await res.json()).base64; } catch(e) {}
              }
              if (base64DataRaw) {
                  try {
                      const imageId = workbook.addImage({ base64: base64DataRaw.split(',')[1], extension: base64DataRaw.includes('jpeg') ? 'jpeg' : 'png' });
                      ws.addImage(imageId, { tl: { col: 12, row: rowIndex - 1 }, ext: { width: 100, height: 100 }, editAs: 'oneCell' });
                  } catch(e) {}
              }
          }
          rowIndex++;
      }
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Unified_Operations_Report_${reportMonth}_${reportYear}.xlsx`);
    } catch (error) { alert("Failed to generate Excel file."); }
  };

  const pending = employees.filter(e => !e.is_verified && e.user_type !== 'admin');
  const verified = employees.filter(e => e.is_verified);
  const fieldOfficers = verified.filter(e => e.user_type === 'field_officer');
  
  // Combine both arrays to display in one single unified table in the UI
  const allReportsCombined = [...fieldReports.map(r => ({...r, log_type: 'Manual'})), ...geofenceLogs.map(r => ({...r, log_type: 'Auto Geofence'}))];
  allReportsCombined.sort((a, b) => new Date(b.date + ' ' + (b.time || b.entry_time)) - new Date(a.date + ' ' + (a.time || a.entry_time)));
  
  const groupedReports = allReportsCombined.reduce((acc, visit) => {
    if (!acc[visit.date]) acc[visit.date] = [];
    acc[visit.date].push(visit); return acc;
  }, {});

  const managerStats = verified.filter(e => e.user_type === 'manager').map(mgr => {
    return { ...mgr, teamSize: verified.filter(emp => emp.manager_id === mgr.id).length };
  });

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
        <h2 className="fw-bold m-0 d-flex align-items-center"><UserCog className="text-danger me-3" size={32} />System Administration</h2>
        <div className="d-flex gap-2">
            <Button variant="light" className="position-relative border shadow-sm" onClick={() => setShowNotif(true)}><Bell size={24} />{pending.length > 0 && <Badge bg="danger" pill className="position-absolute top-0 start-100 translate-middle">{pending.length}</Badge>}</Button>
            <Button variant="danger" onClick={() => setShowAddEmp(true)}><Plus className="me-2"/>Onboard Staff</Button>
        </div>
      </div>

      <Tabs activeKey={mainTab} onSelect={setMainTab} className="mb-4 shadow-sm bg-white rounded">
        <Tab eventKey="overview" title={<span className="fw-bold px-3">System Overview</span>}>
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
                  {liveLocations.map(loc => (loc.lat && loc.lon) && (<Marker key={loc.email} position={[loc.lat, loc.lon]}><Popup>{loc.name} - {loc.present ? "Present" : "Outside"}</Popup></Marker>))}
                  {locations.map(office => (<Circle key={office.id} center={[office.lat, office.lon]} radius={office.radius} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.2 }}><Popup>{office.name} Geofence ({office.radius}m)</Popup></Circle>))}
                </MapContainer>
              </Card>
            </Col>
          </Row>

          <Card className="border-0 shadow-sm">
            <Table responsive hover className="align-middle mb-0 small">
              <thead className="table-light text-uppercase"><tr><th>Full Name</th><th>Email</th><th>Branch</th><th>Manager</th><th>Shift & Role</th><th>Status</th><th>Actions</th></tr></thead>
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
                        {employees.filter(m => m.user_type === 'manager').map(mgr => (<option key={mgr.id} value={mgr.id}>{mgr.full_name}</option>))}
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
                            <option value="employee">Employee</option><option value="field_officer">Field Officer</option><option value="manager">Manager</option><option value="admin">Admin</option>
                        </Form.Select>
                    </td>
                    <td><Badge bg={emp.is_present ? "success" : "secondary"}>{emp.is_present ? "Present" : "Absent"}</Badge></td>
                    <td>
                        <div className="d-flex gap-1">
                            <Button variant="danger" size="sm" onClick={() => handleInlineSave(emp)}><Save size={14}/></Button>
                            <Button variant="outline-dark" size="sm" onClick={() => handleDeleteEmp(emp.id)}><Trash2 size={14}/></Button>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Tab>

        <Tab eventKey="reports" title={<span className="fw-bold px-3">Reports & Field Operations</span>}>
            <div className="p-3 bg-light border-bottom d-flex flex-wrap gap-4 align-items-center">
              <h5 className="mb-0 fw-bold d-flex align-items-center text-primary"><Filter className="me-2" /> Report Filters</h5>
              <div className="d-flex gap-2 align-items-center border-start ps-4">
                <span className="small fw-bold text-muted text-uppercase">Month/Year:</span>
                <Form.Select size="sm" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{width: '130px'}}>
                  {[...Array(12)].map((_, i) => (<option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('en', { month: 'long' })}</option>))}
                </Form.Select>
                <Form.Select size="sm" value={reportYear} onChange={e => setReportYear(e.target.value)} style={{width: '90px'}}>
                  <option value="2026">2026</option><option value="2027">2027</option>
                </Form.Select>
              </div>
              <div className="d-flex gap-2 align-items-center border-start ps-4">
                <span className="small fw-bold text-muted text-uppercase">Specific Data:</span>
                <Form.Select size="sm" value={filterOfficer} onChange={e => setFilterOfficer(e.target.value)} style={{width: '150px'}}>
                  <option value="">All Officers</option>{fieldOfficers.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                </Form.Select>
                <Form.Select size="sm" value={filterSite} onChange={e => setFilterSite(e.target.value)} style={{width: '150px'}}>
                  <option value="">All Sites</option>{locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </Form.Select>
              </div>
              <div className="ms-auto">
                 <Button variant="success" size="sm" className="fw-bold d-flex align-items-center shadow-sm" onClick={downloadUnifiedExcel} disabled={fieldReports.length === 0 && geofenceLogs.length === 0}>
                    <Download size={16} className="me-2 text-white"/> Download Full Report (Excel)
                 </Button>
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
                               <td className="fw-bold">{mgr.full_name}</td><td><Badge bg="secondary">{mgr.department || 'General'}</Badge></td>
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
                    <h6 className="mb-0 fw-bold d-flex align-items-center"><FileText className="me-2 text-info" size={18}/> Unified Field Operations Timeline</h6>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {reportsLoading ? <div className="text-center py-5"><Spinner variant="primary" animation="border" /></div> : allReportsCombined.length === 0 ? <div className="text-center py-5 text-muted">No records found.</div> : (
                      <div className="accordion accordion-flush" id="reportAccordion">
                        {Object.keys(groupedReports).map((dateStr, index) => (
                          <div className="accordion-item border-bottom" key={dateStr}>
                            <h2 className="accordion-header">
                              <button className="accordion-button bg-light fw-bold" type="button" data-bs-toggle="collapse" data-bs-target={`#collapse${index}`}>
                                <Calendar size={16} className="me-2 text-primary"/>
                                {new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                <Badge bg="primary" className="ms-3">{groupedReports[dateStr].length} Events</Badge>
                              </button>
                            </h2>
                            <div id={`collapse${index}`} className="accordion-collapse collapse show">
                              <div className="accordion-body p-0">
                                <Table hover responsive className="mb-0 align-middle small">
                                  <thead className="table-secondary">
                                      <tr><th>Type</th><th>Time (Entry)</th><th>Exit Time</th><th>Officer</th><th>Site</th><th>Details</th><th>Photo/Evidence</th><th>Actions</th></tr>
                                  </thead>
                                  <tbody>
                                    {groupedReports[dateStr].map((visit, i) => (
                                      <tr key={i}>
                                        <td>
                                            {visit.log_type === 'Manual' 
                                                ? <Badge bg="dark"><ImageIcon size={10} className="me-1"/> Photo Log</Badge> 
                                                : <Badge bg="secondary"><Clock size={10} className="me-1"/> Auto Geofence</Badge>}
                                        </td>
                                        <td className="fw-bold text-nowrap text-success">{visit.time || visit.entry_time}</td>
                                        <td className="fw-bold text-nowrap text-danger">{visit.exit_time || '-'}</td>
                                        <td><span className="text-muted d-block" style={{fontSize:'0.7rem'}}>{visit.officer_id}</span>{visit.officer_name}</td>
                                        <td><MapPin size={12} className="me-1 text-danger"/>{visit.site_name}</td>
                                        
                                        {/* Details Column */}
                                        <td style={{ maxWidth: '200px' }} className="text-truncate">
                                            {visit.log_type === 'Manual' ? (
                                                <><strong>{visit.purpose}</strong>: {visit.remarks || '-'}</>
                                            ) : (
                                                <><span className="text-muted">Duration:</span> {visit.duration_mins > 0 ? `${visit.duration_mins} mins` : '-'}</>
                                            )}
                                        </td>
                                        
                                        <td>
                                            {visit.photo && (
                                              <Button variant="outline-secondary" size="sm" onClick={() => setPhotoPreview(visit.photo)}>View Photo</Button>
                                            )}
                                        </td>
                                        <td><Button variant="outline-primary" size="sm" className="d-flex align-items-center" onClick={() => handleViewLiveLocation(visit.officer_email, visit.officer_name)}><Navigation size={12} className="me-1"/> Live Map</Button></td>
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
      <Modal show={!!trackUser} onHide={() => setTrackUser(null)} centered size="lg">
        <Modal.Header closeButton className="bg-dark text-white border-0"><Modal.Title className="h6 fw-bold d-flex align-items-center"><Navigation size={18} className="me-2 text-danger"/> Tracking Live GPS: {trackUser?.name}</Modal.Title></Modal.Header>
        <Modal.Body className="p-0 bg-light position-relative" style={{ height: '450px' }}>
            {trackUser && (
              <>
                <div className="position-absolute top-0 start-50 translate-middle-x mt-3 z-3"><Badge bg={trackUser.present ? 'success' : 'danger'} className="px-3 py-2 shadow-sm fs-6">{trackUser.present ? 'Inside Safe Zone' : 'Outside Safe Zone'}</Badge></div>
                <MapContainer center={[trackUser.lat, trackUser.lon]} zoom={16} style={{ height: '100%', zIndex: 1 }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[trackUser.lat, trackUser.lon]}><Popup className="fw-bold text-center">{trackUser.name}<br/><span className="text-muted fw-normal">{trackUser.lat.toFixed(4)}, {trackUser.lon.toFixed(4)}</span></Popup></Marker>
                </MapContainer>
              </>
            )}
        </Modal.Body>
      </Modal>

      <Modal show={showNotif} onHide={() => setShowNotif(false)} size="lg" centered><Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Pending Approval</Modal.Title></Modal.Header><Modal.Body className="p-0">{pending.length === 0 ? <div className="p-4 text-center text-muted">No pending approvals.</div> : pending.map(p => (<div key={p.id} className="p-3 border-bottom d-flex justify-content-between align-items-center bg-white"><div><h6 className="mb-0 fw-bold">{p.full_name}</h6><small className="text-muted">{p.personal_email}</small></div><Button variant="danger" size="sm" onClick={() => setSelectedStaff(p)}>REVIEW</Button></div>))}</Modal.Body></Modal>

      <Modal show={!!selectedStaff} onHide={() => setSelectedStaff(null)} size="xl" centered><Modal.Header closeButton className="bg-dark text-white"><Modal.Title className="h6">Reviewing: {selectedStaff?.full_name}</Modal.Title></Modal.Header><Modal.Body className="bg-light p-4"><Row><Col md={4}><Card className="p-3 shadow-sm border-0 mb-3"><p><strong>Phone:</strong> {selectedStaff?.phone_number}</p><p><strong>DOB:</strong> {selectedStaff?.dob}</p><p><strong>Designation:</strong> {selectedStaff?.designation}</p><Button variant="success" className="w-100 fw-bold mt-3" onClick={() => handleVerify(selectedStaff.email)}>APPROVE & ACTIVATE</Button></Card></Col><Col md={8}><Card className="border-0 shadow-sm overflow-hidden" style={{ height: '70vh' }}><iframe src={selectedStaff?.filled_form_path} width="100%" height="100%" title="Verification PDF" /></Card></Col></Row></Modal.Body></Modal>

      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered><Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Onboard New Employee</Modal.Title></Modal.Header><Modal.Body className="p-4"><EmployeeOnboardForm locations={locations} onCancel={() => setShowAddEmp(false)} onSuccess={() => { setShowAddEmp(false); fetchBaseData(); }} /></Modal.Body></Modal>

      <Modal show={editLocModal} onHide={() => setEditLocModal(false)} centered><Modal.Header closeButton><Modal.Title className="h6 fw-bold">Edit Branch Location</Modal.Title></Modal.Header><Modal.Body>{editingLoc && (<Form onSubmit={handleUpdateBranch}><Form.Group className="mb-2"><Form.Label className="small fw-bold">Branch Name</Form.Label><Form.Control size="sm" value={editingLoc.name} onChange={e => setEditingLoc({...editingLoc, name: e.target.value})} required /></Form.Group><Row><Col><Form.Group className="mb-2"><Form.Label className="small fw-bold">Latitude</Form.Label><Form.Control size="sm" value={editingLoc.lat} onChange={e => setEditingLoc({...editingLoc, lat: e.target.value})} required /></Form.Group></Col><Col><Form.Group className="mb-2"><Form.Label className="small fw-bold">Longitude</Form.Label><Form.Control size="sm" value={editingLoc.lon} onChange={e => setEditingLoc({...editingLoc, lon: e.target.value})} required /></Form.Group></Col></Row><Form.Group className="mb-4"><Form.Label className="small fw-bold">Radius (meters)</Form.Label><Form.Control size="sm" type="number" value={editingLoc.radius} onChange={e => setEditingLoc({...editingLoc, radius: e.target.value})} required /></Form.Group><Button type="submit" variant="primary" size="sm" className="w-100 fw-bold">UPDATE BRANCH</Button></Form>)}</Modal.Body></Modal>

      <Modal show={!!photoPreview} onHide={() => setPhotoPreview(null)} centered size="lg"><Modal.Header closeButton className="bg-dark text-white border-0"><Modal.Title className="h6 fw-bold">Geotagged Evidence</Modal.Title></Modal.Header><Modal.Body className="p-0 text-center bg-dark"><img src={photoPreview} alt="Geotagged Visit" style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} /></Modal.Body></Modal>
    </Container>
  );
};
export default AdminDashboard;