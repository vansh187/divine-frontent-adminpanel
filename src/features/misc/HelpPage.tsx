import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { TextField } from "../../components/ui/TextField";
import { ApiError, submitSupportTicket } from "../../lib/api";
import { useAuth } from "../../lib/auth";

const MAX_SUBJECT_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 3000;

interface FieldErrors {
  subject?: string | null;
  description?: string | null;
}

export function HelpPage() {
  const { accessToken } = useAuth();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function validate(): FieldErrors {
    return {
      subject: subject.trim() ? null : "Subject is required.",
      description: description.trim() ? null : "Description is required.",
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;

    const errors = validate();
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitSupportTicket(accessToken, { subject: subject.trim(), description: description.trim() });
      setSubject("");
      setDescription("");
      setFieldErrors({});
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't submit your ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function raiseAnother() {
    setSubmitted(false);
    setSubmitError(null);
  }

  return (
    <div>
      <PageHeader title="Help & Support" subtitle="Raise a ticket with the Divine Vision Infra dev team" />

      <Card className="max-w-lg p-6">
        {submitted ? (
          <div className="space-y-4 text-center">
            <p className="text-sm font-semibold text-text">Ticket submitted.</p>
            <p className="text-sm text-text-muted">
              The dev team has been notified by email and will follow up with you.
            </p>
            <Button variant="outline" size="sm" onClick={raiseAnother}>
              Raise another ticket
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            {submitError && (
              <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                {submitError}
              </div>
            )}

            <TextField
              label="Subject"
              placeholder="Short summary of the issue"
              value={subject}
              maxLength={MAX_SUBJECT_LENGTH}
              onChange={(e) => {
                setSubject(e.target.value);
                if (fieldErrors.subject) setFieldErrors((prev) => ({ ...prev, subject: null }));
              }}
              error={fieldErrors.subject}
              disabled={submitting}
              required
            />

            <div>
              <label htmlFor="ticket-description" className="mb-1.5 block text-sm font-medium text-text">
                Description
              </label>
              <textarea
                id="ticket-description"
                rows={6}
                placeholder="What happened, what you expected, and any steps to reproduce"
                value={description}
                maxLength={MAX_DESCRIPTION_LENGTH}
                disabled={submitting}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: null }));
                }}
                aria-invalid={!!fieldErrors.description}
                className={`w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-text-soft focus:outline-none focus:ring-2 ${
                  fieldErrors.description
                    ? "border-danger focus:border-danger focus:ring-danger/20"
                    : "border-border focus:border-gold focus:ring-gold/20"
                }`}
              />
              {fieldErrors.description && (
                <p className="mt-1.5 text-xs text-danger">{fieldErrors.description}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
