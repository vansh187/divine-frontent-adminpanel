import { useEffect, useState } from "react";
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
import {
  ApiError,
  createCustomer,
  listCustomers,
  type ApiCustomer,
  type CustomerStatus,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { validateEmail, validateFullName } from "../../lib/validation";

const PAGE_SIZE = 20;

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
  const { accessToken } = useAuth();

  const [items, setItems] = useState<ApiCustomer[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    listCustomers(accessToken, {
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
      source: source === "ALL" ? undefined : (source as "WEBSITE" | "BROKER_CHANNEL"),
      status: status === "ALL" ? undefined : (status as CustomerStatus),
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotalItems(res.pagination.total_items);
        setTotalPages(Math.max(1, res.pagination.total_pages));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Failed to load customers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, page, search, source, status]);

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setFieldErrors({});
    setAddError(null);
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;

    const errors: FieldErrors = {
      name: validateFullName(name),
      email: validateEmail(email),
      phone: validatePhone(phone),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setAdding(true);
    setAddError(null);
    try {
      await createCustomer(accessToken, {
        full_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      setAddOpen(false);
      resetForm();
      setPage(1);
      setSearch("");
      setSearchInput("");
      setSource("ALL");
      setStatus("ALL");
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setAdding(false);
    }
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
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All sources</option>
          <option value="WEBSITE">Website</option>
          <option value="BROKER_CHANNEL">Channel Partner</option>
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="LEAD">Lead</option>
          <option value="ACTIVE">Active</option>
          <option value="BOOKED">Booked</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      <Table>
        <THead>
          <Th>Customer</Th>
          <Th>Contact</Th>
          <Th>Source</Th>
          <Th>Status</Th>
        </THead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-sm text-text-muted">
                Loading customers...
              </td>
            </tr>
          ) : (
            <>
              {items.map((c) => (
                // no navigate onClick: backend has no GET /admin/customers/{id} yet
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.full_name || "Unnamed lead"} />
                      <div>
                        <p className="font-semibold text-text">{c.full_name || "Unnamed lead"}</p>
                        <p className="text-xs text-text-muted">{c.id}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <p className="text-text">{c.email ?? "—"}</p>
                    <p className="text-xs text-text-muted">{c.phone ?? "—"}</p>
                  </Td>
                  <Td>
                    <StatusBadge status={c.source} label={c.source === "WEBSITE" ? "Website" : "Channel Partner"} />
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                </Tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-text-muted">
                    No customers match your filters.
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </Table>

      <Pagination page={page} pages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onPageChange={setPage} />

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
            <Button onClick={handleAddCustomer} disabled={adding}>
              {adding ? "Adding..." : "Add Customer"}
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={handleAddCustomer} noValidate>
          {addError && (
            <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              {addError}
            </div>
          )}

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
