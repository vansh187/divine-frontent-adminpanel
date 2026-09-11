import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";

export function HelpPage() {
  return (
    <div>
      <PageHeader title="Help & Support" subtitle="Reach out to the Divine Vision Infra platform team" />
      <Card className="max-w-lg p-6">
        <p className="text-sm text-text-muted">
          For access issues, contract questions or platform bugs, contact the Frontend/UI Lead or
          raise a ticket with the Backend API &amp; Security team. This screen is a placeholder and
          will be wired to the support workflow once available.
        </p>
      </Card>
    </div>
  );
}
