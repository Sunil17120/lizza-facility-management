import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, Tabs, Tab } from 'react-bootstrap';
import { UserCog, Building2, MapPin, Trash2, Users, UserCheck, UserX, Save, Search, Plus, Bell, Edit2, Calendar, Download, Image as ImageIcon, FileText, Briefcase, Filter, Eye, CheckCircle, Mail, Phone } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm';
import logoImg from './logo.png';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icons for production builds
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// Helper to create color-coded live tracking icons
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

// CRASH-PROOF JSON PARSER: Filters out nulls and safely handles undefined inputs
const safeParseJSON = (jsonStr) => {
    if (!jsonStr || jsonStr === 'null' || jsonStr === 'undefined') return [];
    try {
        const parsed = JSON.parse(jsonStr);
        const arr = Array.isArray(parsed) ? parsed : (typeof parsed === 'object' && parsed !== null ? [parsed] : []);
        // Remove any nulls that might have snuck into the array
        return arr.filter(item => item !== null && item !== undefined);
    } catch (e) {
        return [];
    }
};

const AdminDashboard = () => {
  // --- CORE STATES ---
  const [mainTab, setMainTab] = useState('overview');
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- VERIFICATION STATES ---
  const [showNotif, setShowNotif] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  // --- UI STATES ---
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', lat: '', lon: '', radius: 200 });
  const [editLocModal, setEditLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [editEmpModal, setEditEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  
  // --- REPORTS STATES ---
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [filterRole, setFilterRole] = useState('all');
  const [filterOfficer, setFilterOfficer] = useState('');
  const [filterSite, setFilterSite] = useState('');
  
  const [fieldReports, setFieldReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  
  const adminEmail = localStorage.getItem('userEmail');

  // --- 1. CORE DATA FETCHING ---
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

  // --- 2. REPORTS DATA FETCHING ---
  const fetchReportsData = useCallback(async () => {
    if (mainTab !== 'reports') return;
    setReportsLoading(true);
    try {
      let url = `/api/admin/reports/monthly-field-visits?month=${reportMonth}&year=${reportYear}`;
      if (filterOfficer) url += `&officer_id=${filterOfficer}`;
      if (filterSite) url += `&location_id=${filterSite}`;
      if (filterRole && filterRole !== 'all') url += `&user_type=${filterRole}`;
      
      const res = await fetch(url);
      if (res.ok) setFieldReports(await res.json());
    } catch (err) { console.error("Report fetch error", err); }
    setReportsLoading(false);
  }, [reportMonth, reportYear, filterOfficer, filterSite, filterRole, mainTab]);

  useEffect(() => { fetchReportsData(); }, [fetchReportsData]);

  // --- ACTIONS: EMPLOYEES ---
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

  const handleEditEmpSave = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/update-employee-inline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEmp)
      });
      if (res.ok) {
        alert('Employee details updated successfully!');
        setEditEmpModal(false);
        setEditingEmp(null);
        setEmpSearchQuery('');
        fetchBaseData();
      } else {
        alert('Failed to update employee details');
      }
    } catch (err) {
      alert('Error updating employee: ' + err.message);
    }
  };

  const filteredEmployeesForSearch = verified.filter(emp =>
    emp.full_name?.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    emp.phone_number?.includes(empSearchQuery) ||
    emp.blockchain_id?.includes(empSearchQuery)
  );

  // --- ACTIONS: BRANCHES ---
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

  // --- EXCEL DOWNLOADER ---
  const downloadExcel = (withPhotos = false) => {
    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"></head><body>
      <table border="1">
        <thead>
          <tr style="background-color: #f2f2f2; font-weight: bold;">
            <th>Date</th><th>Photo Time</th><th>Employee ID</th><th>Employee Name</th><th>Site Name</th>
            <th>Site Entry</th><th>Site Exit</th><th>Total Duration</th>
            <th>Purpose</th><th>Remarks</th>${withPhotos ? '<th>Geotagged Photo</th>' : ''}
          </tr>
        </thead>
        <tbody>
    `;

    fieldReports.forEach(r => {
      const imgTag = r.photo ? `<img src="${r.photo}" width="120" height="120" style="object-fit: contain;" />` : 'No Photo';
      tableHtml += `
        <tr>
          <td>${r.date || 'N/A'}</td>
          <td>${r.time || 'N/A'}</td>
          <td>${r.officer_id || 'N/A'}</td>
          <td>${r.officer_name || 'N/A'}</td>
          <td>${r.site_name || 'N/A'}</td>
          <td>${r.entry_time || 'N/A'}</td>
          <td>${r.exit_time || 'N/A'}</td>
          <td>${r.duration || 'N/A'}</td>
          <td>${r.purpose || 'N/A'}</td>
          <td>${r.remarks || ''}</td>
          ${withPhotos ? `<td style="height: 130px; text-align: center; vertical-align: middle;">${imgTag}</td>` : ''}
        </tr>
      `;
    });

    tableHtml += `</tbody></table></body></html>`;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const employeeSegment = filterOfficer ? `_Employee_${filterOfficer}` : '';
    const siteSegment = filterSite ? `_Site_${filterSite}` : '';
    const roleSegment = filterRole !== 'all' ? `_${filterRole}` : '';
    link.download = `Visits_${reportMonth}_${reportYear}${roleSegment}${siteSegment}${employeeSegment}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAttendanceExcel = async () => {
    try {
      let url = `/api/admin/reports/monthly-attendance?month=${reportMonth}&year=${reportYear}`;
      if (filterOfficer) url += `&user_id=${filterOfficer}`;
      if (filterSite) url += `&location_id=${filterSite}`;
      if (filterRole && filterRole !== 'all') url += `&user_type=${filterRole}`;

      const res = await fetch(url);
      const attendance = await res.json();
      if (!res.ok || attendance.length === 0) {
        return alert('No attendance records found for the selected filters.');
      }

      let tableHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"></head><body>
        <table border="1">
          <thead>
            <tr style="background-color: #f2f2f2; font-weight: bold;">
              <th>Date</th><th>Employee ID</th><th>Employee Name</th><th>Role</th><th>Site</th>
              <th>Check-In</th><th>Check-Out</th><th>Duration</th>
            </tr>
          </thead>
          <tbody>
      `;

      attendance.forEach(r => {
        tableHtml += `
          <tr>
            <td>${r.date || 'N/A'}</td>
            <td>${r.employee_id || 'N/A'}</td>
            <td>${r.employee_name || 'N/A'}</td>
            <td>${r.user_type || 'N/A'}</td>
            <td>${r.site_name || 'N/A'}</td>
            <td>${r.checkin_time || 'N/A'}</td>
            <td>${r.checkout_time || 'N/A'}</td>
            <td>${r.duration || 'N/A'}</td>
          </tr>
        `;
      });

      tableHtml += `</tbody></table></body></html>`;
      const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
      const urlBlob = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = urlBlob;
      const employeeSegment = filterOfficer ? `_Employee_${filterOfficer}` : '';
      const siteSegment = filterSite ? `_Site_${filterSite}` : '';
      const roleSegment = filterRole !== 'all' ? `_${filterRole}` : '';
      link.download = `Attendance_${reportMonth}_${reportYear}${roleSegment}${siteSegment}${employeeSegment}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('Unable to download attendance report.');
    }
  };

  // --- FULL COMPREHENSIVE PDF GENERATOR ---
  const handlePrintProfile = () => {
    const printWindow = window.open('', '_blank');
    
    let docsHtml = '';
    const addDoc = (title, url) => {
        if (url) docsHtml += `<div class="doc-section"><h3 class="doc-title">${title}</h3><img src="${url}" class="doc-img" alt="${title}" /></div>`;
    };
    
    addDoc('Aadhaar / Gov ID', selectedStaff?.aadhar_photo_path);
    addDoc('PAN Card', selectedStaff?.pan_photo_path);
    addDoc('Voter ID', selectedStaff?.voter_photo_path);
    addDoc('Driving Licence', selectedStaff?.dl_photo_path);
    addDoc('Passport', selectedStaff?.passport_photo_path);
    addDoc('Bank Passbook / Cancelled Cheque', selectedStaff?.bank_passbook_path);
    addDoc('Left Hand Fingerprints', selectedStaff?.fingerprints_left_path);
    addDoc('Right Hand Fingerprints', selectedStaff?.fingerprints_right_path);

    // Safely parse and add EXTRA documents
    const extraDocs = safeParseJSON(selectedStaff?.extra_documents_json);
    extraDocs.forEach(doc => {
      if (doc?.path) addDoc(doc?.title || 'Additional Document', doc.path);
    });

    const kycStatusHtml = selectedStaff?.kyc_mode !== 'without_aadhaar' 
        ? '<span style="color: #198754; font-weight: bold;">✅ Aadhaar Verified (Digital e-KYC)</span>' 
        : '<span style="color: #dc3545; font-weight: bold;">⚠️ Manual Verification (No e-KYC)</span>';

    const eduData = safeParseJSON(selectedStaff?.education_json);
    let eduHtml = eduData.length > 0 && eduData[0]?.qualification
        ? `<table><tr><th>Qualification</th><th>Institute</th><th>Year</th><th>Marks</th></tr>` + eduData.map(e => `<tr><td>${e?.qualification||'-'}</td><td>${e?.institute||'-'}</td><td>${e?.year||'-'}</td><td>${e?.marks||'-'}</td></tr>`).join('') + `</table>` 
        : '<p class="text-muted">No education history provided.</p>';

    const expData = safeParseJSON(selectedStaff?.experience_json);
    let expHtml = expData.length > 0 && expData[0]?.company
        ? `<table><tr><th>Company Name</th><th>Designation</th><th>Period</th></tr>` + expData.map(e => `<tr><td>${e?.company||'-'}</td><td>${e?.designation||'-'}</td><td>${e?.period||'-'}</td></tr>`).join('') + `</table>`
        : '<p class="text-muted">No prior work experience provided.</p>';

    const famData = safeParseJSON(selectedStaff?.family_json);
    let famHtml = famData.length > 0 && famData[0]?.name
        ? `<table><tr><th>Name</th><th>Relationship</th><th>DOB</th></tr>` + famData.map(f => `<tr><td>${f?.name||'-'}</td><td>${f?.relation||'-'}</td><td>${f?.dob||'-'}</td></tr>`).join('') + `</table>`
        : '<p class="text-muted">No family details provided.</p>';

    printWindow.document.write(`
        <html><head><title>Dossier_${selectedStaff?.full_name || 'Employee'}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 30px; color: #333; max-width: 900px; margin: auto; font-size: 14px; }
            .logo-header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #e31e24; padding-bottom: 15px; }
            .logo-header img { height: 50px; vertical-align: middle; margin-right: 15px; }
            .logo-header .company-name { font-size: 18px; font-weight: bold; color: #e31e24; vertical-align: middle; display: inline-block; }
            h2 { text-align: center; border-bottom: 3px solid #0d6efd; padding-bottom: 10px; margin-bottom: 20px; color: #0d6efd; text-transform: uppercase;}
            .flex-row { display: flex; justify-content: space-between; align-items: flex-start; }
            .photo { width: 140px; height: 140px; border-radius: 8px; object-fit: cover; border: 2px solid #0d6efd; }
            .details { flex-grow: 1; padding-left: 25px; }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; margin-bottom: 15px; }
            td, th { padding: 8px 12px; border: 1px solid #dee2e6; text-align: left; }
            th { background-color: #f8f9fa; color: #495057; font-weight: bold; width: 25%; }
            .section-header { margin-top: 30px; border-bottom: 2px solid #ccc; padding-bottom: 5px; color: #333; font-size: 16px; text-transform: uppercase; }
            .doc-section { margin-top: 30px; text-align: center; page-break-inside: avoid; }
            .doc-title { font-size: 14px; color: #555; margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px dashed #eee; padding-bottom: 5px; }
            .doc-img { max-width: 100%; max-height: 450px; border: 1px solid #ccc; border-radius: 4px; padding: 5px; object-fit: contain; }
            .text-muted { color: #6c757d; font-style: italic; }
            @media print {
                .doc-section, table { page-break-inside: avoid; }
                body { padding: 0; }
                .no-print { display: none; }
            }
          </style>
        </head><body>
          <div class="logo-header">
            <img src="${logoImg}" alt="Company Logo" />
            <span class="company-name">LIZZA FACILITY MANAGEMENT</span>
          </div>
          <h2>Official Employee Dossier</h2>
          
          <h3 class="section-header" style="margin-top:0;">1. Identity & Employment Status</h3>
          <div class="flex-row">
            <div><img src="${selectedStaff?.profile_photo_path || 'https://via.placeholder.com/150'}" class="photo" alt="Profile" /></div>
            <div class="details">
              <table>
                <tr><th>Full Name</th><td style="font-weight: bold; font-size: 16px;">${selectedStaff?.full_name || 'N/A'}</td></tr>
                <tr><th>System Role</th><td style="text-transform: uppercase; font-weight:bold;">${selectedStaff?.user_type || 'N/A'}</td></tr>
                <tr><th>Assigned Dept/Site</th><td>${selectedStaff?.department || 'N/A'} - ${selectedStaff?.unit_name || 'Dynamic'}</td></tr>
                <tr><th>Designation</th><td>${selectedStaff?.designation || 'N/A'}</td></tr>
                <tr><th>Primary Mobile</th><td>${selectedStaff?.phone_number || 'N/A'}</td></tr>
                <tr><th>Personal Email</th><td>${selectedStaff?.personal_email || 'N/A'}</td></tr>
                <tr><th>KYC Authenticity</th><td>${kycStatusHtml}</td></tr>
              </table>
            </div>
          </div>

          <h3 class="section-header">2. Demographics & Medical</h3>
          <table>
            <tr><th>Date of Birth</th><td>${selectedStaff?.dob || 'N/A'}</td><th>Blood Group</th><td style="color:#dc3545; font-weight:bold;">${selectedStaff?.blood_group || 'N/A'}</td></tr>
            <tr><th>Gender</th><td>${selectedStaff?.gender || 'N/A'}</td><th>Height (cm)</th><td>${selectedStaff?.height || 'N/A'}</td></tr>
            <tr><th>Marital Status</th><td>${selectedStaff?.marital_status || 'N/A'}</td><th>Nationality</th><td>${selectedStaff?.nationality || 'N/A'}</td></tr>
            <tr><th>Father's Name</th><td>${selectedStaff?.father_name || 'N/A'}</td><th>Religion</th><td>${selectedStaff?.religion || 'N/A'}</td></tr>
            <tr><th>Mother's Name</th><td>${selectedStaff?.mother_name || 'N/A'}</td><th>Category/Caste</th><td>${selectedStaff?.category || '-'} / ${selectedStaff?.caste || '-'}</td></tr>
            <tr><th>Identity Mark</th><td colspan="3">${selectedStaff?.identity_mark || 'None'}</td></tr>
            <tr><th>Medical Remarks</th><td colspan="3">${selectedStaff?.medical_remarks || 'None'}</td></tr>
          </table>

          <h3 class="section-header">3. Address Information</h3>
          <table>
            <tr><th colspan="2" style="text-align:center; background-color:#e9ecef;">Permanent Address</th><th colspan="2" style="text-align:center; background-color:#e9ecef;">Temporary Address</th></tr>
            <tr>
                <th style="width:15%;">Address</th><td style="width:35%;">${selectedStaff?.perm_address || 'N/A'}</td>
                <th style="width:15%;">Address</th><td style="width:35%;">${selectedStaff?.temp_address || 'N/A'}</td>
            </tr>
            <tr>
                <th>State & PIN</th><td>${selectedStaff?.perm_state || 'N/A'} - ${selectedStaff?.perm_pin || ''}</td>
                <th>State & PIN</th><td>${selectedStaff?.temp_state || 'N/A'} - ${selectedStaff?.temp_pin || ''}</td>
            </tr>
            <tr>
                <th>Alt. Contact</th><td>${selectedStaff?.perm_mobile || 'N/A'}</td>
                <th>Local Contact</th><td>${selectedStaff?.temp_mobile || 'N/A'}</td>
            </tr>
          </table>

          <h3 class="section-header">4. Financial Details</h3>
          <table>
            <tr><th>Bank Name</th><td>${selectedStaff?.bank_name || 'N/A'}</td><th>IFSC Code</th><td>${selectedStaff?.ifsc_code || 'N/A'}</td></tr>
            <tr><th>Account Number</th><td colspan="3" style="font-weight:bold;">${selectedStaff?.account_number_enc ? "[ENCRYPTED IN DATABASE - SEE PASSBOOK PHOTO]" : "N/A"}</td></tr>
          </table>

          <h3 class="section-header">5. Education History</h3>
          ${eduHtml}

          <h3 class="section-header">6. Prior Work Experience</h3>
          ${expHtml}

          <h3 class="section-header">7. Family Details</h3>
          ${famHtml}

          <div style="page-break-before: always;"></div>
          <h3 class="section-header" style="text-align:center; background-color:#333; color:white; padding:10px;">APPENDIX: OFFICIAL DOCUMENTS & EVIDENCE</h3>
          ${docsHtml || '<p style="text-align: center; color: #777;">No documents uploaded to this profile.</p>'}
          
          <script>
            // We wait 1.5 seconds to ensure all images load before triggering print
            window.onload = function() {
                setTimeout(() => { window.print(); window.close(); }, 1500);
            };
          </script>
        </body></html>
    `);
    printWindow.document.close();
  };

  // --- DATA PROCESSING ---
  const pending = employees.filter(e => !e?.is_verified && e?.user_type !== 'admin');
  const verified = employees.filter(e => e?.is_verified);
  const reportPersonnel = verified.filter(e => {
    if (filterRole === 'all') return ['field_officer', 'employee'].includes(e?.user_type);
    return e?.user_type === filterRole;
  });
  const fieldOfficers = verified.filter(e => e?.user_type === 'field_officer');
  
  const groupedReports = fieldReports.reduce((acc, visit) => {
    if (!visit?.date) return acc;
    if (!acc[visit.date]) acc[visit.date] = [];
    acc[visit.date].push(visit);
    return acc;
  }, {});

  const managerStats = verified.filter(e => e?.user_type === 'manager').map(mgr => {
    const teamSize = verified.filter(emp => emp?.manager_id === mgr?.id).length;
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
          
          <Row className="mb-4 text-center">
            <Col md={4}><Card className="p-3 shadow-sm border-0"><div className="text-muted small">TOTAL STAFF</div><h4 className="fw-bold"><Users size={20} className="me-2"/>{employees.length}</h4></Card></Col>
            <Col md={4}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-primary">VERIFIED EMPLOYEES</div><h4 className="fw-bold text-primary"><UserCheck size={20} className="me-2"/>{verified.length}</h4></Card></Col>
            <Col md={4}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-success">ASSIGNED SITES</div><h4 className="fw-bold text-success"><MapPin size={20} className="me-2"/>{locations.length}</h4></Card></Col>
          </Row>

          <Row>
            {/* Branch Management Sidebar */}
            <Col md={4}>
              <Card className="border-0 shadow-sm p-3 mb-4">
                <h6 className="fw-bold mb-3"><Building2 size={18} className="me-2 text-danger"/>Office Branches</h6>
                <Button variant="info" size="sm" className="w-100 mb-3 fw-bold d-flex align-items-center justify-content-center" onClick={() => { setEditingEmp(null); setEmpSearchQuery(''); setEditEmpModal(true); }}>
                  <Edit2 size={16} className="me-2"/> Edit Employee Details
                </Button>
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

            {/* Live Map */}
            <Col md={8}>
              <Card className="border-0 shadow-sm overflow-hidden mb-4" style={{ height: '380px' }}>
                <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  
                  {liveLocations.map(loc => (loc?.lat && loc?.lon) && (
                    <Marker 
                        key={loc.email} 
                        position={[loc.lat, loc.lon]}
                        icon={getStatusIcon(loc.present)}
                    >
                      <Popup>
                        <div className="text-center">
                            <strong className="d-block">{loc.name || 'Unknown'}</strong>
                            <Badge bg={loc.present ? "success" : "danger"} className="mt-1">
                                {loc.present ? "In Geofence" : "Outside"}
                            </Badge>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  
                  {locations.map(office => (
                    <Circle key={office.id} center={[office.lat, office.lon]} radius={office.radius || 200} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.1 }}>
                      <Popup>{office.name} Geofence ({office.radius || 200}m)</Popup>
                    </Circle>
                  ))}
                </MapContainer>
              </Card>
            </Col>
          </Row>

          {/* Employee Directory */}
          <Card className="border-0 shadow-sm">
            <Table responsive hover className="align-middle mb-0 small">
              <thead className="table-light text-uppercase">
                <tr><th>Full Name</th><th>Email</th><th>Branch</th><th>Manager</th><th>Shift & Role</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {verified.map(emp => (
                  <tr key={emp.id}>
                    <td><div className="fw-bold">{emp.full_name || 'N/A'}</div><Badge bg="light" text="dark">{emp.blockchain_id || 'Pending'}</Badge></td>
                    <td className="text-muted">{emp.email || 'N/A'}</td>
                    
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
                        {employees.filter(m => m?.user_type === 'manager').map(mgr => (
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
                        <Form.Select size="sm" value={emp.user_type || 'employee'} onChange={e => {
                            const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                            if (target) { target.user_type = e.target.value; setEmployees(updated); }
                        }}>
                            <option value="employee">Employee</option>
                            <option value="field_officer">Field Officer</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                        </Form.Select>
                    </td>

                    <td>
                        <div className="d-flex gap-1">
                            <Button variant="info" size="sm" onClick={() => setSelectedStaff(emp)} title="View Full Profile"><Eye size={14}/></Button>
                            <Button variant="primary" size="sm" onClick={() => { setEditingEmp({...emp}); setEditEmpModal(true); }} title="Edit Details"><Edit2 size={14}/></Button>
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
              <Form.Select size="sm" value={reportMonth} onChange={e => setReportMonth(parseInt(e.target.value, 10))} style={{width: '130px'}}>
                {[...Array(12)].map((_, i) => (
                  <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('en', { month: 'long' })}</option>
                ))}
              </Form.Select>
              <Form.Select size="sm" value={reportYear} onChange={e => setReportYear(parseInt(e.target.value, 10))} style={{width: '90px'}}>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </Form.Select>
            </div>

            <div className="d-flex gap-2 align-items-center border-start ps-4 flex-wrap">
              <span className="small fw-bold text-muted text-uppercase">Specific Data:</span>
              <Form.Select size="sm" value={filterRole} onChange={e => { setFilterRole(e.target.value); setFilterOfficer(''); }} style={{width: '170px'}}>
                <option value="all">All Employees</option>
                <option value="field_officer">Field Officers</option>
                <option value="employee">Normal Employees</option>
              </Form.Select>
              <div style={{width: '200px'}} className="position-relative">
                <Search size={16} className="position-absolute" style={{top: '8px', left: '10px', color: '#999', pointerEvents: 'none'}} />
                <Form.Control
                  size="sm"
                  type="text"
                  placeholder="Search employee..."
                  value={filterOfficer}
                  onChange={e => setFilterOfficer(e.target.value)}
                  style={{paddingLeft: '32px'}}
                />
              </div>
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
                             <td className="fw-bold">{mgr.full_name || 'N/A'}</td>
                             <td><Badge bg="secondary">{mgr.department || 'General'}</Badge></td>
                             <td><h5 className="m-0 fw-bold">{mgr.teamSize || 0} <Users size={16} className="ms-1 text-muted"/></h5></td>
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
                  <div className="d-flex gap-2 flex-wrap">
                    <Button variant="light" size="sm" className="fw-bold text-dark d-flex align-items-center" onClick={() => downloadExcel(false)} disabled={fieldReports.length === 0}>
                      <Download size={14} className="me-2 text-success"/> Download Visits Excel
                    </Button>
                    <Button variant="outline-light" size="sm" className="fw-bold text-dark d-flex align-items-center" onClick={() => downloadExcel(true)} disabled={fieldReports.length === 0}>
                      <Download size={14} className="me-2 text-success"/> Download Visits Excel (With Photos)
                    </Button>
                    <Button variant="warning" size="sm" className="fw-bold text-dark d-flex align-items-center" onClick={downloadAttendanceExcel}>
                      <Download size={14} className="me-2 text-dark"/> Download Attendance Excel
                    </Button>
                  </div>
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
                                      <td className="fw-bold text-nowrap">{visit.time || 'N/A'}</td>
                                      <td><span className="text-muted d-block" style={{fontSize:'0.7rem'}}>{visit.officer_id || 'N/A'}</span>{visit.officer_name || 'N/A'}</td>
                                      <td><MapPin size={12} className="me-1 text-danger"/>{visit.site_name || 'N/A'}</td>
                                      <td className="text-success fw-bold text-nowrap">{visit.entry_time || 'N/A'}</td>
                                      <td className={visit.exit_time === 'Active' ? 'text-primary fw-bold text-nowrap' : 'text-danger fw-bold text-nowrap'}>{visit.exit_time || 'N/A'}</td>
                                      <td>
                                        <Badge bg={visit.duration === 'In Progress' ? 'primary' : 'secondary'} className="text-nowrap">{visit.duration || 'N/A'}</Badge>
                                      </td>
                                      <td><Badge bg="dark">{visit.purpose || 'N/A'}</Badge></td>
                                      <td style={{ maxWidth: '200px' }} className="text-truncate" title={visit.remarks}>{visit.remarks || '-'}</td>
                                      <td>
                                        <Button variant="outline-secondary" size="sm" onClick={() => setPhotoPreview(visit.photo)} disabled={!visit.photo}>
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
              <div>
                <h6 className="mb-0 fw-bold">{p?.full_name || 'N/A'}</h6>
                <small className="text-muted">{p?.personal_email || 'N/A'}</small>
                {p?.kyc_mode !== 'without_aadhaar' && <Badge bg="success" className="ms-2" style={{fontSize:'0.65rem'}}>Aadhaar Verified</Badge>}
              </div>
              <Button variant="danger" size="sm" onClick={() => { setSelectedStaff(p); setShowNotif(false); }}>REVIEW</Button>
            </div>
          ))}
        </Modal.Body>
      </Modal>

      {/* COMPREHENSIVE EMPLOYEE PROFILE MODAL */}
      <Modal show={!!selectedStaff} onHide={() => setSelectedStaff(null)} size="xl" centered>
        <Modal.Header closeButton className="bg-dark text-white d-flex justify-content-between align-items-center w-100">
          <Modal.Title className="h6 mb-0">Employee Profile: {selectedStaff?.full_name || 'Unknown'}</Modal.Title>
          <Button variant="outline-light" size="sm" className="fw-bold ms-auto me-3 d-flex align-items-center" onClick={handlePrintProfile}>
            <FileText size={16} className="me-2"/> Download Complete Dossier (PDF)
          </Button>
        </Modal.Header>
        
        <Modal.Body className="bg-light p-4">
          <Row>
            {/* Left Sidebar Profile Info */}
            <Col md={3}>
              <Card className="p-3 shadow-sm border-0 mb-3 text-center">
                <img src={selectedStaff?.profile_photo_path || "https://via.placeholder.com/150"} alt="Profile" className="img-fluid rounded-circle mb-3 mx-auto" style={{width: '130px', height: '130px', objectFit: 'cover', border: '3px solid #0d6efd'}} />
                <h5 className="fw-bold mb-1">{selectedStaff?.full_name || 'N/A'}</h5>
                <Badge bg="primary" className="mb-3">{selectedStaff?.designation || 'N/A'}</Badge>
                
                <div className="text-start small mb-4">
                    <p className="mb-1"><strong className="text-muted">Phone:</strong> {selectedStaff?.phone_number || 'N/A'}</p>
                    <p className="mb-1"><strong className="text-muted">DOB:</strong> {selectedStaff?.dob || 'N/A'}</p>
                    <p className="mb-1"><strong className="text-muted">Email:</strong> {selectedStaff?.personal_email || 'N/A'}</p>
                    <p className="mb-1"><strong className="text-muted">Blood:</strong> <Badge bg="danger">{selectedStaff?.blood_group || 'N/A'}</Badge></p>
                </div>
                
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
                            <Col sm={4} className="mb-3"><small className="text-muted d-block text-uppercase fw-bold">System Role</small><Badge bg="dark">{selectedStaff?.user_type || 'N/A'}</Badge></Col>
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
                                    <tr key={i}><td>{edu?.qualification || '-'}</td><td>{edu?.institute || '-'}</td><td>{edu?.year || '-'}</td><td>{edu?.marks || '-'}</td></tr>
                                ))}
                            </tbody>
                        </Table>

                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Work Experience</h6>
                        <Table size="sm" bordered hover className="mb-4 small">
                            <thead className="table-light"><tr><th>Company</th><th>Designation</th><th>Period</th></tr></thead>
                            <tbody>
                                {safeParseJSON(selectedStaff?.experience_json).map((exp, i) => (
                                    <tr key={i}><td>{exp?.company || '-'}</td><td>{exp?.designation || '-'}</td><td>{exp?.period || '-'}</td></tr>
                                ))}
                            </tbody>
                        </Table>

                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary">Family Details</h6>
                        <Table size="sm" bordered hover className="mb-0 small">
                            <thead className="table-light"><tr><th>Name</th><th>Relation</th><th>DOB</th></tr></thead>
                            <tbody>
                                {safeParseJSON(selectedStaff?.family_json).map((fam, i) => (
                                    <tr key={i}><td>{fam?.name || '-'}</td><td>{fam?.relation || '-'}</td><td>{fam?.dob || '-'}</td></tr>
                                ))}
                            </tbody>
                        </Table>
                    </Tab>

                    {/* TAB: DOCUMENTS & KYC */}
                    <Tab eventKey="documents" title="KYC Documents">
                        <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary mt-2">Government IDs & KYC</h6>
                        <Row className="mb-4">
                            <Col sm={6} className="mb-3">
                                <small className="text-muted d-block text-uppercase fw-bold">Gov ID (UID)</small>
                                <span className={selectedStaff?.aadhar_enc ? "text-danger fw-bold" : "text-muted"}>
                                    {selectedStaff?.aadhar_enc ? "[Aadhaar Redacted]" : "N/A"}
                                </span>
                                {selectedStaff?.kyc_mode !== 'without_aadhaar' && selectedStaff?.aadhar_enc && (
                                    <Badge bg="success" className="ms-2"><CheckCircle size={12} className="me-1 mb-1"/> Aadhaar Verified (e-KYC)</Badge>
                                )}
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
                            
                            {/* NEW: EXTRA DOCUMENTS RENDERER */}
                            {safeParseJSON(selectedStaff?.extra_documents_json).map((doc, idx) => (
                                doc?.path && (
                                    <Col md={6} className="mb-3 text-center" key={idx}>
                                        <small className="text-muted fw-bold d-block mb-1">{doc?.title || 'Additional Document'}</small>
                                        <img src={doc.path} alt={doc?.title || 'Doc'} className="img-thumbnail" style={{maxHeight: '180px'}} />
                                    </Col>
                                )
                            ))}

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
                      <Form.Group className="mb-2"><Form.Label className="small fw-bold">Branch Name</Form.Label><Form.Control size="sm" value={editingLoc?.name || ''} onChange={e => setEditingLoc({...editingLoc, name: e.target.value})} required /></Form.Group>
                      <Row>
                          <Col><Form.Group className="mb-2"><Form.Label className="small fw-bold">Latitude</Form.Label><Form.Control size="sm" value={editingLoc?.lat || ''} onChange={e => setEditingLoc({...editingLoc, lat: e.target.value})} required /></Form.Group></Col>
                          <Col><Form.Group className="mb-2"><Form.Label className="small fw-bold">Longitude</Form.Label><Form.Control size="sm" value={editingLoc?.lon || ''} onChange={e => setEditingLoc({...editingLoc, lon: e.target.value})} required /></Form.Group></Col>
                      </Row>
                      <Form.Group className="mb-4"><Form.Label className="small fw-bold">Radius (meters)</Form.Label><Form.Control size="sm" type="number" value={editingLoc?.radius || 200} onChange={e => setEditingLoc({...editingLoc, radius: e.target.value})} required /></Form.Group>
                      <Button type="submit" variant="primary" size="sm" className="w-100 fw-bold">UPDATE BRANCH</Button>
                  </Form>
              )}
          </Modal.Body>
      </Modal>

      {/* Edit Employee Details Modal */}
      <Modal show={editEmpModal} onHide={() => setEditEmpModal(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-info text-white"><Modal.Title className="h6 fw-bold"><Edit2 className="me-2" size={18}/>Edit Employee Details</Modal.Title></Modal.Header>
        <Modal.Body className="p-4">
          {!editingEmp ? (
            <>
              <h6 className="fw-bold mb-3">Search Employee</h6>
              <div className="position-relative mb-3">
                <Search size={18} className="position-absolute" style={{top: '10px', left: '12px', color: '#999'}} />
                <Form.Control
                  type="text"
                  placeholder="Search by name, email, phone, or ID..."
                  value={empSearchQuery}
                  onChange={e => setEmpSearchQuery(e.target.value)}
                  style={{paddingLeft: '40px'}}
                />
              </div>
              
              <div style={{maxHeight: '300px', overflowY: 'auto'}}>
                {filteredEmployeesForSearch.length === 0 ? (
                  <div className="text-center text-muted py-5">No employees found. Try different search terms.</div>
                ) : (
                  filteredEmployeesForSearch.map(emp => (
                    <Card key={emp.id} className="mb-2 border cursor-pointer" style={{cursor: 'pointer'}}>
                      <Card.Body className="p-3 d-flex justify-content-between align-items-center" onClick={() => { setEditingEmp({...emp}); setEmpSearchQuery(''); }}>
                        <div>
                          <h6 className="mb-0 fw-bold">{emp.full_name}</h6>
                          <small className="text-muted">{emp.email}</small><br/>
                          <small className="text-muted"><Phone size={12} className="me-1"/>{emp.phone_number || 'N/A'}</small>
                        </div>
                        <Badge bg="secondary">{emp.user_type}</Badge>
                      </Card.Body>
                    </Card>
                  ))
                )}
              </div>
            </>
          ) : (
            <Form onSubmit={handleEditEmpSave}>
              <div className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
                <h6 className="mb-0 fw-bold">{editingEmp.full_name}</h6>
                <Button variant="light" size="sm" onClick={() => { setEditingEmp(null); setEmpSearchQuery(''); }}>← Back to Search</Button>
              </div>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Full Name</Form.Label>
                    <Form.Control size="sm" value={editingEmp.full_name || ''} onChange={e => setEditingEmp({...editingEmp, full_name: e.target.value})} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Email</Form.Label>
                    <Form.Control size="sm" type="email" value={editingEmp.email || ''} onChange={e => setEditingEmp({...editingEmp, email: e.target.value})} />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Phone Number</Form.Label>
                    <Form.Control size="sm" value={editingEmp.phone_number || ''} onChange={e => setEditingEmp({...editingEmp, phone_number: e.target.value})} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Designation</Form.Label>
                    <Form.Control size="sm" value={editingEmp.designation || ''} onChange={e => setEditingEmp({...editingEmp, designation: e.target.value})} />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Department</Form.Label>
                    <Form.Control size="sm" value={editingEmp.department || ''} onChange={e => setEditingEmp({...editingEmp, department: e.target.value})} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">User Type</Form.Label>
                    <Form.Select size="sm" value={editingEmp.user_type || 'employee'} onChange={e => setEditingEmp({...editingEmp, user_type: e.target.value})}>
                      <option value="employee">Employee</option>
                      <option value="field_officer">Field Officer</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Personal Email</Form.Label>
                    <Form.Control size="sm" type="email" value={editingEmp.personal_email || ''} onChange={e => setEditingEmp({...editingEmp, personal_email: e.target.value})} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Date of Birth</Form.Label>
                    <Form.Control size="sm" type="date" value={editingEmp.dob || ''} onChange={e => setEditingEmp({...editingEmp, dob: e.target.value})} />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Assigned Site</Form.Label>
                    <Form.Select size="sm" value={editingEmp.location_id || ''} onChange={e => setEditingEmp({...editingEmp, location_id: e.target.value ? parseInt(e.target.value) : null})}>
                      <option value="">Select Site</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Assigned Manager</Form.Label>
                    <Form.Select size="sm" value={editingEmp.manager_id || ''} onChange={e => setEditingEmp({...editingEmp, manager_id: e.target.value ? parseInt(e.target.value) : null})}>
                      <option value="">No Manager</option>
                      {employees.filter(m => m?.user_type === 'manager').map(mgr => (
                        <option key={mgr.id} value={mgr.id}>{mgr.full_name}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Shift Start</Form.Label>
                    <Form.Control size="sm" type="time" value={editingEmp.shift_start || ''} onChange={e => setEditingEmp({...editingEmp, shift_start: e.target.value})} disabled={editingEmp.user_type === 'field_officer'} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Shift End</Form.Label>
                    <Form.Control size="sm" type="time" value={editingEmp.shift_end || ''} onChange={e => setEditingEmp({...editingEmp, shift_end: e.target.value})} disabled={editingEmp.user_type === 'field_officer'} />
                  </Form.Group>
                </Col>
              </Row>

              <div className="d-flex gap-2">
                <Button type="submit" variant="success" className="fw-bold flex-fill"><Save size={16} className="me-2"/>Save Changes</Button>
                <Button variant="light" onClick={() => { setEditingEmp(null); setEmpSearchQuery(''); }} className="fw-bold">Cancel</Button>
              </div>
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