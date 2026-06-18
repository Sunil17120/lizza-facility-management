import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Badge, Modal, Form, Tabs, Tab, Spinner } from 'react-bootstrap';
import { UserCheck, Shirt, PackagePlus, ShieldAlert, FileText, CheckCircle, RefreshCw, Users, Eye, ChevronRight, Minus, PlusCircle, Trash2, Building2, MapPin, Plus } from 'lucide-react';
import logoImg from './logo.png';

const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";

// --- Helper Functions for Dossier ---
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
        if (Array.isArray(parsed)) return parsed.filter(item => item && item.name && (item.contact || item.phone || item.mobile));
        if (typeof parsed === 'object' && parsed !== null) return Object.values(parsed).filter(item => item && item.name && (item.contact || item.phone || item.mobile || item.relationship || item.relation));
        return [];
    } catch (e) {
        return [];
    }
};

const HrDashboard = () => {
    const hrEmail = localStorage.getItem('userEmail');
    const [pending, setPending] = useState([]);
    const [activeStaff, setActiveStaff] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [issuedLogs, setIssuedLogs] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    const [showStockModal, setShowStockModal] = useState(false);
    const [newStock, setNewStock] = useState({ item_category: 'Shirt', size: '', quantity: 0 });
    
    const [issueModal, setIssueModal] = useState(false);
    const [selectedUserForIssue, setSelectedUserForIssue] = useState(null);
    const [selectedInventoryId, setSelectedInventoryId] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsSyncing(true);
        const [pendRes, invRes, staffRes, issuedRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/hr/pending-approvals?hr_email=${hrEmail}`).catch(() => ({ok: false})),
            fetch(`${API_BASE_URL}/api/hr/inventory`).catch(() => ({ok: false})),
            fetch(`${API_BASE_URL}/api/admin/employees?admin_email=${hrEmail}`).catch(() => ({ok: false})),
            fetch(`${API_BASE_URL}/api/hr/issued-uniforms`).catch(() => ({ok: false})) 
        ]);
        
        let currentInventory = [];
        if (pendRes.ok) setPending(await pendRes.json());
        if (invRes.ok) {
            currentInventory = await invRes.json();
            setInventory(currentInventory);
        }
        if (staffRes.ok) {
            const allStaff = await staffRes.json();
            setActiveStaff(allStaff.filter(e => e.is_verified));
        }
        if (issuedRes.ok) {
            setIssuedLogs(await issuedRes.json());
        }
        
        setLoading(false);
        setIsSyncing(false);
        return currentInventory; 
    };

    const fieldOfficersAndManagers = activeStaff.filter(emp => emp.user_type === 'field_officer' || emp.user_type === 'manager');
    const groundStaff = activeStaff.filter(emp => emp.user_type === 'employee');

    // --- AUTOMATED INVENTORY ISSUANCE LOGIC ---
    const autoIssueUniforms = async (emp, currentInventory) => {
        if (!emp.uniform_details || emp.uniform_details === 'Not Specified') return;
        
        const parts = emp.uniform_details.split(',');
        for (let part of parts) {
            const splitPart = part.split(':');
            if (splitPart.length === 2) {
                const cat = splitPart[0].trim();
                const sz = splitPart[1].trim();
                
                if (sz !== 'N/A' && sz !== '') {
                    const invItem = currentInventory.find(i => 
                        i.item_category.toLowerCase() === cat.toLowerCase() && 
                        i.size.toString().toLowerCase() === sz.toLowerCase()
                    );
                    
                    if (invItem && invItem.quantity > 0) {
                        await fetch(`${API_BASE_URL}/api/hr/issue-uniform`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ inventory_id: invItem.id, user_id: emp.id, hr_email: hrEmail })
                        });
                    }
                }
            }
        }
    };

    const handleVerify = async (emp) => {
        if (!window.confirm(`Approve ${emp.full_name} and generate LFM ID?`)) return;
        setIsSyncing(true);
        
        const res = await fetch(`${API_BASE_URL}/api/hr/verify-employee`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_email: emp.email, hr_email: hrEmail })
        });
        
        if (res.ok) {
            const currentInv = await fetchData(); 
            await autoIssueUniforms(emp, currentInv);
            
            alert("Employee Verified & Uniform Inventory Adjusted Automatically!");
            fetchData();
        } else {
            setIsSyncing(false);
        }
    };

    const handleAddStock = async (e) => {
        e.preventDefault();
        const res = await fetch(`${API_BASE_URL}/api/hr/add-inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...newStock, hr_email: hrEmail })
        });
        if (res.ok) {
            setShowStockModal(false);
            fetchData();
        }
    };

    const handleAdjustStock = async (category, size, adjustmentAmount) => {
        const res = await fetch(`${API_BASE_URL}/api/hr/add-inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_category: category, size: size, quantity: adjustmentAmount, hr_email: hrEmail })
        });
        if (res.ok) fetchData();
    };

    const handleDeleteStock = async (category, size, currentQuantity) => {
        if (!window.confirm(`Are you sure you want to delete ${category} (Size ${size})? This will set stock to 0.`)) return;
        handleAdjustStock(category, size, -currentQuantity);
    };

    const handleIssueUniform = async (e) => {
        e.preventDefault();
        if (!selectedInventoryId) return alert("Please select an item to issue.");
        
        const res = await fetch(`${API_BASE_URL}/api/hr/issue-uniform`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inventory_id: selectedInventoryId, user_id: selectedUserForIssue.id, hr_email: hrEmail })
        });
        
        if (res.ok) {
            alert(`Kit successfully issued to ${selectedUserForIssue.full_name}!`);
            setIssueModal(false);
            setSelectedUserForIssue(null);
            setSelectedInventoryId('');
            fetchData();
        } else {
            alert("Error issuing item. Stock might be empty.");
        }
    };

    const handlePrintProfile = async (userId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/employee-dossier/${userId}?admin_email=${hrEmail}`);
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
                ? '<span style="color: #10b981; font-weight: bold;">✅ e-KYC Verified</span>' 
                : '<span style="color: #ef4444; font-weight: bold;">⚠️ Manual Verification</span>';

            const eduData = safeParseJSON(emp?.education_json);
            let eduHtml = eduData.length > 0 && eduData[0]?.qualification
                ? `<table><tr><th>Qualification</th><th>Institute</th><th>Year</th><th>Marks</th></tr>` + eduData.map(e => `<tr><td>${e?.qualification||'-'}</td><td>${e?.institute||'-'}</td><td>${e?.year||'-'}</td><td>${e?.marks||'-'}</td></tr>`).join('') + `</table>` 
                : '<p class="text-muted" style="text-align:center;">No education history provided.</p>';

            const expData = safeParseJSON(emp?.experience_json);
            let expHtml = expData.length > 0 && expData[0]?.company
                ? `<table><tr><th>Company Name</th><th>Designation</th><th>Period</th></tr>` + expData.map(e => `<tr><td>${e?.company||'-'}</td><td>${e?.designation||'-'}</td><td>${e?.period||'-'}</td></tr>`).join('') + `</table>`
                : '<p class="text-muted" style="text-align:center;">No prior work experience provided.</p>';

            const famData = safeParseJSON(emp?.family_json);
            let famHtml = famData.length > 0 && famData[0]?.name
                ? `<table><tr><th>Name</th><th>Relationship</th><th>DOB</th></tr>` + famData.map(f => `<tr><td>${f?.name||'-'}</td><td>${f?.relation||'-'}</td><td>${f?.dob||'-'}</td></tr>`).join('') + `</table>`
                : '<p class="text-muted" style="text-align:center;">No family details provided.</p>';

            const refData = parseReferencesJSON(emp?.references_json);
            let refHtml = refData.length > 0
                ? `<table><tr><th>Name</th><th>Contact Number</th><th>Relation / Context</th></tr>` + refData.map(r => `<tr><td>${r?.name||'-'}</td><td>${r?.contact || r?.phone || r?.mobile || '-'}</td><td>${r?.relation || r?.relationship || '-'}</td></tr>`).join('') + `</table>`
                : '<p class="text-muted" style="text-align:center;">No reference details provided.</p>';

            printWindow.document.write(`
                <html><head><title>Dossier_${emp?.full_name || 'Employee'}</title>
                  <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 30px; color: #333; max-width: 900px; margin: auto; font-size: 14px; }
                    .logo-header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #e31e24; padding-bottom: 15px; }
                    .logo-header img { height: 50px; vertical-align: middle; margin-right: 15px; }
                    .logo-header .company-name { font-size: 18px; font-weight: bold; color: #e31e24; vertical-align: middle; display: inline-block; }
                    h2 { text-align: center; color: #ec0404; text-transform: uppercase; margin-bottom: 5px; }
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
                    .mobile-back-btn { background: #e31e24; color: white; border: none; padding: 16px 32px; font-size: 18px; border-radius: 50px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(227,30,36,0.3); margin-top: 20px; }
                    @media print {
                        .doc-section, table { page-break-inside: avoid; }
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
                  
                  <h2>Official HR Dossier</h2>
                  <div style="text-align: center; font-size: 11px; color: #555; letter-spacing: 1.5px; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px; text-transform: uppercase;">
                    Privileged & Confidential • HR Dept Only
                  </div>
                  
                  <h3 class="section-header" style="margin-top:0;">1. Identity & Employment Status</h3>
                  <div class="flex-row">
                    <div><img src="${emp?.profile_photo_path || 'https://via.placeholder.com/150'}" class="photo" alt="Profile" /></div>
                    <div class="details">
                      <table>
                        <tr><th>Full Name</th><td style="font-weight: bold; font-size: 16px;">${emp?.full_name || 'N/A'}</td></tr>
                        <tr><th>System Role</th><td style="text-transform: uppercase; font-weight:bold; color: #0d6efd;">${emp?.user_type || 'N/A'}</td></tr>
                        <tr><th>Assigned Dept/Site</th><td>${emp?.department || 'N/A'} - ${emp?.unit_name || 'Dynamic'}</td></tr>
                        <tr><th>Onboarded By</th><td style="color:#e31e24; font-weight:bold;">${emp?.onboarded_by_name || 'Admin / Direct Hire'}</td></tr>
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
        } catch (error) {
            alert("An error occurred while fetching the secure dossier data.");
        }
    };

    if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>;

    return (
        <>
        <style>
            {`
            .mobile-ui-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; min-height: 100vh;}
            .glass-card { background: #ffffff; border-radius: 20px; border: none; box-shadow: 0 4px 15px rgba(0,0,0,0.04); transition: transform 0.2s, box-shadow 0.2s; }
            .active-scale:active { transform: scale(0.96); transition: transform 0.1s; }
            .fade-in { animation: fadeInAnim 0.6s ease-in-out forwards; }
            @keyframes fadeInAnim { from { opacity: 0; } to { opacity: 1; } }
            .slide-up { animation: slideUpAnim 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
            @keyframes slideUpAnim { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            
            .custom-pill-tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 10px; border-bottom: none; gap: 8px; }
            .custom-pill-tabs::-webkit-scrollbar { display: none; }
            .custom-pill-tabs .nav-link { border-radius: 20px; color: #64748b; font-weight: 600; padding: 12px 24px; background: #f1f5f9; border: none; white-space: nowrap; transition: all 0.2s ease; }
            .custom-pill-tabs .nav-link.active { background: #f40808; color: white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
            
            .custom-input { border-radius: 12px; background-color: #f8fafc; border: 1.5px solid #e2e8f0; padding: 12px 16px; font-size: 16px; transition: all 0.2s; }
            .custom-input:focus { background-color: #fff; border-color: #f31313; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); outline: none; }
            `}
        </style>

        <div className="mobile-ui-container py-4 fade-in">
            <Container fluid="xl" className="px-3 px-md-4">
                
                <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                    <div>
                        <h4 className="fw-bolder text-dark mb-1 d-flex align-items-center"><UserCheck className="me-2 text-primary" size={28} /> HR Department</h4>
                        <p className="text-muted small mb-0">Personnel & Inventory Management</p>
                    </div>
                    <div className="d-flex gap-2">
                        <Button variant="light" size="sm" className="rounded-circle shadow-sm p-2 active-scale" onClick={fetchData} disabled={isSyncing}>
                            <RefreshCw size={20} className={isSyncing ? "text-muted" : "text-primary"} />
                        </Button>
                    </div>
                </div>

                <Tabs defaultActiveKey="approvals" className="custom-pill-tabs mb-4 slide-up">
                    <Tab eventKey="approvals" title={`Pending Setup (${pending.length})`}>
                        <Row className="g-3 mt-2">
                            {pending.length === 0 ? <Col xs={12}><div className="text-center text-muted p-5 bg-white rounded-4 shadow-sm border border-light">No pending approvals.</div></Col> :
                                pending.map(p => (
                                <Col xs={12} lg={6} key={p.id}>
                                    <Card className="glass-card h-100 border-start border-4 border-warning">
                                        <Card.Body className="p-4 d-flex flex-column">
                                            <div className="d-flex justify-content-between align-items-start mb-3">
                                                <div>
                                                    <h5 className="fw-bold mb-1">{p.full_name}</h5>
                                                    <Badge bg="secondary" className="mb-2 text-uppercase">{p.department} - {p.designation}</Badge>
                                                    <div className="small text-muted"><strong className="text-dark">Email:</strong> {p.email}</div>
                                                    <div className="small text-muted"><strong className="text-dark">Phone:</strong> {p.phone_number}</div>
                                                </div>
                                            </div>
                                            
                                            <div className="bg-light p-3 rounded-4 mb-4 border shadow-sm">
                                                <div className="small fw-bold text-primary mb-1">Requested Uniform Kit Details</div>
                                                <div className="fw-bold text-dark">{p.uniform_details || 'Not Specified'}</div>
                                            </div>

                                            <div className="d-flex gap-2 mt-auto">
                                                <Button variant="outline-primary" className="flex-grow-1 rounded-pill fw-bold d-flex align-items-center justify-content-center active-scale" onClick={() => handlePrintProfile(p.id)}>
                                                    <FileText size={16} className="me-2"/> View Dossier
                                                </Button>
                                                <Button variant="success" className="flex-grow-1 rounded-pill fw-bold shadow-sm active-scale" onClick={() => handleVerify(p)}>
                                                    Verify & Generate ID
                                                </Button>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    </Tab>

                    <Tab eventKey="directory" title="Active Staff Directory">
                        
                        <h5 className="fw-bold text-dark mt-4 mb-3 d-flex align-items-center"><ShieldAlert size={20} className="me-2 text-primary"/> Field Officers & Managers</h5>
                        <Row className="g-3 mb-5">
                            {fieldOfficersAndManagers.length === 0 ? <Col xs={12}><div className="text-center text-muted p-4 bg-white rounded-4 shadow-sm border border-light">No supervisory staff found.</div></Col> :
                                fieldOfficersAndManagers.map(emp => (
                                <Col xs={12} md={6} lg={4} key={emp.id}>
                                    <Card className="glass-card h-100 border-start border-4 border-primary bg-primary bg-opacity-10">
                                        <Card.Body className="p-4 d-flex flex-column">
                                            <div className="d-flex align-items-center mb-3">
                                                <img src={emp.profile_photo_path || "https://via.placeholder.com/150"} alt="Profile" className="rounded-circle shadow-sm me-3 bg-white p-1" style={{width: '60px', height: '60px', objectFit: 'cover'}} />
                                                <div>
                                                    <h6 className="fw-bold mb-0 text-dark">{emp.full_name}</h6>
                                                    <Badge bg="primary" className="mt-1">{emp.blockchain_id}</Badge>
                                                </div>
                                            </div>
                                            <div className="small text-muted mb-4 fw-bold">
                                                <Users size={14} className="me-1"/> {emp.department} - {emp.designation}
                                            </div>
                                            
                                            <div className="d-flex flex-column gap-2 mt-auto">
                                                <Button variant="outline-dark" size="sm" className="rounded-pill bg-white fw-bold d-flex align-items-center justify-content-center active-scale shadow-sm" onClick={() => handlePrintProfile(emp.id)}>
                                                    <Eye size={16} className="me-2"/> View Dossier PDF
                                                </Button>
                                                <Button variant="primary" size="sm" className="rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center active-scale" onClick={() => { setSelectedUserForIssue(emp); setIssueModal(true); }}>
                                                    <Shirt size={16} className="me-2"/> Issue Uniform Kit to Officer
                                                </Button>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            ))}
                        </Row>

                        <h5 className="fw-bold text-dark mt-4 mb-3 d-flex align-items-center"><Users size={20} className="me-2 text-success"/> Ground Staff</h5>
                        <Row className="g-3">
                            {groundStaff.length === 0 ? <Col xs={12}><div className="text-center text-muted p-4 bg-white rounded-4 shadow-sm border border-light">No ground staff found.</div></Col> :
                                groundStaff.map(emp => (
                                <Col xs={12} md={6} lg={4} key={emp.id}>
                                    <Card className="glass-card h-100 border-start border-4 border-success">
                                        <Card.Body className="p-4 d-flex flex-column">
                                            <div className="d-flex align-items-center mb-3">
                                                <img src={emp.profile_photo_path || "https://via.placeholder.com/150"} alt="Profile" className="rounded-circle shadow-sm me-3 border" style={{width: '50px', height: '50px', objectFit: 'cover'}} />
                                                <div>
                                                    <h6 className="fw-bold mb-0 text-dark">{emp.full_name}</h6>
                                                    <Badge bg="success" className="mt-1">{emp.blockchain_id}</Badge>
                                                </div>
                                            </div>
                                            <div className="small text-muted mb-4 fw-bold">
                                                <Building2 size={14} className="me-1"/> {emp.department} - {emp.designation}
                                            </div>
                                            
                                            <div className="d-flex flex-column gap-2 mt-auto">
                                                <Button variant="outline-dark" size="sm" className="rounded-pill fw-bold d-flex align-items-center justify-content-center active-scale" onClick={() => handlePrintProfile(emp.id)}>
                                                    <Eye size={16} className="me-2"/> View Dossier PDF
                                                </Button>
                                                <div className="text-center small text-muted fst-italic mt-1">
                                                    Uniforms must be routed via Supervisors.
                                                </div>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    </Tab>

                    <Tab eventKey="inventory" title="Uniform Stock">
                        <Row className="g-4 mt-2">
                            <Col xs={12} lg={8}>
                                <Card className="glass-card border-0">
                                    <Card.Header className="bg-white py-4 d-flex justify-content-between align-items-center border-bottom-0">
                                        <h5 className="m-0 fw-bold d-flex align-items-center text-dark"><PackagePlus className="me-2 text-primary"/> Warehouse Stock</h5>
                                        <Button variant="primary" className="rounded-pill fw-bold shadow-sm px-4 active-scale d-flex align-items-center" onClick={() => setShowStockModal(true)}><PlusCircle size={16} className="me-2"/> Add Stock</Button>
                                    </Card.Header>
                                    <Card.Body className="p-0">
                                        {inventory.length === 0 ? <div className="text-center text-muted py-5">No inventory added yet.</div> : (
                                            <div className="table-responsive">
                                                <table className="table table-hover align-middle mb-0">
                                                    <thead className="table-light text-muted small text-uppercase">
                                                        <tr><th className="ps-4">Item Type</th><th>Size</th><th className="text-center">Units Remaining</th><th className="text-end pe-4">Adjust Inventory</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        {inventory.map(inv => (
                                                            <tr key={inv.id}>
                                                                <td className="ps-4 py-3 fw-bold text-dark">{inv.item_category}</td>
                                                                <td><Badge bg="dark" className="px-3 py-2 rounded-pill fs-6">{inv.size}</Badge></td>
                                                                <td className="text-center">
                                                                    <Badge bg={inv.quantity > 10 ? "success" : inv.quantity > 0 ? "warning" : "danger"} className="fs-6 rounded-circle shadow-sm d-inline-flex align-items-center justify-content-center" style={{width: '40px', height: '40px'}}>
                                                                        {inv.quantity}
                                                                    </Badge>
                                                                </td>
                                                                <td className="text-end pe-4">
                                                                    <div className="d-flex justify-content-end gap-2">
                                                                        <Button variant="outline-danger" size="sm" className="rounded-circle p-2 shadow-sm d-flex align-items-center" title="Subtract 1" onClick={() => handleAdjustStock(inv.item_category, inv.size, -1)} disabled={inv.quantity <= 0}>
                                                                            <Minus size={14}/>
                                                                        </Button>
                                                                        <Button variant="outline-success" size="sm" className="rounded-circle p-2 shadow-sm d-flex align-items-center" title="Add 1" onClick={() => handleAdjustStock(inv.item_category, inv.size, 1)}>
                                                                            <Plus size={14}/>
                                                                        </Button>
                                                                        <Button variant="danger" size="sm" className="rounded-pill px-3 shadow-sm d-flex align-items-center fw-bold ms-2" onClick={() => handleDeleteStock(inv.item_category, inv.size, inv.quantity)}>
                                                                            <Trash2 size={14} className="me-1"/> Delete
                                                                        </Button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </Card.Body>
                                </Card>
                            </Col>
                            
                            <Col xs={12} lg={4}>
                                <Card className="glass-card bg-primary bg-opacity-10 border-0">
                                    <Card.Body className="p-4">
                                        <h6 className="fw-bold pb-2 mb-3 text-primary d-flex align-items-center"><ShieldAlert className="me-2"/> Dispatch Rules</h6>
                                        <div className="bg-white p-3 rounded-4 shadow-sm small text-dark mb-3">
                                            <strong>1. View Requests:</strong> Check the <em>Pending Setup</em> tab for sizes requested by new hires.
                                        </div>
                                        <div className="bg-white p-3 rounded-4 shadow-sm small text-dark mb-3">
                                            <strong>2. Direct Issuance:</strong> Go to the <em>Active Staff Directory</em> tab and click "Issue Uniform Kit" to dispatch physical items to an approved guard.
                                        </div>
                                        <div className="bg-white p-3 rounded-4 shadow-sm small text-dark mb-3">
                                            <strong>3. Ground Staff Limits:</strong> Uniforms cannot be issued directly to ground staff via the dashboard. Route all kits through Field Officers.
                                        </div>
                                        <div className="bg-white p-3 rounded-4 shadow-sm small text-dark">
                                            <strong>4. Auditing:</strong> Every deduction logs your HR email automatically for security audits.
                                        </div>
                                    </Card.Body>
                                </Card>
                            </Col>
                        </Row>
                    </Tab>

                    <Tab eventKey="tracking" title="Dispatch Tracking">
                        <Card className="glass-card border-0 mt-3">
                            <Card.Header className="bg-white py-4 d-flex justify-content-between align-items-center border-bottom-0">
                                <h5 className="m-0 fw-bold d-flex align-items-center text-dark"><MapPin className="me-2 text-success"/> Uniform Dispatch History</h5>
                            </Card.Header>
                            <Card.Body className="p-0">
                                {issuedLogs.length === 0 ? <div className="text-center text-muted py-5 border-top bg-light">No dispatch records found.</div> : (
                                    <div className="table-responsive">
                                        <table className="table table-hover align-middle mb-0">
                                            <thead className="table-light text-muted small text-uppercase">
                                                <tr>
                                                    <th className="ps-4">Date Issued</th>
                                                    <th>Field Officer (Requested By)</th>
                                                    <th>Ground Staff (Recipient)</th>
                                                    <th>Item Category & Size</th>
                                                    <th>Authorized By (HR)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {issuedLogs.map(log => {
                                                    // Cross-reference the database to find the recipient and their onboarder
                                                    const targetStaff = activeStaff.find(s => s.id === log.user_id) || pending.find(s => s.id === log.user_id);
                                                    const staffName = targetStaff ? targetStaff.full_name : `User ID: ${log.user_id}`;
                                                    const requestedBy = targetStaff?.onboarded_by_email ? targetStaff.onboarded_by_email : 'Direct HR / Admin';
                                                    
                                                    return (
                                                        <tr key={log.id}>
                                                            <td className="ps-4 py-3 fw-bold text-dark">{new Date(log.issued_at).toLocaleDateString()}</td>
                                                            <td><Badge bg="info" className="text-dark fw-bold">{requestedBy}</Badge></td>
                                                            <td><div className="fw-bold text-dark">{staffName}</div></td>
                                                            <td className="fw-bold text-success">{log.item_category} - Size {log.size_issued}</td>
                                                            <td className="text-muted small">{log.issued_by}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    </Tab>
                </Tabs>

                {/* Add Stock Modal */}
                <Modal show={showStockModal} onHide={() => setShowStockModal(false)} centered backdrop="static">
                    <Modal.Header closeButton className="border-0"><Modal.Title className="fw-bold fs-5">Receive Warehouse Stock</Modal.Title></Modal.Header>
                    <Modal.Body className="bg-light rounded-bottom p-4">
                        <Form onSubmit={handleAddStock}>
                            <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted ps-1">Item Category</Form.Label>
                                <Form.Select className="custom-input border-0 shadow-sm" value={newStock.item_category} onChange={e => setNewStock({...newStock, item_category: e.target.value})}>
                                    <option value="Shirt">Shirt</option><option value="Pant">Pant</option><option value="Shoes">Shoes</option><option value="Jacket">Jacket</option>
                                </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label className="small fw-bold text-muted ps-1">Size Indicator</Form.Label>
                                <Form.Control className="custom-input border-0 shadow-sm" required placeholder="e.g. L, 34, 9" value={newStock.size} onChange={e => setNewStock({...newStock, size: e.target.value})} />
                            </Form.Group>
                            <Form.Group className="mb-4">
                                <Form.Label className="small fw-bold text-muted ps-1">Units Received</Form.Label>
                                <Form.Control className="custom-input border-0 shadow-sm" type="number" required min="1" value={newStock.quantity} onChange={e => setNewStock({...newStock, quantity: e.target.value})} />
                            </Form.Group>
                            <Button type="submit" variant="primary" size="lg" className="w-100 fw-bold rounded-pill shadow-sm active-scale">Update Master Inventory</Button>
                        </Form>
                    </Modal.Body>
                </Modal>

                {/* Issue Kit Modal */}
                <Modal show={issueModal} onHide={() => { setIssueModal(false); setSelectedUserForIssue(null); setSelectedInventoryId(''); }} centered backdrop="static">
                    <Modal.Header closeButton className="border-0 bg-primary text-white"><Modal.Title className="fw-bold fs-5">Issue Uniform Kit</Modal.Title></Modal.Header>
                    <Modal.Body className="bg-light p-4">
                        {selectedUserForIssue && (
                            <>
                                <div className="text-center mb-4">
                                    <h6 className="fw-bold text-dark mb-0">Target Field Officer</h6>
                                    <div className="text-primary fs-5 fw-bolder">{selectedUserForIssue.full_name}</div>
                                    <Badge bg="secondary" className="mt-1">{selectedUserForIssue.blockchain_id}</Badge>
                                </div>
                                
                                <div className="bg-white p-3 rounded-4 shadow-sm border mb-4 text-center">
                                    <div className="small fw-bold text-muted mb-2">Requested Sizes on Record</div>
                                    <div className="fw-bold text-dark">{selectedUserForIssue.uniform_details || 'No sizes specified in dossier.'}</div>
                                </div>

                                <Form onSubmit={handleIssueUniform}>
                                    <Form.Group className="mb-4">
                                        <Form.Label className="small fw-bold text-muted ps-1">Select Item from Inventory to Issue</Form.Label>
                                        <Form.Select className="custom-input border-0 shadow-sm" required value={selectedInventoryId} onChange={e => setSelectedInventoryId(e.target.value)}>
                                            <option value="">Choose item...</option>
                                            {inventory.filter(i => i.quantity > 0).map(inv => (
                                                <option key={inv.id} value={inv.id}>
                                                    {inv.item_category} - Size {inv.size} ({inv.quantity} left)
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </Form.Group>
                                    <Button type="submit" variant="success" size="lg" className="w-100 fw-bold rounded-pill shadow-sm active-scale d-flex align-items-center justify-content-center">
                                        Dispatch Item <ChevronRight size={18} className="ms-1"/>
                                    </Button>
                                </Form>
                            </>
                        )}
                    </Modal.Body>
                </Modal>

            </Container>
        </div>
        </>
    );
};
export default HrDashboard;