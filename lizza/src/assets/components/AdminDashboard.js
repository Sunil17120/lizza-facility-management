import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, Tabs, Tab, Alert } from 'react-bootstrap';
import { UserCog, Building2, MapPin, Trash2, Users, UserCheck, Save, Search, Plus, Bell, Edit2, Calendar, Download, Image as ImageIcon, FileText, Briefcase, Filter, Eye, CheckCircle, Phone, Crosshair, ShieldAlert, Navigation, Map as MapIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm';
import ShiftRouteMap from './ShiftRouteMap';
import logoImg from './logo.png';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

function MapUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom, { animate: true, duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
}

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

const safeParseJSON = (jsonStr) => {
    if (!jsonStr || jsonStr === 'null' || jsonStr === 'undefined') return [];
    const parsed = JSON.parse(jsonStr);
    const arr = Array.isArray(parsed) ? parsed : (typeof parsed === 'object' && parsed !== null ? [parsed] : []);
    return arr.filter(item => item !== null && item !== undefined);
};

const parseReferencesJSON = (jsonStr) => {
    if (!jsonStr || jsonStr === 'null' || jsonStr === 'undefined') return [];
    try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
            return parsed.filter(item => item && item.name && (item.contact || item.phone || item.mobile));
        }
        if (typeof parsed === 'object' && parsed !== null) {
            return Object.values(parsed)
                .filter(item => item && item.name && (item.contact || item.phone || item.mobile || item.relationship || item.relation));
        }
        return [];
    } catch (e) {
        return [];
    }
};

const API_BASE_URL = 'https://lizza-facility-management.vercel.app';

const AdminDashboard = () => {
  const [mainTab, setMainTab] = useState('overview');
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [mapCenter, setMapCenter] = useState([22.5726, 88.3639]); 
  const [mapZoom, setMapZoom] = useState(5);
  const [mapSiteSearch, setMapSiteSearch] = useState('');
  const [mapEmpSearch, setMapEmpSearch] = useState('');

  const [showNotif, setShowNotif] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', lat: '', lon: '', radius: 200 });
  const [editLocModal, setEditLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [editEmpModal, setEditEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [editEmpTab, setEditEmpTab] = useState('profile');
  
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [reportOfficerSearch, setReportOfficerSearch] = useState('');
  const [showReportSuggestions, setShowReportSuggestions] = useState(false);
  const [filterSite, setFilterSite] = useState('');
  const [reportsSubTab, setReportsSubTab] = useState('site-visits');
  
  const [fieldReports, setFieldReports] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [routeViewerUserId, setRouteViewerUserId] = useState(null);
  const [routeViewerName, setRouteViewerName] = useState("");
  
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  
  const adminEmail = localStorage.getItem('userEmail');

  const pending = employees.filter(e => !e?.is_verified && e?.user_type !== 'admin');
  const verified = employees.filter(e => e?.is_verified);
  
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

  const fetchBaseData = useCallback(async () => {
      const [empRes, locRes, liveRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/employees?admin_email=${adminEmail}`),
        fetch(`${API_BASE_URL}/api/admin/locations`),
        fetch(`${API_BASE_URL}/api/admin/live-tracking?admin_email=${adminEmail}`)
      ]);
      if (empRes.ok && locRes.ok) {
        setEmployees(await empRes.json());
        setLocations(await locRes.json());
        if (liveRes.ok) setLiveLocations(await liveRes.json());
      }
      setLoading(false);
  }, [adminEmail]);

  useEffect(() => { fetchBaseData(); }, [adminEmail]);

  useEffect(() => {
    if (mainTab !== 'overview' || !autoRefreshEnabled) return;
    const interval = setInterval(async () => {
        const res = await fetch(`${API_BASE_URL}/api/admin/live-tracking?admin_email=${adminEmail}`);
        if (res.ok) setLiveLocations(await res.json());
    }, 15000); 
    return () => clearInterval(interval);
  }, [mainTab, autoRefreshEnabled, adminEmail]);

  const fetchReportsData = useCallback(async () => {
    if (mainTab !== 'reports') return;
    setReportsLoading(true);
      let url = `${API_BASE_URL}/api/admin/reports/monthly-field-visits?month=${reportMonth}&year=${reportYear}`;
      
      if (reportOfficerSearch && employees.length > 0) {
        const matchedOfficer = employees.find(o => 
          o.is_verified &&
          (filterRole === 'all' ? ['field_officer', 'employee'].includes(o?.user_type) : o?.user_type === filterRole) &&
          (o.full_name?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
           o.email?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
           o.blockchain_id?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
           o.phone_number?.includes(reportOfficerSearch))
        );
        if (matchedOfficer) url += `&officer_id=${matchedOfficer.id}`;
      }
      
      if (filterSite) url += `&location_id=${filterSite}`;
      if (filterRole && filterRole !== 'all') url += `&user_type=${filterRole}`;
      
      const res = await fetch(url);
      if (res.ok) setFieldReports(await res.json());
    setReportsLoading(false);
  }, [reportMonth, reportYear, reportOfficerSearch, filterSite, filterRole, mainTab, employees]);

  useEffect(() => { fetchReportsData(); }, [fetchReportsData]);

  const fetchAttendanceData = useCallback(async () => {
    if (mainTab !== 'reports') return;
    setAttendanceLoading(true);
      let url = `${API_BASE_URL}/api/admin/reports/monthly-attendance?month=${reportMonth}&year=${reportYear}`;
      if (reportStartDate) url += `&start_date=${encodeURIComponent(reportStartDate)}`;
      if (reportEndDate) url += `&end_date=${encodeURIComponent(reportEndDate)}`;
      if (reportOfficerSearch && employees.length > 0) {
        const matchedOfficer = employees.find(o => 
          o.is_verified &&
          (filterRole === 'all' ? ['field_officer', 'employee'].includes(o?.user_type) : o?.user_type === filterRole) &&
          (o.full_name?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
           o.email?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
           o.blockchain_id?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
           o.phone_number?.includes(reportOfficerSearch))
        );
        if (matchedOfficer) url += `&user_id=${matchedOfficer.id}`;
      }
      if (filterSite) url += `&location_id=${filterSite}`;
      if (filterRole && filterRole !== 'all') url += `&user_type=${filterRole}`;

      const res = await fetch(url);
      if (res.ok) {
          setAttendanceRecords(await res.json());
      } else {
          setAttendanceRecords([]);
      }
    setAttendanceLoading(false);
  }, [reportMonth, reportYear, reportStartDate, reportEndDate, reportOfficerSearch, filterSite, filterRole, mainTab, employees]);

  useEffect(() => {
    if (mainTab !== 'reports') return;
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  useEffect(() => {
    if (mainTab !== 'reports' || !autoRefreshEnabled) return;
    
    const refreshInterval = setInterval(() => {
      if (reportsSubTab === 'attendance') fetchAttendanceData();
      if (reportsSubTab === 'site-visits') fetchReportsData();
    }, 10000); 
    
    return () => clearInterval(refreshInterval);
  }, [fetchAttendanceData, fetchReportsData, mainTab, reportsSubTab, autoRefreshEnabled]);

  const handleVerify = async (email) => {
      const res = await fetch(`${API_BASE_URL}/api/admin/verify-employee?target_email=${email}&admin_email=${adminEmail}`, { method: 'POST' });
      if (res.ok) { alert("Verified!"); setSelectedStaff(null); fetchBaseData(); }
  };

  const handleInlineSave = async (emp) => {
    const res = await fetch(`${API_BASE_URL}/api/admin/update-employee-inline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp)
    });
    if (res.ok) alert("Settings saved for " + emp.full_name);
  };

  const handleDeleteEmp = async (id) => {
    if(window.confirm("Permanently delete this employee?")) {
        await fetch(`${API_BASE_URL}/api/admin/delete-employee/${id}`, { method: 'DELETE' });
        fetchBaseData();
    }
  };

  const handleDeleteVisit = async (id) => {
    if (window.confirm('Permanently delete this visit record?')) {
      await fetch(`${API_BASE_URL}/api/admin/delete-visit/${id}`, { method: 'DELETE' });
      fetchReportsData();
    }
  };

  const handleDeleteAttendance = async (id) => {
    if (window.confirm('Permanently delete this attendance record?')) {
      await fetch(`${API_BASE_URL}/api/admin/delete-attendance/${id}`, { method: 'DELETE' });
      fetchAttendanceData();
    }
  };

  const handleEditEmpSave = async (e) => {
    e.preventDefault();
      const res = await fetch(`${API_BASE_URL}/api/admin/update-employee-inline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEmp)
      });
      if (res.ok) {
        alert('Employee details updated successfully!');
        setEditEmpModal(false);
        setEditingEmp(null);
        setEmpSearchQuery('');
        setEditEmpTab('profile');
        fetchBaseData();
      } else {
        alert('Failed to update employee details');
      }
  };

  const filteredEmployeesForSearch = verified.filter(emp =>
    emp.full_name?.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    emp.phone_number?.includes(empSearchQuery) ||
    emp.blockchain_id?.includes(empSearchQuery)
  );

  const handleAddBranch = async (e) => {
    e.preventDefault();
    await fetch(`${API_BASE_URL}/api/admin/add-location`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newLoc) });
    setNewLoc({ name: '', lat: '', lon: '', radius: 200 });
    fetchBaseData();
  };

  const handleUpdateBranch = async (e) => {
    e.preventDefault();
    await fetch(`${API_BASE_URL}/api/admin/update-location/${editingLoc.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingLoc.name, lat: parseFloat(editingLoc.lat), lon: parseFloat(editingLoc.lon), radius: parseInt(editingLoc.radius) })
    });
    setEditLocModal(false); setEditingLoc(null); fetchBaseData();
  };

  const deleteLoc = async (id) => {
    if(window.confirm("Delete Branch?")) {
        await fetch(`${API_BASE_URL}/api/admin/delete-location/${id}`, { method: 'DELETE' });
        fetchBaseData();
    }
  };

  const handleSiteZoom = (siteId) => {
    setMapSiteSearch(siteId);
    if(siteId) {
      const site = locations.find(l => l.id == siteId);
      if(site && site.lat && site.lon) {
        setMapCenter([site.lat, site.lon]);
        setMapZoom(17);
      }
    }
  };

  const handleEmpZoom = (empEmail) => {
    setMapEmpSearch(empEmail);
    if(empEmail) {
      const emp = liveLocations.find(l => l.email === empEmail);
      if(emp && emp.lat && emp.lon) {
        setMapCenter([emp.lat, emp.lon]);
        setMapZoom(18);
      }
    }
  };

  const downloadExcel = (withPhotos = false) => {
    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"></head><body>
      <table border="1">
        <thead>
          <tr style="background-color: #f2f2f2; font-weight: bold;">
            <th>Date</th><th>Photo Time</th><th>Employee ID</th><th>Employee Name</th><th>Site Name</th>
            <th>Site Entry</th><th>Site Exit</th><th>Total Duration</th>
            <th>Purpose</th><th>Remarks</th>${withPhotos ? '<th>Geotagged Photo(s)</th>' : ''}
          </tr>
        </thead>
        <tbody>
    `;

    fieldReports.forEach(r => {
      let imgTag = 'No Photo';
      if (withPhotos && r.photo) {
        const photoUrls = r.photo.split(',');
        imgTag = photoUrls.map(url => `<img src="${url}" width="120" height="120" style="object-fit: contain; margin: 2px;" />`).join('');
      }
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
    const employeeSegment = reportOfficerSearch ? `_Employee_${reportOfficerSearch}` : '';
    const siteSegment = filterSite ? `_Site_${filterSite}` : '';
    const roleSegment = filterRole !== 'all' ? `_${filterRole}` : '';
    link.download = `Visits_${reportMonth}_${reportYear}${roleSegment}${siteSegment}${employeeSegment}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAttendanceExcel = async () => {
      let url = `${API_BASE_URL}/api/admin/reports/monthly-attendance?month=${reportMonth}&year=${reportYear}`;
      
      if (reportOfficerSearch && employees.length > 0) {
        const matchedOfficer = employees.find(o => 
          o.is_verified &&
          (o.full_name?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) || 
           o.email?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
           o.blockchain_id?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
           o.phone_number?.includes(reportOfficerSearch))
        );
        if (matchedOfficer) url += `&user_id=${matchedOfficer.id}`;
      }

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
      const employeeSegment = reportOfficerSearch ? `_Employee_${reportOfficerSearch}` : '';
      const siteSegment = filterSite ? `_Site_${filterSite}` : '';
      const roleSegment = filterRole !== 'all' ? `_${filterRole}` : '';
      link.download = `Attendance_${reportMonth}_${reportYear}${roleSegment}${siteSegment}${employeeSegment}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handlePrintProfile = async (userId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/employee-dossier/${userId}?admin_email=${adminEmail}`);
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.detail || "Failed to load secure dossier data");
        return;
      }

      const emp = result.data;
      const printWindow = window.open('', '_blank');
      
      let docsHtml = '';
      const addDoc = (title, url) => {
          if (url) docsHtml += `<div class="doc-section"><h3 class="doc-title">${title}</h3><img src="${url}" class="doc-img" alt="${title}" /></div>`;
      };
      
      addDoc('Aadhaar / Gov ID', emp?.aadhar_photo_path);
      addDoc('PAN Card', emp?.pan_photo_path);
      addDoc('Voter ID', emp?.voter_photo_path);
      addDoc('Driving Licence', emp?.dl_photo_path);
      addDoc('Passport', emp?.passport_photo_path);
      addDoc('Bank Passbook / Cancelled Cheque', emp?.bank_passbook_path);
      addDoc('Left Hand Fingerprints', emp?.fingerprints_left_path);
      addDoc('Right Hand Fingerprints', emp?.fingerprints_right_path);

      const extraDocs = safeParseJSON(emp?.extra_documents_json);
      extraDocs.forEach(doc => {
        if (doc?.path) addDoc(doc?.title || 'Additional Document', doc.path);
      });

      const kycStatusHtml = emp?.kyc_mode !== 'without_aadhaar' 
          ? '<span style="color: #198754; font-weight: bold;">✅ Aadhaar Verified (Digital e-KYC)</span>' 
          : '<span style="color: #dc3545; font-weight: bold;">⚠️ Manual Verification (No e-KYC)</span>';

      const eduData = safeParseJSON(emp?.education_json);
      let eduHtml = eduData.length > 0 && eduData[0]?.qualification
          ? `<table><tr><th>Qualification</th><th>Institute</th><th>Year</th><th>Marks</th></tr>` + eduData.map(e => `<tr><td>${e?.qualification||'-'}</td><td>${e?.institute||'-'}</td><td>${e?.year||'-'}</td><td>${e?.marks||'-'}</td></tr>`).join('') + `</table>` 
          : '<p class="text-muted">No education history provided.</p>';

      const expData = safeParseJSON(emp?.experience_json);
      let expHtml = expData.length > 0 && expData[0]?.company
          ? `<table><tr><th>Company Name</th><th>Designation</th><th>Period</th></tr>` + expData.map(e => `<tr><td>${e?.company||'-'}</td><td>${e?.designation||'-'}</td><td>${e?.period||'-'}</td></tr>`).join('') + `</table>`
          : '<p class="text-muted">No prior work experience provided.</p>';

      const famData = safeParseJSON(emp?.family_json);
      let famHtml = famData.length > 0 && famData[0]?.name
          ? `<table><tr><th>Name</th><th>Relationship</th><th>DOB</th></tr>` + famData.map(f => `<tr><td>${f?.name||'-'}</td><td>${f?.relation||'-'}</td><td>${f?.dob||'-'}</td></tr>`).join('') + `</table>`
          : '<p class="text-muted">No family details provided.</p>';

      const refData = parseReferencesJSON(emp?.references_json);
      let refHtml = refData.length > 0
          ? `<table><tr><th>Name</th><th>Contact Number</th><th>Relation / Context</th></tr>` + refData.map(r => `<tr><td>${r?.name||'-'}</td><td>${r?.contact || r?.phone || r?.mobile || '-'}</td><td>${r?.relation || r?.relationship || '-'}</td></tr>`).join('') + `</table>`
          : '<p class="text-muted">No reference details provided.</p>';

      printWindow.document.write(`
          <html><head><title>Dossier_${emp?.full_name || 'Employee'}</title>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 30px; color: #333; max-width: 900px; margin: auto; font-size: 14px; }
              .logo-header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #e31e24; padding-bottom: 15px; }
              .logo-header img { height: 50px; vertical-align: middle; margin-right: 15px; }
              .logo-header .company-name { font-size: 18px; font-weight: bold; color: #e31e24; vertical-align: middle; display: inline-block; }
              h2 { text-align: center; color: #0d6efd; text-transform: uppercase; margin-bottom: 5px; }
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
              .terms-box { font-size: 12px; background-color: #f8f9fa; padding: 15px; border: 1px solid #dee2e6; margin-bottom: 20px; }
              @media print {
                  .doc-section, table, .terms-box { page-break-inside: avoid; }
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
            <div style="text-align: center; font-size: 11px; color: #555; letter-spacing: 1.5px; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px; text-transform: uppercase;">
              Privileged & Confidential • Internal HR Use Only
            </div>
            
            <h3 class="section-header" style="margin-top:0;">1. Identity & Employment Status</h3>
            <div class="flex-row">
              <div><img src="${emp?.profile_photo_path || 'https://via.placeholder.com/150'}" class="photo" alt="Profile" /></div>
              <div class="details">
                <table>
                  <tr><th>Full Name</th><td style="font-weight: bold; font-size: 16px;">${emp?.full_name || 'N/A'}</td></tr>
                  <tr><th>System Role</th><td style="text-transform: uppercase; font-weight:bold;">${emp?.user_type || 'N/A'}</td></tr>
                  <tr><th>Assigned Dept/Site</th><td>${emp?.department || 'N/A'} - ${emp?.unit_name || 'Dynamic'}</td></tr>
                  <tr><th>Designation</th><td>${emp?.designation || 'N/A'}</td></tr>
                  <tr><th>Primary Mobile</th><td>${emp?.phone_number || 'N/A'}</td></tr>
                  <tr><th>Personal Email</th><td>${emp?.personal_email || 'N/A'}</td></tr>
                  <tr><th>KYC Authenticity</th><td>${kycStatusHtml}</td></tr>
                </table>
              </div>
            </div>

            <h3 class="section-header">2. Demographics & Medical</h3>
            <table>
              <tr><th>Date of Birth</th><td>${emp?.dob || 'N/A'}</td><th>Blood Group</th><td style="color:#dc3545; font-weight:bold;">${emp?.blood_group || 'N/A'}</td></tr>
              <tr><th>Gender</th><td>${emp?.gender || 'N/A'}</td><th>Height (cm)</th><td>${emp?.height || 'N/A'}</td></tr>
              <tr><th>Marital Status</th><td>${emp?.marital_status || 'N/A'}</td><th>Nationality</th><td>${emp?.nationality || 'N/A'}</td></tr>
              <tr><th>Father's Name</th><td>${emp?.father_name || 'N/A'}</td><th>Religion</th><td>${emp?.religion || 'N/A'}</td></tr>
              <tr><th>Mother's Name</th><td>${emp?.mother_name || 'N/A'}</td><th>Category/Caste</th><td>${emp?.category || '-'} / ${emp?.caste || '-'}</td></tr>
              <tr><th>Identity Mark</th><td colspan="3">${emp?.identity_mark || 'None'}</td></tr>
              <tr><th>Medical Remarks</th><td colspan="3">${emp?.medical_remarks || 'None'}</td></tr>
            </table>

            <h3 class="section-header">3. Address Information</h3>
            <table>
              <tr><th colspan="2" style="text-align:center; background-color:#e9ecef;">Permanent Address</th><th colspan="2" style="text-align:center; background-color:#e9ecef;">Temporary Address</th></tr>
              <tr>
                  <th style="width:15%;">Address</th><td style="width:35%;">${emp?.perm_address || 'N/A'}</td>
                  <th style="width:15%;">Address</th><td style="width:35%;">${emp?.temp_address || 'N/A'}</td>
              </tr>
              <tr>
                  <th>State & PIN</th><td>${emp?.perm_state || 'N/A'} - ${emp?.perm_pin || ''}</td>
                  <th>State & PIN</th><td>${emp?.temp_state || 'N/A'} - ${emp?.temp_pin || ''}</td>
              </tr>
              <tr>
                  <th>Alt. Contact</th><td>${emp?.perm_mobile || 'N/A'}</td>
                  <th>Local Contact</th><td>${emp?.temp_mobile || 'N/A'}</td>
              </tr>
            </table>

            <h3 class="section-header">4. Verified Identity & KYC Details</h3>
            <table>
                <tr><th>Aadhaar Number</th><td style="font-weight:bold;">${emp?.aadhar_raw && emp.aadhar_raw !== 'N/A' ? emp.aadhar_raw : 'Not Provided'}</td><th>PAN Number</th><td style="font-weight:bold;">${emp?.pan_raw && emp.pan_raw !== 'N/A' ? emp.pan_raw : 'Not Provided'}</td></tr>
                <tr><th>Voter ID</th><td>${emp?.voter_id_raw && emp.voter_id_raw !== 'N/A' ? emp.voter_id_raw : 'Not Provided'}</td><th>Driving Licence</th><td>${emp?.dl_raw && emp.dl_raw !== 'N/A' ? emp.dl_raw : 'Not Provided'}</td></tr>
                <tr><th>Passport Number</th><td colspan="3">${emp?.passport_raw && emp.passport_raw !== 'N/A' ? emp.passport_raw : 'Not Provided'}</td></tr>
            </table>

            <h3 class="section-header">5. Salary & Banking Details</h3>
            <table>
                <tr><th>Bank Name</th><td>${emp?.bank_name || 'N/A'}</td><th>IFSC Code</th><td>${emp?.ifsc_code || 'N/A'}</td></tr>
                <tr><th>Account Number</th><td colspan="3" style="font-weight:bold;">${emp?.account_number_raw && emp.account_number_raw !== 'N/A' ? emp.account_number_raw : 'Not Provided'}</td></tr>
            </table>

            <h3 class="section-header">6. Education History</h3>
            ${eduHtml}

            <h3 class="section-header">7. Prior Work Experience</h3>
            ${expHtml}

            <h3 class="section-header">8. Family Details</h3>
            ${famHtml}

            <h3 class="section-header">9. Reference Details</h3>
            ${refHtml}

            <h3 class="section-header">10. Terms & Conditions Agreement</h3>
            <div class="terms-box">
                <p><strong>The employee has electronically accepted and agreed to the following conditions during onboarding:</strong></p>
                <ol style="color: #555; padding-left: 20px;">
                  <li>If the applicant is selected, he/she should work with company for a period of minimum three months.</li>
                  <li>Employee agree that will work faithfully without any issues, and will be present in time for duty and complete the duty hrs as per schedule assigned.</li>
                  <li>Selected candidate should pay 2200/- as security deposit for providing uniform.</li>
                  <li>Selected candidate should submit any one original document while joining, same will be returned back after 1month as due to verification purpose.</li>
                  <li>Candidate who are selected and deployed in respective sites while in duty they are sole responsible for any theft or pilerage and they had to be borne by them.</li>
                  <li>A minimum of one-month notice has to given before leaving the job or a month salary will be deducted.</li>
                  <li>Employer may terminate Candidate (Employee) if any mis appropriation occurs in duty without prior notice.</li>
                  <li>The Selected Employee agree that any property like sim card or mobile should returned of at the time of resignation/termination.</li>
                  <li>Selected Employee should be flexible towards work like in shifts process as per Employer.</li>
                  <li>Resigned Employee salary will release after cmpletetion of 30 days of notice period, if not then one month salary will be on hold and that will be clear with a fine of 4000/-(every month on 25th).</li>
                </ol>
                <p style="text-align: right; color: #198754; font-weight: bold; margin-top: 15px; font-size: 14px;">✅ Electronically Signed & Accepted by: ${emp?.full_name}</p>
            </div>

            <div style="page-break-before: always;"></div>
            <h3 class="section-header" style="text-align:center; background-color:#333; color:white; padding:10px;">APPENDIX: OFFICIAL DOCUMENTS & EVIDENCE</h3>
            ${docsHtml || '<p style="text-align: center; color: #777;">No documents uploaded to this profile.</p>'}
            
            <script>
              window.onload = function() {
                  setTimeout(() => { window.print(); window.close(); }, 1500);
              };
            </script>
          </body></html>
      `);
      printWindow.document.close();
    } catch (error) {
      alert("An error occurred while fetching the secure dossier data.");
    }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-4">
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
        
        <Tab eventKey="overview" title={<span className="fw-bold px-3">System Overview</span>}>
          
          <Row className="mb-4 text-center">
            <Col md={4}><Card className="p-3 shadow-sm border-0"><div className="text-muted small">TOTAL STAFF</div><h4 className="fw-bold"><Users size={20} className="me-2"/>{employees.length}</h4></Card></Col>
            <Col md={4}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-primary">VERIFIED EMPLOYEES</div><h4 className="fw-bold text-primary"><UserCheck size={20} className="me-2"/>{verified.length}</h4></Card></Col>
            <Col md={4}><Card className="p-3 shadow-sm border-0"><div className="text-muted small text-success">ASSIGNED SITES</div><h4 className="fw-bold text-success"><MapPin size={20} className="me-2"/>{locations.length}</h4></Card></Col>
          </Row>

          <Row>
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
                <div style={{maxHeight: '220px', overflowY: 'auto'}}>
                    {locations.map(loc => (
                        <div key={loc.id} className="d-flex justify-content-between align-items-center p-2 border-bottom small">
                            <span>{loc.name}</span>
                            <div>
                                <Crosshair size={14} className="text-success me-2" title="Zoom to site" onClick={() => handleSiteZoom(loc.id)} style={{cursor: 'pointer'}}/>
                                <Edit2 size={14} className="text-primary me-2" onClick={() => { setEditingLoc(loc); setEditLocModal(true); }} style={{cursor: 'pointer'}}/>
                                <Trash2 size={14} className="text-danger" onClick={() => deleteLoc(loc.id)} style={{cursor: 'pointer'}}/>
                            </div>
                        </div>
                    ))}
                </div>
              </Card>
            </Col>

            <Col md={8}>
              <Card className="border-0 shadow-sm overflow-hidden mb-4" style={{ height: '430px' }}>
                <Card.Header className="bg-white p-2 border-bottom d-flex gap-2 w-100">
                  <div className="input-group input-group-sm w-50">
                    <span className="input-group-text bg-light"><Building2 size={14}/></span>
                    <Form.Select value={mapSiteSearch} onChange={(e) => handleSiteZoom(e.target.value)}>
                      <option value="">Zoom to Branch/Site...</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </Form.Select>
                  </div>
                  <div className="input-group input-group-sm w-50">
                    <span className="input-group-text bg-light"><UserCheck size={14}/></span>
                    <Form.Select value={mapEmpSearch} onChange={(e) => handleEmpZoom(e.target.value)}>
                      <option value="">Locate Specific Employee...</option>
                      {liveLocations.filter(loc => loc.lat && loc.lon && loc.present === true).map(l => (
                        <option key={l.email} value={l.email}>{l.name} ({l.user_type === 'field_officer' ? 'Field Officer' : 'Staff'})</option>
                      ))}
                    </Form.Select>
                  </div>
                </Card.Header>
                <div style={{ height: 'calc(100% - 40px)' }}>
                  <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
                    <MapUpdater center={mapCenter} zoom={mapZoom} />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                   {liveLocations.filter(loc => loc.lat && loc.lon && loc.present === true).map(loc => (
  <Marker 
      key={loc.email} 
      position={[loc.lat, loc.lon]}
      icon={getStatusIcon(loc.present)}
  >
    <Popup>
      <div className="text-center">
          <strong className="d-block">{loc.name || 'Unknown'}</strong>
          <small className="text-muted d-block">{loc.user_type?.replace('_', ' ')}</small>
          <Badge bg="success" className="mt-1 mb-2">Active / Checked In</Badge>
          
          {/* CRITICAL: Role-based check for the View Path button */}
          {loc.user_type === 'field_officer' && (
            <Button 
              variant="outline-primary" 
              size="sm" 
              className="w-100 mt-2" 
              onClick={() => {
                setRouteViewerUserId(loc.user_id);
                setRouteViewerName(loc.name);
              }}
            >
              <MapIcon size={12} className="me-1"/> View Day Path
            </Button>
          )}
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
                </div>
              </Card>
            </Col>
          </Row>

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
                            <option value="employee">Standard Employee</option>
                            <option value="field_officer">Field Officer</option>
                            <option value="manager">Manager</option>
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
              <span className="small fw-bold text-muted text-uppercase">Date Range:</span>
              <Form.Control size="sm" type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} style={{width: '160px'}} />
              <Form.Control size="sm" type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} style={{width: '160px'}} />
              <Button variant="outline-secondary" size="sm" onClick={() => { setReportStartDate(''); setReportEndDate(''); }}>
                Clear
              </Button>
            </div>

            <div className="d-flex gap-2 align-items-center border-start ps-4 flex-wrap">
              <span className="small fw-bold text-muted text-uppercase">Specific Data:</span>
              <Form.Select size="sm" value={filterRole} onChange={e => { setFilterRole(e.target.value); setReportOfficerSearch(''); }} style={{width: '170px'}}>
                <option value="all">All Employees</option>
                <option value="field_officer">Field Officers</option>
                <option value="employee">Normal Employees</option>
              </Form.Select>
              
              <div style={{width: '250px'}} className="position-relative">
                <Search size={16} className="position-absolute" style={{top: '8px', left: '10px', color: '#999', pointerEvents: 'none'}} />
                <Form.Control
                  size="sm"
                  type="text"
                  placeholder="Search name, email, ID..."
                  value={reportOfficerSearch}
                  onChange={e => {
                      setReportOfficerSearch(e.target.value);
                      setShowReportSuggestions(true);
                  }}
                  onFocus={() => setShowReportSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowReportSuggestions(false), 200)}
                  style={{paddingLeft: '32px'}}
                />
                
                {showReportSuggestions && reportOfficerSearch && (
                  <div className="position-absolute w-100 bg-white border rounded shadow mt-1 z-3" style={{ maxHeight: '250px', overflowY: 'auto', zIndex: 1050 }}>
                    <div className="list-group list-group-flush">
                      {verified.filter(emp =>
                        (filterRole === 'all' ? ['field_officer', 'employee'].includes(emp?.user_type) : emp?.user_type === filterRole) &&
                        (emp.full_name?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
                         emp.email?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
                         emp.blockchain_id?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
                         emp.phone_number?.includes(reportOfficerSearch))
                      ).map(emp => (
                        <button
                          key={emp.id}
                          type="button" 
                          className="list-group-item list-group-item-action py-2 px-3 text-start border-bottom"
                          onClick={() => {
                            setReportOfficerSearch(emp.full_name);
                            setShowReportSuggestions(false);
                          }}
                        >
                          <div className="fw-bold" style={{ fontSize: '0.85rem' }}>{emp.full_name}</div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                              {emp.blockchain_id || 'ID N/A'} • {emp.email}
                          </div>
                        </button>
                      ))}
                      
                      {verified.filter(emp =>
                        (filterRole === 'all' ? ['field_officer', 'employee'].includes(emp?.user_type) : emp?.user_type === filterRole) &&
                        (emp.full_name?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
                         emp.email?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
                         emp.blockchain_id?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
                         emp.phone_number?.includes(reportOfficerSearch))
                      ).length === 0 && (
                        <div className="p-3 text-muted text-center" style={{ fontSize: '0.85rem' }}>No matches found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <Form.Select size="sm" value={filterSite} onChange={e => setFilterSite(e.target.value)} style={{width: '150px'}}>
                <option value="">All Sites</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </Form.Select>
            </div>
          </div>

          <div className="p-4">
            <Tabs activeKey={reportsSubTab} onSelect={(k) => setReportsSubTab(k)} className="mb-4">
              <Tab eventKey="site-visits" title="Site Visits">
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
                    <div className="d-flex gap-2 align-items-center">
                        <h6 className="mb-0 fw-bold d-flex align-items-center"><MapPin className="me-2 text-danger" size={18}/> Field Officer Site Visits</h6>
                        {autoRefreshEnabled && (
                          <Badge bg="success" className="ms-2 d-flex align-items-center">
                            <span className="spinner-border spinner-border-sm me-1" style={{width: '10px', height: '10px'}}></span>
                            Auto-Refresh ON
                          </Badge>
                        )}
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                      <Button
                        variant={autoRefreshEnabled ? "warning" : "light"}
                        size="sm"
                        className={`fw-bold d-flex align-items-center ${autoRefreshEnabled ? 'text-dark' : ''}`}
                        onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                      >
                        🔄 {autoRefreshEnabled ? 'Pause Auto-Refresh' : 'Enable Auto-Refresh (10s)'}
                      </Button>
                      <Button variant="info" size="sm" className="fw-bold d-flex align-items-center" onClick={() => fetchReportsData()} disabled={reportsLoading}>
                        {reportsLoading ? <Spinner size="sm" className="me-1" /> : '🔃'} Refresh Now
                      </Button>
                      <Button variant="light" size="sm" className="fw-bold text-dark d-flex align-items-center" onClick={() => downloadExcel(false)} disabled={fieldReports.length === 0}>
                        <Download size={14} className="me-2 text-success"/> Download Visits Excel
                      </Button>
                      <Button variant="outline-light" size="sm" className="fw-bold text-dark d-flex align-items-center" onClick={() => downloadExcel(true)} disabled={fieldReports.length === 0}>
                        <Download size={14} className="me-2 text-success"/> Download Visits Excel (With Photos)
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
                                       <td style={{ minWidth: '300px' }}>
    {visit.remarks && visit.remarks.startsWith('[') ? (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '5px 0' }}>
            {JSON.parse(visit.remarks).map((item, idx) => (
                <div key={idx} style={{ flexShrink: 0 }}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                        <img 
                            src={item.url} 
                            alt="evidence" 
                            style={{ 
                                width: '50px', 
                                height: '50px', 
                                borderRadius: '4px', 
                                objectFit: 'cover',
                                border: '1px solid #ddd' 
                            }} 
                        />
                    </a>
                    <div style={{ fontSize: '9px', textAlign: 'center', marginTop: '2px' }}>
                        {item.details || 'View'}
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <span className="text-truncate d-block" style={{ maxWidth: '200px' }}>{visit.remarks || '-'}</span>
    )}
</td>
                                        <td className="d-flex gap-2">
                                          {visit.photo ? (
                                            <div className="d-flex gap-1 flex-wrap">
                                              {visit.photo.split(',').map((url, i) => (
                                                <Button key={i} variant="outline-secondary" size="sm" className="p-1" onClick={() => setPhotoPreview(url)}>
                                                  <ImageIcon size={14}/> {i + 1}
                                                </Button>
                                              ))}
                                            </div>
                                          ) : (
                                            <span className="text-muted small">No Photo</span>
                                          )}
                                          <Button variant="outline-danger" size="sm" onClick={() => handleDeleteVisit(visit.visit_id)}>
                                            <Trash2 size={14} className="me-1"/> Delete
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
              </Tab>

              <Tab eventKey="attendance" title="Attendance">
                <Card className="border-0 shadow-sm mb-4">
                  <Card.Header className="bg-dark text-white p-3 d-flex justify-content-between align-items-center">
                    <div className="d-flex gap-2 align-items-center">
                      <h6 className="mb-0 fw-bold d-flex align-items-center"><Calendar className="me-2 text-warning" size={18}/> Attendance Records</h6>
                      {autoRefreshEnabled && (
                        <Badge bg="success" className="ms-2 d-flex align-items-center">
                          <span className="spinner-border spinner-border-sm me-1" style={{width: '10px', height: '10px'}}></span>
                          Auto-Refresh ON
                        </Badge>
                      )}
                    </div>
                    <div className="d-flex gap-2">
                      <Button 
                        variant={autoRefreshEnabled ? "warning" : "light"} 
                        size="sm" 
                        className={`fw-bold d-flex align-items-center ${autoRefreshEnabled ? 'text-dark' : ''}`}
                        onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                      >
                        🔄 {autoRefreshEnabled ? 'Pause Auto-Refresh' : 'Enable Auto-Refresh (10s)'}
                      </Button>
                      <Button 
                        variant="info" 
                        size="sm" 
                        className="fw-bold d-flex align-items-center"
                        onClick={() => fetchAttendanceData()}
                        disabled={attendanceLoading}
                      >
                        {attendanceLoading ? <Spinner size="sm" className="me-1" /> : '🔃'} Refresh Now
                      </Button>
                      <Button variant="warning" size="sm" className="fw-bold text-dark d-flex align-items-center" onClick={downloadAttendanceExcel} disabled={attendanceRecords.length === 0}>
                        <Download size={14} className="me-2 text-dark"/> Download Excel
                      </Button>
                    </div>
                  </Card.Header>
                  <Card.Body className="p-0">
                    {attendanceLoading ? (
                      <div className="text-center py-5"><Spinner variant="primary" animation="border" /></div>
                    ) : attendanceRecords.length === 0 ? (
                      <div className="text-center py-5 text-muted">No attendance records found for the selected filters.</div>
                    ) : (
                      <Table hover responsive className="mb-0 align-middle small">
                        <thead className="table-secondary">
                          <tr>
                            <th>Date</th><th>Employee ID</th><th>Name</th><th>Role</th><th>Site</th>
                            <th>Check-In</th><th>Check-Out</th><th>Duration</th><th>Status</th><th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceRecords.map((record, idx) => {
                            const isCheckedOut = record.checkout_time && record.checkout_time !== 'N/A';
                            return (
                              <tr key={idx} className={!isCheckedOut ? 'table-info' : ''}>
                                <td>{record.date || 'N/A'}</td>
                                <td>{record.employee_id || 'N/A'}</td>
                                <td><strong>{record.employee_name || 'N/A'}</strong></td>
                                <td>{record.user_type || 'N/A'}</td>
                                <td>{record.site_name || 'N/A'}</td>
                                <td><strong>{record.checkin_time || 'N/A'}</strong></td>
                                <td className={!isCheckedOut ? 'text-danger fw-bold' : 'text-success'}>{record.checkout_time || '⏱️ Pending'}</td>
                                <td>
                                  <Badge bg={record.duration && record.duration !== 'N/A' ? 'success' : 'secondary'}>
                                    {record.duration || '--'}
                                  </Badge>
                                </td>
                                <td>
                                  <Badge bg={isCheckedOut ? 'success' : 'warning'} className="text-dark">
                                    {isCheckedOut ? '✓ Completed' : '⏳ Active'}
                                  </Badge>
                                </td>
                                <td>
                                  <Button variant="outline-danger" size="sm" onClick={() => handleDeleteAttendance(record.attendance_id)}>
                                    <Trash2 size={14} className="me-1"/> Delete
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    )}
                  </Card.Body>
                </Card>
              </Tab>
            </Tabs>
          </div>
        </Tab>
      </Tabs>

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

      <Modal show={!!selectedStaff} onHide={() => setSelectedStaff(null)} size="xl" centered>
        <Modal.Header closeButton className="bg-dark text-white d-flex justify-content-between align-items-center w-100">
          <Modal.Title className="h6 mb-0">Employee Profile: {selectedStaff?.full_name || 'Unknown'}</Modal.Title>
          <Button variant="outline-light" size="sm" className="fw-bold ms-auto me-3 d-flex align-items-center" onClick={() => handlePrintProfile(selectedStaff.id)}>
            <FileText size={16} className="me-2"/> Download Complete Dossier (PDF)
          </Button>
        </Modal.Header>
        
        <Modal.Body className="bg-light p-4">
          <Row>
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
            
            <Col md={9}>
              <Card className="border-0 shadow-sm p-3 h-100 overflow-auto">
                 <Tabs defaultActiveKey="identity" className="mb-4">
                    
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

                        <h6 className="fw-bold border-bottom pb-2 mb-3 mt-4 text-primary">Reference Details</h6>
                        <Table size="sm" bordered hover className="mb-0 small">
                            <thead className="table-light"><tr><th>Name</th><th>Contact Number</th><th>Relation / Context</th></tr></thead>
                            <tbody>
                                {parseReferencesJSON(selectedStaff?.references_json).length > 0 ? (
                                    parseReferencesJSON(selectedStaff?.references_json).map((ref, i) => (
                                        <tr key={i}>
                                            <td className="fw-bold">{ref?.name || '-'}</td>
                                            <td>{ref?.contact || ref?.phone || ref?.mobile || '-'}</td>
                                            <td>{ref?.relation || ref?.relationship || '-'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="3" className="text-center text-muted">No reference details provided.</td></tr>
                                )}
                            </tbody>
                        </Table>
                    </Tab>

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

      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
          <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Onboard New Employee</Modal.Title></Modal.Header>
          <Modal.Body className="p-4">
              <EmployeeOnboardForm locations={locations} onCancel={() => setShowAddEmp(false)} onSuccess={() => { setShowAddEmp(false); fetchBaseData(); }} />
          </Modal.Body>
      </Modal>

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

      <Modal show={editEmpModal} onHide={() => setEditEmpModal(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-info text-white">
          <Modal.Title className="h6 fw-bold"><Edit2 className="me-2" size={18}/>Master Employee Editor</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 bg-light">
          {!editingEmp ? (
            <>
              <h6 className="fw-bold mb-3">Search Employee to Edit</h6>
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
                      <Card.Body className="p-3 d-flex justify-content-between align-items-center" onClick={() => { 
                          setEditingEmp({
                              ...emp, 
                              aadhar_raw: '', 
                              pan_raw: '', 
                              account_number_raw: '',
                              voter_id_raw: '',
                              dl_raw: ''
                          }); 
                          setEmpSearchQuery(''); 
                          setEditEmpTab('profile');
                      }}>
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
                <h6 className="mb-0 fw-bold fs-5">{editingEmp.full_name} <Badge bg="dark" className="ms-2 fs-6">{editingEmp.blockchain_id}</Badge></h6>
                <Button variant="outline-secondary" size="sm" onClick={() => { setEditingEmp(null); setEmpSearchQuery(''); }}>← Select Another</Button>
              </div>

              <Tabs activeKey={editEmpTab} onSelect={(k) => setEditEmpTab(k)} className="mb-4 bg-white shadow-sm rounded">
                
                <Tab eventKey="profile" title="Profile & Role" className="p-3 bg-white border border-top-0">
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Full Name</Form.Label>
                        <Form.Control size="sm" value={editingEmp.full_name || ''} onChange={e => setEditingEmp({...editingEmp, full_name: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Official Email</Form.Label>
                        <Form.Control size="sm" type="email" value={editingEmp.email || ''} onChange={e => setEditingEmp({...editingEmp, email: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Primary Phone</Form.Label>
                        <Form.Control size="sm" value={editingEmp.phone_number || ''} onChange={e => setEditingEmp({...editingEmp, phone_number: e.target.value})} />
                      </Form.Group>
                    </Col>
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
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">User Type (System Role)</Form.Label>
                        <Form.Select size="sm" value={editingEmp.user_type || 'employee'} onChange={e => setEditingEmp({...editingEmp, user_type: e.target.value})}>
                          <option value="employee">Standard Employee</option>
                          <option value="field_officer">Field Officer</option>
                          <option value="manager">Manager</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Designation</Form.Label>
                        <Form.Control size="sm" value={editingEmp.designation || ''} onChange={e => setEditingEmp({...editingEmp, designation: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Department</Form.Label>
                        <Form.Control size="sm" value={editingEmp.department || ''} onChange={e => setEditingEmp({...editingEmp, department: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Assigned Site / Geofence</Form.Label>
                        <Form.Select size="sm" value={editingEmp.location_id || ''} onChange={e => setEditingEmp({...editingEmp, location_id: e.target.value ? parseInt(e.target.value) : null})}>
                          <option value="">No Base Site</option>
                          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Reporting Manager</Form.Label>
                        <Form.Select size="sm" value={editingEmp.manager_id || ''} onChange={e => setEditingEmp({...editingEmp, manager_id: e.target.value ? parseInt(e.target.value) : null})}>
                          <option value="">No Manager Assigned</option>
                          {employees.filter(m => m?.user_type === 'manager').map(mgr => (
                            <option key={mgr.id} value={mgr.id}>{mgr.full_name}</option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
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
                </Tab>

                <Tab eventKey="addresses" title="Addresses & Contact" className="p-3 bg-white border border-top-0">
                  <h6 className="fw-bold mb-3 text-primary border-bottom pb-2">Permanent Address</h6>
                  <Row className="mb-3">
                    <Col md={12}>
                      <Form.Group className="mb-2">
                        <Form.Label className="small fw-bold">Full Address</Form.Label>
                        <Form.Control size="sm" as="textarea" rows={2} value={editingEmp.perm_address || ''} onChange={e => setEditingEmp({...editingEmp, perm_address: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">State</Form.Label>
                        <Form.Control size="sm" value={editingEmp.perm_state || ''} onChange={e => setEditingEmp({...editingEmp, perm_state: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">PIN Code</Form.Label>
                        <Form.Control size="sm" value={editingEmp.perm_pin || ''} onChange={e => setEditingEmp({...editingEmp, perm_pin: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">Alt Mobile</Form.Label>
                        <Form.Control size="sm" value={editingEmp.perm_mobile || ''} onChange={e => setEditingEmp({...editingEmp, perm_mobile: e.target.value})} />
                      </Form.Group>
                    </Col>
                  </Row>

                  <h6 className="fw-bold mb-3 mt-4 text-primary border-bottom pb-2">Temporary / Local Address</h6>
                  <Row>
                    <Col md={12}>
                      <Form.Group className="mb-2">
                        <Form.Label className="small fw-bold">Full Address</Form.Label>
                        <Form.Control size="sm" as="textarea" rows={2} value={editingEmp.temp_address || ''} onChange={e => setEditingEmp({...editingEmp, temp_address: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">State</Form.Label>
                        <Form.Control size="sm" value={editingEmp.temp_state || ''} onChange={e => setEditingEmp({...editingEmp, temp_state: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">PIN Code</Form.Label>
                        <Form.Control size="sm" value={editingEmp.temp_pin || ''} onChange={e => setEditingEmp({...editingEmp, temp_pin: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">Local Mobile</Form.Label>
                        <Form.Control size="sm" value={editingEmp.temp_mobile || ''} onChange={e => setEditingEmp({...editingEmp, temp_mobile: e.target.value})} />
                      </Form.Group>
                    </Col>
                  </Row>
                </Tab>

                <Tab eventKey="secure" title={<><ShieldAlert size={14} className="me-1"/> Bank & KYC Updates</>} className="p-3 bg-white border border-top-0">
                  <Alert variant="warning" className="small mb-4">
                    <strong>Security Notice:</strong> The fields below accept plain text, but will be <strong>permanently encrypted</strong> into the database immediately upon saving. To preserve existing data, leave the fields blank.
                  </Alert>

                  <h6 className="fw-bold mb-3 text-primary border-bottom pb-2">Banking Details</h6>
                  <Row className="mb-4">
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">Bank Name</Form.Label>
                        <Form.Control size="sm" value={editingEmp.bank_name || ''} onChange={e => setEditingEmp({...editingEmp, bank_name: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">IFSC Code</Form.Label>
                        <Form.Control size="sm" value={editingEmp.ifsc_code || ''} onChange={e => setEditingEmp({...editingEmp, ifsc_code: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small fw-bold text-danger">Override Account Number</Form.Label>
                        <Form.Control size="sm" placeholder="Leave blank to keep current" value={editingEmp.account_number_raw || ''} onChange={e => setEditingEmp({...editingEmp, account_number_raw: e.target.value})} />
                      </Form.Group>
                    </Col>
                  </Row>

                  <h6 className="fw-bold mb-3 text-primary border-bottom pb-2">Secure KYC Override</h6>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold text-danger">Override Aadhaar Number</Form.Label>
                        <Form.Control size="sm" placeholder="Leave blank to keep current" value={editingEmp.aadhar_raw || ''} onChange={e => setEditingEmp({...editingEmp, aadhar_raw: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold text-danger">Override PAN Number</Form.Label>
                        <Form.Control size="sm" placeholder="Leave blank to keep current" value={editingEmp.pan_raw || ''} onChange={e => setEditingEmp({...editingEmp, pan_raw: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold text-danger">Override Voter ID</Form.Label>
                        <Form.Control size="sm" placeholder="Leave blank to keep current" value={editingEmp.voter_id_raw || ''} onChange={e => setEditingEmp({...editingEmp, voter_id_raw: e.target.value})} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold text-danger">Override Driving Licence</Form.Label>
                        <Form.Control size="sm" placeholder="Leave blank to keep current" value={editingEmp.dl_raw || ''} onChange={e => setEditingEmp({...editingEmp, dl_raw: e.target.value})} />
                      </Form.Group>
                    </Col>
                  </Row>
                </Tab>

              </Tabs>

              <div className="d-flex gap-3 pt-3 border-top">
                <Button variant="light" onClick={() => { setEditingEmp(null); setEmpSearchQuery(''); setEditEmpTab('profile'); }} className="fw-bold w-25">Cancel</Button>
                <Button type="submit" variant="success" className="fw-bold w-75 shadow-sm"><Save size={18} className="me-2"/>Save All Changes to Database</Button>
              </div>
            </Form>
          )}
        </Modal.Body>
      </Modal>

      <Modal show={!!photoPreview} onHide={() => setPhotoPreview(null)} centered size="lg">
        <Modal.Header closeButton className="bg-dark text-white border-0"><Modal.Title className="h6 fw-bold">Geotagged Evidence</Modal.Title></Modal.Header>
        <Modal.Body className="p-0 text-center bg-dark">
            <img src={photoPreview} alt="Geotagged Visit" style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
        </Modal.Body>
      </Modal>

      {/* NEW ROUTE VIEWER MODAL */}
      <Modal show={!!routeViewerUserId} onHide={() => setRouteViewerUserId(null)} size="xl" centered>
        <Modal.Header closeButton className="bg-dark text-white border-0">
          <Modal.Title className="h6 fw-bold"><Navigation size={18} className="me-2"/> Route Tracking: {routeViewerName}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0 bg-light">
          {routeViewerUserId && (
             <ShiftRouteMap userId={routeViewerUserId} /> 
          )}
        </Modal.Body>
      </Modal>

    </Container>
  );
};

export default AdminDashboard;