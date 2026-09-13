import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { SearchInput } from "../../components/ui/SearchInput";
import { Select } from "../../components/ui/Select";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { TextField } from "../../components/ui/TextField";
import { customers as seedCustomers } from "../../lib/mockData";
import type { Customer } from "../../lib/types";
import { validateEmail, validateFullName } from "../../lib/validation";

const PAGE_SIZE = 6;

interface FieldErrors {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

function validatePhone(value: string): string | null {
  if (!value.trim()) return "Phone number is required.";
  return null;
}

export function CustomersListPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>(seedCustomers);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("ALL");
  const [page, setPage] = useState(1);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search);
      const matchesSource = source === "ALL" || c.source === source;
      return matchesSearch && matchesSource;
    });
  }, [customers, search, source]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setFieldErrors({});
  }

  function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();

    const errors: FieldErrors = {
      name: validateFullName(name),
      email: validateEmail(email),
      phone: validatePhone(phone),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    const today = new Date().toISOString().slice(0, 10);
    const newCustomer: Customer = {
      id: `CUS-${Date.now().toString().slice(-6)}`,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      source: "CUSTOMER",
      status: "LEAD",
      project: "—",
      createdAt: today,
      lastActivity: today,
      siteVisits: 0,
    };

    setCustomers((prev) => [newCustomer, ...prev]);
    setAddOpen(false);
    resetForm();
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Customers &amp; Leads"
        subtitle="All customer and channel partner-sourced leads"
        actions={<Button onClick={() => setAddOpen(true)}>Add Customer</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by name, email or phone"
          className="flex-1 min-w-[220px]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All sources</option>
          <option value="CUSTOMER">Website</option>
          <option value="BROKER_CHANNEL">Channel Partner</option>
        </Select>
      </div>

      <Table>
        <THead>
          <Th>Customer</Th>
          <Th>Contact</Th>
          <Th>Source</Th>
          <Th>Status</Th>
        </THead>
        <tbody>
          {pageItems.map((c) => (
            <Tr key={c.id} onClick={() => navigate(`/admin/customers/${c.id}`)}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} />
                  <div>
                    <p className="font-semibold text-text">{c.name}</p>
                    <p className="text-xs text-text-muted">{c.id}</p>
                  </div>
                </div>
              </Td>
              <Td>
                <p className="text-text">{c.email}</p>
                <p className="text-xs text-text-muted">{c.phone}</p>
              </Td>
              <Td>
                <StatusBadge status={c.source} label={c.source === "CUSTOMER" ? "Website" : "Channel Partner"} />
              </Td>
              <Td>
                <StatusBadge status={c.status} />
              </Td>
            </Tr>
          ))}
          {pageItems.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-sm text-text-muted">
                No customers match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetForm();
        }}
        title="Add Customer"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddCustomer}>Add Customer</Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={handleAddCustomer} noValidate>
          <TextField
            label="Full name"
            placeholder="Arjun Mehta"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: null }));
            }}
            error={fieldErrors.name}
            required
          />
          <TextField
            label="Email"
            type="email"
            placeholder="customer@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
            }}
            error={fieldErrors.email}
            required
          />
          <TextField
            label="Phone"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: null }));
            }}
            error={fieldErrors.phone}
            required
          />
          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-muted p-3 text-xs text-text-muted">
            <span>
              Source: <span className="font-semibold text-text">Website</span>
            </span>
            <span>
              Status: <span className="font-semibold text-text">Lead</span>
            </span>
          </div>
        </form>
      </Modal>
    </div>
  );
}
