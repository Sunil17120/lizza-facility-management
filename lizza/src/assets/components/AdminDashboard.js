import React, { useEffect, useState, useCallback } from 'react';
import { Table, Form, Container, Card, Spinner, Button, Row, Col, Modal, Badge, Tabs, Tab, Alert } from 'react-bootstrap';
import { UserCog, Building2, MapPin, Trash2, Users, UserCheck, Save, Search, Plus, Edit2, FileText, Eye, CheckCircle, Phone, Crosshair, Navigation, Map as MapIcon, CheckSquare, Shirt, RefreshCw, Filter, Calendar, Download, Image as ImageIcon, AlertTriangle, ShieldAlert } from 'lucide-react';
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
      background-color: ${isPresent ? '#10b981' : '#ef4444'}; 
      width: 18px; 
      height: 18px; 
      border-radius: 50%; 
      border: 3px solid white; 
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    className: 'custom-status-marker',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
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
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
        return parsed.filter(item => item && item.name && (item.contact || item.phone || item.mobile));
    }
    if (typeof parsed === 'object' && parsed !== null) {
        return Object.values(parsed).filter(item => item && item.name && (item.contact || item.phone || item.mobile || item.relationship || item.relation));
    }
    return [];
};

// Formats raw JSON remark strings into readable text for the UI
const formatRemarks = (remarksStr) => {
    if (!remarksStr) return 'No remarks';
    if (remarksStr.startsWith('[')) {
        const parsed = safeParseJSON(remarksStr);
        if (parsed.length > 0) {
            const combined = parsed.map(item => item?.details).filter(Boolean).join(' | ');
            return combined || 'No remarks';
        }
    }
    return remarksStr;
};

const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";

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

  const [selectedStaff, setSelectedStaff] = useState(null);

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', lat: '', lon: '', radius: 200 });
  const [editLocModal, setEditLocModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [editEmpModal, setEditEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [editEmpTab, setEditEmpTab] = useState('profile');
  
  const [photoPreview, setPhotoPreview] = useState(null);

  const [routeViewerUserId, setRouteViewerUserId] = useState(null);
  const [routeViewerName, setRouteViewerName] = useState("");
  
  const [allTasks, setAllTasks] = useState([]);
  const [newTaskForm, setNewTaskForm] = useState({ officer_id: '', location_id: '', assigned_date: '', tasks: [{ id: Date.now(), description: '' }] });
  const [viewingTask, setViewingTask] = useState(null);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  
  const [adhocReqs, setAdhocReqs] = useState([]);

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

  const adminEmail = localStorage.getItem('userEmail');

  const verified = employees.filter(e => e?.is_verified);
  const fieldOfficers = verified.filter(e => e?.user_type === 'field_officer');
  const getFilteredReports = useCallback(() => {
      return fieldReports.filter(visit => {
          if (!visit.date) return false;
          // visit.date is in format DD-Mon-YYYY (e.g., "18-Jun-2026")
          const visitDate = new Date(visit.date);
          
          if (reportStartDate) {
              const start = new Date(reportStartDate);
              start.setHours(0, 0, 0, 0);
              if (visitDate < start) return false;
          }
          if (reportEndDate) {
              const end = new Date(reportEndDate);
              end.setHours(23, 59, 59, 999);
              if (visitDate > end) return false;
          }
          return true;
      });
  }, [fieldReports, reportStartDate, reportEndDate]);
const groupedReports = getFilteredReports().reduce((acc, visit) => {
    if (!acc[visit.date]) acc[visit.date] = [];
    acc[visit.date].push(visit);
    return acc;
  }, {});

  const managerStats = verified.filter(e => e?.user_type === 'manager').map(mgr => {
    const teamSize = verified.filter(emp => emp?.manager_id === mgr?.id).length;
    return { ...mgr, teamSize };
  });

  const fetchBaseData = useCallback(async () => {
      const [empRes, locRes, liveRes, tasksRes, adhocRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/employees?admin_email=${adminEmail}`),
        fetch(`${API_BASE_URL}/api/admin/locations`),
        fetch(`${API_BASE_URL}/api/admin/live-tracking?admin_email=${adminEmail}`),
        fetch(`${API_BASE_URL}/api/tasks?email=${adminEmail}&role=admin`),
        fetch(`${API_BASE_URL}/api/admin/pending-uniforms`)
      ]);
      
      if (empRes.ok) setEmployees(await empRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (liveRes.ok) setLiveLocations(await liveRes.json());
      if (tasksRes.ok) setAllTasks(await tasksRes.json());
      if (adhocRes.ok) setAdhocReqs(await adhocRes.json());
      
      setLoading(false);
  }, [adminEmail]);

  useEffect(() => { fetchBaseData(); }, [fetchBaseData]);

  const fetchReportsData = useCallback(async () => {
    if (mainTab !== 'reports') return;
    setReportsLoading(true);
      let url = `${API_BASE_URL}/api/admin/reports/monthly-field-visits?month=${reportMonth}&year=${reportYear}`;
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
        if (matchedOfficer) url += `&officer_id=${matchedOfficer.id}`;
      }
      if (filterSite) url += `&location_id=${filterSite}`;
      if (filterRole && filterRole !== 'all') url += `&user_type=${filterRole}`;
      
      const res = await fetch(url);
      if (res.ok) setFieldReports(await res.json());
      else setFieldReports([]);
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
      if (res.ok) setAttendanceRecords(await res.json());
      else setAttendanceRecords([]);
      setAttendanceLoading(false);
  }, [reportMonth, reportYear, reportStartDate, reportEndDate, reportOfficerSearch, filterSite, filterRole, mainTab, employees]);

  useEffect(() => {
    if (mainTab !== 'reports') return;
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        if (mainTab === 'overview') {
            const res = await fetch(`${API_BASE_URL}/api/admin/live-tracking?admin_email=${adminEmail}`);
            if (res.ok) setLiveLocations(await res.json());
        }
        if (mainTab === 'reports') {
            fetchAttendanceData();
            fetchReportsData();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [mainTab, adminEmail, fetchAttendanceData, fetchReportsData]);

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

  const handleApproveUniform = async (reqId) => {
      const res = await fetch(`${API_BASE_URL}/api/admin/approve-uniform/${reqId}`, { method: 'POST' });
      if (res.ok) {
          alert("Request Approved and Forwarded to HR!");
          fetchBaseData();
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

  const handleAssignTask = async (e) => {
      e.preventDefault();
      const validTasks = newTaskForm.tasks.filter(t => t.description.trim() !== '');
      if(validTasks.length === 0) return alert("Add at least one sub-task instruction.");
      
      setTaskSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/api/admin/assign-task`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newTaskForm, tasks: validTasks })
      });
      if(res.ok) {
          alert("Task Assigned Successfully!");
          setNewTaskForm({ officer_id: '', location_id: '', assigned_date: '', tasks: [{ id: Date.now(), description: '' }] });
          fetchBaseData();
      }
      setTaskSubmitting(false);
  };

const downloadExcel = (withPhotos = false) => {
    const dataToExport = getFilteredReports(); // <-- Use filtered data
    
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

    dataToExport.forEach(r => {
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
          <td>${formatRemarks(r.remarks)}</td>
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
      const response = await fetch(`${API_BASE_URL}/api/admin/employee-dossier/${userId}?admin_email=${adminEmail}`);
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.detail || "Failed to load secure dossier data");
        return;
      }

      const emp = result.data;
      const companyTerms = [
        "If the applicant is selected, he/she should work with company for a period of minimum three months.",
        "Employee agree that will work faithfully without any issues, and will be present in time for duty and complete the duty hrs as per schedule assigned.",
        "Selected candidate should pay 2200/- as security deposit for providing uniform.",
        "Selected candidate should submit any one original document while joining, same will be returned back after 1month as due to verification purpose.",
        "Candidate who are selected and deployed in respective sites while in duty they are sole responsible for any theft or pilerage and they had to be borne by them.",
        "A minimum of one-month notice has to given before leaving the job or a month salary will be deducted.",
        "Employer may terminate Candidate (Employee) if any mis appropriation occurs in duty without prior notice.",
        "The Selected Employee agree that any property like sim card or mobile should returned of at the time of resignation/termination.",
        "Selected Employee should be flexible towards work like in shifts process as per Employer.",
        "Resigned Employee salary will release after cmpletetion of 30 days of notice period, if not then one month salary will be on hold and that will be clear with a fine of 4000/-(every month on 25th).",
        "The above all terms and conditions are Solley Accepted and signed."
      ];
      const termsHtml = `
          <h3 class="section-header">10. Terms & Conditions</h3>
          <div class="terms-box">
              <ol style="padding-left: 20px; margin-bottom: 20px;">
                  ${companyTerms.map(term => `<li style="margin-bottom: 8px;">${term}</li>`).join('')}
              </ol>
              <p><strong>Declaration:</strong> I, <strong>${emp?.full_name || 'the employee'}</strong>, confirm that I have read, understood, and agreed to the above terms.</p>
              <p style="color: #e31e24;"><em>This document is digitally signed and verified by the LIZZA HR System.</em></p>
              
              <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end;">
                  <div style="text-align: center;">
                      <div style="border-bottom: 1px solid #000; width: 200px; margin-bottom: 5px;"></div>
                      <strong>Employee Signature</strong>
                  </div>
                  <div style="text-align: center; border: 2px solid #e31e24; padding: 15px; border-radius: 8px; width: 220px;">
                      <div style="font-size: 10px; color: #e31e24; margin-bottom: 5px;">[HR STAMP & SIGN]</div>
                      <div style="height: 40px;"></div>
                      <strong>Authorized Signatory</strong>
                  </div>
              </div>
          </div>
      `;
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
          ? '<span style="color: #10b981; font-weight: bold;">✅ e-KYC Verified</span>' 
          : '<span style="color: #ef4444; font-weight: bold;">⚠️ Manual Verification</span>';

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
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 30px; color: #333; max-width: 900px; margin: auto; font-size: 14px; background-color: #ffffff; }
              .logo-header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #e31e24; padding-bottom: 15px; }
              .logo-header img { height: 50px; vertical-align: middle; margin-right: 15px; }
              .logo-header .company-name { font-size: 18px; font-weight: bold; color: #e31e24; vertical-align: middle; display: inline-block; }
              
              /* Unified to brand red */
              h2 { text-align: center; color: #e31e24; text-transform: uppercase; margin-bottom: 5px; font-weight: 800; }
              
              .flex-row { display: flex; justify-content: space-between; align-items: flex-start; }
              
              /* Made the photo border strictly brand red with a white inner gap */
              .photo { width: 140px; height: 140px; border-radius: 8px; object-fit: cover; border: 3px solid #e31e24; padding: 3px; background: white; }
              .details { flex-grow: 1; padding-left: 25px; }
              
              table { width: 100%; border-collapse: collapse; margin-top: 5px; margin-bottom: 15px; }
              td, th { padding: 8px 12px; border: 1px solid #dee2e6; text-align: left; }
              
              /* Themed Table Headers to Red/White */
              th { background-color: #fff3f3; color: #e31e24; font-weight: bold; width: 25%; }
              
              /* Themed Section Headers to Red */
              .section-header { margin-top: 30px; border-bottom: 2px solid #e31e24; padding-bottom: 5px; color: #e31e24; font-size: 16px; text-transform: uppercase; font-weight: bold; }
              
              .doc-section { margin-top: 30px; text-align: center; page-break-inside: avoid; }
              .doc-title { font-size: 14px; color: #e31e24; font-weight: bold; margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px dashed #e31e24; padding-bottom: 5px; }
              .doc-img { max-width: 100%; max-height: 450px; border: 1px solid #ccc; border-radius: 8px; padding: 5px; object-fit: contain; }
              .text-muted { color: #6c757d; font-style: italic; }
              .terms-box { font-size: 12px; background-color: #fff3f3; padding: 15px; border: 1px solid #e31e24; margin-bottom: 20px; border-radius: 8px; }
              .mobile-back-btn { background: #e31e24; color: white; border: none; padding: 16px 32px; font-size: 18px; border-radius: 50px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(227,30,36,0.3); margin-top: 20px; }
              
              @media print {
                  .doc-section, table, .terms-box { page-break-inside: avoid; }
                  body { padding: 0; }
                  .no-print { display: none !important; }
              }
            </style>
          </head><body>
            <div class="no-print" style="text-align: center; padding: 15px; background: #fff3f3; border-bottom: 2px solid #e31e24; margin-bottom: 20px;">
                <h4 style="color: #e31e24; margin: 0 0 10px 0;">PDF Document Generator</h4>
                <p style="margin: 0 0 15px 0;">The print dialog should open automatically. If you are on a mobile device and this window does not close automatically, tap the button below.</p>
                <button class="mobile-back-btn" onclick="window.close(); window.history.back();">← Close & Return to Dashboard</button>
            </div>

            <div class="logo-header">
              <img src="${logoImg}" alt="Company Logo" />
              <span class="company-name">LIZZA FACILITY MANAGEMENT</span>
            </div>
            
            
            <div style="text-align: center; font-size: 11px; color: #64748b; letter-spacing: 1.5px; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 25px; text-transform: uppercase;">
              Privileged & Confidential • Admin/HR Use Only
            </div>
            
            <h3 class="section-header" style="margin-top:0;">1. Identity & Employment Status</h3>
            <div class="flex-row">
              <div><img src="${emp?.profile_photo_path || 'https://via.placeholder.com/150'}" class="photo" alt="Profile" /></div>
              <div class="details">
                <table>
                  <tr><th>Full Name</th><td style="font-weight: bold; font-size: 16px;">${emp?.full_name || 'N/A'}</td></tr>
                  <tr><th>System Role</th><td style="text-transform: uppercase; font-weight:bold; color: #f40505;">${emp?.user_type || 'N/A'}</td></tr>
                  <tr><th>Assigned Dept/Site</th><td>${emp?.department || 'N/A'} - ${emp?.unit_name || 'Dynamic'}</td></tr>
                  <tr><th>Onboarded By</th><td style="font-weight:bold;">${emp?.onboarded_by_name || 'Admin / Direct Hire'}</td></tr>
                  <tr><th>Designation</th><td>${emp?.designation || 'N/A'}</td></tr>
                  <tr><th>Primary Mobile</th><td>${emp?.phone_number || 'N/A'}</td></tr>
                  <tr><th>KYC Authenticity</th><td>${kycStatusHtml}</td></tr>
                </table>
              </div>
            </div>

            <h3 class="section-header">2. Demographics, Medical & Uniform</h3>
            <table>
              <tr><th>Date of Birth</th><td>${emp?.dob || 'N/A'}</td><th>Blood Group</th><td style="color:#e31e24; font-weight:bold;">${emp?.blood_group || 'N/A'}</td></tr>
              <tr><th>Gender</th><td>${emp?.gender || 'N/A'}</td><th>Height (cm)</th><td>${emp?.height || 'N/A'}</td></tr>
              <tr><th>Marital Status</th><td>${emp?.marital_status || 'N/A'}</td><th>Nationality</th><td>${emp?.nationality || 'N/A'}</td></tr>
              <tr><th>Father's Name</th><td>${emp?.father_name || 'N/A'}</td><th>Religion</th><td>${emp?.religion || 'N/A'}</td></tr>
              <tr><th>Mother's Name</th><td>${emp?.mother_name || 'N/A'}</td><th>Category/Caste</th><td>${emp?.category || '-'} / ${emp?.caste || '-'}</td></tr>
              <tr><th>Identity Mark</th><td colspan="3">${emp?.identity_mark || 'None'}</td></tr>
              <tr><th>Medical Remarks</th><td>${emp?.medical_remarks || 'None'}</td><th>Uniform Sizes</th><td style="font-weight:bold; color:#0d6efd;">${emp?.uniform_details || 'Not Specified'}</td></tr>
            </table>

            <h3 class="section-header">3. Address Information</h3>
            <table>
              <tr><th colspan="2" style="text-align:center; background-color:#e2e8f0; color:#0f172a;">Permanent Address</th><th colspan="2" style="text-align:center; background-color:#e2e8f0; color:#0f172a;">Temporary Address</th></tr>
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
                <tr><th>Gov ID (UID) Number</th><td style="font-weight:bold;">${emp?.aadhar_raw && emp.aadhar_raw !== 'N/A' ? emp.aadhar_raw : 'Not Provided'}</td><th>PAN Number</th><td style="font-weight:bold;">${emp?.pan_raw && emp.pan_raw !== 'N/A' ? emp.pan_raw : 'Not Provided'}</td></tr>
                <tr><th>Voter ID</th><td>${emp?.voter_id_raw && emp.voter_id_raw !== 'N/A' ? emp.voter_id_raw : 'Not Provided'}</td><th>Driving Licence</th><td>${emp?.dl_raw && emp.dl_raw !== 'N/A' ? emp.dl_raw : 'Not Provided'}</td></tr>
                <tr><th>Passport Number</th><td colspan="3">${emp?.passport_raw && emp.passport_raw !== 'N/A' ? emp.passport_raw : 'Not Provided'}</td></tr>
            </table>

            <h3 class="section-header">5. Salary & Banking Details</h3>
            <table>
                <tr><th>Bank Name</th><td>${emp?.bank_name || 'N/A'}</td><th>IFSC Code</th><td>${emp?.ifsc_code || 'N/A'}</td></tr>
                <tr><th>Account Number</th><td colspan="3" style="font-weight:bold; letter-spacing: 1px;">${emp?.account_number_raw && emp.account_number_raw !== 'N/A' ? emp.account_number_raw : 'Not Provided'}</td></tr>
            </table>

            <h3 class="section-header">6. Education History</h3>
            ${eduHtml}

            <h3 class="section-header">7. Prior Work Experience</h3>
            ${expHtml}

            <h3 class="section-header">8. Family Details</h3>
            ${famHtml}

            <h3 class="section-header">9. Reference Details</h3>
            ${refHtml}
            ${termsHtml}
            <div style="page-break-before: always;"></div>
            <h3 class="section-header" style="text-align:center; background-color:#0f172a; color:white; padding:12px; border-radius: 8px;">APPENDIX: OFFICIAL DOCUMENTS & EVIDENCE</h3>
            ${docsHtml || '<p style="text-align: center; color: #94a3b8; margin-top: 30px;">No documents uploaded to this profile.</p>'}
            
            <div class="no-print" style="text-align: center; margin: 40px 0; padding: 20px;">
                <button class="mobile-back-btn" onclick="window.close(); window.history.back();">← Return to Dashboard</button>
            </div>

            <script>
              window.onload = function() {
                  setTimeout(() => { 
                      window.print(); 
                  }, 1200);
              };
            </script>
          </body></html>
      `);
      printWindow.document.close();
  };

  if (loading) return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-light">
          <Spinner animation="border" variant="primary" style={{width: '3rem', height: '3rem'}} />
          <h5 className="mt-3 text-primary fw-bold">Loading System Matrix...</h5>
      </div>
  );

  return (
    <>
      <style>
        {`
          .mobile-ui-container { background-color: #f8fafc; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow-x: hidden; padding-bottom: 40px; }
          .glass-card { background: #ffffff; border-radius: 20px; border: none; box-shadow: 0 4px 15px rgba(0,0,0,0.04); transition: transform 0.2s, box-shadow 0.2s; }
          .glass-card:hover { box-shadow: 0 8px 25px rgba(0,0,0,0.08); }
          .active-scale:active { transform: scale(0.96); transition: transform 0.1s; }
          .fade-in { animation: fadeInAnim 0.6s ease-in-out forwards; }
          @keyframes fadeInAnim { from { opacity: 0; } to { opacity: 1; } }
          .slide-up { animation: slideUpAnim 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
          @keyframes slideUpAnim { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .custom-pill-tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 10px; border-bottom: none; gap: 8px; }
          .custom-pill-tabs::-webkit-scrollbar { display: none; }
          .custom-pill-tabs .nav-link { border-radius: 20px; color: #495057; font-weight: 600; padding: 12px 24px; background: #f1f5f9; border: none; white-space: nowrap; transition: all 0.2s ease; }
.custom-pill-tabs .nav-link:hover { color: #e31e24; background: #fff3f3; }
          .custom-pill-tabs .nav-link.active { background: #f31212; color: white; box-shadow: 0 4px 12px rgba(246, 59, 59, 0.3); }
          .custom-input { border-radius: 12px; background-color: #f8fafc; border: 1.5px solid #e2e8f0; padding: 12px 16px; font-size: 14px; transition: all 0.2s; }
          .custom-input:focus { background-color: #fff; border-color: #f31010; box-shadow: 0 0 0 4px rgba(249, 3, 40, 0.1); outline: none; }
          .stat-widget { background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border-radius: 20px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; }
        `}
      </style>

      <div className="mobile-ui-container py-4 fade-in">
        <Container fluid="xl" className="px-3 px-md-4">
          
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h4 className="fw-bolder text-dark mb-1 d-flex align-items-center"><UserCog className="text-primary me-2" size={28} /> System Admin</h4>
              <p className="text-muted small mb-0">Operations & Master Control Matrix</p>
            </div>
            <div className="d-flex gap-2">
                <Button variant="light" size="sm" className="rounded-circle shadow-sm p-2 active-scale" onClick={fetchBaseData} disabled={loading}>
                    <RefreshCw size={20} className={loading ? "text-muted" : "text-primary"} />
                </Button>
                <Button variant="danger" className="rounded-pill shadow-sm fw-bold active-scale d-none d-md-flex align-items-center px-4" onClick={() => setShowAddEmp(true)}>
                    <Plus className="me-1" size={18}/> Onboard Staff
                </Button>
            </div>
          </div>
          
          <div className="d-md-none mb-4">
              <Button variant="danger" className="w-100 rounded-pill shadow-sm fw-bold active-scale d-flex align-items-center justify-content-center py-2" onClick={() => setShowAddEmp(true)}>
                  <Plus className="me-2" size={18}/> Onboard Direct Staff
              </Button>
          </div>

          <Tabs activeKey={mainTab} onSelect={(k) => setMainTab(k)} className="custom-pill-tabs mb-4 slide-up">
            
            <Tab eventKey="overview" title="System Overview">
              <Row className="mb-4 g-3 mt-2">
                <Col xs={12} md={4}><div className="stat-widget d-flex align-items-center"><Users size={36} className="text-secondary opacity-50 me-3"/><div><div className="text-muted small fw-bold tracking-wide">TOTAL STAFF</div><h3 className="fw-bolder mb-0 text-dark">{employees.length}</h3></div></div></Col>
                <Col xs={12} md={4}><div className="stat-widget d-flex align-items-center"><UserCheck size={36} className="text-danger opacity-50 me-3"/><div><div className="text-danger small fw-bold tracking-wide">VERIFIED EMPLOYEES</div><h3 className="fw-bolder mb-0 text-danger">{verified.length}</h3></div></div></Col>
                <Col xs={12} md={4}><div className="stat-widget d-flex align-items-center"><MapPin size={36} className="text-success opacity-50 me-3"/><div><div className="text-success small fw-bold tracking-wide">ASSIGNED SITES</div><h3 className="fw-bolder mb-0 text-success">{locations.length}</h3></div></div></Col>
              </Row>

              <Row className="g-4 mb-4">
                <Col xs={12} lg={4} className="order-2 order-lg-1">
                  <Card className="glass-card h-100">
                    <Card.Body className="p-4 d-flex flex-column">
                      <h6 className="fw-bold mb-4 d-flex align-items-center text-dark"><Building2 size={20} className="me-2 text-danger"/> Office Branches</h6>
                      <Button variant="info" className="w-100 mb-4 rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center text-white active-scale py-2" onClick={() => { setEditingEmp(null); setEmpSearchQuery(''); setEditEmpModal(true); }}>
                        <Edit2 size={16} className="me-2"/> Master Employee Editor
                      </Button>
                      
                      <div className="bg-light p-3 rounded-4 mb-4 border">
                          <Form onSubmit={handleAddBranch}>
                            <Form.Control className="custom-input mb-2 border-0 shadow-sm" placeholder="New Branch Name" value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} required />
                            <div className="d-flex gap-2">
                              <Form.Control className="custom-input border-0 shadow-sm" placeholder="Latitude" value={newLoc.lat} onChange={e => setNewLoc({...newLoc, lat: e.target.value})} required />
                              <Form.Control className="custom-input border-0 shadow-sm" placeholder="Longitude" value={newLoc.lon} onChange={e => setNewLoc({...newLoc, lon: e.target.value})} required />
                            </div>
                            <Button type="submit" variant="dark" className="w-100 mt-3 rounded-pill fw-bold shadow-sm active-scale">Deploy Branch</Button>
                          </Form>
                      </div>

                      <div style={{maxHeight: '220px', overflowY: 'auto'}} className="pe-2 mt-auto border-top pt-3">
                          {locations.map(loc => (
                              <div key={loc.id} className="d-flex justify-content-between align-items-center p-3 mb-2 bg-light rounded-4 border shadow-sm">
                                  <span className="fw-bold text-dark small">{loc.name}</span>
                                  <div className="d-flex gap-2">
                                      <div className="bg-white p-2 rounded-circle shadow-sm" style={{cursor: 'pointer'}} onClick={() => handleSiteZoom(loc.id)}><Crosshair size={14} className="text-success"/></div>
                                      <div className="bg-white p-2 rounded-circle shadow-sm" style={{cursor: 'pointer'}} onClick={() => { setEditingLoc(loc); setEditLocModal(true); }}><Edit2 size={14} className="text-primary"/></div>
                                      <div className="bg-white p-2 rounded-circle shadow-sm" style={{cursor: 'pointer'}} onClick={() => deleteLoc(loc.id)}><Trash2 size={14} className="text-danger"/></div>
                                  </div>
                              </div>
                          ))}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col xs={12} lg={8} className="order-1 order-lg-2">
                  <Card className="glass-card overflow-hidden h-100" style={{ minHeight: '500px' }}>
                    <Card.Header className="bg-white p-3 border-bottom d-flex flex-column flex-md-row gap-3 w-100">
                      <div className="input-group">
                        <span className="input-group-text bg-light border-end-0 rounded-start-pill ps-3"><Building2 size={16} className="text-muted"/></span>
                        <Form.Select className="border-start-0 bg-light rounded-end-pill shadow-none fw-bold text-dark" value={mapSiteSearch} onChange={(e) => handleSiteZoom(e.target.value)}>
                          <option value="">Zoom to Branch/Site...</option>
                          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </Form.Select>
                      </div>
                      <div className="input-group">
                        <span className="input-group-text bg-light border-end-0 rounded-start-pill ps-3"><UserCheck size={16} className="text-muted"/></span>
                        <Form.Select className="border-start-0 bg-light rounded-end-pill shadow-none fw-bold text-dark" value={mapEmpSearch} onChange={(e) => handleEmpZoom(e.target.value)}>
                          <option value="">Locate Specific Employee...</option>
                          {liveLocations.filter(loc => loc.lat && loc.lon && loc.present === true).map(l => (
                            <option key={l.email} value={l.email}>{l.name} ({l.user_type === 'field_officer' ? 'Field Officer' : 'Staff'})</option>
                          ))}
                        </Form.Select>
                      </div>
                    </Card.Header>
                    <div style={{ height: 'calc(100% - 70px)' }}>
                      <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
                        <MapUpdater center={mapCenter} zoom={mapZoom} />
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        
                       {liveLocations.filter(loc => loc.lat && loc.lon && loc.present === true).map(loc => (
                          <Marker key={`${loc.email}-${loc.lat}-${loc.lon}`} position={[loc.lat, loc.lon]} icon={getStatusIcon(loc.present)}>
                            <Popup className="rounded-4 overflow-hidden border-0 shadow-sm">
                              <div className="text-center p-2">
                                  <strong className="d-block fs-6">{loc.name || 'Unknown'}</strong>
                                  <small className="text-muted d-block text-uppercase mt-1">{loc.user_type?.replace('_', ' ')}</small>
                                  <Badge bg="success" className="mt-2 mb-2 rounded-pill px-3 py-1">Active / Checked In</Badge>
                                  {loc.user_type === 'field_officer' && (
                                    <Button variant="primary" size="sm" className="w-100 mt-2 rounded-pill fw-bold shadow-sm" onClick={() => { setRouteViewerUserId(loc.user_id); setRouteViewerName(loc.name); }}>
                                      <MapIcon size={14} className="me-1"/> Day Path
                                    </Button>
                                  )}
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                        {locations.map(office => (
                          <Circle key={office.id} center={[office.lat, office.lon]} radius={office.radius || 200} pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 2 }}>
                            <Popup>{office.name} Geofence ({office.radius || 200}m)</Popup>
                          </Circle>
                        ))}
                      </MapContainer>
                    </div>
                  </Card>
                </Col>
              </Row>

              <Card className="glass-card mb-4">
                <div className="table-responsive">
                    <Table hover className="align-middle mb-0 small border-0">
                    <thead className="bg-light text-muted small text-uppercase tracking-wide">
                        <tr><th className="ps-4 py-3 border-0 rounded-top-start-4">Full Name</th><th className="border-0">Email / ID</th><th className="border-0">Branch</th><th className="border-0">Manager</th><th className="border-0">Shift & Role</th><th className="pe-4 border-0 rounded-top-end-4 text-end">Actions</th></tr>
                    </thead>
                    <tbody className="border-top-0">
                        {verified.map(emp => (
                        <tr key={emp.id}>
                            <td className="ps-4 py-3 border-bottom"><div className="fw-bold text-dark fs-6">{emp.full_name || 'N/A'}</div></td>
                            <td className="border-bottom">
                                <div className="text-muted mb-1">{emp.email || 'N/A'}</div>
                                <Badge bg="light" text="dark" className="border shadow-sm">{emp.blockchain_id || 'Pending'}</Badge>
                            </td>
                            
                            <td className="border-bottom">
                            <Form.Select className="custom-input py-2 shadow-none border-0 bg-light" value={emp.location_id || ''} onChange={e => {
                                const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                                if (target) { target.location_id = parseInt(e.target.value); setEmployees(updated); }
                            }}>
                                <option value="">Select Site...</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </Form.Select>
                            </td>

                            <td className="border-bottom">
                            <Form.Select className="custom-input py-2 shadow-none border-0 bg-light" value={emp.manager_id || ''} onChange={e => {
                                const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                                if (target) { target.manager_id = e.target.value ? parseInt(e.target.value) : null; setEmployees(updated); }
                            }}>
                                <option value="">No Manager</option>
                                {employees.filter(m => m?.user_type === 'manager').map(mgr => (
                                <option key={mgr.id} value={mgr.id}>{mgr.full_name}</option>
                                ))}
                            </Form.Select>
                            </td>

                            <td className="border-bottom" style={{minWidth: '220px'}}>
                                <div className="d-flex gap-2 mb-2">
                                    <Form.Control className="custom-input py-1 px-2 text-center border-0 bg-light shadow-sm w-50" type="time" value={emp.shift_start || ''} onChange={e => {
                                        const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                                        if (target) { target.shift_start = e.target.value; setEmployees(updated); }
                                    }} disabled={emp.user_type === 'field_officer'} />
                                    <Form.Control className="custom-input py-1 px-2 text-center border-0 bg-light shadow-sm w-50" type="time" value={emp.shift_end || ''} onChange={e => {
                                        const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                                        if (target) { target.shift_end = e.target.value; setEmployees(updated); }
                                    }} disabled={emp.user_type === 'field_officer'} />
                                </div>
                                <Form.Select className="custom-input py-2 shadow-none border-0 bg-light" value={emp.user_type || 'employee'} onChange={e => {
                                    const updated = [...employees]; const target = updated.find(u => u.id === emp.id);
                                    if (target) { target.user_type = e.target.value; setEmployees(updated); }
                                }}>
                                    <option value="employee">Ground Staff</option>
                                    <option value="field_officer">Field Officer</option>
                                    <option value="manager">Manager</option>
                                    <option value="hr">HR</option>
                                </Form.Select>
                            </td>

                            <td className="pe-4 border-bottom text-end">
                                <div className="d-flex flex-wrap gap-2 justify-content-end">
                                    <Button variant="info" className="rounded-circle p-2 shadow-sm d-flex align-items-center text-white" onClick={() => { setSelectedStaff(emp); }} title="View Profile"><Eye size={16}/></Button>
                                    <Button variant="primary" className="rounded-circle p-2 shadow-sm d-flex align-items-center" onClick={() => { setEditingEmp({...emp}); setEditEmpModal(true); }} title="Edit"><Edit2 size={16}/></Button>
                                    <Button variant="success" className="rounded-circle p-2 shadow-sm d-flex align-items-center" onClick={() => handleInlineSave(emp)} title="Save"><Save size={16}/></Button>
                                    <Button variant="danger" className="rounded-circle p-2 shadow-sm d-flex align-items-center" onClick={() => handleDeleteEmp(emp.id)} title="Delete"><Trash2 size={16}/></Button>
                                </div>
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </Table>
                </div>
              </Card>
            </Tab>

            <Tab eventKey="uniforms" title="Uniform Approvals">
                <Card className="glass-card mt-3">
                    <Card.Header className="bg-white py-4 border-bottom-0"><h5 className="m-0 fw-bold d-flex align-items-center text-dark"><Shirt className="me-3 text-primary" size={24}/> Replacements Queue</h5></Card.Header>
                    <div className="table-responsive">
                        <Table hover className="align-middle mb-0">
                            <thead className="table-light text-muted small text-uppercase"><tr><th className="ps-4">Employee</th><th>Requested Items</th><th>Requester</th><th className="pe-4 text-end">Action</th></tr></thead>
                            <tbody>
                                {adhocReqs.length === 0 ? <tr><td colSpan="4" className="text-center py-5 text-muted bg-light border-0">No pending ad-hoc uniform requests.</td></tr> :
                                adhocReqs.map(req => (
                                    <tr key={req.req_id}>
                                        <td className="ps-4 py-3"><div className="fw-bold text-dark">{req.emp_name}</div><Badge bg="light" text="dark" className="border mt-1">{req.emp_id}</Badge></td>
                                        <td className="fw-bold text-primary">{req.details}</td>
                                        <td><span className="text-muted small">{req.requested_by}</span></td>
                                        <td className="pe-4 text-end">
                                            <Button variant="success" className="rounded-pill fw-bold shadow-sm px-4" onClick={() => handleApproveUniform(req.req_id)}>Approve to HR</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </div>
                </Card>
            </Tab>

            <Tab eventKey="tasks" title="Task Deployment">
                <Row className="g-4 mt-2">
                    <Col xs={12} lg={4}>
                        <Card className="glass-card border-0 bg-primary bg-opacity-10 h-100">
                            <Card.Header className="bg-transparent border-0 pt-4 pb-2"><h5 className="fw-bold text-primary d-flex align-items-center"><CheckSquare className="me-2"/> Build Checklist</h5></Card.Header>
                            <Card.Body>
                                <Form onSubmit={handleAssignTask}>
                                    <Form.Group className="mb-3">
                                        <Form.Label className="small fw-bold text-dark">Target Officer</Form.Label>
                                        <Form.Select className="custom-input border-0 shadow-sm" value={newTaskForm.officer_id} onChange={e => setNewTaskForm({...newTaskForm, officer_id: e.target.value})} required>
                                            <option value="">Choose an Officer...</option>
                                            {fieldOfficers.map(o => <option key={o.id} value={o.id}>{o.full_name} ({o.blockchain_id})</option>)}
                                        </Form.Select>
                                    </Form.Group>
                                    <Form.Group className="mb-3">
                                        <Form.Label className="small fw-bold text-dark">Target Site</Form.Label>
                                        <Form.Select className="custom-input border-0 shadow-sm" value={newTaskForm.location_id} onChange={e => setNewTaskForm({...newTaskForm, location_id: e.target.value})} required>
                                            <option value="">Choose a Location...</option>
                                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                        </Form.Select>
                                    </Form.Group>
                                    <Form.Group className="mb-4">
                                        <Form.Label className="small fw-bold text-dark">Execution Date</Form.Label>
                                        <Form.Control className="custom-input border-0 shadow-sm" type="date" value={newTaskForm.assigned_date} onChange={e => setNewTaskForm({...newTaskForm, assigned_date: e.target.value})} required />
                                    </Form.Group>
                                    
                                    <div className="p-3 border rounded-4 bg-white mb-4 shadow-sm">
                                        <Form.Label className="small fw-bold text-primary mb-3">Task Instructions</Form.Label>
                                        {newTaskForm.tasks.map((t, idx) => (
                                            <div key={t.id} className="d-flex mb-2 gap-2">
                                                <Form.Control className="custom-input border-0 bg-light" placeholder={`Task ${idx+1} detail...`} value={t.description} onChange={e => {
                                                    const newT = [...newTaskForm.tasks]; newT[idx].description = e.target.value; setNewTaskForm({...newTaskForm, tasks: newT});
                                                }} required />
                                                {newTaskForm.tasks.length > 1 && (
                                                    <Button variant="danger" className="rounded-3 shadow-sm d-flex align-items-center justify-content-center" onClick={() => {
                                                        const newT = [...newTaskForm.tasks]; newT.splice(idx, 1); setNewTaskForm({...newTaskForm, tasks: newT});
                                                    }}><Trash2 size={16}/></Button>
                                                )}
                                            </div>
                                        ))}
                                        <Button variant="light" className="w-100 fw-bold border text-primary mt-2 rounded-pill shadow-sm" onClick={() => setNewTaskForm({...newTaskForm, tasks: [...newTaskForm.tasks, { id: Date.now(), description: '' }]})}>+ Add Line Item</Button>
                                    </div>
                                    <Button type="submit" variant="primary" className="w-100 fw-bold shadow-sm rounded-pill py-2 active-scale" disabled={taskSubmitting}>
                                        {taskSubmitting ? <Spinner size="sm"/> : "Deploy Task Matrix"}
                                    </Button>
                                </Form>
                            </Card.Body>
                        </Card>
                    </Col>
                    
                    <Col xs={12} lg={8}>
                        <Card className="glass-card h-100">
                            <Card.Header className="bg-white py-4 border-bottom-0"><h5 className="m-0 fw-bold text-dark">Deployment Ledger</h5></Card.Header>
                            <div className="table-responsive">
                                <Table hover className="align-middle mb-0 small border-0">
                                    <thead className="bg-light text-muted small text-uppercase"><tr><th className="ps-4 py-3 border-0 rounded-top-start-4">Date</th><th className="border-0">Officer</th><th className="border-0">Site</th><th className="border-0 text-center">Items</th><th className="border-0">Status</th><th className="pe-4 border-0 rounded-top-end-4 text-end">Report</th></tr></thead>
                                    <tbody className="border-top-0">
                                        {allTasks.length === 0 ? <tr><td colSpan="6" className="text-center text-muted py-5">No tasks assigned yet.</td></tr> :
                                        allTasks.map(task => (
                                            <tr key={task.task_id}>
                                                <td className="ps-4 fw-bold text-dark border-bottom py-3">{task.date}</td>
                                                <td className="border-bottom fw-bold">{task.officer_name}</td>
                                                <td className="border-bottom"><MapPin size={14} className="text-primary me-1"/>{task.site_name}</td>
                                                <td className="border-bottom text-center"><Badge bg="light" text="dark" className="border shadow-sm px-3 rounded-pill">{task.tasks?.length || 0}</Badge></td>
                                                <td className="border-bottom">
                                                    <Badge bg={task.status === 'COMPLETED' ? 'success' : 'warning'} className={`px-3 py-2 rounded-pill shadow-sm ${task.status === 'PENDING' ? 'text-dark' : ''}`}>
                                                        {task.status}
                                                    </Badge>
                                                </td>
                                                <td className="pe-4 border-bottom text-end">
                                                    <Button variant="outline-primary" className="rounded-pill fw-bold shadow-sm d-inline-flex align-items-center" disabled={task.status === 'PENDING'} onClick={() => setViewingTask(task)}>
                                                        <Eye size={16} className="me-1"/> Log
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                        }
                                    </tbody>
                                </Table>
                            </div>
                        </Card>
                    </Col>
                </Row>
            </Tab>

            <Tab eventKey="reports" title="Analytics & Reports">
                <Card className="glass-card mt-3">
                    <Card.Body className="p-4">
                       <Row className="mb-4 g-3 bg-light p-3 rounded-4 border mx-0 align-items-end shadow-sm">
                            {/* Replaced Month/Year with Start/End Date Pickers for better precision */}
                            <Col xs={6} md={3}>
                                <Form.Label className="small fw-bold text-muted ps-1">Start Date</Form.Label>
                                <Form.Control className="custom-input border-0" type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
                            </Col>
                            <Col xs={6} md={3}>
                                <Form.Label className="small fw-bold text-muted ps-1">End Date</Form.Label>
                                <Form.Control className="custom-input border-0" type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
                            </Col>
                            
                            {/* Updated Employee Search with Autocomplete Dropdown */}
                            <Col xs={12} md={6}>
                                <Form.Label className="small fw-bold text-muted ps-1">Employee Search</Form.Label>
                                <div className="position-relative">
                                    <Form.Control 
                                        className="custom-input border-0" 
                                        placeholder="Type name, ID, or email..." 
                                        value={reportOfficerSearch} 
                                        onChange={e => {
                                            setReportOfficerSearch(e.target.value);
                                            setShowReportSuggestions(true);
                                        }}
                                        onFocus={() => setShowReportSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowReportSuggestions(false), 200)}
                                    />
                                    {showReportSuggestions && reportOfficerSearch && (
                                        <div className="position-absolute w-100 bg-white shadow border rounded-3 mt-1 z-3" style={{ maxHeight: '250px', overflowY: 'auto', zIndex: 1050 }}>
                                            {employees.filter(e => 
                                                e.is_verified && 
                                                (e.full_name?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) || 
                                                 e.blockchain_id?.toLowerCase().includes(reportOfficerSearch.toLowerCase()) ||
                                                 e.email?.toLowerCase().includes(reportOfficerSearch.toLowerCase()))
                                            ).map(emp => (
                                                <div key={emp.id} className="p-3 border-bottom text-dark" style={{ cursor: 'pointer' }} onClick={() => {
                                                    setReportOfficerSearch(emp.full_name); 
                                                    setShowReportSuggestions(false);
                                                }}>
                                                    <div className="fw-bold">{emp.full_name}</div>
                                                    <div className="small text-muted">{emp.blockchain_id} - {emp.user_type?.replace('_', ' ')}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Col>
                            
                            <Col xs={12} md={4}>
                                <Form.Label className="small fw-bold text-muted ps-1">Filter by Site</Form.Label>
                                <Form.Select className="custom-input border-0" value={filterSite} onChange={e => setFilterSite(e.target.value)}>
                                    <option value="">All Sites</option>
                                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </Form.Select>
                            </Col>
                            <Col xs={12} md={4}>
                                <Form.Label className="small fw-bold text-muted ps-1">Role Filter</Form.Label>
                                <Form.Select className="custom-input border-0" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
                                    <option value="all">All Operational Staff</option>
                                    <option value="employee">Ground Staff Only</option>
                                    <option value="field_officer">Field Officers Only</option>
                                </Form.Select>
                            </Col>
                            <Col xs={12} md={4}>
                                <Button variant="primary" className="w-100 rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center py-2 active-scale" onClick={() => { fetchReportsData(); fetchAttendanceData(); }}>
                                    <Filter size={18} className="me-2"/> Apply Filters
                                </Button>
                            </Col>
                        </Row>

                        <Tabs activeKey={reportsSubTab} onSelect={(k) => setReportsSubTab(k)} className="custom-pill-tabs mb-4">
                            <Tab eventKey="site-visits" title="Field Officer Visits">
                                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
                                    <h6 className="fw-bold text-dark m-0 d-flex align-items-center"><MapPin className="me-2 text-danger"/> Supervisor Field Logs</h6>
                                    <div className="d-flex gap-2">
                                        <Button variant="outline-dark" size="sm" className="rounded-pill fw-bold shadow-sm d-flex align-items-center" onClick={() => downloadExcel(false)} disabled={fieldReports.length === 0}>
                                            <Download size={14} className="me-2 text-success"/> Export Data
                                        </Button>
                                        <Button variant="dark" size="sm" className="rounded-pill fw-bold shadow-sm d-flex align-items-center" onClick={() => downloadExcel(true)} disabled={fieldReports.length === 0}>
                                            <Download size={14} className="me-2 text-success"/> Export with Photos
                                        </Button>
                                    </div>
                                </div>
                                {reportsLoading ? <div className="text-center py-5"><Spinner animation="border" variant="primary"/></div> : (
                                    <div className="table-responsive">
                                        <Table hover className="align-middle small border-0">
                                            <thead className="bg-light text-muted text-uppercase tracking-wide">
                                                <tr><th className="ps-4 py-3 rounded-top-start-4">Date</th><th>Officer</th><th>Site & Activity</th><th>Duration</th><th className="pe-4 rounded-top-end-4">Evidence</th></tr>
                                            </thead>
                                            <tbody>
                                                {Object.keys(groupedReports).length === 0 ? <tr><td colSpan="5" className="text-center py-5 text-muted">No field visits found.</td></tr> :
                                                Object.keys(groupedReports).sort((a,b) => new Date(b) - new Date(a)).map(date => (
                                                    <React.Fragment key={date}>
                                                        <tr className="bg-light"><td colSpan="5" className="fw-bold text-dark ps-4 border-top border-bottom py-2"><Calendar size={14} className="me-2 text-primary"/>{date}</td></tr>
                                                        {groupedReports[date].map((report, idx) => (
                                                            <tr key={`${date}-${idx}`}>
                                                                <td className="ps-4 border-bottom">{report.time}</td>
                                                                <td className="border-bottom"><div className="fw-bold">{report.officer_name}</div><Badge bg="secondary">{report.officer_id}</Badge></td>
                                                                <td className="border-bottom">
                                                                    <div className="fw-bold text-primary">{report.site_name}</div>
                                                                    <div className="small fw-bold text-dark mt-1">Purpose: {report.purpose}</div>
                                                                    <div className="text-muted small mt-1">{formatRemarks(report.remarks)}</div>
                                                                </td>
                                                                <td className="border-bottom">
                                                                    <div className="small"><strong className="text-success">In:</strong> {report.entry_time}</div>
                                                                    <div className="small"><strong className="text-danger">Out:</strong> {report.exit_time}</div>
                                                                    <Badge bg="light" text="dark" className="border shadow-sm mt-1">{report.duration}</Badge>
                                                                </td>
                                                                <td className="pe-4 border-bottom">
                                                                    {report.photo ? (
                                                                        <div className="position-relative" style={{width: '60px', height: '60px', cursor: 'pointer'}} onClick={() => setPhotoPreview(report.photo)}>
                                                                            <img src={report.photo.split(',')[0]} alt="Visit" style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px'}} className="shadow-sm"/>
                                                                            <div className="position-absolute top-50 start-50 translate-middle bg-dark bg-opacity-50 text-white rounded-circle p-1"><Eye size={12}/></div>
                                                                        </div>
                                                                    ) : <span className="text-muted small">No photo</span>}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </Tab>

                            <Tab eventKey="attendance" title="Staff Attendance Log">
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h6 className="fw-bold text-dark m-0 d-flex align-items-center"><CheckCircle className="me-2 text-success"/> Ground Staff Check-Ins</h6>
                                    <Button variant="dark" size="sm" className="rounded-pill fw-bold shadow-sm d-flex align-items-center" onClick={downloadAttendanceExcel} disabled={attendanceRecords.length === 0}>
                                        <Download size={14} className="me-2 text-success"/> Export Attendance
                                    </Button>
                                </div>
                                {attendanceLoading ? <div className="text-center py-5"><Spinner animation="border" variant="success"/></div> : (
                                    <div className="table-responsive">
                                        <Table hover className="align-middle small border-0">
                                            <thead className="bg-light text-muted text-uppercase tracking-wide">
                                                <tr><th className="ps-4 py-3 rounded-top-start-4">Date</th><th>Employee</th><th>Site</th><th>Check-In</th><th>Check-Out</th><th className="pe-4 rounded-top-end-4">Total Time</th></tr>
                                            </thead>
                                            <tbody>
                                                {attendanceRecords.length === 0 ? <tr><td colSpan="6" className="text-center py-5 text-muted">No attendance records found.</td></tr> :
                                                attendanceRecords.map(att => (
                                                    <tr key={att.attendance_id}>
                                                        <td className="ps-4 fw-bold border-bottom">{att.date}</td>
                                                        <td className="border-bottom"><div className="fw-bold text-dark">{att.employee_name}</div><Badge bg="secondary" className="mt-1">{att.employee_id}</Badge></td>
                                                        <td className="border-bottom fw-bold text-primary">{att.site_name}</td>
                                                        <td className="border-bottom text-success fw-bold">{att.checkin_time}</td>
                                                        <td className="border-bottom text-danger fw-bold">{att.checkout_time}</td>
                                                        <td className="pe-4 border-bottom"><Badge bg="light" text="dark" className="border shadow-sm px-3 py-2 rounded-pill fs-6">{att.duration}</Badge></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </Tab>
                        </Tabs>
                    </Card.Body>
                </Card>
            </Tab>

          </Tabs>

          <Modal show={!!viewingTask} onHide={() => setViewingTask(null)} size="lg" centered backdrop="static">
              <Modal.Header closeButton className="bg-white border-bottom-0 pt-4 px-4"><Modal.Title className="h5 fw-bold text-primary">Evidence Report</Modal.Title></Modal.Header>
              <Modal.Body className="bg-white px-4 pb-4">
                  {viewingTask && (
                      <>
                          <div className="d-flex flex-wrap justify-content-between mb-4 bg-light p-4 rounded-4 border">
                              <div className="mb-2 mb-md-0"><strong className="d-block text-muted small text-uppercase">Assigned Officer</strong> <span className="fw-bold fs-6">{viewingTask.officer_name}</span></div>
                              <div className="mb-2 mb-md-0"><strong className="d-block text-muted small text-uppercase">Target Site</strong> <span className="fw-bold fs-6">{viewingTask.site_name}</span></div>
                              <div><strong className="d-block text-muted small text-uppercase">Date</strong> <span className="fw-bold fs-6">{viewingTask.date}</span></div>
                          </div>
                          <div style={{maxHeight: '60vh', overflowY: 'auto'}} className="pe-2">
                              {viewingTask.completion_data?.map((item, i) => (
                                  <div key={i} className="mb-4 p-4 bg-light border-0 rounded-4 shadow-sm position-relative">
                                      <Badge bg="dark" className="position-absolute top-0 start-0 translate-middle ms-4 mt-2 rounded-circle fs-6 px-2">{i+1}</Badge>
                                      <h6 className="fw-bold text-dark mb-3 mt-2 ps-2">{item.description}</h6>
                                      
                                      <div className="d-flex align-items-center mb-3 bg-white p-2 rounded-pill shadow-sm border d-inline-flex px-3">
                                          {item.is_done ? <><CheckCircle size={16} className="text-success me-2"/> <span className="fw-bold text-success small">Task Completed</span></> : <><AlertTriangle size={16} className="text-danger me-2"/> <span className="fw-bold text-danger small">Not Completed</span></>}
                                      </div>
                                      
                                      <div className="mb-3 bg-white p-3 rounded-4 border shadow-sm">
                                          <strong className="small text-primary d-block mb-1">Officer Field Remarks:</strong> 
                                          <span className="small text-dark fw-bold">{item.remarks || 'No remarks provided.'}</span>
                                      </div>
                                      
                                      {item.photo_url && (
                                          <div className="mt-3 text-center border-0 p-2 bg-white rounded-4 shadow-sm">
                                              <a href={item.photo_url} target="_blank" rel="noreferrer"><img src={item.photo_url} alt="Proof" style={{maxHeight: '200px', objectFit: 'contain'}} className="rounded-3 w-100"/></a>
                                          </div>
                                      )}
                                  </div>
                              ))}
                          </div>
                      </>
                  )}
              </Modal.Body>
          </Modal>

          <Modal show={!!selectedStaff} onHide={() => setSelectedStaff(null)} size="xl" centered>
            <Modal.Header closeButton className="bg-dark text-white border-0 d-flex justify-content-between align-items-center pt-4 px-4">
              <Modal.Title className="h5 mb-0 fw-bold">Employee Profile</Modal.Title>
              <Button variant="primary" className="fw-bold ms-auto me-3 d-flex align-items-center rounded-pill shadow-sm px-4" onClick={() => handlePrintProfile(selectedStaff.id)}>
                <FileText size={18} className="me-2"/> Generate PDF Dossier
              </Button>
            </Modal.Header>
            
            <Modal.Body className="bg-light p-4">
              <Row className="g-4">
                <Col xs={12} lg={3}>
                  <Card className="glass-card p-4 text-center h-100 d-flex flex-column align-items-center">
                    <img src={selectedStaff?.profile_photo_path || "https://via.placeholder.com/150"} alt="Profile" className="img-fluid rounded-circle mb-3 shadow-sm" style={{width: '140px', height: '140px', objectFit: 'cover', border: '4px solid #3b82f6'}} />
                    <h5 className="fw-bold mb-1 text-dark">{selectedStaff?.full_name || 'N/A'}</h5>
                    <Badge bg="primary" className="mb-4 rounded-pill px-3 py-2 shadow-sm">{selectedStaff?.designation || 'N/A'}</Badge>
                    
                    <div className="text-start small w-100 bg-light p-3 rounded-4 border">
                        <div className="mb-2"><strong className="text-muted d-block text-uppercase" style={{fontSize:'10px'}}>Mobile</strong> <span className="fw-bold">{selectedStaff?.phone_number || 'N/A'}</span></div>
                        <div className="mb-2"><strong className="text-muted d-block text-uppercase" style={{fontSize:'10px'}}>Date of Birth</strong> <span className="fw-bold">{selectedStaff?.dob || 'N/A'}</span></div>
                        <div className="mb-2"><strong className="text-muted d-block text-uppercase" style={{fontSize:'10px'}}>Email Address</strong> <span className="fw-bold">{selectedStaff?.personal_email || 'N/A'}</span></div>
                        <div className="mb-0"><strong className="text-muted d-block text-uppercase" style={{fontSize:'10px'}}>Blood Group</strong> <Badge bg="danger">{selectedStaff?.blood_group || 'N/A'}</Badge></div>
                    </div>
                  </Card>
                </Col>
                
                <Col xs={12} lg={9}>
                  <Card className="glass-card p-4 h-100 overflow-auto">
                     <Tabs defaultActiveKey="identity" className="custom-pill-tabs mb-4">
                        <Tab eventKey="identity" title="Identity Framework">
                            <h6 className="fw-bold border-bottom pb-2 mb-4 text-primary mt-2 text-uppercase tracking-wide">Personal Demographics</h6>
                            <Row className="g-4">
                                <Col xs={6} sm={4}><small className="text-muted d-block text-uppercase fw-bold" style={{fontSize:'11px'}}>Gender</small><span className="fw-bold text-dark">{selectedStaff?.gender || 'N/A'}</span></Col>
                                <Col xs={6} sm={4}><small className="text-muted d-block text-uppercase fw-bold" style={{fontSize:'11px'}}>Marital Status</small><span className="fw-bold text-dark">{selectedStaff?.marital_status || 'N/A'}</span></Col>
                                <Col xs={12} sm={4}><small className="text-muted d-block text-uppercase fw-bold" style={{fontSize:'11px'}}>Identity Mark</small><span className="fw-bold text-dark">{selectedStaff?.identity_mark || 'N/A'}</span></Col>
                                <Col xs={12} sm={4}><small className="text-muted d-block text-uppercase fw-bold" style={{fontSize:'11px'}}>Father's Name</small><span className="fw-bold text-dark">{selectedStaff?.father_name || 'N/A'}</span></Col>
                                <Col xs={12} sm={4}><small className="text-muted d-block text-uppercase fw-bold" style={{fontSize:'11px'}}>Mother's Name</small><span className="fw-bold text-dark">{selectedStaff?.mother_name || 'N/A'}</span></Col>
                                <Col xs={12} sm={4}><small className="text-muted d-block text-uppercase fw-bold" style={{fontSize:'11px'}}>Nationality</small><span className="fw-bold text-dark">{selectedStaff?.nationality || 'N/A'}</span></Col>
                            </Row>
                        </Tab>
                     </Tabs>
                  </Card>
                </Col>
              </Row>
            </Modal.Body>
          </Modal>

          <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered backdrop="static">
              <Modal.Header closeButton className="border-0"><Modal.Title className="fw-bold fs-5 text-primary ms-2 mt-2">Onboard Direct Staff</Modal.Title></Modal.Header>
              <Modal.Body className="p-0">
                  <EmployeeOnboardForm locations={locations} onCancel={() => setShowAddEmp(false)} onSuccess={() => { setShowAddEmp(false); fetchBaseData(); }} />
              </Modal.Body>
          </Modal>

          <Modal show={editLocModal} onHide={() => setEditLocModal(false)} centered backdrop="static">
            <Modal.Header closeButton className="border-0 bg-light"><Modal.Title className="fw-bold fs-5">Branch Settings</Modal.Title></Modal.Header>
            <Modal.Body className="bg-light pb-4">
                {editingLoc && (
                    <Form onSubmit={handleUpdateBranch}>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted ps-1">Branch Name</Form.Label>
                            <Form.Control className="custom-input border-0 shadow-sm" value={editingLoc?.name || ''} onChange={e => setEditingLoc({...editingLoc, name: e.target.value})} required />
                        </Form.Group>
                        <Row className="g-3 mb-3">
                            <Col xs={6}>
                                <Form.Group>
                                    <Form.Label className="small fw-bold text-muted ps-1">Latitude</Form.Label>
                                    <Form.Control className="custom-input border-0 shadow-sm" type="number" step="any" value={editingLoc?.lat || ''} onChange={e => setEditingLoc({...editingLoc, lat: e.target.value})} required />
                                </Form.Group>
                            </Col>
                            <Col xs={6}>
                                <Form.Group>
                                    <Form.Label className="small fw-bold text-muted ps-1">Longitude</Form.Label>
                                    <Form.Control className="custom-input border-0 shadow-sm" type="number" step="any" value={editingLoc?.lon || ''} onChange={e => setEditingLoc({...editingLoc, lon: e.target.value})} required />
                                </Form.Group>
                            </Col>
                        </Row>
                        <Form.Group className="mb-4 bg-white p-3 rounded-4 shadow-sm border border-primary border-opacity-25">
                            <Form.Label className="small fw-bold text-primary mb-2">Geofence Radius (in meters)</Form.Label>
                            <Form.Control className="custom-input bg-light border-0" type="number" value={editingLoc?.radius || 200} onChange={e => setEditingLoc({...editingLoc, radius: e.target.value})} required />
                        </Form.Group>
                        <Button type="submit" variant="primary" size="lg" className="w-100 fw-bold rounded-pill shadow-sm active-scale">Update Branch Configuration</Button>
                    </Form>
                )}
            </Modal.Body>
          </Modal>

          <Modal show={editEmpModal} onHide={() => setEditEmpModal(false)} size="xl" centered backdrop="static">
            <Modal.Header closeButton className="border-0 bg-primary text-white pt-4 px-4">
              <Modal.Title className="fw-bold d-flex align-items-center"><Edit2 className="me-3" size={24}/>Master Employee Editor</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-4 bg-light">
              {!editingEmp ? (
                <>
                  <h6 className="fw-bold mb-3 text-dark">Locate Employee Profile</h6>
                  <div className="position-relative mb-4">
                    <Search size={20} className="position-absolute text-primary" style={{top: '14px', left: '16px'}} />
                    <Form.Control type="text" placeholder="Search by name, email, phone, or ID..." value={empSearchQuery} onChange={e => setEmpSearchQuery(e.target.value)} className="custom-input shadow-sm border-0" style={{paddingLeft: '48px', paddingTop: '14px', paddingBottom: '14px'}} />
                  </div>
                  
                  <div style={{maxHeight: '50vh', overflowY: 'auto'}} className="pe-2">
                    {filteredEmployeesForSearch.length === 0 ? (
                      <div className="text-center text-muted py-5 bg-white rounded-4 shadow-sm">No profiles found matching search.</div>
                    ) : (
                      filteredEmployeesForSearch.map(emp => (
                        <Card key={emp.id} className="mb-3 border-0 shadow-sm glass-card" style={{cursor: 'pointer'}}>
                          <Card.Body className="p-3 d-flex justify-content-between align-items-center" onClick={() => { 
                              setEditingEmp({
                                  ...emp, 
                                  aadhar_raw: '', pan_raw: '', account_number_raw: '', voter_id_raw: '', dl_raw: ''
                              }); 
                              setEmpSearchQuery(''); 
                              setEditEmpTab('profile');
                          }}>
                            <div className="d-flex align-items-center">
                              <img src={emp.profile_photo_path || "https://via.placeholder.com/150"} alt="Avatar" className="rounded-circle me-3 border" style={{width:'50px', height:'50px', objectFit:'cover'}}/>
                              <div>
                                <h6 className="mb-0 fw-bold text-dark">{emp.full_name}</h6>
                                <div className="text-muted small"><Phone size={12} className="me-1"/>{emp.phone_number || 'N/A'} • {emp.email}</div>
                              </div>
                            </div>
                            <Badge bg="primary" className="rounded-pill px-3 py-2 shadow-sm text-uppercase">{emp.user_type?.replace('_', ' ')}</Badge>
                          </Card.Body>
                        </Card>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <Form onSubmit={handleEditEmpSave}>
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 pb-3 border-bottom gap-3">
                    <div>
                        <h5 className="mb-1 fw-bold text-dark">{editingEmp.full_name}</h5>
                        <Badge bg="dark" className="rounded-pill px-3 shadow-sm">{editingEmp.blockchain_id}</Badge>
                    </div>
                    <Button variant="outline-secondary" className="rounded-pill fw-bold" onClick={() => { setEditingEmp(null); setEmpSearchQuery(''); }}>← Select Another</Button>
                  </div>

                  <Tabs activeKey={editEmpTab} onSelect={(k) => setEditEmpTab(k)} className="custom-pill-tabs mb-4">
                    
                    <Tab eventKey="profile" title="Identity & Role">
                      <Card className="glass-card mt-2">
                        <Card.Body className="p-4">
                            <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary mt-2">Core Identity</h6>
                            <Row className="g-4 mb-4">
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Full Legal Name</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.full_name || ''} onChange={e => setEditingEmp({...editingEmp, full_name: e.target.value})} /></Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Date of Birth</Form.Label><Form.Control type="date" className="custom-input border-0 bg-light shadow-sm" value={editingEmp.dob || ''} onChange={e => setEditingEmp({...editingEmp, dob: e.target.value})} /></Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Official Email</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" type="email" value={editingEmp.email || ''} onChange={e => setEditingEmp({...editingEmp, email: e.target.value})} /></Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Primary Phone</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.phone_number || ''} onChange={e => setEditingEmp({...editingEmp, phone_number: e.target.value})} /></Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Personal Email</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" type="email" value={editingEmp.personal_email || ''} onChange={e => setEditingEmp({...editingEmp, personal_email: e.target.value})} /></Form.Group>
                                </Col>
                            </Row>

                            <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary mt-4">System Role & Deployment</h6>
                            <Row className="g-4">
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">System Role (Privilege Level)</Form.Label>
                                    <Form.Select className="custom-input border-primary border-2 bg-primary bg-opacity-10 text-primary fw-bold shadow-sm" value={editingEmp.user_type || 'employee'} onChange={e => setEditingEmp({...editingEmp, user_type: e.target.value})}>
                                    <option value="employee" className="text-dark">Ground Staff</option>
                                    <option value="field_officer" className="text-dark">Field Officer</option>
                                    <option value="hr" className="text-dark">HR Admin</option>
                                    <option value="manager" className="text-dark">Site Manager</option>
                                    </Form.Select>
                                </Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Department</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.department || ''} onChange={e => setEditingEmp({...editingEmp, department: e.target.value})} /></Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Designation</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.designation || ''} onChange={e => setEditingEmp({...editingEmp, designation: e.target.value})} /></Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Assigned Site / Geofence</Form.Label>
                                    <Form.Select className="custom-input border-0 bg-light shadow-sm" value={editingEmp.location_id || ''} onChange={e => setEditingEmp({...editingEmp, location_id: e.target.value ? parseInt(e.target.value) : null})}>
                                        <option value="">No Base Site</option>
                                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </Form.Select>
                                </Form.Group>
                                </Col>
                                <Col xs={12} md={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Reporting Manager</Form.Label>
                                    <Form.Select className="custom-input border-0 bg-light shadow-sm" value={editingEmp.manager_id || ''} onChange={e => setEditingEmp({...editingEmp, manager_id: e.target.value ? parseInt(e.target.value) : null})}>
                                        <option value="">No Manager Assigned</option>
                                        {employees.filter(m => m?.user_type === 'manager').map(mgr => (
                                        <option key={mgr.id} value={mgr.id}>{mgr.full_name}</option>
                                        ))}
                                    </Form.Select>
                                </Form.Group>
                                </Col>
                                <Col xs={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Shift Start</Form.Label><Form.Control type="time" className="custom-input border-0 bg-light shadow-sm text-center" value={editingEmp.shift_start || ''} onChange={e => setEditingEmp({...editingEmp, shift_start: e.target.value})} disabled={editingEmp.user_type === 'field_officer'}/></Form.Group>
                                </Col>
                                <Col xs={6}>
                                <Form.Group><Form.Label className="small fw-bold text-muted ps-1">Shift End</Form.Label><Form.Control type="time" className="custom-input border-0 bg-light shadow-sm text-center" value={editingEmp.shift_end || ''} onChange={e => setEditingEmp({...editingEmp, shift_end: e.target.value})} disabled={editingEmp.user_type === 'field_officer'}/></Form.Group>
                                </Col>
                            </Row>
                        </Card.Body>
                      </Card>
                    </Tab>

                    <Tab eventKey="demo" title="Demographics">
                      <Card className="glass-card mt-2">
                        <Card.Body className="p-4">
                            <h6 className="fw-bold mb-3 text-primary border-bottom pb-2">Medical & Profile Data</h6>
                            <Row className="g-3 mb-4">
                                <Col xs={6} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Gender</Form.Label><Form.Select className="custom-input border-0 bg-light shadow-sm" value={editingEmp.gender || ''} onChange={e => setEditingEmp({...editingEmp, gender: e.target.value})}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></Form.Select></Form.Group></Col>
                                <Col xs={6} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Marital Status</Form.Label><Form.Select className="custom-input border-0 bg-light shadow-sm" value={editingEmp.marital_status || ''} onChange={e => setEditingEmp({...editingEmp, marital_status: e.target.value})}><option value="">Select</option><option value="Single">Single</option><option value="Married">Married</option></Form.Select></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Blood Group</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm text-danger fw-bold" value={editingEmp.blood_group || ''} onChange={e => setEditingEmp({...editingEmp, blood_group: e.target.value})} /></Form.Group></Col>
                                <Col xs={6} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Height (cm)</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.height || ''} onChange={e => setEditingEmp({...editingEmp, height: e.target.value})} /></Form.Group></Col>
                                <Col xs={6} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Religion</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.religion || ''} onChange={e => setEditingEmp({...editingEmp, religion: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Nationality</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.nationality || ''} onChange={e => setEditingEmp({...editingEmp, nationality: e.target.value})} /></Form.Group></Col>
                                <Col xs={6} md={6}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Category</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.category || ''} onChange={e => setEditingEmp({...editingEmp, category: e.target.value})} /></Form.Group></Col>
                                <Col xs={6} md={6}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Caste</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.caste || ''} onChange={e => setEditingEmp({...editingEmp, caste: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={6}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Father's Name</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.father_name || ''} onChange={e => setEditingEmp({...editingEmp, father_name: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={6}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Mother's Name</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.mother_name || ''} onChange={e => setEditingEmp({...editingEmp, mother_name: e.target.value})} /></Form.Group></Col>
                                <Col xs={12}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Identity Mark</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.identity_mark || ''} onChange={e => setEditingEmp({...editingEmp, identity_mark: e.target.value})} /></Form.Group></Col>
                                <Col xs={12}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Medical Remarks</Form.Label><Form.Control as="textarea" rows={2} className="custom-input border-0 bg-light shadow-sm" value={editingEmp.medical_remarks || ''} onChange={e => setEditingEmp({...editingEmp, medical_remarks: e.target.value})} /></Form.Group></Col>
                            </Row>
                        </Card.Body>
                      </Card>
                    </Tab>

                    <Tab eventKey="addresses" title="Addresses">
                      <Card className="glass-card mt-2">
                        <Card.Body className="p-4">
                            <h6 className="fw-bold mb-3 text-primary border-bottom pb-2">Permanent Address</h6>
                            <Row className="g-3 mb-4">
                                <Col xs={12}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Full Address</Form.Label><Form.Control as="textarea" rows={2} className="custom-input border-0 bg-light shadow-sm" value={editingEmp.perm_address || ''} onChange={e => setEditingEmp({...editingEmp, perm_address: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">State</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.perm_state || ''} onChange={e => setEditingEmp({...editingEmp, perm_state: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">PIN Code</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.perm_pin || ''} onChange={e => setEditingEmp({...editingEmp, perm_pin: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Alt Mobile</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.perm_mobile || ''} onChange={e => setEditingEmp({...editingEmp, perm_mobile: e.target.value})} /></Form.Group></Col>
                            </Row>
                            <h6 className="fw-bold mb-3 mt-4 text-primary border-bottom pb-2">Temporary / Local Address</h6>
                            <Row className="g-3">
                                <Col xs={12}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Full Address</Form.Label><Form.Control as="textarea" rows={2} className="custom-input border-0 bg-light shadow-sm" value={editingEmp.temp_address || ''} onChange={e => setEditingEmp({...editingEmp, temp_address: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">State</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.temp_state || ''} onChange={e => setEditingEmp({...editingEmp, temp_state: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">PIN Code</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.temp_pin || ''} onChange={e => setEditingEmp({...editingEmp, temp_pin: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Local Mobile</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.temp_mobile || ''} onChange={e => setEditingEmp({...editingEmp, temp_mobile: e.target.value})} /></Form.Group></Col>
                            </Row>
                        </Card.Body>
                      </Card>
                    </Tab>
                    <Tab eventKey="secure" title={<><ShieldAlert size={16} className="me-1 mb-1"/> Bank & KYC Settings</>}>
                      <Card className="glass-card mt-2 border-warning">
                        <Card.Body className="p-4">
                            <Alert variant="warning" className="small fw-bold mb-4 rounded-4 shadow-sm border-0 d-flex">
                                <AlertTriangle size={24} className="me-3 text-warning flex-shrink-0"/>
                                <span><strong>Security Notice:</strong> The fields below accept plain text, but will be <strong>permanently encrypted</strong> into the database immediately upon saving. To preserve existing data, leave the fields blank.</span>
                            </Alert>
                            <h6 className="fw-bold mb-3 text-primary border-bottom pb-2">Banking Details</h6>
                            <Row className="g-3 mb-4">
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">Bank Name</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.bank_name || ''} onChange={e => setEditingEmp({...editingEmp, bank_name: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-muted ps-1">IFSC Code</Form.Label><Form.Control className="custom-input border-0 bg-light shadow-sm" value={editingEmp.ifsc_code || ''} onChange={e => setEditingEmp({...editingEmp, ifsc_code: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={4}><Form.Group><Form.Label className="small fw-bold text-danger ps-1">Override Account Number</Form.Label><Form.Control className="custom-input border-danger border-opacity-50 bg-danger bg-opacity-10 shadow-sm" placeholder="Leave blank to keep current" value={editingEmp.account_number_raw || ''} onChange={e => setEditingEmp({...editingEmp, account_number_raw: e.target.value})} /></Form.Group></Col>
                            </Row>
                            <h6 className="fw-bold mb-3 mt-4 text-primary border-bottom pb-2">Secure KYC Override</h6>
                            <Row className="g-3">
                                <Col xs={12} md={6}><Form.Group><Form.Label className="small fw-bold text-danger ps-1">Override Aadhaar Number</Form.Label><Form.Control className="custom-input border-danger border-opacity-50 bg-danger bg-opacity-10 shadow-sm" placeholder="Leave blank to keep current" value={editingEmp.aadhar_raw || ''} onChange={e => setEditingEmp({...editingEmp, aadhar_raw: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={6}><Form.Group><Form.Label className="small fw-bold text-danger ps-1">Override PAN Number</Form.Label><Form.Control className="custom-input border-danger border-opacity-50 bg-danger bg-opacity-10 shadow-sm" placeholder="Leave blank to keep current" value={editingEmp.pan_raw || ''} onChange={e => setEditingEmp({...editingEmp, pan_raw: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={6}><Form.Group><Form.Label className="small fw-bold text-danger ps-1">Override Voter ID</Form.Label><Form.Control className="custom-input border-danger border-opacity-50 bg-danger bg-opacity-10 shadow-sm" placeholder="Leave blank to keep current" value={editingEmp.voter_id_raw || ''} onChange={e => setEditingEmp({...editingEmp, voter_id_raw: e.target.value})} /></Form.Group></Col>
                                <Col xs={12} md={6}><Form.Group><Form.Label className="small fw-bold text-danger ps-1">Override Driving Licence</Form.Label><Form.Control className="custom-input border-danger border-opacity-50 bg-danger bg-opacity-10 shadow-sm" placeholder="Leave blank to keep current" value={editingEmp.dl_raw || ''} onChange={e => setEditingEmp({...editingEmp, dl_raw: e.target.value})} /></Form.Group></Col>
                            </Row>
                        </Card.Body>
                      </Card>
                    </Tab>
                  </Tabs>

                  <div className="d-flex flex-column flex-md-row gap-3 pt-3 mt-4 border-top">
                    <Button variant="light" onClick={() => { setEditingEmp(null); setEmpSearchQuery(''); setEditEmpTab('profile'); }} className="fw-bold rounded-pill px-5 btn-premium active-scale order-2 order-md-1 shadow-sm border">Discard</Button>
                    <Button type="submit" variant="success" className="fw-bold shadow-sm rounded-pill flex-grow-1 btn-premium d-flex align-items-center justify-content-center active-scale order-1 order-md-2"><Save size={18} className="me-2"/> Save Profile to Database</Button>
                  </div>
                </Form>
              )}
            </Modal.Body>
          </Modal>

          <Modal show={!!photoPreview} onHide={() => setPhotoPreview(null)} centered size="lg" backdrop="static">
            <Modal.Header closeButton className="bg-dark text-white border-0"><Modal.Title className="h6 fw-bold">Geotagged Visual Evidence</Modal.Title></Modal.Header>
            <Modal.Body className="p-0 text-center bg-dark">
                <img src={photoPreview} alt="Geotagged Visit" style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
            </Modal.Body>
          </Modal>

          <Modal show={!!routeViewerUserId} onHide={() => setRouteViewerUserId(null)} size="xl" centered backdrop="static">
            <Modal.Header closeButton className="bg-dark text-white border-0 py-4 px-4">
              <Modal.Title className="h5 fw-bold d-flex align-items-center"><Navigation size={24} className="me-3 text-primary"/> Historical Route Tracking</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0 bg-light" style={{minHeight: '60vh'}}>
              {routeViewerUserId && (
                 <ShiftRouteMap userId={routeViewerUserId} /> 
              )}
            </Modal.Body>
          </Modal>

        </Container>
      </div>
    </>
  );
};
export default AdminDashboard;