import { useRef, useState } from "react";
import { IconCamera } from "../../components/layout/icons";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ImageCropModal } from "../../components/ui/ImageCropModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const LOCKED_FIELD_CLASS = "bg-surface-muted text-text-muted";

const PHOTO_ERROR_MESSAGES: Record<string, string> = {
  unsupported_file_type: "Please upload a JPG or PNG image.",
  file_too_large: "Image must be smaller than 5 MB.",
  empty_file: "That file appears to be empty. Please choose another photo.",
  storage_not_configured: "Photo storage isn't set up yet. Please try again later.",
  storage_unreachable: "Couldn't reach photo storage. Please try again.",
};

function photoErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return (err.code && PHOTO_ERROR_MESSAGES[err.code]) || err.message || "Couldn't save your photo. Please try again.";
  }
  return "Couldn't save your photo. Please try again.";
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

export function AdminProfilePage() {
  const { admin, profileLoading, profileError, refreshProfile, uploadAvatar } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pickedImage, setPickedImage] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setPhotoError("Please choose a JPG or PNG image.");
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

  async function handleCropSave(dataUrl: string) {
    setCropOpen(false);
    setPickedImage(null);
    setPhotoError(null);
    setUploading(true);
    try {
      await uploadAvatar(dataUrlToFile(dataUrl, "profile.png"));
    } catch (err) {
      setPhotoError(photoErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle="View your admin account details" />

      {profileLoading && !admin && (
        <Card className="p-10 text-center text-sm text-text-muted">Loading your profile...</Card>
      )}

      {!profileLoading && profileError && !admin && (
        <Card className="p-10 text-center text-sm text-text-muted">
          <p className="mb-4">{profileError}</p>
          <Button variant="outline" size="sm" onClick={refreshProfile}>
            Try again
          </Button>
        </Card>
      )}

      {admin && (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Card className="flex flex-col items-center gap-4 p-6 text-center">
            {admin.avatarUrl ? (
              <img
                src={admin.avatarUrl}
                alt={admin.fullName}
                className="h-32 w-32 rounded-full border-4 border-surface object-cover shadow-md"
              />
            ) : (
              <Avatar name={admin.fullName || admin.email} className="h-32 w-32 text-3xl" />
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={handleFilePick}
            />

            <div>
              <p className="text-base font-semibold text-text">{admin.fullName}</p>
              <p className="text-sm text-text-muted">{admin.email}</p>
            </div>

            {uploading && <p className="text-xs text-text-muted">Uploading photo...</p>}
            {photoError && <p className="text-xs text-danger">{photoError}</p>}

            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <IconCamera className="h-4 w-4" />
              {admin.avatarUrl ? "Change Photo" : "Upload Photo"}
            </Button>
            <p className="text-xs text-text-soft">JPG or PNG, up to 5 MB. You can crop before saving.</p>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
              Account Details
            </h2>

            {profileError && (
              <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
                {profileError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Full name"
                value={admin.fullName}
                disabled
                className={LOCKED_FIELD_CLASS}
              />
              <TextField
                label="Employee ID"
                value={admin.employeeId || "Not assigned"}
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
            </div>
          </Card>
        </div>
      )}

      <ImageCropModal
        open={cropOpen}
        imageSrc={pickedImage}
        onCancel={() => {
          setCropOpen(false);
          setPickedImage(null);
        }}
        onSave={handleCropSave}
      />
    </div>
  );
}
