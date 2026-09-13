import { useMemo, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchInput } from "../../components/ui/SearchInput";
import { Table, Td, Th, THead, Tr } from "../../components/ui/Table";
import { auditLogs } from "../../lib/mockData";

export function AuditLogsPage() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      auditLogs.filter(
        (a) =>
          a.actor.toLowerCase().includes(search.toLowerCase()) ||
          a.action.toLowerCase().includes(search.toLowerCase()) ||
          a.entityId.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Permitted administrators only — immutable action trail" />

      <div className="mb-4">
        <SearchInput
          placeholder="Search by actor, action or entity ID"
          className="max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Table>
        <THead>
          <Th>Timestamp</Th>
          <Th>Actor</Th>
          <Th>Action</Th>
          <Th>Entity</Th>
          <Th>Prior → New State</Th>
          <Th>Request ID</Th>
        </THead>
        <tbody>
          {filtered.map((a) => (
            <Tr key={a.id}>
              <Td className="text-text-muted">{a.timestamp}</Td>
              <Td className="font-medium">{a.actor}</Td>
              <Td>
                <span className="rounded-full bg-neutral-bg px-2.5 py-1 text-xs font-semibold text-text-muted">
                  {a.action}
                </span>
              </Td>
              <Td>
                {a.entity} · {a.entityId}
              </Td>
              <Td className="text-text-muted">
                {a.priorState ?? "—"} → {a.newState ?? "—"}
              </Td>
              <Td className="font-mono text-xs text-text-soft">{a.requestId}</Td>
            </Tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">
                No audit entries match your search.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
