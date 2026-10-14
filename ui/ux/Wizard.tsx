"use client";
import { Children, useRef, useState, type ReactNode } from "react";
import { haptic } from "./haptics";

/* Splits a long form into steps with a progress bar. Every step stays in the form (so
   everything typed is submitted, and nothing is lost going back); only the current one is
   shown. "Continue" checks the current step's fields first. The last step holds the
   real submit button, passed as `submit`. On phones the buttons sit in a sticky bar. */
export function Wizard({ steps, children, submit }: { steps: string[]; children: ReactNode; submit: ReactNode }) {
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const panes = Children.toArray(children);
  const go = (n: number) => {
    setI(n);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-step="${n}"] input, [data-step="${n}"] select, [data-step="${n}"] textarea`)?.focus({ preventScroll: true }));
    box.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const next = () => {
    const pane = box.current?.querySelector(`[data-step="${i}"]`);
    // checkValidity() on every field shows each one's inline message at once; focus the first.
    const bad = [...(pane?.querySelectorAll<HTMLInputElement>("input, select, textarea") ?? [])].filter((el) => !el.checkValidity());
    if (bad.length) { bad[0].focus(); haptic("error"); return; }
    haptic("tap");
    go(i + 1);
  };
  return (
    <div ref={box} className="stack-sm wizard">
      <div className="stack-sm" style={{ gap: 6 }}>
        <span className="steps-label">Step {i + 1} of {steps.length} · {steps[i]}</span>
        <div className="steps" aria-hidden="true">{steps.map((s, n) => <span key={s} className={n <= i ? "on" : ""} />)}</div>
      </div>
      {panes.map((p, n) => <div key={n} data-step={n} hidden={n !== i} className="stack-sm wiz-pane">{p}</div>)}
      <div className="pinbar">
        {i > 0 ? <button type="button" className="btn btn-ghost" onClick={() => go(i - 1)}>Back</button> : <span />}
        {i < steps.length - 1 ? <button type="button" className="btn btn-primary prox" onClick={next}>Continue</button> : submit}
      </div>
    </div>
  );
}
