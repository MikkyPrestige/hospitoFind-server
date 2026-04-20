import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

export const sanitizeInput = (data) => {
  if (typeof data === "string") {
    return DOMPurify.sanitize(data).trim();
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeInput(item));
  }
  if (typeof data === "object" && data !== null) {
    const sanitizedObject = {};
    for (const key in data) {
      sanitizedObject[key] = sanitizeInput(data[key]);
    }
    return sanitizedObject;
  }
  return data;
};


export function sanitize(value) {
  if (!value) return "";

  return (
    value
      .toString()
      .trim()
      .toLowerCase()
      // replace accented characters
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // replace non-alphanumeric with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // remove multiple hyphens
      .replace(/-+/g, "-")
      // trim hyphens from start/end
      .replace(/^-|-$/g, "")
  );
}
