/**
 * Normalize API errors into a consistent shape.
 * @param {Error} error - Axios error or generic Error
 * @returns {{ message: string, fieldErrors: Record<string, string[]> }}
 */
export function normalizeError(error) {
  const result = { message: '', fieldErrors: {} };

  if (!error?.response) {
    result.message = error?.message || 'Network error. Please check your connection.';
    return result;
  }

  const { status, data } = error.response;

  // Field-level validation errors (DRF format: { fieldName: ["error1", ...] })
  if (status === 400 && data && typeof data === 'object') {
    const nonFieldErrors = [];
    for (const [key, val] of Object.entries(data)) {
      if (key === 'detail' || key === 'error' || key === 'message') {
        nonFieldErrors.push(String(val));
      } else if (key === 'non_field_errors' || key === 'nonFieldErrors') {
        const arr = Array.isArray(val) ? val : [val];
        nonFieldErrors.push(...arr.map(String));
      } else {
        result.fieldErrors[key] = Array.isArray(val) ? val.map(String) : [String(val)];
      }
    }
    result.message = nonFieldErrors.join(' ') || 'Please correct the errors below.';
    return result;
  }

  // Single detail message
  result.message =
    data?.detail ||
    data?.error ||
    data?.message ||
    (status === 401 ? 'Session expired. Please log in again.' :
     status === 403 ? 'You do not have permission for this action.' :
     status === 404 ? 'The requested resource was not found.' :
     status === 409 ? 'Conflict — this action cannot be completed.' :
     `Server error (${status}). Please try again.`);

  return result;
}
