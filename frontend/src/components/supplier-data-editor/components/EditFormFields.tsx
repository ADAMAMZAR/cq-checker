"use client";

import { useId } from "react";
import type { EditFormFieldsProps, FieldProps } from "../types";

function Field({ label, value, onChange, placeholder, required }: FieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-[10px] font-semibold text-[var(--text-secondary)] block mb-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all duration-300 font-sans"
      />
    </div>
  );
}

export default function EditFormFields({ fields, onChange }: EditFormFieldsProps) {
  const set = (key: string, value: string) => onChange({ ...fields, [key]: value });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field
        label="Supplier name"
        value={fields.certificateOwnerName || ""}
        onChange={(v) => set("certificateOwnerName", v)}
        required
      />
      <Field
        label="Issuer name"
        value={fields.issuerName || ""}
        onChange={(v) => set("issuerName", v)}
        required
      />
      <Field
        label="Certificate type"
        value={fields.certificateType || ""}
        onChange={(v) => set("certificateType", v)}
        required
      />
      <Field
        label="Certificate number"
        value={fields.certificateNumber || ""}
        onChange={(v) => set("certificateNumber", v)}
        required
      />
      <Field
        label="Year of publication"
        value={fields.yearOfPublication || ""}
        onChange={(v) => set("yearOfPublication", v)}
        placeholder="YYYY"
      />
      <div className="md:col-span-2">
        <Field
          label="Certificate location"
          value={fields.certificateLocation || ""}
          onChange={(v) => set("certificateLocation", v)}
          placeholder="State, Country"
          required
        />
      </div>
      <Field
        label="Effective date (DD/MM/YYYY)"
        value={fields.effectiveDate || ""}
        onChange={(v) => set("effectiveDate", v)}
        placeholder="DD/MM/YYYY"
        required
      />
      <Field
        label="Expiration date (DD/MM/YYYY)"
        value={fields.expirationDate || ""}
        onChange={(v) => set("expirationDate", v)}
        placeholder="DD/MM/YYYY"
        required
      />
    </div>
  );
}
