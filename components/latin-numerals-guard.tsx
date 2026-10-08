"use client";

import { useEffect } from "react";
import { toLatinDigits } from "@/lib/utils";

const NUMERIC_FIELDS = [
  'input[type="number"]',
  'input[type="date"]',
  'input[type="month"]',
  'input[type="time"]',
  'input[type="datetime-local"]',
  'input[type="tel"]',
  'input[inputmode="numeric"]',
  'input[inputmode="decimal"]',
].join(",");

function prepare(root: ParentNode | Element) {
  const fields: Element[] = [];
  if (root instanceof Element && root.matches(NUMERIC_FIELDS)) fields.push(root);
  fields.push(...root.querySelectorAll(NUMERIC_FIELDS));
  for (const field of fields) {
    field.setAttribute("lang", "en-GB");
    field.setAttribute("dir", "ltr");
  }
}

/**
 * سياسة أرقام واحدة للمنصة: الحقول الرقمية والتواريخ إنجليزية دائماً،
 * وحتى إن كانت لوحة المفاتيح عربية تتحول المدخلات إلى 0123 قبل وصولها
 * إلى حالة React. MutationObserver يشمل أي نافذة أو ميزة تضاف لاحقاً.
 */
export function LatinNumeralsGuard() {
  useEffect(() => {
    prepare(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) prepare(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const normalize = (event: Event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement) || !field.matches(NUMERIC_FIELDS)) return;
      const latin = toLatinDigits(field.value).replace(
        field.type === "number" || field.inputMode === "decimal" ? /[٫،,]/g : /$^/g,
        ".",
      );
      if (latin !== field.value) field.value = latin;
    };
    const beforeInput = (event: InputEvent) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement) || !field.matches(NUMERIC_FIELDS) || !event.data) return;
      const latin = toLatinDigits(event.data).replace(/[٫،,]/g, ".");
      if (latin === event.data) return;
      event.preventDefault();
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? field.value.length;
      const next = field.value.slice(0, start) + latin + field.value.slice(end);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(field, next);
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: latin }));
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element) prepare(event.target);
    };

    document.addEventListener("beforeinput", beforeInput, true);
    document.addEventListener("input", normalize, true);
    document.addEventListener("focusin", focus, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("beforeinput", beforeInput, true);
      document.removeEventListener("input", normalize, true);
      document.removeEventListener("focusin", focus, true);
    };
  }, []);

  return null;
}
