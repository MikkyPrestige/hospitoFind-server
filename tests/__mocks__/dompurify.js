// Stub createDOMPurify – returns a DOMPurify-like object
export default function createDOMPurify(window) {
  return {
    sanitize: (input) => input,
  };
}
