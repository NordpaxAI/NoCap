"use client";

import { useRef, useState } from "react";
import { updateProfile } from "@/lib/actions";

const PREPARE_LIMIT = 40 * 1024 * 1024;

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

async function decodePhoto(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      throw new Error(
        "This photo could not be read. Use a JPEG, PNG or WebP image. Phone photos saved as HEIC need to be exported as JPEG first.",
      );
    }
  }
}

async function resizeProfilePhoto(file: File): Promise<File> {
  const bitmap = await decodePhoto(file);
  try {
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("This photo could not be prepared. Use a JPEG, PNG or WebP image.");
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size === 0) {
      throw new Error("This photo could not be prepared. Use a JPEG, PNG or WebP image.");
    }
    return new File([blob], "profile.jpg", { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export function ProfileForm({
  defaults,
}: {
  defaults: {
    display_name: string;
    public_role: string;
    bio: string;
    city: string;
    jurisdiction: string;
    firm: string;
    practice_area: string;
    contacts: string;
  };
}) {
  const [clientError, setClientError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  function stop() {
    lock.current = false;
    setPending(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || lock.current) return;
    lock.current = true;
    setPending(true);
    setClientError(null);
    const data = new FormData(event.currentTarget);
    const photo = data.get("photo");
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > PREPARE_LIMIT) {
        setClientError("That photo is too large to upload. Choose an image under 40 MB.");
        stop();
        return;
      }
      try {
        data.set("photo", await resizeProfilePhoto(photo));
      } catch (error) {
        setClientError(
          error instanceof Error
            ? error.message
            : "This photo could not be read. Use a JPEG, PNG or WebP image.",
        );
        stop();
        return;
      }
    }
    try {
      await updateProfile(data);
    } catch (error) {
      if (isNextRedirect(error)) throw error;
      setClientError("The photo could not be saved. Use a smaller JPEG, PNG or WebP image.");
      stop();
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      {clientError ? <p className="error">{clientError}</p> : null}
      <div>
        <label className="lbl" htmlFor="display_name">Name</label>
        <input id="display_name" name="display_name" defaultValue={defaults.display_name} required />
      </div>
      <div>
        <label className="lbl" htmlFor="bio">Bio</label>
        <textarea id="bio" name="bio" defaultValue={defaults.bio} rows={6} />
      </div>
      <div>
        <label className="lbl" htmlFor="city">City</label>
        <input id="city" name="city" defaultValue={defaults.city} />
      </div>
      <div>
        <label className="lbl" htmlFor="jurisdiction">Country</label>
        <input id="jurisdiction" name="jurisdiction" defaultValue={defaults.jurisdiction} />
      </div>
      <div>
        <label className="lbl" htmlFor="photo">Photo</label>
        <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" />
      </div>
      <button className="btn solid" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? (
          <>
            <span className="spinner on-dark" aria-hidden="true" />
            Loading...
          </>
        ) : (
          "Save"
        )}
      </button>
    </form>
  );
}
