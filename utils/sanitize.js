export function sanitize(value) {
  if (!value) return "";

  return (
    value
      .toString()
      .trim()
      .toLowerCase()
      // replace accented characters
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      // replace non-alphanumeric with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // remove multiple hyphens
      .replace(/-+/g, "-")
      // trim hyphens from start/end
      .replace(/^-|-$/g, "")
  );
}
