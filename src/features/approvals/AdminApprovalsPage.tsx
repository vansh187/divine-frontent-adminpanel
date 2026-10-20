import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { ApiError, decideAdminApproval, listAdminApprovals, type AdminApprovalStatus, type ApiAdminApproval } from "../../lib/api";
import { useAuth } from "../../lib/auth";

const TABS: { id: AdminApprovalStatus; label: string }[] = [
  { id: "pending", label: "Pending" }, { id: "approved", label: "Approved" }, { id: "rejected", label: "Rejected" },
];

function approvalErrorMessage(err: unknown, action: "load" | "decide"): string {
  if (!(err instanceof ApiError)) return "A network error occurred. Check your connection and try again.";
  switch (err.code) {
    case "super_admin_required": return "Your account no longer has super admin access.";
    case "missing_token": return "Your session is missing. Sign in again.";
    case "token_expired": return "Your session expired. Sign in again.";
    case "invalid_token": return "Your session is invalid. Sign in again.";
    case "not_found": return action === "load" ? "The requested approval list was not found." : "This admin request no longer exists. The list has been refreshed.";
    case "already_decided": return "Another super admin already decided this request. The list has been refreshed.";
    case "email_not_verified": return "This admin has not verified their email. The list has been refreshed.";
    case "rate_limited":
    case "too_many_requests": return "Too many requests. Please wait a moment and try again.";
    case "internal_error": return "Something went wrong on the server. Please try again.";
  }
  if (err.status === 422) return "The note must be 500 characters or fewer.";
  return action === "load" ? "Could not load admin requests. Please try again." : "Could not save this decision. Please try again.";
}

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function AdminApprovalsPage() {
  const { accessToken, admin, profileLoading } = useAuth();
  const [tab, setTab] = useState<AdminApprovalStatus>("pending");
  const [items, setItems] = useState<ApiAdminApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<{ item: ApiAdminApproval; action: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const sequence = ++requestSequence.current;
    setLoading(true); setError(""); setItems([]);
    try {
      const result = await listAdminApprovals(accessToken, tab);
      if (sequence === requestSequence.current) setItems(result.items);
    }
    catch (err) {
      if (sequence !== requestSequence.current) return;
      if (err instanceof ApiError && err.status === 403 && err.code === "super_admin_required") { setAccessDenied(true); return; }
      setError(approvalErrorMessage(err, "load"));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [accessToken, tab]);

  useEffect(() => { void load(); }, [load]);

  if (profileLoading) return <div className="py-12 text-center text-sm text-text-muted">Loading your profile…</div>;
  if (accessDenied || !admin?.isSuperAdmin) return <Navigate to="/admin" replace />;

  async function submitDecision() {
    if (!accessToken || !decision) return;
    setSaving(true); setNotice("");
    try {
      await decideAdminApproval(accessToken, decision.item.id, decision.action, note.trim() || undefined);
      setDecision(null); setNote(""); setNoticeIsError(false); setNotice(`Request ${decision.action === "approve" ? "approved" : "rejected"}.`);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.code === "super_admin_required") {
        setAccessDenied(true);
      } else {
        const message = approvalErrorMessage(err, "decide");
        setNoticeIsError(true);
        setNotice(message);
        if (err instanceof ApiError && (err.code === "already_decided" || err.code === "not_found" || err.code === "email_not_verified")) {
          await load();
        }
      }
    } finally { setSaving(false); }
  }

  return <>
    <PageHeader title="Admin Approvals" subtitle="Review verified admin access requests." actions={<Button variant="outline" onClick={() => void load()}>Refresh</Button>} />
    <div className="mb-5 flex gap-2 border-b border-border" role="tablist" aria-label="Approval status">
      {TABS.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === item.id ? "border-gold text-gold-dark" : "border-transparent text-text-muted hover:text-text"}`}>{item.label}</button>)}
    </div>
    {notice && <div role={noticeIsError ? "alert" : "status"} className={`mb-4 rounded-xl border p-3 text-sm ${noticeIsError ? "border-danger/30 bg-danger-bg text-danger" : "border-info/30 bg-info-bg text-info"}`}>{notice}</div>}
    {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{error}</div>}
    <Table>
      <THead><Th>Admin</Th><Th>Email</Th><Th>Employee ID</Th><Th>Requested</Th>{tab !== "pending" && <><Th>Decision by</Th><Th>Decided</Th><Th>Note</Th></>}{tab === "pending" && <Th>Actions</Th>}</THead>
      <tbody>
        {loading ? <Tr><Td colSpan={tab === "pending" ? 5 : 7} className="py-10 text-center text-text-muted">Loading requests…</Td></Tr> : items.length === 0 ? <Tr><Td colSpan={tab === "pending" ? 5 : 7} className="py-10 text-center text-text-muted">No {tab} admin requests.</Td></Tr> : items.map((item) => <Tr key={item.id}>
          <Td className="font-semibold">{item.full_name}</Td><Td>{item.email}</Td><Td>{item.employee_id}</Td><Td>{date(item.created_date)}</Td>
          {tab !== "pending" && <><Td>{item.approval_decided_by ?? "—"}</Td><Td>{date(item.approval_decided_date)}</Td><Td>{item.approval_note || "—"}</Td></>}
          {tab === "pending" && <Td><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => { setDecision({ item, action: "approve" }); setNote(""); }}>Approve</Button><Button size="sm" variant="danger" onClick={() => { setDecision({ item, action: "reject" }); setNote(""); }}>Reject</Button></div></Td>}
        </Tr>)}
      </tbody>
    </Table>
    <Modal open={!!decision} onClose={() => !saving && setDecision(null)} title={decision?.action === "approve" ? "Approve admin request" : "Reject admin request"} footer={<><Button variant="outline" disabled={saving} onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision?.action === "reject" ? "danger" : "primary"} disabled={saving || note.length > 500} onClick={() => void submitDecision()}>{saving ? "Saving…" : decision?.action === "approve" ? "Confirm approval" : "Confirm rejection"}</Button></>}>
      <p>Confirm {decision?.action} for <strong className="text-text">{decision?.item.full_name}</strong> ({decision?.item.email})?</p>
      <label className="mt-4 block text-sm font-medium text-text">Note {decision?.action === "reject" ? "(recommended)" : "(optional)"}<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-text outline-none focus:border-gold" placeholder={decision?.action === "reject" ? "Reason for rejection" : "Welcome to the team"} /></label>
      <p className="mt-1 text-right text-xs text-text-muted">{note.length}/500</p>
    </Modal>
  </>;
}
