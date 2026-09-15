import { useRef, useState, type FormEvent } from "react";
import { IconCamera, IconTrash } from "../../components/layout/icons";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ImageCropModal } from "../../components/ui/ImageCropModal";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { TextField } from "../../components/ui/TextField";
import { useAuth } from "../../lib/auth";
import { validateFullName } from "../../lib/validation";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const LOCKED_FIELD_CLASS = "bg-surface-muted text-text-muted";

interface FieldErrors {
  fullName?: string | null;
}

export function AdminProfilePage() {
  const { admin, updateProfile, updateAvatar, removeAvatar } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(admin?.fullName ?? "");
  const [phone, setPhone] = useState(admin?.phone ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [pickedImage, setPickedImage] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  if (!admin) return null;

  const displayName = admin.fullName || admin.email;

  function startEdit() {
    if (!admin) return;
    setFullName(admin.fullName ?? "");
    setPhone(admin.phone ?? "");
    setFieldErrors({});
    setDetailsError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    if (!admin) return;
    setFullName(admin.fullName ?? "");
    setPhone(admin.phone ?? "");
    setFieldErrors({});
    setDetailsError(null);
    setIsEditing(false);
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setPhotoError("Image must be smaller than 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPickedImage(reader.result as string);
      setCropOpen(true);
    };
    reader.onerror = () => {
      setPhotoError("Couldn't read that file. Please try again.");
    };
    reader.readAsDataURL(file);
  }

  function handleCropSave(dataUrl: string) {
    setCropOpen(false);
    setPickedImage(null);
    try {
      updateAvatar(dataUrl);
      setPhotoError(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't save your photo. Please try again.");
    }
  }

  function handleRemovePhoto() {
    setRemoveOpen(false);
    try {
      removeAvatar();
      setPhotoError(null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't remove your photo. Please try again.");
    }
  }

  function handleSaveDetails(e: FormEvent) {
    e.preventDefault();
    const errors: FieldErrors = { fullName: validateFullName(fullName) };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    try {
      updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
      });
      setDetailsError(null);
      setIsEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Couldn't save your changes. Please try again.");
    }
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle="View and update your admin account details" />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="relative">
            {admin.avatarUrl ? (
              <img
                src={admin.avatarUrl}
                alt={displayName}
                className="h-32 w-32 rounded-full border-4 border-surface object-cover shadow-md"
              />
            ) : (
              <Avatar name={displayName} className="h-32 w-32 text-3xl" />
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-gold text-white shadow-md hover:bg-gold-dark"
              aria-label="Upload photo"
            >
              <IconCamera className="h-4 w-4" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFilePick}
          />

          <div>
            <p className="text-base font-semibold text-text">{displayName}</p>
            <p className="text-sm text-text-muted">{admin.email}</p>
          </div>

          {photoError && <p className="text-xs text-danger">{photoError}</p>}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <IconCamera className="h-4 w-4" />
              {admin.avatarUrl ? "Change Photo" : "Upload Photo"}
            </Button>
            {admin.avatarUrl && (
              <Button variant="danger" size="sm" onClick={() => setRemoveOpen(true)}>
                <IconTrash className="h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-text-soft">JPG or PNG, up to 5 MB. You can crop before saving.</p>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Account Details
            </h2>
            {!isEditing && (
              <Button type="button" variant="outline" size="sm" onClick={startEdit}>
                Edit
              </Button>
            )}
          </div>

          <form className="space-y-4" onSubmit={handleSaveDetails} noValidate>
            {saved && (
              <div className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-sm text-gold-dark">
                Profile updated.
              </div>
            )}
            {detailsError && (
              <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                {detailsError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Full name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: null }));
                }}
                error={fieldErrors.fullName}
                disabled={!isEditing}
                className={!isEditing ? LOCKED_FIELD_CLASS : undefined}
                required
              />
              <TextField
                label="Employee ID"
                value={admin.employeeId ?? "Not assigned"}
                disabled
                className={LOCKED_FIELD_CLASS}
                hint="Employee ID is set by the system and cannot be changed."
              />
              <TextField
                label="Email"
                value={admin.email}
                disabled
                className={LOCKED_FIELD_CLASS}
                hint="Email is tied to your account and cannot be changed here."
              />
              <TextField
                label="Phone"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!isEditing}
                className={!isEditing ? LOCKED_FIELD_CLASS : undefined}
              />
            </div>

            {isEditing && (
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </div>
            )}
          </form>
        </Card>
      </div>

      <ImageCropModal
        open={cropOpen}
        imageSrc={pickedImage}
        onCancel={() => {
          setCropOpen(false);
          setPickedImage(null);
        }}
        onSave={handleCropSave}
      />

      <Modal
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title="Remove profile photo?"
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRemovePhoto}>
              Remove Photo
            </Button>
          </>
        }
      >
        This will remove your profile photo and fall back to your initials.
      </Modal>
    </div>
  );
}
