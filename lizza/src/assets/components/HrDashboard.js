import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Badge, Modal, Form, Tabs, Tab, Spinner } from 'react-bootstrap';
import { UserCheck, Shirt, PackagePlus, ShieldAlert, FileText, CheckCircle, RefreshCw, Users, Eye, Building2, MapPin, Search, Trash2 } from 'lucide-react';
import logoImg from './logo.png';

const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";

const safeParseJSON = (jsonStr) => {
    if (!jsonStr || jsonStr === 'null' || jsonStr === 'undefined') return [];
    const parsed = JSON.parse(jsonStr);
    const arr = Array.isArray(parsed) ? parsed : (typeof parsed === 'object' && parsed !== null ? [parsed] : []);
    return arr.filter(item => item !== null && item !== undefined);
};

const parseReferencesJSON = (jsonStr) => {
    if (!jsonStr || jsonStr === 'null' || jsonStr === 'undefined') return [];
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed.filter(item => item && item.name && (item.contact || item.phone || item.mobile));
    if (typeof parsed === 'object' && parsed !== null) return Object.values(parsed).filter(item => item && item.name && (item.contact || item.phone || item.mobile || item.relationship || item.relation));
    return [];
};

const HrDashboard = () => {
    const hrEmail = localStorage.getItem('userEmail');
    const [pending, setPending] = useState([]);
    const [activeStaff, setActiveStaff] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [issuedLogs, setIssuedLogs] = useState([]); 
    const [uniformRequests, setUniformRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [activeDossier, setActiveDossier] = useState(null);
    const [isDossierLoading, setIsDossierLoading] = useState(false);
    const [showStockModal, setShowStockModal] = useState(false);
    const [newStock, setNewStock] = useState({ item_category: 'Shirt', size: '', quantity: 0 });
    
    // New state to hold draft quantities for manual overwriting
    const [draftStock, setDraftStock] = useState({});
    
    const [issueModal, setIssueModal] = useState(false);
    const [selectedUserForIssue, setSelectedUserForIssue] = useState(null);
    const [selectedInventoryId, setSelectedInventoryId] = useState('');
    const [dispatchSearch, setDispatchSearch] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

   const fetchData = async () => {
        setIsSyncing(true);
        const [pendRes, invRes, staffRes, issuedRes, uniReqRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/hr/pending-approvals?hr_email=${hrEmail}`).catch(() => ({ok: false})),
            fetch(`${API_BASE_URL}/api/hr/inventory`).catch(() => ({ok: false})),
            fetch(`${API_BASE_URL}/api/admin/employees?admin_email=${hrEmail}`).catch(() => ({ok: false})),
            fetch(`${API_BASE_URL}/api/hr/issued-uniforms`).catch(() => ({ok: false})),
            fetch(`${API_BASE_URL}/api/hr/pending-uniforms`).catch(() => ({ok: false}))
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
        if (uniReqRes && uniReqRes.ok) {
            setUniformRequests(await uniReqRes.json());
        }
        
        setLoading(false);
        setIsSyncing(false);
        return currentInventory; 
    };

    const fieldOfficersAndManagers = activeStaff.filter(emp => emp.user_type === 'field_officer' || emp.user_type === 'manager');
    const groundStaff = activeStaff.filter(emp => emp.user_type === 'employee');

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

    // Calculate difference and sync with backend
    const handleOverwriteStock = async (inv) => {
        const newQuantity = draftStock[inv.id];
        if (newQuantity === undefined) return;
        const difference = newQuantity - inv.quantity;
        
        const res = await fetch(`${API_BASE_URL}/api/hr/add-inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_category: inv.item_category, size: inv.size, quantity: difference, hr_email: hrEmail })
        });
        
        if (res.ok) {
            const newDrafts = { ...draftStock };
            delete newDrafts[inv.id];
            setDraftStock(newDrafts);
            fetchData();
        }
    };

    const handleDeleteStock = async (invId, category, size) => {
        if (!window.confirm(`Are you sure you want to completely delete ${category} (Size ${size}) from the database?`)) return;
        
        const res = await fetch(`${API_BASE_URL}/api/hr/inventory/${invId}?hr_email=${hrEmail}`, {
            method: 'DELETE'
        });
        if (res.ok) fetchData();
    };

   const handleIssueFullKit = async () => {
        if (!selectedUserForIssue || !selectedUserForIssue.uniform_details) {
            return alert("No uniform sizes specified for this user.");
        }

        setIsSyncing(true);
        let issuedCount = 0;
        let outOfStock = [];

        const parts = selectedUserForIssue.uniform_details.split(',');
        for (let part of parts) {
            const splitPart = part.split(':');
            if (splitPart.length === 2) {
                const cat = splitPart[0].trim();
                const sz = splitPart[1].trim();

                if (sz !== 'N/A' && sz !== '') {
                    const invItem = inventory.find(i => 
                        i.item_category.toLowerCase() === cat.toLowerCase() && 
                        i.size.toString().toLowerCase() === sz.toLowerCase()
                    );

                    if (invItem && invItem.quantity > 0) {
                        const res = await fetch(`${API_BASE_URL}/api/hr/issue-uniform`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ inventory_id: invItem.id, user_id: selectedUserForIssue.id, hr_email: hrEmail })
                        });
                        if (res.ok) issuedCount++;
                    } else {
                        outOfStock.push(`${cat} (Size ${sz})`);
                    }
                }
            }
        }

        setIsSyncing(false);
        
        if (issuedCount > 0) {
            let msg = `Successfully issued ${issuedCount} items to ${selectedUserForIssue.full_name}!`;
            if (outOfStock.length > 0) msg += `\n\nHowever, the following items are OUT OF STOCK and were skipped: ${outOfStock.join(', ')}`;
            alert(msg);
        } else {
            alert(`Could not issue any items. They might be out of stock:\n${outOfStock.join('\n')}`);
        }
        
        setIssueModal(false);
        setSelectedUserForIssue(null);
        fetchData();
    };

const handlePrintProfile = async (userId) => {
    const response = await fetch(`${API_BASE_URL}/api/admin/employee-dossier/${userId}?admin_email=${hrEmail}`);
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
            <p style="color: #e31e24; font-weight: bold;"><em>This document is digitally signed and verified by the LIZZA HR System.</em></p>
            
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

    let docsHtml = '';
    const addDoc = (title, url) => {
        if (url) docsHtml += `<div class="doc-section"><h3 class="doc-title">${title}</h3><img src="${url}" class="doc-img" alt="${title}" /></div>`;
    };
    
    addDoc('Identity / Gov ID', emp?.aadhar_photo_path);
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
    const absoluteLogoUrl = new URL(logoImg, window.location.origin).href;
    const completeHtmlContent = `
        <html>
        <head>
            <title>Dossier_${emp?.full_name || 'Employee'}</title>
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
        </head>
        <body>
            <div class="no-print" style="text-align: center; padding: 15px; background: #fff3f3; border-bottom: 2px solid #e31e24; margin-bottom: 20px;">
                <h4 style="color: #e31e24; margin: 0 0 10px 0;">PDF Document Generator</h4>
                <p style="margin: 0 0 15px 0;">Use your browser menu to save or share as PDF if the system sheet does not appear automatically.</p>
                <button class="mobile-back-btn" onclick="window.close(); setTimeout(function(){ window.location.href = '${window.location.href}'; }, 300);">← Return to Dashboard</button>
            </div>

            <div class="logo-header">
    <img src="${absoluteLogoUrl}" alt="Company Logo" />
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
                        <tr><th>System Role</th><td style="text-transform: uppercase; font-weight:bold; color: #fd0d0d;">${emp?.user_type || 'N/A'}</td></tr>
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
            ${termsHtml}

            <div style="page-break-before: always;"></div>
            <h3 class="section-header" style="text-align:center; background-color:#0f172a; color:white; padding:12px; border-radius: 8px;">APPENDIX: OFFICIAL DOCUMENTS & EVIDENCE</h3>
            ${docsHtml || '<p style="text-align: center; color: #94a3b8; margin-top: 30px;">No documents uploaded to this profile.</p>'}
            
            <script>
                window.onload = function() {
                    setTimeout(() => { 
                        window.print(); 
                    }, 1000);
                };
            </script>
        </body>
        </html>
    `;

    const blob = new Blob([completeHtmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    
    window.open(blobUrl, '_blank');
};

   const groupedDispatch = Object.values(issuedLogs.reduce((acc, log) => {
        const date = new Date(log.issued_at).toLocaleDateString();
        const key = `${log.user_id}-${date}`;
        if (!acc[key]) {
            acc[key] = { ...log, combined_items: [`${log.item_category} (${log.size_issued})`] };
        } else {
            acc[key].combined_items.push(`${log.item_category} (${log.size_issued})`);
        }
        return acc;
    }, {})).sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));

    const filteredDispatch = groupedDispatch.filter(log => {
        const targetStaff = activeStaff.find(s => s.id === log.user_id) || pending.find(s => s.id === log.user_id);
        const staffName = targetStaff ? targetStaff.full_name : `User ID: ${log.user_id}`;
        const searchStr = `${staffName} ${log.combined_items.join(' ')} ${log.issued_by}`.toLowerCase();
        return searchStr.includes(dispatchSearch.toLowerCase());
    });
const activeUniformRequests = uniformRequests;

    if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

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
                    <Tab eventKey="uniform-requests" title={`Approved Requests (${activeUniformRequests.length})`}>
                        <Row className="g-3 mt-2">
                            {activeUniformRequests.length === 0 ? <Col xs={12}><div className="text-center text-muted p-5 bg-white rounded-4 shadow-sm border border-light">No approved uniform requests waiting.</div></Col> :
                                activeUniformRequests.map(req => (
                                <Col xs={12} lg={6} key={req.req_id}>
                                    <Card className="glass-card h-100 border-start border-4 border-info">
                                        <Card.Body className="p-4 d-flex flex-column">
                                            <div className="d-flex justify-content-between align-items-start mb-3">
                                                <div>
                                                    <h5 className="fw-bold mb-1">{req.emp_name}</h5>
                                                    <Badge bg="info" className="mb-2 text-dark">{req.emp_id}</Badge>
                                                    <div className="small text-muted"><strong>Requested By:</strong> {req.requested_by}</div>
                                                </div>
                                            </div>
                                            
                                            <div className="bg-light p-3 rounded-4 mb-4 border shadow-sm">
                                                <div className="small fw-bold text-primary mb-1">Approved Kit Details</div>
                                                <div className="fw-bold text-dark">{req.details}</div>
                                            </div>

                                           <div className="d-flex flex-column gap-2 mt-auto">
    <Button variant="danger" className="w-100 rounded-pill fw-bold shadow-sm active-scale d-flex align-items-center justify-content-center" onClick={() => { 
        // Find the base user, but STRICTLY override their uniform_details with the requested details
        const baseUser = activeStaff.find(u => u.id === req.user_id) || {};
        const userObj = {
            ...baseUser,
            id: req.user_id, 
            full_name: req.emp_name, 
            blockchain_id: req.emp_id, 
            uniform_details: req.details 
        };
        setSelectedUserForIssue(userObj); 
        setIssueModal(true); 
    }}>
        <Shirt size={16} className="me-2"/> Fulfill & Issue Kit
    </Button>
    
    <Button variant="outline-success" className="w-100 rounded-pill fw-bold shadow-sm active-scale d-flex align-items-center justify-content-center" onClick={async () => {
        setIsSyncing(true);
        await fetch(`${API_BASE_URL}/api/hr/complete-uniform-req/${req.req_id}`, { method: 'POST' });
        fetchData();
    }}>
        <CheckCircle size={16} className="me-2"/> Mark Completed
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
                                    <Card className="glass-card h-100 border-start border-4 border-primary bg-danger bg-opacity-10">
                                        <Card.Body className="p-4 d-flex flex-column">
                                            <div className="d-flex align-items-center mb-3">
                                                <img src={emp.profile_photo_path || "https://via.placeholder.com/150"} alt="Profile" className="rounded-circle shadow-sm me-3 bg-white p-1" style={{width: '60px', height: '60px', objectFit: 'cover'}} />
                                                <div>
                                                    <h6 className="fw-bold mb-0 text-dark">{emp.full_name}</h6>
                                                    <Badge bg="danger" className="mt-1">{emp.blockchain_id}</Badge>
                                                </div>
                                            </div>
                                            <div className="small text-muted mb-4 fw-bold">
                                                <Users size={14} className="me-1"/> {emp.department} - {emp.designation}
                                            </div>
                                            
                                            <div className="d-flex flex-column gap-2 mt-auto">
                                                <Button variant="outline-dark" size="sm" className="rounded-pill bg-white fw-bold d-flex align-items-center justify-content-center active-scale shadow-sm" onClick={() => handlePrintProfile(emp.id)}>
                                                    <Eye size={16} className="me-2"/> View Dossier PDF
                                                </Button>
                                                <Button variant="danger" size="sm" className="rounded-pill fw-bold shadow-sm d-flex align-items-center justify-content-center active-scale" onClick={() => { setSelectedUserForIssue(emp); setIssueModal(true); }}>
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
                                        <Button variant="primary" className="rounded-pill fw-bold shadow-sm px-4 active-scale d-flex align-items-center" onClick={() => setShowStockModal(true)}>Add Stock</Button>
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
                                                                    <div className="d-flex justify-content-end gap-2 align-items-center">
                                                                        <Form.Control
                                                                            type="number"
                                                                            min="0"
                                                                            className="custom-input p-1 text-center border"
                                                                            style={{ width: '80px', height: '36px' }}
                                                                            value={draftStock[inv.id] !== undefined ? draftStock[inv.id] : inv.quantity}
                                                                            onChange={(e) => setDraftStock({ ...draftStock, [inv.id]: parseInt(e.target.value, 10) || 0 })}
                                                                        />
                                                                        <Button 
                                                                            variant="success" 
                                                                            size="sm" 
                                                                            className="rounded-pill px-3 shadow-sm d-flex align-items-center fw-bold" 
                                                                            onClick={() => handleOverwriteStock(inv)}
                                                                            disabled={draftStock[inv.id] === undefined || draftStock[inv.id] === inv.quantity}
                                                                        >
                                                                            <RefreshCw size={14} className="me-1"/> Update
                                                                        </Button>
                                                                        <Button 
                                                                            variant="danger" 
                                                                            size="sm" 
                                                                            className="rounded-pill px-3 shadow-sm d-flex align-items-center fw-bold ms-2" 
                                                                            onClick={() => handleDeleteStock(inv.id, inv.item_category, inv.size)}
                                                                        >
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
                            <Card.Header className="bg-white py-4 d-flex flex-column flex-md-row justify-content-between align-items-md-center border-bottom-0 gap-3">
                                <h5 className="m-0 fw-bold d-flex align-items-center text-dark"><MapPin className="me-2 text-success"/> Uniform Dispatch History</h5>
                                
                                <div className="position-relative" style={{ minWidth: '300px' }}>
                                    <Search size={18} className="position-absolute text-muted" style={{top: '12px', left: '14px'}} />
                                    <Form.Control 
                                        type="text" 
                                        placeholder="Search by name, item, or HR email..." 
                                        className="custom-input border-0 bg-light shadow-sm w-100"
                                        style={{paddingLeft: '40px'}}
                                        value={dispatchSearch}
                                        onChange={e => setDispatchSearch(e.target.value)}
                                    />
                                </div>
                            </Card.Header>

                            <Card.Body className="p-0">
                                {filteredDispatch.length === 0 ? <div className="text-center text-muted py-5 border-top bg-light">No dispatch records found matching your search.</div> : (
                                    <div className="table-responsive">
                                        <table className="table table-hover align-middle mb-0">
                                            <thead className="table-light text-muted small text-uppercase">
                                                <tr>
                                                    <th className="ps-4">Date Issued</th>
                                                    <th>Field Officer / Approver</th>
                                                    <th>Ground Staff (Recipient)</th>
                                                    <th>Items Dispatched</th>
                                                    <th>Authorized By (HR)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredDispatch.map(log => {
                                                    const targetStaff = activeStaff.find(s => s.id === log.user_id) || pending.find(s => s.id === log.user_id);
                                                    const staffName = targetStaff ? targetStaff.full_name : `User ID: ${log.user_id}`;
                                                    const requestedBy = targetStaff?.onboarded_by_email ? targetStaff.onboarded_by_email : 'Direct HR / Admin';
                                                    
                                                    return (
                                                        <tr key={`${log.user_id}-${log.issued_at}`}>
                                                            <td className="ps-4 py-3 fw-bold text-dark">{new Date(log.issued_at).toLocaleDateString()}</td>
                                                            <td><Badge bg="info" className="text-dark fw-bold">{requestedBy}</Badge></td>
                                                            <td><div className="fw-bold text-dark">{staffName}</div></td>
                                                            
                                                            <td>
                                                                <div className="fw-bold text-success">
                                                                    {log.combined_items.join(', ')}
                                                                </div>
                                                            </td>
                                                            
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

                <Modal show={issueModal} onHide={() => { setIssueModal(false); setSelectedUserForIssue(null); }} centered backdrop="static" size="lg">
                    <Modal.Header closeButton className="border-0 bg-primary text-white"><Modal.Title className="fw-bold fs-5">Fulfillment Checklist</Modal.Title></Modal.Header>
                    <Modal.Body className="bg-light p-4">
                        {selectedUserForIssue && (
                            <>
                                <div className="text-center mb-4">
                                    <h6 className="fw-bold text-dark mb-0">Target Field Officer</h6>
                                    <div className="text-primary fs-5 fw-bolder">{selectedUserForIssue.full_name}</div>
                                    <Badge bg="secondary" className="mt-1">{selectedUserForIssue.blockchain_id}</Badge>
                                </div>

                                <div className="bg-white rounded-4 shadow-sm border mb-4 overflow-hidden">
                                    <div className="bg-light p-3 border-bottom text-center small fw-bold text-muted text-uppercase tracking-wide">
                                        Requested Uniform Kit
                                    </div>
                                    
                                    {selectedUserForIssue.uniform_details && selectedUserForIssue.uniform_details !== 'Not Specified' ? (
                                        selectedUserForIssue.uniform_details.split(',').map((part, index) => {
                                            const splitPart = part.split(':');
                                            if (splitPart.length !== 2) return null;
                                            const cat = splitPart[0].trim();
                                            const reqSz = splitPart[1].trim();
                                            
                                            const alreadyIssued = issuedLogs.some(log => log.user_id === selectedUserForIssue.id && log.item_category.toLowerCase() === cat.toLowerCase());
                                            const availableStock = inventory.filter(i => i.item_category.toLowerCase() === cat.toLowerCase() && i.quantity > 0);
                                            const exactMatch = availableStock.find(i => i.size.toString().toLowerCase() === reqSz.toLowerCase());
                                            
                                            return (
                                                <div key={index} className="d-flex flex-column flex-md-row align-items-md-center justify-content-between p-3 border-bottom">
                                                    <div className="mb-2 mb-md-0">
                                                        <div className="fw-bold text-dark fs-6">{cat}</div>
                                                        <div className="small text-muted">Requested Size: <strong className="text-dark">{reqSz}</strong></div>
                                                    </div>
                                                    
                                                    {alreadyIssued ? (
                                                        <Badge bg="success" className="px-3 py-2 rounded-pill"><CheckCircle size={14} className="me-1 mb-1"/> Already Issued</Badge>
                                                    ) : (
                                                        <div className="d-flex gap-2 align-items-center">
                                                            <Form.Select 
                                                                size="sm" 
                                                                className="custom-input border-1 py-2 shadow-none" 
                                                                style={{minWidth: '180px'}}
                                                                id={`issue-select-${index}`}
                                                                defaultValue={exactMatch ? exactMatch.id : ""}
                                                            >
                                                                <option value="">Choose Substitute...</option>
                                                                {availableStock.map(inv => (
                                                                    <option key={inv.id} value={inv.id}>Size {inv.size} ({inv.quantity} left)</option>
                                                                ))}
                                                            </Form.Select>
                                                            <Button 
                                                                variant="primary" 
                                                                size="sm" 
                                                                className="rounded-pill fw-bold px-3 py-2 active-scale"
                                                                disabled={isSyncing}
                                                                onClick={async () => {
                                                                    const selId = document.getElementById(`issue-select-${index}`).value;
                                                                    if(!selId) return alert(`Please select an available size to issue for the ${cat}.`);
                                                                    
                                                                    setIsSyncing(true);
                                                                    const res = await fetch(`${API_BASE_URL}/api/hr/issue-uniform`, {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ inventory_id: selId, user_id: selectedUserForIssue.id, hr_email: hrEmail })
                                                                    });
                                                                    
                                                                    if (res.ok) {
                                                                        fetchData(); 
                                                                    } else {
                                                                        alert("Error issuing item. Stock might be empty.");
                                                                        setIsSyncing(false);
                                                                    }
                                                                }}
                                                            >
                                                                {isSyncing ? <Spinner size="sm"/> : "Dispatch"}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center text-muted py-4">No sizes specified in dossier.</div>
                                    )}
                                </div>
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