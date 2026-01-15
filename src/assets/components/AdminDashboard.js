import React, { useEffect, useState } from 'react';
import { Table, Badge, Form, Container, Spinner } from 'react-bootstrap';
import { UserCog, Lock } from 'lucide-react';

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const adminEmail = localStorage.getItem('userEmail');

  const fetchEmployees = () => {
    setLoading(true);
    fetch(`/api/admin/employees?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(data => {
        setEmployees(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchEmployees();
  }, [adminEmail]);

  // This function updates the database immediately when a new role is selected
  const handleRoleChange = async (email, newRole) => {
    const res = await fetch(`/api/admin/update-role?target_email=${email}&new_type=${newRole}&admin_email=${adminEmail}`, {
      method: 'POST'
    });
    
    if (res.ok) {
      // Re-fetch only after the database update is confirmed successful
      fetchEmployees(); 
    } else {
      alert("Failed to update role in database.");
    }
  };

  return (
    <Container className="py-5">
      <h2 className="fw-bold mb-4"><UserCog className="me-2 text-danger" />Admin Console</h2>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>
      ) : (
        <Table responsive hover className="shadow-sm border rounded">
          <thead className="bg-light">
            <tr>
              <th>Full Name</th>
              <th>Email Address</th>
              <th>Current Role</th>
              <th>Change Role</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.email} className="align-middle">
                <td>{emp.full_name}</td>
                <td>{emp.email}</td>
                <td>
                  <Badge bg={emp.user_type.toLowerCase() === 'admin' ? 'danger' : 'info'}>
                    {emp.user_type.toUpperCase()}
                  </Badge>
                </td>
                <td>
                  {emp.user_type.toLowerCase() === 'admin' ? (
                    <span className="text-muted small"><Lock size={12} /> System Admin</span>
                  ) : (
                    <Form.Select 
                      size="sm" 
                      onChange={(e) => handleRoleChange(emp.email, e.target.value)}
                      value={emp.user_type.toLowerCase()}
                    >
                      {/* Only specific roles are available; 'Admin' is excluded to prevent unauthorized promotion */}
                      <option value="employee">Employee</option>
                      <option value="official staff">Official Staff</option>
                      <option value="guard">Guard</option>
                    </Form.Select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Container>
  );
};

export default AdminDashboard;