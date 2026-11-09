"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "./auth";
import { pool } from "./db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) || "").replace(/\r\n/g, "\n").trim();
}

function normalizeHttpsUrl(raw: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The payment link must be a valid https URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("The payment link must start with https://");
  }
  if (url.href.length > 2048) {
    throw new Error("The payment link is too long.");
  }
  return url.href;
}

/** Admin only: set or clear a member's Stripe Payment Link (paste URL, no Stripe API). */
export async function setMemberPaymentLink(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "profile_id");
  if (!UUID.test(id)) redirect("/area/admin/profiles");

  const clear = text(formData, "clear") === "1";
  let link: string | null = null;
  let amount: number | null = null;
  let label: string | null = null;

  if (!clear) {
    try {
      link = normalizeHttpsUrl(text(formData, "payment_link_url"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid payment link.";
      redirect(`/area/admin/profiles?pay_error=${encodeURIComponent(message)}#payment`);
    }
    const amountRaw = text(formData, "payment_amount_eur");
    if (amountRaw) {
      const parsed = Number(amountRaw.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        redirect(`/area/admin/profiles?pay_error=${encodeURIComponent("Amount must be a positive number.")}#payment`);
      }
      amount = Math.round(parsed * 100) / 100;
    } else if (link) {
      amount = 225;
    }
    const labelRaw = text(formData, "payment_label").slice(0, 120);
    label = labelRaw || (link ? "Cuota de miembro" : null);
    if (!link) {
      amount = null;
      label = null;
    }
  }

  await pool.query(
    `UPDATE profiles
     SET payment_link_url = $2,
         payment_amount_eur = $3,
         payment_label = $4,
         updated_at = now()
     WHERE id = $1 AND status = 'active'`,
    [id, link, amount, label],
  );

  revalidatePath("/area");
  revalidatePath("/area/admin/profiles");
  redirect("/area/admin/profiles?pay_ok=1#payment");
}
