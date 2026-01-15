import React, { useEffect, useState } from 'react';
import { Table, Badge, Form, Container, Dropdown, ButtonGroup, InputGroup, Spinner, Alert } from 'react-bootstrap';
import { Search, UserCog, ShieldAlert } from 'lucide-react';

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); 
  const adminEmail = localStorage.getItem('userEmail');

  const fetchEmployees = () => {
    setLoading(true);
    fetch(`/api/admin/employees?admin_email=${adminEmail}`)
      .then(res => {
        if (!res.ok) throw new Error("Forbidden");
        return res.json();
      })
      .then(data => {
        setEmployees(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEmployees();
  }, [adminEmail]);

  const handleRoleChange = async (email, newRole) => {
    const res = await fetch(`/api/admin/update-role?target_email=${email}&new_type=${newRole}&admin_email=${adminEmail}`, {
      method: 'POST'
    });
    if (res.ok) fetchEmployees(); 
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = 
      emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || emp.user_type.toLowerCase() === filter;
    return matchesSearch && matchesFilter;
  });

  if (error) {
    return (
      <Container className="py-5">
        <Alert variant="danger" className="d-flex align-items-center">
          <ShieldAlert className="me-2" />
          Access Denied: Your account does not have Admin permissions in our records.
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="py-5">
      <div className="d-md-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><UserCog className="me-2 text-danger" />Admin Console</h2>
        
        <div className="d-flex gap-2 mt-3 mt-md-0">
          <InputGroup style={{ maxWidth: '300px' }}>
            <InputGroup.Text className="bg-white border-end-0"><Search size={16}/></InputGroup.Text>
            <Form.Control 
              placeholder="Search personnel..." 
              className="border-start-0 ps-0"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </InputGroup>

          <Dropdown as={ButtonGroup} onSelect={(e) => setFilter(e)}>
            <Dropdown.Toggle variant="dark" id="dropdown-filter">
              Role: {filter.toUpperCase()}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item eventKey="all">All</Dropdown.Item>
              <Dropdown.Item eventKey="admin">Admin</Dropdown.Item>
              <Dropdown.Item eventKey="guard">Guard</Dropdown.Item>
              <Dropdown.Item eventKey="official staff">Official Staff</Dropdown.Item>
              <Dropdown.Item eventKey="employee">Employee</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>
      ) : (
        <Table responsive hover className="shadow-sm border rounded overflow-hidden">
          <thead className="bg-dark text-white">
            <tr>
              <th>Full Name</th>
              <th>Email Address</th>
              <th>Current Role</th>
              <th>Modify Access</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(emp => (
              <tr key={emp.email} className="align-middle">
                <td className="fw-semibold">{emp.full_name}</td>
                <td className="text-muted small">{emp.email}</td>
                <td>
                  <Badge bg={
                    emp.user_type.toLowerCase() === 'admin' ? 'danger' : 
                    emp.user_type.toLowerCase() === 'guard' ? 'warning' : 'info'
                  }>
                    {emp.user_type.toUpperCase()}
                  </Badge>
                </td>
                <td>
                  <Form.Select 
                    size="sm" 
                    className="w-auto"
                    onChange={(e) => handleRoleChange(emp.email, e.target.value)}
                    value={emp.user_type.toLowerCase()}
                  >
                    <option value="employee">Employee</option>
                    <option value="official staff">Official Staff</option>
                    <option value="guard">Guard</option>
                    <option value="admin">Admin</option>
                  </Form.Select>
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