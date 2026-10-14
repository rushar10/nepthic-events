"use client";
import { useState, type InputHTMLAttributes } from "react";

/* Text field with a floating label and friendly inline validation.
   It checks as you type once you've left the field (or once it has a value), using the
   browser's own rules (required, type, minLength, pattern) plus the messages below. */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> & {
  label: string;
  name: string;
  /** shown under the field until there's something more useful to say */
  hint?: string;
  /** message when `pattern` doesn't match */
  patternMessage?: string;
  /** full width in a .form-grid */
  full?: boolean;
};

function message(el: HTMLInputElement, label: string, patternMessage?: string) {
  const v = el.validity;
  if (v.valid) return "";
  const what = label === label.toUpperCase() ? label : label.toLowerCase();   // "ABN" stays "ABN"
  if (v.valueMissing) return el.type === "password" ? "Enter a password" : `Enter your ${what}`;
  if (v.typeMismatch && el.type === "email") return "That email doesn't look right. Check for a typo.";
  if (v.typeMismatch) return `That ${what} doesn't look right`;
  if (v.tooShort) return `Use at least ${el.minLength} characters (${el.value.length} so far)`;
  if (v.tooLong) return `Keep it to ${el.maxLength} characters`;
  if (v.patternMismatch) return patternMessage ?? `Check your ${what}`;
  if (v.rangeUnderflow) return `The lowest is ${el.min}`;
  if (v.rangeOverflow) return `The highest is ${el.max}`;
  return `Check your ${what}`;
}

export function Field({ label, hint, patternMessage, full, className, onBlur, onInput, ...input }: Props) {
  const [touched, setTouched] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const id = `f-${input.name}`;
  const check = (el: HTMLInputElement, force = false) => {
    if (!force && !touched && !el.value) return;
    const m = message(el, label, patternMessage);
    setMsg(m);
    setOk(!m && !!el.value);
  };
  return (
    <label className={`fl${full ? " full" : ""}${className ? ` ${className}` : ""}`} data-invalid={msg || undefined} data-valid={ok || undefined} htmlFor={id}>
      <input id={id} placeholder=" " aria-invalid={!!msg || undefined} aria-describedby={`${id}-msg`} {...input}
        onBlur={(e) => { setTouched(true); check(e.currentTarget, true); onBlur?.(e); }}
        onInput={(e) => { if (touched || msg) check(e.currentTarget); onInput?.(e); }}
        onInvalid={(e) => {
          // Our inline message replaces the browser's bubble; the first bad field gets focus.
          e.preventDefault();
          const el = e.currentTarget;
          setTouched(true); setMsg(message(el, label, patternMessage));
          if (el.form?.querySelector(":invalid") === el && document.activeElement !== el) el.focus();
        }} />
      <span className="fl-label">{label}{input.required ? "" : <span className="dim"> (optional)</span>}</span>
      <span className="fl-msg" id={`${id}-msg`} aria-live="polite">{msg || hint || ""}</span>
    </label>
  );
}
